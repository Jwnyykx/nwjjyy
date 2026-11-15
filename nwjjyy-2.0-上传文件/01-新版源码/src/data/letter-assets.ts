import { db, publishableKey, storageOrigin, unwrap } from './client'
import { FILE_LIMIT } from './media'
import { finalizeLetter, stageLetterAsset } from './letters'
import type { LetterAsset, LetterInput, LetterEnvelope } from './letters'

export const LETTER_BUCKET = 'storybook-letters'
export type PendingLetterAsset = { id: string; kind: LetterAsset['kind']; label: string; file?: File }
export const LETTER_IMAGE_TYPES = '.jpeg,.jpg,.png,.webp'
export const LETTER_AUDIO_TYPES = '.mp3,.m4a,.wav'

async function detectMime(file: File, kind: LetterAsset['kind']) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const signature = new TextDecoder().decode(bytes)
  if (kind === 'image') {
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
    if (bytes[0] === 137 && signature.slice(1, 4) === 'PNG') return 'image/png'
    if (signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP') return 'image/webp'
    throw new Error('请选择 JPG、PNG 或 WebP 图片。')
  }
  if (signature.startsWith('ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224)) return 'audio/mpeg'
  if (signature.slice(4, 8) === 'ftyp') return 'audio/mp4'
  if (signature.startsWith('RIFF') && signature.slice(8, 12) === 'WAVE') return 'audio/wav'
  throw new Error('信件音频支持 MP3、M4A 和 WAV。')
}

export async function putLetterAsset(letter: string, revision: number, item: PendingLetterAsset) {
  const file = item.file
  if (!file) return
  if (file.size < 12 || file.size > FILE_LIMIT) throw new Error('请选择有效文件，单份附件最大为 15 MB。')
  const mime = await detectMime(file, item.kind)
  await stageLetterAsset(letter, revision, { id: item.id, kind: item.kind, mime, size_bytes: file.size })
  const bucket = db().storage.from(LETTER_BUCKET)
  const { data: { session }, error } = await db().auth.getSession()
  if (error) throw error
  if (!session) throw new Error('登录已失效，请重新登录后再上传。')
  const result = await fetch(storageOrigin + '/storage/v1/object/' + LETTER_BUCKET + '/' + item.id, {
    method: 'POST',
    body: file.slice(0, file.size, mime),
    headers: {
      apikey: publishableKey, Authorization: 'Bearer ' + session.access_token,
      'x-upsert': 'false', 'Content-Type': mime, 'Cache-Control': 'max-age=0',
    }, signal: AbortSignal.timeout(90000),
  })
  if (result.ok) return
  if (result.status === 400 || result.status === 409) {
    const previous = await bucket.info(item.id)
    if (!previous.error && (previous.data?.size === file.size || previous.data?.metadata?.size === file.size)) return
  }
  throw new Error('附件上传没有完成（HTTP ' + result.status + '）。可以重试。')
}

export async function getLetterAsset(asset: LetterAsset) {
  const blob = unwrap(await db().storage.from(LETTER_BUCKET).download(asset.id))
  if (!blob) throw new Error('没有找到这份附件。')
  return blob
}

export async function removeLetterObjects(ids: string[]) {
  if (ids.length) unwrap(await db().storage.from(LETTER_BUCKET).remove(ids))
}

export async function saveLetterWithAssets(
  input: LetterInput,
  assets: PendingLetterAsset[],
  prepared: LetterEnvelope | null,
  uploaded: Set<string>,
  onPrepared: (value: LetterEnvelope) => void,
  onProgress: (value: string) => void,
) {
  let revision = input.p_expected
  if (assets.some(item => item.file)) {
    const draft = prepared ?? await finalizeLetter({ ...input, p_send: false, p_assets: null })
    onPrepared(draft)
    revision = draft.revision
    for (const item of assets.filter(part => part.file && !uploaded.has(part.id))) {
      onProgress('上传 ' + item.label)
      await putLetterAsset(input.p_id, revision, item)
      uploaded.add(item.id)
    }
  }
  onProgress(input.p_send ? '正在寄出…' : '正在保存…')
  return finalizeLetter({ ...input, p_expected: revision, p_assets: assets.map(item => item.id) })
}
