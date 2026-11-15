begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.members (
  id uuid primary key references auth.users(id),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 30),
  role text not null unique check (role in ('admin', 'writer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (role <> 'admin' or active)
);

create function private.is_member() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.members where id = (select auth.uid()) and active) $$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.members where id = (select auth.uid()) and active and role = 'admin') $$;

create function private.manages(owner_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select private.is_admin() or (private.is_member() and owner_id = (select auth.uid())) $$;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 28),
  archived boolean not null default false
);
insert into public.categories (id, name) values
  ('01000000-0000-4000-8000-000000000001', '日常'),
  ('01000000-0000-4000-8000-000000000002', '约会'),
  ('01000000-0000-4000-8000-000000000003', '旅行'),
  ('01000000-0000-4000-8000-000000000004', '纪念日');

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.members(id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  event_date date not null check (event_date between date '0001-01-01' and date '9999-12-31'),
  category_id uuid not null references public.categories(id),
  summary text not null default '' check (char_length(summary) <= 360),
  body text not null default '' check (char_length(body) <= 60000),
  location text not null default '' check (char_length(location) <= 100),
  weather text not null default '' check (char_length(weather) <= 40),
  search_text text generated always as (title || ' ' || summary || ' ' || body) stored,
  status text not null default 'draft' check (status in ('draft', 'published')),
  is_pinned boolean not null default false,
  cover_media_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  deleted_at timestamptz,
  revision integer not null default 1,
  check (status = 'draft' or btrim(body, E' \r\n\t') <> '')
);
create index stories_timeline on public.stories (event_date desc, created_at desc, id)
where status = 'published' and deleted_at is null;
create index stories_category_timeline on public.stories (category_id, event_date desc)
where status = 'published' and deleted_at is null;
create index stories_recent on public.stories (published_at desc)
where status = 'published' and deleted_at is null;

create table public.diaries (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.members(id),
  event_date date not null check (event_date between date '0001-01-01' and date '9999-12-31'),
  body text not null default '' check (char_length(body) <= 12000),
  mood text not null default '' check (char_length(mood) <= 30),
  show_on_home boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  deleted_at timestamptz,
  revision integer not null default 1,
  check (status = 'draft' or btrim(body, E' \r\n\t') <> '')
);
create index diaries_recent on public.diaries (event_date desc, id)
where status = 'published' and deleted_at is null;

create function private.can_manage_story(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.stories where id = target and private.manages(author_id)) $$;

create function private.can_read_story(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.stories where id = target and
    (private.manages(author_id) or (private.is_member() and status = 'published' and deleted_at is null))
  )
$$;

create function private.can_manage_diary(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.diaries where id = target and private.manages(author_id)) $$;

create function private.can_read_diary(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.diaries where id = target and
    (private.manages(author_id) or (private.is_member() and status = 'published' and deleted_at is null))
  )
$$;

create table public.media (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.members(id),
  story_id uuid references public.stories(id),
  diary_id uuid references public.diaries(id),
  category_id uuid references public.categories(id),
  media_type text not null check (media_type in ('image', 'audio')),
  content_type text not null,
  file_size integer not null check (file_size between 1 and 15728640),
  preview_size integer not null default 0 check (preview_size between 0 and 1048576),
  event_date date not null check (event_date between date '0001-01-01' and date '9999-12-31'),
  caption text not null default '' check (char_length(caption) <= 320),
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  state text not null default 'staged' check (state in ('staged', 'ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  storage_prefix text generated always as (created_by::text || '/' || id::text) stored unique,
  check (num_nonnulls(story_id, diary_id) <= 1),
  check (
    (media_type = 'image' and content_type in ('image/jpeg', 'image/png', 'image/webp') and preview_size > 0)
    or (media_type = 'audio' and story_id is not null and preview_size = 0
        and content_type in ('audio/mpeg', 'audio/mp4', 'audio/wav'))
  )
);
create index media_story on public.media (story_id, sort_order);
create index media_diary on public.media (diary_id);
create index media_album on public.media (event_date desc, id) where state = 'ready' and deleted_at is null;
create unique index one_diary_photo on public.media (diary_id)
where diary_id is not null and state = 'ready' and deleted_at is null;
alter table public.stories add constraint stories_cover_fk foreign key (cover_media_id) references public.media(id);

create function private.manages_media(owner_id uuid, story uuid, diary uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case when story is not null then private.can_manage_story(story)
              when diary is not null then private.can_manage_diary(diary)
              else private.manages(owner_id) end
$$;

create function private.reads_media(
  owner_id uuid, story uuid, diary uuid, media_state text, removed timestamptz
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.manages_media(owner_id, story, diary) or (
    private.is_member() and media_state = 'ready' and removed is null
    and (story is null or private.can_read_story(story))
    and (diary is null or private.can_read_diary(diary))
  )
$$;

create table public.perspectives (
  story_id uuid not null references public.stories(id),
  author_id uuid not null default auth.uid() references public.members(id),
  body text not null check (char_length(btrim(body)) between 1 and 15000),
  updated_at timestamptz not null default now(),
  primary key (story_id, author_id)
);

create table public.promises (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.members(id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 12000),
  target_date date,
  completed_on date,
  story_id uuid references public.stories(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (completed_on is not null or story_id is null)
);

create table public.anniversaries (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  event_date date not null check (event_date between date '0001-01-01' and date '9999-12-31'),
  show_on_home boolean not null default true,
  show_countdown boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.storybook_settings (
  id integer primary key default 1 check (id = 1),
  home_intro text not null default '这里记录着我们的过去，也收藏着正在发生的现在。至于未来，我们一起慢慢写。'
    check (char_length(home_intro) <= 400),
  time_zone text not null default 'Asia/Shanghai',
  cover_media_id uuid references public.media(id),
  updated_at timestamptz not null default now()
);
insert into public.storybook_settings (id) values (1);

create function private.touch() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at := clock_timestamp(); return new; end $$;

create function private.touch_publication() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.revision := old.revision + 1;
    new.updated_at := clock_timestamp();
    if new.status = 'published' and old.status = 'published' then
      new.published_at := old.published_at;
      return new;
    end if;
  elsif (select auth.uid()) is null and new.status = 'published' and new.published_at is not null then
    -- A trusted import can preserve the original publication timestamp.
    return new;
  end if;
  new.published_at := case when new.status = 'published' then clock_timestamp() else null end;
  return new;
end
$$;

create function private.check_story() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not private.is_admin()
     and (case when tg_op = 'INSERT' then new.is_pinned else new.is_pinned is distinct from old.is_pinned end) then
    raise exception '只有管理员可以调整精选回忆。' using errcode = '42501';
  end if;
  if new.cover_media_id is not null and not exists (
    select 1 from public.media where id = new.cover_media_id and story_id = new.id
      and media_type = 'image' and state = 'ready' and deleted_at is null
  ) then
    raise exception '请从这篇故事的照片中选择封面。' using errcode = '23514';
  end if;
  return new;
end
$$;

create function private.check_settings() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception '请选择有效时区。' using errcode = '23514';
  end if;
  if new.cover_media_id is not null and not exists (
    select 1 from public.media where id = new.cover_media_id and story_id is null
      and diary_id is null and media_type = 'image' and state = 'ready' and deleted_at is null
  ) then
    raise exception '请选择一张独立相册照片作为私人封面。' using errcode = '23514';
  end if;
  return new;
end
$$;

create function private.check_promise_story() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.story_id is not null
     and (tg_op = 'INSERT' or new.story_id is distinct from old.story_id)
     and not exists (
       select 1 from public.stories where id = new.story_id and status = 'published' and deleted_at is null
     ) then
    raise exception '请关联一篇已经发布的故事。' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger stories_check before insert or update of cover_media_id, is_pinned on public.stories
for each row execute function private.check_story();
create trigger stories_touch before insert or update on public.stories
for each row execute function private.touch_publication();
create trigger diaries_touch before insert or update on public.diaries
for each row execute function private.touch_publication();
create trigger media_touch before update on public.media for each row execute function private.touch();
create trigger perspectives_touch before update on public.perspectives for each row execute function private.touch();
create trigger promises_touch before update on public.promises for each row execute function private.touch();
create trigger promises_check before insert or update of story_id on public.promises
for each row execute function private.check_promise_story();
create trigger anniversaries_touch before update on public.anniversaries for each row execute function private.touch();
create trigger settings_check before insert or update on public.storybook_settings
for each row execute function private.check_settings();
create trigger settings_touch before update on public.storybook_settings for each row execute function private.touch();

-- Explicit privileges also cover projects that grant API roles privileges by default.
revoke all on public.members, public.categories, public.stories, public.diaries,
  public.perspectives, public.media, public.promises, public.anniversaries, public.storybook_settings
  from public, anon, authenticated;
grant select on public.members, public.categories, public.stories, public.diaries,
  public.perspectives, public.media, public.promises, public.anniversaries, public.storybook_settings
  to authenticated;
grant all on public.members, public.categories, public.stories, public.diaries,
  public.perspectives, public.media, public.promises, public.anniversaries, public.storybook_settings
  to service_role;
grant insert (id, display_name, role), update (display_name, active) on public.members to authenticated;
grant insert (name), update (name, archived), delete on public.categories to authenticated;
grant insert (id, title, event_date, category_id, body, summary, location, weather),
  update (title, event_date, category_id, body, summary, location, weather, status, is_pinned, cover_media_id, deleted_at)
  on public.stories to authenticated;
grant insert (id, event_date, body, mood, show_on_home), update (event_date, body, mood, show_on_home, status, deleted_at)
  on public.diaries to authenticated;
grant insert (story_id, body), update (body), delete on public.perspectives to authenticated;
grant insert (id, story_id, diary_id, category_id, media_type, content_type, file_size, preview_size, event_date, caption),
  update (category_id, event_date, caption, sort_order, state, deleted_at) on public.media to authenticated;
grant insert (title, description, target_date, completed_on, story_id),
  update (title, description, target_date, completed_on, story_id, deleted_at) on public.promises to authenticated;
grant insert (title, event_date, show_on_home, show_countdown),
  update (title, event_date, show_on_home, show_countdown), delete on public.anniversaries to authenticated;
grant update (home_intro, time_zone, cover_media_id) on public.storybook_settings to authenticated;

alter table public.members enable row level security;
alter table public.categories enable row level security;
alter table public.stories enable row level security;
alter table public.diaries enable row level security;
alter table public.perspectives enable row level security;
alter table public.media enable row level security;
alter table public.promises enable row level security;
alter table public.anniversaries enable row level security;
alter table public.storybook_settings enable row level security;

create policy members_read on public.members for select to authenticated using ((select private.is_member()));
create policy writer_invite on public.members for insert to authenticated
with check ((select private.is_admin()) and role = 'writer');
create policy writer_manage on public.members for update to authenticated
using ((select private.is_admin()) and role = 'writer')
with check ((select private.is_admin()) and role = 'writer');

create policy categories_read on public.categories for select to authenticated using ((select private.is_member()));
create policy categories_manage on public.categories for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create policy stories_read on public.stories for select to authenticated
using (private.manages(author_id) or ((select private.is_member()) and status = 'published' and deleted_at is null));
create policy stories_create on public.stories for insert to authenticated
with check ((select private.is_member()) and author_id = (select auth.uid()) and status = 'draft');
create policy stories_update on public.stories for update to authenticated
using (private.manages(author_id)) with check (private.manages(author_id));

create policy diaries_read on public.diaries for select to authenticated
using (private.manages(author_id) or ((select private.is_member()) and status = 'published' and deleted_at is null));
create policy diaries_create on public.diaries for insert to authenticated
with check ((select private.is_member()) and author_id = (select auth.uid()) and status = 'draft');
create policy diaries_update on public.diaries for update to authenticated
using (private.manages(author_id)) with check (private.manages(author_id));

create policy perspectives_read on public.perspectives for select to authenticated
using (private.can_read_story(story_id));
create policy perspectives_own on public.perspectives for all to authenticated
using (author_id = (select auth.uid()) and private.can_read_story(story_id))
with check (author_id = (select auth.uid()) and private.can_read_story(story_id));

create policy media_read on public.media for select to authenticated
using (private.reads_media(created_by, story_id, diary_id, state, deleted_at));
create policy media_stage on public.media for insert to authenticated
with check ((select private.is_member()) and created_by = (select auth.uid()) and state = 'staged'
            and private.manages_media(created_by, story_id, diary_id));
create policy media_manage on public.media for update to authenticated
using (private.manages_media(created_by, story_id, diary_id))
with check (private.manages_media(created_by, story_id, diary_id));

create policy promises_read on public.promises for select to authenticated
using (private.manages(author_id) or ((select private.is_member()) and deleted_at is null));
create policy promises_create on public.promises for insert to authenticated
with check ((select private.is_member()) and author_id = (select auth.uid()));
create policy promises_update on public.promises for update to authenticated
using (private.manages(author_id)) with check (private.manages(author_id));

create policy anniversaries_read on public.anniversaries for select to authenticated using ((select private.is_member()));
create policy anniversaries_manage on public.anniversaries for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy settings_read on public.storybook_settings for select to authenticated using ((select private.is_member()));
create policy settings_update on public.storybook_settings for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('storybook-private', 'storybook-private', false, 15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4', 'audio/wav'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Only an object owned by a known media row can be written or read by clients.
create function private.object_allowed(object_name text, operation text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.media m
    where m.storage_prefix = pg_catalog.split_part(object_name, '/', 1) || '/' ||
                              pg_catalog.split_part(object_name, '/', 2)
      and (object_name = m.storage_prefix || '/original'
           or (m.media_type = 'image' and object_name = m.storage_prefix || '/preview'))
      and case operation
        when 'read' then private.reads_media(m.created_by, m.story_id, m.diary_id, m.state, m.deleted_at)
        when 'stage' then m.state = 'staged' and m.deleted_at is null and m.created_by = (select auth.uid())
                          and private.manages_media(m.created_by, m.story_id, m.diary_id)
        when 'discard' then m.state = 'staged' and m.deleted_at is not null
                            and private.manages_media(m.created_by, m.story_id, m.diary_id)
        else false end
  )
$$;

-- Restrictive guards also constrain any broader policies already present on storage.objects.
create policy book_no_anonymous on storage.objects as restrictive for all to anon
using (bucket_id <> 'storybook-private') with check (bucket_id <> 'storybook-private');
create policy book_read_gate on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'storybook-private' or private.object_allowed(name, 'read'));
create policy book_upload_gate on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'storybook-private' or private.object_allowed(name, 'stage'));
create policy book_no_overwrite on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'storybook-private') with check (bucket_id <> 'storybook-private');
create policy book_delete_gate on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'storybook-private' or private.object_allowed(name, 'discard'));
create policy book_read on storage.objects for select to authenticated
using (bucket_id = 'storybook-private' and private.object_allowed(name, 'read'));
create policy book_upload on storage.objects for insert to authenticated
with check (bucket_id = 'storybook-private' and private.object_allowed(name, 'stage'));
create policy book_discard on storage.objects for delete to authenticated
using (bucket_id = 'storybook-private' and private.object_allowed(name, 'discard'));

create function private.confirm_media_files() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  prefix text := new.created_by::text || '/' || new.id::text;
begin
  if tg_op = 'UPDATE' and old.state = 'ready' and new.state = 'staged' then
    raise exception '已保存的媒体不能退回上传中。' using errcode = '23514';
  end if;
  if new.state = 'ready' and new.deleted_at is null and (
    not exists (select 1 from storage.objects where bucket_id = 'storybook-private' and name = prefix || '/original')
    or (new.media_type = 'image' and not exists (
      select 1 from storage.objects where bucket_id = 'storybook-private' and name = prefix || '/preview'
    ))
  ) then
    raise exception '媒体文件还没有上传完整。请重试。' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger media_confirm_files before insert or update of state, deleted_at on public.media
for each row execute function private.confirm_media_files();

-- Parent records are locked before this function runs. A complete save is one transaction.
create function private.sync_media(parent_story uuid, parent_diary uuid, items jsonb) returns void
language plpgsql set search_path = ''
as $$
declare item record;
begin
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) >
     (case when parent_diary is null then 25 else 1 end) then
    raise exception '媒体数量超出上限。' using errcode = '23514';
  end if;
  update public.media set deleted_at = clock_timestamp()
  where story_id is not distinct from parent_story and diary_id is not distinct from parent_diary
    and state = 'ready' and deleted_at is null
    and not exists (select 1 from jsonb_array_elements(items) x where (x->>'id')::uuid = media.id);
  for item in select * from jsonb_to_recordset(items) as x(id uuid, caption text, sort_order integer) loop
    update public.media set state = 'ready', caption = coalesce(item.caption, ''), sort_order = item.sort_order
    where id = item.id and story_id is not distinct from parent_story and diary_id is not distinct from parent_diary
      and deleted_at is null;
    if not found then raise exception '有一份媒体已移除或不属于这篇记录。' using errcode = '23514'; end if;
  end loop;
end
$$;

create function public.save_story(target uuid, expected integer, fields jsonb, items jsonb)
returns public.stories language plpgsql set search_path = ''
as $$
declare saved public.stories;
begin
  perform 1 from public.stories where id = target and revision = expected and deleted_at is null
    and private.can_manage_story(target) for update;
  if not found then raise exception '这篇故事已被修改或移除。请复制文字后刷新。' using errcode = '40001'; end if;
  perform private.sync_media(target, null, items);
  update public.stories set
    title = btrim(fields->>'title'), event_date = (fields->>'event_date')::date,
    category_id = (fields->>'category_id')::uuid, body = fields->>'body', summary = fields->>'summary',
    location = fields->>'location', weather = fields->>'weather', status = fields->>'status',
    cover_media_id = nullif(fields->>'cover_media_id', '')::uuid,
    is_pinned = coalesce((fields->>'is_pinned')::boolean, is_pinned)
  where id = target returning * into saved;
  return saved;
end
$$;

create function public.save_diary(target uuid, expected integer, fields jsonb, items jsonb)
returns public.diaries language plpgsql set search_path = ''
as $$
declare saved public.diaries;
begin
  perform 1 from public.diaries where id = target and revision = expected and deleted_at is null
    and private.can_manage_diary(target) for update;
  if not found then raise exception '这条日记已被修改或移除。请复制文字后刷新。' using errcode = '40001'; end if;
  perform private.sync_media(null, target, items);
  update public.diaries set
    event_date = (fields->>'event_date')::date, body = fields->>'body', mood = fields->>'mood',
    show_on_home = (fields->>'show_on_home')::boolean, status = fields->>'status'
  where id = target returning * into saved;
  return saved;
end
$$;

create function public.save_album(targets uuid[], replaced uuid default null)
returns void language plpgsql set search_path = ''
as $$
declare media_id uuid;
begin
  if coalesce(cardinality(targets), 0) not between 1 and 20 then
    raise exception '一次可保存 1 至 20 张照片。' using errcode = '23514';
  end if;
  if replaced is not null then
    if cardinality(targets) <> 1 or replaced = any(targets) then
      raise exception '每次只能替换一张照片。' using errcode = '23514';
    end if;
    update public.media set deleted_at = clock_timestamp() where id = replaced and story_id is null
      and diary_id is null and state = 'ready' and deleted_at is null;
    if not found then raise exception '原照片已被移除，或你没有权限。' using errcode = '42501'; end if;
  end if;
  foreach media_id in array targets loop
    update public.media set state = 'ready' where id = media_id and story_id is null and diary_id is null
      and media_type = 'image' and deleted_at is null and created_by = (select auth.uid());
    if not found then raise exception '照片未找到或没有权限。' using errcode = '42501'; end if;
  end loop;
end
$$;

create function public.story_years() returns setof integer
language sql stable set search_path = ''
as $$
  select distinct extract(year from event_date)::integer as year
  from public.stories where status = 'published' and deleted_at is null order by year desc
$$;

create function private.album_rows()
returns table (item public.media, album_date date, category_id uuid, featured boolean)
language sql stable set search_path = ''
as $$
  select m, coalesce(s.event_date, d.event_date, m.event_date),
    coalesce(s.category_id, m.category_id), coalesce(s.is_pinned, false)
  from public.media m
  left join public.stories s on s.id = m.story_id and s.status = 'published' and s.deleted_at is null
  left join public.diaries d on d.id = m.diary_id and d.status = 'published' and d.deleted_at is null
  where m.media_type = 'image' and m.state = 'ready' and m.deleted_at is null
    and (m.story_id is null or s.id is not null) and (m.diary_id is null or d.id is not null)
$$;

create function public.album_photos(
  from_date date, to_date date, category_filter uuid, featured_only boolean, start_at integer, limit_to integer
) returns setof public.media
language sql stable set search_path = ''
as $$
  select (jsonb_populate_record(a.item, jsonb_build_object('event_date', a.album_date))).*
  from private.album_rows() a
  where (from_date is null or a.album_date >= from_date) and (to_date is null or a.album_date <= to_date)
    and (category_filter is null or a.category_id = category_filter)
    and (not coalesce(featured_only, false) or a.featured)
  order by a.album_date desc, (a.item).id
  offset greatest(start_at, 0) limit least(greatest(limit_to, 0), 50)
$$;

create function public.album_years() returns setof integer
language sql stable set search_path = ''
as $$
  select distinct extract(year from album_date)::integer as year from private.album_rows() order by year desc
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_member(), private.is_admin(), private.manages(uuid),
  private.can_read_story(uuid), private.can_manage_story(uuid), private.can_read_diary(uuid),
  private.can_manage_diary(uuid), private.manages_media(uuid, uuid, uuid),
  private.reads_media(uuid, uuid, uuid, text, timestamptz), private.object_allowed(text, text),
  private.sync_media(uuid, uuid, jsonb), private.album_rows() to authenticated;
revoke all on function public.save_story(uuid, integer, jsonb, jsonb),
  public.save_diary(uuid, integer, jsonb, jsonb), public.save_album(uuid[], uuid), public.story_years(),
  public.album_photos(date, date, uuid, boolean, integer, integer), public.album_years()
  from public, anon, authenticated;
grant execute on function public.save_story(uuid, integer, jsonb, jsonb),
  public.save_diary(uuid, integer, jsonb, jsonb), public.save_album(uuid[], uuid), public.story_years(),
  public.album_photos(date, date, uuid, boolean, integer, integer), public.album_years()
  to authenticated;

commit;
