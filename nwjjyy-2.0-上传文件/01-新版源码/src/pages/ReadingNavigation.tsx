import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'

export type ReaderSection = { id: string; label: string; icon: LucideIcon }

export function ReadingNavigation({ sections }: { sections: ReaderSection[] }) {
  const guide = useRef<HTMLElement>(null)
  const [reading, setReading] = useState({ section: sections[0]?.id, progress: 0 })
  const keys = sections.map(item => item.id).join(' ')
  useEffect(() => {
    const chapter = guide.current?.closest('article')
    const targets = keys.split(' ').flatMap(id => document.getElementById(id) ?? [])
    const first = targets[0]
    const last = targets[targets.length - 1]
    if (!chapter || !first || !last) return
    let frame = 0

    function measure(startSection: HTMLElement, endSection: HTMLElement) {
      frame = 0
      const start = startSection.getBoundingClientRect().top
      const end = endSection.getBoundingClientRect().bottom
      const readingLine = window.innerHeight * .32
      const pageEnd = window.innerHeight * .88
      const distance = Math.max(1, end - start - pageEnd + readingLine)
      const progress = end <= pageEnd && start <= readingLine ? 100
        : Math.min(99, Math.max(0, Math.round(100 * (readingLine - start) / distance)))
      const section = targets.findLast(target => target.getBoundingClientRect().top <= readingLine)?.id ?? startSection.id
      setReading(previous => previous.section === section && previous.progress === progress ? previous : { section, progress })
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(() => measure(first, last))
    }

    const resize = new ResizeObserver(schedule)
    resize.observe(chapter)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      resize.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [keys])

  function jump(id: string) {
    const target = document.getElementById(id)
    if (!target) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.focus({ preventScroll: true })
    target.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' })
  }

  return <aside className="reader-guide" ref={guide}>
    <div className="reader-scroll-line" aria-hidden="true"><span style={{ width: reading.progress + '%' }} /></div>
    <div className="reader-guide-progress">
      <span>阅读进度</span><span aria-hidden="true">{reading.progress}%</span>
      <progress aria-label="阅读进度" max={100} value={reading.progress} />
    </div>
    <nav aria-label="本篇目录">
      {sections.map(item => <button key={item.id} type="button" onClick={() => jump(item.id)}
        aria-current={reading.section === item.id ? 'location' : undefined}><item.icon size={16} aria-hidden="true" />{item.label}</button>)}
    </nav>
  </aside>
}
