import { useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Flag, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { useBook } from '../book-context'
import { canEdit, PAGE_SIZE, trashRecord } from '../data/book'
import { db, errorMessage, unwrap } from '../data/client'
import { dateLabel, todayIn, validDate } from '../data/dates'
import type { PromiseNote } from '../data/types'
import { useLoad, useUnsaved } from '../hooks'
import { Empty, Feedback, PageHeading } from '../ui/feedback'
import { Pagination } from '../ui/filters'

async function listPromises(page: number) {
  const rows = unwrap(await db().from('promises').select('*').is('deleted_at', null)
    .order('completed_on', { ascending: false, nullsFirst: true })
    .order('created_at', { ascending: false }).order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) ?? []
  const linked = rows.flatMap(item => item.story_id ? [item.story_id] : [])
  const stories = linked.length ? unwrap(await db().from('stories').select('id,title').in('id', linked)
    .eq('status', 'published').is('deleted_at', null)) ?? [] : []
  return { rows: rows.slice(0, PAGE_SIZE), stories, next: rows.length > PAGE_SIZE }
}

function PromiseEditor({ row, close, done }: { row?: PromiseNote; close: () => void; done: () => void }) {
  const { settings } = useBook()
  const [title, setTitle] = useState(row?.title ?? '')
  const [description, setDescription] = useState(row?.description ?? '')
  const [targetDate, setTargetDate] = useState(row?.target_date ?? '')
  const [completed, setCompleted] = useState(row?.completed_on ?? '')
  const [story, setStory] = useState(row?.story_id ?? '')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const storyChoices = useLoad((completed ? 'complete:' : 'open:') + search, async () => {
    if (!completed) return []
    let request = db().from('stories').select('id,title').eq('status', 'published').is('deleted_at', null)
    if (search) request = request.ilike('title', '%' + search.replace(/[\\%_]/g, value => '\\' + value) + '%')
    const options = unwrap(await request.order('event_date', { ascending: false }).limit(40)) ?? []
    if (row?.story_id && !options.some(item => item.id === row.story_id)) {
      const existing = unwrap(await db().from('stories').select('id,title').eq('id', row.story_id)
        .eq('status', 'published').is('deleted_at', null).maybeSingle())
      if (existing) options.unshift(existing)
    }
    return options
  })
  const clear = useUnsaved(dirty, saving)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving || !title.trim()) return
    if ((targetDate && !validDate(targetDate)) || (completed && !validDate(completed))) {
      setError('请选择有效日期。')
      return
    }
    setSaving(true)
    setError('')
    const values = {
      title: title.trim(), description, target_date: targetDate || null,
      completed_on: completed || null, story_id: completed ? story || null : null,
    }
    try {
      const result = row
        ? await db().from('promises').update(values).eq('id', row.id).is('deleted_at', null).select('id').single()
        : await db().from('promises').insert(values).select('id').single()
      unwrap(result)
      clear()
      done()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }

  return <form className="panel form-stack" onSubmit={save} onChange={() => setDirty(true)}>
    <h2>{row ? '修改约定' : '写下一个约定'}</h2>
    <label>约定标题<input value={title} required maxLength={120} onChange={event => setTitle(event.target.value)} /></label>
    <label>想一起做的事<textarea rows={4} value={description} maxLength={12000} onChange={event => setDescription(event.target.value)} /></label>
    <div className="form-grid">
      <label>期待的日子（选填）<input type="date" value={targetDate} onChange={event => setTargetDate(event.target.value)} /></label>
      <label>完成日期（选填）<input type="date" value={completed} onChange={event => setCompleted(event.target.value)} /></label>
    </div>
    {!completed && <button className="text-button" type="button" onClick={() => { setCompleted(todayIn(settings.time_zone)); setDirty(true) }}>
      <Check size={16} />标记今天完成</button>}
    {completed && <div className="form-stack">
      <div className="search-form"><label>搜索可以关联的故事<input value={query} maxLength={120} onChange={event => setQuery(event.target.value)} /></label>
        <button type="button" className="button secondary small" onClick={() => setSearch(query.trim())}>搜索故事</button></div>
      <label>关联回忆（选填）<select value={story} onChange={event => setStory(event.target.value)}>
        <option value="">暂不关联</option>
        {story && !storyChoices.data?.some(item => item.id === story) && <option value={story}>已选择的故事</option>}
        {storyChoices.data?.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}
      </select></label>
      <Feedback error={storyChoices.error} retry={storyChoices.reload} />
    </div>}
    <Feedback error={error} />
    <div className="actions"><button className="button" disabled={saving}>{saving ? '保存中…' : '保存约定'}</button>
      <button className="button secondary" type="button" disabled={saving} onClick={() => {
        if (!dirty || window.confirm('放弃这次未保存的修改吗？')) close()
      }}>取消</button></div>
  </form>
}

export default function Promises() {
  const { member, members } = useBook()
  const [editing, setEditing] = useState<{ row?: PromiseNote }>()
  const [page, setPage] = useState(0)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState(false)
  const result = useLoad('promises:' + page, () => listPromises(page))
  async function remove(id: string) {
    if (removing || !window.confirm('把这个约定移到回收站吗？')) return
    setRemoving(true)
    setError('')
    try {
      await trashRecord('promises', id)
      setPage(0)
      result.reload()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setRemoving(false)
    }
  }
  return <div className="page">
    <PageHeading title="未来的约定" intro="还有好多故事，等着我们一起去经历。"
      action={<button className="button" disabled={Boolean(editing)} onClick={() => setEditing({})}><Plus size={19} />写下约定</button>} />
    {editing && <PromiseEditor key={editing.row?.id ?? 'new'} row={editing.row} close={() => setEditing(undefined)}
      done={() => { setEditing(undefined); setPage(0); result.reload() }} />}
    <Feedback error={error} />
    <Feedback loading={result.loading} error={result.error} retry={result.reload} />
    {result.data && !result.data.rows.length && !editing && <Empty title="把想一起做的事写下来"
      action={<button className="button secondary" onClick={() => setEditing({})}>写第一个约定</button>} />}
    <div className="promise-list">{result.data?.rows.map(row => {
      const story = result.data?.stories.find(item => item.id === row.story_id)
      return <article className="promise-card" key={row.id}>
        <span className="promise-icon">{row.completed_on ? <Check size={20} /> : <Flag size={19} />}</span>
        <div><div className="metadata"><span>{row.completed_on ? '已完成' : '待实现'}</span><span>{members.find(item => item.id === row.author_id)?.display_name}</span></div>
          <h2>{row.title}</h2>{row.description && <p className="preserve-lines">{row.description}</p>}
          {row.completed_on ? <p className="field-help">完成于 {dateLabel(row.completed_on)}</p> : row.target_date && <p className="field-help">期待 {dateLabel(row.target_date)}</p>}
          {story && <Link className="text-button" to={'/stories/' + story.id}>翻开回忆 · {story.title}</Link>}
          {canEdit(member, row.author_id) && <div className="actions">
            <button className="text-button" disabled={Boolean(editing)} onClick={() => { setEditing({ row }); window.scrollTo(0, 0) }}>编辑约定</button>
            <button className="icon-button danger" disabled={removing || Boolean(editing)} aria-label="移除约定" onClick={() => void remove(row.id)}><Trash2 size={16} /></button>
          </div>}
        </div>
      </article>
    })}</div>
    {result.data && <Pagination page={page} next={result.data.next} go={setPage} />}
  </div>
}
