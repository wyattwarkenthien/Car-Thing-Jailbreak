import { H, W } from './game/gfx'
import { Inp, app } from './game/ui'
import { TitleScreen, env } from './game/screens'
import { store } from './game/storage'

const canvas = document.getElementById('c') as HTMLCanvasElement
const g = canvas.getContext('2d')!

function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H)
  canvas.style.width = Math.floor(W * s) + 'px'
  canvas.style.height = Math.floor(H * s) + 'px'
}
window.addEventListener('resize', fit)
fit()

// ---------------------------------------------------------------- input
const KEYMAP: Record<string, Inp> = {
  Digit1: 'b1', Digit2: 'b2', Digit3: 'b3', Digit4: 'b4', Numpad1: 'b1', Numpad2: 'b2', Numpad3: 'b3', Numpad4: 'b4',
  Enter: 'select', NumpadEnter: 'select', Space: 'select',
  Escape: 'back', Backspace: 'back', KeyM: 'back',
  ArrowLeft: 'left', ArrowUp: 'left', ArrowRight: 'right', ArrowDown: 'right',
}
const KEY_FALLBACK: Record<string, Inp> = { '1': 'b1', '2': 'b2', '3': 'b3', '4': 'b4', Enter: 'select', Escape: 'back', m: 'back', M: 'back' }

let escDownAt = 0
function onKeyDown(e: KeyboardEvent) {
  const inp = KEYMAP[e.code] || KEY_FALLBACK[e.key]
  if (!inp) return
  e.preventDefault(); e.stopPropagation()
  if (e.repeat) return
  if (inp === 'back') { escDownAt = Date.now(); return } // fire on key up so a long press can leave the game
  app.input(inp)
}
function onKeyUp(e: KeyboardEvent) {
  const inp = KEYMAP[e.code] || KEY_FALLBACK[e.key]
  if (!inp) return
  e.preventDefault(); e.stopPropagation()
  if (inp === 'back') {
    const held = Date.now() - escDownAt
    if (env.inDeskThing && held > 900) env.exit()
    else app.input('back')
  }
}
let lastWheel = 0
function onWheel(e: WheelEvent) {
  e.preventDefault(); e.stopPropagation()
  const now = Date.now()
  if (now - lastWheel < 28) return
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!d) return
  lastWheel = now
  let dir = d > 0 ? 1 : -1
  if (store.options().reverseDial) dir = -dir
  app.input(dir > 0 ? 'right' : 'left')
}
function onPointer(e: MouseEvent | TouchEvent) {
  const r = canvas.getBoundingClientRect()
  const p = 'touches' in e ? (e as TouchEvent).changedTouches[0] : (e as MouseEvent)
  if (!p) return
  const x = ((p.clientX - r.left) / r.width) * W
  const y = ((p.clientY - r.top) / r.height) * H
  e.preventDefault()
  app.tap(x, y)
}
window.addEventListener('keydown', onKeyDown, true)
window.addEventListener('keyup', onKeyUp, true)
window.addEventListener('wheel', onWheel, { capture: true, passive: false })
canvas.addEventListener('touchend', onPointer as EventListener, { passive: false })
canvas.addEventListener('mousedown', onPointer as EventListener)
document.addEventListener('contextmenu', (e) => e.preventDefault())

// ---------------------------------------------------------------- DeskThing (optional host)
if (window.parent && window.parent !== window) {
  env.inDeskThing = true
  import('@deskthing/client').then((mod) => {
    const DT = (mod as unknown as { DeskThing: { overrideKeys(k: string[]): void; triggerAction(a: unknown): void } }).DeskThing
    try { DT.overrideKeys(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Enter', 'Escape', 'KeyM', 'wheel', 'Scroll']) } catch { /* */ }
    env.exit = () => { try { DT.triggerAction({ id: 'appslist', value: 'show', source: 'server' }) } catch { /* */ } }
  }).catch(() => { /* not in DeskThing */ })
}

// ---------------------------------------------------------------- loop
let last = performance.now()
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  app.update(dt)
  g.save()
  app.draw(g)
  g.restore()
  requestAnimationFrame(frame)
}

function boot() {
  app.reset(new TitleScreen())
  requestAnimationFrame(frame)
}

const FF = (window as unknown as { FontFace?: typeof FontFace }).FontFace
if (FF && document.fonts) {
  const f = new FF('VT323', 'url(./fonts/vt323.woff2)')
  f.load().then((ff) => { document.fonts.add(ff); boot() }).catch(boot)
} else boot()

// test hook (harmless in production)
;(window as unknown as { __ww: unknown }).__ww = { app }
