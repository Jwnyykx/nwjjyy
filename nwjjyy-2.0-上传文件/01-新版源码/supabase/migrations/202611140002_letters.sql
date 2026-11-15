begin;

create table private.letter_envelopes (
  id uuid primary key,
  author_id uuid not null references public.members(id),
  recipient_id uuid not null references public.members(id),
  title text not null check (char_length(title) between 1 and 120),
  theme text not null check (theme in ('plum', 'rose', 'kraft')),
  unlock_at timestamptz,
  show_title boolean not null default false,
  share_opened boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  sent_at timestamptz,
  opened_at timestamptz,
  discarded boolean not null default false,
  revision integer not null default 1,
  check (author_id <> recipient_id),
  check (opened_at is null or (sent_at is not null and opened_at >= greatest(sent_at, unlock_at)))
);
create index letter_recipients on private.letter_envelopes(recipient_id, sent_at desc) where sent_at is not null;
create index letter_authors on private.letter_envelopes(author_id, updated_at desc);

create table private.letter_bodies (
  letter_id uuid primary key references private.letter_envelopes(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 20000)
);
create table private.letter_favorites (
  letter_id uuid references private.letter_envelopes(id) on delete cascade,
  member_id uuid references public.members(id),
  primary key (letter_id, member_id)
);
create index letter_favorites_member on private.letter_favorites(member_id, letter_id);
alter table private.letter_envelopes enable row level security;
alter table private.letter_bodies enable row level security;
alter table private.letter_favorites enable row level security;
-- No direct browser privileges. Only the explicit RPCs below can access these tables.
revoke all on private.letter_envelopes, private.letter_bodies, private.letter_favorites from public, anon, authenticated;

create table private.letter_assets (
  id uuid primary key,
  letter_id uuid not null references private.letter_envelopes(id),
  kind text not null check (kind in ('image','audio')),
  mime text not null check (
    (kind = 'image' and mime in ('image/jpeg','image/png','image/webp')) or
    (kind = 'audio' and mime in ('audio/mpeg','audio/mp4','audio/wav'))
  ),
  size_bytes integer not null check (size_bytes between 12 and 15728640),
  position smallint check (position is null or position between 0 and 5),
  discarded boolean not null default false,
  created_at timestamptz not null default statement_timestamp()
);
create index letter_assets_by_letter on private.letter_assets(letter_id, position);
alter table private.letter_assets enable row level security;
revoke all on private.letter_assets from public, anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('storybook-letters','storybook-letters',false,15728640,
  array['image/jpeg','image/png','image/webp','audio/mpeg','audio/mp4','audio/wav'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function private.letter_asset_access(p_name text, p_action text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_member() and exists(
    select from private.letter_assets a join private.letter_envelopes e on a.letter_id = e.id
    where
      a.id = case when p_name ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then p_name::uuid else null end
      and case p_action
        when 'insert' then e.author_id = auth.uid() and e.sent_at is null and not e.discarded and not a.discarded
        when 'select' then
          e.author_id = auth.uid() or
          (e.recipient_id = auth.uid() and e.sent_at is not null and e.opened_at is not null and
           (e.unlock_at is null or e.unlock_at <= statement_timestamp()) and a.position is not null and not a.discarded)
        when 'delete' then e.author_id = auth.uid() and a.discarded and a.position is null
        else false end
  )
$$;
revoke all on function private.letter_asset_access(text, text) from public, anon, authenticated;
grant execute on function private.letter_asset_access(text, text) to authenticated;

create policy letters_no_anon on storage.objects as restrictive for all to anon
  using (bucket_id <> 'storybook-letters') with check (bucket_id <> 'storybook-letters');
create policy letters_read_guard on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'storybook-letters' or private.letter_asset_access(name, 'select'));
create policy letters_read on storage.objects for select to authenticated
  using (bucket_id = 'storybook-letters' and private.letter_asset_access(name, 'select'));
create policy letters_write_guard on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'storybook-letters' or private.letter_asset_access(name, 'insert'));
create policy letters_write on storage.objects for insert to authenticated
  with check (bucket_id = 'storybook-letters' and private.letter_asset_access(name, 'insert'));
create policy letters_no_update on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'storybook-letters') with check (bucket_id <> 'storybook-letters');
create policy letters_delete_guard on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'storybook-letters' or private.letter_asset_access(name, 'delete'));
create policy letters_delete on storage.objects for delete to authenticated
  using (bucket_id = 'storybook-letters' and private.letter_asset_access(name, 'delete'));

create function private.letter_parts(p_id uuid)
returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'mime', a.mime,
    'size_bytes', a.size_bytes) order by a.position), '[]'::jsonb)
  from private.letter_assets a where a.letter_id = p_id and a.position is not null
$$;
revoke all on function private.letter_parts(uuid) from public, anon, authenticated;

create function public.letter_stage(p_id uuid, p_revision int, p_asset uuid, p_kind text, p_mime text, p_size int)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_member() then raise insufficient_privilege; end if;
  perform from private.letter_envelopes where id = p_id and author_id = auth.uid()
    and sent_at is null and not discarded and revision = p_revision for update;
  if not found then raise exception '草稿已变动，请重新打开。' using errcode = '40001'; end if;
  if exists(select from private.letter_assets where id = p_asset and letter_id = p_id and not discarded and
    kind = p_kind and mime = p_mime and size_bytes = p_size) then return; end if;
  if (select count(*) from private.letter_assets where letter_id = p_id and not discarded) >= 24 then
    raise exception '这封草稿的历史附件过多，请新建一封信。' using errcode = '22023';
  end if;
  insert into private.letter_assets(id,letter_id,kind,mime,size_bytes) values(p_asset,p_id,p_kind,p_mime,p_size);
end $$;
revoke all on function public.letter_stage(uuid,integer,uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.letter_stage(uuid,integer,uuid,text,text,integer) to authenticated;

create function private.letter_set_parts(p_id uuid, p_assets uuid[])
returns void
language plpgsql set search_path = ''
as $$
begin
  if p_assets is null then return; end if;
  if cardinality(p_assets) > 6 or
    cardinality(p_assets) <> (select count(distinct item) from unnest(p_assets) item) then
    raise exception '每封信可带至多六份附件。' using errcode = '22023';
  end if;
  if cardinality(p_assets) <> (
    select count(*) from private.letter_assets a join storage.objects o
      on o.bucket_id = 'storybook-letters' and o.name = a.id::text
    where a.letter_id = p_id and a.id = any(p_assets) and not a.discarded
  ) then raise exception '附件尚未上传完整，请重试。' using errcode = '22023'; end if;
  update private.letter_assets set position = null, discarded = true
    where letter_id = p_id and not discarded and id <> all(p_assets);
  update private.letter_assets a set position = x.position - 1
    from unnest(p_assets) with ordinality x(id, position) where a.letter_id = p_id and a.id = x.id;
end $$;
revoke all on function private.letter_set_parts(uuid, uuid[]) from public, anon, authenticated;

create function private.letter_card(p_letter private.letter_envelopes, p_member uuid, p_time timestamptz)
returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_letter.id,
    'author_id', p_letter.author_id,
    'recipient_id', p_letter.recipient_id,
    'title', case when p_letter.author_id = p_member or p_letter.show_title or
      p_letter.unlock_at is null or p_letter.unlock_at <= p_time then p_letter.title else null end,
    'theme', p_letter.theme,
    'unlock_at', p_letter.unlock_at,
    'locked', p_letter.author_id <> p_member and coalesce(p_letter.unlock_at > p_time, false),
    'show_title', p_letter.show_title,
    'share_opened', p_letter.share_opened,
    'draft', p_letter.sent_at is null,
    'sent_at', p_letter.sent_at,
    'opened_at', case when p_letter.recipient_id = p_member or p_letter.share_opened then p_letter.opened_at else null end,
    'created_at', p_letter.created_at,
    'updated_at', p_letter.updated_at,
    'revision', p_letter.revision,
    'favorite', exists(select from private.letter_favorites f where f.letter_id = p_letter.id and f.member_id = p_member)
  )
$$;

create function public.letter_list(p_box text default 'inbox', p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_member uuid := auth.uid();
begin
  if not private.is_member() then raise insufficient_privilege; end if;
  if p_box is null or p_box not in ('inbox','sent','draft','favorite') then raise invalid_parameter_value; end if;
  return coalesce((
    select jsonb_agg(private.letter_card(l, v_member, statement_timestamp()) order by l.updated_at desc, l.id)
    from (
      select e.* from private.letter_envelopes e
      where not e.discarded and case p_box
        when 'inbox' then e.recipient_id = v_member and e.sent_at is not null
        when 'sent' then e.author_id = v_member and e.sent_at is not null
        when 'draft' then e.author_id = v_member and e.sent_at is null
        else e.sent_at is not null and v_member in (e.author_id, e.recipient_id) and exists (
          select from private.letter_favorites f where f.letter_id = e.id and f.member_id = v_member)
        end
      order by e.updated_at desc, e.id
      offset greatest(p_offset, 0) limit 13
    ) l
  ), '[]'::jsonb);
end $$;

create function public.letter_status()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_member uuid := auth.uid();
begin
  if not private.is_member() then raise insufficient_privilege; end if;
  return (
    select jsonb_build_object('unread',count(*) filter(where unlock_at is null),
      'unlocked', count(*) filter(where unlock_at <= statement_timestamp()))
    from private.letter_envelopes
    where recipient_id = v_member and sent_at is not null and opened_at is null
  );
end $$;

create function public.letter_detail(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_member uuid := auth.uid();
begin
  if not private.is_member() then raise insufficient_privilege; end if;
  return (
    select private.letter_card(e, v_member, statement_timestamp()) || jsonb_build_object('body',
      case when e.author_id = v_member or (e.opened_at is not null and
        (e.unlock_at is null or e.unlock_at <= statement_timestamp())) then b.body else null end,
      'attachments', case when e.author_id = v_member or (e.opened_at is not null and
        (e.unlock_at is null or e.unlock_at <= statement_timestamp())) then private.letter_parts(e.id) else '[]'::jsonb end)
    from private.letter_envelopes e join private.letter_bodies b on b.letter_id = e.id
    where e.id = p_id and not e.discarded and (e.author_id = v_member or (e.recipient_id = v_member and e.sent_at is not null))
  );
end $$;

create function public.letter_archive()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_member uuid := auth.uid();
  v_time timestamptz := statement_timestamp();
begin
  if not private.is_member() then raise insufficient_privilege; end if;
  return jsonb_build_object('format', 'nwjjyy-private-letters-v1', 'exported_at', v_time, 'letters', coalesce((
    select jsonb_agg(private.letter_card(e, v_member, v_time) || jsonb_build_object('body',
      case when e.author_id = v_member or (e.opened_at is not null and (e.unlock_at is null or e.unlock_at <= v_time))
        then b.body else null end,
      'attachments', case when e.author_id = v_member or (e.opened_at is not null and
        (e.unlock_at is null or e.unlock_at <= v_time)) then private.letter_parts(e.id) else '[]'::jsonb end)
      order by e.updated_at desc, e.id)
    from private.letter_envelopes e join private.letter_bodies b on b.letter_id = e.id
    where not e.discarded and (e.author_id = v_member or (e.recipient_id = v_member and e.sent_at is not null))
  ), '[]'::jsonb));
end $$;

create function public.letter_save(p_id uuid, p_recipient uuid, p_title text, p_body text, p_theme text,
  p_unlock timestamp, p_show_title boolean, p_share_opened boolean, p_send boolean, p_expected integer,
  p_assets uuid[] default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_member uuid := auth.uid();
  v_letter private.letter_envelopes;
  v_unlock timestamptz;
  v_now timestamptz := statement_timestamp();
  v_tz text;
begin
  if not private.is_member() or p_id is null or p_recipient is null or p_recipient = v_member
    or not exists (select from public.members where id = p_recipient and active) then raise insufficient_privilege; end if;
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_body), '') is null then
    raise exception '请写下标题和正文。' using errcode = '22023';
  end if;
  select * into v_letter from private.letter_envelopes where id = p_id for update;
  if found and v_letter.author_id <> v_member then raise insufficient_privilege; end if;
  if v_letter.discarded then raise exception '这封草稿已删除。' using errcode = '40001'; end if;
  if p_unlock is not null then
    select coalesce((select time_zone from public.storybook_settings where id = 1), 'Asia/Shanghai') into v_tz;
    v_unlock := case when v_letter.unlock_at is not null and (v_letter.unlock_at at time zone v_tz) = p_unlock
      then v_letter.unlock_at else p_unlock at time zone v_tz end;
    if (v_unlock at time zone v_tz) is distinct from p_unlock then
      raise exception '这一时刻在当前时区不存在，请换一个时间。' using errcode = '22023';
    end if;
  end if;
  if v_letter.sent_at is not null then
    if p_send and v_letter.revision = coalesce(p_expected, 0) + 1 and v_letter.recipient_id = p_recipient
      and v_letter.title = btrim(p_title) and v_letter.theme = p_theme and v_letter.unlock_at is not distinct from v_unlock
      and v_letter.show_title = p_show_title and v_letter.share_opened = p_share_opened
      and exists(select from private.letter_bodies where letter_id = p_id and body = p_body)
      and (p_assets is null or p_assets = (select coalesce(array_agg(id order by position), '{}'::uuid[])
        from private.letter_assets where letter_id = p_id and position is not null)) then
      return private.letter_card(v_letter, v_member, v_now);
    end if;
    raise exception '已经寄出的信保留原文。你可以写一封新的信。' using errcode = '22023';
  end if;
  if p_send and v_unlock is not null and v_unlock <= v_now then
    raise exception '解锁时间需要在未来。也可以选择现在送达。' using errcode = '22023';
  end if;
  if v_letter.id is not null then
    if v_letter.revision is distinct from p_expected then
      if not p_send and v_letter.revision = coalesce(p_expected, 0) + 1 and v_letter.recipient_id = p_recipient
        and v_letter.title = btrim(p_title) and v_letter.theme = p_theme and v_letter.unlock_at is not distinct from v_unlock
        and v_letter.show_title = p_show_title and v_letter.share_opened = p_share_opened
        and exists(select from private.letter_bodies where letter_id = p_id and body = p_body)
        and (p_assets is null or p_assets = (select coalesce(array_agg(id order by position), '{}'::uuid[])
          from private.letter_assets where letter_id = p_id and position is not null)) then
        return private.letter_card(v_letter, v_member, v_now);
      end if;
      raise exception '这封草稿在别处改过。请复制你刚写的文字，再重新打开。' using errcode = '40001';
    end if;
    update private.letter_envelopes set recipient_id = p_recipient, title = btrim(p_title), theme = p_theme,
      unlock_at = v_unlock, show_title = p_show_title, share_opened = p_share_opened, updated_at = v_now,
      revision = revision + 1, sent_at = case when p_send then v_now end
    where id = p_id returning * into v_letter;
    update private.letter_bodies set body = p_body where letter_id = p_id;
  else
    if p_expected is not null then raise exception '这封草稿已删除。' using errcode = '40001'; end if;
    insert into private.letter_envelopes(id, author_id, recipient_id, title, theme, unlock_at, show_title, share_opened, sent_at)
      values(p_id, v_member, p_recipient, btrim(p_title), p_theme, v_unlock, p_show_title, p_share_opened,
        case when p_send then v_now end) returning * into v_letter;
    insert into private.letter_bodies(letter_id, body) values(p_id, p_body);
  end if;
  perform private.letter_set_parts(p_id, p_assets);
  return private.letter_card(v_letter, v_member, v_now);
end $$;

create function public.letter_open(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_member uuid := auth.uid();
  v_letter private.letter_envelopes;
  v_body text;
  v_now timestamptz := statement_timestamp();
begin
  if not private.is_member() then raise insufficient_privilege; end if;
  select * into v_letter from private.letter_envelopes where id = p_id and recipient_id = v_member and sent_at is not null for update;
  if not found or v_letter.unlock_at > v_now then raise insufficient_privilege; end if;
  if v_letter.opened_at is null then
    update private.letter_envelopes set opened_at = v_now where id = p_id returning * into v_letter;
  end if;
  select body into v_body from private.letter_bodies where letter_id = p_id;
  return private.letter_card(v_letter, v_member, v_now) || jsonb_build_object('body', v_body, 'attachments', private.letter_parts(p_id));
end $$;

create function public.letter_favorite(p_id uuid, p_favorite boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_member uuid := auth.uid();
begin
  if not private.is_member() or not exists(
    select from private.letter_envelopes e where e.id = p_id and e.sent_at is not null and
      (e.author_id = v_member or (e.recipient_id = v_member and e.opened_at is not null))
  ) then raise insufficient_privilege; end if;
  if p_favorite then
    insert into private.letter_favorites(letter_id, member_id) values(p_id, v_member) on conflict do nothing;
  else
    delete from private.letter_favorites where letter_id = p_id and member_id = v_member;
  end if;
end $$;

create function public.letter_discard(p_id uuid, p_expected integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_member() then raise insufficient_privilege; end if;
  update private.letter_envelopes set discarded = true
    where id = p_id and author_id = auth.uid() and sent_at is null and revision = p_expected;
  if not found then raise exception '草稿已寄出、修改或删除，请刷新。' using errcode = '40001'; end if;
  update private.letter_assets set position = null, discarded = true where letter_id = p_id;
  -- The client removes object bytes through Storage after this transaction.
  return (select coalesce(jsonb_agg(id), '[]'::jsonb) from private.letter_assets where letter_id = p_id);
end $$;

create function public.letter_cleanup(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_member() then raise insufficient_privilege; end if;
  return (select coalesce(jsonb_agg(a.id), '[]'::jsonb)
    from private.letter_assets a join private.letter_envelopes e on a.letter_id = e.id
    join storage.objects o on o.bucket_id = 'storybook-letters' and o.name = a.id::text
    where e.id = p_id and e.author_id = auth.uid() and a.discarded and a.position is null);
end $$;

revoke all on function private.letter_card(private.letter_envelopes, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.letter_list(text, integer), public.letter_status(), public.letter_detail(uuid),
  public.letter_archive(),
  public.letter_save(uuid, uuid, text, text, text, timestamp, boolean, boolean, boolean, integer, uuid[]),
  public.letter_open(uuid), public.letter_favorite(uuid, boolean), public.letter_discard(uuid, integer), public.letter_cleanup(uuid)
  from public, anon, authenticated;
grant execute on function public.letter_list(text, integer), public.letter_status(), public.letter_detail(uuid),
  public.letter_archive(),
  public.letter_save(uuid, uuid, text, text, text, timestamp, boolean, boolean, boolean, integer, uuid[]),
  public.letter_open(uuid), public.letter_favorite(uuid, boolean), public.letter_discard(uuid, integer), public.letter_cleanup(uuid)
  to authenticated;

commit;
