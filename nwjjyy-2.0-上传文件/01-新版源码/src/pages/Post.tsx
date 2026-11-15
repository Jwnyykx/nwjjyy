import { lazy, Suspense, useState } from 'react'
import { ArrowUpRight, BookOpen, Clock, Mail, Shuffle } from 'lucide-react'
import { Link } from 'react-router'
import { useBook } from '../book-context'
import { homeContent } from '../data/book'
import { letterNotices } from '../data/letters'
import { useLoad } from '../hooks'
import { Feedback, PageHeading } from '../ui/feedback'
import './world.css'

const Bunny = lazy(() => import('../ui/Bunny').then(module => ({ default: module.Bunny })))

export default function Post() {
  const { settings } = useBook()
  const [open, setOpen] = useState(true)
  const status = useLoad('post-status:' + settings.show_post_notices, () => settings.show_post_notices ? letterNotices() : Promise.resolve(null))
  const memory = useLoad('post-memory', () => homeContent(null))
  const first = memory.data?.recent[0]
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: settings.time_zone, hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  return <section className="page narrow-page">
    <PageHeading title="小兔子邮差" intro="来看看故事书里有什么新消息。" />
    {settings.show_bunny && <div className="post-station" data-night={hour > 18 || hour < 6}>
      <Suspense fallback={<Feedback loading />}><Bunny /></Suspense>
      <button className="button secondary small" type="button" aria-expanded={open} aria-controls="bunny-inbox"
        onClick={() => setOpen(value => !value)}>{open ? '收好邮差的信包' : '打开邮差的信包'}</button>
    </div>}
    <Feedback loading={status.loading} error={status.error} retry={status.reload} />
    <div className="contents-list" id="bunny-inbox" hidden={!open && settings.show_bunny}>
      <Link to="/letters?box=inbox"><Mail size={19} /><span>{status.data?.unread ? status.data.unread + ' 封新信' : '去信箱看看'}</span><ArrowUpRight size={16} /></Link>
      {Boolean(status.data?.unlocked) && <Link to="/letters?box=inbox"><Clock size={19} /><span>{status.data?.unlocked} 份时间胶囊可以打开了</span><ArrowUpRight size={16} /></Link>}
      {first && <Link to={'/stories/' + first.id}><BookOpen size={19} /><span>最新故事 · {first.title}</span><ArrowUpRight size={16} /></Link>}
      {settings.enable_shuffle && <Link to="/memory"><Shuffle size={19} /><span>随机翻开一页</span><ArrowUpRight size={16} /></Link>}
    </div>
  </section>
}
