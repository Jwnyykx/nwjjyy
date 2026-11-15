begin;

alter table public.stories add column is_hidden boolean not null default false;
alter table public.storybook_settings
  add column home_subtitle text not null default '我们的故事，未完待续。' check (char_length(btrim(home_subtitle)) between 1 and 80),
  add column appearance text not null default 'linen' check (appearance in ('linen', 'lavender', 'paper')),
  add column show_bunny boolean not null default true,
  add column allow_motion boolean not null default true,
  add column enable_shuffle boolean not null default true,
  add column show_post_notices boolean not null default true,
  add column next_meeting date;
grant update (home_subtitle, appearance, show_bunny, allow_motion, enable_shuffle, show_post_notices, next_meeting)
  on public.storybook_settings to authenticated;

create function private.guard_hidden_story() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.is_hidden is distinct from old.is_hidden
     and (select auth.uid()) is not null and not private.is_admin() then
    raise exception '只有管理员可以改变隐藏故事的设置。' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function private.guard_hidden_story() from public, anon, authenticated;
create trigger hidden_story_check before update of is_hidden on public.stories
for each row execute function private.guard_hidden_story();
grant update (is_hidden) on public.stories to authenticated;

create or replace function public.save_story(target uuid, expected integer, fields jsonb, items jsonb)
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
    is_pinned = coalesce((fields->>'is_pinned')::boolean, is_pinned),
    is_hidden = coalesce((fields->>'is_hidden')::boolean, is_hidden)
  where id = target returning * into saved;
  return saved;
end
$$;

create or replace function public.story_years() returns setof integer
language sql stable set search_path = ''
as $$
  select distinct extract(year from event_date)::integer as year from public.stories
  where status = 'published' and deleted_at is null and not is_hidden order by year desc
$$;

create or replace function private.album_rows()
returns table (item public.media, album_date date, category_id uuid, featured boolean)
language sql stable set search_path = ''
as $$
  select m, coalesce(s.event_date, d.event_date, m.event_date),
    coalesce(s.category_id, m.category_id), coalesce(s.is_pinned, false)
  from public.media m
  left join public.stories s on s.id = m.story_id and s.status = 'published' and s.deleted_at is null and not s.is_hidden
  left join public.diaries d on d.id = m.diary_id and d.status = 'published' and d.deleted_at is null
  where m.media_type = 'image' and m.state = 'ready' and m.deleted_at is null
    and (m.story_id is null or s.id is not null) and (m.diary_id is null or d.id is not null)
$$;

create or replace function public.chapter_directory()
returns table (
  id uuid, title text, description text, sort_order integer, cover_story_id uuid,
  created_at timestamptz, updated_at timestamptz, story_count integer, cover_media_id uuid
) language sql stable set search_path = ''
as $$
  select c.id, c.title, c.description, c.sort_order, c.cover_story_id, c.created_at, c.updated_at,
    (select count(*)::integer from public.chapter_entries e join public.stories s on s.id = e.story_id
       where e.chapter_id = c.id and s.status = 'published' and s.deleted_at is null and not s.is_hidden),
    (select m.id from public.chapter_entries e join public.stories s on s.id = e.story_id
       join public.media m on m.id = s.cover_media_id and m.state = 'ready' and m.deleted_at is null
     where e.chapter_id = c.id and s.status = 'published' and s.deleted_at is null and not s.is_hidden
     order by (e.story_id = c.cover_story_id) desc nulls last, e.sort_order, s.event_date, e.story_id limit 1)
  from public.chapters c order by c.sort_order, c.created_at, c.id
$$;

create or replace function public.chapter_stories(target uuid, start_at integer default 0, limit_to integer default 12)
returns setof public.stories language sql stable set search_path = ''
as $$
  select s.* from public.chapter_entries e join public.stories s on s.id = e.story_id
  where e.chapter_id = target and s.status = 'published' and s.deleted_at is null and not s.is_hidden
  order by e.sort_order, s.event_date, s.created_at, s.id
  offset greatest(start_at, 0) limit least(greatest(limit_to, 0), 50)
$$;

create table public.photo_collections (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 600),
  cover_id uuid references public.media(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.photo_collection_items (
  collection_id uuid not null references public.photo_collections(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  primary key (collection_id, media_id)
);
create index photo_collection_sequence on public.photo_collection_items(collection_id, sort_order, media_id);

create function private.album_has(target uuid) returns boolean
language sql stable set search_path = ''
as $$ select exists (select 1 from private.album_rows() a where (a.item).id = target) $$;
revoke all on function private.album_has(uuid) from public, anon, authenticated;
grant execute on function private.album_has(uuid) to authenticated;

alter table public.photo_collections enable row level security;
alter table public.photo_collection_items enable row level security;
revoke all on public.photo_collections, public.photo_collection_items from public, anon, authenticated;
grant select, delete on public.photo_collections, public.photo_collection_items to authenticated;
grant insert (id, title, description, cover_id), update (title, description, cover_id) on public.photo_collections to authenticated;
grant insert (collection_id, media_id, sort_order), update (sort_order) on public.photo_collection_items to authenticated;
grant all on public.photo_collections, public.photo_collection_items to service_role;

create policy photo_collections_read on public.photo_collections for select to authenticated using ((select private.is_member()));
create policy photo_collections_write on public.photo_collections for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()) and (cover_id is null or private.album_has(cover_id)));
create policy photo_collection_items_read on public.photo_collection_items for select to authenticated
using ((select private.is_admin()) or private.album_has(media_id));
create policy photo_collection_items_write on public.photo_collection_items for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()) and private.album_has(media_id));

create function public.save_collection(target uuid, fields jsonb, photos uuid[]) returns uuid
language plpgsql set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception '只有管理员可以设置照片合集。' using errcode = '42501'; end if;
  if coalesce(cardinality(photos), 0) > 60 then raise exception '一个合集最多收录 60 张。' using errcode = '23514'; end if;
  if fields->>'cover_id' is not null and not coalesce((fields->>'cover_id')::uuid = any(photos), false) then
    raise exception '封面必须来自这组照片。' using errcode = '23514';
  end if;
  if exists(select 1 from public.photo_collections where id=target) then
    update public.photo_collections set title=btrim(fields->>'title'), description=fields->>'description',
      cover_id=(fields->>'cover_id')::uuid where id=target;
  else
    insert into public.photo_collections(id,title,description,cover_id)
    values(target,btrim(fields->>'title'), fields->>'description', (fields->>'cover_id')::uuid);
  end if;
  delete from public.photo_collection_items where collection_id=target;
  insert into public.photo_collection_items(collection_id, media_id, sort_order)
  select target, photo, ord::integer - 1 from unnest(photos) with ordinality as p(photo,ord);
  return target;
end
$$;
revoke all on function public.save_collection(uuid,jsonb,uuid[]) from public, anon, authenticated;
grant execute on function public.save_collection(uuid,jsonb,uuid[]) to authenticated;

create function public.collection_photos(target uuid) returns setof public.media
language sql stable set search_path = ''
as $$
  select (jsonb_populate_record(a.item,jsonb_build_object('event_date',a.album_date))).*
  from public.photo_collection_items e join private.album_rows() a on (a.item).id=e.media_id
  where e.collection_id=target order by e.sort_order,e.media_id
$$;
create function public.book_photo(target uuid) returns setof public.media
language sql stable set search_path = ''
as $$
  select (jsonb_populate_record(a.item,jsonb_build_object('event_date',a.album_date))).*
  from private.album_rows() a where (a.item).id=target
$$;
create function public.collection_covers(targets uuid[]) returns table (collection_id uuid, photo jsonb)
language sql stable set search_path = ''
as $$
  select c.id, to_jsonb(m) from public.photo_collections c
  join lateral (select p.* from public.collection_photos(c.id) p
    left join public.photo_collection_items e on e.collection_id=c.id and e.media_id=p.id
    order by (p.id=c.cover_id) desc nulls last,e.sort_order,p.id limit 1) m on true
  where c.id=any(targets)
$$;
revoke all on function public.collection_photos(uuid), public.collection_covers(uuid[]), public.book_photo(uuid) from public, anon, authenticated;
grant execute on function public.collection_photos(uuid), public.collection_covers(uuid[]), public.book_photo(uuid) to authenticated;

create table public.trip_entries (
  footprint_id uuid not null references public.footprints(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  primary key (footprint_id, story_id)
);
alter table public.trip_entries enable row level security;
revoke all on public.trip_entries from public, anon, authenticated;
grant select, delete on public.trip_entries to authenticated;
grant insert (footprint_id, story_id) on public.trip_entries to authenticated;
grant all on public.trip_entries to service_role;
create policy trip_entries_read on public.trip_entries for select to authenticated using (
  (select private.is_member()) and
  (exists(select 1 from public.footprints f where f.id=footprint_id and private.manages(f.author_id))
   or exists(select 1 from public.stories s where s.id=story_id and s.status='published' and s.deleted_at is null and not s.is_hidden))
);
create policy trip_entries_insert on public.trip_entries for insert to authenticated with check (
  exists(select 1 from public.footprints f where f.id=footprint_id and private.manages(f.author_id))
  and exists(select 1 from public.stories s where s.id=story_id and s.status='published' and s.deleted_at is null and not s.is_hidden)
);
create policy trip_entries_delete on public.trip_entries for delete to authenticated using (
  exists(select 1 from public.footprints f where f.id=footprint_id and private.manages(f.author_id))
);

create function public.save_trip(target uuid, fields jsonb, linked uuid[]) returns uuid
language plpgsql set search_path = ''
as $$
begin
  if coalesce(cardinality(linked),0) > 30 then raise exception '一次相见最多关联 30 篇故事。' using errcode = '23514'; end if;
  if exists(select 1 from public.footprints where id=target) then
    update public.footprints set title=btrim(fields->>'title'), city=btrim(fields->>'city'),
      note=fields->>'note', arrival=(fields->>'arrival')::date, departure=(fields->>'departure')::date, story_id=null
    where id=target;
    if not found then raise exception '你没有权限修改这次相见。' using errcode = '42501'; end if;
  else
    insert into public.footprints(id,title,city,note,arrival,departure) values
      (target,btrim(fields->>'title'),btrim(fields->>'city'),fields->>'note',
       (fields->>'arrival')::date,(fields->>'departure')::date);
  end if;
  delete from public.trip_entries where footprint_id=target;
  insert into public.trip_entries(footprint_id,story_id) select target,id from unnest(linked) as t(id);
  return target;
end
$$;
revoke all on function public.save_trip(uuid,jsonb,uuid[]) from public, anon, authenticated;
grant execute on function public.save_trip(uuid,jsonb,uuid[]) to authenticated;

create policy photo_notes_backup on public.photo_notes for select to authenticated using (
  exists(select 1 from public.media m where m.id=media_id and m.state='ready'
    and private.manages_media(m.created_by,m.story_id,m.diary_id))
);

create table public.annual_books (
  year integer primary key check (year between 1 and 9999),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  reflection text not null default '' check (char_length(reflection) <= 4000),
  cover_id uuid references public.media(id) on delete set null,
  focus_story_id uuid references public.stories(id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger annual_books_touch before update on public.annual_books for each row execute function private.touch();
alter table public.annual_books enable row level security;
revoke all on public.annual_books from public, anon, authenticated;
grant select on public.annual_books to authenticated;
grant insert (year,title,reflection,cover_id,focus_story_id), update (title,reflection,cover_id,focus_story_id)
  on public.annual_books to authenticated;
grant all on public.annual_books to service_role;
create policy annual_books_read on public.annual_books for select to authenticated using ((select private.is_member()));
create policy annual_books_write on public.annual_books for all to authenticated
using ((select private.is_admin())) with check (
  (select private.is_admin()) and (cover_id is null or private.album_has(cover_id))
  and (focus_story_id is null or exists(select 1 from public.stories s where s.id=focus_story_id
    and s.status='published' and s.deleted_at is null and not s.is_hidden))
);

commit;
