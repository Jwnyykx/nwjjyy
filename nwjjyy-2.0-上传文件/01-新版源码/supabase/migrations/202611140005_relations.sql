begin;

alter table public.perspectives add column created_at timestamptz;
alter table public.perspectives disable trigger perspectives_touch;
update public.perspectives set created_at = updated_at;
alter table public.perspectives enable trigger perspectives_touch;
alter table public.perspectives alter column created_at set default now(), alter column created_at set not null;

create table public.story_relations (
  story_id uuid not null references public.stories(id) on delete cascade,
  related_story_id uuid not null references public.stories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, related_story_id),
  check (story_id <> related_story_id)
);
create index story_relations_target on public.story_relations(related_story_id);

alter table public.story_relations enable row level security;
revoke all on public.story_relations from public, anon, authenticated;
grant select, delete on public.story_relations to authenticated;
grant insert (story_id, related_story_id) on public.story_relations to authenticated;
grant all on public.story_relations to service_role;

-- Follow the source story's read policy; linked stories must be published and in the book.
-- A source editor can remove an association after a linked story becomes unavailable.
create policy story_relations_read on public.story_relations for select to authenticated
using (
  private.can_manage_story(story_id) or (
    private.can_read_story(story_id) and exists (
      select 1 from public.stories target where target.id = related_story_id
      and target.status = 'published' and target.deleted_at is null
    )
  )
);
create policy story_relations_add on public.story_relations for insert to authenticated
with check (
  private.can_manage_story(story_id) and exists (
    select 1 from public.stories target where target.id = related_story_id
    and target.status = 'published' and target.deleted_at is null
  )
);
create policy story_relations_remove on public.story_relations for delete to authenticated
using (private.can_manage_story(story_id));

commit;
