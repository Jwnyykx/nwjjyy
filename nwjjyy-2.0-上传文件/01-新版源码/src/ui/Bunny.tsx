import { useEffect, useRef, useState } from 'react'
import bunny from '../../assets/images/bunny-model.png'
import './bunny.css'

export function Bunny() {
  const [state, setState] = useState({ text: '', stepping: false, surprise: false })
  const lastTaps = useRef<number[]>([])
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  function step() {
    const now = performance.now()
    lastTaps.current = lastTaps.current.filter(time => now - time < 1400)
    lastTaps.current.push(now)
    const surprise = lastTaps.current.length >= 3 || state.surprise
    if (surprise) lastTaps.current = []
    timers.current.forEach(clearTimeout)
    setState({ text: surprise ? '被你发现啦！' : '你咋这样！', stepping: true, surprise })
    timers.current = [
      setTimeout(() => setState(value => ({ ...value, stepping: false })), 1700),
      setTimeout(() => setState({ text: '', stepping: false, surprise: false }), surprise ? 3000 : 2100),
    ]
  }

  return <aside className="bunny-corner">
    <div className="bunny-stage" data-stepping={state.stepping} data-surprise={state.surprise}>
        <button className="bunny-button" type="button" onClick={step} aria-label="摸摸小兔子">
          <svg className="bunny-model" viewBox="0 65 1199 1190" aria-hidden="true" focusable="false">
            <defs>
              <image id="bunny-texture" href={bunny} width="1199" height="1312"/>
              <path id="ear-left-cut" d="M0 260H315L340 280C306 351 294 417 290 470C280 536 300 598 364 640C324 692 313 754 338 814C315 920 278 1000 190 1025H0Z"/>
              <path id="ear-right-cut" d="M1199 245H854L828 273C855 358 878 445 879 514C882 565 862 607 830 640C878 700 888 764 854 833C895 962 955 1025 1087 1033H1199Z"/>
              <path id="foot-left-cut" d="M318 1098Q447 1057 596 1100V1260H306Z"/>
              <path id="foot-right-cut" d="M594 1100Q735 1065 874 1103V1260H594Z"/>
              <clipPath id="clip-ear-left"><use href="#ear-left-cut"/></clipPath>
              <clipPath id="clip-ear-right"><use href="#ear-right-cut"/></clipPath>
              <clipPath id="clip-foot-left"><use href="#foot-left-cut"/></clipPath>
              <clipPath id="clip-foot-right"><use href="#foot-right-cut"/></clipPath>
              <clipPath id="clip-eye-left"><ellipse cx="438" cy="445" rx="52" ry="51"/></clipPath>
              <clipPath id="clip-eye-right"><ellipse cx="749" cy="428" rx="53" ry="54"/></clipPath>
              <mask id="bunny-body-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1199" height="1312">
                <rect width="1199" height="1312" fill="white"/>
                <g fill="black"><use href="#ear-left-cut"/><use href="#ear-right-cut"/><path d="M0 1135H1199V1312H0Z"/><ellipse cx="438" cy="445" rx="51" ry="50"/><ellipse cx="749" cy="428" rx="52" ry="53"/></g>
              </mask>
              <clipPath id="model-edge-trim"><rect x="10" y="77" width="1180" height="1168" rx="8"/></clipPath>
            </defs>
            <ellipse cx="603" cy="1242" rx="280" ry="14" fill="#9a79b5" opacity=".13"/>
            <g className="bunny-character" clipPath="url(#model-edge-trim)">
              <g className="bunny-ear-left" clipPath="url(#clip-ear-left)"><use href="#bunny-texture"/></g>
              <g className="bunny-ear-right" clipPath="url(#clip-ear-right)"><use href="#bunny-texture"/></g>
              <g mask="url(#bunny-body-mask)"><use href="#bunny-texture"/></g>
              <g clipPath="url(#clip-eye-left)"><use href="#bunny-texture" y="125"/></g>
              <g clipPath="url(#clip-eye-right)"><use href="#bunny-texture" y="125"/></g>
              <g className="bunny-eye-left" clipPath="url(#clip-eye-left)"><use href="#bunny-texture"/></g>
              <g className="bunny-eye-right" clipPath="url(#clip-eye-right)"><use href="#bunny-texture"/></g>
              <g className="bunny-blush"><ellipse cx="346" cy="542" rx="65" ry="23" fill="#f2a6b0" opacity=".25"/><ellipse cx="837" cy="530" rx="65" ry="23" fill="#f2a6b0" opacity=".25"/></g>
              <g className="bunny-foot-left" clipPath="url(#clip-foot-left)"><use href="#bunny-texture"/></g>
              <g className="bunny-foot-right" clipPath="url(#clip-foot-right)"><use href="#bunny-texture"/></g>
            </g>
          </svg>
        </button>
        <div className="bunny-speech" role="status" hidden={!state.text}>{state.text}</div>
        {state.surprise && <span className="bunny-spark" aria-hidden="true">✦</span>}
    </div>
  </aside>
}
