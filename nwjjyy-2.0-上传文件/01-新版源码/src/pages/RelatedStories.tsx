import { useState } from 'react'
import { ArrowUpRight, Link2, Plus, Search, X } from 'lucide-react'
import { Link } from 'react-router'
import { errorMessage } from '../data/client'
import { dateLabel } from '../data/dates'
import { findRelatedStories, linkStory, storyRelations, unlinkStory } from '../data/relations'
import { useLoad } from '../hooks'
import { Feedback } from '../ui/feedback'

export function RelatedStories({ id, editable }: { id: string; editable: boolean }) {
  const [manage, setManage] = useState(false)
  const [draftQuery, setDraftQuery] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const rows = useLoad('reader-relations:' + id, () => storyRelations(id), true)
  const search = useLoad(id + ':' + manage + ':' + query, () => manage ? findRelatedStories(id, query) : Promise.resolve([]))
  const visible = rows.data?.filter(row => row.story || editable) ?? []
  const available = search.data?.filter(row => !visible.some(link => link.id === row.id)) ?? []
  if (!editable && !visible.length && !rows.error) return null

  async function change(target: string, add: boolean) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (add) await linkStory(id, target)
      else await unlinkStory(id, target)
      setNotice(add ? '已关联回忆。' : '已移除关联。')
      rows.reload()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return <section className="chapter-related" aria-labelledby="chapter-related-title">
    <div className="chapter-related-heading">
      <h2 id="chapter-related-title"><Link2 size={19} aria-hidden="true"/>相关回忆</h2>
      {editable && <button type="button" className="button secondary small" aria-expanded={manage} onClick={() => setManage(!manage)}>
        {manage ? '完成管理' : '管理关联'}
      </button>}
    </div>
    <Feedback loading={rows.loading && !rows.data} error={rows.error} retry={rows.reload} />
    <Feedback error={error} />
    {notice && <p className="field-help" role="status">{notice}</p>}
    {visible.length > 0 && <ul className="chapter-related-list">
      {visible.map(({ id: target, story }) => <li key={target}>
        {story ? <Link to={'/stories/' + target}><span><small>{dateLabel(story.event_date)}</small><strong>{story.title}</strong></span><ArrowUpRight size={16} /></Link>
          : <p className="field-help">关联的故事已下架或移入回收站。</p>}
        {editable && manage && <button type="button" className="icon-button" disabled={busy || rows.loading}
          aria-label={story ? '移除关联：' + story.title : '移除这项失效关联'} onClick={() => void change(target, false)}><X size={15} /></button>}
      </li>)}
    </ul>}
    {manage && <div className="chapter-related-manage">
      <p className="field-help">这里添加的故事会出现在当前故事下方。</p>
      <form className="search-form" onSubmit={event => { event.preventDefault(); setQuery(draftQuery.trim()) }}>
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <input aria-label="搜索要关联的故事" placeholder="输入故事标题" maxLength={120}
            value={draftQuery} onChange={event => setDraftQuery(event.target.value)} />
        </label>
        <button type="submit" className="button secondary small">查找</button>
      </form>
      <Feedback loading={search.loading} error={search.error} retry={search.reload} />
      {search.data && !available.length && <p className="field-help">没有可添加的故事。</p>}
      {available.length > 0 && <ul className="chapter-related-results">
        {available.map(row => <li key={row.id}>
          <span>{row.title}<small>{dateLabel(row.event_date)}</small></span>
          <button type="button" className="button secondary small" disabled={busy || rows.loading}
            aria-label={'关联：' + row.title} onClick={() => void change(row.id, true)}><Plus size={15} />关联</button>
        </li>)}
      </ul>}
    </div>}
  </section>
}
