import { useId, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, MapPin, Printer, SquarePen } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import defaultCover from '../assets/story-cover.webp'
import { useBook } from '../book-context'
import { emptyFilters, mediaById, readingHistory, timeline } from '../data/book'
import { db, errorMessage, unwrap } from '../data/client'
import { dateLabel, dateRange } from '../data/dates'
import type { AnnualBook as AnnualRecord, Media, StoryCard as StoryPreview } from '../data/types'
import { useLoad } from '../hooks'
import { Empty, Feedback } from '../ui/feedback'
import { PrivateImage } from '../ui/media'
import { StoryCard } from '../ui/StoryCard'
import './years.css'

const yearlyStoryFilters = { ...emptyFilters, newest: false }

async function annualEdition(year: string) {
  const range = dateRange(year)
  if (!range) throw new Error('请先选择一个有故事的年份。')
  const dates = { from_date: range.start, to_date: range.end, start_at: 0, limit_to: 4, category_filter: null }
  const [stories, total, photos, visits, promises, anniversaries, draft] = await Promise.all([
    timeline({ ...yearlyStoryFilters, year }, 0),
    db().from('stories').select('id', { head: true, count: 'exact' }).eq('status', 'published')
      .is('deleted_at', null).eq('is_hidden', false).gte('event_date', range.start).lte('event_date', range.end),
    db().rpc('album_photos', { ...dates, featured_only: true }),
    db().from('footprints').select('id,title,city,arrival').gte('arrival', range.start).lte('arrival', range.end).order('arrival').limit(8),
    db().from('promises').select('id,title,completed_on,story_id').is('deleted_at', null)
      .gte('completed_on', range.start).lte('completed_on', range.end).order('completed_on').limit(8),
    db().from('anniversaries').select('id,title,event_date').lte('event_date', range.end).order('event_date').limit(8),
    db().from('annual_books').select('*').eq('year', Number(year)).maybeSingle(),
  ])
  unwrap(total)
  const featured = unwrap(photos) ?? []
  const album = featured.length ? featured : unwrap(await db().rpc('album_photos', { ...dates, featured_only: false })) ?? []
  const edit = unwrap(draft)
  const [cover, focus] = await Promise.all([
    edit?.cover_id ? db().rpc('book_photo', { target: edit.cover_id }).then(value => unwrap(value)?.[0]) : undefined,
    edit?.focus_story_id ? readingHistory([edit.focus_story_id]).then(rows => rows[0]) : undefined,
  ])
  const focusImage = focus?.cover_media_id ? (await mediaById([focus.cover_media_id]))[focus.cover_media_id] : undefined
  return {
    stories, count: total.count ?? stories.rows.length, album, featured: featured.length > 0, edit, cover, focus, focusImage,
    visits: unwrap(visits) ?? [], promises: unwrap(promises) ?? [], anniversaries: unwrap(anniversaries) ?? [],
  }
}

function AnnualEditor({ year, draft, photos, stories, done }: {
  year: number; draft?: AnnualRecord | null; photos: Media[]; stories: StoryPreview[]; done: () => void
}) {
  const [title, setTitle] = useState(draft?.title ?? '我们的年度故事')
  const [reflection, setReflection] = useState(draft?.reflection ?? '')
  const [cover, setCover] = useState(draft?.cover_id ?? '')
  const [focus, setFocus] = useState(draft?.focus_story_id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reflectionId = useId()
  return <form className="panel form-stack annual-editor" onSubmit={async event => {
    event.preventDefault()
    if (busy || !title.trim()) return
    setBusy(true)
    setError('')
    const fields = { title: title.trim(), reflection, cover_id: cover || null, focus_story_id: focus || null }
    try {
      const saved = draft ? await db().from('annual_books').update(fields).eq('year', year).select('year').single()
        : await db().from('annual_books').insert({ year, ...fields }).select('year').single()
      unwrap(saved)
      done()
    } catch (failure) { setError(errorMessage(failure)) }
    finally { setBusy(false) }
  }}>
    <fieldset className="form-stack" disabled={busy}>
      <label>年鉴标题<input maxLength={100} required value={title} onChange={event => setTitle(event.target.value)} /></label>
      <div className="form-stack">
        <label htmlFor={reflectionId}>这一年的话</label>
        <textarea id={reflectionId} rows={5} maxLength={4000} value={reflection} onChange={event => setReflection(event.target.value)} />
      </div>
      <label>封面照片<select value={cover} onChange={event => setCover(event.target.value)}>
        <option value="">自动选择</option>
        {cover && !photos.some(photo => photo.id === cover) && <option value={cover}>当前封面</option>}
        {photos.map((photo, index) => <option value={photo.id} key={photo.id}>{photo.caption || '第 ' + (index + 1) + ' 张照片'}</option>)}
      </select></label>
      <label>重点故事<select value={focus} onChange={event => setFocus(event.target.value)}>
        <option value="">暂不选择</option>
        {focus && !stories.some(story => story.id === focus) && <option value={focus}>当前故事</option>}
        {stories.map(story => <option value={story.id} key={story.id}>{story.title}</option>)}
      </select></label>
      <button className="button" disabled={busy}>{busy ? '正在保存…' : '保存年鉴'}</button>
    </fieldset>
    <Feedback error={error} />
  </form>
}

function YearNavigation({ years, chosen, update }: { years: number[]; chosen: number; update: (year: number) => void }) {
  const index = years.indexOf(chosen)
  return <nav className="year-controls" aria-label="切换年鉴">
    <button type="button" className="icon-button" aria-label="翻到更早一年" disabled={index < 0 || index + 1 === years.length}
      onClick={() => update(years[index + 1])}><ArrowLeft size={17} aria-hidden="true" /></button>
    <label>年份<select value={chosen} onChange={event => update(Number(event.target.value))}>
      {years.map(year => <option value={year} key={year}>{year} 年</option>)}
    </select></label>
    <button type="button" className="icon-button" aria-label="翻到更新一年" disabled={index <= 0}
      onClick={() => update(years[index - 1])}><ArrowRight size={17} aria-hidden="true" /></button>
  </nav>
}

function AnnualBook({ year }: { year: string }) {
  const { member } = useBook()
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState(false)
  const result = useLoad(year, () => annualEdition(year))
  if (!result.data) return <Feedback loading={result.loading} error={result.error} retry={result.reload} />
  const { stories, count, album, featured, visits, promises, anniversaries, edit, cover, focus, focusImage } = result.data
  return <article className="annual-book" aria-labelledby="annual-title">
    {member.role === 'admin' && <button type="button" className="text-button annual-edit" onClick={() => setEditing(value => !value)}>
      <SquarePen size={16} />{editing ? '收起编辑' : '编辑年鉴'}</button>}
    {editing && <AnnualEditor year={Number(year)} draft={edit} photos={album} stories={stories.rows} done={() => {
      setEditing(false); setNotice(true); result.reload()
    }} />}
    {notice && <p className="notice" role="status">年鉴已保存。</p>}
    <header className="annual-cover">
      <div className="annual-cover-illustration">
        {cover || album[0] ? <PrivateImage item={cover ?? album[0]} eager full alt={(cover ?? album[0]).caption || '年度封面'} onRetry />
          : <img src={defaultCover} alt="" />}
      </div>
      <div className="annual-cover-legend">
        <span className="annual-year">{year}</span>
        <h2 id="annual-title">{edit?.title ?? '我们的年度故事'}</h2>
        <p>{count} 篇故事发生在这一年。</p>
        <Link className="text-button" to={'/stories?year=' + year}>读这一年的故事 <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
    </header>
    {edit?.reflection && <section className="panel annual-section"><h2>这一年的话</h2><p className="preserve-lines">{edit.reflection}</p></section>}
    {focus && <section className="annual-section"><h2>想再读一次</h2><div className="annual-stories">
      <StoryCard story={focus} cover={focusImage} /></div></section>}
    {album.length > 0 && <section className="annual-section" aria-labelledby="annual-photo-title">
      <div className="annual-heading"><h2 id="annual-photo-title">{featured ? '年度精选照片' : '这一年的照片'}</h2>
        <Link className="text-button" to="/album">打开相册 <ArrowRight size={15} aria-hidden="true" /></Link></div>
      <div className="annual-photos">{album.map(photo => <figure key={photo.id}>
        <div><PrivateImage item={photo} full eager alt={photo.caption || '相册照片'} onRetry /></div>
        <figcaption>{photo.caption && <span>{photo.caption} · </span>}{dateLabel(photo.event_date)}</figcaption>
      </figure>)}</div>
    </section>}
    <section className="annual-section" aria-labelledby="annual-stories-title">
      <div className="annual-heading"><h2 id="annual-stories-title">这一年写下的故事</h2>
        <Link className="text-button" to={'/stories?year=' + year}>查看完整时间轴 <ArrowRight size={15} aria-hidden="true" /></Link></div>
      <div className="annual-stories">{stories.rows.slice(0, 6).map(story => <StoryCard key={story.id} story={story}
        cover={story.cover_media_id ? stories.covers[story.cover_media_id] : undefined} />)}</div>
      {count > 6 && <p className="field-help">当前选读按发生日期排列，完整目录有 {count} 篇。</p>}
    </section>
    {(visits.length > 0 || promises.length > 0 || anniversaries.length > 0) && <div className="annual-marginalia">
      {visits.length > 0 && <section aria-labelledby="annual-visited"><h2 id="annual-visited"><MapPin size={18} aria-hidden="true" />一起去过</h2>
        <ul>{visits.map(visit => <li key={visit.id}><time dateTime={visit.arrival}>{dateLabel(visit.arrival)}</time><strong>{visit.title} · {visit.city}</strong></li>)}</ul>
        <Link className="text-button" to="/footprints">打开足迹</Link>
      </section>}
      {promises.length > 0 && <section aria-labelledby="annual-promises"><h2 id="annual-promises"><BookOpen size={18} aria-hidden="true" />完成的约定</h2>
        <ul>{promises.map(promise => <li key={promise.id}>{promise.completed_on && <time dateTime={promise.completed_on}>{dateLabel(promise.completed_on)}</time>}
          <strong>{promise.title}</strong></li>)}</ul>
      </section>}
      {anniversaries.length > 0 && <section aria-labelledby="annual-days"><h2 id="annual-days"><CalendarDays size={18} aria-hidden="true" />纪念日</h2>
        <ul>{anniversaries.map(day => <li key={day.id}><time dateTime={day.event_date}>{dateLabel(day.event_date)}</time><strong>{day.title}</strong></li>)}</ul>
      </section>}
    </div>}
  </article>
}

export default function Years() {
  const [params, setParams] = useSearchParams()
  const years = useLoad('annual-years', async () => unwrap(await db().rpc('story_years')) ?? [])
  const requested = Number(params.get('year'))
  const chosen = years.data?.includes(requested) ? requested : years.data?.[0]

  return <div className="page annual-page">
    <header className="annual-top">
      <div><h1>故事年鉴</h1><p>按故事发生的年份翻阅。</p></div>
      {chosen && <button type="button" className="button secondary small" onClick={() => window.print()}>
        <Printer size={16} aria-hidden="true" />打印当前年鉴</button>}
    </header>
    <Feedback loading={years.loading} error={years.error} retry={years.reload} />
    {years.data?.length === 0 && <Empty title="年鉴还没有可以收录的故事。"
      action={<Link className="button secondary" to="/stories">前往故事目录</Link>}>发布故事后，年鉴会按故事发生日期归档。</Empty>}
    {chosen && years.data && <>
      <YearNavigation years={years.data} chosen={chosen} update={year => setParams({ year: String(year) })} />
      <AnnualBook key={chosen} year={String(chosen).padStart(4, '0')} />
    </>}
  </div>
}
