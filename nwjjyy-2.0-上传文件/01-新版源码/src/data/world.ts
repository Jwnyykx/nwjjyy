import { CARD_COLUMNS, mediaById, readingHistory } from './book'
import { db, unwrap } from './client'
import type { Footprint, PhotoNote } from './types'

export async function fetchPhotoNote(mediaId: string) {
  return unwrap(await db().from('photo_notes').select('*').eq('media_id', mediaId).maybeSingle())
}

export async function savePhotoNote(mediaId: string, fields: Omit<PhotoNote, 'media_id'>, exists: boolean) {
  if (exists) return unwrap(await db().from('photo_notes').update(fields).eq('media_id', mediaId).select().single())
  return unwrap(await db().from('photo_notes').insert({ media_id: mediaId, ...fields }).select().single())
}

export async function publishedOptions(includeHidden = false) {
  const query = db().from('stories').select(CARD_COLUMNS).eq('status', 'published').is('deleted_at', null)
  return unwrap(await (includeHidden ? query : query.eq('is_hidden', false)).order('event_date', { ascending: false }).limit(100)) ?? []
}

export async function footprintList(id?: string) {
  let query = db().from('footprints').select('*').order('arrival', { ascending: false }).order('id')
  if (id) query = query.eq('id', id)
  const rows = unwrap(await query.limit(200)) ?? []
  const entries = rows.length ? unwrap(await db().from('trip_entries').select('*').in('footprint_id', rows.map(row => row.id))) ?? [] : []
  const ids = [...new Set([...rows.flatMap(row => row.story_id ? [row.story_id] : []), ...entries.map(row => row.story_id)])]
  // Stay within URL limits on hosts using the REST API.
  const linked = (await Promise.all(Array.from({ length: Math.ceil(ids.length / 80) }, (_, i) =>
    readingHistory(ids.slice(i * 80, (i + 1) * 80))))).flat()
  const photos = id ? await mediaById(linked.map(story => story.cover_media_id)) : {}
  return { rows, entries, stories: new Map(linked.map(story => [story.id, story])), photos }
}

export async function saveFootprint(fields: Pick<Footprint, 'title' | 'city' | 'note' | 'arrival' | 'departure'>, id: string, linked: string[]) {
  return unwrap(await db().rpc('save_trip', { target: id, fields, linked }))
}

export async function soundShelf(page: number, categoryId: string) {
  const chunk = 12
  const records = unwrap(await db().rpc('sound_index', {
    from_category: categoryId || null, start_at: page * chunk, limit_to: chunk + 1,
  })) ?? []
  return { rows: records.slice(0, chunk), next: records.length > chunk }
}
