import { useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarDays, Plus, Settings2, UserRound, X } from 'lucide-react'
import { useBook } from '../book-context'
import { db, errorMessage, unwrap } from '../data/client'
import { DEFAULT_ZONE, todayIn, validDate } from '../data/dates'
import type { Anniversary, Appearance, Category, Media } from '../data/types'
import { useLoad, useUnsaved } from '../hooks'
import { AdminOnly } from '../ui/layout'
import { Empty, Feedback, PageHeading } from '../ui/feedback'
import { AnniversaryCard } from './Home'

function HomeSettings() {
  const { settings, refresh } = useBook()
  const [intro, setIntro] = useState(settings.home_intro)
  const [subtitle, setSubtitle] = useState(settings.home_subtitle)
  const [zone, setZone] = useState(settings.time_zone)
  const [cover, setCover] = useState(settings.cover_media_id ?? '')
  const [appearance, setAppearance] = useState(settings.appearance)
  const [meeting, setMeeting] = useState(settings.next_meeting ?? '')
  const [extras, setExtras] = useState({ show_bunny: settings.show_bunny, allow_motion: settings.allow_motion,
    enable_shuffle: settings.enable_shuffle, show_post_notices: settings.show_post_notices })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const album = useLoad('cover-options:' + settings.updated_at, async () => {
    const list = unwrap(await db().from('media').select('*').eq('media_type', 'image').eq('state', 'ready')
      .is('story_id', null).is('diary_id', null).is('deleted_at', null).order('event_date', { ascending: false }).limit(60)) ?? []
    if (settings.cover_media_id && !list.some(item => item.id === settings.cover_media_id)) {
      const current = unwrap(await db().from('media').select('*').eq('id', settings.cover_media_id)
        .is('deleted_at', null).maybeSingle())
      if (current) list.unshift(current)
    }
    return list
  })
  const zones = [...new Set([DEFAULT_ZONE, Intl.DateTimeFormat().resolvedOptions().timeZone, zone, 'UTC', 'Asia/Tokyo',
    'Europe/London', 'America/New_York', ...(Intl.supportedValuesOf?.('timeZone') ?? [])])]

  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      unwrap(await db().from('storybook_settings').update({ home_intro: intro.trim(), home_subtitle: subtitle.trim(),
        time_zone: zone, cover_media_id: cover || null, appearance, next_meeting: meeting || null, ...extras })
        .eq('id', 1).select('id').single())
      setNotice('首页设置已保存。')
      refresh()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }

  return <form className="panel form-stack" onSubmit={save}>
    <h2><Settings2 size={20} />私人首页</h2>
    <label>私人首页副标题<input required maxLength={80} value={subtitle} onChange={event => setSubtitle(event.target.value)} /></label>
    <label>首页介绍<textarea rows={3} maxLength={400} value={intro} onChange={event => setIntro(event.target.value)} /></label>
    <div className="form-grid">
      <label>纪念日时区<select value={zone} onChange={event => setZone(event.target.value)}>
        {zones.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>私人封面<select value={cover} onChange={event => setCover(event.target.value)}>
        <option value="">默认布面故事书</option>
        {cover && !album.data?.some(item => item.id === cover) && <option value={cover}>当前封面</option>}
        {album.data?.map((item: Media) => <option value={item.id} key={item.id}>{item.caption || item.event_date + ' 的相册照片'}</option>)}
      </select></label>
    </div>
    <div className="form-grid">
      <label>书页颜色<select value={appearance} onChange={event => setAppearance(event.target.value as Appearance)}>
        <option value="linen">温暖奶油色</option><option value="lavender">淡紫色</option><option value="paper">复古纸张色</option>
      </select></label>
      <label>下次见面日期<input type="date" value={meeting} onChange={event => setMeeting(event.target.value)} /></label>
    </div>
    <div className="form-grid">{([['show_bunny', '显示小兔子'], ['allow_motion', '启用页面轻动画'],
      ['enable_shuffle', '开启随机回忆'], ['show_post_notices', '显示邮局消息数']] as const).map(([key, label]) =>
      <label className="check" key={key}><input type="checkbox" checked={extras[key]} onChange={event =>
        setExtras(previous => ({ ...previous, [key]: event.target.checked }))} />{label}</label>)}</div>
    <p className="field-help">可选择最近的独立相册照片。公开封面使用布面故事书插画。</p>
    {notice && <p className="notice" role="status">{notice}</p>}
    <Feedback error={error || album.error} retry={album.error ? album.reload : undefined} />
    <button className="button" disabled={saving}>{saving ? '保存中…' : '保存首页设置'}</button>
  </form>
}

function AnniversaryEditor({ record, onFinish, close }: {
  record?: Anniversary; onFinish: () => void; close: () => void
}) {
  const { settings } = useBook()
  const [title, setTitle] = useState(record?.title ?? '')
  const [date, setDate] = useState(record?.event_date ?? '')
  const [home, setHome] = useState(record?.show_on_home ?? true)
  const [countdown, setCountdown] = useState(record?.show_countdown ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = title !== (record?.title ?? '') || date !== (record?.event_date ?? '')
    || home !== (record?.show_on_home ?? true) || countdown !== (record?.show_countdown ?? true)
  const allowLeave = useUnsaved(dirty, saving)
  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving || !title.trim()) return
    if (!validDate(date)) { setError('请选择真实且有效的日期。'); return }
    setSaving(true)
    setError('')
    const values = { title: title.trim(), event_date: date, show_on_home: home, show_countdown: countdown }
    try {
      unwrap(record ? await db().from('anniversaries').update(values).eq('id', record.id).select('id').single()
        : await db().from('anniversaries').insert(values).select('id').single())
      allowLeave()
      onFinish()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }
  return <form className="panel form-stack" onSubmit={save}>
    <h3>{record ? '修改纪念日' : '新建纪念日'}</h3>
    <div className="form-grid"><label>纪念日名称<input value={title} required maxLength={100} onChange={event => setTitle(event.target.value)} /></label>
      <label>日期<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label></div>
    <div className="actions"><label className="check"><input type="checkbox" checked={home} onChange={event => setHome(event.target.checked)} />显示在首页</label>
      <label className="check"><input type="checkbox" checked={countdown} onChange={event => setCountdown(event.target.checked)} />显示周年倒计时</label></div>
    <p className="field-help">故事书今天的日期是 {todayIn(settings.time_zone)}。</p>
    <Feedback error={error} />
    <div className="actions"><button className="button small" disabled={saving}>{saving ? '保存中…' : '保存纪念日'}</button>
      <button type="button" className="button secondary small" disabled={saving} onClick={() => {
        if (!dirty || window.confirm('放弃未保存的纪念日修改吗？')) close()
      }}>取消</button></div>
  </form>
}

function Anniversaries() {
  const { settings } = useBook()
  const entries = useLoad('anniversaries', async () => unwrap(await db().from('anniversaries').select('*').order('event_date')) ?? [])
  const [editor, setEditor] = useState<{ record?: Anniversary }>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function remove(item: Anniversary) {
    if (busy || !window.confirm('永久删除纪念日「' + item.title + '」吗？')) return
    setBusy(true)
    setError('')
    try {
      unwrap(await db().from('anniversaries').delete().eq('id', item.id).select('id').single())
      entries.reload()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }
  return <section className="settings-section">
    <div className="section-heading"><h2><CalendarDays size={21} />纪念日</h2>
      <button className="button secondary small" disabled={Boolean(editor)} onClick={() => setEditor({})}><Plus size={16} />添加</button></div>
    {editor && <AnniversaryEditor key={editor.record?.id ?? 'new'} record={editor.record} close={() => setEditor(undefined)}
      onFinish={() => { setEditor(undefined); entries.reload() }} />}
    <Feedback error={error || entries.error} loading={entries.loading} retry={entries.reload} />
    {entries.data?.length === 0 && !editor && <Empty title="等一个值得纪念的日期" />}
    {entries.data?.map(item => <div className="setting-item" key={item.id}>
      <AnniversaryCard item={item} zone={settings.time_zone} />
      <div className="actions"><button className="text-button" disabled={Boolean(editor)} onClick={() => setEditor({ record: item })}>修改</button>
        <button className="text-button danger" disabled={busy || Boolean(editor)} onClick={() => void remove(item)}>删除</button></div>
    </div>)}
  </section>
}

function CategoryField({ item, locked, change }: {
  item?: Category; locked: boolean; change: (item: Category | undefined, value: string, archive?: boolean) => Promise<boolean>
}) {
  const [name, setName] = useState(item?.name ?? '')
  return <form className="form-inline" onSubmit={event => {
    event.preventDefault()
    if (!name.trim()) return
    void change(item, name.trim()).then(success => { if (success && !item) setName('') })
  }}>
    <input aria-label={item ? '修改分类 ' + item.name : '新分类名称'} value={name} required maxLength={28}
      placeholder={item ? undefined : '新分类名称'} onChange={event => setName(event.target.value)} />
    <button className="button secondary small" disabled={locked || name.trim() === item?.name}>{item ? '改名' : '添加'}</button>
    {item && <button type="button" className="text-button" disabled={locked}
      onClick={() => void change(item, item.name, !item.archived)}>{item.archived ? '启用' : '归档'}</button>}
  </form>
}

function Categories() {
  const { categories, refresh } = useBook()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function change(item: Category | undefined, name: string, archive?: boolean) {
    if (busy) return false
    setBusy(true)
    setError('')
    try {
      if (item) unwrap(await db().from('categories').update(archive === undefined ? { name } : { archived: archive })
        .eq('id', item.id).select('id').single())
      else unwrap(await db().from('categories').insert({ name }).select('id').single())
      refresh()
      return true
    } catch (failure) {
      setError(errorMessage(failure))
      return false
    } finally {
      setBusy(false)
    }
  }

  return <section className="panel settings-section">
    <h2>故事分类</h2><p className="field-help">归档后不能为新故事选择该分类，已有故事仍保留原分类。</p>
    <Feedback error={error} />
    <div className="form-stack">
      {categories.map(item => <CategoryField item={item} key={item.id + ':' + item.name} locked={busy} change={change} />)}
      <CategoryField locked={busy} change={change} />
    </div>
  </section>
}

function Members() {
  const { members, refresh } = useBook()
  const writer = members.find(item => item.role === 'writer')
  const [id, setId] = useState('')
  const [name, setName] = useState(writer?.display_name ?? '')
  const [active, setActive] = useState(writer?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving || !name.trim()) return
    if (!writer && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id.trim())) {
      setError('请复制 Supabase 账号的 User UID。')
      return
    }
    if (writer?.active && !active && !window.confirm('暂停第二位成员的访问权限吗？')) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (writer) unwrap(await db().from('members').update({ display_name: name.trim(), active })
        .eq('id', writer.id).select('id').single())
      else unwrap(await db().from('members').insert({ id: id.trim(), display_name: name.trim(), role: 'writer' }).select('id').single())
      setNotice('成员权限已保存。')
      refresh()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }
  return <form className="panel form-stack" onSubmit={save}>
    <h2><UserRound size={20} />第二位成员</h2>
    {!writer && <><p className="field-help">先在 Supabase 的 Authentication → Users 创建对方账号，再将该账号的 User UID 填在这里。</p>
      <label>User UID<input value={id} required maxLength={36} autoCapitalize="none" onChange={event => setId(event.target.value)} /></label></>}
    <label>显示名称<input value={name} required maxLength={30} onChange={event => setName(event.target.value)} /></label>
    {writer && <label className="check"><input checked={active} type="checkbox" onChange={event => setActive(event.target.checked)} />允许登录并访问故事书</label>}
    {notice && <p className="notice" role="status">{notice}</p>}
    <Feedback error={error} />
    <button className="button" disabled={saving}>{saving ? '保存中…' : writer ? '更新授权' : '授权共同记录者'}</button>
  </form>
}

function SettingsPage() {
  const { members } = useBook()
  const writer = members.find(item => item.role === 'writer')
  return <div className="page settings-page">
    <PageHeading title="故事书设置" intro="管理私人首页、纪念日和成员访问权限。"
      action={<a className="text-button" href="#/manage"><X size={17} />返回管理中心</a>} />
    <HomeSettings />
    <Anniversaries />
    <Categories />
    <Members key={writer?.id ?? 'invite'} />
  </div>
}

export default function Settings() {
  return <AdminOnly><SettingsPage /></AdminOnly>
}
