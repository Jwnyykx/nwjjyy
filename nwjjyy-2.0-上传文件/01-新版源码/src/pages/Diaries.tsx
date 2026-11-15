import { useState } from 'react'
import { Feather, Trash2 } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { useBook } from '../book-context'
import { canEdit, PAGE_SIZE, trashRecord } from '../data/book'
import { db, errorMessage, unwrap } from '../data/client'
import { dateLabel } from '../data/dates'
import type { Media } from '../data/types'
import { useLoad } from '../hooks'
import { Empty, Feedback, PageHeading } from '../ui/feedback'
import { Pagination } from '../ui/filters'
import { Lightbox, PrivateImage } from '../ui/media'
import { Markdown } from '../ui/markdown'

async function listDiaries(page: number, id?: string) {
  let query = db().from('diaries').select('*').eq('status', 'published').is('deleted_at', null)
  if (id) query = query.eq('id', id)
  const all = unwrap(await query
    .order('event_date', { ascending: false }).order('created_at', { ascending: false }).order('id')
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) ?? []
  const rows = all.slice(0, PAGE_SIZE)
  const photos = rows.length ? unwrap(await db().from('media').select('*').in('diary_id', rows.map(item => item.id))
    .eq('state', 'ready').is('deleted_at', null)) ?? [] : []
  return { rows, photos, next: all.length > PAGE_SIZE }
}

export default function Diaries() {
  const { member, members } = useBook()
  const location = useLocation()
  const [params] = useSearchParams()
  const key = params.get('entry') || ''
  const id = /^[a-f0-9-]{36}$/i.test(key) ? key : undefined
  const [page, setPage] = useState(0)
  const result = useLoad('diary:' + (id ?? '') + ':' + page, () => listDiaries(id ? 0 : page, id))
  const [openPhoto, setOpenPhoto] = useState<Media>()
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState(false)
  async function remove(id: string) {
    if (removing || !window.confirm('把这条日记移到回收站吗？')) return
    setRemoving(true)
    setError('')
    try {
      await trashRecord('diaries', id)
      setPage(0)
      result.reload()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setRemoving(false)
    }
  }
  return <div className="page diary-page">
    <PageHeading title="心动日记" intro="把那些没来得及说完的话，留在这里。"
      action={<Link className="button" to="/edit/diary/new"><Feather size={17} />写日记</Link>} />
    {typeof location.state?.notice === 'string' && <p className="notice" role="status">{location.state.notice}</p>}
    <Feedback error={error} />
    <Feedback loading={result.loading} error={result.error} retry={result.reload} />
    {id && <Link className="text-button" to="/diary">查看全部日记</Link>}
    {result.data && !result.data.rows.length && <Empty title="今天想留下哪一句话？"
      action={<Link className="button secondary" to="/edit/diary/new">写下第一条日记</Link>} />}
    <div className="diary-list">{result.data?.rows.map(item => {
      const photo = result.data?.photos.find(value => value.diary_id === item.id)
      return <article className="diary-card" key={item.id}>
        <div className="metadata"><time dateTime={item.event_date}>{dateLabel(item.event_date)}</time>
          <span>{members.find(value => value.id === item.author_id)?.display_name}</span>{item.mood && <span className="badge">{item.mood}</span>}</div>
        <Markdown text={item.body} />
        {photo && <button className="photo-button diary-photo" aria-label="查看日记照片" onClick={() => setOpenPhoto(photo)}><PrivateImage item={photo} /></button>}
        {canEdit(member, item.author_id) && <div className="actions">
          <Link to={'/edit/diary/' + item.id} className="text-button">修改</Link>
          <button className="icon-button danger" aria-label="移除日记" disabled={removing} onClick={() => void remove(item.id)}><Trash2 size={16} /></button>
        </div>}
      </article>
    })}</div>
    {result.data && <Pagination page={page} next={result.data.next} go={setPage} />}
    {openPhoto && <Lightbox photos={[openPhoto]} current={0} setCurrent={() => undefined} close={() => setOpenPhoto(undefined)} />}
  </div>
}
