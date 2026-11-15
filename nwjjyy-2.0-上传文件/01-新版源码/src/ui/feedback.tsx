import { AlertCircle, ArrowLeft, BookOpen, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

export function Feedback({ loading, error, retry }: { loading?: boolean; error?: string; retry?: () => void }) {
  if (loading) return <div className="feedback" role="status"><LoaderCircle className="spin" size={19} />正在翻开这一页…</div>
  if (error) return <div className="feedback feedback-error" role="alert"><AlertCircle size={20} /><p>{error}</p>
    {retry && <button className="button secondary small" onClick={retry}>重试</button>}
  </div>
  return null
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><BookOpen aria-hidden="true" size={25} strokeWidth={1.3} />
    <h2>{title}</h2>{children && <p>{children}</p>}{action}
  </div>
}

export function PageHeading({ title, intro, action }: { title: string; intro?: string; action?: ReactNode }) {
  return <header className="page-heading"><div><h1>{title}</h1>{intro && <p>{intro}</p>}</div>{action}</header>
}

export function Back({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="back" to={to}><ArrowLeft size={16} />{children}</Link>
}
