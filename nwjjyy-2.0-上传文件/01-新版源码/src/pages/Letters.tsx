import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Bookmark, Clock3, Download, Feather, Inbox, LockKeyhole, Mail, MailOpen, Paperclip, Send, Sparkles, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useBook } from '../book-context'
import { errorMessage } from '../data/client'
import { discardLetter, discardedLetterAssets, exportLetterArchive, favoriteLetter, letterMoment, lettersIn, localLetterTime, openLetter, readLetter } from '../data/letters'
import type { LetterAsset, LetterBox, LetterDetail, LetterEnvelope, LetterTheme } from '../data/letters'
import { getLetterAsset, LETTER_AUDIO_TYPES, LETTER_IMAGE_TYPES, removeLetterObjects, saveLetterWithAssets } from '../data/letter-assets'
import type { PendingLetterAsset } from '../data/letter-assets'
import { useLoad, useUnsaved } from '../hooks'
import { Empty, Feedback } from '../ui/feedback'
import './letters.css'

const boxes: { id: LetterBox; label: string }[] = [
  { id: 'inbox', label: '收信' }, { id: 'sent', label: '寄出' },
  { id: 'draft', label: '草稿' }, { id: 'favorite', label: '收藏' },
]
const themes: { id: LetterTheme; label: string }[] = [
  { id: 'plum', label: '暮紫' }, { id: 'rose', label: '豆沙' }, { id: 'kraft', label: '牛皮纸' },
]
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const attachmentExtensions: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/wav': '.wav',
}

function Envelope({ letter, children }: { letter: LetterEnvelope; children: string }) {
  const Symbol = letter.locked ? LockKeyhole : letter.opened_at ? MailOpen : Mail
  return <span className="letter-envelope" data-paper={letter.theme} aria-hidden="true">
    <span className="letter-envelope-flap" />
    <span className="letter-envelope-stamp"><Symbol size={19} strokeWidth={1.45} /></span>
    <span className="letter-envelope-note">{children}</span>
  </span>
}

function ReadAttachment({ asset }: { asset: LetterAsset }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const location = useRef('')
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      if (location.current) URL.revokeObjectURL(location.current)
    }
  }, [])
  async function load() {
    if (loading || url) return
    setLoading(true)
    setError('')
    try {
      const blob = await getLetterAsset(asset)
      if (active.current) {
        location.current = URL.createObjectURL(blob)
        setUrl(location.current)
      }
    } catch (failure) { if (active.current) setError(errorMessage(failure)) }
    finally { if (active.current) setLoading(false) }
  }
  return <div className="letter-attachment">
    {url ? asset.kind === 'image' ? <img src={url} alt="信件里的私人照片" />
      : <audio controls preload="metadata" src={url}>当前浏览器无法播放这段声音。</audio>
      : <button type="button" className="button secondary" onClick={() => void load()} disabled={loading}>
        <Paperclip size={16} /> {loading ? '载入附件…' : asset.kind === 'image' ? '查看信里的照片' : '载入信里的声音'}
      </button>}
    {url && <a className="text-button" href={url} download={'nwjjyy-letter-' + asset.id + (attachmentExtensions[asset.mime] ?? '')}>
      <Download size={16} />保存附件</a>}
    <Feedback error={error} />
  </div>
}

function LetterComposer({ initial, capsule }: { initial?: LetterDetail; capsule?: boolean }) {
  const { member, members, settings } = useBook()
  const navigate = useNavigate()
  const zone = settings.time_zone
  const partner = members.find(value => value.id !== member.id && value.active)
  const id = useRef(initial?.id)
  const revision = useRef(initial?.revision ?? null)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [theme, setTheme] = useState<LetterTheme>(initial?.theme ?? 'plum')
  const [timed, setTimed] = useState(Boolean(capsule || initial?.unlock_at))
  const [when, setWhen] = useState(initial?.unlock_at ? localLetterTime(initial.unlock_at, zone) : '')
  const [showTitle, setShowTitle] = useState(initial?.show_title ?? false)
  const [shareOpened, setShareOpened] = useState(initial?.share_opened ?? false)
  const [dirty, setDirty] = useState(false)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const pending = useRef(false)
  const prepared = useRef<LetterEnvelope | null>(null)
  const uploaded = useRef(new Set<string>())
  const [attachments, setAttachments] = useState<PendingLetterAsset[]>(() => (initial?.attachments ?? []).map(item => ({
    id: item.id, kind: item.kind, label: item.kind === 'image' ? '已保存的照片' : '已保存的声音',
  })))
  const release = useUnsaved(dirty, sending)

  async function submit(send: boolean) {
    if (!partner || pending.current) return
    if (!title.trim() || !body.trim() || (timed && !when)) {
      setError('请填写标题、正文和需要的解锁时间。')
      setConfirm(false)
      return
    }
    setConfirm(false)
    pending.current = true
    setSending(true)
    setError('')
    try {
      const letterId = (id.current ??= crypto.randomUUID())
      const letter = await saveLetterWithAssets({
        p_id: letterId, p_recipient: initial?.recipient_id ?? partner.id, p_title: title, p_body: body,
        p_theme: theme, p_unlock: timed ? when : null, p_show_title: showTitle, p_share_opened: shareOpened,
        p_send: send, p_expected: revision.current,
      }, attachments, prepared.current, uploaded.current, draft => { prepared.current = draft }, setProgress)
      release()
      setDirty(false)
      revision.current = letter.revision
      navigate(send ? '/letters?box=sent' : '/letters?box=draft', { replace: true })
      void discardedLetterAssets(letterId).then(removeLetterObjects).catch(() => undefined)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      pending.current = false
      setSending(false)
      setProgress('')
    }
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pending.current) setConfirm(true)
  }

  function selectFiles(files: FileList | null, kind: LetterAsset['kind']) {
    if (!files?.length) return
    if (attachments.length + files.length > 6) { setError('每封信最多添加六份照片或声音。'); return }
    const selected = Array.from(files, file => ({ id: crypto.randomUUID(), label: file.name, kind, file }))
    setError('')
    setDirty(true)
    setAttachments(items => [...items, ...selected])
  }

  if (!partner) return <Empty title="还没有可以收信的另一位成员">
    等对方加入故事书后，就可以寄出第一封信。
  </Empty>

  return <section className="letter-sheet">
    <header className="letter-sheet-heading">
      <span className="letter-meta">寄给 {partner.display_name}</span>
      <h2>{initial ? '继续写这封信' : capsule ? '写给未来的你' : '写一封信'}</h2>
    </header>
    <form className="form-stack" onSubmit={onSubmit} onChange={() => setDirty(true)}>
      <label>标题<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="给这封信一个名字" /></label>
      <label>正文<textarea required rows={8} maxLength={20000} value={body} onChange={event => setBody(event.target.value)} placeholder="从一句想告诉对方的话开始。" /></label>
      <fieldset className="letter-theme-group">
        <legend>选择信封</legend>
        {themes.map(choice => <label key={choice.id} data-paper={choice.id}>
          <input type="radio" name="letter-paper" value={choice.id} checked={choice.id === theme} onChange={() => setTheme(choice.id)} />
          <span>{choice.label}</span>
        </label>)}
      </fieldset>
      <fieldset className="letter-delivery">
        <legend>什么时候送到</legend>
        <label className="check"><input type="radio" name="letter-delivery" checked={!timed} onChange={() => setTimed(false)} />寄出后就能打开</label>
        <label className="check"><input type="radio" name="letter-delivery" checked={timed} onChange={() => setTimed(true)} />设成时间胶囊</label>
        {timed && <>
          <label>解锁时间（{zone}）<input type="datetime-local" required value={when} onChange={event => setWhen(event.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={showTitle} onChange={event => setShowTitle(event.target.checked)} />解锁前允许对方看见标题</label>
        </>}
        <label className="check"><input type="checkbox" checked={shareOpened} onChange={event => setShareOpened(event.target.checked)} />寄出后对我显示打开时间</label>
      </fieldset>
      <fieldset className="letter-delivery" disabled={sending}>
        <legend>夹进信里的照片与声音</legend>
        <div className="letter-file-fields">
          <label>照片<input type="file" accept={LETTER_IMAGE_TYPES} multiple onChange={event => {
            selectFiles(event.target.files, 'image')
            event.target.value = ''
          }} /></label>
          <label>录音<input type="file" accept={LETTER_AUDIO_TYPES} multiple onChange={event => {
            selectFiles(event.target.files, 'audio')
            event.target.value = ''
          }} /></label>
        </div>
        {!!attachments.length && <ul className="letter-attachment-list">
          {attachments.map(item => <li key={item.id}>
            <span><Paperclip size={15} />{item.label}</span>
            <button className="text-button" type="button" aria-label={'移除' + item.label} onClick={() => {
              setDirty(true)
              setAttachments(values => values.filter(value => value.id !== item.id))
            }}><X size={16} />移除</button>
          </li>)}
        </ul>}
      </fieldset>
      <Feedback error={error} />
      {progress && <p className="letter-meta" role="status">{progress}</p>}
      {confirm ? <div className="letter-confirm" role="group" aria-label="确认寄出">
        <p>寄出后，信件原文会保留。确定把它交给小邮差吗？</p>
        <div className="actions">
          <button className="button" type="button" onClick={() => void submit(true)}><Send size={16} />确认寄出</button>
          <button type="button" className="button secondary" onClick={() => setConfirm(false)}>再看看</button>
        </div>
      </div> : <div className="actions">
        <button type="submit" className="button" disabled={sending}><Send size={16} />寄出</button>
        <button type="button" className="button secondary" disabled={sending} onClick={() => void submit(false)}>存草稿</button>
      </div>}
    </form>
  </section>
}

function LetterReading({ letter, changed }: { letter: LetterDetail; changed: () => void }) {
  const { member, members, settings } = useBook()
  const navigate = useNavigate()
  const [current, setCurrent] = useState(letter)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [openedHere, setOpenedHere] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const mine = current.author_id === member.id
  const from = members.find(person => person.id === current.author_id)?.display_name ?? '另一位成员'
  const to = members.find(person => person.id === current.recipient_id)?.display_name ?? '另一位成员'
  const zone = settings.time_zone
  const unlock = current.unlock_at ? letterMoment(current.unlock_at, zone) : null

  async function action(run: () => Promise<void>) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try { await run() } catch (failure) { setError(errorMessage(failure)) }
    finally { pending.current = false; setBusy(false) }
  }

  return <section className={'letter-sheet' + (openedHere ? ' letter-just-opened' : '')}>
    <header className="letter-sheet-heading">
      <span className="letter-meta">{mine ? '寄给 ' + to : '来自 ' + from}</span>
      <h2>{current.title ?? '一份留给你的时间胶囊'}</h2>
      {current.sent_at && <time dateTime={current.sent_at}>{letterMoment(current.sent_at, zone)}</time>}
    </header>
    {current.body == null ? <div className="letter-opening">
      <Envelope letter={current}>{current.locked ? '封存中' : '等你拆开'}</Envelope>
      {unlock && <p><Clock3 size={17} /> {current.locked ? '解锁时间' : '已解锁'} <time dateTime={current.unlock_at ?? undefined}>{unlock}</time></p>}
      {current.locked ? <button className="button secondary" type="button" onClick={changed}>检查是否已到解锁时间</button>
        : <button className="button" type="button" disabled={busy} onClick={() => void action(async () => {
            const value = await openLetter(current.id)
            setCurrent(value)
            setOpenedHere(true)
          })}><MailOpen size={18} />拆开信封</button>}
    </div> : <>
      {unlock && <p className="letter-capsule-note"><Sparkles size={17} /> {mine ? '这封信会在 ' + unlock + ' 等到收信人' : '这封信来自过去的 ' + from}</p>}
      <p className="letter-body">{current.body}</p>
      {current.attachments.length > 0 && <div className="letter-media">
        {current.attachments.map(asset => <ReadAttachment asset={asset} key={asset.id} />)}
      </div>}
      {!current.draft && <div className="actions letter-read-actions">
        <button className="button secondary" type="button" disabled={busy} aria-pressed={current.favorite}
          onClick={() => void action(async () => {
            await favoriteLetter(current.id, !current.favorite)
            setCurrent(value => ({ ...value, favorite: !value.favorite }))
          })}><Bookmark size={17} fill={current.favorite ? 'currentColor' : 'none'} />{current.favorite ? '已收藏' : '收藏这封信'}</button>
        {mine && current.opened_at && <span className="letter-meta">对方在 {letterMoment(current.opened_at, zone)} 打开</span>}
      </div>}
    </>}
    {current.draft && <div className="actions">
      <Link className="button secondary" to={'/letters?id=' + current.id + '&edit=1'}><Feather size={16} />继续写</Link>
      {confirmDiscard ? <>
        <button className="button secondary" disabled={busy} onClick={() => void action(async () => {
          const objects = await discardLetter(current.id, current.revision)
          void removeLetterObjects(objects ?? []).catch(() => undefined)
          navigate('/letters?box=draft', { replace: true })
        })}>确认删除草稿</button>
        <button className="text-button" onClick={() => setConfirmDiscard(false)}><X size={16} />取消</button>
      </> : <button className="text-button" disabled={busy} onClick={() => setConfirmDiscard(true)}>删除草稿</button>}
    </div>}
    <Feedback error={error} />
  </section>
}

function LetterOpen({ id, edit }: { id: string; edit: boolean }) {
  const result = useLoad('letter:' + id, () => readLetter(id))
  if (result.loading || result.error) return <Feedback loading={result.loading} error={result.error} retry={result.reload} />
  if (!result.data) return <Empty title="信封不在这里">这封信可能还没有寄出，或者当前账号无法打开。</Empty>
  return edit && result.data.draft ? <LetterComposer key={id} initial={result.data} />
    : <LetterReading key={id + ':' + String(result.data.locked)} letter={result.data} changed={result.reload} />
}

function LetterList({ box, page, capsule }: { box: LetterBox; page: number; capsule: boolean }) {
  const { member, members, settings } = useBook()
  const result = useLoad('letters:' + box + ':' + page, () => lettersIn(box, page))
  const list = result.data
  const href = (next: number) => '/letters?box=' + box + (next ? '&page=' + next : '') + (capsule ? '&capsule=1' : '')
  return <>
    <Feedback loading={result.loading} error={result.error} retry={result.reload} />
    {list && list.rows.length === 0 && <Empty title={box === 'inbox' ? '信箱暂时空着' : '这里还没有信'}>
      {box === 'inbox' ? '对方寄出信件后，信封会出现在这里。' : '写下想说的话，再选择现在寄出或留给未来。'}
    </Empty>}
    <div className="letter-list">{list?.rows.map(letter => {
      const received = letter.recipient_id === member.id
      const name = members.find(person => person.id === (received ? letter.author_id : letter.recipient_id))?.display_name
      const label = letter.locked ? '时间胶囊' : letter.draft ? '草稿' : letter.opened_at ? '已打开' : '信件'
      return <Link className="letter-list-card" key={letter.id} to={'/letters?id=' + letter.id + '&box=' + box + (letter.draft ? '&edit=1' : '')}>
        <Envelope letter={letter}>{label}</Envelope>
        <span className="letter-list-copy">
          <span className="letter-meta">{received ? '来自' : '寄给'} {name ?? '另一位成员'}</span>
          <strong>{letter.title ?? '一份留给你的时间胶囊'}</strong>
          {letter.unlock_at && <span className="letter-meta">解锁于 {letterMoment(letter.unlock_at, settings.time_zone)}</span>}
        </span>
        <ArrowRight size={18} strokeWidth={1.5} />
      </Link>
    })}</div>
    {list && (page > 0 || list.next) && <nav className="letter-pagination" aria-label="信箱分页">
      {page > 0 && <Link className="button secondary" to={href(page - 1)}>上一页</Link>}
      <span>第 {page + 1} 页</span>
      {list.next && <Link className="button secondary" to={href(page + 1)}>下一页</Link>}
    </nav>}
  </>
}

export default function Letters() {
  const [params] = useSearchParams()
  const id = params.get('id')
  const compose = params.get('write') === '1'
  const capsule = params.get('capsule') === '1'
  const box = boxes.find(value => value.id === params.get('box'))?.id ?? 'inbox'
  const page = Math.max(0, Math.min(100000, parseInt(params.get('page') ?? '0', 10) || 0))
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  async function downloadArchive() {
    if (exporting) return
    setExportError('')
    setExporting(true)
    try {
      const archive = await exportLetterArchive()
      const file = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = 'nwjjyy-private-letters-' + new Date().toISOString().slice(0, 10) + '.json'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) { setExportError(errorMessage(failure)) }
    finally { setExporting(false) }
  }

  return <div className="page letters-page">
    <header className="letter-hero">
      <span className="letter-hero-icon">{capsule ? <LockKeyhole size={26} strokeWidth={1.35} /> : <Inbox size={26} strokeWidth={1.35} />}</span>
      <h1>{capsule ? '留给未来的信' : '写给你的信'}</h1>
      <p>今天想说的话，也可以留到某个特别的日子。</p>
      {!compose && !id && <div className="actions">
        <Link className="button" to="/letters?write=1"><Feather size={17} />写信</Link>
        <Link className="button secondary" to="/letters?write=1&capsule=1"><Clock3 size={17} />留一份时间胶囊</Link>
      </div>}
    </header>
    {compose || id ? <>
      <Link className="back" to={'/letters?box=' + box}><ArrowLeft size={17} />返回信箱</Link>
      {compose ? <LetterComposer key={String(capsule)} capsule={capsule} />
        : id && uuid.test(id) ? <LetterOpen id={id} edit={params.get('edit') === '1'} />
        : <Empty title="这个信封地址不完整" />}
    </> : <>
      <nav className="letter-tabs" aria-label="信箱分类">
        {boxes.map(value => <Link key={value.id} to={'/letters?box=' + value.id} aria-current={box === value.id ? 'page' : undefined}>{value.label}</Link>)}
      </nav>
      <LetterList key={box + ':' + page} box={box} page={page} capsule={capsule} />
      <footer className="letter-export">
        <button className="text-button" type="button" disabled={exporting} onClick={() => void downloadArchive()}><Download size={17} />{exporting ? '整理信件中…' : '导出我能阅读的信件'}</button>
        <Feedback error={exportError} />
      </footer>
    </>}
  </div>
}
