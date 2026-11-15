import { useState } from 'react'
import type { FormEvent } from 'react'
import { SquarePen } from 'lucide-react'
import { useBook } from '../book-context'
import { canEdit } from '../data/book'
import { errorMessage } from '../data/client'
import { dateLabel } from '../data/dates'
import type { Media, PhotoNote } from '../data/types'
import { fetchPhotoNote, savePhotoNote } from '../data/world'
import { useLoad } from '../hooks'
import { Feedback } from './feedback'

export function PhotoBack({ item, reversed }: { item: Media; reversed: boolean }) {
  const { member } = useBook()
  const result = useLoad(item.id, () => fetchPhotoNote(item.id))
  const [editing, setEditing] = useState(false)
  if (!reversed) return null
  return <div className="photo-back">
    <time dateTime={item.event_date}>{dateLabel(item.event_date)}</time>
    <h2>照片背后</h2>
    <Feedback loading={result.loading} error={result.error} retry={result.reload} />
    {result.data !== undefined && (editing
      ? <PhotoBackForm item={item} note={result.data} close={() => setEditing(false)}
        done={() => { setEditing(false); result.reload() }} />
      : <>
        {result.data?.place && <p>地点 · {result.data.place}</p>}
        {result.data?.photographer && <p>拍摄者 · {result.data.photographer}</p>}
        {result.data?.memory && <p className="preserve-lines">{result.data.memory}</p>}
        {result.data?.message && <blockquote>{result.data.message}</blockquote>}
        {!result.data || ![result.data.place, result.data.photographer, result.data.memory, result.data.message].some(Boolean)
          ? <p>这张照片还没有写下背面的故事。</p> : null}
        {canEdit(member, item.created_by) && <button className="button secondary small" onClick={() => setEditing(true)}>
          <SquarePen size={15} />编辑背面
        </button>}
      </>)}
  </div>
}

function PhotoBackForm({ item, note, close, done }: { item: Media; note: PhotoNote | null; close: () => void; done: () => void }) {
  const [values, setValues] = useState({ place: note?.place ?? '', photographer: note?.photographer ?? '',
    memory: note?.memory ?? '', message: note?.message ?? '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await savePhotoNote(item.id, values, Boolean(note))
      done()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }
  return <form className="form-stack" onSubmit={save}>
    <div className="form-grid"><label>地点<input value={values.place} maxLength={100} onChange={e => setValues({ ...values, place: e.target.value })} /></label>
      <label>拍摄者<input value={values.photographer} maxLength={80} onChange={e => setValues({ ...values, photographer: e.target.value })} /></label></div>
    <label>这张照片的小故事<textarea value={values.memory} rows={3} maxLength={1500} onChange={e => setValues({ ...values, memory: e.target.value })} /></label>
    <label>想对你说的话<input maxLength={300} value={values.message} onChange={e => setValues({ ...values, message: e.target.value })} /></label>
    <Feedback error={error} />
    <div className="actions"><button className="button small" disabled={busy}>{busy ? '保存中…' : '保存背面'}</button>
      <button type="button" className="button secondary small" disabled={busy} onClick={close}>取消</button></div>
  </form>
}
