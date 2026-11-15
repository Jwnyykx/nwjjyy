import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Maximize2, Pause, Play, RotateCcw, X } from 'lucide-react'
import { useBook } from '../book-context'
import { db, unwrap } from '../data/client'
import { dateLabel } from '../data/dates'
import type { Media } from '../data/types'
import { useLoad } from '../hooks'
import { Back, Empty, Feedback, PageHeading } from '../ui/feedback'
import { PrivateImage } from '../ui/media'

type Criteria = { from: string; to: string; category: string }

function Projector({ photos, expanded, close }: { photos: Media[]; expanded: boolean; close: () => void }) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [music, setMusic] = useState<File>()
  const [musicUrl, setMusicUrl] = useState('')
  const photo = photos[index]
  useEffect(() => {
    if (!playing || !photo) return
    const timer = setTimeout(() => setIndex(index + 1), 6500)
    return () => clearTimeout(timer)
  }, [playing, index, photo])
  useEffect(() => {
    if (!music) return
    const url = URL.createObjectURL(music)
    setMusicUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [music])
  useEffect(() => {
    if (!expanded) return
    const leave = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('keydown', leave)
    return () => document.removeEventListener('keydown', leave)
  }, [expanded, close])
  return <div className="cinema-view">
    <div className="cinema-screen">
      {photo ? <figure key={photo.id}>
        <PrivateImage item={photo} eager full onRetry />
        <figcaption>
          <time dateTime={photo.event_date}>{dateLabel(photo.event_date)}</time>
          {photo.caption && <p>{photo.caption}</p>}
        </figcaption>
      </figure> : <div className="cinema-outro"><h2>还会有新的瞬间。</h2><p>这次放映到这里。</p></div>}
    </div>
    <div className="cinema-toolbar actions">
      <button type="button" className="icon-button" aria-label="上一张" disabled={index === 0} onClick={() => setIndex(value => value - 1)}><ArrowLeft size={18} /></button>
      {photo ? <button type="button" className="button small" onClick={() => setPlaying(value => !value)}>
        {playing ? <Pause size={16} /> : <Play size={16} />}{playing ? '暂停' : '继续放映'}</button>
        : <button type="button" className="button small" onClick={() => { setIndex(0); setPlaying(false) }}><RotateCcw size={16} />从头看</button>}
      <button type="button" className="icon-button" aria-label="下一张" disabled={!photo} onClick={() => setIndex(value => value + 1)}><ArrowRight size={18} /></button>
      <span aria-live="polite">{photo ? index + 1 + ' / ' + photos.length : '放映结束'}</span>
      <button type="button" className="icon-button" aria-label={expanded ? '退出全屏' : '全屏放映'} onClick={close}>
        {expanded ? <X size={18} /> : <Maximize2 size={18} />}
      </button>
    </div>
    <details className="cinema-music">
      <summary>选择背景声音</summary>
      <label>从设备选音频<input type="file" accept="audio/*" onChange={event => setMusic(event.target.files?.[0])} /></label>
      {musicUrl && music && <audio controls src={musicUrl} preload="metadata" />}
    </details>
  </div>
}

export default function Cinema() {
  const { categories } = useBook()
  const [fields, setFields] = useState<Criteria>({ from: '', to: '', category: '' })
  const [chosen, setChosen] = useState<Criteria>()
  const [expanded, setExpanded] = useState(false)
  const key = JSON.stringify(chosen)
  const result = useLoad(key ?? 'no-cinema', async () => {
    if (!chosen) return null
    const rows = unwrap(await db().rpc('album_photos', { from_date: chosen.from || null, to_date: chosen.to || null,
      category_filter: chosen.category || null, featured_only: false, start_at: 0, limit_to: 30 })) ?? []
    return rows.reverse()
  })
  return <section className={'page cinema' + (expanded ? ' cinema-expanded' : '')}>
    <div className="cinema-config">
      <Back to="/album">返回回忆相册</Back>
      <PageHeading title="记忆放映机" intro="选择一段时间，把最多 30 张照片按日期放映。" />
      <form className="panel form-stack" onSubmit={event => { event.preventDefault(); setChosen({ ...fields }) }}>
        <div className="form-grid">
          <label>从<input type="date" max={fields.to || undefined} value={fields.from} onChange={event => setFields({ ...fields, from: event.target.value })} /></label>
          <label>到<input type="date" min={fields.from || undefined} value={fields.to} onChange={event => setFields({ ...fields, to: event.target.value })} /></label>
        </div>
        <label>主题<select value={fields.category} onChange={event => setFields({ ...fields, category: event.target.value })}>
          <option value="">全部分类</option>{categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
        <button className="button"><Play size={16} />准备放映</button>
      </form>
      {chosen && <Feedback loading={result.loading} error={result.error} retry={result.reload} />}
      {result.data?.length === 0 && <Empty title="这段时间还没有照片" />}
    </div>
    {!!result.data?.length && <Projector key={key} photos={result.data} expanded={expanded} close={() => setExpanded(value => !value)} />}
  </section>
}
