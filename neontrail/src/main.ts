// NEON TRAIL: an original light-trail arena game for the Car Thing.
// Each dial click turns your rider 90 degrees (right = clockwise). Hold Back, the dial or 4 to boost.
// 1/2 also turn left/right, 3 pauses. Tap the left/right half of the screen to turn.
import { installSleep, isAsleep } from '../../shared/sleep'

const CW = 10, GW = 80, GH = 45, OY = 30 // 80 x 45 cells of 10px under a 30px HUD
const cv = document.getElementById('c') as HTMLCanvasElement
const g = cv.getContext('2d')!
const fxc = document.getElementById('fx') as HTMLCanvasElement
const fx = fxc.getContext('2d')!
const hud = document.getElementById('hud')!
const msg = document.getElementById('msg')!
const wrap = document.getElementById('wrap')!
function fit() {
  const s = Math.min(window.innerWidth / 800, window.innerHeight / 480)
  wrap.style.transform = wrap.style.webkitTransform = `translate(-50%,-50%) scale(${s})`
}
window.addEventListener('resize', fit); fit()

// ---------------------------------------------------------------- arena
const WALL = 255
const grid = new Uint8Array(GW * GH)
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0] // up, right, down, left
const idx = (x: number, y: number) => y * GW + x
const free = (x: number, y: number) => x >= 0 && y >= 0 && x < GW && y < GH && grid[idx(x, y)] === 0

interface Rider {
  id: number; name: string; col: string; head: string; x: number; y: number; dir: number; alive: boolean
  ai: boolean; queue: number[]; cells: number[]; boost: number; boosting: boolean; skill: number
}
const COLORS: [string, string, string][] = [
  ['YOU', '#3ad8ff', '#e8fcff'], ['EMBER', '#ff8a2a', '#fff0d8'], ['VIOLET', '#e04aff', '#ffe0ff'], ['LIME', '#9aff3a', '#f0ffe0'],
]
let riders: Rider[] = []

// ---------------------------------------------------------------- drawing (incremental: only new cells are painted)
const BG = (() => {
  const c = document.createElement('canvas'); c.width = 800; c.height = 480
  const x = c.getContext('2d')!
  const gr = x.createLinearGradient(0, OY, 0, 480)
  gr.addColorStop(0, '#060a1c'); gr.addColorStop(1, '#0a0618')
  x.fillStyle = gr; x.fillRect(0, 0, 800, 480)
  x.fillStyle = 'rgba(58,140,255,0.10)'
  for (let i = 0; i <= GW; i += 1) x.fillRect(i * CW, OY, 1, GH * CW)
  for (let j = 0; j <= GH; j += 1) x.fillRect(0, OY + j * CW, 800, 1)
  x.fillStyle = 'rgba(58,140,255,0.22)'
  for (let i = 0; i <= GW; i += 5) x.fillRect(i * CW, OY, 1, GH * CW)
  for (let j = 0; j <= GH; j += 5) x.fillRect(0, OY + j * CW, 800, 1)
  x.strokeStyle = '#3ad8ff'; x.lineWidth = 2; x.shadowColor = '#3ad8ff'; x.shadowBlur = 10
  x.strokeRect(1, OY + 1, 798, GH * CW - 2)
  return c
})()

function paintCell(cx: number, cy: number, col: string, glow: boolean) {
  const x = cx * CW, y = OY + cy * CW
  if (glow) { g.shadowColor = col; g.shadowBlur = 9 }
  g.fillStyle = col
  g.fillRect(x + 1, y + 1, CW - 2, CW - 2)
  if (glow) g.shadowBlur = 0
}
function clearCell(cx: number, cy: number) {
  const x = cx * CW, y = OY + cy * CW
  g.drawImage(BG, x - 2, y - 2, CW + 4, CW + 4, x - 2, y - 2, CW + 4, CW + 4)
}
function redrawAll() {
  g.drawImage(BG, 0, 0)
  for (const r of riders) { r.cells.forEach((i) => paintCell(i % GW, Math.floor(i / GW), r.col, true)); if (r.alive) paintCell(r.x, r.y, r.head, true) }
}

// ---------------------------------------------------------------- effects layer (sparks when a rider crashes)
interface Spark { x: number; y: number; vx: number; vy: number; life: number; col: string }
let sparks: Spark[] = []
let fxDirty = false
function burst(r: Rider) {
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 5
    sparks.push({ x: r.x * CW + 5, y: OY + r.y * CW + 5, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.5, col: Math.random() < 0.4 ? '#ffffff' : r.col })
  }
}
function drawFx(dt: number) {
  if (!sparks.length && !fxDirty) return
  fx.clearRect(0, 0, 800, 480)
  fxDirty = sparks.length > 0
  for (const s of sparks) {
    s.life -= dt; s.x += s.vx; s.y += s.vy; s.vx *= 0.94; s.vy *= 0.94
    fx.globalAlpha = Math.max(0, Math.min(1, s.life * 2))
    fx.fillStyle = s.col; fx.fillRect(s.x, s.y, 3, 3)
  }
  fx.globalAlpha = 1
  sparks = sparks.filter((s) => s.life > 0)
}

// ---------------------------------------------------------------- AI
const seen = new Int32Array(GW * GH)
let stamp = 1
const queueBuf = new Int32Array(GW * GH)
function space(sx: number, sy: number, limit: number): number {
  stamp++
  let qh = 0, qt = 0, n = 0
  queueBuf[qt++] = idx(sx, sy); seen[idx(sx, sy)] = stamp
  while (qh < qt && n < limit) {
    const i = queueBuf[qh++]; n++
    const x = i % GW, y = (i - x) / GW
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d]
      if (!free(nx, ny)) continue
      const j = idx(nx, ny)
      if (seen[j] === stamp) continue
      seen[j] = stamp; queueBuf[qt++] = j
    }
  }
  return n
}
function runLength(x: number, y: number, d: number, max: number) {
  let n = 0
  while (n < max && free(x + DX[d] * (n + 1), y + DY[d] * (n + 1))) n++
  return n
}
function think(r: Rider) {
  const you = riders[0]
  const opts = [r.dir, (r.dir + 3) % 4, (r.dir + 1) % 4]
  let best = r.dir, bestScore = -1e9
  const limit = 60 + Math.floor(r.skill * 340)
  for (let k = 0; k < 3; k++) {
    const d = opts[k], nx = r.x + DX[d], ny = r.y + DY[d]
    if (!free(nx, ny)) continue
    // don't step next to an enemy head (a head-on would kill both)
    let danger = 0
    for (const o of riders) if (o !== r && o.alive && Math.abs(o.x + DX[o.dir] - nx) + Math.abs(o.y + DY[o.dir] - ny) === 0) danger = 1
    let s = space(nx, ny, limit) * 1.0 + runLength(nx, ny, d, 12) * 1.5 + (k === 0 ? 3 : 0) - danger * 400
    // cutting off the player: aim for a spot a few cells in front of them
    if (you.alive && r.skill > 0.4) {
      const tx = you.x + DX[you.dir] * 6, ty = you.y + DY[you.dir] * 6
      s -= (Math.abs(tx - nx) + Math.abs(ty - ny)) * r.skill * 0.8
    }
    s += (Math.random() - 0.5) * (1 - r.skill) * 30
    if (s > bestScore) { bestScore = s; best = d }
  }
  r.dir = best
}

// ---------------------------------------------------------------- game state
type Mode = 'title' | 'help' | 'count' | 'play' | 'roundEnd' | 'over'
let mode: Mode = 'title'
let modeT = 0
let paused = false
let level = 1
let lives = 3
let score = 0
let best = 0
try { best = +(localStorage.getItem('neontrail_best') || 0) } catch (e) { /* */ }
let titleSel = 0
let tickAcc = 0
let boostTick = 0
let roundResult = ''

function tickTime() { return 1 / Math.min(22, 13 + (level - 1) * 1.2) }
function aiCount() { return level === 1 ? 1 : level === 2 ? 2 : 3 }
function aiSkill() { return Math.min(0.95, 0.25 + (level - 1) * 0.14) }

function startRound() {
  grid.fill(0)
  riders = []
  const starts: [number, number, number][] = [[40, 38, 0], [40, 6, 2], [8, 22, 1], [71, 22, 3]]
  const n = 1 + aiCount()
  for (let i = 0; i < n; i++) {
    const [x, y, d] = starts[i]
    const c = COLORS[i]
    riders.push({ id: i + 1, name: c[0], col: c[1], head: c[2], x, y, dir: d, alive: true, ai: i > 0, queue: [], cells: [], boost: 1, boosting: false, skill: aiSkill() })
    grid[idx(x, y)] = i + 1
  }
  redrawAll()
  sparks = []; fxDirty = true
  mode = 'count'; modeT = 0
  tickAcc = 0
}

function crash(r: Rider) {
  r.alive = false
  burst(r)
  // the dead rider's trail fades away and frees the space
  const cells = r.cells.concat([idx(r.x, r.y)])
  cells.forEach((i) => { grid[i] = 0 })
  setTimeout(() => { cells.forEach((i) => { if (grid[i] === 0) clearCell(i % GW, Math.floor(i / GW)) }) }, 350)
  r.cells = []
}

function stepRiders(movers: Rider[]) {
  // decide
  for (const r of movers) {
    if (r.ai) think(r)
    else if (r.queue.length) r.dir = r.queue.shift()!
  }
  // where each one wants to go
  const next = movers.map((r) => ({ r, x: r.x + DX[r.dir], y: r.y + DY[r.dir] }))
  const dead: Rider[] = []
  for (const n of next) {
    if (!free(n.x, n.y)) { dead.push(n.r); continue }
    if (next.some((o) => o !== n && o.x === n.x && o.y === n.y)) dead.push(n.r) // head-on
  }
  for (const n of next) {
    const r = n.r
    if (dead.indexOf(r) >= 0) continue
    paintCell(r.x, r.y, r.col, true)
    r.cells.push(idx(r.x, r.y))
    r.x = n.x; r.y = n.y
    grid[idx(r.x, r.y)] = r.id
    paintCell(r.x, r.y, r.head, true)
    if (!r.ai) score += 1
  }
  dead.forEach(crash)
}

function update(dt: number) {
  modeT += dt
  if (mode === 'count') { if (modeT > 2.4) { mode = 'play'; modeT = 0 } return }
  if (mode === 'roundEnd') { if (modeT > 2.6) afterRound(); return }
  if (mode !== 'play') return
  const you = riders[0]
  // boost meter: drains while held, refills slowly
  you.boosting = (held.back || held.dial || held.b4) && you.boost > 0.02
  you.boost = Math.max(0, Math.min(1, you.boost + (you.boosting ? -dt * 0.45 : dt * 0.12)))
  tickAcc += dt
  const T = tickTime()
  while (tickAcc >= T) {
    tickAcc -= T
    stepRiders(riders.filter((r) => r.alive))
    // boosting: you get an extra step every other tick
    if (you.alive && you.boosting && (++boostTick % 2 === 0)) stepRiders([you])
    if (checkEnd()) break
  }
}

function checkEnd() {
  const you = riders[0]
  const others = riders.filter((r) => r.ai && r.alive).length
  if (!you.alive || others === 0) {
    if (!you.alive && others === 0) roundResult = 'draw'
    else if (!you.alive) roundResult = 'lost'
    else roundResult = 'won'
    if (roundResult === 'won') score += 250 * level
    if (roundResult === 'lost') lives--
    mode = 'roundEnd'; modeT = 0
    return true
  }
  return false
}
function afterRound() {
  if (roundResult === 'won') level++
  if (lives <= 0) {
    mode = 'over'; modeT = 0
    if (score > best) { best = score; try { localStorage.setItem('neontrail_best', String(best)) } catch (e) { /* */ } }
    return
  }
  startRound()
}

// ---------------------------------------------------------------- HUD + messages (DOM, so the arena never needs a full redraw)
let lastHud = '', lastMsg = ''
function setHud(html: string) { if (html !== lastHud) { hud.innerHTML = html; lastHud = html } }
function setMsg(html: string) { if (html !== lastMsg) { msg.innerHTML = html; lastMsg = html } }
function ui() {
  if (mode === 'title' || mode === 'help') {
    setHud('<span>NEON TRAIL</span><span class="r">BEST ' + best + '</span>')
    if (mode === 'help') {
      setMsg('<div class="panel"><div class="mid">HOW TO PLAY</div><br>' +
        'Turn the dial: each click turns 90&deg;<br>(clockwise = right turn)<br>' +
        'Hold BACK, the dial or 4 to boost<br>1 / 2 also turn left / right &nbsp; 3 pauses<br>Touch the left or right half of the screen to turn<br><br>' +
        'Don\'t hit any wall or trail. Be the last rider moving.<br>Every round you win adds a rider or more speed.<br><br><span class="dim">PRESS to go back</span></div>')
    } else {
      const items = titleItems()
      setMsg('<div class="big">NEON TRAIL</div><div class="dim">ARENA OF LIGHT</div><br>' +
        items.map((t, i) => `<div class="${i === titleSel ? 'sel' : ''}">${i === titleSel ? '&gt; ' : ''}${t}</div>`).join('') +
        '<br><div class="dim">DIAL choose &nbsp; PRESS start</div>')
    }
    return
  }
  const you = riders[0]
  const hearts = '<span style="color:#ff5a7a">' + new Array(Math.max(0, lives) + 1).join('&#9632; ') + '</span>'
  setHud(`<span>LEVEL ${level}</span><span>SCORE ${score}</span><span>LIVES ${hearts}</span>` +
    `<span class="r">BOOST <span id="boost"><span id="boostf" style="width:${Math.round(you.boost * 100)}%"></span></span></span>`)
  if (paused) setMsg('<div class="panel"><div class="mid">PAUSED</div><br>3 or BACK to resume<br><span class="dim">PRESS the dial to quit to title</span></div>')
  else if (mode === 'count') {
    const n = 3 - Math.floor(modeT / 0.8)
    const foes = riders.filter((r) => r.ai).map((r) => `<span style="color:${r.col}">${r.name}</span>`).join(' &nbsp; ')
    setMsg(`<div class="dim">LEVEL ${level}</div><div class="big">${n > 0 ? n : 'GO'}</div><div>vs ${foes}</div>`)
  } else if (mode === 'roundEnd') {
    const t = roundResult === 'won' ? 'ROUND WON' : roundResult === 'draw' ? 'DRAW' : 'CRASHED'
    setMsg(`<div class="big" style="font-size:64px">${t}</div>` + (roundResult === 'won' ? `<div>+${250 * (level)} &nbsp; next: level ${level + 1}</div>` : roundResult === 'lost' ? `<div>${lives} ${lives === 1 ? 'life' : 'lives'} left</div>` : '<div>no one survives. again!</div>'))
  } else if (mode === 'over') {
    setMsg(`<div class="panel"><div class="mid">GAME OVER</div><br>SCORE ${score} &nbsp; LEVEL ${level}<br>BEST ${best}<br><br>${modeT > 1.5 ? '<span class="dim">PRESS for the title</span>' : ''}</div>`)
  } else setMsg('')
}

const env = { hosted: /[?&]from=home(&|$)/.test(location.search) }
function goHome() { if (env.hosted) location.href = '../../index.html' }
function titleItems() { return ['START', 'HOW TO PLAY'].concat(env.hosted ? ['HOME'] : []) }

function titleScreen() {
  mode = 'title'; modeT = 0; titleSel = 0; paused = false
  // a decorative arena behind the title
  grid.fill(0); riders = []
  g.drawImage(BG, 0, 0)
  const demo = (col: string, pts: [number, number][]) => { for (let i = 1; i < pts.length; i++) { let [x, y] = pts[i - 1]; const [x1, y1] = pts[i]; while (x !== x1 || y !== y1) { paintCell(x, y, col, true); x += Math.sign(x1 - x); y += Math.sign(y1 - y) } } }
  demo('#3ad8ff', [[2, 40], [20, 40], [20, 30], [34, 30], [34, 41], [60, 41]])
  demo('#ff8a2a', [[77, 4], [60, 4], [60, 12], [48, 12], [48, 3], [20, 3]])
  fx.clearRect(0, 0, 800, 480)
}
function newGame() { level = 1; lives = 3; score = 0; startRound() }

// ---------------------------------------------------------------- input
const held = { back: false, dial: false, b4: false }
installSleep((a) => { if (a && (mode === 'play' || mode === 'count')) paused = true; held.back = held.dial = held.b4 = false })
function turn(dirn: number) { // +1 right (clockwise), -1 left
  if (mode !== 'play' && mode !== 'count') return
  const you = riders[0]
  if (!you || !you.alive || paused) return
  const base = you.queue.length ? you.queue[you.queue.length - 1] : you.dir
  if (you.queue.length < 3) you.queue.push((base + (dirn > 0 ? 1 : 3)) % 4)
}
type K = 'select' | 'back' | 'b1' | 'b2' | 'b3' | 'b4' | 'left' | 'right'
function press(k: K) {
  if (mode === 'title') {
    const items = titleItems()
    if (k === 'left' || k === 'b1') titleSel = (titleSel + items.length - 1) % items.length
    else if (k === 'right' || k === 'b2') titleSel = (titleSel + 1) % items.length
    else if (k === 'select' || k === 'b4') { const it = items[titleSel]; if (it === 'START') newGame(); else if (it === 'HOW TO PLAY') { mode = 'help' } else goHome() }
    else if (k === 'back') goHome()
    return
  }
  if (mode === 'help') { mode = 'title'; return }
  if (mode === 'over') { if (modeT > 1.5 && (k === 'select' || k === 'back' || k === 'b4')) titleScreen(); return }
  if (paused) {
    if (k === 'b3' || k === 'back') paused = false
    else if (k === 'select') titleScreen()
    return
  }
  if (k === 'b3') { if (mode === 'play' || mode === 'count') paused = true; return }
  if (k === 'left' || k === 'b1') turn(-1)
  else if (k === 'right' || k === 'b2') turn(1)
  else if (k === 'back') held.back = true
  else if (k === 'select') held.dial = true
  else if (k === 'b4') held.b4 = true
}
function release(k: K) {
  if (k === 'back') held.back = false
  else if (k === 'select') held.dial = false
  else if (k === 'b4') held.b4 = false
}
const KEYS: { [k: string]: K } = {
  Digit1: 'b1', Digit2: 'b2', Digit3: 'b3', Digit4: 'b4', Numpad1: 'b1', Numpad2: 'b2', Numpad3: 'b3', Numpad4: 'b4',
  Enter: 'select', NumpadEnter: 'select', Space: 'select', Escape: 'back', Backspace: 'back',
  ArrowLeft: 'left', ArrowRight: 'right', KeyA: 'left', KeyD: 'right', KeyP: 'b3',
}
const FALLBACK: { [k: string]: K } = { '1': 'b1', '2': 'b2', '3': 'b3', '4': 'b4', Enter: 'select', Escape: 'back' }
window.addEventListener('keydown', (e) => {
  const k = KEYS[e.code] || FALLBACK[e.key]
  if (!k) return
  e.preventDefault(); e.stopPropagation()
  if (e.repeat) return
  press(k)
}, true)
window.addEventListener('keyup', (e) => { const k = KEYS[e.code] || FALLBACK[e.key]; if (k) { e.preventDefault(); release(k) } }, true)
let lastWheel = 0
window.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault()
  const now = performance.now()
  if (now - lastWheel < 35) return
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!d) return
  lastWheel = now
  let dir = d > 0 ? 1 : -1
  try { if (JSON.parse(localStorage.getItem('westward_opts') || '{}').reverseDial) dir = -dir } catch (er) { /* */ }
  press(dir > 0 ? 'right' : 'left')
}, { capture: true, passive: false } as AddEventListenerOptions)
function tap(clientX: number) {
  if (mode !== 'play' && mode !== 'count') { press('select'); release('select'); return }
  const r = wrap.getBoundingClientRect()
  turn((clientX - r.left) / r.width < 0.5 ? -1 : 1)
}
wrap.addEventListener('touchstart', (e) => { e.preventDefault(); tap(e.touches[0].clientX) }, { passive: false } as AddEventListenerOptions)
wrap.addEventListener('mousedown', (e) => tap(e.clientX))
document.addEventListener('contextmenu', (e) => e.preventDefault())

// ---------------------------------------------------------------- loop
let last = performance.now()
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (!isAsleep()) {
    if (!paused) update(dt)
    drawFx(dt)
    ui()
  }
  requestAnimationFrame(frame)
}
function boot() { titleScreen(); requestAnimationFrame((t) => { last = t; frame(t) }) }
const FF = (window as unknown as { FontFace?: typeof FontFace }).FontFace
if (FF && document.fonts) {
  const f = new FF('VT323', 'url(FONTURL)')
  f.load().then((ff) => { (document.fonts as unknown as { add(f: FontFace): void }).add(ff); boot() }).catch(boot)
} else boot()

// test hooks
;(window as unknown as { __nt: unknown }).__nt = {
  state: () => ({ mode, level, lives, score, riders: riders.map((r) => ({ name: r.name, alive: r.alive, x: r.x, y: r.y, dir: r.dir })) }),
  newGame, press, release, update, setLevel: (n: number) => { level = n }, startRound, autopilot: () => { riders[0].ai = true; riders[0].skill = 0.9 },
}
