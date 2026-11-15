import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, BookOpen, LockKeyhole } from 'lucide-react'
import { Link, Navigate, useLocation } from 'react-router'
import cover from '../assets/story-cover.webp'
import { Brand } from '../ui/layout'
import { Feedback } from '../ui/feedback'
import { configured, db, errorMessage } from '../data/client'
import { useSession } from '../session'

export const defaultIntro = '这里记录着我们的过去，也收藏着正在发生的现在。至于未来，我们一起慢慢写。'

export function Cover() {
  const { member } = useSession()
  const entry = member ? '/book' : '/login'
  return <div className="cover-page storybook-cover">
    <header className="cover-header shell"><Brand />
      <Link className="cover-login" to={entry}><LockKeyhole size={15} />{member ? '我的故事书' : '成员登录'}</Link>
    </header>
    <main id="main-content" tabIndex={-1} className="cover-grid shell">
      <section className="cover-text">
        <h1><i>nwjjyy</i><span>的故事</span></h1>
        <p className="cover-subtitle">我们的故事，未完待续。</p>
        <p className="cover-description">{defaultIntro}</p>
        <Link className="button cover-action" to={entry}><BookOpen size={18} strokeWidth={1.6} />打开故事书<ArrowRight size={17} /></Link>
      </section>
      <figure className="cover-art">
        <img src={cover} alt="阳光落在一本棉布封面的空白故事书上" width={1040} height={1300} fetchPriority="high" />
      </figure>
    </main>
    <footer className="shell cover-footer"><span>故事未完，下一页由我们继续。</span><span><LockKeyhole size={13} /> 仅限受邀成员阅读</span></footer>
  </div>
}

export function Login() {
  const state = useSession()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const raw = location.state?.next
  const to = typeof raw === 'string' && /^\/(?!\/)[\w/-]+(?:\?[^#\r\n]*)?$/.test(raw) && raw !== '/login'
    ? raw : '/book'
  if (state.member) return <Navigate to={to} replace />

  async function signIn(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const result = await db().auth.signInWithPassword({ email: email.trim(), password })
      if (result.error) throw result.error
      setPassword('')
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }
  async function signOut() {
    setError('')
    try {
      const result = await db().auth.signOut({ scope: 'local' })
      if (result.error) throw result.error
    } catch (failure) {
      setError(errorMessage(failure))
    }
  }

  const blocked = !state.loading && state.session && !state.error
  return <div className="cover-page">
    <header className="cover-header shell"><Brand /><Link className="text-button" to="/">返回封面</Link></header>
    <main id="main-content" tabIndex={-1} className="shell login-grid">
      <img className="login-art" src={cover} width={1040} height={1300} alt="" />
      <section className="login-panel">
        <span className="login-icon"><LockKeyhole size={23} strokeWidth={1.5} /></span>
        <h1>成员登录</h1><p>用管理员开通的邮箱和密码，翻开你们的故事书。</p>
        {!configured && <Feedback error="故事书还没连接私人数据库。请由管理员完成配置后再登录。" />}
        {state.loading && <Feedback loading />}
        {state.error && <Feedback error={state.error} retry={state.retry} />}
        {error && <Feedback error={error} />}
        {(blocked || (state.error && state.session)) && <div className="panel">{blocked && <p>当前账号尚未获得阅读权限，请联系管理员。</p>}
          <button className="button secondary" onClick={signOut}>退出并更换账号</button></div>}
        {configured && !state.session && !state.loading && !state.error && <form className="form-stack" onSubmit={signIn}>
          <label>邮箱<input type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} /></label>
          <div className="form-field"><label htmlFor="login-password">密码</label><span className="password-field"><input id="login-password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password"
            value={password} onChange={event => setPassword(event.target.value)} />
            <button className="text-button" type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? '隐藏' : '显示'}</button></span></div>
          <button className="button" disabled={saving}>{saving ? '正在登录…' : '登录并打开故事书'}<ArrowRight size={16} /></button>
        </form>}
      </section>
    </main>
  </div>
}
