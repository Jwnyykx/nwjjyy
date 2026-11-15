import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { client, errorMessage, localPreview, unwrap } from './data/client'
import type { Member } from './data/types'
import { useLoad } from './hooks'

const SessionContext = createContext<{
  loading: boolean
  session: Session | null
  member: Member | null
  error?: string
  retry: () => void
} | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ loading: boolean; session: Session | null; error?: string }>({
    loading: Boolean(client), session: null,
  })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!client) return
    let current = true
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!current || event === 'INITIAL_SESSION') return
      setState({ loading: false, session })
    })
    client.auth.getSession().then(result => {
      if (result.error) throw result.error
      if (current) setState({ loading: false, session: result.data.session })
    }).catch(error => {
      if (current) setState({ loading: false, session: null, error: errorMessage(error) })
    })
    return () => {
      current = false
      data.subscription.unsubscribe()
    }
  }, [attempt])
  const user = state.session?.user.id
  const member = useLoad(user ?? 'visitor', async () => {
    if (!user || !client) return null
    const result = await client.from('members').select('*').eq('id', user).eq('active', true).maybeSingle()
    if (localPreview && result.status === 401) {
      await client.auth.signOut({ scope: 'local' })
      return null
    }
    return unwrap(result)
  })
  useEffect(() => {
    if (!user) return
    let current = true
    async function checkMembership() {
      if (document.visibilityState !== 'visible' || !client) return
      const result = await client.from('members').select('id').eq('id', user!).eq('active', true).maybeSingle()
      if (current && !result.error && !result.data) member.reload()
    }
    document.addEventListener('visibilitychange', checkMembership)
    return () => {
      current = false
      document.removeEventListener('visibilitychange', checkMembership)
    }
  }, [user])
  return <SessionContext.Provider value={{
    loading: state.loading || Boolean(user && member.loading),
    session: state.session,
    member: user ? member.data ?? null : null,
    error: state.error ?? member.error,
    retry: () => {
      if (state.error) {
        setState({ loading: true, session: null })
        setAttempt(value => value + 1)
      } else member.reload()
    },
  }}>{children}</SessionContext.Provider>
}

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('无法读取登录状态。')
  return session
}
