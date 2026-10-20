// Radio: a scrollable view of the UV-5R Fargo guide (data in radiodata.ts, generated from the workbook).
// Presets 1-4 switch tabs, dial scrolls, press opens/closes a row's details, Back closes details / goes home.
import { RADIO } from './radiodata'

type Inp = 'left' | 'right' | 'select' | 'back' | 'b1' | 'b2' | 'b3' | 'b4'

interface Row { key: string; html: string; detail: string; cls: string; header?: boolean }

const $ = (id: string) => document.getElementById(id) as HTMLElement
const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const kv = (k: string, v: string) => (v ? `<div class="rkv"><span>${esc(k)}</span><b>${esc(v)}</b></div>` : '')

const TABS = ['Channels', 'FRS/GMRS', 'Menu', 'Info']

function channelRows(): Row[] {
  const out: Row[] = []
  let lastType = ''
  for (const c of RADIO.channels) {
    if (c.type !== lastType) { out.push({ key: 'h' + c.type, html: esc(c.type), detail: '', cls: '', header: true }); lastType = c.type }
    out.push({
      key: 'c' + c.ch,
      cls: c.cls === 'ham' ? 'ham' : 'rx',
      html: `<span class="rch">${c.ch}</span><span class="rname">${esc(c.name)}</span><span class="rfreq">${esc(c.freq)}</span>` +
        `<span class="rtag">${c.cls === 'ham' ? 'Ham license to TX' : 'Listen only'}</span>`,
      detail: kv('Location', c.where) + kv('Offset', c.offset) + kv('Tone to transmit', c.tone) + kv('Width (Menu 5)', c.width) +
        kv('Can you transmit?', c.tx) + (c.notes ? `<p>${esc(c.notes)}</p>` : '') + (c.source ? `<div class="rsrc">Source: ${esc(c.source)}</div>` : ''),
    })
  }
  RADIO.channelNotes.forEach((n, i) => out.push({ key: 'cn' + i, html: esc(n), detail: '', cls: 'note' }))
  return out
}

function frsRows(): Row[] {
  const out: Row[] = []
  let lastGroup = ''
  for (const f of RADIO.frs) {
    const g = f.group.split(';')[0]
    if (g !== lastGroup) { out.push({ key: 'h' + g, html: esc(g), detail: '', cls: '', header: true }); lastGroup = g }
    out.push({
      key: 'f' + f.ch,
      cls: 'rx',
      html: `<span class="rch">${f.ch}</span><span class="rname">FRS/GMRS ${f.ch}</span><span class="rfreq">${esc(f.freq)}</span><span class="rtag">Listen only</span>`,
      detail: kv('FRS power / width', f.frsPower + ' · ' + f.frsWidth) + kv('GMRS power / width', f.gmrsPower + ' · ' + f.gmrsWidth) +
        kv('GMRS repeater input', f.repeaterIn) + kv('UV-5R', f.uv5r) + (f.group.indexOf(';') > 0 ? `<p>${esc(f.group)}</p>` : ''),
    })
  }
  RADIO.frsNotes.forEach((n, i) => out.push({ key: 'fn' + i, html: esc(n), detail: '', cls: 'note' }))
  return out
}

function menuRows(): Row[] {
  const out: Row[] = RADIO.menu.map((m) => ({
    key: 'm' + m.n,
    cls: m.for === 'Listening' ? 'rx' : m.for === 'Careful' ? 'warn' : 'plain',
    html: `<span class="rch">${m.n}</span><span class="rname">${esc(m.screen)}</span><span class="rset">${esc(m.set)}</span>`,
    detail: `<p>${esc(m.what)}</p>` + kv('Suggested', m.set) + kv('Matters for', m.for),
  }))
  RADIO.menuNotes.forEach((n, i) => out.push({ key: 'mn' + i, html: esc(n), detail: '', cls: 'note' }))
  return out
}

function infoRows(): Row[] {
  const out: Row[] = []
  // most useful first: the rules and colour key, then how-to, then what's in the workbook and sources
  const order = (t: string) => (/rules/i.test(t) ? 0 : /color/i.test(t) ? 1 : /menu/i.test(t) ? 2 : /workbook/i.test(t) ? 4 : 5)
  const secs = RADIO.info.slice().sort((a, b) => order(a.title) - order(b.title))
  for (const sec of secs) {
    out.push({ key: 'h' + sec.title, html: esc(sec.title), detail: '', cls: '', header: true })
    sec.lines.forEach((l, i) => {
      const cls = /^Green/.test(l) ? 'rx' : /^Orange/.test(l) ? 'ham' : /^Grey/.test(l) ? 'none' : 'note'
      out.push({ key: sec.title + i, html: esc(l), detail: '', cls })
    })
  }
  out.push({ key: 'hdig', html: "Digital: the UV-5R can't hear these", detail: '', cls: '', header: true })
  RADIO.digital.forEach((d, i) => out.push({
    key: 'd' + i, cls: 'none',
    html: `<span class="rname">${esc(d.who)}</span><span class="rfreq">${esc(d.freq)}</span>`,
    detail: kv('Mode', d.mode) + (d.notes ? `<p>${esc(d.notes)}</p>` : ''),
  }))
  return out
}

// ---------------------------------------------------------------- state
let open = false
let tab = 0
let rows: Row[] = []
let focus = 0
let expanded = -1
const memory: { focus: number }[] = TABS.map(() => ({ focus: -1 }))
let onClose: () => void = () => {}

const selectable = (r: Row) => !r.header

export function radioOpen() { return open }

export function openRadio(closeCb: () => void) {
  onClose = closeCb
  open = true
  $('radio').className = 'radio open'
  setTab(tab)
}

export function closeRadio() {
  open = false
  $('radio').className = 'radio'
  onClose()
}

function setTab(t: number) {
  memory[tab].focus = focus
  tab = t
  rows = [channelRows, frsRows, menuRows, infoRows][t]()
  expanded = -1
  focus = memory[t].focus >= 0 ? memory[t].focus : rows.findIndex(selectable)
  build()
}

function build() {
  const tabs = TABS.map((n, i) => `<div class="${i === tab ? 'on' : ''}"><span class="pnum">${i + 1}</span>${n}</div>`).join('')
  const key = tab === 0 ? `<div class="rkey"><i class="rx"></i>Listen <i class="ham"></i>Ham license to transmit</div>`
    : tab === 2 ? `<div class="rkey"><i class="rx"></i>Matters while listening <i class="plain"></i>Transmitting / other</div>` : ''
  $('radio').innerHTML =
    `<div class="rtabs">${tabs}</div>` + key +
    `<div class="rlist" id="rlist">` + rows.map((r, i) => {
      if (r.header) return `<div class="rhead2">${r.html}</div>`
      const f = i === focus
      const x = i === expanded && r.detail
      return `<div class="rrow ${r.cls}${f ? ' focus' : ''}${x ? ' open' : ''}" data-i="${i}"><div class="rmain">${r.html}${r.detail ? `<span class="rmore">${x ? '▾' : '›'}</span>` : ''}</div>` +
        (x ? `<div class="rdetail">${r.detail}</div>` : '') + `</div>`
    }).join('') + `</div>` +
    `<div class="rhint">${RADIO.title} · turn to scroll · press for details</div>`
  const els = document.querySelectorAll('#radio .rrow')
  for (let i = 0; i < els.length; i++) {
    els[i].addEventListener('click', function (this: HTMLElement) { const k = +(this.getAttribute('data-i') || 0); focus = k; toggle() })
  }
  const tabEls = document.querySelectorAll('#radio .rtabs div')
  for (let i = 0; i < tabEls.length; i++) tabEls[i].addEventListener('click', () => setTab(i))
  keepInView()
}

function keepInView() {
  const list = document.getElementById('rlist')
  const el = list && (list.querySelector('.rrow.focus') as HTMLElement | null)
  if (!list || !el) return
  const top = el.offsetTop, bottom = top + el.offsetHeight
  // keep a little context above/below the focused row
  if (bottom > list.scrollTop + list.clientHeight - 20) list.scrollTop = bottom - list.clientHeight + 20
  if (top < list.scrollTop + 40) list.scrollTop = Math.max(0, top - 40)
}

function move(dir: number) {
  let i = focus
  do { i += dir } while (i >= 0 && i < rows.length && !selectable(rows[i]))
  if (i < 0 || i >= rows.length) return
  focus = i
  if (expanded >= 0) expanded = -1
  build()
}

function toggle() {
  if (!rows[focus] || !rows[focus].detail) return
  expanded = expanded === focus ? -1 : focus
  build()
}

export function input(e: Inp) {
  if (e === 'back') { if (expanded >= 0) { expanded = -1; build() } else closeRadio(); return }
  if (e === 'left' || e === 'right') move(e === 'right' ? 1 : -1)
  else if (e === 'select') toggle()
  else setTab(+e.slice(1) - 1)
}
