import { useState } from 'react'
import { ArrowUpRight, Feather, ImagePlus, Settings2, SquarePen, Trash2 } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useBook } from '../book-context'
import { CARD_COLUMNS, PAGE_SIZE, trashRecord } from '../data/book'
import { db, errorMessage, unwrap } from '../data/client'
import { dateLabel } from '../data/dates'
import { discardStaged } from '../data/media'
import type { Media } from '../data/types'
import { useLoad } from '../hooks'
import { Empty, Feedback, PageHeading } from '../ui/feedback'
import { Pagination } from '../ui/filters'

type Filter = 'draft' | 'published' | 'trash' | 'uploads'
type Table = 'stories' | 'diaries' | 'promises' | 'media'
type Entry = { id: string; label: string; date: string; table: Table; href?: string; upload?: Media }

async function overview() {
  const [stories, photos, diaries, recent, published] = await Promise.all([
    db().from('stories').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    db().from('media').select('id', { count: 'exact', head: true }).eq('state', 'ready').eq('media_type', 'image').is('deleted_at', null),
    db().from('diaries').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    db().from('stories').select(CARD_COLUMNS).is('deleted_at', null).order('updated_at', { ascending: false }).limit(1),
    db().from('stories').select(CARD_COLUMNS).eq('status', 'published').is('deleted_at', null)
      .order('published_at', { ascending: false }).limit(1),
  ])
  for (const result of [stories, photos, diaries]) unwrap(result)
  return { stories: stories.count, photos: photos.count, diaries: diaries.count,
    edited: unwrap(recent)?.[0], published: unwrap(published)?.[0] }
}

async function entriesFor(filter: Filter, type: Table, page: number, owner: string, admin: boolean) {
  const start = page * PAGE_SIZE
  const last = (page + 1) * PAGE_SIZE
  let rows: Entry[] = []
  if (filter === 'uploads') {
    let query = db().from('media').select('*').eq('state', 'staged')
      .lt('updated_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    if (!admin) query = query.eq('created_by', owner)
    const response = await query.order('updated_at', { ascending: false }).order('id').range(start, last)
    if (response.error) throw response.error
    const items = response.data ?? []
    rows = items.map(item => ({
      id: item.id, label: item.caption || (item.media_type === 'image' ? '未完成的照片上传' : '未完成的录音上传'),
      date: item.event_date, table: 'media', upload: item,
    }))
  } else if (type === 'stories' || type === 'diaries') {
    let query = type === 'stories'
      ? db().from('stories').select('id,title,event_date,author_id,status')
      : db().from('diaries').select('id,body,event_date,author_id,status')
    query = filter === 'trash' ? query.not('deleted_at', 'is', null) : query.eq('status', filter).is('deleted_at', null)
    if (!admin) query = query.eq('author_id', owner)
    const response = await query.order('updated_at', { ascending: false }).order('id').range(start, last)
    if (response.error) throw response.error
    const items = response.data ?? []
    rows = items.map(item => ({
      id: item.id, label: 'title' in item ? String(item.title) : String(item.body ?? '').slice(0, 72) || '一条日记草稿',
      date: item.event_date, table: type, href: '/edit/' + (type === 'stories' ? 'story' : 'diary') + '/' + item.id,
    }))
  } else if (type === 'media') {
    let query = db().from('media').select('*').eq('state', 'ready').not('deleted_at', 'is', null)
    if (!admin) query = query.eq('created_by', owner)
    const items = unwrap(await query.order('deleted_at', { ascending: false }).order('id').range(start, last)) ?? []
    rows = items.map(item => ({
      id: item.id, label: item.caption || (item.media_type === 'image' ? '相册照片' : '故事录音'), date: item.event_date, table: 'media',
    }))
  } else {
    let query = db().from('promises').select('*').not('deleted_at', 'is', null)
    if (!admin) query = query.eq('author_id', owner)
    const items = unwrap(await query.order('deleted_at', { ascending: false }).order('id').range(start, last)) ?? []
    rows = items.map(item => ({ id: item.id, label: item.title, date: item.created_at.slice(0, 10), table: 'promises' }))
  }
  return { rows: rows.slice(0, PAGE_SIZE), next: rows.length > PAGE_SIZE }
}

export default function Manage() {
  const { member } = useBook()
  const location = useLocation()
  const [filter, setFilter] = useState<Filter>('draft')
  const [table, setTable] = useState<Table>('stories')
  const [page, setPage] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<string>(typeof location.state?.notice === 'string' ? location.state.notice : '')
  const [busy, setBusy] = useState(false)
  const totals = useLoad('overview', overview)
  const list = useLoad([filter, table, page].join(':'), () => entriesFor(filter, table, page, member.id, member.role === 'admin'))
  async function alter(entry: Entry) {
    if (busy) return
    if (entry.upload && !window.confirm('清理这次未完成的上传？已经保存的照片不会被清理。')) return
    if (!entry.upload && filter !== 'trash' && !window.confirm('把这条记录移到回收站吗？')) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (entry.upload) await discardStaged(entry.upload)
      else await trashRecord(entry.table, entry.id, filter === 'trash')
      setPage(0)
      totals.reload()
      list.reload()
      setNotice(entry.upload ? '未完成的上传已清理。' : filter === 'trash' ? '记录已恢复。' : '记录已移到回收站。')
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }
  return <div className="page">
    <PageHeading title="管理中心" intro={member.role === 'admin' ? '管理故事书和两位成员的记录。' : '继续写你的草稿，整理自己留下的记录。'} />
    <div className="quick-actions">
      <Link to="/edit/story/new" className="button"><SquarePen size={16} />写故事</Link>
      <Link to="/edit/diary/new" className="button secondary"><Feather size={16} />写日记</Link>
      <Link to="/album" className="button secondary"><ImagePlus size={16} />管理照片</Link>
      <Link to="/letters" className="button secondary">管理我的信件</Link>
      {member.role === 'admin' && <Link to="/chapters" className="button secondary">管理章节</Link>}
      {member.role === 'admin' && <Link to="/settings" className="button secondary"><Settings2 size={16} />故事书设置</Link>}
    </div>
    <Feedback loading={totals.loading} error={totals.error} retry={totals.reload} />
    {totals.data && <>
      <dl className="stats">{(['stories', 'photos', 'diaries'] as const).map((key, index) =>
        <div key={key}><dt>{['故事', '照片', '日记'][index]}</dt><dd>{totals.data?.[key] ?? '—'}</dd></div>)}</dl>
      {(totals.data.edited || totals.data.published) && <div className="recent-list">
        {totals.data.edited && <Link to={'/stories/' + totals.data.edited.id}>最近修改 · {totals.data.edited.title}<ArrowUpRight size={14} /></Link>}
        {totals.data.published && <Link to={'/stories/' + totals.data.published.id}>最近发布 · {totals.data.published.title}<ArrowUpRight size={14} /></Link>}
      </div>}
    </>}
    <div className="manager-filter">
      <div className="segments" aria-label="记录状态">
        {([['draft', '草稿'], ['published', '已发布'], ['trash', '回收站'], ['uploads', '未完成上传']] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0); setTable('stories') }}>{label}</button>)}
      </div>
      {filter !== 'uploads' && <label className="content-kind">内容<select value={table} onChange={event => { setTable(event.target.value as Table); setPage(0) }}>
        <option value="stories">故事</option><option value="diaries">日记</option>
        {filter === 'trash' && <><option value="media">照片与录音</option><option value="promises">约定</option></>}
      </select></label>}
    </div>
    {filter === 'uploads' && <p className="field-help">可以清理一小时前开始、仍未保存的附件。清理会移除这次暂存的文件。</p>}
    {filter === 'trash' && <p className="field-help">移除的条目可在这里恢复。故事恢复后，未单独移除的照片也会一起回来。</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    <Feedback error={error} />
    <Feedback loading={list.loading} error={list.error} retry={list.reload} />
    {list.data && !list.data.rows.length && <Empty title="这里暂时没有记录" />}
    {Boolean(list.data?.rows.length) && <ul className="manage-list">
      {list.data?.rows.map(entry => <li key={entry.id}><div><strong>{entry.label}</strong><time dateTime={entry.date}>{dateLabel(entry.date)}</time></div>
        <div className="actions">
          {entry.href && filter !== 'trash' && <Link to={entry.href} className="button secondary small">继续编辑</Link>}
          <button className={filter === 'trash' ? 'button secondary small' : 'text-button danger'} disabled={busy} onClick={() => void alter(entry)}>
            {filter === 'trash' ? '恢复' : <><Trash2 size={15} />{entry.upload ? '清理' : '移除'}</>}
          </button>
        </div>
      </li>)}
    </ul>}
    {list.data && <Pagination page={page} next={list.data.next} go={setPage} />}
  </div>
}
