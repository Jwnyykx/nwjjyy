import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, AudioLines, ImagePlus, Trash2 } from 'lucide-react'
import { AUDIO_ACCEPT, FILE_LIMIT, PHOTO_ACCEPT } from '../data/media'
import type { Attachment } from '../data/media'
import type { MediaKind } from '../data/types'
import { Feedback } from './feedback'
import { PrivateImage } from './media'
import { VoiceRecorder } from './VoiceRecorder'

export function AttachmentPicker({ items, onChange, cover, setCover, inline, limit = 25, audio = false }: {
  items: Attachment[]
  onChange: (items: Attachment[]) => void
  cover?: string | null
  setCover?: (id: string | null) => void
  inline?: (item: Attachment) => void
  limit?: number
  audio?: boolean
}) {
  const [keepOriginal, setKeepOriginal] = useState(true)
  const [error, setError] = useState('')
  const objectUrls = useRef(new Set<string>())
  useEffect(() => {
    const urls = objectUrls.current
    return () => urls.forEach(url => URL.revokeObjectURL(url))
  }, [])

  function select(files: FileList | File[] | null, kind: MediaKind) {
    if (!files?.length) return
    setError('')
    const unique = new Set(items.flatMap(item => item.file ? [fileKey(item.file)] : []))
    const selected = Array.from(files).filter(file => {
      const key = fileKey(file)
      if (unique.has(key)) return false
      unique.add(key)
      return true
    })
    if (!selected.length) {
      setError('这些文件已在列表中。')
      return
    }
    if (selected.length + items.length > limit) {
      setError('这一页最多保存 ' + limit + ' 份媒体。')
      return
    }
    if (selected.some(file => file.size < 12 || file.size > FILE_LIMIT)) {
      setError('每份照片或录音需小于或等于 15 MB。请重新选择。')
      return
    }
    const attached = selected.map(file => {
      const previewUrl = kind === 'image' ? URL.createObjectURL(file) : undefined
      if (previewUrl) objectUrls.current.add(previewUrl)
      return { id: crypto.randomUUID(), kind, caption: '', file, original: keepOriginal, previewUrl }
    })
    onChange([...items, ...attached])
    if (setCover && !cover && kind === 'image') setCover(attached[0].id)
  }

  function move(index: number, offset: number) {
    const other = index + offset
    if (other < 0 || other >= items.length) return
    const next = items.slice()
    ;[next[index], next[other]] = [next[other], next[index]]
    onChange(next)
  }

  function remove(item: Attachment) {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl)
      objectUrls.current.delete(item.previewUrl)
    }
    onChange(items.filter(value => value.id !== item.id))
    if (cover === item.id) setCover?.(null)
  }

  return <div className="attachment-picker">
    <div className="upload-controls">
      <label className="file-button"><ImagePlus size={18} />选择照片
        <input type="file" accept={PHOTO_ACCEPT} multiple={limit > 1}
          onChange={event => { select(event.target.files, 'image'); event.target.value = '' }} />
      </label>
      {audio && <label className="file-button"><AudioLines size={18} />选择录音
        <input type="file" accept={AUDIO_ACCEPT} onChange={event => { select(event.target.files, 'audio'); event.target.value = '' }} />
      </label>}
      <label className="check"><input type="checkbox" checked={keepOriginal} onChange={event => setKeepOriginal(event.target.checked)} />保留所选照片的原图</label>
    </div>
    {audio && <VoiceRecorder accept={file => select([file], 'audio')} />}
    <p className="field-help">JPG、PNG、WebP{audio ? ' 和 MP3、M4A、WAV' : ''}。每份最大 15 MB，照片会自动生成缩略图。</p>
    <Feedback error={error} />
    {items.length > 0 && <ol className="attachment-list">{items.map((item, index) => <li key={item.id}>
      <div className="attachment-preview">
        {item.kind === 'audio' ? <AudioLines aria-hidden="true" /> : item.existing
          ? <PrivateImage item={item.existing} alt={item.caption || '已保存的照片'} />
          : <img src={item.previewUrl} alt={item.caption || '待上传的照片'} />}
      </div>
      <div className="attachment-fields">
        <label>{item.kind === 'image' ? '照片说明' : '录音说明'}<input maxLength={320} value={item.caption}
          onChange={event => onChange(items.map(value => value.id === item.id ? { ...value, caption: event.target.value } : value))} /></label>
        <div className="actions">
          {item.kind === 'image' && setCover && (item.id === cover
            ? <button className="text-button" type="button" onClick={() => setCover(null)}>取消封面</button>
            : <button className="text-button" type="button" onClick={() => setCover(item.id)}>设为封面</button>)}
          {item.kind === 'image' && inline && <button className="text-button" type="button" onClick={() => inline(item)}>插入正文</button>}
          {item.id === cover && <span className="badge">封面</span>}
          {items.length > 1 && <>
            <button className="icon-button" type="button" aria-label={'上移第 ' + (index + 1) + ' 份媒体'}
              disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></button>
            <button className="icon-button" type="button" aria-label={'下移第 ' + (index + 1) + ' 份媒体'}
              disabled={index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button>
          </>}
          <button className="icon-button danger" type="button" aria-label={'移除第 ' + (index + 1) + ' 份媒体'}
            onClick={() => remove(item)}><Trash2 size={16} /></button>
        </div>
      </div>
    </li>)}</ol>}
  </div>
}

function fileKey(file: File) {
  return [file.name, file.size, file.lastModified].join('|')
}
