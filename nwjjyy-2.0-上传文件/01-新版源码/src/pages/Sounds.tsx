import { useState } from 'react'
import { AudioLines } from 'lucide-react'
import { Link } from 'react-router'
import { useBook } from '../book-context'
import { dateLabel } from '../data/dates'
import { soundShelf } from '../data/world'
import { useLoad } from '../hooks'
import { Empty, Feedback, PageHeading } from '../ui/feedback'
import { Pagination } from '../ui/filters'
import { PrivateAudio } from '../ui/media'

export default function Sounds() {
  const { members, categories } = useBook()
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(0)
  const result = useLoad(category + ':' + page, () => soundShelf(page, category))
  return <div className="page sound-page">
    <PageHeading title="声音邮局" intro="把想再听一次的声音留在故事里。"
      action={<Link className="button secondary" to="/edit/story/new"><AudioLines size={17} />写故事并添加录音</Link>} />
    <div className="filter-panel"><label>声音分类<select value={category} onChange={event => { setCategory(event.target.value); setPage(0) }}>
      <option value="">所有声音</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label></div>
    <Feedback loading={result.loading} error={result.error} retry={result.reload} />
    {result.data?.rows.length === 0 && <Empty title="这里还没有声音">打开故事的编辑页，就能上传录音或用麦克风直接录制。</Empty>}
    <div className="form-stack">{result.data?.rows.map(item => <article className="panel" key={item.id}>
      <div className="metadata"><time dateTime={item.event_date}>{dateLabel(item.event_date)}</time>
        <span>{members.find(member => member.id === item.created_by)?.display_name ?? '成员'}</span></div>
      <PrivateAudio item={item} />
      {item.story_id && <Link className="text-button" to={'/stories/' + item.story_id}>回到收录它的故事</Link>}
    </article>)}</div>
    {result.data && <Pagination page={page} next={result.data.next} go={setPage} />}
  </div>
}
