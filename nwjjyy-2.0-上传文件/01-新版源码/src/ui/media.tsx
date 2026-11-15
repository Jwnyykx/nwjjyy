import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageIcon, RotateCw, Volume2, X } from 'lucide-react'
import { Link } from 'react-router'
import { downloadMedia } from '../data/media'
import { dateLabel } from '../data/dates'
import type { Media } from '../data/types'
import { PhotoBack } from './PhotoBack'

function useMedia(item: Media | undefined, part: 'original' | 'preview', enabled: boolean) {
  const [result, setResult] = useState<{ key: string; src?: string; failed?: boolean }>()
  const [retry, setRetry] = useState(0)
  const prefix = item?.storage_prefix
  const key = prefix + ':' + part + ':' + retry
  useEffect(() => {
    if (!enabled || !prefix) return
    let active = true
    let url = ''
    const controller = new AbortController()
    downloadMedia({ storage_prefix: prefix }, part, controller.signal).then(blob => {
      if (!active) return
      url = URL.createObjectURL(blob)
      setResult({ key, src: url })
    }).catch(() => {
      if (active) setResult({ key, failed: true })
    })
    return () => {
      active = false
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [prefix, part, enabled, key])
  return { result: result?.key === key && enabled ? result : undefined, retry: () => setRetry(value => value + 1) }
}

export function PrivateImage({ item, eager = false, full = false, alt, onRetry }: {
  item?: Media; eager?: boolean; full?: boolean; alt?: string; onRetry?: boolean
}) {
  const frame = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(eager)
  const [decodeFailed, setDecodeFailed] = useState(false)
  const state = useMedia(item, full ? 'original' : 'preview', visible)
  useEffect(() => {
    if (visible || !frame.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '220px' })
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [visible])
  const failed = state.result?.failed || decodeFailed
  return <span ref={frame} className={'private-image' + (failed ? ' image-error' : '')}>
    {state.result?.src && !failed
      ? <img src={state.result.src} alt={alt ?? (item?.caption || '回忆照片')} onError={() => setDecodeFailed(true)} />
      : <span className="image-placeholder"><ImageIcon aria-hidden="true" size={24} strokeWidth={1.35} />
        {failed && <span>照片暂时打不开</span>}</span>}
    {onRetry && failed && <button className="button secondary small image-retry" type="button"
      onClick={() => { setDecodeFailed(false); state.retry() }}>重新加载</button>}
  </span>
}

export function PrivateAudio({ item }: { item: Media }) {
  const [open, setOpen] = useState(false)
  const [playError, setPlayError] = useState(false)
  const media = useMedia(item, 'original', open)
  return <div className="audio-row">
    <Volume2 size={20} aria-hidden="true" />
    <div><strong>{item.caption || '声音记录'}</strong>
      {!open && <button type="button" className="text-button" onClick={() => setOpen(true)}>载入录音</button>}
      {open && !media.result && <p role="status">正在读取录音…</p>}
      {open && (media.result?.failed || playError) && <div role="alert"><p>录音暂时无法播放。</p>
        <button className="text-button" onClick={() => { setPlayError(false); media.retry() }}>重试</button></div>}
      {media.result?.src && !playError && <audio controls preload="metadata" src={media.result.src} onError={() => setPlayError(true)} />}
    </div>
  </div>
}

export function Lightbox({ photos, current, close, setCurrent }: {
  photos: Media[]; current: number; close: () => void; setCurrent: (index: number) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const touch = useRef<number | null>(null)
  const photo = photos[current]
  const [backPhoto, setBackPhoto] = useState<string>()
  const reversed = Boolean(photo && backPhoto === photo.id)
  const move = (step: number) => setCurrent((current + step + photos.length) % photos.length)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  if (!photo) return null
  return <dialog className="lightbox" ref={dialog}
    onCancel={event => { event.preventDefault(); close() }}
    onClick={event => { if (event.target === event.currentTarget) close() }}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
    }}>
    <div className="lightbox-inner">
      <div className="lightbox-top"><p>{current + 1} / {photos.length}</p>
        <button type="button" className="icon-button" onClick={close} aria-label="关闭照片"><X size={22} /></button></div>
      {reversed ? <PhotoBack key={photo.id} item={photo} reversed /> : <div className="lightbox-image" onTouchStart={event => { touch.current = event.touches[0].clientX }}
        onTouchEnd={event => {
          if (touch.current === null) return
          const delta = event.changedTouches[0].clientX - touch.current
          touch.current = null
          if (Math.abs(delta) > 45) move(delta < 0 ? 1 : -1)
        }}>
        <PrivateImage key={photo.id} item={photo} full eager onRetry />
      </div>}
      <div className="lightbox-info">
        <button className="icon-button" onClick={() => move(-1)} disabled={photos.length < 2} aria-label="上一张照片"><ChevronLeft /></button>
        <div><strong>{photo.caption || '相册照片'}</strong><p>{dateLabel(photo.event_date)}</p>
          <button className="text-button photo-turn" onClick={() => setBackPhoto(reversed ? undefined : photo.id)}>
            <RotateCw size={14} />{reversed ? '回到正面' : '翻到背面'}
          </button>
          {photo.story_id && <Link to={'/stories/' + photo.story_id} onClick={close}>查看所属故事</Link>}</div>
        <button className="icon-button" onClick={() => move(1)} disabled={photos.length < 2} aria-label="下一张照片"><ChevronRight /></button>
      </div>
    </div>
  </dialog>
}
