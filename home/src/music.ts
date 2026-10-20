// Music: now playing from the iPhone.
//  - Spotify (via the Mac link at 127.0.0.1:8740, reached over USB): cover art + real scrubbing
//  - Bluetooth (via bthelper at 127.0.0.1:8737): any app on the phone, art looked up through the Mac link
// Controls: dial = scrub, press = play/pause, 1 = previous, 2 = shuffle, 3 = repeat, 4 = next, Back = home.

type Inp = 'left' | 'right' | 'select' | 'back' | 'b1' | 'b2' | 'b3' | 'b4'

const LINK = 'http://127.0.0.1:8740'
const BTH = 'http://127.0.0.1:8737/api/'

interface Now {
  source: 'spotify' | 'bluetooth'
  playing: boolean
  title: string
  artist: string
  album: string
  art: string
  duration: number
  position: number
  at: number // local time when position was measured
  shuffle: boolean
  repeat: string
  device: string
}

interface Raw { ok?: boolean; active?: boolean; reason?: string; [k: string]: unknown }

function getJSON(url: string, cb: (r: Raw | null) => void, timeout = 3000) {
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
  const m = Math.floor(s / 60)
  const r = s % 60
  return m + ':' + (r < 10 ? '0' : '') + r
}

const ICON = {
  prev: '<svg viewBox="0 0 24 24" width="34" height="34"><path fill="#fff" d="M6 5h2.4v14H6zM20 5v14L9.5 12z"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="34" height="34"><path fill="#fff" d="M15.6 5H18v14h-2.4zM4 5l10.5 7L4 19z"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="40" height="40"><path fill="#111" d="M7 4.5v15L19.5 12z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="40" height="40"><path fill="#111" d="M6 4.5h4.2v15H6zm7.8 0H18v15h-4.2z"/></svg>',
  note: '<svg viewBox="0 0 24 24" width="96" height="96"><g fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></g></svg>',
}

// ---------------------------------------------------------------- state
let open = false
let now: Now | null = null
let sp: Raw | null = null // last Spotify state (null = link unreachable)
let bt: Raw | null = null // last Bluetooth state (null = helper unreachable)
let linkUp = false
let scrubbing = false
let scrubPos = 0
let scrubTimer = 0
let lastTurn = 0
let toastTimer = 0
let pending = 0 // ignore polls briefly after a command so the UI doesn't flicker back
let pollTimer = 0
let tickTimer = 0
let shownArt = ''
const artCache: { [k: string]: string } = {}
let onClose: () => void = () => {}

// ---------------------------------------------------------------- open / close
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
    `<div class="mempty" id="mempty"></div><div class="mtoast" id="mtoast"></div><div class="mback" id="mback">‹ Home</div>`
  shownArt = ''
  $('mprev').addEventListener('click', () => input('b1'))
  $('mnext').addEventListener('click', () => input('b4'))
  $('mplay').addEventListener('click', () => input('select'))
  $('mshuf').addEventListener('click', () => input('b2'))
  $('mrep').addEventListener('click', () => input('b3'))
  $('mback').addEventListener('click', () => input('back'))
  $('mbar').addEventListener('click', (e: MouseEvent) => {
    if (!now || now.source !== 'spotify' || !now.duration) return
    const r = $('mbar').getBoundingClientRect()
    seekTo(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * now.duration)
  })
  paint()
}

// ---------------------------------------------------------------- polling
function poll() {
  let done = 0
  const finish = () => { if (++done === 2) choose() }
  getJSON(LINK + '/spotify/state', (r) => { sp = r; linkUp = !!r; finish() })
  getJSON(BTH + 'media', (r) => { bt = r; finish() })
}

function choose() {
  if (Date.now() < pending) return
  const s = sp && sp.ok && sp.active ? sp : null
  const b = bt && bt.ok && bt.active ? bt : null
  let pick: Raw | null = null
  // Spotify has art + scrubbing, so prefer it unless something else is actually playing over Bluetooth
  if (s && (s.playing || !(b && b.playing))) pick = s
  else if (b) pick = b
  else if (s) pick = s
  if (!pick) { now = null; paint(); return }
  const src = pick.source === 'spotify' ? 'spotify' : 'bluetooth'
  now = {
    source: src,
    playing: !!pick.playing,
    title: String(pick.title || ''),
    artist: String(pick.artist || ''),
    album: String(pick.album || ''),
    art: src === 'spotify' && pick.art ? LINK + pick.art : lookupArt(String(pick.title || ''), String(pick.artist || ''), String(pick.album || '')),
    duration: Number(pick.duration) || 0,
    position: Number(pick.position) || 0,
    at: Date.now(),
    shuffle: !!pick.shuffle,
    repeat: String(pick.repeat || 'off'),
    device: src === 'spotify' ? String(pick.device || 'Spotify') : String((bt && bt.phone) || 'iPhone'),
  }
  paint()
}

function lookupArt(title: string, artist: string, album: string) {
  if (!title) return ''
  const k = [title, artist, album].join('|')
  if (k in artCache) return artCache[k]
  if (!linkUp) return '' // try again once the Mac link is reachable
  artCache[k] = ''
  getJSON(`${LINK}/art/lookup?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}`, (r) => {
    if (r && r.ok && r.art) { artCache[k] = LINK + r.art; if (now && now.title === title) { now.art = artCache[k]; paint() } }
  }, 8000)
  return ''
}

// ---------------------------------------------------------------- painting
function emptyMessage() {
  const btConnected = bt && bt.connected
  if (bt && bt.connected && !bt.player) return ['Connecting to ' + esc(String(bt.phone || 'your iPhone')) + '…', 'Start something playing on your phone.']
  if (btConnected || (sp && sp.ok)) return ['Nothing playing', 'Start a song on your iPhone and it will show up here.']
  if (sp && sp.reason === 'login') return ['Not connected to Spotify', 'Finish logging in on your Mac, or connect your iPhone in Settings › Bluetooth.']
  return ['No phone connected', 'Connect your iPhone in Settings › Bluetooth. For Spotify cover art and scrubbing, run install-link.sh on your Mac.']
}

function paint() {
  if (!open) return
  const has = !!now
  $('mempty').style.display = has ? 'none' : 'block'
  const vis = has ? '' : 'hidden'
  $('mart').style.visibility = vis
  ;(document.querySelector('#music .minfo') as HTMLElement).style.visibility = vis
  if (!now) {
    const m = emptyMessage()
    $('mempty').innerHTML = `${ICON.note}<div class="metitle">${m[0]}</div><div class="metext">${m[1]}</div>`
    $('mbg').style.backgroundImage = ''
    shownArt = ''
    return
  }
  const n = now
  $('msrc').textContent = (n.source === 'spotify' ? 'Spotify · ' : 'Bluetooth · ') + n.device
  $('mtitle').textContent = n.title || 'Unknown title'
  $('martist').textContent = n.artist
  $('malbum').textContent = n.album
  $('mplay').innerHTML = n.playing ? ICON.pause : ICON.play
  $('mshuf').className = n.shuffle ? 'on' : ''
  $('mrep').className = n.repeat && n.repeat !== 'off' ? 'on' : ''
  $('mrep').textContent = n.repeat === 'track' || n.repeat === 'singletrack' ? 'Repeat one' : 'Repeat'
  $('mbar').className = 'mbar' + (n.source === 'spotify' ? ' seekable' : '')
  if (n.art !== shownArt) {
    shownArt = n.art
    if (n.art) {
      const img = new Image()
      img.onload = () => {
        if (shownArt !== n.art) return
        $('mart').innerHTML = ''
        $('mart').appendChild(img)
        $('mbg').style.backgroundImage = `url("${n.art}")`
      }
      img.onerror = () => { if (shownArt === n.art) { $('mart').innerHTML = ICON.note; $('mbg').style.backgroundImage = '' } }
      img.src = n.art
    } else {
      $('mart').innerHTML = ICON.note
      $('mbg').style.backgroundImage = ''
    }
  }
  paintProgress()
}

function livePos() {
  if (!now) return 0
  const p = now.position + (now.playing ? Date.now() - now.at : 0)
  return now.duration ? Math.min(p, now.duration) : p
}

function paintProgress() {
  if (!open || !now) return
  const p = scrubbing ? scrubPos : livePos()
  const f = now.duration ? Math.max(0, Math.min(1, p / now.duration)) : 0
  $('mfill').style.width = (f * 100).toFixed(2) + '%'
  $('mknob').style.left = (f * 100).toFixed(2) + '%'
  $('mpos').textContent = fmt(p)
  $('mdur').textContent = now.duration ? '-' + fmt(now.duration - p) : ''
  $('music').className = 'music open' + (scrubbing ? ' scrubbing' : '')
}

function toast(msg: string) {
  const t = $('mtoast')
  t.textContent = msg
  t.className = 'mtoast show'
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { t.className = 'mtoast' }, 2600)
}

// ---------------------------------------------------------------- commands
function send(c: string, extra = '') {
  if (!now) return
  pending = Date.now() + 1200
  const url = now.source === 'spotify' ? `${LINK}/spotify/cmd?c=${c}${extra}` : `${BTH}media/cmd?c=${c}`
  getJSON(url, (r) => {
    pending = 0
    if (!r || !r.ok) {
      const reason = r && r.reason
      toast(reason === 'premium' ? 'Spotify needs Premium for that.' : reason === 'nodevice' ? 'Spotify isn\'t playing on any device.' : reason === 'login' ? 'Log in to Spotify again on your Mac.' : 'Your phone didn\'t accept that.')
    }
    window.setTimeout(poll, 350)
  }, 6000)
}

function seekTo(ms: number) {
  if (!now) return
  ms = Math.max(0, Math.min(now.duration || ms, ms))
  now.position = ms
  now.at = Date.now()
  send('seek', '&ms=' + Math.round(ms))
  paintProgress()
}

function scrub(dir: number) {
  if (!now) return
  if (now.source !== 'spotify') { toast('Scrubbing works with Spotify through the Mac link.'); return }
  const t = Date.now()
  const fast = t - lastTurn < 90
  lastTurn = t
  if (!scrubbing) { scrubbing = true; scrubPos = livePos() }
  scrubPos = Math.max(0, Math.min(now.duration || 0, scrubPos + dir * (fast ? 10000 : 5000)))
  paintProgress()
  window.clearTimeout(scrubTimer)
  scrubTimer = window.setTimeout(() => { scrubbing = false; seekTo(scrubPos) }, 700)
}

// ---------------------------------------------------------------- input
export function input(e: Inp) {
  if (e === 'back') { if (scrubbing) { scrubbing = false; window.clearTimeout(scrubTimer); paintProgress() } else closeMusic(); return }
  if (!now) return
  if (e === 'left' || e === 'right') { scrub(e === 'right' ? 1 : -1); return }
  if (e === 'select') {
    if (scrubbing) { window.clearTimeout(scrubTimer); scrubbing = false; seekTo(scrubPos); return }
    now.position = livePos(); now.at = Date.now(); now.playing = !now.playing; paint()
    send(now.playing ? 'play' : 'pause')
  } else if (e === 'b1') {
    // like most players: restart the song if we're more than 3s in, otherwise go back a track
    if (now.source === 'spotify' && livePos() > 3000) seekTo(0)
    else send('prev')
  } else if (e === 'b4') send('next')
  else if (e === 'b2') {
    now.shuffle = !now.shuffle; paint()
    send('shuffle', '&on=' + (now.shuffle ? '1' : '0'))
  } else if (e === 'b3') {
    if (now.source === 'spotify') {
      const order = ['off', 'context', 'track']
      const nx = order[(order.indexOf(now.repeat) + 1) % order.length] || 'off'
      now.repeat = nx; paint()
      send('repeat', '&mode=' + nx)
    } else send('repeat')
  }
}
