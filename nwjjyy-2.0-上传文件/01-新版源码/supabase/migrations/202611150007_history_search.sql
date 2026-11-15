begin;

create table public.story_revisions (
  story_id uuid not null references public.stories(id) on delete cascade,
  revision integer not null,
  editor_id uuid references public.members(id),
  saved_at timestamptz not null default clock_timestamp(),
  snapshot jsonb not null,
  primary key (story_id, revision)
);
alter table public.story_revisions enable row level security;
revoke all on public.story_revisions from public, anon, authenticated;
grant select on public.story_revisions to authenticated;
grant all on public.story_revisions to service_role;
create policy story_revisions_read on public.story_revisions for select to authenticated using (private.can_manage_story(story_id));

create function private.story_text(document public.stories) returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object('title', document.title, 'summary', document.summary, 'body', document.body, 'event_date', document.event_date,
    'category_id', document.category_id, 'location', document.location, 'weather', document.weather)
$$;
insert into public.story_revisions(story_id, revision, saved_at, snapshot)
select id, revision, updated_at, private.story_text(s) from public.stories s;

create function private.remember_story() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and
    (tg_op = 'INSERT' or private.story_text(new) is distinct from private.story_text(old)) then
    insert into public.story_revisions(story_id, revision, editor_id, snapshot)
    values(new.id, new.revision, (select auth.uid()), private.story_text(new));
  end if;
  return new;
end
$$;
revoke all on function private.story_text(public.stories), private.remember_story() from public, anon, authenticated;
create trigger story_history after insert or update on public.stories for each row execute function private.remember_story();

create function public.restore_story_text(target uuid, previous integer, expected integer) returns integer
language plpgsql set search_path = ''
as $$
declare fields jsonb;
declare saved integer;
begin
  select snapshot into fields from public.story_revisions where story_id=target and revision=previous;
  if not found then raise exception '找不到有权限恢复的版本。' using errcode = '42501'; end if;
  update public.stories set title=fields->>'title', summary=fields->>'summary', body=fields->>'body',
    event_date=(fields->>'event_date')::date, category_id=(fields->>'category_id')::uuid,
    location=fields->>'location', weather=fields->>'weather'
  where id=target and revision=expected and deleted_at is null returning revision into saved;
  if not found then raise exception '故事已有新修改，请刷新后再恢复。' using errcode = '40001'; end if;
  return saved;
end
$$;
revoke all on function public.restore_story_text(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.restore_story_text(uuid,integer,integer) to authenticated;

create function public.search_book(term text, from_date date, to_date date, category_filter uuid, start_at integer default 0)
returns table (
  kind text, item_id uuid, title text, excerpt text, recorded_on date
) language sql stable set search_path = ''
as $$
  with keyword as (select lower(left(btrim(coalesce(term,'')),100)) q),
  entries as (
    select 'story'::text as kind, s.id, s.title,
      concat_ws(' ', s.summary, s.location, s.event_date::text, c.name, s.body) as copy, s.event_date as stamp, s.category_id as category
    from public.stories s left join public.categories c on c.id=s.category_id
    where s.status='published' and s.deleted_at is null and not s.is_hidden
    union all
    select 'diary', d.id, '心动日记', concat_ws(' ',d.event_date::text,d.mood,d.body), d.event_date, null
    from public.diaries d where d.status='published' and d.deleted_at is null
    union all
    select 'photo', (a.item).id, coalesce(nullif((a.item).caption,''),'相册照片'),
      concat_ws(' ',a.album_date::text,n.place,n.photographer,n.memory,n.message), a.album_date, a.category_id
    from private.album_rows() a left join public.photo_notes n on n.media_id=(a.item).id
    union all
    select 'chapter', c.id, c.title, c.description, null, null from public.chapters c
    union all
    select 'trip', f.id, f.title, concat_ws(' ',f.city,f.arrival::text,f.note), f.arrival, null from public.footprints f
  )
  select e.kind,e.id,e.title, substring(e.copy from greatest(1,strpos(lower(e.copy),k.q)-28) for 160),e.stamp
  from entries e cross join keyword k
  where k.q <> '' and (strpos(lower(e.title),k.q) > 0 or strpos(lower(e.copy),k.q) > 0)
    and (from_date is null or e.stamp >= from_date) and (to_date is null or e.stamp <= to_date)
    and (category_filter is null or e.category=category_filter)
  order by e.stamp desc nulls last,e.kind,e.id offset greatest(0,start_at) limit 13
$$;
revoke all on function public.search_book(text,date,date,uuid,integer) from public, anon, authenticated;
grant execute on function public.search_book(text,date,date,uuid,integer) to authenticated;

create function public.sound_index(from_category uuid, start_at integer, limit_to integer) returns setof public.media
language sql stable set search_path = ''
as $$
  select m.* from public.media m join public.stories s on s.id=m.story_id
  where m.media_type='audio' and m.state='ready' and m.deleted_at is null
    and s.status='published' and s.deleted_at is null and not s.is_hidden
    and (from_category is null or s.category_id=from_category)
  order by s.event_date desc,m.sort_order,m.id offset greatest(start_at,0) limit least(greatest(limit_to,0),50)
$$;
revoke all on function public.sound_index(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.sound_index(uuid,integer,integer) to authenticated;

commit;
