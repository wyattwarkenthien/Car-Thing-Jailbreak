// Home screen for the Car Thing. Plain DOM, built for the device's old Chromium (no modules, no grid/gap).
import { APPS, AppDef, PRESETS } from './apps'

type Inp = 'left' | 'right' | 'select' | 'back' | 'b1' | 'b2' | 'b3' | 'b4'

// ---------------------------------------------------------------- storage (shared origin with the apps on file://)
function get<T>(k: string, def: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : def } catch (e) { return def }
}
function set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { /* storage unavailable */ } }

interface HomeOpts { clock24: boolean; tz: string }
const homeOpts = (): HomeOpts => { const o = get<Partial<HomeOpts>>('home_opts', {}); return { clock24: !!o.clock24, tz: o.tz || 'auto' } }

// The Car Thing's firmware has no time zone data, so its browser runs on UTC.
// We apply the offset ourselves, with US daylight saving rules.
interface Zone { id: string; label: string; std: number; dst: boolean }
const ZONES: Zone[] = [
  { id: 'auto', label: 'Device setting', std: 0, dst: false },
  { id: 'eastern', label: 'Eastern', std: -5, dst: true },
  { id: 'central', label: 'Central', std: -6, dst: true },
  { id: 'mountain', label: 'Mountain', std: -7, dst: true },
  { id: 'arizona', label: 'Arizona', std: -7, dst: false },
  { id: 'pacific', label: 'Pacific', std: -8, dst: true },
  { id: 'alaska', label: 'Alaska', std: -9, dst: true },
  { id: 'hawaii', label: 'Hawaii', std: -10, dst: false },
  { id: 'utc', label: 'UTC', std: 0, dst: false },
]
const zoneOf = (id: string) => ZONES.filter((z) => z.id === id)[0] || ZONES[0]

// nth Sunday of a month (UTC date math), n=1..
function nthSunday(year: number, month: number, n: number) {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay()
  return 1 + ((7 - first) % 7) + (n - 1) * 7
}
function usDst(ms: number, std: number) {
  const y = new Date(ms).getUTCFullYear()
  const start = Date.UTC(y, 2, nthSunday(y, 2, 2), 2 - std) // 2nd Sun Mar, 2:00 standard time
  const end = Date.UTC(y, 10, nthSunday(y, 10, 1), 2 - (std + 1)) // 1st Sun Nov, 2:00 daylight time
  return ms >= start && ms < end
}
// Returns a Date whose getUTC* fields read as local wall-clock time in the chosen zone.
function wallClock(): Date {
  const now = Date.now()
  const z = zoneOf(homeOpts().tz)
  if (z.id === 'auto') return new Date(now - new Date(now).getTimezoneOffset() * 60000)
  const off = z.std + (z.dst && usDst(now, z.std) ? 1 : 0)
  return new Date(now + off * 3600000)
}
// Dial direction is shared with Westward so one setting covers both.
const reverseDial = (): boolean => !!get<{ reverseDial?: boolean }>('westward_opts', {}).reverseDial
function setReverseDial(v: boolean) { const o = get<Record<string, unknown>>('westward_opts', {}); o.reverseDial = v; set('westward_opts', o) }

// ---------------------------------------------------------------- helpers
const $ = (id: string) => document.getElementById(id) as HTMLElement
const pad2 = (n: number) => (n < 10 ? '0' : '') + n
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function icon(a: AppDef, size: number) {
  return `<div class="icon" style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.24)}px;background:linear-gradient(160deg,${a.colors[0]},${a.colors[1]})">` +
    `<svg viewBox="0 0 24 24" width="${Math.round(size * 0.56)}" height="${Math.round(size * 0.56)}">${a.glyph}</svg></div>`
}

// ---------------------------------------------------------------- state
let focus = Math.max(0, Math.min(APPS.length - 1, get<number>('home_focus', 0)))
let view: 'home' | 'panel' = 'home'
let panelApp: AppDef | null = null
let rowFocus = 0
let leaving = false

// ---------------------------------------------------------------- home
function buildHome() {
  $('presets').innerHTML = PRESETS.map((id, i) => {
    const a = APPS.filter((x) => x.id === id)[0]
    return `<div class="preset"><span class="pnum">${i + 1}</span>${a ? a.name : ''}</div>`
  }).join('')
  $('grid').innerHTML = APPS.map((a, i) =>
    `<div class="tile" data-i="${i}">${icon(a, 92)}<div class="label">${a.name}</div></div>`).join('')
  const tiles = $('grid').querySelectorAll('.tile')
  for (let i = 0; i < tiles.length; i++) {
    tiles[i].addEventListener('click', () => { focus = i; paintFocus(); openApp(APPS[i]) })
  }
  paintFocus()
  paintTrail()
}

function paintFocus() {
  const tiles = $('grid').querySelectorAll('.tile')
  for (let i = 0; i < tiles.length; i++) tiles[i].className = 'tile' + (i === focus ? ' focus' : '')
  set('home_focus', focus)
}

function paintClock() {
  const d = wallClock()
  let h = d.getUTCHours()
  let ampm = ''
  if (!homeOpts().clock24) { ampm = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12 }
  $('time').innerHTML = `${homeOpts().clock24 ? pad2(h) : h}:${pad2(d.getUTCMinutes())}<span class="ampm">${ampm}</span>`
  $('date').textContent = `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

function paintTrail() {
  const s = get<{ v?: number; over?: boolean; arrived?: boolean; day?: number; miles?: number; party?: { alive: boolean }[] } | null>('westward_save', null)
  if (s && s.v === 1 && !s.over && !s.arrived && typeof s.day === 'number') {
    const dt = new Date(Date.UTC(1848, 0, 1) + s.day * 86400000)
    const alive = (s.party || []).filter((p) => p.alive).length
    const total = (s.party || []).length
    $('trail').innerHTML =
      `<div class="wlabel">On the trail</div>` +
      `<div class="wbig">${Math.round(s.miles || 0)} miles</div>` +
      `<div class="wsmall">${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}, 1848 · ${alive} of ${total} in the party</div>`
  } else {
    $('trail').innerHTML = `<div class="wlabel">Westward</div><div class="wsmall">No journey in progress. Press 1 to set out.</div>`
  }
}

// ---------------------------------------------------------------- panels
function openApp(a: AppDef) {
  if (leaving) return
  if (a.kind === 'page' && a.url) {
    leaving = true
    const tile = $('grid').querySelectorAll('.tile')[APPS.indexOf(a)] as HTMLElement
    if (tile) tile.className = 'tile focus launch'
    document.body.className = 'launching'
    setTimeout(() => { location.href = a.url! }, 260)
    return
  }
  panelApp = a
  view = 'panel'
  rowFocus = 0
  buildPanel()
  $('panel').className = 'panel open'
}

function closePanel() {
  view = 'home'
  panelApp = null
  $('panel').className = 'panel'
  paintClock()
}

interface Row { label: string; value: () => string; act?: () => void }
function settingsRows(): Row[] {
  return [
    { label: 'Dial direction', value: () => (reverseDial() ? 'Reversed' : 'Normal'), act: () => setReverseDial(!reverseDial()) },
    { label: 'Clock', value: () => (homeOpts().clock24 ? '24-hour' : '12-hour'), act: () => { const o = homeOpts(); o.clock24 = !o.clock24; set('home_opts', o) } },
    { label: 'Time zone', value: () => zoneOf(homeOpts().tz).label, act: () => { const o = homeOpts(); const i = ZONES.map((z) => z.id).indexOf(o.tz); o.tz = ZONES[(i + 1) % ZONES.length].id; set('home_opts', o) } },
    { label: 'Reload screen', value: () => '', act: () => location.reload() },
    { label: 'About', value: () => 'Home 0.1 · Westward 1.0' },
  ]
}

function buildPanel() {
  const a = panelApp!
  const head = `<div class="phead"><div class="pback" id="pback">‹ Home</div><div class="pname">${a.name}</div><div class="pspacer"></div></div>`
  if (a.id === 'settings') {
    const rows = settingsRows()
    $('panel').innerHTML = head + `<div class="rows">` + rows.map((r, i) =>
      `<div class="row${i === rowFocus ? ' focus' : ''}" data-i="${i}"><span>${r.label}</span><span class="rval">${r.value()}</span></div>`).join('') +
      `</div><div class="phint">Turn the dial to choose · press to change · Back to go home</div>`
    const els = $('panel').querySelectorAll('.row')
    for (let i = 0; i < els.length; i++) els[i].addEventListener('click', () => { rowFocus = i; activateRow() })
  } else {
    $('panel').innerHTML = head +
      `<div class="pbody">${icon(a, 128)}<div class="ptext"><div class="pstatus">${a.status || ''}</div><p>${a.blurb || ''}</p></div></div>` +
      `<div class="phint">Press Back to return home</div>`
  }
  $('pback').addEventListener('click', closePanel)
}

function activateRow() {
  const r = settingsRows()[rowFocus]
  if (r && r.act) { r.act(); buildPanel() }
}

// ---------------------------------------------------------------- input
function input(e: Inp) {
  if (leaving) return
  if (view === 'home') {
    if (e === 'left' || e === 'right') { focus = (focus + (e === 'right' ? 1 : -1) + APPS.length) % APPS.length; paintFocus() }
    else if (e === 'select') openApp(APPS[focus])
    else if (e === 'b1' || e === 'b2' || e === 'b3' || e === 'b4') {
      const id = PRESETS[+e.slice(1) - 1]
      const i = APPS.map((a) => a.id).indexOf(id)
      if (i >= 0) { focus = i; paintFocus(); openApp(APPS[i]) }
    }
    return
  }
  // panel
  if (e === 'back') { closePanel(); return }
  if (panelApp && panelApp.id === 'settings') {
    const n = settingsRows().length
    if (e === 'left' || e === 'right') { rowFocus = (rowFocus + (e === 'right' ? 1 : -1) + n) % n; buildPanel() }
    else if (e === 'select') activateRow()
  }
}

const KEYMAP: { [k: string]: Inp } = {
  Digit1: 'b1', Digit2: 'b2', Digit3: 'b3', Digit4: 'b4', Numpad1: 'b1', Numpad2: 'b2', Numpad3: 'b3', Numpad4: 'b4',
  Enter: 'select', NumpadEnter: 'select', Space: 'select',
  Escape: 'back', Backspace: 'back', KeyM: 'back',
  ArrowLeft: 'left', ArrowUp: 'left', ArrowRight: 'right', ArrowDown: 'right',
}
const KEY_FALLBACK: { [k: string]: Inp } = { '1': 'b1', '2': 'b2', '3': 'b3', '4': 'b4', Enter: 'select', Escape: 'back', m: 'back', M: 'back' }

window.addEventListener('keydown', (e) => {
  const inp = KEYMAP[e.code] || KEY_FALLBACK[e.key]
  if (!inp) return
  e.preventDefault(); e.stopPropagation()
  if (e.repeat) return
  input(inp)
}, true)

let lastWheel = 0
window.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault(); e.stopPropagation()
  const now = Date.now()
  if (now - lastWheel < 28) return
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!d) return
  lastWheel = now
  let dir = d > 0 ? 1 : -1
  if (reverseDial()) dir = -dir
  input(dir > 0 ? 'right' : 'left')
}, { capture: true, passive: false } as AddEventListenerOptions)
document.addEventListener('contextmenu', (e) => e.preventDefault())

// ---------------------------------------------------------------- layout
function fit() {
  const s = Math.min(window.innerWidth / 800, window.innerHeight / 480)
  const el = $('screen')
  el.style.transform = `translate(-50%,-50%) scale(${s})`
}
window.addEventListener('resize', fit)
window.addEventListener('pageshow', () => { leaving = false; document.body.className = ''; buildHome() })

fit()
buildHome()
paintClock()
setInterval(() => { if (view === 'home') paintClock() }, 1000)

// test hook
;(window as unknown as { __home: unknown }).__home = { input, state: () => ({ focus, view, panel: panelApp && panelApp.id, rowFocus }) }
