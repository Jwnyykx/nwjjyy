import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useBook } from '../book-context'
import { canEdit } from '../data/book'
import { db, errorMessage, unwrap } from '../data/client'
import { dateLabel } from '../data/dates'
import type { StoryRevision } from '../data/types'
import { useLoad } from '../hooks'
import { Back, Empty, Feedback, PageHeading } from '../ui/feedback'

export default function StoryHistory() {
  const { id = '' } = useParams()
  const { member, members } = useBook()
  const [page, setPage] = useState(0)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const data = useLoad(id + ':' + page, async () => {
    if (!/^[a-f0-9-]{36}$/i.test(id)) return null
    const story = unwrap(await db().from('stories').select('id,title,author_id,revision').eq('id', id).is('deleted_at', null).maybeSingle())
    if (!story || !canEdit(member, story.author_id)) return null
    const versions = unwrap(await db().from('story_revisions').select('*').eq('story_id', id)
      .order('revision', { ascending: false }).range(page * 10, page * 10 + 10)) ?? []
    return { story, versions }
  })
  async function restore(previous: StoryRevision) {
    if (saving || !data.data || !window.confirm('将标题、正文和日期等文字内容恢复到这个版本？现有照片和发布状态会保留。')) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      unwrap(await db().rpc('restore_story_text', { target: id, previous: previous.revision, expected: data.data.story.revision }))
      setNotice('已恢复这一版文字。')
      data.reload()
    } catch (failure) { setError(errorMessage(failure)) }
    finally { setSaving(false) }
  }
  return <section className="page narrow-page">
    <Back to={'/stories/' + id}>返回故事</Back>
    <PageHeading title="故事修改历史" intro="可以比较旧版标题与正文，再选择一版恢复。" />
    <Feedback loading={data.loading} error={error || data.error} retry={data.reload} />
    {notice && <p className="notice" role="status">{notice} <Link to={'/stories/' + id}>查看故事</Link></p>}
    {data.data === null && <Empty title="找不到有权限查看的历史" />}
    {data.data && <div className="form-stack">
      {data.data.versions.slice(0, 10).map((version, index) => <details className="panel history-entry" key={version.revision}>
        <summary>{version.snapshot.title} · 版本 {version.revision}</summary>
        <div className="metadata">
          <span>{members.find(item => item.id === version.editor_id)?.display_name ?? '升级时保存的版本'}</span>
          <time dateTime={version.saved_at}>{new Date(version.saved_at).toLocaleString('zh-CN')}</time>
        </div>
        <p className="field-help">故事日期 · {dateLabel(version.snapshot.event_date)}</p>
        <p className="preserve-lines">{version.snapshot.body || '该版本还没有正文。'}</p>
        {(page > 0 || index !== 0) && <button className="button secondary small" disabled={saving} onClick={() => void restore(version)}>
          恢复这版文字
        </button>}
      </details>)}
      <div className="actions">
        {page > 0 && <button className="button secondary small" onClick={() => setPage(page - 1)}>较新的版本</button>}
        {data.data.versions.length > 10 && <button className="button secondary small" onClick={() => setPage(page + 1)}>更早的版本</button>}
      </div>
    </div>}
  </section>
}
