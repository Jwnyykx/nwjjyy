import { lazy, Suspense, useState } from 'react'
import { ArrowRight, Bookmark, BookOpen, CalendarDays, Mail, PenLine, Quote, Shuffle } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useBook } from '../book-context'
import { homeContent, randomMemory, readingHistory } from '../data/book'
import { errorMessage } from '../data/client'
import { useReader } from '../data/reader'
import { anniversaryDays, dateLabel, todayIn } from '../data/dates'
import type { Anniversary } from '../data/types'
import { useLoad } from '../hooks'
import { Empty, Feedback } from '../ui/feedback'
import { PrivateImage } from '../ui/media'
import { StoryCard } from '../ui/StoryCard'
import cover from '../assets/story-cover.webp'

const Bunny = lazy(() => import('../ui/Bunny').then(module => ({ default: module.Bunny })))

export function AnniversaryCard({ item, zone }: { item: Anniversary; zone: string }) {
  const { elapsed, remaining } = anniversaryDays(item.event_date, todayIn(zone))
  return <div className="anniversary-card"><CalendarDays size={22} strokeWidth={1.5} /><div>
    <h3>{item.title}</h3><time dateTime={item.event_date}>{dateLabel(item.event_date)}</time>
  </div><div className="anniversary-counter"><strong>{Math.abs(elapsed)}</strong><span>{elapsed >= 0 ? '天一起走过' : '天后开始'}</span>
    {item.show_countdown && elapsed >= 0 && <small>{remaining ? '下次周年还有 ' + remaining + ' 天' : '今天是纪念日'}</small>}</div></div>
}

export default function Home() {
  const { member, settings, members } = useBook()
  const location = useLocation()
  const navigate = useNavigate()
  const { recent } = useReader()
  const history = useLoad(recent.join(','), () => readingHistory(recent))
  const content = useLoad('home:' + settings.updated_at, () => homeContent(settings.cover_media_id))
  const [showBunny, setShowBunny] = useState(false)
  const [turning, setTurning] = useState(false)
  const [turnError, setTurnError] = useState('')
  const data = content.data
  const memorable = data?.anniversaries.find(item => {
    const days = anniversaryDays(item.event_date, todayIn(settings.time_zone))
    return days.elapsed >= 0 && days.remaining === 0
  })
  const customCover = settings.cover_media_id ? data?.covers[settings.cover_media_id] : undefined
  const last = history.data?.[0]
  async function surprise() {
    if (turning) return
    setTurning(true)
    setTurnError('')
    try {
      const id = await randomMemory(last?.id) ?? last?.id
      if (id) await navigate('/stories/' + id)
      else setTurnError('写下第一篇故事后，就可以随机翻开一页。')
    } catch (error) {
      setTurnError(errorMessage(error))
    } finally {
      setTurning(false)
    }
  }
  return <div className="page home-page">
    {typeof location.state?.notice === 'string' && <p className="notice" role="status">{location.state.notice}</p>}
    <section className="private-hero book-front">
      <div><h1>{settings.home_subtitle === '我们的故事，未完待续。'
        ? <>我们的故事，<br />未完待续。</> : settings.home_subtitle}</h1><p>{settings.home_intro}</p>
        <div className="actions">
          <Link className="button" to="/stories?view=chapters"><BookOpen size={17} />打开目录</Link>
          <Link className="text-button" to="/edit/story/new"><PenLine size={16} />写下今天</Link>
        </div>
      </div>
      <figure>{customCover ? <PrivateImage item={customCover} eager alt="故事书的私人封面" />
        : <img src={cover} alt="阳光下的布面故事书" width={1040} height={1300} />}</figure>
    </section>
    {memorable && <div className="notice anniversary-strip"><CalendarDays size={18} />今天是「{memorable.title}」</div>}
    <nav className="reading-doors" aria-label="故事书快捷入口">
      {last && <Link to={'/stories/' + last.id}><BookOpen size={19} /><span>上次读到<strong>{last.title}</strong></span><ArrowRight size={16} /></Link>}
      {settings.enable_shuffle && <button type="button" onClick={() => void surprise()} disabled={turning}><Shuffle size={19} />
        <span><strong>{turning ? '翻页中…' : '随机翻开一页'}</strong></span><ArrowRight size={16} /></button>}
      <Link to="/stories?view=saved"><Bookmark size={19} /><span><strong>我的收藏</strong></span><ArrowRight size={16} /></Link>
      <Link to="/letters"><Mail size={19} /><span><strong>写给你的信</strong></span><ArrowRight size={16} /></Link>
    </nav>
    <Feedback error={turnError} />
    <Feedback loading={content.loading} error={content.error} retry={content.reload} />
    {data && <>
      <section className="home-section">
        <div className="section-heading"><h2>我们的故事正在继续</h2><Link to="/stories" className="text-button">全部故事 <ArrowRight size={16} /></Link></div>
        {data.recent.length ? <div className="card-grid">{data.recent.map(story => <StoryCard key={story.id} story={story}
          cover={story.cover_media_id ? data.covers[story.cover_media_id] : undefined} />)}</div>
          : <Empty title="我们的第一篇故事，还没有写下。"
            action={<Link className="button secondary" to="/edit/story/new">写下第一篇</Link>}>从今天一件想记住的小事开始。</Empty>}
      </section>
      {data.pinned.length > 0 && <section className="home-section">
        <div className="section-heading"><h2>精选回忆</h2></div>
        <div className="card-grid">{data.pinned.map(story => <StoryCard key={story.id} story={story}
          cover={story.cover_media_id ? data.covers[story.cover_media_id] : undefined} />)}</div>
      </section>}
      <section className="home-section home-notes">
        <div><div className="section-heading"><h2>我们的时间</h2>{member.role === 'admin' && <Link to="/settings" className="text-button">设置纪念日</Link>}</div>
          {data.anniversaries.length
            ? data.anniversaries.map(item => <AnniversaryCard key={item.id} item={item} zone={settings.time_zone} />)
            : <div className="quiet-card"><CalendarDays size={20} strokeWidth={1.4} /><p>给一个特别的日子留个位置。</p></div>}
        </div>
        <div><div className="section-heading"><h2>最新的一句话</h2><Link to="/diary" className="text-button">翻开日记</Link></div>
          <div className="quiet-card quote-card"><Quote size={20} strokeWidth={1.4} />
            {data.diary ? <><p>{data.diary.body.slice(0, 160)}{data.diary.body.length > 160 ? '…' : ''}</p>
              <span>{members.find(item => item.id === data.diary?.author_id)?.display_name} · {dateLabel(data.diary.event_date)}</span></>
              : <p>等你把想说的话留在这里。</p>}
          </div>
        </div>
      </section>
    </>}
    {settings.show_bunny && (showBunny ? <Suspense fallback={<Feedback loading />}><Bunny /></Suspense>
      : <div className="bunny-entry"><button className="text-button" onClick={() => setShowBunny(true)}>书页里的小伙伴</button></div>)}
    <div className="bunny-entry"><Link className="text-button" to="/post">去小兔子的邮局 <ArrowRight size={16} /></Link></div>
  </div>
}
