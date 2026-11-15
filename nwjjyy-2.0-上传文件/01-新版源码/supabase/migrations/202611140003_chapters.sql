begin;

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  cover_story_id uuid references public.stories(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index chapters_sequence on public.chapters(sort_order, created_at, id);

create table public.chapter_entries (
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  story_id uuid primary key references public.stories(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order between 0 and 10000)
);
create index entries_sequence on public.chapter_entries(chapter_id, sort_order, story_id);

create trigger chapters_touch before update on public.chapters
for each row execute function private.touch();

alter table public.chapters enable row level security;
alter table public.chapter_entries enable row level security;
revoke all on public.chapters, public.chapter_entries from public, anon, authenticated;
grant select on public.chapters, public.chapter_entries to authenticated;
grant insert (title, description, sort_order, cover_story_id),
      update (title, description, sort_order, cover_story_id), delete on public.chapters to authenticated;
grant insert (chapter_id, story_id, sort_order), update (chapter_id, sort_order), delete on public.chapter_entries to authenticated;
grant all on public.chapters, public.chapter_entries to service_role;

create policy chapter_read on public.chapters for select to authenticated
using ((select private.is_member()));
create policy chapter_manage on public.chapters for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create policy chapter_entry_read on public.chapter_entries for select to authenticated
using ((select private.is_member()) and exists (
  select 1 from public.stories
  where stories.id = story_id and status = 'published' and deleted_at is null
));
create policy chapter_entry_manage on public.chapter_entries for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

-- The chapter catalog derives its content and count from the caller's published stories.
create function public.chapter_directory() returns table (
  id uuid, title text, description text, sort_order integer, cover_story_id uuid,
  created_at timestamptz, updated_at timestamptz, story_count integer, cover_media_id uuid
)
language sql stable set search_path = ''
as $$
  select c.id, c.title, c.description, c.sort_order, c.cover_story_id, c.created_at, c.updated_at,
    (select count(*)::integer from public.chapter_entries e
     join public.stories s on s.id = e.story_id and s.status = 'published' and s.deleted_at is null
     where e.chapter_id = c.id),
    (select s.cover_media_id from public.chapter_entries e
     join public.stories s on s.id = e.story_id and s.status = 'published' and s.deleted_at is null
     join public.media m on m.id = s.cover_media_id and m.state = 'ready' and m.deleted_at is null
     where e.chapter_id = c.id
     order by (e.story_id = c.cover_story_id) desc nulls last, e.sort_order, s.event_date, e.story_id
     limit 1)
  from public.chapters c
  order by c.sort_order, c.created_at, c.id
$$;

create function public.chapter_stories(target uuid, start_at integer, limit_to integer)
returns setof public.stories
language sql stable set search_path = ''
as $$
  select s.* from public.chapter_entries e
  join public.stories s on s.id = e.story_id and s.status = 'published' and s.deleted_at is null
  where e.chapter_id = target
  order by e.sort_order, s.event_date, s.created_at, s.id
  offset greatest(start_at, 0) limit least(greatest(limit_to, 0), 50)
$$;

revoke all on function public.chapter_directory(), public.chapter_stories(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.chapter_directory(), public.chapter_stories(uuid, integer, integer) to authenticated;

commit;
