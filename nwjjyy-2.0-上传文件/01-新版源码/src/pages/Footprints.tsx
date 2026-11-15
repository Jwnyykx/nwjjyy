import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowUpRight, MapPin, Plus } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { useBook } from '../book-context'
import { canEdit } from '../data/book'
import { db, errorMessage, unwrap } from '../data/client'
import { anniversaryDays, dateLabel, todayIn } from '../data/dates'
import type { Footprint } from '../data/types'
import { footprintList, publishedOptions, saveFootprint } from '../data/world'
import { useLoad, useUnsaved } from '../hooks'
import { Back, Empty, Feedback, PageHeading } from '../ui/feedback'
import { PrivateImage } from '../ui/media'
import './world.css'

function TripForm({ item, initialStories, done, cancel }: { item?: Footprint; initialStories: string[]; done: () => void; cancel: () => void }) {
  const { settings } = useBook()
  const [fields, setFields] = useState({ title: item?.title ?? '', city: item?.city ?? '',
    arrival: item?.arrival ?? todayIn(settings.time_zone), departure: item?.departure ?? '',
    note: item?.note ?? '' })
  const [recordId] = useState(() => item?.id ?? crypto.randomUUID())
  const [links, setLinks] = useState(initialStories)
  const [changed, setChanged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const allowLeave = useUnsaved(changed, busy)
  const choices = useLoad('trip-stories', publishedOptions)
  function change(key: keyof typeof fields, value: string) {
    setFields(previous => ({ ...previous, [key]: value }))
    setChanged(true)
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!fields.title.trim() || !fields.city.trim()) { setError('请填写标题和城市。'); return }
    setBusy(true)
    setError('')
    try {
      await saveFootprint({ ...fields, title: fields.title.trim(), city: fields.city.trim(),
        departure: fields.departure || null }, recordId, links)
      allowLeave()
      done()
    } catch (failure) { setError(errorMessage(failure)) }
    finally { setBusy(false) }
  }

  return <form className="panel form-stack" onSubmit={save}>
    <h2>{item ? '修改相见记录' : '记下这次相见'}</h2>
    <fieldset disabled={busy} className="form-stack">
      <label>相见标题<input required maxLength={100} value={fields.title} onChange={e => change('title', e.target.value)} /></label>
      <label>城市<input required maxLength={80} value={fields.city} onChange={e => change('city', e.target.value)} placeholder="只填写城市或想记录的地名" /></label>
      <div className="form-grid"><label>相见日期<input type="date" required value={fields.arrival} onChange={e => change('arrival', e.target.value)} /></label>
        <label>分别日期<input type="date" min={fields.arrival} value={fields.departure} onChange={e => change('departure', e.target.value)} /></label></div>
      <label>旅途手记<textarea rows={4} maxLength={1500} value={fields.note} onChange={e => change('note', e.target.value)} /></label>
      <details className="editor-details"><summary>关联旅行中的故事（已选 {links.length} 篇）</summary>
        {choices.data?.filter(story => links.includes(story.id)
          || (story.event_date >= fields.arrival && story.event_date <= (fields.departure || fields.arrival)))
          .map(story => <label className="check" key={story.id}>
            <input type="checkbox" checked={links.includes(story.id)} disabled={links.length >= 30 && !links.includes(story.id)} onChange={e => {
              setLinks(previous => e.target.checked ? [...previous, story.id] : previous.filter(id => id !== story.id))
              setChanged(true)
            }} />{story.title} · {dateLabel(story.event_date)}
          </label>)}
        {choices.data && !choices.data.some(story => story.event_date >= fields.arrival && story.event_date <= (fields.departure || fields.arrival)) &&
          <p className="field-help">这些日子还没有已发布的故事。</p>}
      </details>
    </fieldset>
    <Feedback error={error || choices.error} retry={choices.error ? choices.reload : undefined} />
    <div className="actions"><button className="button" disabled={busy}>{busy ? '保存中…' : '保存相见记录'}</button>
      <button className="button secondary" type="button" disabled={busy} onClick={() => {
        if (!changed || window.confirm('放弃还没保存的相见记录吗？')) cancel()
      }}>取消</button></div>
  </form>
}

export default function Footprints() {
  const { member, settings } = useBook()
  const { id } = useParams()
  const result = useLoad('footprints:' + (id ?? ''), () => footprintList(id))
  const [city, selectCity] = useState('')
  const [editing, setEditing] = useState<string>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const all = result.data?.rows ?? []
  const place = ['成都', '南京', ...new Set(all.map(row => row.city).filter(value => !['成都', '南京'].includes(value)))]
  const selected = id ? all.find(row => row.id === id) : undefined
  const rows = id ? selected ? [selected] : [] : all.filter(row => !city || row.city === city)
  const changed = editing ? all.find(row => row.id === editing) : undefined
  const storiesFor = (row: Footprint) => {
    const ids = new Set([row.story_id, ...(result.data?.entries.filter(entry => entry.footprint_id === row.id).map(entry => entry.story_id) ?? [])])
    const stories = [...ids].flatMap(storyId => storyId ? result.data?.stories.get(storyId) ?? [] : [])
    return stories.sort((a, b) => a.event_date.localeCompare(b.event_date) || a.title.localeCompare(b.title))
  }
  const today = todayIn(settings.time_zone)
  const upcoming = settings.next_meeting && settings.next_meeting >= today ? settings.next_meeting : null
  async function remove(item: Footprint) {
    if (busy || !window.confirm('删除这次相见记录？关联的故事会保留。')) return
    setBusy(true)
    setError('')
    try { unwrap(await db().from('footprints').delete().eq('id', item.id).select('id').single()); result.reload() }
    catch (failure) { setError(errorMessage(failure)) }
    finally { setBusy(false) }
  }
  return <div className="page footprint-page">
    {id && <Back to="/footprints">返回我们的足迹</Back>}
    <PageHeading title={id ? '这一次相见' : '我们的足迹'} action={!id && !editing &&
      <button className="button" onClick={() => setEditing('new')}><Plus size={17} />记下相见</button>} />
    {!id && <section className="city-map" aria-label="成都与南京的双城示意图">
      <div className="city-route">
        <svg viewBox="0 0 800 200" aria-hidden="true" preserveAspectRatio="none">
          <path d="M0 138Q220 0 430 106T800 48M0 155Q220 17 430 123T800 65M0 174Q220 36 430 142T800 84" fill="none" stroke="currentColor" opacity=".19" />
          <path d="M130 145C274 195 440 0 669 60" fill="none" stroke="currentColor" strokeDasharray="5 11" strokeWidth="2.5" />
        </svg>
        {place.slice(0, 2).map(value => <button key={value} type="button" className="city-pin" aria-pressed={city === value}
          onClick={() => selectCity(v => v === value ? '' : value)}><MapPin size={22} />{value}</button>)}
      </div>
      <div className="city-choices" role="group" aria-label="筛选城市">
        <button className="button small secondary" aria-pressed={!city} onClick={() => selectCity('')}>全部足迹</button>
        {place.slice(2).map(value => <button key={value} className="button small secondary" aria-pressed={city === value}
          onClick={() => selectCity(value)}>{value}</button>)}
      </div>
    </section>}
    {!id && <div className="panel meeting-plan">
      <h2>下一次见面</h2>
      <p>{upcoming ? (upcoming === today ? '今天见。' : '距离下次见面还有 ' + anniversaryDays(upcoming, today).remaining + ' 天。')
        : '下一次见面的故事，还在等待我们书写。'}</p>
      {upcoming && <time dateTime={upcoming}>{dateLabel(upcoming)}</time>}
      {member.role === 'admin' && <Link className="text-button" to="/settings">设置见面日期</Link>}
    </div>}
    {editing && <TripForm key={editing} item={changed} initialStories={changed ? storiesFor(changed).map(story => story.id) : []} cancel={() => setEditing(undefined)}
      done={() => { setEditing(undefined); result.reload() }} />}
    <Feedback loading={result.loading} error={error || result.error} retry={result.reload} />
    {result.data && rows.length === 0 && <Empty title={id ? '找不到这次相见' : '这里还没有相见记录'}>
      {id ? '这条记录可能已被删除。' : '遇见的日期和地点，等你们自己写下来。'}
    </Empty>}
    <div className="trip-list">{rows.map(row => {
      const stories = storiesFor(row)
      return <article key={row.id} className="panel trip-card">
        <div className="metadata"><span>{row.city}</span><time dateTime={row.arrival}>{dateLabel(row.arrival)}</time>
          {row.departure && <span>至 {dateLabel(row.departure)}</span>}</div>
        <h2>{id ? row.title : <Link to={'/footprints/' + row.id}>{row.title}</Link>}</h2>
        {row.note && <p className="preserve-lines">{row.note}</p>}
        {id && stories.length > 0 && <div className="trip-days">{stories.map(story => {
          const day = anniversaryDays(row.arrival, story.event_date).elapsed + 1
          const cover = story.cover_media_id ? result.data?.photos[story.cover_media_id] : undefined
          return <Link className="panel trip-day" to={'/stories/' + story.id} key={story.id}>
            {cover && <PrivateImage item={cover} />}
            <span><small>{day > 0 && '第 ' + day + ' 天 · '}{dateLabel(story.event_date)}</small><strong>{story.title}</strong></span>
            <ArrowUpRight size={16} />
          </Link>
        })}</div>}
        <div className="actions">
          {!id && <Link className="text-button" to={'/footprints/' + row.id}>查看相见记录{stories.length > 0 && ' · ' + stories.length + ' 篇故事'}<ArrowUpRight size={15} /></Link>}
          {canEdit(member, row.author_id) && !editing && <><button className="text-button" disabled={busy} onClick={() => setEditing(row.id)}>修改</button>
            <button className="text-button danger" disabled={busy} onClick={() => void remove(row)}>删除</button></>}
        </div>
      </article>
    })}</div>
  </div>
}
