import { useState } from 'react'
import type { FormEvent } from 'react'
import { BookOpen, ExternalLink, Mail } from 'lucide-react'
import { Link } from 'react-router'
import { useBook } from '../book-context'
import { randomMemory, readingHistory } from '../data/book'
import { db, errorMessage, unwrap } from '../data/client'
import { publishedOptions } from '../data/world'
import { useLoad } from '../hooks'
import { AdminOnly } from '../ui/layout'
import { Back, Empty, Feedback, PageHeading } from '../ui/feedback'

const routes = [
  { name: '小兔子邮差', to: '/post' },
  { name: '声音邮局', to: '/sounds' },
  { name: '写给你的信', to: '/letters' },
  { name: '随机回忆', to: '/memory' },
  { name: '特别故事', to: '/gift' },
]

function GiftSetting() {
  const { settings, refresh } = useBook()
  const result = useLoad('nfc-options', () => publishedOptions(true))
  const [id, setId] = useState(settings.nfc_story_id ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      unwrap(await db().from('storybook_settings').update({ nfc_story_id: id || null }).eq('id', 1).select('id').single())
      refresh()
      setSaved(true)
    } catch (failure) { setError(errorMessage(failure)) }
    finally { setBusy(false) }
  }
  return <form className="panel form-stack" onSubmit={save}>
    <label>特别故事所指向的内容<select value={id} onChange={e => { setId(e.target.value); setSaved(false) }}>
      <option value="">暂不设置</option>
      {id && !result.data?.some(story => story.id === id) && <option value={id}>原关联故事</option>}
      {result.data?.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}</select></label>
    <Feedback loading={result.loading} error={error || result.error} retry={result.error ? result.reload : undefined} />
    {saved && <p role="status" className="notice">入口已更新，原来的链接可以继续使用。</p>}
    <button className="button" disabled={busy || result.loading}>保存入口</button>
  </form>
}

export default function Entrances() {
  return <AdminOnly><section className="page narrow-page">
    <Back to="/more">返回更多</Back>
    <PageHeading title="NFC 专属入口" intro="先用本机链接试走一遍。新版正式发布后，再使用原网站下的对应地址写入挂件。" />
    <div className="entrance-list form-stack">{routes.map(route => <div className="panel form-stack" key={route.to}>
      <Link className="text-button" to={route.to}><BookOpen size={18} />{route.name}<ExternalLink size={15} /></Link>
      <label>发布后的挂件链接<input readOnly value={'https://jwnyykx.github.io/nwjjyy/#' + route.to} onFocus={event => event.target.select()} /></label>
    </div>)}</div>
    <div className="home-section"><GiftSetting /></div>
  </section></AdminOnly>
}

export function Gift() {
  const { settings } = useBook()
  const result = useLoad(settings.nfc_story_id ?? 'none', () => readingHistory(settings.nfc_story_id ? [settings.nfc_story_id] : [], true))
  return <div className="page narrow-page">
    <PageHeading title="给你留的一页" />
    <Feedback loading={result.loading} error={result.error} retry={result.reload} />
    {result.data && (result.data[0] ? <Link className="button" to={'/stories/' + result.data[0].id}><Mail size={17} />{result.data[0].title}</Link>
      : <Empty title="特别故事还在等你们写下" action={<Link className="button secondary" to="/book">打开故事书</Link>} />)}
  </div>
}

export function RandomPage() {
  const { settings } = useBook()
  const [exclude, setExclude] = useState('')
  const result = useLoad('random-memory:' + exclude, async () => {
    if (!settings.enable_shuffle) return null
    const id = await randomMemory(exclude || undefined) ?? (exclude || null)
    if (!id) return null
    return (await readingHistory([id]))[0] ?? null
  })
  return <div className="page narrow-page">
    <PageHeading title="随机翻开一页" />
    <Feedback loading={result.loading} error={result.error} retry={result.reload} />
    {result.data && <div className="panel form-stack"><time dateTime={result.data.event_date}>{result.data.event_date}</time>
      <h2>{result.data.title}</h2>{result.data.summary && <p>{result.data.summary}</p>}
      <Link className="button" to={'/stories/' + result.data.id}>翻开这一页</Link>
      <button className="text-button" onClick={() => {
        const id = result.data?.id
        if (id && id !== exclude) setExclude(id)
        else result.reload()
      }}>换一页</button></div>}
    {result.data === null && <Empty title={settings.enable_shuffle ? '写下第一篇故事后，就可以随机回到那一天' : '随机回忆暂时关闭'}
      action={<Link className="button" to="/edit/story/new">写故事</Link>} />}
  </div>
}
