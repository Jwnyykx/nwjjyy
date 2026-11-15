begin;

create table public.photo_notes (
  media_id uuid primary key references public.media(id) on delete cascade,
  place text not null default '' check (char_length(place) <= 100),
  photographer text not null default '' check (char_length(photographer) <= 80),
  memory text not null default '' check (char_length(memory) <= 1500),
  message text not null default '' check (char_length(message) <= 300)
);

create table public.footprints (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.members(id),
  city text not null check (char_length(btrim(city)) between 1 and 80),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  note text not null default '' check (char_length(note) <= 1500),
  arrival date not null,
  departure date,
  story_id uuid references public.stories(id) on delete set null,
  check (departure is null or departure >= arrival)
);
create index footprints_arrival on public.footprints (arrival desc, id);

alter table public.photo_notes enable row level security;
alter table public.footprints enable row level security;
revoke all on public.photo_notes, public.footprints from public, anon, authenticated;
grant select, delete on public.photo_notes, public.footprints to authenticated;
grant insert (media_id, place, photographer, memory, message),
  update (place, photographer, memory, message) on public.photo_notes to authenticated;
grant insert (id, city, title, note, arrival, departure, story_id),
  update (city, title, note, arrival, departure, story_id) on public.footprints to authenticated;
grant all on public.photo_notes, public.footprints to service_role;

create policy photo_notes_visible on public.photo_notes for select to authenticated using (
  exists(select 1 from public.media m where m.id = media_id and m.media_type = 'image'
    and m.state = 'ready' and m.deleted_at is null)
);
create policy photo_notes_edit on public.photo_notes for all to authenticated using (
  exists(select 1 from public.media m where m.id = media_id and m.media_type = 'image'
    and m.state = 'ready' and m.deleted_at is null and private.manages_media(m.created_by, m.story_id, m.diary_id))
) with check (
  exists(select 1 from public.media m where m.id = media_id and m.media_type = 'image'
    and m.state = 'ready' and m.deleted_at is null and private.manages_media(m.created_by, m.story_id, m.diary_id))
);
create policy footprints_visible on public.footprints for select to authenticated using ((select private.is_member()));
create policy footprints_create on public.footprints for insert to authenticated with check (
  (select private.is_member()) and author_id = (select auth.uid()) and
  (story_id is null or exists(select 1 from public.stories s where s.id = story_id and s.status='published' and s.deleted_at is null))
);
create policy footprints_edit on public.footprints for update to authenticated using (private.manages(author_id))
with check (private.manages(author_id) and
  (story_id is null or exists(select 1 from public.stories s where s.id = story_id and s.status='published' and s.deleted_at is null)));
create policy footprints_remove on public.footprints for delete to authenticated using (private.manages(author_id));

alter table public.storybook_settings add column nfc_story_id uuid references public.stories(id) on delete set null;
grant update (nfc_story_id) on public.storybook_settings to authenticated;

alter table public.media drop constraint media_check1;
alter table public.media add constraint media_format check (
    (media_type = 'image' and content_type in ('image/jpeg', 'image/png', 'image/webp') and preview_size > 0)
    or (media_type = 'audio' and story_id is not null and preview_size = 0
        and content_type in ('audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg'))
);
update storage.buckets set allowed_mime_types = array_append(array_append(allowed_mime_types,'audio/webm'),'audio/ogg')
where id = 'storybook-private';

commit;
