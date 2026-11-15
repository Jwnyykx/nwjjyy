import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowDown, ArrowUp, Images, Plus, SquarePen, Trash2 } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { useBook } from '../book-context'
import { db, errorMessage, unwrap } from '../data/client'
import type { Collection, Media } from '../data/types'
import { useLoad, useUnsaved } from '../hooks'
import { Back, Empty, Feedback, PageHeading } from '../ui/feedback'
import { Pagination } from '../ui/filters'
import { Lightbox, PrivateImage } from '../ui/media'

const pageSize = 12
async function collectionPhotos(id: string) {
  return unwrap(await db().rpc('collection_photos', { target: id })) ?? []
}

function CollectionForm({ item, initial, done, cancel }: {
  item?: Collection; initial: Media[]; done: (id: string) => void; cancel: () => void
}) {
  const [id] = useState(() => item?.id ?? crypto.randomUUID())
  const [title, setTitle] = useState(item?.title ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [photos, setPhotos] = useState(initial)
  const [cover, setCover] = useState(item?.cover_id ?? '')
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const allowLeave = useUnsaved(dirty, busy)
  const candidates = useLoad('collection-photo-options:' + page, async () => unwrap(await db().rpc('album_photos', {
    from_date: null, to_date: null, category_filter: null, featured_only: false,
    start_at: page * pageSize, limit_to: pageSize + 1,
  })) ?? [])
  function toggle(photo: Media) {
    setDirty(true)
    if (photos.some(value => value.id === photo.id)) {
      setPhotos(photos.filter(value => value.id !== photo.id))
      if (cover === photo.id) setCover('')
    } else if (photos.length < 60) setPhotos([...photos, photo])
  }
  function move(from: number, step: number) {
    const next = [...photos]
    const target = from + step
    if (target < 0 || target >= next.length) return
    const [photo] = next.splice(from, 1)
    next.splice(target, 0, photo)
    setPhotos(next)
    setDirty(true)
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy || !title.trim()) return
    setBusy(true)
    setError('')
    try {
      unwrap(await db().rpc('save_collection', { target: id, fields: { title: title.trim(), description,
        cover_id: photos.some(photo => photo.id === cover) ? cover : null }, photos: photos.map(photo => photo.id) }))
      allowLeave()
      done(id)
    } catch (failure) { setError(errorMessage(failure)) }
    finally { setBusy(false) }
  }
  return <form className="panel form-stack" onSubmit={save}>
    <h2>{item ? '编辑照片合集' : '新建照片合集'}</h2>
    <fieldset className="form-stack" disabled={busy}>
      <label>合集名<input required maxLength={100} value={title} onChange={event => { setTitle(event.target.value); setDirty(true) }} /></label>
      <label>描述<textarea rows={3} maxLength={600} value={description} onChange={event => { setDescription(event.target.value); setDirty(true) }} /></label>
      <label>合集封面<select value={photos.some(photo => photo.id === cover) ? cover : ''} onChange={event => { setCover(event.target.value); setDirty(true) }}>
        <option value="">使用第一张照片</option>{photos.map((photo, index) => <option key={photo.id} value={photo.id}>{photo.caption || '第 ' + (index + 1) + ' 张照片'}</option>)}
      </select></label>
      {Boolean(photos.length) && <ul className="collection-order">{photos.map((photo, index) => <li key={photo.id}>
        <span>{index + 1}. {photo.caption || photo.event_date}</span>
        <button type="button" className="icon-button" disabled={!index} onClick={() => move(index, -1)} aria-label={'上移第 ' + (index + 1) + ' 张'}><ArrowUp size={15} /></button>
        <button type="button" className="icon-button" disabled={index === photos.length - 1} onClick={() => move(index, 1)} aria-label={'下移第 ' + (index + 1) + ' 张'}><ArrowDown size={15} /></button>
        <button type="button" className="icon-button" onClick={() => toggle(photo)} aria-label={'从合集移除第 ' + (index + 1) + ' 张'}><Trash2 size={15} /></button>
      </li>)}</ul>}
      <h3>从相册里选照片</h3><p className="field-help">已选 {photos.length} 张，最多 60 张。</p>
      <Feedback loading={candidates.loading} error={candidates.error} retry={candidates.reload} />
      {candidates.data?.length === 0 && <p>相册还没有可收录的照片。</p>}
      <div className="collection-picker">{candidates.data?.slice(0, pageSize).map(photo => <label key={photo.id}>
        <PrivateImage item={photo} alt="" />
        <span className="check"><input type="checkbox" checked={photos.some(row => row.id === photo.id)}
          disabled={photos.length >= 60 && !photos.some(row => row.id === photo.id)} onChange={() => toggle(photo)} />{photo.caption || photo.event_date}</span>
      </label>)}</div>
      {candidates.data && <Pagination page={page} next={candidates.data.length > pageSize} go={setPage} />}
      <div className="actions"><button className="button" disabled={busy}>保存合集</button>
        <button className="button secondary" type="button" onClick={() => {
          if (!dirty || window.confirm('放弃尚未保存的修改？')) cancel()
        }}>取消</button></div>
    </fieldset>
    <Feedback error={error} />
  </form>
}

function CollectionPage({ id }: { id: string }) {
  const { member } = useBook()
  const result = useLoad(id, async () => {
    if (!/^[a-f0-9-]{36}$/i.test(id)) return null
    const item = unwrap(await db().from('photo_collections').select('*').eq('id', id).maybeSingle())
    if (!item) return null
    return { item, photos: await collectionPhotos(id) }
  })
  const [editing, setEditing] = useState(false)
  const [photo, setPhoto] = useState<number>()
  return <section className="page">
    <Back to="/collections">返回照片合集</Back>
    <Feedback loading={result.loading} error={result.error} retry={result.reload} />
    {result.data === null && <Empty title="找不到这个照片合集" />}
    {result.data && <>
      <PageHeading title={result.data.item.title} intro={result.data.item.description}
        action={member.role === 'admin' && !editing && <button className="button secondary" onClick={() => setEditing(true)}><SquarePen size={16} />编辑合集</button>} />
      {editing ? <CollectionForm item={result.data.item} initial={result.data.photos} done={() => {
        setEditing(false)
        result.reload()
      }} cancel={() => setEditing(false)} />
        : result.data.photos.length
          ? <div className="album-grid">{result.data.photos.map((item, index) => <figure key={item.id}>
              <button type="button" className="photo-button album-photo" onClick={() => setPhoto(index)} aria-label={item.caption || '放大照片'}>
                <PrivateImage item={item} />
              </button>
              {item.caption && <figcaption>{item.caption}</figcaption>}
            </figure>)}</div>
          : <Empty title="这个合集还没有照片" />}
      {photo !== undefined && <Lightbox photos={result.data.photos} current={photo} setCurrent={setPhoto} close={() => setPhoto(undefined)} />}
    </>}
  </section>
}

function CollectionIndex() {
  const { member } = useBook()
  const [created, setCreated] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const result = useLoad('collections:' + page, async () => {
    const rows = unwrap(await db().from('photo_collections').select('*')
      .order('created_at', { ascending: false }).order('id').range(page * pageSize, (page + 1) * pageSize)) ?? []
    const items = rows.slice(0, pageSize)
    const covers = unwrap(await db().rpc('collection_covers', { targets: items.map(row => row.id) })) ?? []
    return { items, covers: new Map(covers.map(row => [row.collection_id, row.photo])), next: rows.length > pageSize }
  })
  async function remove(id: string) {
    if (!window.confirm('删除这个合集？其中的照片仍会留在原相册。')) return
    setError('')
    try {
      unwrap(await db().from('photo_collections').delete().eq('id', id).select('id').single())
      setCreated('')
      setPage(0)
      result.reload()
    } catch (failure) { setError(errorMessage(failure)) }
  }
  return <section className="page">
    <Back to="/album">返回回忆相册</Back>
    <PageHeading title="照片合集" action={member.role === 'admin' && !adding &&
      <button className="button" onClick={() => setAdding(true)}><Plus size={17} />新建合集</button>} />
    {adding && <CollectionForm initial={[]} cancel={() => setAdding(false)} done={id => {
      setAdding(false); setCreated(id); setPage(0); result.reload()
    }} />}
    <Feedback loading={result.loading} error={error || result.error} retry={result.reload} />
    {created && <p className="notice" role="status">合集已保存。 <Link to={'/collections/' + created}>打开合集</Link></p>}
    {!adding && result.data?.items.length === 0 && <Empty title="还没有照片合集">可以把想一起翻看的照片放到一处。</Empty>}
    <div className="album-grid">{result.data?.items.map(item => <article key={item.id} className="panel collection-card">
      <Link to={'/collections/' + item.id}>
        <div className="album-photo">{result.data?.covers.get(item.id)
          ? <PrivateImage item={result.data.covers.get(item.id)} alt="" />
          : <span className="story-paper"><Images size={26} /></span>}</div>
        <h2>{item.title}</h2>{item.description && <p>{item.description}</p>}
      </Link>
      {member.role === 'admin' && <button className="text-button danger" onClick={() => void remove(item.id)}>删除合集</button>}
    </article>)}</div>
    {result.data && <Pagination page={page} next={result.data.next} go={setPage} />}
  </section>
}

export default function Collections() {
  const { id } = useParams()
  return id ? <CollectionPage key={id} id={id} /> : <CollectionIndex />
}
