import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { FILE_LIMIT } from '../data/media'
import { Feedback } from './feedback'

const formats = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
const seconds = 90

export function VoiceRecorder({ accept }: { accept: (file: File) => void }) {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'recording'>('idle')
  const [sample, setSample] = useState<{ file: File; url: string }>()
  const [error, setError] = useState('')
  const controller = useRef<{ stream?: MediaStream; recorder?: MediaRecorder; timer?: ReturnType<typeof setTimeout>; gone: boolean }>({ gone: false })
  const available = typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  useEffect(() => {
    const state = controller.current
    return () => {
      state.gone = true
      clearTimeout(state.timer)
      state.stream?.getTracks().forEach(track => track.stop())
    }
  }, [])
  useEffect(() => () => { if (sample) URL.revokeObjectURL(sample.url) }, [sample])

  async function record() {
    const state = controller.current
    setError('')
    setSample(undefined)
    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (state.gone) { stream.getTracks().forEach(track => track.stop()); return }
      state.stream = stream
      const format = formats.find(type => MediaRecorder.isTypeSupported(type))
      if (!format) throw Error('No supported audio format')
      const recorder = new MediaRecorder(stream, { mimeType: format })
      state.recorder = recorder
      const chunks: Blob[] = []
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => {
        clearTimeout(state.timer)
        stream.getTracks().forEach(track => track.stop())
        if (state.gone) return
        setStatus('idle')
        const type = recorder.mimeType.split(';')[0]
        const file = new File(chunks, '一段声音.' + (type === 'audio/mp4' ? 'm4a' : type.split('/')[1]), { type })
        if (file.size < 12 || file.size > FILE_LIMIT) {
          setError('这段录音没有保存。请录一段短一点的声音。')
          return
        }
        setSample({ file, url: URL.createObjectURL(file) })
      }
      recorder.start()
      setStatus('recording')
      state.timer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop() }, seconds * 1000)
    } catch {
      state.stream?.getTracks().forEach(track => track.stop())
      if (state.gone) return
      setStatus('idle')
      setError('无法使用麦克风。请核对浏览器权限，或选择录音文件。')
    }
  }

  if (!available) return null
  return <div className="voice-recorder">
    <div className="actions">
      {status === 'recording' ? <button type="button" className="button secondary small" onClick={() => controller.current.recorder?.stop()}>
        <Square size={15} />停止录音</button>
        : <button type="button" className="button secondary small" disabled={status === 'requesting'} onClick={() => void record()}>
          <Mic size={15} />{status === 'requesting' ? '正在请求麦克风…' : sample ? '重新录制' : '直接录音'}</button>}
      {status === 'recording' && <span role="status">正在录音 · 最长 {seconds} 秒</span>}
    </div>
    {sample && <div className="form-stack"><audio controls src={sample.url} />
      <div className="actions"><button className="button small" type="button" onClick={() => { accept(sample.file); setSample(undefined) }}>加入故事</button>
        <button className="text-button" type="button" onClick={() => setSample(undefined)}>丢弃这段录音</button></div>
    </div>}
    <Feedback error={error} />
  </div>
}
