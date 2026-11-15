import { useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Plus, Search } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useBook } from '../book-context'
import { chapterChoices, chapterDirectory, chapterEntries, assignChapterStory, saveChapter } from '../data/chapters'
import { db, errorMessage, unwrap } from '../data/client'
import { dateLabel } from '../data/dates'
import type { ChapterSummary } from '../data/types'
import { useLoad } from '../hooks'
import { Empty, Feedback } from '../ui/feedback'
import { Pagination } from '../ui/filters'
import './timeline.css'

type Mutation = (action: () => Promise<unknown>, message: string) => Promise<boolean>

function ChapterForm({ chapter, rank, onSave }: {
  chapter?: ChapterSummary; rank: number
  onSave: (fields: { title: string; description: string; sort_order: number }) => Promise<boolean>
}) {
  const [title, setTitle] = useState(chapter?.title ?? '')
  const [description, setDescription] = useState(chapter?.description ?? '')
  const [position, setPosition] = useState(chapter?.sort_order ?? rank)
  const [busy, setBusy] = useState(false)

  return <form className="panel form-stack" onSubmit={async event => {
    event.preventDefault()
    if (busy || !title.trim()) return
    setBusy(true)
    try {
      await onSave({ title: title.trim(), description: description.trim(), sort_order: position })
    } finally {
      setBusy(false)
    }
  }}>
    <h2>{chapter ? '编辑章节' : '添加章节'}</h2>
    <label>章节名称<input required maxLength={100} value={title} onChange={event => setTitle(event.target.value)} /></label>
    <label>简介<textarea maxLength={500} rows={3} value={description} onChange={event => setDescription(event.target.value)} /></label>
    <label>章节顺序<input required type="number" min={0} max={10000} step={1} value={position}
      onChange={event => setPosition(Number(event.target.value))} /></label>
    <small className="field-help">数字越小越靠前。可以用 10、20、30 留出位置。</small>
    <div className="actions"><button type="submit" className="button" disabled={busy || !title.trim()}>{busy ? '保存中…' : '保存章节'}</button></div>
  </form>
}

function EntryOrder({ storyId, title, rank, mutate, disabled }: {
  storyId: string; title: string; rank: number; mutate: Mutation; disabled: boolean
}) {
  const [position, setPosition] = useState(rank)
  return <form className="chapter-entry-order" onSubmit={event => {
    event.preventDefault()
    if (position === rank || disabled) return
    void mutate(async () => unwrap(await db().from('chapter_entries').update({ sort_order: position }).eq('story_id', storyId).select().single()), '故事顺序已更新。')
  }}>
    <label>故事顺序<input aria-label={title + '的顺序'} type="number" required min={0} max={10000} step={1} value={position}
      onChange={event => setPosition(Number(event.target.value))} /></label>
    <button type="submit" className="button secondary small" disabled={disabled || position === rank}>保存顺序</button>
  </form>
}

function ChapterStories({ chapter, chapters, mutate, busy, version }: {
  chapter: ChapterSummary; chapters: ChapterSummary[]; mutate: Mutation; busy: boolean; version: number
}) {
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(0)
  const entries = useLoad(JSON.stringify([chapter.id, page, version]), () => chapterEntries(chapter.id, page))
  const choices = useLoad(JSON.stringify([term, version]), () => chapterChoices(term))
  return <>
    <section className="panel chapter-manager-stories">
      <div className="section-heading"><h2>章节内的故事</h2>
        {chapter.cover_story_id && <button type="button" className="text-button" disabled={busy} onClick={() => void mutate(
          async () => unwrap(await db().from('chapters').update({ cover_story_id: null }).eq('id', chapter.id).select().single()), '已恢复自动选择封面。',
        )}>自动选择封面</button>}
      </div>
      <p className="field-help">故事按顺序数字排列。读者只能看到已发布的故事。</p>
      <Feedback loading={entries.loading} error={entries.error} retry={entries.reload} />
      {entries.data?.rows.length === 0 && <p className="field-help">这章暂时没有故事。</p>}
      {entries.data && <ul className="chapter-entry-list">{entries.data.rows.map(entry => {
        const story = entry.story
        const title = story?.title ?? '未找到故事'
        const cover = chapter.cover_story_id === entry.story_id
        return <li key={entry.story_id}>
          <div className="chapter-entry-label"><strong>{title}</strong>
            {story && (story.deleted_at || story.status !== 'published') && <small>{story.deleted_at ? '已删除' : '草稿'}</small>}</div>
          <div className="chapter-entry-actions">
            <EntryOrder key={entry.sort_order} storyId={entry.story_id} title={title} rank={entry.sort_order} mutate={mutate} disabled={busy} />
            <div className="actions">
              {story?.cover_media_id && !story.deleted_at && story.status === 'published' && <button type="button"
                className="text-button" disabled={busy || cover} onClick={() => void mutate(
                  async () => unwrap(await db().from('chapters').update({ cover_story_id: entry.story_id }).eq('id', chapter.id).select().single()),
                  '章节封面已更新。',
                )}>{cover ? '当前封面' : '用作章节封面'}</button>}
              <button type="button" className="text-button" disabled={busy} aria-label={'移出《' + title + '》'}
                onClick={async () => {
                  const success = await mutate(
                    async () => unwrap(await db().from('chapter_entries').delete().eq('story_id', entry.story_id).eq('chapter_id', chapter.id).select().single()),
                    '故事已移出章节。',
                  )
                  if (success && entries.data?.rows.length === 1 && page > 0) setPage(page - 1)
                }}>移出章节</button>
            </div>
          </div>
        </li>
      })}</ul>}
      {entries.data && <Pagination page={page} next={entries.data.next} go={setPage} />}
    </section>
    <section className="panel chapter-manager-stories">
      <h2>添加故事</h2>
      <form role="search" aria-label="查找可添加的故事" className="search-form" onSubmit={event => { event.preventDefault(); setTerm(search.trim()) }}>
        <label className="search-field"><Search size={18} aria-hidden="true" /><input type="search" aria-label="查找已发布故事" placeholder="按标题或正文查找"
          maxLength={120} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <button type="submit" className="button secondary small">查找</button>
      </form>
      <Feedback loading={choices.loading} error={choices.error} retry={choices.reload} />
      {choices.data?.length === 0 && <p className="field-help">{term ? '没有找到故事。' : '发布故事后就可以把它加到章节里。'}</p>}
      {choices.data && choices.data.length > 0 && <ul className="chapter-entry-list">{choices.data.map(story => {
        const selected = story.entry?.chapter_id === chapter.id
        const origin = chapters.find(item => item.id === story.entry?.chapter_id)
        return <li key={story.id}><div className="chapter-entry-label"><strong>{story.title}</strong><small>{dateLabel(story.event_date)}{origin ? ' · ' + origin.title : ''}</small></div>
          <button type="button" className="button secondary small" disabled={busy || selected} aria-label={(selected ? '已加入《' : origin ? '移入《' : '加入《') + story.title + '》'}
            onClick={() => {
              if (origin && !window.confirm('将《' + story.title + '》从「' + origin.title + '」移到当前章节？')) return
              void mutate(() => assignChapterStory(story.id, chapter.id, Boolean(story.entry)), '故事已加入章节。')
            }}>{selected ? '已加入' : origin ? '移到这章' : '加入这章'}</button>
        </li>
      })}</ul>}
    </section>
  </>
}

export default function Chapters() {
  const { member } = useBook()
  if (member.role !== 'admin') return <Navigate to="/stories?view=chapters" replace />
  return <ChapterManager />
}

function ChapterManager() {
  const [params, setParams] = useSearchParams()
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const result = useLoad('chapter-manager', chapterDirectory, true)
  const rows = result.data?.rows ?? []
  const current = rows.find(row => row.id === params.get('id'))
  const rank = Math.min(10000, (rows.at(-1)?.sort_order ?? 0) + 10)
  const pending = busy || result.loading

  async function mutate(action: () => Promise<unknown>, message: string) {
    if (pending) return false
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      setVersion(value => value + 1)
      result.reload()
      setNotice(message)
      return true
    } catch (cause) {
      setError(errorMessage(cause))
      return false
    } finally {
      setBusy(false)
    }
  }

  return <div className="page story-catalogue chapter-manager">
    <Link className="back" to="/stories?view=chapters"><ArrowLeft size={17} aria-hidden="true" />返回章节目录</Link>
    <header className="catalogue-head">
      <div><p className="catalogue-kicker"><BookOpen size={17} aria-hidden="true" />管理中心</p><h1>章节管理</h1>
        <p>设置章节顺序和封面，把已发布的故事放进章节。</p></div>
    </header>
    <Feedback loading={result.loading} error={result.error} retry={result.reload} />
    <Feedback error={error} />
    {notice && <p role="status" className="notice">{notice}</p>}
    {result.data && <div className="catalogue-layout">
      <aside className="catalogue-index" aria-label="章节列表"><div className="catalogue-index-inner">
        <Link to={{ search: '' }} className="button secondary small"><Plus size={16} aria-hidden="true" />新建章节</Link>
        <nav className="chapter-admin-nav" aria-label="选择章节">
          {rows.map((row, index) => <Link key={row.id} to={{ search: 'id=' + row.id }} aria-current={current?.id === row.id ? 'page' : undefined}>
            <span>{String(index + 1).padStart(2, '0')}</span>{row.title}</Link>)}
        </nav>
      </div></aside>
      <div className="chapter-admin-body">
        {params.has('id') && !current && !result.loading && <Empty title="这个章节暂时找不到。" />}
        {(!params.has('id') || current) && <ChapterForm key={current?.id ?? 'new'} chapter={current} rank={rank}
          onSave={fields => mutate(async () => {
            const saved = await saveChapter({ ...fields, cover_story_id: current?.cover_story_id ?? null }, current?.id)
            if (!current) setParams({ id: saved.id })
          }, '章节已保存。')} />}
        {current && <>
          <div className="chapter-admin-controls">
            <Link className="text-button" to={'/stories?view=chapters&chapter=' + current.id}>预览这个章节 <ArrowRight size={16} aria-hidden="true" /></Link>
            <button type="button" className="text-button danger" disabled={pending} onClick={() => {
              if (!window.confirm('删除「' + current.title + '」？章内故事仍会保留在时间轴。')) return
              void mutate(async () => {
                unwrap(await db().from('chapters').delete().eq('id', current.id).select().single())
                setParams({})
              }, '章节已移除，故事仍可从时间轴阅读。')
            }}>删除章节</button>
          </div>
          <ChapterStories key={current.id} chapter={current} chapters={rows} mutate={mutate} busy={pending} version={version} />
        </>}
      </div>
    </div>}
  </div>
}
