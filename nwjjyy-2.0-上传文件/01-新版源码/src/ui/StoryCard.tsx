import { ArrowUpRight, BookOpen } from 'lucide-react'
import { Link } from 'react-router'
import { useBook } from '../book-context'
import { dateLabel } from '../data/dates'
import type { Media, StoryCard as StoryCardData } from '../data/types'
import { PrivateImage } from './media'

export function StoryCard({ story, cover, compact = false }: { story: StoryCardData; cover?: Media; compact?: boolean }) {
  const { members, categories } = useBook()
  const author = members.find(member => member.id === story.author_id)?.display_name ?? '成员'
  const category = categories.find(value => value.id === story.category_id)?.name
  return <Link to={'/stories/' + story.id} className={'story-card' + (compact ? ' compact' : '')}>
    <div className="story-card-image">
      {cover ? <PrivateImage item={cover} /> : <div className="story-paper"><BookOpen size={30} strokeWidth={1} /></div>}
    </div>
    <div className="story-card-body">
      <div className="metadata"><time dateTime={story.event_date}>{dateLabel(story.event_date)}</time>{category && <span>{category}</span>}</div>
      <h3>{story.title}</h3>{story.summary && <p>{story.summary}</p>}
      <span className="story-card-foot"><span>{author}</span><span>阅读全文 <ArrowUpRight size={15} /></span></span>
    </div>
  </Link>
}
