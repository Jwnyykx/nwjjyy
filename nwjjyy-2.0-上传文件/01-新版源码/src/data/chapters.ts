import { CARD_COLUMNS, mediaById, PAGE_SIZE } from './book'
import { db, unwrap } from './client'

export type ChapterFields = {
  title: string
  description: string
  sort_order: number
  cover_story_id: string | null
}

const displayable = () => db().from('stories').select(CARD_COLUMNS)
  .eq('status', 'published').is('deleted_at', null)

export async function chapterDirectory() {
  const rows = unwrap(await db().rpc('chapter_directory')) ?? []
  return { rows, covers: await mediaById(rows.map(row => row.cover_media_id)) }
}

export async function chapterPage(target: string, page: number) {
  const result = await db().rpc('chapter_stories', {
    target, start_at: page * PAGE_SIZE, limit_to: PAGE_SIZE + 1,
  }).select(CARD_COLUMNS)
  const all = unwrap(result) ?? []
  const rows = all.slice(0, PAGE_SIZE)
  return { rows, next: all.length > PAGE_SIZE, covers: await mediaById(rows.map(row => row.cover_media_id)) }
}

export async function chapterEntries(chapter: string, page: number) {
  const all = unwrap(await db().from('chapter_entries').select('*').eq('chapter_id', chapter)
    .order('sort_order').order('story_id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) ?? []
  const entries = all.slice(0, PAGE_SIZE)
  const ids = entries.map(entry => entry.story_id)
  const stories = ids.length > 0
    ? unwrap(await db().from('stories').select('id,title,status,deleted_at,cover_media_id').in('id', ids)) ?? [] : []
  const byId = new Map(stories.map(story => [story.id, story]))
  return { rows: entries.map(entry => ({ ...entry, story: byId.get(entry.story_id) })), next: all.length > PAGE_SIZE }
}

export async function chapterChoices(term: string) {
  let query = displayable()
  const search = term.trim().replace(/[\\%_*]/g, value => '\\' + value)
  if (search) query = query.ilike('search_text', '%' + search + '%')
  const stories = unwrap(await query.order('event_date', { ascending: false }).order('id').limit(30)) ?? []
  const ids = stories.map(story => story.id)
  const entries = ids.length > 0 ? unwrap(await db().from('chapter_entries').select('*').in('story_id', ids)) ?? [] : []
  const byStory = new Map(entries.map(entry => [entry.story_id, entry]))
  return stories.map(story => ({ ...story, entry: byStory.get(story.id) }))
}

export async function saveChapter(fields: ChapterFields, id?: string) {
  const query = id ? db().from('chapters').update(fields).eq('id', id) : db().from('chapters').insert(fields)
  const chapter = unwrap(await query.select().single())
  if (!chapter) throw new Error('保存后未能读回章节。')
  return chapter
}

export async function assignChapterStory(storyId: string, chapter: string, replace: boolean) {
  const query = replace
    ? db().from('chapter_entries').update({ chapter_id: chapter, sort_order: 10000 }).eq('story_id', storyId)
    : db().from('chapter_entries').insert({ story_id: storyId, chapter_id: chapter, sort_order: 10000 })
  return unwrap(await query.select().single())
}
