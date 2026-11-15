import type { SupabaseClient } from '@supabase/supabase-js'
import { db, unwrap } from './client'
import type { Database } from './types'

export type LetterBox = 'inbox' | 'sent' | 'draft' | 'favorite'
export type LetterTheme = 'plum' | 'rose' | 'kraft'
export const LETTER_PAGE_SIZE = 12

export type LetterEnvelope = {
  id: string
  author_id: string
  recipient_id: string
  title: string | null
  theme: LetterTheme
  unlock_at: string | null
  locked: boolean
  show_title: boolean
  share_opened: boolean
  draft: boolean
  sent_at: string | null
  opened_at: string | null
  created_at: string
  updated_at: string
  favorite: boolean
  revision: number
}
export type LetterAsset = { id: string; kind: 'image' | 'audio'; mime: string; size_bytes: number }
export type LetterDetail = LetterEnvelope & { body: string | null; attachments: LetterAsset[] }
export type LetterNotices = { unread: number; unlocked: number }
export type LetterArchive = { format: 'nwjjyy-private-letters-v1'; exported_at: string; letters: LetterDetail[] }
export type LetterInput = {
  p_id: string
  p_recipient: string
  p_title: string
  p_body: string
  p_theme: LetterTheme
  p_unlock: string | null
  p_show_title: boolean
  p_share_opened: boolean
  p_send: boolean
  p_expected: number | null
  p_assets?: string[] | null
}

type LetterFunctions = {
  letter_list: { Args: { p_box: LetterBox; p_offset: number }; Returns: LetterEnvelope[] }
  letter_status: { Args: never; Returns: LetterNotices }
  letter_archive: { Args: never; Returns: LetterArchive }
  letter_detail: { Args: { p_id: string }; Returns: LetterDetail | null }
  letter_save: { Args: LetterInput; Returns: LetterEnvelope }
  letter_open: { Args: { p_id: string }; Returns: LetterDetail }
  letter_favorite: { Args: { p_id: string; p_favorite: boolean }; Returns: undefined }
  letter_discard: { Args: { p_id: string; p_expected: number }; Returns: string[] }
  letter_stage: { Args: { p_id: string; p_revision: number; p_asset: string; p_kind: LetterAsset['kind']; p_mime: string; p_size: number }; Returns: undefined }
  letter_cleanup: { Args: { p_id: string }; Returns: string[] }
}

type LetterDatabase = { public: Database['public'] & { Functions: LetterFunctions } }
const mailbox = () => db() as unknown as SupabaseClient<LetterDatabase>

export async function lettersIn(box: LetterBox, page: number) {
  const result = unwrap(await mailbox().rpc('letter_list', { p_box: box, p_offset: page * LETTER_PAGE_SIZE })) ?? []
  return { rows: result.slice(0, LETTER_PAGE_SIZE), next: result.length > LETTER_PAGE_SIZE }
}

export async function letterNotices(): Promise<LetterNotices> {
  return unwrap(await mailbox().rpc('letter_status')) ?? { unread: 0, unlocked: 0 }
}

export async function exportLetterArchive() {
  return unwrap(await mailbox().rpc('letter_archive'))
}

export async function readLetter(id: string) {
  return unwrap(await mailbox().rpc('letter_detail', { p_id: id }))
}

export async function finalizeLetter(input: LetterInput) {
  const letter = unwrap(await mailbox().rpc('letter_save', input))
  if (!letter) throw new Error('未收到保存结果，请用相同内容重试。')
  return letter
}

export async function stageLetterAsset(id: string, revision: number, asset: LetterAsset) {
  unwrap(await mailbox().rpc('letter_stage', {
    p_id: id, p_revision: revision, p_asset: asset.id, p_kind: asset.kind, p_mime: asset.mime, p_size: asset.size_bytes,
  }))
}

export async function openLetter(id: string) {
  const letter = unwrap(await mailbox().rpc('letter_open', { p_id: id }))
  if (!letter) throw new Error('这封信暂时打不开。')
  return letter
}

export async function favoriteLetter(id: string, favorite: boolean) {
  unwrap(await mailbox().rpc('letter_favorite', { p_id: id, p_favorite: favorite }))
}

export async function discardLetter(id: string, revision: number) {
  return unwrap(await mailbox().rpc('letter_discard', { p_id: id, p_expected: revision }))
}

export async function discardedLetterAssets(id: string) {
  return unwrap(await mailbox().rpc('letter_cleanup', { p_id: id })) ?? []
}

export function letterMoment(value: string, zone: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: zone, year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value))
}

export function localLetterTime(value: string, zone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const part = (name: string) => parts.find(value => value.type === name)?.value
  return [part('year'), part('month'), part('day')].join('-') + 'T' + [part('hour'), part('minute')].join(':')
}
