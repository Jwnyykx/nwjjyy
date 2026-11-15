import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ImagePlus, SquarePen, Trash2 } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { useBook } from '../book-context'
import { canEdit, PAGE_SIZE, trashRecord } from '../data/book'
import { db, errorMessage, unwrap } from '../data/client'
import { dateLabel, dateRange, todayIn, validDate } from '../data/dates'
import { stageAll } from '../data/media'
import type { Attachment } from '../data/media'
import type { Media } from '../data/types'
import { useLoad, useUnsaved } from '../hooks'
import { AttachmentPicker } from '../ui/AttachmentPicker'
import { Empty, Feedback, PageHeading } from '../ui/feedback'
import { Pagination, YearMonth } from '../ui/filters'
import { Lightbox, PrivateImage } from '../ui/media'

function AlbumUpload({ replacement, cancel, done }: {
  replacement?: Media; cancel: () => void; done: () => void
}) {
  const { categories, settings } = useBook()
  const [date, setDate] = useState(replacement?.event_date ?? todayIn(settings.time_zone))
  const [category, setCategory] = useState(replacement?.category_id ?? '')
  const [files, setFiles] = useState<Attachment[]>([])
  const [error, setError] = useState('')
  const [progress, setProgress] = useState({ label: '', percent: 0 })
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const allowLeave = useUnsaved(files.length > 0, saving)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!files.length || busy.current) return
    if (!validDate(date)) { setError('请选择有效的照片日期。'); return }
    busy.current = true
    setSaving(true)
    setError('')
    const targets = files.map(item => item.id)
    try {
      // A retry can follow a committed save whose response did not reach this browser.
      const saved = unwrap(await db().from('media').select('id').in('id', targets)
        .eq('state', 'ready').is('deleted_at', null)) ?? []
      if (saved.length === targets.length) {
        allowLeave()
        done()
        return
      }
      await stageAll(files, { story_id: null, diary_id: null, category_id: category || null, event_date: date },
        (label, percent) => setProgress({ label, percent }))
      // A retried upload can have started with different metadata.
      for (const item of files) {
        unwrap(await db().from('media').update({ caption: item.caption.trim(), category_id: category || null, event_date: date })
          .eq('id', item.id).eq('state', 'staged').select('id').single())
      }
      unwrap(await db().rpc('save_album', { targets, ...(replacement ? { replaced: replacement.id } : {}) }))
      allowLeave()
      done()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  return <form className="panel form-stack album-form" onSubmit={save}>
    <h2>{replacement ? '替换相册照片' : '收下一组照片'}</h2>
    {replacement && <p className="field-help">替换成功后，原照片会移到回收站。</p>}
    <fieldset className="form-stack" disabled={saving}>
      <div className="form-grid">
        <label>照片日期<input type="date" value={date} required onChange={event => setDate(event.target.value)} /></label>
        <label>分类<select value={category} onChange={event => setCategory(event.target.value)}>
          <option value="">不分类</option>{categories.filter(item => !item.archived || item.id === category).map(item =>
            <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      <AttachmentPicker items={files} onChange={setFiles} limit={replacement ? 1 : 20} />
      <div className="actions">
        <button className="button" disabled={!files.length}>{saving ? '上传中…' : '保存到相册'}</button>
        <button type="button" className="button secondary" onClick={() => {
          if (!files.length || window.confirm('离开这次上传吗？未保存的照片可以稍后重新选择。')) cancel()
        }}>取消</button>
      </div>
    </fieldset>
    {saving && <div className="progress-box" role="status"><span>{progress.label || '正在准备照片…'}</span>
      <progress max={100} value={progress.percent} /></div>}
    <Feedback error={error} />
  </form>
}

async function photosFor(year: string, category: string, pinned: boolean, page: number) {
  const range = dateRange(year)
  const records = unwrap(await db().rpc('album_photos', {
    from_date: range?.start ?? null, to_date: range?.end ?? null,
    category_filter: category || null, featured_only: pinned,
    start_at: page * PAGE_SIZE, limit_to: PAGE_SIZE + 1,
  })) ?? []
  return { rows: records.slice(0, PAGE_SIZE), next: records.length > PAGE_SIZE }
}

function PhotoMeta({ item, done, close }: { item: Media; done: () => void; close: () => void }) {
  const { categories } = useBook()
  const [caption, setCaption] = useState(item.caption)
  const [date, setDate] = useState(item.event_date)
  const [category, setCategory] = useState(item.category_id ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const permit = useUnsaved(caption !== item.caption || date !== item.event_date || category !== (item.category_id ?? ''), saving)
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!validDate(date)) { setError('请选择有效日期。'); return }
    setSaving(true)
    setError('')
    try {
      unwrap(await db().from('media').update({ caption: caption.trim(), event_date: date, category_id: category || null })
        .eq('id', item.id).is('deleted_at', null).select('id').single())
      permit()
      done()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }
  return <form className="panel form-stack" onSubmit={save}>
    <h2>编辑照片说明</h2>
    <label>照片说明<input maxLength={320} value={caption} onChange={event => setCaption(event.target.value)} /></label>
    <div className="form-grid"><label>照片日期<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
      <label>分类<select value={category} onChange={event => setCategory(event.target.value)}>
        <option value="">不分类</option>{categories.filter(option => !option.archived || option.id === category)
          .map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label></div>
    <Feedback error={error} /><div className="actions"><button className="button small" disabled={saving}>保存说明</button>
      <button className="button secondary small" type="button" disabled={saving} onClick={close}>取消</button></div>
  </form>
}

export default function Album() {
  const { member, categories } = useBook()
  const [params, setParams] = useSearchParams()
  const deepPhoto = params.get('photo') ?? ''
  const deep = useLoad(deepPhoto, async () => {
    if (!/^[a-f0-9-]{36}$/i.test(deepPhoto)) return null
    return unwrap(await db().rpc('book_photo', { target: deepPhoto }))?.[0] ?? null
  })
  const [year, setYear] = useState('')
  const [category, setCategory] = useState('')
  const [pinned, setPinned] = useState(false)
  const [page, setPage] = useState(0)
  const [current, setCurrent] = useState<number>()
  const [upload, setUpload] = useState<{ replacement?: Media }>()
  const [edit, setEdit] = useState<Media>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [removing, setRemoving] = useState(false)
  const years = useLoad('album-years', async () => {
    const rows = unwrap(await db().rpc('album_years')) ?? []
    return rows
  })
  const result = useLoad([year, category, pinned, page].join('|'), () => photosFor(year, category, pinned, page))
  function openUpload(value: { replacement?: Media }) {
    setEdit(undefined)
    setUpload(value)
    window.scrollTo(0, 0)
  }
  const rows = result.data?.rows ?? []
  function filterChanged() {
    setPage(0)
    setCurrent(undefined)
  }
  async function remove(item: Media) {
    if (removing || !window.confirm('把这张照片移到回收站吗？')) return
    setRemoving(true)
    setError('')
    try {
      await trashRecord('media', item.id)
      setPage(0)
      result.reload()
      setNotice('照片已移到回收站。')
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setRemoving(false)
    }
  }
  return <div className="page">
    <PageHeading title="回忆相册" intro="有些瞬间，照片替我们记住了。"
      action={<button className="button" disabled={Boolean(upload || edit)} onClick={() => openUpload({})}><ImagePlus size={17} />上传照片</button>} />
    <div className="actions album-tools">
      <Link className="button secondary small" to="/collections">照片合集</Link>
      <Link className="button secondary small" to="/cinema">记忆放映机</Link>
    </div>
    {deepPhoto && <Feedback loading={deep.loading} error={deep.error} retry={deep.reload} />}
    {deepPhoto && deep.data === null && <p className="notice" role="status">这张照片已移除或暂时无法查看。</p>}
    {deep.data && <Lightbox photos={[deep.data]} current={0} setCurrent={() => {}}
      close={() => setParams({}, { replace: true })} />}
    {upload && <AlbumUpload key={upload.replacement?.id ?? 'new'} replacement={upload.replacement} cancel={() => setUpload(undefined)}
      done={() => { setUpload(undefined); setPage(0); setNotice('照片已保存到相册。'); result.reload(); years.reload() }} />}
    {edit && <PhotoMeta key={edit.id} item={edit} close={() => setEdit(undefined)}
      done={() => { setEdit(undefined); setNotice('说明已保存。'); result.reload(); years.reload() }} />}
    <div className="filter-panel filter-row">
      <YearMonth years={years.data ?? []} year={year} onYear={value => { setYear(value); filterChanged() }} />
      <label>分类<select value={category} onChange={event => { setCategory(event.target.value); filterChanged() }}>
        <option value="">全部分类</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="check"><input type="checkbox" checked={pinned} onChange={event => { setPinned(event.target.checked); filterChanged() }} />精选故事的照片</label>
    </div>
    {notice && <p role="status" className="notice">{notice}</p>}
    <Feedback error={error || years.error} retry={years.error ? years.reload : undefined} />
    <Feedback loading={result.loading} error={result.error} retry={result.reload} />
    {result.data && !rows.length && <Empty title={year || category || pinned ? '这组筛选下还没有照片' : '相册里还有好多空位。'}
      action={!upload && !edit ? <button className="button secondary" onClick={() => openUpload({})}>收下一张照片</button> : undefined} />}
    <div className="album-grid">
      {rows.map((item, index) => <figure key={item.id}>
        <button className="photo-button album-photo" onClick={() => setCurrent(index)} aria-label={item.caption || '放大相册照片'}>
          <PrivateImage item={item} /></button>
        <figcaption><p>{item.caption || '一张回忆'}</p><time dateTime={item.event_date}>{dateLabel(item.event_date)}</time></figcaption>
        {!item.story_id && !item.diary_id && canEdit(member, item.created_by) && <div className="actions photo-actions">
          <button className="icon-button" aria-label="编辑这张照片" title="编辑照片" disabled={Boolean(upload || edit)} onClick={() => { setEdit(item); window.scrollTo(0, 0) }}><SquarePen size={15} /></button>
          <button className="text-button" disabled={Boolean(upload || edit)} onClick={() => openUpload({ replacement: item })}>替换</button>
          <button className="icon-button danger" aria-label="移除这张照片" disabled={removing || Boolean(upload || edit)}
            onClick={() => void remove(item)}><Trash2 size={15} /></button>
        </div>}
        {item.story_id && <Link className="text-button story-album-link" to={'/stories/' + item.story_id}>所属故事</Link>}
      </figure>)}
    </div>
    {result.data && <Pagination page={page} next={result.data.next} go={value => { setPage(value); window.scrollTo(0, 0) }} />}
    {current !== undefined && <Lightbox photos={rows} current={current} close={() => setCurrent(undefined)} setCurrent={setCurrent} />}
  </div>
}
