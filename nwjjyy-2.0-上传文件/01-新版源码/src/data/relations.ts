import { db, unwrap } from './client'

type StorySearchResult = { id: string; title: string; event_date: string }

export async function storyRelations(id: string) {
  const links = unwrap(await db().from('story_relations').select('related_story_id,created_at')
    .eq('story_id', id).order('created_at').order('related_story_id')) ?? []
  if (!links.length) return []
  const visible = new Map<string, StorySearchResult>()
  // Keep URL sizes below typical gateway limits even when an older story has many links.
  for (let offset = 0; offset < links.length; offset += 40) {
    const group = links.slice(offset, offset + 40).map(link => link.related_story_id)
    const matches = unwrap(await db().from('stories').select('id,title,event_date')
      .in('id', group).eq('status', 'published').is('deleted_at', null).eq('is_hidden', false)) ?? []
    for (const match of matches) visible.set(match.id, match)
  }
  return links.map(link => ({
    id: link.related_story_id,
    story: visible.get(link.related_story_id),
  }))
}

export async function findRelatedStories(source: string, query: string) {
  const keyword = query.trim().replace(/[\\%_*]/g, character => '\\' + character)
  let request = db().from('stories').select('id,title,event_date')
    .neq('id', source).eq('status', 'published').is('deleted_at', null)
  if (keyword) request = request.ilike('title', '%' + keyword + '%')
  return unwrap(await request.order('event_date', { ascending: false }).order('id').limit(30)) ?? []
}

export async function linkStory(source: string, target: string) {
  unwrap(await db().from('story_relations').insert({ story_id: source, related_story_id: target }).select('story_id').single())
}

export async function unlinkStory(source: string, target: string) {
  unwrap(await db().from('story_relations').delete().eq('story_id', source).eq('related_story_id', target)
    .select('story_id').maybeSingle())
}
