// Music: now playing from the paired iPhone over Bluetooth (AVRCP), via bthelper at 127.0.0.1:8737.
// Works with whatever app is playing on the phone. No cover art or scrubbing (the phone doesn't send them).
// Controls: press dial = play/pause, 1 = previous, 2 = shuffle, 3 = repeat, 4 = next, Back = home.

type Inp = 'left' | 'right' | 'select' | 'back' | 'b1' | 'b2' | 'b3' | 'b4'

const BTH = 'http://127.0.0.1:8737/api/'
const HOLD_MS = 8000 // keep the last song up through the short gap after skipping

interface Now {
  playing: boolean
  title: string
  artist: string
  album: string
  duration: number
  position: number
  at: number // local time when position was measured
  shuffle: boolean
  repeat: string
  phone: string
  track: number
  tracks: number
}

interface Raw { [k: string]: unknown }

function getJSON(url: string, cb: (r: Raw | null) => void, timeout = 4000) {
  try {
    const x = new XMLHttpRequest()
    x.open('GET', url, true)
    x.timeout = timeout
    x.onload = () => { let r: Raw | null = null; try { r = JSON.parse(x.responseText) } catch (e) { /* */ } cb(r) }
    x.onerror = x.ontimeout = () => cb(null)
    x.send()
  } catch (e) { cb(null) }
}

const $ = (id: string) => document.getElementById(id) as HTMLElement
const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const r = s % 60
  return Math.floor(s / 60) + ':' + (r < 10 ? '0' : '') + r
}

const ICON = {
  prev: '<svg viewBox="0 0 24 24" width="34" height="34"><path fill="#fff" d="M6 5h2.4v14H6zM20 5v14L9.5 12z"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="34" height="34"><path fill="#fff" d="M15.6 5H18v14h-2.4zM4 5l10.5 7L4 19z"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="40" height="40"><path fill="#111" d="M7 4.5v15L19.5 12z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="40" height="40"><path fill="#111" d="M6 4.5h4.2v15H6zm7.8 0H18v15h-4.2z"/></svg>',
  note: '<svg viewBox="0 0 24 24" width="110" height="110"><g fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></g></svg>',
}

// A colour per album, so the artwork square still changes from album to album.
const PALETTE = [['#ff7a95', '#6b2fd1'], ['#f6a04d', '#c0392b'], ['#4dd4ac', '#1b6ca8'], ['#8f7bff', '#2c2a7a'], ['#f7d154', '#e0662f'], ['#5fd06e', '#1d6b4a'], ['#ff8ad8', '#7a2bb5']]
function albumColors(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

// ---------------------------------------------------------------- state
let open = false
let now: Now | null = null
let last: Raw | null = null
let lastSeen = 0
let pending = 0 // ignore polls briefly after a command so the UI doesn't flicker back
let toastTimer = 0
let pollTimer = 0
let tickTimer = 0
let onClose: () => void = () => {}

export function musicOpen() { return open }

export function openMusic(closeCb: () => void) {
  onClose = closeCb
  open = true
  build()
  $('music').className = 'music open'
  poll()
  pollTimer = window.setInterval(poll, 1000)
  tickTimer = window.setInterval(paintProgress, 250)
}

export function closeMusic() {
  open = false
  $('music').className = 'music'
  window.clearInterval(pollTimer)
  window.clearInterval(tickTimer)
  onClose()
}

function build() {
  $('music').innerHTML =
    `<div class="mbg" id="mbg"></div><div class="mshade"></div>` +
    `<div class="mpresets"><div><span class="pnum">1</span>Previous</div><div><span class="pnum">2</span>Shuffle</div><div><span class="pnum">3</span>Repeat</div><div><span class="pnum">4</span>Next</div></div>` +
    `<div class="mart" id="mart">${ICON.note}</div>` +
    `<div class="minfo">` +
    `<div class="msrc" id="msrc"></div><div class="mtitle" id="mtitle"></div><div class="martist" id="martist"></div><div class="malbum" id="malbum"></div>` +
    `<div class="mbar" id="mbar"><div class="mfill" id="mfill"></div><div class="mknob" id="mknob"></div></div>` +
    `<div class="mtimes"><span id="mpos">0:00</span><span id="mdur">0:00</span></div>` +
    `<div class="mctl"><div class="mbtn" id="mprev">${ICON.prev}</div><div class="mbtn mplay" id="mplay">${ICON.play}</div><div class="mbtn" id="mnext">${ICON.next}</div>` +
    `<div class="mflags"><span id="mshuf">Shuffle</span><span id="mrep">Repeat</span></div></div>` +
    `</div>` +
    `<div class="mempty" id="mempty"></div><div class="mtoast" id="mtoast"></div>`
  $('mprev').addEventListener('click', () => input('b1'))
  $('mnext').addEventListener('click', () => input('b4'))
  $('mplay').addEventListener('click', () => input('select'))
  $('mshuf').addEventListener('click', () => input('b2'))
  $('mrep').addEventListener('click', () => input('b3'))
  paint()
}

// ---------------------------------------------------------------- polling
function poll() {
  getJSON(BTH + 'media', (r) => {
    last = r
    if (Date.now() < pending) return
    if (!r || !r.ok || !r.active) {
      // Between songs the phone briefly reports nothing: keep the last song up instead of flashing "Nothing playing".
      if (now && Date.now() - lastSeen < HOLD_MS) return
      now = null
      paint()
      return
    }
    lastSeen = Date.now()
    now = {
      playing: !!r.playing,
      title: String(r.title || ''),
      artist: String(r.artist || ''),
      album: String(r.album || ''),
      duration: Number(r.duration) || 0,
      position: Number(r.position) || 0,
      at: Date.now(),
      shuffle: !!r.shuffle,
      repeat: String(r.repeat || 'off'),
      phone: String(r.phone || 'iPhone'),
      track: Number(r.track) || 0,
      tracks: Number(r.tracks) || 0,
    }
    paint()
  })
}

// ---------------------------------------------------------------- painting
function emptyMessage() {
  if (!last) return ['Bluetooth isn\'t running', 'Restart the Car Thing, or run install-bluetooth.sh from your Mac.']
  if (last.connected && !last.player) return ['Connecting to ' + esc(String(last.phone || 'your iPhone')) + '…', 'Start something playing on your phone.']
  if (last.connected) return ['Nothing playing', 'Start a song on your iPhone and it will show up here.']
  return ['No phone connected', 'Connect your iPhone in Settings › Bluetooth.']
}

function paint() {
  if (!open) return
  const has = !!now
  $('mempty').style.display = has ? 'none' : 'block'
  $('mart').style.visibility = has ? '' : 'hidden'
  ;(document.querySelector('#music .minfo') as HTMLElement).style.visibility = has ? '' : 'hidden'
  if (!now) {
    const m = emptyMessage()
    $('mempty').innerHTML = `${ICON.note}<div class="metitle">${m[0]}</div><div class="metext">${m[1]}</div>`
    $('mbg').style.background = ''
    return
  }
  const n = now
  $('msrc').textContent = n.phone + (n.tracks ? ` · Track ${n.track} of ${n.tracks}` : '')
  $('mtitle').textContent = n.title || 'Unknown title'
  $('martist').textContent = n.artist
  $('malbum').textContent = n.album
  $('mplay').innerHTML = n.playing ? ICON.pause : ICON.play
  $('mshuf').className = n.shuffle ? 'on' : ''
  $('mrep').className = n.repeat !== 'off' ? 'on' : ''
  $('mrep').textContent = n.repeat === 'singletrack' ? 'Repeat one' : 'Repeat'
  const c = albumColors(n.album || n.artist || n.title)
  $('mart').style.background = `linear-gradient(150deg, ${c[0]}, ${c[1]})`
  $('mbg').style.background = `radial-gradient(circle at 25% 40%, ${c[0]}, ${c[1]} 55%, transparent 80%)`
  paintProgress()
}

function livePos() {
  if (!now) return 0
  const p = now.position + (now.playing ? Date.now() - now.at : 0)
  return now.duration ? Math.min(p, now.duration) : p
}

function paintProgress() {
  if (!open || !now) return
  const p = livePos()
  const f = now.duration ? Math.max(0, Math.min(1, p / now.duration)) : 0
  $('mfill').style.width = (f * 100).toFixed(2) + '%'
  $('mknob').style.left = (f * 100).toFixed(2) + '%'
  $('mpos').textContent = fmt(p)
  $('mdur').textContent = now.duration ? '-' + fmt(now.duration - p) : ''
}

function toast(msg: string) {
  const t = $('mtoast')
  t.textContent = msg
  t.className = 'mtoast show'
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { t.className = 'mtoast' }, 2600)
}

// ---------------------------------------------------------------- commands
function send(c: string) {
  pending = Date.now() + 1200
  getJSON(BTH + 'media/cmd?c=' + c, (r) => {
    pending = 0
    if (!r || !r.ok) toast('Your phone didn\'t accept that.')
    window.setTimeout(poll, 350)
  }, 6000)
}

export function input(e: Inp) {
  if (e === 'back') { closeMusic(); return }
  if (!now) return
  if (e === 'select') {
    now.position = livePos(); now.at = Date.now(); now.playing = !now.playing; paint()
    send(now.playing ? 'play' : 'pause')
  } else if (e === 'b1') send('prev')
  else if (e === 'b4') send('next')
  else if (e === 'b2') { now.shuffle = !now.shuffle; paint(); send('shuffle') }
  else if (e === 'b3') send('repeat')
}
