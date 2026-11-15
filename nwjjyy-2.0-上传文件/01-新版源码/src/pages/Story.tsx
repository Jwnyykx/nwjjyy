import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Bookmark, BookOpen, Images, MapPin, PenLine, SquarePen, Trash2, Volume2 } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useBook } from '../book-context'
import { canEdit, storyDetail, trashRecord } from '../data/book'
import { db, errorMessage, unwrap } from '../data/client'
import { dateLabel } from '../data/dates'
import { useReader } from '../data/reader'
import type { Media, Perspective, Story as StoryRecord } from '../data/types'
import { useLoad, useUnsaved } from '../hooks'
import { Back, Empty, Feedback } from '../ui/feedback'
import { Lightbox, PrivateAudio, PrivateImage } from '../ui/media'
import { Markdown } from '../ui/markdown'
import { ReadingNavigation } from './ReadingNavigation'
import type { ReaderSection } from './ReadingNavigation'
import { RelatedStories } from './RelatedStories'
import './story-reader.css'

const photoTag = /\n\n!\[\]\(photo:([a-f0-9-]{36})\)$/i

function unpackPerspective(value: string) {
  const photos: string[] = []
  let body = value
  for (let tail = body.match(photoTag); tail; tail = body.match(photoTag)) {
    photos.unshift(tail[1])
    body = body.slice(0, tail.index)
  }
  return { body, photos }
}

function PerspectiveEditor({ id, initial, photos, onSaved }: {
  id: string; initial?: Perspective; photos: Media[]; onSaved: () => void
}) {
  const { member } = useBook()
  const initialText = unpackPerspective(initial?.body ?? '')
  const [body, setBody] = useState(initialText.body)
  const [attached, setAttached] = useState(initialText.photos)
  const [edit, setEdit] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const edited = body !== initialText.body || attached.join(' ') !== initialText.photos.join(' ')
  const clear = useUnsaved(edit && edited, sending)
  async function save(event?: FormEvent) {
    event?.preventDefault()
    if (sending) return
    if (!event && !window.confirm('确定移除你写的这一段视角吗？')) return
    const photoTags = attached.filter(photo => photos.some(item => item.id === photo))
      .map(photo => '\n\n![](photo:' + photo + ')').join('')
    const content = body.trim() + photoTags
    if (event && content.length > 15000) {
      setError('文字和照片合计超过上限，请缩短文字后重试。')
      return
    }
    setSending(true)
    setError('')
    try {
      if (!event) unwrap(await db().from('perspectives').delete().eq('story_id', id).eq('author_id', member.id))
      else if (initial) unwrap(await db().from('perspectives').update({ body: content }).eq('story_id', id).eq('author_id', member.id).select('story_id').single())
      else unwrap(await db().from('perspectives').insert({ story_id: id, body: content }))
      clear()
      setEdit(false)
      onSaved()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSending(false)
    }
  }
  if (!edit) return <button className="button secondary small" onClick={() => setEdit(true)}>{initial ? '修改我的视角' : '写下我的视角'}</button>
  return <form className="panel form-stack" onSubmit={save}>
    <label>{member.display_name}的视角<textarea rows={5} value={body} maxLength={15000} required onChange={event => setBody(event.target.value)} /></label>
    {photos.length > 0 && <fieldset className="perspective-photos">
      <legend>从本篇照片中选择</legend>
      <div>
        {photos.map((photo, index) => <label key={photo.id}>
          <PrivateImage item={photo} alt="" />
          <span><input type="checkbox" checked={attached.includes(photo.id)} onChange={event => {
            const checked = event.target.checked
            setAttached(previous => checked ? [...previous, photo.id] : previous.filter(value => value !== photo.id))
          }} />{photo.caption || '照片 ' + (index + 1)}</span>
        </label>)}
      </div>
    </fieldset>}
    <Feedback error={error} />
    <div className="actions"><button className="button small" disabled={sending || !body.trim()}>{sending ? '保存中…' : '保存视角'}</button>
      <button className="button secondary small" disabled={sending} type="button" onClick={() => {
        if (!edited || window.confirm('放弃这段未保存的视角吗？')) {
          setBody(initialText.body)
          setAttached(initialText.photos)
          setEdit(false)
        }
      }}>取消</button>
      {initial && <button className="text-button danger" type="button" disabled={sending} onClick={() => void save()}>移除视角</button>}
    </div>
  </form>
}

function PerspectivePages({ story, perspectives, selected, onSelect, photos, onPhoto }: {
  story: StoryRecord; perspectives: Perspective[]; selected: string; onSelect: (id: string) => void
  photos: Media[]; onPhoto: (index: number) => void
}) {
  const { members, settings } = useBook()
  const writers = members.slice().sort((a, b) => a.role.localeCompare(b.role))
  const active = writers.some(writer => writer.id === selected) ? selected : writers[0]?.id
  return <>
    <div className="chapter-perspective-tabs" role="tablist" aria-label="选择写故事的人">
      {writers.map((writer, index) => <button type="button" key={writer.id} role="tab"
        id={'perspective-tab-' + writer.id} aria-controls={'perspective-panel-' + writer.id}
        aria-selected={active === writer.id} tabIndex={active === writer.id ? 0 : -1}
        onClick={() => onSelect(writer.id)}
        onKeyDown={event => {
          const target = event.key === 'ArrowLeft' ? (index - 1 + writers.length) % writers.length
            : event.key === 'ArrowRight' ? (index + 1) % writers.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? writers.length - 1 : null
          if (target === null) return
          event.preventDefault()
          const id = writers[target].id
          onSelect(id)
          document.getElementById('perspective-tab-' + id)?.focus()
        }}>{writer.display_name}的视角</button>)}
    </div>
    <div className="chapter-letters">
      {writers.map(writer => {
        const note = perspectives.find(item => item.author_id === writer.id)
        const original = !note && writer.id === story.author_id && story.body.trim()
        const created = note && (note.created_at || note.updated_at)
        const timestamp = created && new Date(created)
        return <div className={'chapter-letter' + (writer.id === active ? ' is-current' : '')}
          key={writer.id} role="tabpanel" id={'perspective-panel-' + writer.id}
          aria-label={writer.display_name + '写下的回忆'}>
          <h3><PenLine size={15} aria-hidden="true" />{writer.display_name}的视角</h3>
          {note ? <>
            {timestamp && Number.isFinite(timestamp.getTime()) && <time dateTime={created}>写于 {timestamp.toLocaleDateString('zh-CN', {
              timeZone: settings.time_zone, year: 'numeric', month: 'long', day: 'numeric',
            })}</time>}
            <Markdown text={note.body} photos={photos} onPhoto={onPhoto} />
          </> : original ? <>
            <p className="chapter-letter-excerpt">{story.body.replace(/!\[[^\]]*\]\(photo:[a-f0-9-]{36}\)/gi, '').trim().slice(0, 160)}{story.body.length > 160 && '…'}</p>
            <button className="text-button" type="button" onClick={() => {
              const target = document.getElementById('chapter-body')
              target?.focus({ preventScroll: true })
              target?.scrollIntoView()
            }}>阅读完整正文</button>
          </> : <p className="reader-empty-copy">这一天，在你的眼里是什么样的？</p>}
        </div>
      })}
    </div>
  </>
}

function StoryPage({ id }: { id: string }) {
  const { member, categories, members } = useBook()
  const result = useLoad('story:' + id, () => storyDetail(id), true)
  const { saved, toggle, remember } = useReader()
  const [photo, setPhoto] = useState<number>()
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState(false)
  const [perspective, setPerspective] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const data = result.data
  const title = data?.story.title
  const publication = data?.story.status
  useEffect(() => {
    if (publication === 'published' && title) remember({ id, title })
  }, [id, publication, remember, title])
  if (!data) return <div className="page story-reading"><Back to="/stories">返回故事</Back>
    <Feedback loading={result.loading} error={result.error} retry={result.reload} />
    {data === null && <Empty title="这一页暂时无法阅读">它可能尚未发布，或者已经被移到回收站。</Empty>}</div>

  const { story, perspectives, media, previous, next } = data
  const photos = media.filter(item => item.media_type === 'image')
  const audio = media.filter(item => item.media_type === 'audio')
  const selectedCover = photos.findIndex(item => item.id === story.cover_media_id)
  const cover = selectedCover >= 0 ? selectedCover : photos.length > 0 ? 0 : -1
  const gallery = photos.flatMap((item, index) => index === cover ? [] : [{ item, index }])
  const author = (authorId: string) => members.find(item => item.id === authorId)?.display_name ?? '成员'
  const category = categories.find(item => item.id === story.category_id)?.name
  const permitted = canEdit(member, story.author_id)
  const isSaved = saved.includes(id)
  const myPerspective = perspectives.find(item => item.author_id === member.id)
  const sections: ReaderSection[] = [{ id: 'chapter-body', label: '正文', icon: BookOpen }]
  if (gallery.length) sections.push({ id: 'chapter-photos', label: '照片', icon: Images })
  if (audio.length) sections.push({ id: 'chapter-audio', label: '录音', icon: Volume2 })
  sections.push({ id: 'chapter-perspectives', label: '两个人的视角', icon: PenLine })
  async function remove() {
    if (removing || !window.confirm('把这篇故事移到回收站？你可以从管理中心恢复它。')) return
    setRemoving(true)
    setError('')
    try {
      await trashRecord('stories', id)
      await navigate('/stories')
    } catch (failure) {
      setError(errorMessage(failure))
      setRemoving(false)
    }
  }
  return <article className="page story-reading chapter-reader">
    <div className="reading-actions">
      <Back to="/stories">返回故事</Back>
      <div className="actions">
        {story.status === 'published' && <button className="button secondary small reader-bookmark" type="button"
          aria-pressed={isSaved} onClick={() => toggle(id)}>
          <Bookmark size={16} aria-hidden="true" fill={isSaved ? 'currentColor' : 'none'} />
          {isSaved ? '已收藏' : '收藏'}
        </button>}
        {permitted && <>
          <Link className="button secondary small" to={'/edit/story/' + id}><SquarePen size={15} />编辑</Link>
          <Link className="text-button" to={'/history/' + id}>修改历史</Link>
          <button className="icon-button danger" type="button" aria-label="移到回收站" disabled={removing}
            onClick={() => void remove()}><Trash2 size={17} /></button>
        </>}
      </div>
    </div>
    <Feedback error={error} />
    {typeof location.state?.notice === 'string' && <p className="notice" role="status">{location.state.notice}</p>}
    <header className={'chapter-heading' + (cover < 0 ? ' chapter-heading-text' : '')}>
      <div className="chapter-heading-copy">
        <div className="metadata">
          <time dateTime={story.event_date}>{dateLabel(story.event_date)}</time>
          {category && <span>{category}</span>}
          {story.status === 'draft' && <span className="badge">草稿</span>}
          {story.is_hidden && <span className="badge">专属链接</span>}
        </div>
        <h1>{story.title}</h1>
        {story.summary && <p className="chapter-summary">{story.summary}</p>}
        <div className="chapter-byline">
          <span><PenLine size={15} />{author(story.author_id)} 记</span>
          {(story.location || story.weather) && <span><MapPin size={15} />{[story.location, story.weather].filter(Boolean).join(' · ')}</span>}
        </div>
      </div>
      {cover >= 0 && <figure className="chapter-cover">
        <button type="button" className="photo-button" onClick={() => setPhoto(cover)} aria-label="放大封面">
          <PrivateImage item={photos[cover]} eager />
          <span className="chapter-cover-zoom" aria-hidden="true"><Images size={17} /></span>
        </button>
        {photos[cover].caption && <figcaption>{photos[cover].caption}</figcaption>}
      </figure>}
    </header>
    <div className="chapter-pages">
      <ReadingNavigation sections={sections} />
      <div className="chapter-paper">
        <section id="chapter-body" tabIndex={-1} aria-label="正文">
          {story.body.trim() ? <Markdown text={story.body} photos={photos} onPhoto={setPhoto} />
            : <p className="reader-empty-copy">这篇故事还没有写正文。</p>}
        </section>
        {gallery.length > 0 && <section id="chapter-photos" className="chapter-section" tabIndex={-1}>
          <h2>这一页的照片</h2>
          <div className="reading-photos">
            {gallery.map(({ item, index }) => <figure key={item.id}>
              <button type="button" className="photo-button" aria-label={item.caption || '放大第 ' + (index + 1) + ' 张照片'}
                onClick={() => setPhoto(index)}><PrivateImage item={item} /></button>
              {item.caption && <figcaption>{item.caption}</figcaption>}
            </figure>)}
          </div>
        </section>}
        {audio.length > 0 && <section id="chapter-audio" className="chapter-section" tabIndex={-1}>
          <h2>这一页的声音</h2>
          {audio.map(item => <PrivateAudio key={item.id} item={item} />)}
        </section>}
        <section id="chapter-perspectives" className="chapter-section perspectives chapter-perspectives" tabIndex={-1}>
          <h2>同一页，两种视角</h2>
          <PerspectivePages story={story} perspectives={perspectives} photos={photos} onPhoto={setPhoto}
            selected={perspective || myPerspective?.author_id || perspectives[0]?.author_id || story.author_id}
            onSelect={setPerspective} />
          <Feedback loading={result.loading} error={result.error} retry={result.reload} />
          {!result.loading && <PerspectiveEditor id={id} key={myPerspective?.updated_at ?? 'new'}
            initial={myPerspective} photos={photos} onSaved={() => {
              setPerspective(member.id)
              result.reload()
            }} />}
        </section>
      </div>
    </div>
    <RelatedStories id={id} editable={permitted} />
    {(previous || next) && <nav className="story-neighbors" aria-label="相邻故事">
      {previous && <Link to={'/stories/' + previous.id}><span><ArrowLeft size={14} />上一篇</span><strong>{previous.title}</strong></Link>}
      {next && <Link to={'/stories/' + next.id}><span>下一篇 <ArrowRight size={14} /></span><strong>{next.title}</strong></Link>}
    </nav>}
    {photo !== undefined && <Lightbox photos={photos} current={photo} close={() => setPhoto(undefined)} setCurrent={setPhoto} />}
  </article>
}

export default function Story() {
  const { id } = useParams()
  return id && /^[0-9a-f-]{36}$/i.test(id)
    ? <StoryPage id={id} key={id} />
    : <div className="page"><Empty title="没有找到这篇故事" action={<Link to="/stories">返回故事</Link>} /></div>
}
