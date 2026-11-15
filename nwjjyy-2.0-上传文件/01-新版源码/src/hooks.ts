import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router'
import { errorMessage } from './data/client'

type Outcome<T> = { key: string; result: T; error?: never } | { key: string; error: string; result?: never }

export function useLoad<T>(key: string, load: () => Promise<T>, retainWhileReloading = false) {
  const loadRef = useRef(load)
  loadRef.current = load
  const [attempt, setAttempt] = useState(0)
  const [outcome, setOutcome] = useState<Outcome<T>>()
  const current = key + ':' + attempt
  useEffect(() => {
    let active = true
    Promise.resolve().then(() => loadRef.current()).then(result => {
      if (active) setOutcome({ key: current, result })
    }).catch(error => {
      if (active) setOutcome({ key: current, error: errorMessage(error) })
    })
    return () => { active = false }
  }, [current])
  return {
    data: outcome?.key === current || (retainWhileReloading && outcome?.key.startsWith(key + ':')) ? outcome?.result : undefined,
    error: outcome?.key === current ? outcome.error : undefined,
    loading: outcome?.key !== current,
    reload: () => setAttempt(value => value + 1),
  }
}

export function useUnsaved(dirty: boolean, saving: boolean) {
  const enabled = useRef(dirty || saving)
  enabled.current = dirty || saving
  const blocker = useBlocker(() => enabled.current)
  useEffect(() => {
    const beforeClose = (event: BeforeUnloadEvent) => {
      if (!enabled.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeClose)
    return () => window.removeEventListener('beforeunload', beforeClose)
  }, [])
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (saving) {
      blocker.reset()
    } else if (window.confirm('有内容还没保存。确定离开这一页吗？')) {
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker, saving])
  return () => { enabled.current = false }
}
