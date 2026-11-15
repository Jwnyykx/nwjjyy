import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
let endpoint: URL | undefined
try {
  const candidate = new URL(url)
  const local = ['localhost', '127.0.0.1'].includes(candidate.hostname)
  if (((!local && candidate.protocol === 'https:') || (import.meta.env.DEV && local && candidate.protocol === 'http:'))
      && candidate.pathname === '/' && !candidate.username && !candidate.password && !candidate.search && !candidate.hash) {
    endpoint = candidate
  }
} catch {
  // The public cover is available while setup is incomplete.
}

const validKey = typeof key === 'string' && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key)

function timedFetch(input: RequestInfo | URL, options?: RequestInit) {
  const controller = new AbortController()
  const caller = options?.signal
  const cancel = () => controller.abort()
  if (caller?.aborted) cancel()
  else caller?.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(() => controller.abort(new DOMException('连接超时', 'TimeoutError')), 45000)
  return fetch(input, { ...options, cache: 'no-store', signal: controller.signal }).finally(() => {
    clearTimeout(timeout)
    caller?.removeEventListener('abort', cancel)
  })
}

export const client = endpoint && validKey ? createClient<Database>(endpoint.origin, key, {
  auth: {
    detectSessionInUrl: false,
    autoRefreshToken: true,
    persistSession: true,
    storageKey: 'nwjjyy-storybook-session:' + endpoint.host,
  },
  global: { fetch: timedFetch },
}) : null

export const storageOrigin = endpoint?.origin ?? ''
export const publishableKey = validKey ? key : ''
export const BUCKET = 'storybook-private'
export const configured = Boolean(client)
export const localPreview = import.meta.env.DEV && import.meta.env.MODE === 'local-book'

export function db() {
  if (!client) throw new Error('故事书还没接好数据库。请先由管理员完成配置。')
  return client
}

export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error
  return result.data
}

export function errorMessage(error: unknown) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return '网络已断开。连上网络后可以重试。'
  if (error instanceof DOMException && ['TimeoutError', 'AbortError'].includes(error.name)) return '请求超时了。检查网络后请重试。'
  if (error && typeof error === 'object') {
    const code = 'code' in error ? error.code : ''
    const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
    if (code === 'invalid_credentials') return '邮箱或密码不正确。请用管理员开通的账号登录。'
    if (code === 'email_not_confirmed') return '这个账号的邮箱还未确认，请联系管理员。'
    if (code === '42501' || code === 'PGRST301' || code === 'PGRST303') return '当前账号没有这项权限，或登录已过期。'
    if (code === '23505') return '已有一条相同记录。请检查后重试。'
    if (code === '23503') return '关联的内容不存在，或仍被其他记录引用。请刷新后检查。'
    if (code === '40001') return '这页已被修改或移除。请先复制未保存的文字，然后重新打开。'
    if (/[\u3400-\u9fff]/.test(message)) return message
    if (/(?:fetch|network|timeout|abort|failed to connect|load failed)/i.test(message)) {
      return '暂时连不上故事书。请检查网络后重试。'
    }
  }
  return '这次操作没有完成。请稍后重试。'
}
