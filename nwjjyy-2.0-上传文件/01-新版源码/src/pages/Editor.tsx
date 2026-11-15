import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Bold, Heading2, Minus, Quote } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { useBook } from '../book-context'
import { canEdit, getOrCreateDiary, getOrCreateStory, relatedMedia, saveDiary, saveStory, verifyPendingSave } from '../data/book'
import type { PendingSave } from '../data/book'
import { db, errorMessage, unwrap } from '../data/client'
import { todayIn, validDate } from '../data/dates'
import { fromMedia, mediaOrder, stageAll } from '../data/media'
import type { Diary, DiaryFields, Media, Publication, Story, StoryFields } from '../data/types'
import { useLoad, useUnsaved } from '../hooks'
import { AttachmentPicker } from '../ui/AttachmentPicker'
import { Back, Empty, Feedback, PageHeading } from '../ui/feedback'
import { Markdown } from '../ui/markdown'

type Kind = 'story' | 'diary'
type Initial = { kind: 'story'; row?: Story; media: Media[] } | { kind: 'diary'; row?: Diary; media: Media[] }

async function loadEditor(kind: Kind, id: string): Promise<Initial | null> {
  if (id === 'new') return kind === 'story' ? { kind: 'story', media: [] } : { kind: 'diary', media: [] }
  if (kind === 'story') {
    const row = unwrap(await db().from('stories').select('*').eq('id', id).is('deleted_at', null).maybeSingle())
    return row && { kind, row, media: await relatedMedia('story_id', id) }
  }
  const row = unwrap(await db().from('diaries').select('*').eq('id', id).is('deleted_at', null).maybeSingle())
  return row && { kind, row, media: await relatedMedia('diary_id', id) }
}

function EditorForm({ initial }: { initial: Initial }) {
  const { member, settings, categories } = useBook()
  const story = initial.kind === 'story' ? initial.row : undefined
  const diary = initial.kind === 'diary' ? initial.row : undefined
  const storyMode = initial.kind === 'story'
  const initialRow = initial.row
  const defaultDate = todayIn(settings.time_zone)
  const [recordId] = useState(() => initialRow?.id ?? crypto.randomUUID())
  const [eventDate, setEventDate] = useState(initialRow?.event_date ?? defaultDate)
  const [title, setTitle] = useState(story?.title ?? '')
  const [category, setCategory] = useState(story?.category_id ??
    categories.find(item => !item.archived && item.name === '日常')?.id ??
    categories.find(item => !item.archived)?.id ?? '')
  const [summary, setSummary] = useState(story?.summary ?? '')
  const [location, setLocation] = useState(story?.location ?? '')
  const [weather, setWeather] = useState(story?.weather ?? '')
  const [pinned, setPinned] = useState(story?.is_pinned ?? false)
  const [hidden, setHidden] = useState(story?.is_hidden ?? false)
  const [cover, setCover] = useState(story?.cover_media_id ?? null)
  const [body, setBody] = useState(initialRow?.body ?? '')
  const [mood, setMood] = useState(diary?.mood ?? '')
  const [showOnHome, setShowOnHome] = useState(diary?.show_on_home ?? true)
  const [attachments, setAttachments] = useState(initial.media.map(fromMedia))
  const [preview, setPreview] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState({ label: '', percent: 0 })
  const [attemptedDraft, setAttemptedDraft] = useState(false)
  const [notice, setNotice] = useState('')
  const knownRevision = useRef(initialRow?.revision)
  const pending = useRef<PendingSave>(null)
  const inFlight = useRef(false)
  const bodyField = useRef<HTMLTextAreaElement>(null)
  const allowLeave = useUnsaved(dirty, saving)
  const navigate = useNavigate()
  const back = story ? '/stories/' + story.id : storyMode ? '/manage' : '/diary'

  async function complete(status: Publication) {
    allowLeave()
    setDirty(false)
    await navigate(status === 'draft' ? '/manage' : storyMode ? (story ? '/stories/' + recordId : '/book') : '/diary', {
      replace: true, state: { notice: status === 'draft' ? '草稿已保存到故事书。' : '已保存并发布。' },
    })
  }

  function format(before: string, after: string, fallback: string) {
    const field = bodyField.current
    const start = field?.selectionStart ?? body.length
    const end = field?.selectionEnd ?? start
    const chosen = body.slice(start, end) || fallback
    const text = before + chosen + after
    if (body.length - (end - start) + text.length > (storyMode ? 60000 : 12000)) return
    setBody(body.slice(0, start) + text + body.slice(end))
    setDirty(true)
    setPreview(false)
    requestAnimationFrame(() => {
      bodyField.current?.focus()
      bodyField.current?.setSelectionRange(start + before.length, start + before.length + chosen.length)
    })
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    setNotice('')
    const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')
    const status: Publication = intent === 'draft' ? 'draft' : 'published'
    setError('')
    if (!validDate(eventDate)) { setError('请选择有效日期。'); return }
    if (storyMode && (!title.trim() || !category)) { setError('请填写故事标题、日期和分类。'); return }
    if (status === 'published' && !body.trim()) { setError('写下一段正文后就可以发布。'); return }
    if (initialRow?.status === 'published' && status === 'draft' &&
      !window.confirm('将这一页撤回为草稿？另一位成员将暂时不能阅读。')) return
    inFlight.current = true
    setSaving(true)
    setProgress({ label: '正在保存…', percent: 0 })
    const onProgress = (label: string, percent: number) => setProgress({ label, percent })
    const items = mediaOrder(attachments)
    try {
      if (pending.current && knownRevision.current !== undefined) {
        const saved = await verifyPendingSave(recordId, knownRevision.current, pending.current)
        if (saved) {
          const storedMedia = await relatedMedia(storyMode ? 'story_id' : 'diary_id', recordId)
          knownRevision.current = saved.revision
          pending.current = null
          setAttachments(current => current.map(item => {
            const existing = storedMedia.find(value => value.id === item.id)
            return existing ? { ...item, existing } : item
          }))
          setNotice('上一次提交已保存。你现在可以继续修改，再点保存。')
          return
        }
      }
      if (storyMode) {
        const fields: StoryFields = {
          title: title.trim(), event_date: eventDate, category_id: category, body,
          summary: summary.trim() || body.replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/[#>*_~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 128),
          location: location.trim(), weather: weather.trim(), status,
          is_pinned: pinned, is_hidden: hidden, cover_media_id: attachments.some(item => item.id === cover && item.kind === 'image') ? cover : null,
        }
        if (knownRevision.current === undefined) {
          knownRevision.current = (await getOrCreateStory(recordId, fields)).revision
          setAttemptedDraft(true)
        }
        await stageAll(attachments, { story_id: recordId, diary_id: null, category_id: category, event_date: eventDate }, onProgress)
        pending.current = { kind: 'story', fields, items }
        await saveStory(recordId, knownRevision.current, fields, items)
      } else {
        const fields: DiaryFields = { event_date: eventDate, body, mood: mood.trim(), status, show_on_home: showOnHome }
        if (knownRevision.current === undefined) {
          knownRevision.current = (await getOrCreateDiary(recordId, fields)).revision
          setAttemptedDraft(true)
        }
        await stageAll(attachments, { story_id: null, diary_id: recordId, category_id: null, event_date: eventDate }, onProgress)
        pending.current = { kind: 'diary', fields, items }
        await saveDiary(recordId, knownRevision.current, fields, items)
      }
      await complete(status)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return <div className="page editor-page">
    <Back to={back}>{story ? '返回故事' : '返回记录'}</Back>
    <PageHeading title={storyMode ? (story ? '编辑故事' : '写一段新故事') : (diary ? '修改日记' : '写一句今天的心情')}
      intro={initialRow?.status === 'published' ? '这页当前已发布。'
        : '草稿只对作者和管理员可见，发布后两位成员都能阅读。'} />
    {notice && <p role="status" className="notice">{notice}</p>}
    <form className="editor-form" onSubmit={save} onChange={() => setDirty(true)}>
      <fieldset className="panel editor-fields form-stack" disabled={saving}>
        {storyMode && <label>故事标题<input required value={title} maxLength={120} placeholder="给这段回忆起个名字"
          onChange={event => setTitle(event.target.value)} /></label>}
        <div className="form-grid">
          <label>{storyMode ? '故事日期' : '日记日期'}<input type="date" required value={eventDate} onChange={event => setEventDate(event.target.value)} /></label>
          {storyMode ? <label>分类<select required value={category} onChange={event => setCategory(event.target.value)}>
            <option value="">选择分类</option>
            {categories.filter(item => !item.archived || item.id === story?.category_id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label> : <label>心情（选填）<input maxLength={30} value={mood} placeholder="今天的心情"
            onChange={event => setMood(event.target.value)} /></label>}
        </div>
        <div className="form-stack body-editor">
          <div className="editor-toolbar">
            <label htmlFor="book-body">正文</label>
            {storyMode && <div className="toolbar-actions" role="group" aria-label="正文格式">
              <button className="icon-button" type="button" aria-label="添加小标题" onClick={() => format('\n\n## ', '\n\n', '小标题')}><Heading2 size={17} /></button>
              <button className="icon-button" type="button" aria-label="加粗" onClick={() => format('**', '**', '加粗文字')}><Bold size={17} /></button>
              <button className="icon-button" type="button" aria-label="添加引用" onClick={() => format('\n\n> ', '\n\n', '引用')}><Quote size={16} /></button>
              <button className="icon-button" type="button" aria-label="添加分隔线" onClick={() => format('\n\n---\n\n', '', '')}><Minus size={17} /></button>
              <button className="text-button small" type="button" aria-pressed={preview} onClick={() => setPreview(value => !value)}>{preview ? '返回编辑' : '预览'}</button>
            </div>}
          </div>
          {preview ? <div className="editor-preview"><Markdown text={body}
            photos={attachments.flatMap(item => item.existing?.media_type === 'image' ? [item.existing] : [])}
            pending={attachments.flatMap(item => item.previewUrl ? [{ id: item.id, src: item.previewUrl, caption: item.caption }] : [])} /></div>
            : <textarea id="book-body" ref={bodyField} rows={storyMode ? 10 : 6} value={body}
              maxLength={storyMode ? 60000 : 12000} placeholder="今天，有什么想记下来？"
              onChange={event => setBody(event.target.value)} />}
        </div>
        {storyMode ? <details className="editor-details"><summary>摘要、地点与天气</summary><div className="form-stack">
          <label>摘要（留空自动生成）<textarea rows={2} value={summary} maxLength={360} onChange={event => setSummary(event.target.value)} /></label>
          <div className="form-grid"><label>地点<input value={location} maxLength={100} onChange={event => setLocation(event.target.value)} /></label>
            <label>天气<input value={weather} maxLength={40} onChange={event => setWeather(event.target.value)} /></label></div>
        </div></details> : <label className="check"><input type="checkbox" checked={showOnHome}
          onChange={event => setShowOnHome(event.target.checked)} />发布后可以显示在首页的一句话里</label>}
      </fieldset>
      <fieldset className="panel editor-fields form-stack" disabled={saving}>
        <h2>{storyMode ? '这一页的照片与声音' : '给日记配一张照片'}</h2>
        <AttachmentPicker items={attachments} onChange={items => { setAttachments(items); setDirty(true) }} cover={cover}
          setCover={storyMode ? id => { setCover(id); setDirty(true) } : undefined} limit={storyMode ? 25 : 1} audio={storyMode}
          inline={storyMode ? item => {
            const photo = '\n\n![' + item.caption.replace(/[\[\]\n]/g, '') + '](photo:' + item.id + ')\n\n'
            if (body.length + photo.length <= 60000) {
              setBody(body + photo)
              setDirty(true)
              setPreview(false)
              requestAnimationFrame(() => bodyField.current?.focus())
            }
          } : undefined} />
        {storyMode && member.role === 'admin' && <label className="check"><input type="checkbox" checked={pinned}
          onChange={event => setPinned(event.target.checked)} />加入首页精选回忆</label>}
        {storyMode && member.role === 'admin' && <label className="check"><input type="checkbox" checked={hidden}
          onChange={event => setHidden(event.target.checked)} />从目录隐藏，保留成员专属链接</label>}
      </fieldset>
      <Feedback error={error} />
      {error && attemptedDraft && <p className="field-help">这次发布未完成，已创建的草稿可在管理中心找到。也可以留在本页重新提交。</p>}
      {saving && <div className="progress-box" role="status"><span>{progress.label}</span><progress max={100} value={progress.percent} /></div>}
      <div className="editor-actions">
        <Link className="text-button" to={back}>返回</Link>
        <button type="submit" className="button secondary" value="draft" disabled={saving}>{initialRow?.status === 'published' ? '撤回为草稿' : '保存草稿'}</button>
        <button type="submit" className="button" value="publish" disabled={saving}>
          {saving ? '保存中…' : initialRow?.status === 'published' ? '保存更新' : '发布'}
        </button>
      </div>
    </form>
  </div>
}

function RouteEditor({ kind, id }: { kind: Kind; id: string }) {
  const { member } = useBook()
  const result = useLoad(kind + ':' + id, () => loadEditor(kind, id))
  if (result.data && (!result.data.row || canEdit(member, result.data.row.author_id))) return <EditorForm initial={result.data} />
  return <div className="page">
    <Back to="/manage">返回管理中心</Back>
    <Feedback loading={result.loading} error={result.error} retry={result.reload} />
    {!result.loading && !result.error && <Empty title="这一页无法编辑">仅作者或管理员可以编辑未移除的记录。</Empty>}
  </div>
}

export default function Editor() {
  const { kind, id } = useParams()
  return (kind === 'story' || kind === 'diary') && id && (id === 'new' || /^[0-9a-f-]{36}$/i.test(id))
    ? <RouteEditor kind={kind} id={id} key={kind + id} /> : <div className="page"><Empty title="没有找到要编辑的内容" /></div>
}
