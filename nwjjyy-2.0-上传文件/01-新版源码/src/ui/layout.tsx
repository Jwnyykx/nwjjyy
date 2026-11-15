import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { BookOpen, House, Images, Library, LockKeyhole, Menu, SquarePen } from 'lucide-react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { BookProvider, useBook } from '../book-context'
import { configured, localPreview } from '../data/client'
import { SessionProvider, useSession } from '../session'
import { Empty, Feedback } from './feedback'

export function Brand({ to = '/' }: { to?: string }) {
  return <Link className="brand" to={to}><span className="brand-icon"><BookOpen size={20} strokeWidth={1.55} /></span>
    <span><i>nwjjyy</i><span>的故事</span></span>
  </Link>
}

export function RootLayout() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [pathname])
  return <SessionProvider>
    {localPreview && <div className="local-preview-note" role="note">本机试用 · 请使用测试内容</div>}
    <Outlet />
  </SessionProvider>
}

export function BookLayout() {
  const state = useSession()
  const location = useLocation()
  if (!configured) return <Navigate to="/login" replace />
  if (state.loading) return <div className="page shell"><Feedback loading /></div>
  if (state.error && !state.member) return <div className="page shell"><Brand />
    <Feedback error={state.error} retry={state.retry} /><Link className="back" to="/">返回封面</Link></div>
  if (!state.session) return <Navigate replace to="/login" state={{ next: location.pathname + location.search }} />
  if (!state.member) return <Navigate replace to="/login" />
  return <BookProvider key={state.member.id} member={state.member}><BookFrame /></BookProvider>
}

function BookFrame() {
  const { settings } = useBook()
  return <div className="book-layout" data-appearance={settings.appearance} data-motion={settings.allow_motion ? 'on' : 'off'}>
      <a className="skip-link" href="#main-content" onClick={event => {
        event.preventDefault()
        document.getElementById('main-content')?.focus()
      }}>跳到主要内容</a>
      <header className="site-header"><div className="shell header-inner">
        <Brand to="/book" />
        <nav className="desktop-nav" aria-label="主要导航">
          <NavLink to="/book">首页</NavLink><NavLink to="/stories">故事</NavLink>
          <NavLink to="/album">相册</NavLink><NavLink to="/diary">日记</NavLink><NavLink to="/more">更多</NavLink>
        </nav>
        <Link className="button small header-write" to="/edit/story/new"><SquarePen size={15} />写故事</Link>
      </div></header>
      <main id="main-content" tabIndex={-1} className="shell book-main"><Outlet /></main>
      <footer className="shell private-footer"><span>故事未完，下一页由我们继续。</span>
        <span><LockKeyhole size={14} /> 私人故事书</span></footer>
      <nav className="mobile-nav" aria-label="手机导航">
        <NavLink to="/book"><House size={20} />首页</NavLink>
        <NavLink to="/stories"><Library size={20} />故事</NavLink>
        <NavLink to="/album"><Images size={20} />相册</NavLink>
        <NavLink to="/more"><Menu size={20} />更多</NavLink>
      </nav>
  </div>
}

export function AdminOnly({ children }: { children: ReactNode }) {
  const { member } = useSession()
  if (member?.role === 'admin') return children
  return <div className="page"><Empty title="这一页由管理员维护"
    action={<Link className="button" to="/more">返回更多</Link>} /></div>
}
