import { useState } from 'react'
import { ArrowRight, Bookmark, BookOpen, CalendarDays, Search, SquarePen, Star } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { useBook } from '../book-context'
import chapterCover from '../assets/story-cover.webp'
import { emptyFilters, timeline } from '../data/book'
import type { Filters } from '../data/book'
import { chapterDirectory, chapterPage } from '../data/chapters'
import { db, unwrap } from '../data/client'
import { dateLabel } from '../data/dates'
import { useReader } from '../data/reader'
import type { Media, StoryCard as Card } from '../data/types'
import { useLoad } from '../hooks'
import { Empty, Feedback } from '../ui/feedback'
import { Pagination } from '../ui/filters'
import { PrivateImage } from '../ui/media'
import './timeline.css'

const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i

function readFilters(params: URLSearchParams): Filters {
  const year = params.get('year') ?? ''
  const month = params.get('month') ?? ''
  const category = params.get('category') ?? ''
  const validYear = /^\d{4}$/.test(year) && year !== '0000' ? year : ''
  return {
    year: validYear,
    month: validYear && /^(0[1-9]|1[0-2])$/.test(month) ? month : '',
    category: uuid.test(category) ? category : '',
    newest: params.get('order') !== 'oldest',
    pinned: params.get('pinned') === '1',
    search: (params.get('q') ?? '').trim().slice(0, 120),
  }
}

function catalogueParams(filters: Filters, savedOnly: boolean, page: number) {
  const params = new URLSearchParams()
  if (savedOnly) params.set('view', 'saved')
  if (filters.year) params.set('year', filters.year)
  if (filters.month) params.set('month', filters.month)
  if (filters.category) params.set('category', filters.category)
  if (!filters.newest) params.set('order', 'oldest')
  if (filters.pinned) params.set('pinned', '1')
  if (filters.search) params.set('q', filters.search)
  if (page) params.set('page', String(page + 1))
  return params
}

function SearchForm({ value, onSearch }: { value: string; onSearch: (query: string) => void }) {
  const [search, setSearch] = useState(value)
  return <form className="search-form catalogue-search" role="search" aria-label="故事搜索" onSubmit={event => {
    event.preventDefault()
    onSearch(search.trim())
  }}>
    <label className="search-field"><Search size={18} aria-hidden="true" /><input type="search" aria-label="搜索故事" maxLength={120}
      placeholder="搜索标题、摘要或正文" value={search} onChange={event => setSearch(event.target.value)} /></label>
    <button type="submit" className="button secondary small">搜索</button>
  </form>
}

function TimelineCard({ story, cover, saved, toggle, from }: {
  story: Card; cover?: Media; saved: boolean; toggle: () => void; from: string
}) {
  const { members, categories } = useBook()
  const author = members.find(member => member.id === story.author_id)?.display_name ?? '成员'
  const category = categories.find(item => item.id === story.category_id)?.name
  const [year, month, day] = story.event_date.split('-')
  return <article className={'catalogue-card' + (cover ? ' has-cover' : '')}>
    <Link to={'/stories/' + story.id} state={{ returnTo: from }} className="catalogue-story-link" aria-label={'阅读《' + story.title + '》'}>
      {cover
        ? <div className="catalogue-photo"><PrivateImage item={cover} alt={cover.caption || ''} /></div>
        : <div className="catalogue-date-cover" aria-hidden="true"><div><span>{year} 年 {Number(month)} 月</span><strong>{day}</strong></div></div>}
      <div className="catalogue-card-copy">
        <div className="catalogue-card-meta"><time dateTime={story.event_date}>{dateLabel(story.event_date)}</time>
          {category && <span>{category}</span>}
          {story.is_pinned && <span className="catalogue-featured"><Star size={13} aria-hidden="true" />精选</span>}
        </div>
        <h3>{story.title}</h3>
        {story.summary && <p>{story.summary}</p>}
        <div className="catalogue-card-foot"><span>{author}</span><span>阅读全文 <ArrowRight size={15} aria-hidden="true" /></span></div>
      </div>
    </Link>
    <button type="button" className="catalogue-save icon-button" aria-pressed={saved}
      aria-label={(saved ? '取消收藏《' : '收藏《') + story.title + '》'} title={saved ? '取消收藏' : '收藏'}
      onClick={toggle}><Bookmark size={18} aria-hidden="true" fill={saved ? 'currentColor' : 'none'} /></button>
  </article>
}

function readPage(params: URLSearchParams) {
  return Math.min(1_000_000, Math.max(0, (/^\d+$/.test(params.get('page') ?? '') ? Number(params.get('page')) : 1) - 1))
}

function ChapterCatalogue({ chapterId, page }: { chapterId: string; page: number }) {
  const { member } = useBook()
  const reader = useReader()
  const from = useLocation()
  const [params, setParams] = useSearchParams()
  const directory = useLoad('chapter-directory', chapterDirectory)
  const chosen = directory.data?.rows.find(chapter => chapter.id === chapterId)
  const result = useLoad(chapterId + ':' + page, () => chapterId ? chapterPage(chapterId, page) : Promise.resolve(null))

  if (directory.loading || directory.error) return <Feedback loading={directory.loading} error={directory.error} retry={directory.reload} />
  if (chapterId && !chosen) return <Empty title="暂时找不到这一章。"
    action={<Link className="button secondary" to="/stories?view=chapters">返回章节目录</Link>} />
  if (!chapterId && !directory.data?.rows.length) return <Empty title="故事书还没有命名的章节。"
    action={<Link className="button secondary" to={member.role === 'admin' ? '/chapters' : '/stories'}>
      {member.role === 'admin' ? '添加第一个章节' : '按时间浏览'}</Link>}>
    已发布的故事可以在时间轴里读到。
  </Empty>

  if (chosen) {
    const cover = chosen.cover_media_id ? directory.data?.covers[chosen.cover_media_id] : undefined
    return <section aria-labelledby="chapter-title">
      <div className="chapter-reading-cover">
        {cover ? <PrivateImage item={cover} alt={cover.caption || ''} /> : <img src={chapterCover} alt="" />}
        <div><Link className="text-button" to="/stories?view=chapters">返回章节目录</Link>
          <h2 id="chapter-title">{chosen.title}</h2>
          {chosen.description && <p>{chosen.description}</p>}
          <small>{chosen.story_count} 篇故事</small>
        </div>
      </div>
      <Feedback loading={result.loading} error={result.error} retry={result.reload} />
      {result.data?.rows.length === 0 && <Empty title="这一章还没有已发布的故事。"
        action={member.role === 'admin' ? <Link className="button secondary" to={'/chapters?id=' + chosen.id}>管理这个章节</Link> : undefined} />}
      <div className="catalogue-cards">{result.data?.rows.map(story => <TimelineCard key={story.id} story={story}
        cover={story.cover_media_id ? result.data?.covers[story.cover_media_id] : undefined}
        saved={reader.saved.includes(story.id)} toggle={() => reader.toggle(story.id)} from={from.pathname + from.search} />)}</div>
      {result.data && <Pagination page={page} next={result.data.next} go={next => {
        const updated = new URLSearchParams(params)
        if (next) updated.set('page', String(next + 1))
        else updated.delete('page')
        setParams(updated)
        window.scrollTo(0, 0)
      }} />}
    </section>
  }
  return <section className="chapter-directory" aria-label="章节目录">
    {directory.data?.rows.map((chapter, index) => {
      const cover = chapter.cover_media_id ? directory.data?.covers[chapter.cover_media_id] : undefined
      return <Link key={chapter.id} to={'/stories?view=chapters&chapter=' + chapter.id} className="chapter-directory-card">
        <div className="chapter-directory-photo">{cover
          ? <PrivateImage item={cover} alt={cover.caption || ''} /> : <img src={chapterCover} alt="" loading="lazy" />}</div>
        <div className="chapter-directory-copy"><span className="chapter-number">第 {index + 1} 章</span><h2>{chapter.title}</h2>
          {chapter.description && <p>{chapter.description}</p>}
          <div><span>{chapter.story_count} 篇故事</span><span>进入章节 <ArrowRight size={16} aria-hidden="true" /></span></div>
        </div>
      </Link>
    })}
  </section>
}

function TimeCatalogue() {
  const { categories } = useBook()
  const reader = useReader()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const filters = readFilters(params)
  const savedOnly = params.get('view') === 'saved'
  const page = readPage(params)
  const saved = savedOnly ? reader.saved : undefined
  const years = useLoad('story-years', async () => unwrap(await db().rpc('story_years')) ?? [])
  const result = useLoad(JSON.stringify([filters, page, saved ?? null]), () => timeline(filters, page, saved))
  const groups = new Map<string, Card[]>()
  for (const story of result.data?.rows ?? []) {
    const period = story.event_date.slice(0, 7)
    const stories = groups.get(period)
    if (stories) stories.push(story)
    else groups.set(period, [story])
  }
  const chapters = [...groups.entries()]
  const filtered = Boolean(filters.search || filters.year || filters.category || filters.pinned)

  function update(values: Partial<Filters>) {
    setParams(catalogueParams({ ...filters, ...values }, savedOnly, 0))
  }

  function jump(period: string) {
    const heading = document.getElementById('chapter-' + period)
    heading?.focus({ preventScroll: true })
    heading?.scrollIntoView({ block: 'start' })
  }

  return <div className="catalogue-layout">
      <aside className="catalogue-index" aria-label="年份与章节">
        <div className="catalogue-index-inner">
          <h2><CalendarDays size={17} strokeWidth={1.5} aria-hidden="true" />按年份翻阅</h2>
          <nav className="catalogue-years" aria-label="年份">
            <button type="button" aria-pressed={!filters.year} onClick={() => update({ year: '', month: '' })}>全部年份</button>
            {(years.data ?? []).map(year => {
              const value = String(year).padStart(4, '0')
              return <button key={year} type="button" aria-pressed={filters.year === value}
                onClick={() => update({ year: value, month: '' })}>{year} 年</button>
            })}
          </nav>
          <Feedback error={years.error} retry={years.reload} />
          {chapters.length > 1 && <nav className="catalogue-chapter-nav" aria-label="本页章节">
            <h2>本页章节</h2>
            {chapters.map(([period]) => {
              const [year, month] = period.split('-').map(Number)
              return <button type="button" key={period} onClick={() => jump(period)}>{year} 年 {month} 月</button>
            })}
          </nav>}
        </div>
      </aside>

      <section className="catalogue-results" aria-label={savedOnly ? '收藏故事' : '故事列表'}>
        <div className="filter-panel catalogue-filters">
          <SearchForm key={filters.search + ':' + savedOnly} value={filters.search} onSearch={search => update({ search })} />
          <div className="filter-row">
            {filters.year && <label>月份<select value={filters.month} onChange={event => update({ month: event.target.value })}>
              <option value="">全部月份</option>
              {Array.from({ length: 12 }, (_, index) => <option key={index} value={String(index + 1).padStart(2, '0')}>{index + 1} 月</option>)}
            </select></label>}
            <label>分类<select value={filters.category} onChange={event => update({ category: event.target.value })}>
              <option value="">全部分类</option>{categories.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select></label>
            <label>排序<select value={filters.newest ? 'new' : 'old'} onChange={event => update({ newest: event.target.value === 'new' })}>
              <option value="new">最近发生</option><option value="old">最早发生</option></select></label>
            <label className="check"><input type="checkbox" checked={filters.pinned} onChange={event => update({ pinned: event.target.checked })} />仅看精选</label>
          </div>
          {(savedOnly || filtered) && <div className="catalogue-filter-foot">
            {savedOnly && <span>收藏保存在当前浏览器。</span>}
            {filtered && <button type="button" className="text-button" onClick={() => setParams(catalogueParams(emptyFilters, savedOnly, 0))}>清除筛选</button>}
          </div>}
        </div>
        <Feedback loading={result.loading} error={result.error} retry={result.reload} />
        {result.data && chapters.length === 0 && <Empty title={filtered ? '没有找到符合条件的故事'
          : savedOnly ? '这页书签还空着' : '我们的下一篇故事，还没有写下。'}
          action={filtered
            ? <button type="button" className="button secondary"
              onClick={() => setParams(catalogueParams(emptyFilters, savedOnly, 0))}>查看全部结果</button>
            : savedOnly
              ? <Link className="button secondary" to={{ search: '' }}>浏览故事</Link>
              : <Link className="button secondary" to="/edit/story/new">写一段回忆</Link>}>
          {savedOnly && !filtered ? '在故事卡片或阅读页点一下书签，就能从这里翻回来。' : undefined}
        </Empty>}
        <div className="catalogue-chapters">
          {chapters.map(([period, stories]) => {
            const [year, month] = period.split('-').map(Number)
            return <section key={period} className="catalogue-chapter" aria-labelledby={'chapter-' + period}>
              <h2 tabIndex={-1} id={'chapter-' + period}><span>{year} 年</span><strong>{month} 月</strong></h2>
              <div className="catalogue-cards">{stories.map(story => <TimelineCard key={story.id} story={story}
                cover={story.cover_media_id ? result.data?.covers[story.cover_media_id] : undefined}
                saved={reader.saved.includes(story.id)} toggle={() => reader.toggle(story.id)} from={location.pathname + location.search} />)}</div>
            </section>
          })}
        </div>
        {result.data && <Pagination page={page} next={result.data.next} go={next => {
          setParams(catalogueParams(filters, savedOnly, next))
          window.scrollTo(0, 0)
        }} />}
      </section>
  </div>
}

export default function Timeline() {
  const { member } = useBook()
  const [params] = useSearchParams()
  const view = params.get('view')
  const raw = params.get('chapter') ?? ''
  const chapterId = uuid.test(raw) ? raw : ''
  return <div className="page story-catalogue">
    <header className="catalogue-head">
      <div><p className="catalogue-kicker"><BookOpen size={17} strokeWidth={1.45} aria-hidden="true" />篇章目录</p>
        <h1>我们的故事</h1>
        <p>那些普通的日子，后来都成了值得珍藏的回忆。</p></div>
      <Link className="button" to="/edit/story/new"><SquarePen size={17} aria-hidden="true" />写故事</Link>
    </header>
    <div className="catalogue-navline">
      <nav className="catalogue-tabs" aria-label="故事浏览方式">
        <Link to="/stories" aria-current={view !== 'chapters' && view !== 'saved' ? 'page' : undefined}><CalendarDays size={17} aria-hidden="true" />时间轴</Link>
        <Link to="/stories?view=chapters" aria-current={view === 'chapters' ? 'page' : undefined}><BookOpen size={17} aria-hidden="true" />章节</Link>
        <Link to="/stories?view=saved" aria-current={view === 'saved' ? 'page' : undefined}><Bookmark size={17} aria-hidden="true" />我的收藏</Link>
      </nav>
      {view === 'chapters' && member.role === 'admin' && <Link className="text-button" to="/chapters">管理章节</Link>}
    </div>
    {view === 'chapters' ? <ChapterCatalogue chapterId={chapterId} page={readPage(params)} /> : <TimeCatalogue />}
  </div>
}
