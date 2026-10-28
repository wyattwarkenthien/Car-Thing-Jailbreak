// Home screen for the Car Thing. Plain DOM, built for the device's old Chromium (no modules, no grid/gap).
import { APPS, AppDef, PRESETS } from './apps'
import { BtPrompt, BtStatus, btApi } from './bt'
import { input as musicInput, musicOpen, openMusic } from './music'
import { input as phoneInput, openPhone, phoneOpen } from './phone'
import { input as radioInput, openRadio, radioOpen } from './radio'
import { installSleep, lastKey } from '../../shared/sleep'

// 5th button on top = screen sleep (must be installed before the other key listeners)
installSleep()

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
function wallAt(ms: number): Date {
  const z = zoneOf(homeOpts().tz)
  if (z.id === 'auto') return new Date(ms - new Date(ms).getTimezoneOffset() * 60000)
  const off = z.std + (z.dst && usDst(ms, z.std) ? 1 : 0)
  return new Date(ms + off * 3600000)
}
function wallClock(): Date { return wallAt(Date.now()) }
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
let leaving = false

// Panels stack: Settings -> Bluetooth -> one device, or an app's placeholder page.
type PanelKind = 'settings' | 'bluetooth' | 'device' | 'app'
interface Panel { kind: PanelKind; app?: AppDef; mac?: string; focus: number; title: string }
let stack: Panel[] = []
const top = (): Panel | null => (stack.length ? stack[stack.length - 1] : null)

// Bluetooth state from the helper
let bt: BtStatus | null = null
let btSeen = false // helper has answered at least once
let btLastJson = ''
let prompt: BtPrompt | null = null

// ---------------------------------------------------------------- home
function buildHome() {
  $('presets').innerHTML = PRESETS.map((id, i) => {
    const a = APPS.filter((x) => x.id === id)[0]
    return `<div class="preset"><span class="pnum">${i + 1}</span>${a ? a.name : ''}</div>`
  }).join('')
  let html = '<div class="strip" id="strip">'
  for (let pg = 0; pg < PAGES; pg++) {
    html += '<div class="page">' + APPS.slice(pg * PER_PAGE, (pg + 1) * PER_PAGE).map((a, k) =>
      `<div class="tile" data-i="${pg * PER_PAGE + k}">${icon(a, 92)}<div class="label">${a.name}</div></div>`).join('') + '</div>'
  }
  $('grid').innerHTML = html + '</div>'
  $('dots').innerHTML = PAGES > 1 ? APPS.slice(0, PAGES).map((_, i) => `<span class="dot" data-p="${i}"></span>`).join('') : ''
  const tiles = $('grid').querySelectorAll('.tile')
  for (let i = 0; i < tiles.length; i++) {
    tiles[i].addEventListener('click', function (this: HTMLElement) {
      if (Date.now() - swipedAt < 450) return // that touch was a swipe, not a tap
      const k = +(this.getAttribute('data-i') || 0)
      focus = k; paintFocus(); openApp(APPS[k])
    })
  }
  paintFocus()
  paintWidget()
}

// ---------------------------------------------------------------- pages (6 apps each; swipe or turn the dial past the end)
const PER_PAGE = 6
const PAGES = Math.ceil(APPS.length / PER_PAGE)
let page = 0
let swipedAt = 0
const pageOf = (i: number) => Math.floor(i / PER_PAGE)

function showPage(pg: number, offsetPx = 0) {
  page = Math.max(0, Math.min(PAGES - 1, pg))
  const strip = document.getElementById('strip')
  if (strip) {
    const x = -page * 468 + offsetPx
    strip.style.webkitTransform = `translate3d(${x}px,0,0)`
    strip.style.transform = `translate3d(${x}px,0,0)`
  }
  const dots = $('dots').querySelectorAll('.dot')
  for (let i = 0; i < dots.length; i++) dots[i].className = 'dot' + (i === page ? ' on' : '')
}

function goPage(pg: number) {
  pg = Math.max(0, Math.min(PAGES - 1, pg))
  if (pageOf(focus) !== pg) focus = Math.min(APPS.length - 1, pg * PER_PAGE + (focus % PER_PAGE))
  paintFocus()
}

function paintFocus() {
  const tiles = $('grid').querySelectorAll('.tile')
  for (let i = 0; i < tiles.length; i++) tiles[i].className = 'tile' + (i === focus ? ' focus' : '')
  set('home_focus', focus)
  showPage(pageOf(focus))
}

// swipe left/right on the app grid
;(() => {
  let x0 = 0, y0 = 0, dx = 0, active = false, horiz = false
  const grid = () => $('grid')
  const start = (x: number, y: number) => { x0 = x; y0 = y; dx = 0; active = true; horiz = false }
  const move = (x: number, y: number, e: Event) => {
    if (!active) return
    dx = (x - x0) / (Math.min(window.innerWidth / 800, window.innerHeight / 480) || 1)
    if (!horiz && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(y - y0)) { horiz = true; const s = document.getElementById('strip'); if (s) s.className = 'strip drag' }
    if (horiz) {
      e.preventDefault()
      // resist past the first and last page
      const edge = (page === 0 && dx > 0) || (page === PAGES - 1 && dx < 0)
      showPage(page, edge ? dx / 3 : dx)
    }
  }
  const end = () => {
    if (!active) return
    active = false
    const s = document.getElementById('strip'); if (s) s.className = 'strip'
    if (horiz) {
      swipedAt = Date.now()
      if (dx < -60 && page < PAGES - 1) goPage(page + 1)
      else if (dx > 60 && page > 0) goPage(page - 1)
      else showPage(page)
    }
  }
  const opts = { passive: false } as AddEventListenerOptions
  document.addEventListener('touchstart', (e) => { if (!stack.length && grid().contains(e.target as Node) && e.touches.length === 1) start(e.touches[0].clientX, e.touches[0].clientY) }, opts)
  document.addEventListener('touchmove', (e) => { if (e.touches.length) move(e.touches[0].clientX, e.touches[0].clientY, e) }, opts)
  document.addEventListener('touchend', end, opts)
  document.addEventListener('touchcancel', end, opts)
  // mouse drag too (handy when testing on a computer)
  document.addEventListener('mousedown', (e) => { if (!stack.length && grid().contains(e.target as Node)) start(e.clientX, e.clientY) })
  document.addEventListener('mousemove', (e) => move(e.clientX, e.clientY, e))
  document.addEventListener('mouseup', end)
})()

// The Car Thing has no clock battery: after losing power it boots thinking it's 2015 until the Mac sets it.
const clockUnset = () => new Date().getUTCFullYear() < 2024

function paintClock() {
  if (clockUnset()) {
    $('time').innerHTML = '--:--'
    $('date').textContent = 'Plug into your Mac to set the time'
    return
  }
  const d = wallClock()
  let h = d.getUTCHours()
  let ampm = ''
  if (!homeOpts().clock24) { ampm = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12 }
  $('time').innerHTML = `${homeOpts().clock24 ? pad2(h) : h}:${pad2(d.getUTCMinutes())}<span class="ampm">${ampm}</span>`
  $('date').textContent = `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

// ---------------------------------------------------------------- calendar (pushed from the Mac by mac/calendar/)
interface CalEvent { title: string; start: number; end: number; allDay: boolean; date?: string; endDate?: string; location?: string }
interface CalData { ok: boolean; updated?: number; events?: CalEvent[] }
let calData: CalData | null = null

function pollCalendar() {
  try {
    const x = new XMLHttpRequest()
    x.open('GET', 'http://127.0.0.1:8737/api/calendar', true)
    x.timeout = 5000
    x.onload = () => { try { calData = JSON.parse(x.responseText) } catch (e) { calData = null } paintWidget() }
    x.onerror = x.ontimeout = () => { /* keep whatever we had */ }
    x.send()
  } catch (e) { /* */ }
}

const ymd = (d: Date) => d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate())
function fmtTime(ms: number) {
  const d = wallAt(ms)
  let h = d.getUTCHours()
  const m = pad2(d.getUTCMinutes())
  if (homeOpts().clock24) return pad2(h) + ':' + m
  const ap = h < 12 ? 'AM' : 'PM'
  h = h % 12 || 12
  return h + ':' + m + ' ' + ap
}
function escH(s: string) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

// true if the event touches the given wall-clock day (YYYY-MM-DD)
function onDay(e: CalEvent, day: string) {
  if (e.allDay) return (e.date || '') <= day && day <= (e.endDate || e.date || '')
  const s = ymd(wallAt(e.start)), en = ymd(wallAt(Math.max(e.start, e.end - 1)))
  return s <= day && day <= en
}

function paintAgenda(): boolean {
  if (!calData || !calData.ok || !calData.events) return false
  if (clockUnset()) { $('trail').innerHTML = `<div class="wlabel">Calendar</div><div class="wsmall">Waiting for the time…</div>`; return true }
  const now = Date.now()
  const today = ymd(wallAt(now))
  const tomorrow = ymd(wallAt(now + 86400000))
  const live = calData.events.filter((e) => e.end > now)
  let label = 'Today'
  let list = live.filter((e) => onDay(e, today))
  if (!list.filter((e) => !e.allDay).length) {
    const tmr = live.filter((e) => onDay(e, tomorrow) && !onDay(e, today))
    if (tmr.length) { label = list.length ? 'Today · then tomorrow' : 'Tomorrow'; list = list.concat(tmr) }
  }
  if (!list.length && live.length) {
    const d = wallAt(live[0].allDay ? live[0].start : live[0].start)
    label = DAYS[d.getUTCDay()]
    list = live.filter((e) => onDay(e, ymd(d)))
  }
  // timed events first by start, all-day ones after (they're less urgent)
  list = list.filter((e) => !e.allDay).concat(list.filter((e) => e.allDay)).slice(0, 3)
  let html = `<div class="wlabel">${escH(label)}</div>`
  if (!list.length) html += `<div class="wsmall">Nothing on your calendar this week.</div>`
  list.forEach((e) => {
    const ongoing = !e.allDay && e.start <= now && now < e.end
    const when = e.allDay ? 'All day' : ongoing ? 'Now · until ' + fmtTime(e.end) : fmtTime(e.start)
    const day = !e.allDay && ymd(wallAt(e.start)) !== today && label.indexOf('then') > 0 ? 'Tomorrow ' : ''
    html += `<div class="cev${ongoing ? ' now' : ''}"><div class="cwhen">${escH(day + when)}</div><div class="ctitle">${escH(e.title)}</div></div>`
  })
  const age = calData.updated ? now - calData.updated : 0
  if (age > 30 * 60000) {
    const hrs = Math.round(age / 3600000)
    html += `<div class="cstale">Updated ${hrs < 1 ? Math.round(age / 60000) + ' min' : hrs < 48 ? hrs + ' hr' : Math.round(hrs / 24) + ' days'} ago · plug into your Mac to refresh</div>`
  }
  $('trail').innerHTML = html
  return true
}

function paintWidget() {
  if (!paintAgenda()) paintTrail()
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

// ---------------------------------------------------------------- opening things
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
  stack = []
  if (a.id === 'music') { openMusic(() => paintClock()); return }
  if (a.id === 'phone') { openPhone(() => paintClock()); return }
  if (a.id === 'radio') { openRadio(() => paintClock()); return }
  if (a.id === 'settings') pushPanel({ kind: 'settings', focus: 0, title: 'Settings' })
  else pushPanel({ kind: 'app', app: a, focus: 0, title: a.name })
}

function pushPanel(p: Panel) {
  stack.push(p)
  if (p.kind === 'bluetooth' || p.kind === 'device') pollBt()
  buildPanel()
  $('panel').className = 'panel open'
}

function popPanel() {
  stack.pop()
  if (!stack.length) { $('panel').className = 'panel'; paintClock(); return }
  buildPanel()
}

// ---------------------------------------------------------------- rows
interface Row { label: string; value?: string; act?: () => void; header?: boolean; note?: boolean; cls?: string }

function settingsRows(): Row[] {
  return [
    { label: 'Bluetooth', value: btSummary() + '  ›', act: () => pushPanel({ kind: 'bluetooth', focus: 0, title: 'Bluetooth' }) },
    { label: 'Dial direction', value: reverseDial() ? 'Reversed' : 'Normal', act: () => setReverseDial(!reverseDial()) },
    { label: 'Clock', value: homeOpts().clock24 ? '24-hour' : '12-hour', act: () => { const o = homeOpts(); o.clock24 = !o.clock24; set('home_opts', o) } },
    { label: 'Time zone', value: zoneOf(homeOpts().tz).label, act: () => { const o = homeOpts(); const i = ZONES.map((z) => z.id).indexOf(o.tz); o.tz = ZONES[(i + 1) % ZONES.length].id; set('home_opts', o) } },
    { label: 'Button test', value: lastKey ? 'Last: ' + lastKey : 'Press any button' },
    { label: 'Reload screen', act: () => location.reload() },
    { label: 'About', value: 'Home 0.7 · Westward 1.0' },
  ]
}

function btSummary() {
  if (!bt) return btSeen ? 'Unavailable' : 'Off'
  if (!bt.controller) return 'Not ready'
  const c = bt.paired.filter((d) => d.connected)[0]
  if (c) return c.name
  return bt.paired.length ? `${bt.paired.length} paired` : 'On'
}

function bluetoothRows(): Row[] {
  if (!bt) {
    return [{ label: btSeen ? 'Lost contact with the Bluetooth helper.' : 'The Bluetooth helper isn\'t running.', note: true },
      { label: 'Run install-bluetooth.sh from your Mac to set it up.', note: true }]
  }
  if (!bt.controller) {
    return [{ label: 'The Bluetooth chip isn\'t awake yet.', note: true },
      { label: 'Give it a few seconds after starting up, or restart the Car Thing.', note: true }]
  }
  const rows: Row[] = []
  if (bt.paired.length) {
    rows.push({ label: 'My devices', header: true })
    bt.paired.forEach((d) => rows.push({
      label: d.name, value: (d.connected ? 'Connected' : 'Not connected') + '  ›',
      act: () => pushPanel({ kind: 'device', mac: d.mac, focus: 0, title: d.name }),
    }))
  }
  rows.push({
    label: bt.scanning ? 'Stop searching' : 'Search for devices', value: bt.scanning ? 'Searching…' : '', cls: 'action',
    act: () => btDo('scan?on=' + (bt && bt.scanning ? '0' : '1')),
  })
  if (bt.scanning || bt.found.length) {
    rows.push({ label: 'Nearby', header: true })
    if (!bt.found.length) rows.push({ label: 'Looking… On your iPhone, open Settings › Bluetooth so it can be found.', note: true })
    bt.found.forEach((d) => {
      const pairing = bt!.busy && bt!.busy.action === 'pair' && bt!.busy.mac === d.mac
      rows.push({ label: d.name, value: pairing ? 'Pairing…' : 'Pair', act: () => btDo('pair?mac=' + d.mac) })
    })
  }
  return rows
}

function deviceRows(p: Panel): Row[] {
  const d = bt && bt.paired.filter((x) => x.mac === p.mac)[0]
  if (!d) return [{ label: 'This device is no longer paired.', note: true }]
  const busy = bt!.busy && bt!.busy.mac === d.mac
  return [
    { label: d.connected ? 'Disconnect' : 'Connect', value: busy ? 'Working…' : '', act: () => btDo((d.connected ? 'disconnect' : 'connect') + '?mac=' + d.mac) },
    { label: 'Forget this device', cls: 'danger', act: () => { btDo('forget?mac=' + d.mac); popPanel() } },
    { label: 'Address', value: d.mac },
  ]
}

function rowsFor(p: Panel): Row[] {
  if (p.kind === 'settings') return settingsRows()
  if (p.kind === 'bluetooth') return bluetoothRows()
  if (p.kind === 'device') return deviceRows(p)
  return []
}
const focusable = (r: Row) => !r.header && !r.note && !!r.act

function clampFocus(p: Panel, rows: Row[]) {
  const idx = rows.map((r, i) => (focusable(r) ? i : -1)).filter((i) => i >= 0)
  if (!idx.length) { p.focus = -1; return }
  if (idx.indexOf(p.focus) < 0) p.focus = idx[0]
}

function moveFocus(p: Panel, dir: number) {
  const rows = rowsFor(p)
  const idx = rows.map((r, i) => (focusable(r) ? i : -1)).filter((i) => i >= 0)
  if (!idx.length) return
  const k = idx.indexOf(p.focus)
  p.focus = idx[(k + dir + idx.length) % idx.length]
  buildPanel()
}

// ---------------------------------------------------------------- panel rendering
function buildPanel() {
  const p = top()
  if (!p) return
  const backLabel = stack.length > 1 ? stack[stack.length - 2].title : 'Home'
  const head = `<div class="phead"><div class="pback" id="pback">‹ ${esc(backLabel)}</div><div class="pname">${esc(p.title)}</div><div class="pspacer"></div></div>`
  if (p.kind === 'app' && p.app) {
    const a = p.app
    $('panel').innerHTML = head +
      `<div class="pbody">${icon(a, 128)}<div class="ptext"><div class="pstatus">${a.status || ''}</div><p>${a.blurb || ''}</p></div></div>` +
      `<div class="phint">Press Back to return home</div>`
  } else {
    const rows = rowsFor(p)
    clampFocus(p, rows)
    let sub = ''
    if (p.kind === 'bluetooth' && bt && bt.controller) sub = `<div class="psub">Bluetooth is on · this Car Thing shows up as “${esc(bt.name)}”</div>`
    const msg = (p.kind === 'bluetooth' || p.kind === 'device') && bt && bt.message ? `<div class="ptoast">${esc(bt.message)}</div>` : ''
    const hint = p.kind === 'settings' ? 'Turn the dial to choose · press to change · Back to go home'
      : 'Turn the dial to choose · press to select · Back to go back'
    $('panel').innerHTML = head + sub + `<div class="rows${sub ? ' withsub' : ''}" id="rows">` + rows.map((r, i) => {
      if (r.header) return `<div class="rhead">${esc(r.label)}</div>`
      if (r.note) return `<div class="rnote">${esc(r.label)}</div>`
      return `<div class="row${i === p.focus ? ' focus' : ''}${r.cls ? ' ' + r.cls : ''}" data-i="${i}"><span class="rlabel">${esc(r.label)}</span><span class="rval">${esc(r.value || '')}</span></div>`
    }).join('') + `</div>` + (msg || `<div class="phint">${hint}</div>`)
    const els = $('panel').querySelectorAll('.row')
    for (let i = 0; i < els.length; i++) {
      els[i].addEventListener('click', function (this: HTMLElement) { p.focus = +(this.getAttribute('data-i') || 0); activateRow() })
    }
    // keep the focused row in view
    const box = document.getElementById('rows')
    const f = box && (box.querySelector('.row.focus') as HTMLElement | null)
    if (box && f) {
      if (f.offsetTop + f.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = f.offsetTop + f.offsetHeight - box.clientHeight
      if (f.offsetTop < box.scrollTop) box.scrollTop = Math.max(0, f.offsetTop - 34)
    }
  }
  $('pback').addEventListener('click', popPanel)
}

function activateRow() {
  const p = top()
  if (!p) return
  const r = rowsFor(p)[p.focus]
  if (r && r.act) { r.act(); if (top() === p) buildPanel() }
}

function esc(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------- bluetooth polling + pairing prompt
function btDo(path: string) {
  btApi(path, () => setTimeout(pollBt, 300))
  setTimeout(pollBt, 1200)
}

function pollBt() {
  btApi('status', (r) => {
    if (r && r.ok) { bt = r; btSeen = true } else bt = null
    const j = JSON.stringify(bt)
    const changed = j !== btLastJson
    btLastJson = j
    const np = bt ? bt.prompt : null
    if (JSON.stringify(np) !== JSON.stringify(prompt)) { prompt = np; paintPrompt() }
    const p = top()
    if (changed && p && p.kind !== 'app') buildPanel()
  })
}

function paintPrompt() {
  const el = $('prompt')
  if (!prompt) { el.className = 'prompt'; return }
  const who = esc(prompt.name || 'a device')
  let body = ''
  if (prompt.kind === 'confirm') {
    body = `<div class="qtitle">Pair with ${who}?</div><div class="qcode">${esc(spaced(prompt.passkey || ''))}</div>` +
      `<div class="qtext">Check that your phone shows the same code, then accept on both.</div>` +
      `<div class="qkeys"><span>Back · Cancel</span><span class="qyes">Press dial · Pair</span></div>`
  } else if (prompt.kind === 'authorize') {
    body = `<div class="qtitle">${who} wants to pair</div><div class="qtext">Allow it to pair with this Car Thing?</div>` +
      `<div class="qkeys"><span>Back · Don't allow</span><span class="qyes">Press dial · Allow</span></div>`
  } else if (prompt.kind === 'display') {
    body = `<div class="qtitle">Enter this code on ${who}</div><div class="qcode">${esc(spaced(prompt.passkey || ''))}</div>` +
      `<div class="qkeys"><span></span><span class="qyes">Press dial · OK</span></div>`
  } else {
    body = `<div class="qtitle">Pairing with ${who}</div><div class="qtext">If your device asks for a PIN, enter 0000.</div>` +
      `<div class="qkeys"><span></span><span class="qyes">Press dial · OK</span></div>`
  }
  el.innerHTML = `<div class="qcard">${body}</div>`
  el.className = 'prompt open'
}
const spaced = (s: string) => (s.length === 6 ? s.slice(0, 3) + ' ' + s.slice(3) : s)

function answerPrompt(yes: boolean) {
  const k = prompt && prompt.kind
  prompt = null
  paintPrompt()
  if (k === 'pin') return
  btDo('answer?yes=' + (yes ? '1' : '0'))
}

let tick = 0
setInterval(() => {
  tick++
  const p = top()
  const active = !!p && (p.kind === 'bluetooth' || p.kind === 'device' || p.kind === 'settings')
  // fast while a Bluetooth page or a prompt is open, slow otherwise (just to catch incoming pairing requests)
  if (active || prompt || tick % 4 === 0) pollBt()
}, 1500)

// ---------------------------------------------------------------- input
function input(e: Inp) {
  if (leaving) return
  if (prompt) {
    if (e === 'select') answerPrompt(true)
    else if (e === 'back') answerPrompt(false)
    return
  }
  if (musicOpen()) { musicInput(e); return }
  if (phoneOpen()) { phoneInput(e); return }
  if (radioOpen()) { radioInput(e); return }
  const p = top()
  if (!p) {
    if (e === 'left' || e === 'right') { focus = (focus + (e === 'right' ? 1 : -1) + APPS.length) % APPS.length; paintFocus() }
    else if (e === 'select') openApp(APPS[focus])
    else if (e === 'b1' || e === 'b2' || e === 'b3' || e === 'b4') {
      const id = PRESETS[+e.slice(1) - 1]
      const i = APPS.map((a) => a.id).indexOf(id)
      if (i >= 0) { focus = i; paintFocus(); openApp(APPS[i]) }
    }
    return
  }
  if (e === 'back') { popPanel(); return }
  if (p.kind === 'app') return
  if (e === 'left' || e === 'right') moveFocus(p, e === 'right' ? 1 : -1)
  else if (e === 'select') activateRow()
}

const KEYMAP: { [k: string]: Inp } = {
  Digit1: 'b1', Digit2: 'b2', Digit3: 'b3', Digit4: 'b4', Numpad1: 'b1', Numpad2: 'b2', Numpad3: 'b3', Numpad4: 'b4',
  Enter: 'select', NumpadEnter: 'select', Space: 'select',
  Escape: 'back', Backspace: 'back',
  ArrowLeft: 'left', ArrowUp: 'left', ArrowRight: 'right', ArrowDown: 'right',
}
const KEY_FALLBACK: { [k: string]: Inp } = { '1': 'b1', '2': 'b2', '3': 'b3', '4': 'b4', Enter: 'select', Escape: 'back' }

window.addEventListener('keydown', (e) => {
  const tp = top()
  if (tp && tp.kind === 'settings') setTimeout(buildPanel, 0)
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
setInterval(() => { if (!stack.length && !musicOpen() && !phoneOpen() && !radioOpen()) paintClock() }, 1000)
pollCalendar()
setInterval(pollCalendar, 60000)
setInterval(() => { if (!stack.length) paintWidget() }, 20000)
pollBt()

// test hook
;(window as unknown as { __home: unknown }).__home = { input, state: () => { const p = top(); return { page, focus, view: musicOpen() ? 'music' : phoneOpen() ? 'phone' : radioOpen() ? 'radio' : p ? 'panel' : 'home', panel: p && p.kind, depth: stack.length, rowFocus: p && p.focus, prompt: !!prompt } } }
