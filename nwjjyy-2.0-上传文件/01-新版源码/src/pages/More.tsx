import { useState } from 'react'
import { ArrowUpRight, AudioLines, BookOpen, CalendarDays, Feather, LockKeyhole, LogOut, Mail, MapPin, PanelsTopLeft, Radio, Save, Search, Send } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { useBook } from '../book-context'
import { db, errorMessage } from '../data/client'
import { Feedback, PageHeading } from '../ui/feedback'

export default function More() {
  const { member } = useBook()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  async function signOut() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await db().auth.signOut({ scope: 'local' })
      if (result.error) throw result.error
      await navigate('/', { replace: true })
    } catch (failure) {
      setError(errorMessage(failure))
      setBusy(false)
    }
  }
  const pages = [
    { to: '/search', title: '找一段回忆', icon: Search },
    { to: '/diary', title: '心动日记', icon: Feather },
    { to: '/letters', title: '写给你的信 · 时间胶囊', icon: Mail },
    { to: '/footprints', title: '我们的足迹', icon: MapPin },
    { to: '/sounds', title: '声音邮局', icon: AudioLines },
    { to: '/post', title: '小兔子邮差', icon: Send },
    { to: '/years', title: '故事年鉴', icon: CalendarDays },
    { to: '/promises', title: '未来的约定', icon: BookOpen },
    { to: '/manage', title: '管理中心', icon: PanelsTopLeft },
    ...(member.role === 'admin' ? [{ to: '/settings', title: '纪念日与故事书设置', icon: CalendarDays }] : []),
    ...(member.role === 'admin' ? [{ to: '/entrances', title: 'NFC 专属入口', icon: Radio }] : []),
    { to: '/export', title: '备份与导出', icon: Save },
  ]
  return <div className="page narrow-page">
    <PageHeading title="更多书页" />
    <div className="member-card"><LockKeyhole size={21} strokeWidth={1.45} />
      <div><strong>{member.display_name}</strong><p>{member.role === 'admin' ? '管理员' : '共同记录者'}</p></div>
      <button className="button secondary small" disabled={busy} onClick={() => void signOut()}><LogOut size={15} />退出登录</button>
    </div>
    <Feedback error={error} />
    <div className="contents-list">{pages.map(item => <Link to={item.to} key={item.to}><item.icon size={19} strokeWidth={1.5} /><span>{item.title}</span><ArrowUpRight size={16} /></Link>)}</div>
  </div>
}
