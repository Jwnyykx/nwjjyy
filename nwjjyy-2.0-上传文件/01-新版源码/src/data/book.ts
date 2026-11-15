import { db, unwrap } from './client'
import { dateRange } from './dates'
import type { BookTables, DiaryFields, Media, MediaOrder, NewMedia, StoryFields } from './types'

export const CARD_COLUMNS = 'id,author_id,title,event_date,category_id,summary,location,weather,status,is_pinned,is_hidden,cover_media_id,created_at,updated_at,published_at,deleted_at,revision'
export const PAGE_SIZE = 12

export async function directory() {
  const [members, categories, settings] = await Promise.all([
    db().from('members').select('*').order('role'),
    db().from('categories').select('*').order('name'),
    db().from('storybook_settings').select('*').eq('id', 1).single(),
  ])
  const book = unwrap(settings)
  if (!book) throw new Error('故事书缺少首页配置，请联系管理员。')
  return { members: unwrap(members) ?? [], categories: unwrap(categories) ?? [], settings: book }
}

function publishedStories(includeHidden = false) {
  const query = db().from('stories').select(CARD_COLUMNS).eq('status', 'published').is('deleted_at', null)
  return includeHidden ? query : query.eq('is_hidden', false)
}

export type Filters = { year: string; month: string; category: string; newest: boolean; pinned: boolean; search: string }
export const emptyFilters: Filters = { year: '', month: '', category: '', newest: true, pinned: false, search: '' }

export async function timeline(filters: Filters, page: number, ids?: string[]) {
  if (ids?.length === 0) return { rows: [], next: false, covers: {} as Record<string, Media> }
  let query = publishedStories()
  if (ids) query = query.in('id', ids)
  const range = dateRange(filters.year, filters.month)
  if (range) query = query.gte('event_date', range.start).lte('event_date', range.end)
  if (filters.category) query = query.eq('category_id', filters.category)
  if (filters.pinned) query = query.eq('is_pinned', true)
  const term = filters.search.trim()
  if (term) query = query.ilike('search_text', '%' + term.replace(/[\\%_*]/g, character => '\\' + character) + '%')
  const result = await query.order('event_date', { ascending: !filters.newest })
    .order('created_at', { ascending: !filters.newest }).order('id', { ascending: !filters.newest })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const cards = unwrap(result) ?? []
  const rows = cards.slice(0, PAGE_SIZE)
  return { rows, next: cards.length > PAGE_SIZE, covers: await mediaById(rows.map(row => row.cover_media_id)) }
}

export async function readingHistory(ids: string[], includeHidden = false) {
  if (!ids.length) return []
  const results = unwrap(await publishedStories(includeHidden).in('id', ids)) ?? []
  const byId = new Map(results.map(story => [story.id, story]))
  return ids.flatMap(id => byId.get(id) ?? [])
}

export async function randomMemory(exclude?: string) {
  const request = () => {
    const query = publishedStories()
    return exclude ? query.neq('id', exclude) : query
  }
  let counter = db().from('stories').select('id', { count: 'exact', head: true })
    .eq('status', 'published').is('deleted_at', null).eq('is_hidden', false)
  if (exclude) counter = counter.neq('id', exclude)
  const pool = await counter
  unwrap(pool)
  if (!pool.count) return null
  const index = Math.floor(Math.random() * pool.count)
  const rows = unwrap(await request().order('id').range(index, index))
  return rows?.[0]?.id ?? null
}

export async function mediaById(ids: (string | null)[]) {
  const valid = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (!valid.length) return {}
  const items = unwrap(await db().from('media').select('*').in('id', valid)
    .eq('state', 'ready').is('deleted_at', null)) ?? []
  return Object.fromEntries(items.map(item => [item.id, item])) as Record<string, Media>
}

export async function homeContent(coverId: string | null) {
  const [latest, featured, anniversaries, diary] = await Promise.all([
    publishedStories().order('published_at', { ascending: false }).limit(3),
    publishedStories().eq('is_pinned', true).order('event_date', { ascending: false }).limit(3),
    db().from('anniversaries').select('*').eq('show_on_home', true).order('event_date'),
    db().from('diaries').select('*').eq('show_on_home', true).eq('status', 'published')
      .is('deleted_at', null).order('event_date', { ascending: false }).order('created_at', { ascending: false }).limit(1),
  ])
  const recent = unwrap(latest) ?? []
  const pinned = unwrap(featured) ?? []
  const covers = await mediaById([coverId, ...recent.map(row => row.cover_media_id), ...pinned.map(row => row.cover_media_id)])
  return { recent, pinned, covers, anniversaries: unwrap(anniversaries) ?? [], diary: unwrap(diary)?.[0] ?? null }
}

export async function relatedMedia(parent: 'story_id' | 'diary_id', id: string) {
  return unwrap(await db().from('media').select('*').eq(parent, id).eq('state', 'ready')
    .is('deleted_at', null).order('sort_order').order('id')) ?? []
}

export async function storyDetail(id: string) {
  const story = unwrap(await db().from('stories').select('*').eq('id', id).is('deleted_at', null).maybeSingle())
  if (!story) return null
  const [media, perspectives, previous, next] = await Promise.all([
    relatedMedia('story_id', id),
    db().from('perspectives').select('*').eq('story_id', id).order('updated_at'),
    publishedStories().lt('event_date', story.event_date).order('event_date', { ascending: false })
      .order('created_at', { ascending: false }).limit(1),
    publishedStories().gt('event_date', story.event_date).order('event_date')
      .order('created_at').limit(1),
  ])
  const sameDate = story.status === 'published'
    ? unwrap(await publishedStories().eq('event_date', story.event_date).order('created_at').order('id')) ?? []
    : []
  const index = sameDate.findIndex(row => row.id === story.id)
  return {
    story, media, perspectives: unwrap(perspectives) ?? [],
    previous: (index > 0 ? sameDate[index - 1] : unwrap(previous)?.[0]) ?? null,
    next: (index >= 0 && index + 1 < sameDate.length ? sameDate[index + 1] : unwrap(next)?.[0]) ?? null,
  }
}

export function canEdit(member: { id: string; role: string }, ownerId: string) {
  return member.id === ownerId || member.role === 'admin'
}

export async function getOrCreateStory(id: string, fields: StoryFields) {
  const existing = unwrap(await db().from('stories').select('*').eq('id', id).maybeSingle())
  if (existing) return existing
  const { title, event_date, category_id, body, summary, location, weather } = fields
  return unwrap(await db().from('stories').insert({
    id, title, event_date, category_id, body, summary, location, weather,
  }).select().single())!
}

export async function getOrCreateDiary(id: string, fields: DiaryFields) {
  const existing = unwrap(await db().from('diaries').select('*').eq('id', id).maybeSingle())
  if (existing) return existing
  const { event_date, body, mood, show_on_home } = fields
  return unwrap(await db().from('diaries').insert({ id, event_date, body, mood, show_on_home }).select().single())!
}

export async function saveStory(id: string, revision: number, fields: StoryFields, items: MediaOrder[]) {
  return unwrap(await db().rpc('save_story', { target: id, expected: revision, fields, items }))
}

export async function saveDiary(id: string, revision: number, fields: DiaryFields, items: MediaOrder[]) {
  return unwrap(await db().rpc('save_diary', { target: id, expected: revision, fields, items }))
}

export type PendingSave = { kind: 'story'; fields: StoryFields; items: MediaOrder[] } |
  { kind: 'diary'; fields: DiaryFields; items: MediaOrder[] }

// Confirm a write whose response was lost without overwriting a newer revision.
export async function verifyPendingSave(id: string, revision: number, pending: PendingSave) {
  const story = pending.kind === 'story'
  const table = story ? 'stories' : 'diaries'
  const row = unwrap(await db().from(table).select('*').eq('id', id).is('deleted_at', null).maybeSingle())
  if (!row || row.revision !== revision + 1 ||
      !Object.entries(pending.fields).every(([key, value]) => Object.hasOwn(row, key) && Reflect.get(row, key) === value)) return null
  const media = await relatedMedia(story ? 'story_id' : 'diary_id', id)
  return media.length === pending.items.length && pending.items.every((item, i) =>
    media[i].id === item.id && media[i].caption === item.caption && media[i].sort_order === item.sort_order) ? row : null
}

export async function stageRow(row: NewMedia) {
  const existing = unwrap(await db().from('media').select('*').eq('id', row.id).maybeSingle())
  if (existing) {
    if (existing.state !== 'staged' || existing.deleted_at || existing.story_id !== row.story_id
        || existing.diary_id !== row.diary_id || existing.file_size !== row.file_size
        || existing.preview_size !== row.preview_size) {
      throw new Error('这份照片或录音的上传记录已更改。请移除后再选一次。')
    }
    return existing
  }
  return unwrap(await db().from('media').insert(row).select().single())!
}

export async function trashRecord(table: 'stories' | 'diaries' | 'promises' | 'media', id: string, restore = false) {
  const result = unwrap(await db().from(table).update({ deleted_at: restore ? null : new Date().toISOString() })
    .eq('id', id).select('id').maybeSingle())
  if (!result) throw new Error('这条记录已不存在，或你没有权限修改。')
}

async function pageAll<Name extends keyof BookTables>(table: Name, order: readonly string[]) {
  type Row = BookTables[Name]
  const entries: Row[] = []
  const step = 200
  for (let start = 0; ; start += step) {
    let request = db().from(table).select('*')
    for (const column of order) request = request.order(column)
    const rows = (unwrap(await request.range(start, start + step - 1)) ?? []) as unknown as Row[]
    entries.push(...rows)
    if (rows.length < step) return entries
  }
}

export async function backupContent() {
  const [members, categories, rawStories, diaries, media, promises, anniversaries, perspectives, storybook_settings,
    chapters, chapter_entries, photo_notes, footprints, story_relations, photo_collections, photo_collection_items, trip_entries, annual_books, story_revisions] =
    await Promise.all([
      pageAll('members', ['id']), pageAll('categories', ['id']), pageAll('stories', ['id']),
      pageAll('diaries', ['id']), pageAll('media', ['id']), pageAll('promises', ['id']),
      pageAll('anniversaries', ['id']), pageAll('perspectives', ['story_id', 'author_id']),
      pageAll('storybook_settings', ['id']),
      pageAll('chapters', ['id']), pageAll('chapter_entries', ['story_id']), pageAll('photo_notes', ['media_id']),
      pageAll('footprints', ['id']), pageAll('story_relations', ['story_id', 'related_story_id']),
      pageAll('photo_collections', ['id']), pageAll('photo_collection_items', ['collection_id', 'media_id']),
      pageAll('trip_entries', ['footprint_id', 'story_id']), pageAll('annual_books', ['year']),
      pageAll('story_revisions', ['story_id', 'revision']),
    ])
  const stories = rawStories.map(row => {
    const { search_text: _generated, ...story } = row as typeof row & { search_text?: string }
    return story
  })
  return {
    members, categories, stories, diaries, media: media.filter(item => item.state === 'ready'),
    promises, anniversaries, perspectives, storybook_settings, chapters, chapter_entries, photo_notes, footprints, story_relations,
    photo_collections, photo_collection_items, trip_entries, annual_books, story_revisions,
  }
}
