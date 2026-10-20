// Phone: a "stream deck" of favourite contacts. Pick one and the Car Thing tells the paired iPhone to dial
// (hands-free profile, via bthelper). First press asks to confirm, second press calls.
// Dial = move, press = confirm/call, 1-4 = jump straight to favourite 1-4, Back = cancel / home.

type Inp = 'left' | 'right' | 'select' | 'back' | 'b1' | 'b2' | 'b3' | 'b4'

const BTH = 'http://127.0.0.1:8737/api/'

function getJSON(url: string, cb: (r: { [k: string]: unknown } | null) => void, timeout = 5000) {
  try {
    const x = new XMLHttpRequest()
    x.open('GET', url, true)
    x.timeout = timeout
    x.onload = () => { let r = null; try { r = JSON.parse(x.responseText) } catch (e) { /* */ } cb(r) }
    x.onerror = x.ontimeout = () => cb(null)
    x.send()
  } catch (e) { cb(null) }
}

const $ = (id: string) => document.getElementById(id) as HTMLElement
const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const COLORS = [['#5b8cff', '#2d4fd1'], ['#ff7a95', '#d1325f'], ['#4dd4ac', '#11806a'], ['#f6a04d', '#c0562b'], ['#a07bff', '#5a32c8'], ['#5fd06e', '#2c9a43'], ['#ffd25a', '#c79a12'], ['#7ad1ff', '#2a86c4']]
function initials(name: string) {
  const p = name.trim().split(/\s+/)
  return ((p[0] || '')[0] || '').toUpperCase() + ((p.length > 1 ? p[p.length - 1][0] : '') || '').toUpperCase()
}
const first = (name: string) => name.trim().split(/\s+/)[0].replace(/[,.;:!]+$/, '')

let open = false
let favs: { name: string }[] = []
let loaded = false
let focus = 0
let confirming = -1
let status: { state: string; name: string; message: string } | null = null
let statusTimer = 0
let pollTimer = 0
let onClose: () => void = () => {}

export function phoneOpen() { return open }

export function openPhone(closeCb: () => void) {
  onClose = closeCb
  open = true
  confirming = -1
  status = null
  $('phone').className = 'phone open'
  paint()
  getJSON(BTH + 'favorites', (r) => {
    loaded = true
    favs = r && r.ok ? (r.favorites as { name: string }[]) : []
    if (!r) favs = []
    focus = Math.min(focus, Math.max(0, favs.length - 1))
    paint(r === null)
  })
}

export function closePhone() {
  open = false
  window.clearInterval(pollTimer)
  window.clearTimeout(statusTimer)
  $('phone').className = 'phone'
  onClose()
}

function paint(helperDown = false) {
  if (!open) return
  const presets = [0, 1, 2, 3].map((i) => `<div><span class="pnum">${i + 1}</span>${favs[i] ? esc(first(favs[i].name)) : ''}</div>`).join('')
  let body = ''
  if (!loaded) body = `<div class="fempty">Loading…</div>`
  else if (helperDown) body = `<div class="fempty"><b>Bluetooth isn't running</b>Restart the Car Thing, or run install-bluetooth.sh from your Mac.</div>`
  else if (!favs.length) body = `<div class="fempty"><b>No favourites yet</b>Add names and numbers to favorites.json on your Mac, then run update.sh.</div>`
  else {
    const cols = favs.length <= 4 ? 2 : 4
    body = `<div class="fgrid c${cols}">` + favs.map((f, i) => {
      const c = COLORS[i % COLORS.length]
      const conf = i === confirming
      return `<div class="fcard${i === focus ? ' focus' : ''}${conf ? ' confirm' : ''}" data-i="${i}">` +
        `<div class="favatar" style="background:linear-gradient(150deg,${c[0]},${c[1]})">${esc(initials(f.name))}</div>` +
        `<div class="ftext"><div class="fname">${esc(f.name)}</div>` +
        `<div class="fsub">${conf ? 'Press again to call' : (i < 4 ? 'Button ' + (i + 1) : '')}</div></div></div>`
    }).join('') + `</div>`
  }
  let overlay = ''
  if (status) {
    const s = status.state
    const ok = s === 'calling'
    const err = s === 'error'
    overlay = `<div class="fstatus${ok ? ' ok' : err ? ' err' : ''}"><div class="fsicon">${ok ? '✓' : err ? '!' : '…'}</div>` +
      `<div class="fstitle">${err ? 'Call didn\'t go through' : ok ? 'Calling ' + esc(status.name) : 'Calling ' + esc(status.name) + '…'}</div>` +
      `<div class="fstext">${esc(ok ? 'The call is on your iPhone.' : status.message || 'Asking your iPhone to dial')}</div></div>`
  }
  const hint = confirming >= 0 ? 'Press the dial to call · Back to cancel' : 'Turn to choose · press to call · Back for home'
  $('phone').innerHTML = `<div class="mpresets">${presets}</div><div class="ftitle">Favorites</div>${body}<div class="phint">${hint}</div>${overlay}`
  const cards = document.querySelectorAll('#phone .fcard')
  for (let i = 0; i < cards.length; i++) {
    cards[i].addEventListener('click', function (this: HTMLElement) { const k = +(this.getAttribute('data-i') || 0); focus = k; press(k) })
  }
}

function press(i: number) {
  if (status && (status.state === 'connecting' || status.state === 'dialing')) return
  if (confirming === i) { call(i); return }
  confirming = i
  focus = i
  status = null
  paint()
}

function call(i: number) {
  confirming = -1
  status = { state: 'connecting', name: first(favs[i].name), message: '' }
  paint()
  getJSON(BTH + 'call?i=' + i, (r) => {
    if (!r || !r.ok) { showStatus({ state: 'error', name: first(favs[i].name), message: r && r.error === 'busy' ? 'Another call is still being placed.' : 'Couldn\'t reach Bluetooth.' }); return }
    window.clearInterval(pollTimer)
    const started = Date.now()
    pollTimer = window.setInterval(() => {
      getJSON(BTH + 'callstatus', (s) => {
        if (!s) return
        const st = String(s.state)
        if (st === 'calling' || st === 'error' || Date.now() - started > 25000) {
          window.clearInterval(pollTimer)
          showStatus({ state: st === 'calling' || st === 'error' ? st : 'error', name: first(favs[i].name), message: String(s.message || 'Your iPhone didn\'t respond.') })
        } else if (status) { status.state = st; paint() }
      })
    }, 500)
  })
}

function showStatus(s: { state: string; name: string; message: string }) {
  status = s
  paint()
  window.clearTimeout(statusTimer)
  statusTimer = window.setTimeout(() => { status = null; paint() }, s.state === 'error' ? 5000 : 3500)
}

export function input(e: Inp) {
  if (e === 'back') {
    if (status && status.state !== 'connecting' && status.state !== 'dialing') { status = null; paint(); return }
    if (confirming >= 0) { confirming = -1; paint(); return }
    closePhone()
    return
  }
  if (!favs.length) return
  if (e === 'left' || e === 'right') {
    focus = (focus + (e === 'right' ? 1 : -1) + favs.length) % favs.length
    if (confirming >= 0) confirming = -1
    paint()
  } else if (e === 'select') press(focus)
  else {
    const k = +e.slice(1) - 1
    if (k < favs.length) press(k)
  }
}
