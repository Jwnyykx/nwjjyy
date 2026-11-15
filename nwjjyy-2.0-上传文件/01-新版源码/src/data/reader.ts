import { useCallback, useSyncExternalStore } from 'react'
import { useBook } from '../book-context'
import { storageOrigin } from './client'

type Entry = { id: string; title: string }
type ReaderState = { saved: string[]; recent: string[] }
const empty: ReaderState = { saved: [], recent: [] }
const stores = new Map<string, ReaderState>()
const listeners = new Set<() => void>()
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i

function ids(values: unknown, limit: number): string[] {
  return Array.isArray(values)
    ? [...new Set(values.filter((id): id is string => typeof id === 'string' && uuid.test(id)))].slice(0, limit)
    : []
}

function read(key: string): ReaderState {
  const current = stores.get(key)
  if (current) return current
  let next = empty
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (raw) next = { saved: ids(raw.saved, 100), recent: ids(raw.recent, 12) }
  } catch {
    // The current session can still keep bookmarks if storage is unavailable.
  }
  stores.set(key, next)
  return next
}

function update(key: string, next: ReaderState) {
  stores.set(key, next)
  try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* Keep the in-memory state. */ }
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  function sync(event: StorageEvent) {
    if (event.storageArea !== localStorage || (event.key && !event.key.startsWith('nwjjyy-reader:'))) return
    if (event.key) stores.delete(event.key)
    else stores.clear()
    listener()
  }
  window.addEventListener('storage', sync)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', sync)
  }
}

export function useReader() {
  const { member } = useBook()
  const key = 'nwjjyy-reader:' + storageOrigin + ':' + member.id
  const state = useSyncExternalStore(subscribe, () => read(key))
  const toggle = useCallback((id: string) => {
    if (!uuid.test(id)) return
    const current = read(key)
    const saved = current.saved.includes(id) ? current.saved.filter(item => item !== id) : [id, ...current.saved].slice(0, 100)
    update(key, { ...current, saved })
  }, [key])
  const remember = useCallback(({ id }: Entry) => {
    if (!uuid.test(id)) return
    const current = read(key)
    if (current.recent[0] === id) return
    update(key, { ...current, recent: [id, ...current.recent.filter(item => item !== id)].slice(0, 12) })
  }, [key])
  // Account-scoped references only. Titles and photos are fetched under the member's session.
  const last = state.recent.length ? { id: state.recent[0], title: '' } : null
  return { ...state, last, toggle, remember }
}
