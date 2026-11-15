import { useRef, useState } from 'react'
import { Archive, Download, FileJson } from 'lucide-react'
import { Link } from 'react-router'
import { useBook } from '../book-context'
import { backupContent } from '../data/book'
import { errorMessage } from '../data/client'
import { downloadMedia } from '../data/media'
import { backupStamp } from '../data/backup'
import type { Media } from '../data/types'
import { useUnsaved } from '../hooks'
import { Feedback, PageHeading } from '../ui/feedback'

const PART_LIMIT = 40 * 1024 * 1024

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

function groups(media: Media[]) {
  const parts: Media[][] = []
  let current: Media[] = []
  let size = 0
  for (const item of media) {
    const bytes = item.file_size + item.preview_size
    if (current.length && size + bytes > PART_LIMIT) {
      parts.push(current)
      current = []
      size = 0
    }
    current.push(item)
    size += bytes
  }
  if (current.length) parts.push(current)
  return parts
}

export default function Export() {
  const { member } = useBook()
  const [record, setRecord] = useState<Awaited<ReturnType<typeof backupContent>>>()
  const [preparedAt, setPreparedAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [completed, setCompleted] = useState<number[]>([])
  const inFlight = useRef(false)
  useUnsaved(false, busy)
  const parts = record ? groups(record.media) : []

  async function prepare() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    setProgress('正在读取有权限访问的记录…')
    try {
      const content = await backupContent()
      setPreparedAt(new Date().toISOString())
      setRecord(content)
      setCompleted([])
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
      inFlight.current = false
      setProgress('')
    }
  }

  function downloadRecords() {
    if (!record) return
    const json = {
      format: 'nwjjyy-storybook', version: 2, exported_at: preparedAt,
      scope: member.role === 'admin' ? 'complete' : 'readable',
      records: record,
      files: parts.map((items, index) => ({
        part: index + 1, uuids: items.map(item => item.id),
        filename: 'nwjjyy-media-' + backupStamp(preparedAt) + '-' + (index + 1) + '.zip',
      })),
    }
    download(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), 'nwjjyy-records-' + backupStamp(preparedAt) + '.json')
  }

  async function downloadPart(index: number) {
    if (inFlight.current) return
    const batch = parts[index]
    if (!batch) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const { Zip, ZipPassThrough } = await import('fflate')
      const chunks: BlobPart[] = []
      let zipError: unknown
      const zip = new Zip((failure, data) => {
        if (failure) zipError = failure
        else chunks.push(new Uint8Array(data).buffer)
      })
      for (const [i, item] of batch.entries()) {
        setProgress('正在备份第 ' + (index + 1) + ' 批 · ' + (i + 1) + ' / ' + batch.length)
        const kinds = item.media_type === 'image' ? ['original', 'preview'] as const : ['original'] as const
        for (const part of kinds) {
          const blob = await downloadMedia(item, part)
          const entry = new ZipPassThrough('media/' + item.storage_prefix + '/' + part)
          zip.add(entry)
          entry.push(new Uint8Array(await blob.arrayBuffer()), true)
        }
      }
      zip.end()
      if (zipError) throw zipError
      download(new Blob(chunks, { type: 'application/zip' }), 'nwjjyy-media-' + backupStamp(preparedAt) + '-' + (index + 1) + '.zip')
      setCompleted(previous => [...new Set([...previous, index])])
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setProgress('')
      setBusy(false)
      inFlight.current = false
    }
  }

  return <div className="page narrow-page">
    <PageHeading title="备份与导出" intro="给故事书留一份可以带走的副本。" action={<Link className="text-button" to="/more">返回更多</Link>} />
    <section className="panel form-stack">
      <h2><FileJson size={21} />记录与媒体</h2>
      <p>保存 JSON 和下方全部媒体 ZIP，可以一起保留故事书的文字、照片和录音。私人信件单独导出。</p>
      <Link className="text-button" to="/letters">去信箱导出信件</Link>
      {member.role !== 'admin' && <p className="field-help">迁移整个故事书时，请由管理员执行完整备份。</p>}
      <p className="field-help">建议在两位都暂停编辑时导出。生成的文件含有私人内容，请存到你们自己能访问的位置。</p>
      <button className="button" disabled={busy} onClick={() => void prepare()}><Archive size={18} />{record ? '重新准备备份' : '准备备份'}</button>
      {progress && <p className="notice" role="status">{progress}</p>}
      <Feedback error={error} />
      {record && <div className="backup-files">
        <button className="button secondary" disabled={busy} onClick={downloadRecords}><Download size={16} />下载记录 JSON</button>
        {parts.map((part, index) => <button className="button secondary" key={index} disabled={busy}
          onClick={() => void downloadPart(index)}><Download size={16} />下载媒体第 {index + 1} 批 · {part.length} 份{completed.includes(index) ? '（已下载）' : ''}</button>)}
        {!parts.length && <p className="field-help">目前没有需要备份的照片或录音。</p>}
      </div>}
    </section>
  </div>
}
