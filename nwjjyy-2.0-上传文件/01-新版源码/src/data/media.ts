import { BUCKET, db, publishableKey, storageOrigin, unwrap } from './client'
import { stageRow } from './book'
import type { Media, MediaKind, NewMedia } from './types'

export const FILE_LIMIT = 15 * 1024 * 1024
export const PHOTO_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'
export const AUDIO_ACCEPT = '.mp3,.m4a,.wav,.webm,.ogg,audio/mpeg,audio/mp4,audio/wav,audio/webm,audio/ogg'

export type Attachment = {
  id: string
  kind: MediaKind
  caption: string
  file?: File
  original?: boolean
  existing?: Media
  previewUrl?: string
}

export function fromMedia(existing: Media): Attachment {
  return { id: existing.id, kind: existing.media_type, caption: existing.caption, existing }
}

async function fileType(file: File, type: MediaKind) {
  if (file.size < 12 || file.size > FILE_LIMIT) throw new Error('每份文件应小于或等于 15 MB。')
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const text = new TextDecoder().decode(bytes)
  if (type === 'image') {
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
    if (bytes[0] === 137 && text.slice(1, 4) === 'PNG') return 'image/png'
    if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') return 'image/webp'
    throw new Error('请选择 JPG、PNG 或 WebP 照片。iPhone 的 HEIC 可先转为 JPEG。')
  }
  if (text.startsWith('ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224)) return 'audio/mpeg'
  if (text.slice(4, 8) === 'ftyp') return 'audio/mp4'
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WAVE') return 'audio/wav'
  if (text.startsWith('OggS')) return 'audio/ogg'
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'audio/webm'
  throw new Error('请选择 MP3、M4A、WAV、WebM 或 Ogg 录音。')
}

function resize(image: HTMLImageElement, longest: number, quality: number) {
  const scale = Math.min(1, longest / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('手机暂时无法处理图片。请试一张较小的照片。')
  context.fillStyle = '#faf8f5'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法生成图片，请重新选择。')), 'image/jpeg', quality)
  }).finally(() => { canvas.width = 0; canvas.height = 0 })
}

async function prepare(file: File, kind: MediaKind, preserve: boolean) {
  const type = await fileType(file, kind)
  const raw = file.slice(0, file.size, type)
  if (kind === 'audio') return { full: raw, preview: null }

  const image = new Image()
  const url = URL.createObjectURL(raw)
  try {
    image.src = url
    try {
      await image.decode()
    } catch {
      throw new Error('这张照片无法打开。请确认文件完整后重新选择。')
    }
    if (image.naturalWidth * image.naturalHeight > 100_000_000) throw new Error('照片尺寸过大，请在手机上缩小后再选择。')
    const preview = await resize(image, 560, 0.76)
    const full = preserve ? raw : await resize(image, 2200, 0.9)
    return { full, preview }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function objectPath(prefix: string, part: 'original' | 'preview') {
  return prefix + '/' + part
}

async function uploadObject(path: string, payload: Blob, report: (ratio: number) => void) {
  const { data: { session }, error } = await db().auth.getSession()
  if (error) throw error
  if (!session) throw new Error('登录已失效，请重新登录后再上传。')
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  const reply = await new Promise<{ code: number; duplicate: boolean }>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', storageOrigin + '/storage/v1/object/' + BUCKET + '/' + encoded)
    request.timeout = 90000
    request.setRequestHeader('apikey', publishableKey)
    request.setRequestHeader('Authorization', 'Bearer ' + session.access_token)
    request.setRequestHeader('x-upsert', 'false')
    request.setRequestHeader('Content-Type', payload.type)
    request.setRequestHeader('Cache-Control', 'max-age=0')
    request.upload.onprogress = event => {
      if (event.lengthComputable) report(event.loaded / event.total)
    }
    request.onload = () => {
      const duplicate = request.status === 409 || (
        request.status === 400 && /already exists|duplicate/i.test(request.responseText)
      )
      resolve({ code: request.status, duplicate })
    }
    request.ontimeout = () => reject(new Error('上传超时。请检查网络后重试。'))
    request.onerror = () => reject(new Error('上传时网络断开了。可以重试。'))
    request.send(payload)
  })
  if (reply.code >= 200 && reply.code < 300) {
    report(1)
    return
  }
  if (reply.duplicate) {
    const info = unwrap(await db().storage.from(BUCKET).info(path))
    if (info?.size === payload.size || info?.metadata?.size === payload.size) {
      report(1)
      return
    }
    throw new Error('上传文件与之前的版本不同，请重新选择文件。')
  }
  if (reply.code === 413) throw new Error('这份文件超过当前存储的上传限制。')
  if (reply.code === 401 || reply.code === 403) throw new Error('登录过期或没有上传权限。请重新登录后重试。')
  throw new Error('上传没有完成（HTTP ' + reply.code + '）。请检查存储额度或重试。')
}

type Progress = (label: string, percent: number) => void

export async function stageAttachment(
  attachment: Attachment,
  target: Pick<NewMedia, 'story_id' | 'diary_id' | 'category_id' | 'event_date'>,
  progress: Progress,
) {
  if (attachment.existing) return attachment.existing
  if (!attachment.file) throw new Error('请重新选择需要上传的文件。')
  progress('正在处理 ' + attachment.file.name, 0)
  const { full, preview } = await prepare(attachment.file, attachment.kind, Boolean(attachment.original))
  const item = await stageRow({
    ...target, id: attachment.id, media_type: attachment.kind, content_type: full.type,
    file_size: full.size, preview_size: preview?.size ?? 0, caption: attachment.caption,
  })
  await uploadObject(objectPath(item.storage_prefix, 'original'), full,
    ratio => progress('正在上传 ' + attachment.file?.name, Math.round(ratio * (preview ? 90 : 100))))
  if (preview) {
    await uploadObject(objectPath(item.storage_prefix, 'preview'), preview,
      ratio => progress('正在上传预览图', 90 + Math.round(ratio * 10)))
  }
  return item
}

export async function stageAll(
  attachments: Attachment[],
  target: Parameters<typeof stageAttachment>[1],
  progress: Progress,
) {
  const uploads = attachments.filter(item => !item.existing).length
  let index = 0
  for (const item of attachments) {
    if (item.existing) continue
    await stageAttachment(item, target, (label, percent) => {
      progress((index + 1) + ' / ' + uploads + ' · ' + label, Math.round((index + percent / 100) / uploads * 100))
    })
    index += 1
  }
}

export function mediaOrder(attachments: Attachment[]) {
  return attachments.map((item, index) => ({ id: item.id, caption: item.caption.trim(), sort_order: index }))
}

export async function downloadMedia(item: Pick<Media, 'storage_prefix'>, variant: 'original' | 'preview', signal?: AbortSignal) {
  const object = objectPath(item.storage_prefix, variant)
  const file = unwrap(await db().storage.from(BUCKET).download(object, {}, { signal }))
  if (!file) throw new Error('找不到这份媒体。')
  return file
}

export async function discardStaged(item: Media) {
  const saved = unwrap(await db().from('media').update({ deleted_at: new Date().toISOString() })
    .eq('id', item.id).eq('state', 'staged').select('id').maybeSingle())
  if (!saved) throw new Error('这份上传已经保存，请刷新。')
  const paths = [objectPath(item.storage_prefix, 'original')]
  if (item.media_type === 'image') paths.push(objectPath(item.storage_prefix, 'preview'))
  unwrap(await db().storage.from(BUCKET).remove(paths))
}
