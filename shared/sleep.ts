// Screen sleep, shared by the home screen and the games.
// The Car Thing's 5th button on top (it sends the "M" key) toggles sleep: the screen goes black and the
// Bluetooth helper turns the backlight off. While asleep, any button, dial turn or tap wakes it, and that
// input is swallowed so waking never triggers anything.
// Call installSleep() BEFORE adding the page's own input listeners, so these run first.

const API = 'http://127.0.0.1:8737/api/screen?on='
let asleep = false
let overlay: HTMLDivElement | null = null
let swallowUp: { [code: string]: boolean } = {}
let wokeAt = 0 // a tap that wakes the screen must not also click what's under it
let changed: (asleep: boolean) => void = () => {}
export let lastKey = ''

function backlight(on: boolean) {
  try {
    const x = new XMLHttpRequest()
    x.open('GET', API + (on ? '1' : '0'), true)
    x.timeout = 8000
    x.send()
  } catch (e) { /* helper not running: the black overlay still works */ }
}

export function isAsleep() { return asleep }

export function sleepNow() {
  if (asleep) return
  asleep = true
  if (overlay) overlay.style.display = 'block'
  backlight(false)
  changed(true)
}

export function wake() {
  if (!asleep) return
  asleep = false
  wokeAt = Date.now()
  if (overlay) overlay.style.display = 'none'
  backlight(true)
  changed(false)
}

const isSleepKey = (e: KeyboardEvent) => e.code === 'KeyM' || e.key === 'm' || e.key === 'M'

export function installSleep(onChange?: (asleep: boolean) => void) {
  if (onChange) changed = onChange
  overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;background:#000;z-index:99999;display:none;cursor:none'
  document.body.appendChild(overlay)
  const swallow = (e: Event) => { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation() }

  window.addEventListener('keydown', (e) => {
    lastKey = e.code || e.key
    if (isSleepKey(e)) {
      swallow(e); swallowUp[e.code || e.key] = true
      if (!e.repeat) { if (asleep) wake(); else sleepNow() }
      return
    }
    if (asleep) { swallow(e); swallowUp[e.code || e.key] = true; wake() }
  }, true)
  window.addEventListener('keyup', (e) => {
    const k = e.code || e.key
    if (swallowUp[k]) { delete swallowUp[k]; swallow(e) }
  }, true)
  window.addEventListener('wheel', (e) => { if (asleep) { swallow(e); wake() } }, { capture: true, passive: false } as AddEventListenerOptions)
  const tap = (e: Event) => { if (asleep) { swallow(e); wake() } }
  window.addEventListener('touchstart', tap, { capture: true, passive: false } as AddEventListenerOptions)
  window.addEventListener('mousedown', tap, true)
  window.addEventListener('click', (e) => { if ((overlay && e.target === overlay) || Date.now() - wokeAt < 700) swallow(e) }, true)
  window.addEventListener('touchend', (e) => { if (Date.now() - wokeAt < 700) swallow(e) }, { capture: true, passive: false } as AddEventListenerOptions)
}
