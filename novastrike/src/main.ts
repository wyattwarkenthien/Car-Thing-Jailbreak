// NOVA STRIKE: an original arcade space shooter for the Car Thing.
// Turn the dial to slide the ship. Firing is automatic (or hold Back / the dial / 4 in HOLD mode).
// 1/2 hold to slide, 3 pauses, drag on the screen to move.
import * as A from './art'
import { installSleep, isAsleep } from '../../shared/sleep'

const W = 400, H = 240
const cv = document.getElementById('c') as HTMLCanvasElement
const g = cv.getContext('2d')!
g.imageSmoothingEnabled = false
function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H)
  cv.style.width = Math.floor(W * s) + 'px'; cv.style.height = Math.floor(H * s) + 'px'
}
window.addEventListener('resize', fit); fit()

// ---------------------------------------------------------------- art
const SHIP = [A.ship(0), A.ship(1), A.ship(2)]
const LIFE = A.lifeIcon()
const EN: { [k: string]: A.Img[] } = { darter: [A.darter(0), A.darter(1)], stinger: [A.stinger(0), A.stinger(1)], warden: [A.warden(0, false), A.warden(1, false)], wardenHurt: [A.warden(0, true), A.warden(1, true)] }
const BOSS = [A.boss(0, false), A.boss(1, false), A.boss(0, true)]
const BUL = A.bullet(true), EBUL = A.bullet(false)
const POW: { [k: string]: A.Img } = { double: A.power('double'), shield: A.power('shield'), rapid: A.power('rapid') }
const BOOM = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map(A.boom)
const NEB = A.nebula(W, H)
const STARS = [A.stars(W, H, 70, 3, ['#4a4a7a', '#5a5a8a']), A.stars(W, H, 45, 7, ['#9a9ad8', '#c8c8ff']), A.stars(W, H, 18, 11, ['#ffffff', '#fff0c0'])]

// ---------------------------------------------------------------- save
let hi = 0, autoFire = true
try { hi = +(localStorage.getItem('nova_hi') || 0); autoFire = localStorage.getItem('nova_fire') !== 'hold' } catch (e) { /* */ }
const saveOpts = () => { try { localStorage.setItem('nova_hi', String(hi)); localStorage.setItem('nova_fire', autoFire ? 'auto' : 'hold') } catch (e) { /* */ } }

// ---------------------------------------------------------------- state
interface Pt { x: number; y: number }
interface Enemy {
  k: 'darter' | 'stinger' | 'warden'; x: number; y: number; hp: number; slot: Pt
  state: 'enter' | 'form' | 'dive' | 'return'; t: number; path: Pt[]; dur: number; shots: number; fireAt: number; inv: number
}
interface Shot { x: number; y: number; vx: number; vy: number; friendly: boolean }
interface Boom { x: number; y: number; t: number; big: boolean }
interface Pow { x: number; y: number; k: string }
interface Pop { x: number; y: number; t: number; s: string }

const P = { x: W / 2, target: W / 2, y: 214, alive: true, inv: 0, cool: 0, double: 0, rapid: 0, shield: false, respawn: 0 }
let enemies: Enemy[] = []
let shots: Shot[] = []
let booms: Boom[] = []
let pows: Pow[] = []
let pops: Pop[] = []
let boss: { x: number; y: number; hp: number; max: number; t: number; vx: number; fire: number; spawn: number; inv: number; enter: number } | null = null
let wave = 0, score = 0, lives = 3, nextLife = 20000
let spawnQueue: { at: number; fn: () => void }[] = []
let waveT = 0, formT = 0, diveT = 0
type Mode = 'title' | 'help' | 'play' | 'waveIntro' | 'over'
let mode: Mode = 'title'
let modeT = 0, paused = false, titleSel = 0
let starY = [0, 0, 0]

// ---------------------------------------------------------------- formation
const COLS = 8, SPX = 24, SPY = 18
function slotPos(c: number, r: number): Pt {
  const sway = Math.sin(formT * 0.7) * 34
  const breathe = 1 + Math.sin(formT * 1.3) * 0.06
  return { x: W / 2 + (c - (COLS - 1) / 2) * SPX * breathe + sway, y: 34 + r * SPY }
}
function bez(p: Pt[], t: number): Pt {
  const u = 1 - t
  return { x: u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x, y: u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y }
}

function startWave() {
  wave++
  enemies = []; shots = shots.filter((s) => s.friendly); spawnQueue = []
  waveT = 0; diveT = 2.5
  mode = 'waveIntro'; modeT = 0
  if (wave % 4 === 0) { startBoss(); return }
  const rows = wave === 1 ? 2 : wave === 2 ? 3 : 4
  const kinds: Enemy['k'][] = ['warden', 'stinger', 'darter', 'darter']
  const rowKinds = rows === 2 ? ['stinger', 'darter'] : rows === 3 ? ['warden', 'stinger', 'darter'] : kinds
  // groups of 4 fly in from alternating sides, along mirrored curves
  let gi = 0
  for (let r = 0; r < rows; r++) for (let half = 0; half < 2; half++) {
    const side = (gi % 2) ? 1 : -1, at = 1.0 + gi * 0.95
    for (let i = 0; i < 4; i++) {
      const c = half * 4 + i
      const k = rowKinds[r] as Enemy['k']
      spawnQueue.push({ at: at + i * 0.16, fn: () => {
        const slot = { x: c, y: r }
        const start = { x: W / 2 + side * 230, y: 150 + (r % 2) * 30 }
        const path = [start, { x: W / 2 + side * 40, y: 230 }, { x: W / 2 - side * 120, y: 40 }, { x: 0, y: 0 }]
        enemies.push({ k, x: start.x, y: start.y, hp: k === 'warden' ? 2 : 1, slot, state: 'enter', t: 0, path, dur: 1.8, shots: 0, fireAt: 0.4 + Math.random() * 0.6, inv: 0 })
      } })
    }
    gi++
  }
}
function startBoss() {
  boss = { x: W / 2, y: -40, hp: 40 + wave * 4, max: 40 + wave * 4, t: 0, vx: 0.7, fire: 2, spawn: 5, inv: 0, enter: 0 }
}

function diveFrom(e: Enemy) {
  const s = slotPos(e.slot.x, e.slot.y)
  const side = e.x < W / 2 ? -1 : 1
  const aimX = Math.max(30, Math.min(W - 30, P.x + (Math.random() - 0.5) * 80))
  e.state = 'dive'; e.t = 0
  e.path = [{ x: e.x, y: e.y }, { x: e.x + side * 70, y: e.y - 30 }, { x: aimX - side * 90, y: 190 }, { x: aimX + side * 40, y: H + 20 }]
  e.dur = Math.max(1.6, 2.6 - wave * 0.08)
  e.shots = e.k === 'darter' ? 1 : 2
  e.fireAt = 0.25 + Math.random() * 0.2
  void s
}

function enemyUpdate(e: Enemy, dt: number) {
  if (e.inv > 0) e.inv -= dt
  if (e.state === 'form') {
    const s = slotPos(e.slot.x, e.slot.y); e.x = s.x; e.y = s.y
    return
  }
  e.t += dt / e.dur
  if (e.state === 'enter') {
    const s = slotPos(e.slot.x, e.slot.y)
    e.path[3] = s
    const p = bez(e.path, Math.min(1, e.t)); e.x = p.x; e.y = p.y
    if (e.t >= 1) e.state = 'form'
  } else if (e.state === 'dive') {
    const p = bez(e.path, Math.min(1, e.t)); e.x = p.x; e.y = p.y
    if (e.shots > 0 && e.t > e.fireAt && P.alive) { enemyFire(e.x, e.y + 6); e.shots--; e.fireAt += 0.18 }
    if (e.t >= 1) { e.state = 'return'; e.t = 0; e.x = slotPos(e.slot.x, e.slot.y).x; e.y = -16 }
  } else if (e.state === 'return') {
    const s = slotPos(e.slot.x, e.slot.y)
    e.x += (s.x - e.x) * 0.08; e.y += Math.min(2.2, (s.y - e.y) * 0.08 + 0.6)
    if (Math.abs(e.y - s.y) < 1.5 && Math.abs(e.x - s.x) < 2) e.state = 'form'
  }
}
function enemyFire(x: number, y: number) {
  const sp = 1.9 + Math.min(1.4, wave * 0.1)
  const dx = P.x - x, dy = P.y - y, d = Math.sqrt(dx * dx + dy * dy) || 1
  shots.push({ x, y, vx: (dx / d) * sp * 0.45, vy: sp, friendly: false })
}

// ---------------------------------------------------------------- player
const held = { left: false, right: false, fire: false, touch: false }
let touchX = -1
function playerUpdate(dt: number) {
  if (!P.alive) {
    P.respawn -= dt
    if (P.respawn <= 0 && lives > 0) { P.alive = true; P.inv = 2.2; P.x = P.target = W / 2 }
    return
  }
  if (held.left) P.target -= 3.2
  if (held.right) P.target += 3.2
  if (held.touch && touchX >= 0) P.target = touchX
  P.target = Math.max(10, Math.min(W - 10, P.target))
  P.x += (P.target - P.x) * 0.35
  if (P.inv > 0) P.inv -= dt
  if (P.double > 0) P.double -= dt
  if (P.rapid > 0) P.rapid -= dt
  P.cool -= dt
  const firing = autoFire || held.fire || held.touch
  if (firing && P.cool <= 0 && mode === 'play') {
    const max = P.double > 0 ? 6 : 3
    if (shots.filter((s) => s.friendly).length < max) {
      if (P.double > 0) { shots.push({ x: P.x - 5, y: P.y - 8, vx: 0, vy: -5.5, friendly: true }); shots.push({ x: P.x + 5, y: P.y - 8, vx: 0, vy: -5.5, friendly: true }) }
      else shots.push({ x: P.x, y: P.y - 9, vx: 0, vy: -5.5, friendly: true })
      P.cool = P.rapid > 0 ? 0.11 : 0.22
    }
  }
}
function hitPlayer() {
  if (!P.alive || P.inv > 0 || god) return
  if (P.shield) { P.shield = false; P.inv = 1.2; booms.push({ x: P.x, y: P.y, t: 0, big: false }); return }
  P.alive = false; P.respawn = 2.2; lives--
  booms.push({ x: P.x, y: P.y, t: 0, big: true }); booms.push({ x: P.x - 6, y: P.y + 3, t: -0.1, big: false }); booms.push({ x: P.x + 6, y: P.y - 2, t: -0.2, big: false })
  P.double = 0; P.rapid = 0
  if (lives <= 0) { setTimeout(() => { mode = 'over'; modeT = 0; if (score > hi) { hi = score; saveOpts() } }, 1500) }
}
let god = false

// ---------------------------------------------------------------- scoring + drops
function addScore(n: number, x: number, y: number) {
  score += n
  if (n >= 150) pops.push({ x, y, t: 0, s: String(n) })
  if (score >= nextLife) { lives++; nextLife += 30000; pops.push({ x: P.x, y: P.y - 16, t: 0, s: '1UP' }) }
}
function killEnemy(e: Enemy) {
  const diving = e.state === 'dive'
  const base = e.k === 'darter' ? 50 : e.k === 'stinger' ? 80 : 150
  addScore(diving ? base * 2 : base, e.x, e.y)
  booms.push({ x: e.x, y: e.y, t: 0, big: false })
  if (e.k === 'warden' || Math.random() < 0.04) pows.push({ x: e.x, y: e.y, k: ['double', 'shield', 'rapid'][Math.floor(Math.random() * 3)] })
  enemies.splice(enemies.indexOf(e), 1)
}

// ---------------------------------------------------------------- update
function update(dt: number) {
  modeT += dt
  for (let i = 0; i < 3; i++) starY[i] = (starY[i] + dt * [10, 24, 50][i]) % H
  if (mode === 'title' || mode === 'help' || mode === 'over') return
  formT += dt
  waveT += dt
  for (const q of spawnQueue) if (q.at <= waveT) { q.fn(); q.at = 1e9 }
  spawnQueue = spawnQueue.filter((q) => q.at < 1e9)
  if (mode === 'waveIntro' && modeT > 1.6) { mode = 'play'; modeT = 0 }
  playerUpdate(dt)
  for (const e of enemies.slice()) enemyUpdate(e, dt)

  // dives: more often, and in pairs, on later waves
  const inForm = enemies.filter((e) => e.state === 'form')
  diveT -= dt
  if (diveT <= 0 && inForm.length && P.alive && !spawnQueue.length) {
    const n = Math.min(inForm.length, wave >= 3 ? 2 : 1)
    for (let i = 0; i < n; i++) diveFrom(inForm[Math.floor(Math.random() * inForm.length)])
    diveT = Math.max(0.9, 3 - wave * 0.22) * (0.7 + Math.random() * 0.6)
  }
  // formation potshots
  if (P.alive && inForm.length && Math.random() < dt * (0.15 + wave * 0.05)) { const e = inForm[Math.floor(Math.random() * inForm.length)]; enemyFire(e.x, e.y + 6) }

  if (boss) bossUpdate(dt)

  // shots
  for (const s of shots) { s.x += s.vx; s.y += s.vy }
  shots = shots.filter((s) => s.y > -10 && s.y < H + 10 && s.x > -10 && s.x < W + 10)
  for (const s of shots.slice()) {
    if (s.friendly) {
      for (const e of enemies) {
        if (Math.abs(s.x - e.x) < 7 && Math.abs(s.y - e.y) < 7) {
          shots.splice(shots.indexOf(s), 1)
          e.hp--; e.inv = 0.12
          if (e.hp <= 0) killEnemy(e)
          break
        }
      }
      if (boss && boss.enter >= 1 && Math.abs(s.x - boss.x) < 28 && s.y < boss.y + 14 && s.y > boss.y - 14 && shots.indexOf(s) >= 0) {
        shots.splice(shots.indexOf(s), 1); boss.hp--; boss.inv = 0.06
        if (boss.hp <= 0) killBoss()
      }
    } else if (P.alive && Math.abs(s.x - P.x) < 5 && Math.abs(s.y - P.y) < 6) { shots.splice(shots.indexOf(s), 1); hitPlayer() }
  }
  // bodies colliding with the ship
  for (const e of enemies.slice()) if (P.alive && Math.abs(e.x - P.x) < 10 && Math.abs(e.y - P.y) < 9) { killEnemy(e); hitPlayer() }
  // power-ups
  for (const p of pows) p.y += 0.9
  for (const p of pows.slice()) if (P.alive && Math.abs(p.x - P.x) < 10 && Math.abs(p.y - P.y) < 10) {
    pows.splice(pows.indexOf(p), 1)
    if (p.k === 'double') P.double = 15; else if (p.k === 'rapid') P.rapid = 15; else P.shield = true
    pops.push({ x: P.x, y: P.y - 16, t: 0, s: p.k === 'double' ? 'DOUBLE SHOT' : p.k === 'rapid' ? 'RAPID FIRE' : 'SHIELD' })
  }
  pows = pows.filter((p) => p.y < H + 10)
  for (const b of booms) b.t += dt
  booms = booms.filter((b) => b.t < 0.5)
  for (const p of pops) { p.t += dt; p.y -= 0.4 }
  pops = pops.filter((p) => p.t < 1)

  // wave cleared
  if (mode === 'play' && !enemies.length && !spawnQueue.length && !boss && lives > 0) {
    addScore(500 + wave * 100, W / 2, 120)
    startWave()
  }
}

function bossUpdate(dt: number) {
  const b = boss!
  b.t += dt
  if (b.inv > 0) b.inv -= dt
  if (b.enter < 1) { b.enter = Math.min(1, b.enter + dt * 0.5); b.y = -40 + b.enter * 90; return }
  b.x += b.vx * (b.hp < b.max / 2 ? 1.6 : 1)
  if (b.x < 50 || b.x > W - 50) b.vx = -b.vx
  b.y = 50 + Math.sin(b.t * 0.8) * 10
  b.fire -= dt
  if (b.fire <= 0) {
    const n = b.hp < b.max / 2 ? 7 : 5
    for (let i = 0; i < n; i++) { const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.22; shots.push({ x: b.x, y: b.y + 16, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, friendly: false }) }
    b.fire = b.hp < b.max / 2 ? 1.3 : 1.9
  }
  b.spawn -= dt
  if (b.spawn <= 0 && enemies.length < 6) {
    for (const side of [-1, 1]) {
      const e: Enemy = { k: 'darter', x: b.x + side * 26, y: b.y + 10, hp: 1, slot: { x: 0, y: 0 }, state: 'dive', t: 0, path: [], dur: 2.2, shots: 1, fireAt: 0.4, inv: 0 }
      e.path = [{ x: e.x, y: e.y }, { x: e.x + side * 60, y: e.y + 20 }, { x: P.x - side * 60, y: 180 }, { x: P.x + side * 30, y: H + 30 }]
      enemies.push(e)
    }
    b.spawn = 4.5
  }
  if (P.alive && Math.abs(b.x - P.x) < 30 && Math.abs(b.y - P.y) < 16) hitPlayer()
}
function killBoss() {
  const b = boss!
  for (let i = 0; i < 9; i++) booms.push({ x: b.x + (Math.random() - 0.5) * 50, y: b.y + (Math.random() - 0.5) * 24, t: -i * 0.08, big: true })
  addScore(3000 + wave * 250, b.x, b.y)
  pows.push({ x: b.x, y: b.y, k: 'shield' })
  boss = null
  // boss-spawned darters leave with it
  enemies.forEach((e) => booms.push({ x: e.x, y: e.y, t: 0, big: false })); enemies = []
}

// ---------------------------------------------------------------- drawing
function txt(s: string, x: number, y: number, size: number, col = '#ffffff', align: CanvasTextAlign = 'left') {
  g.font = `${size}px VT323, monospace`; g.textAlign = align; g.textBaseline = 'alphabetic'
  g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(s, x + 1, y + 1)
  g.fillStyle = col; g.fillText(s, x, y)
}
function drawBg() {
  g.drawImage(NEB, 0, 0)
  STARS.forEach((s, i) => { const y = Math.floor(starY[i]); g.drawImage(s, 0, y); g.drawImage(s, 0, y - H) })
}
function render() {
  drawBg()
  if (mode === 'title' || mode === 'help') { drawTitle(); return }
  const fr = Math.floor(performance.now() / 260) % 2
  for (const p of pows) g.drawImage(POW[p.k], Math.round(p.x - 6), Math.round(p.y - 6))
  for (const e of enemies) {
    if (e.inv > 0 && Math.floor(e.inv * 40) % 2) continue
    const imgs = e.k === 'warden' && e.hp < 2 ? EN.wardenHurt : EN[e.k]
    const im = imgs[e.state === 'form' ? fr : 1]
    g.drawImage(im, Math.round(e.x - im.width / 2), Math.round(e.y - im.height / 2))
  }
  if (boss) {
    const im = boss.inv > 0 ? BOSS[2] : BOSS[fr]
    g.drawImage(im, Math.round(boss.x - 32), Math.round(boss.y - 17))
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(W / 2 - 80, 20, 160, 5)
    g.fillStyle = '#ff4a6a'; g.fillRect(W / 2 - 79, 21, Math.max(0, (boss.hp / boss.max) * 158), 3)
  }
  for (const s of shots) g.drawImage(s.friendly ? BUL : EBUL, Math.round(s.x - 1), Math.round(s.y - 3))
  if (P.alive && !(P.inv > 0 && Math.floor(P.inv * 10) % 2)) {
    const th = 1 + (Math.floor(performance.now() / 80) % 2)
    g.drawImage(SHIP[th], Math.round(P.x - 7), Math.round(P.y - 8))
    if (P.shield) { g.strokeStyle = 'rgba(154,255,106,0.7)'; g.beginPath(); g.arc(Math.round(P.x), Math.round(P.y), 12, 0, Math.PI * 2); g.stroke() }
  }
  for (const b of booms) if (b.t >= 0) {
    const im = BOOM[Math.min(6, Math.floor((b.t / 0.5) * 7))]
    if (b.big) g.drawImage(im, Math.round(b.x - 16), Math.round(b.y - 16), 32, 32)
    else g.drawImage(im, Math.round(b.x - 8), Math.round(b.y - 8))
  }
  for (const p of pops) { g.globalAlpha = 1 - p.t; txt(p.s, Math.round(p.x), Math.round(p.y), 13, '#ffe070', 'center'); g.globalAlpha = 1 }
  // HUD
  txt('SCORE ' + score, 6, 13, 16)
  txt('HI ' + Math.max(hi, score), W / 2, 13, 16, '#c8c8ff', 'center')
  txt('WAVE ' + wave, W - 6, 13, 16, '#ffe070', 'right')
  for (let i = 0; i < Math.min(6, lives - (P.alive ? 1 : 0)); i++) g.drawImage(LIFE, 6 + i * 11, H - 12)
  let px = W - 6
  if (P.rapid > 0) { txt('RAPID ' + Math.ceil(P.rapid), px, H - 4, 13, '#ffd040', 'right'); px -= 62 }
  if (P.double > 0) txt('DOUBLE ' + Math.ceil(P.double), px, H - 4, 13, '#3ad8ff', 'right')
  if (mode === 'waveIntro') {
    txt(boss ? 'WARNING: MOTHERSHIP' : 'WAVE ' + wave, W / 2, 120, boss ? 26 : 32, boss ? '#ff4a6a' : '#ffffff', 'center')
    if (wave === 1) txt(autoFire ? 'Turn the dial to steer. Firing is automatic.' : 'Turn the dial to steer. Hold BACK to fire.', W / 2, 142, 15, '#c8c8ff', 'center')
  }
  if (mode === 'over') {
    g.fillStyle = 'rgba(5,3,15,0.7)'; g.fillRect(0, 0, W, H)
    txt('GAME OVER', W / 2, 106, 40, '#ff4a6a', 'center')
    txt('SCORE ' + score + '   WAVE ' + wave, W / 2, 132, 18, '#ffffff', 'center')
    if (score >= hi && score > 0) txt('NEW HIGH SCORE!', W / 2, 152, 16, '#ffe070', 'center')
    if (modeT > 1.5) txt('PRESS for the title', W / 2, 180, 15, '#c8c8ff', 'center')
  }
  if (paused) {
    g.fillStyle = 'rgba(5,3,15,0.75)'; g.fillRect(0, 0, W, H)
    txt('PAUSED', W / 2, 110, 32, '#ffffff', 'center')
    txt('3 or BACK resume   PRESS quit to title', W / 2, 134, 15, '#c8c8ff', 'center')
  }
}
function titleItems() { return ['START', 'FIRE: ' + (autoFire ? 'AUTOMATIC' : 'HOLD BACK'), 'HOW TO PLAY'].concat(env.hosted ? ['HOME'] : []) }
function drawTitle() {
  const t = performance.now() / 1000
  g.drawImage(BOSS[0], W / 2 - 32, 22 + Math.round(Math.sin(t) * 3))
  txt('NOVA STRIKE', W / 2 + 2, 92, 52, '#3a1a6a', 'center')
  txt('NOVA STRIKE', W / 2, 90, 52, '#ffe070', 'center')
  if (mode === 'help') {
    g.fillStyle = 'rgba(5,3,15,0.88)'; g.fillRect(30, 100, W - 60, 128)
    ;['DIAL        slide your ship left and right', 'BACK / PRESS / 4   fire (in HOLD mode)', '1 / 2       hold to slide    3  pause', 'TOUCH       drag to steer', '', 'Purple wardens take two hits and drop', 'power-ups: D double shot, R rapid, S shield.', 'Every 4th wave the mothership attacks.'].forEach((l, i) => txt(l, 42, 116 + i * 14, 14, '#ffffff'))
    return
  }
  titleItems().forEach((it, i) => txt((i === titleSel ? '> ' : '  ') + it, W / 2, 128 + i * 19, 18, i === titleSel ? '#ffe070' : '#ffffff', 'center'))
  if (hi) txt('HI ' + hi, W / 2, H - 22, 15, '#c8c8ff', 'center')
  txt('DIAL choose  PRESS start', W / 2, H - 6, 13, 'rgba(255,255,255,0.7)', 'center')
  g.drawImage(SHIP[1 + (Math.floor(t * 12) % 2)], W / 2 - 7 + Math.round(Math.sin(t * 1.3) * 90), 200)
}

// ---------------------------------------------------------------- flow + input
function newGame() {
  wave = 0; score = 0; lives = 3; nextLife = 20000
  enemies = []; shots = []; booms = []; pows = []; pops = []; boss = null
  Object.assign(P, { x: W / 2, target: W / 2, alive: true, inv: 1.5, cool: 0, double: 0, rapid: 0, shield: false })
  startWave()
}
const env = { hosted: /[?&]from=home(&|$)/.test(location.search) }
function goHome() { if (env.hosted) location.href = '../../index.html' }
installSleep((a) => { if (a && mode !== 'title' && mode !== 'over') paused = true; held.left = held.right = held.fire = held.touch = false })

type K = 'select' | 'back' | 'b1' | 'b2' | 'b3' | 'b4' | 'cw' | 'ccw'
function press(k: K) {
  if (mode === 'title') {
    const items = titleItems()
    if (k === 'cw') titleSel = (titleSel + 1) % items.length
    else if (k === 'ccw') titleSel = (titleSel + items.length - 1) % items.length
    else if (k === 'select' || k === 'b4') {
      const it = items[titleSel]
      if (it === 'START') newGame()
      else if (it.indexOf('FIRE') === 0) { autoFire = !autoFire; saveOpts() }
      else if (it === 'HOW TO PLAY') mode = 'help'
      else goHome()
    } else if (k === 'back') goHome()
    return
  }
  if (mode === 'help') { mode = 'title'; return }
  if (mode === 'over') { if (modeT > 1.5 && (k === 'select' || k === 'back' || k === 'b4')) { mode = 'title'; titleSel = 0 } return }
  if (paused) { if (k === 'b3' || k === 'back') paused = false; else if (k === 'select') { paused = false; mode = 'title'; titleSel = 0 } return }
  if (k === 'b3') { paused = true; return }
  if (k === 'cw') P.target += 15
  else if (k === 'ccw') P.target -= 15
  else if (k === 'b1') held.left = true
  else if (k === 'b2') held.right = true
  else if (k === 'back' || k === 'select' || k === 'b4') held.fire = true
}
function release(k: K) {
  if (k === 'b1') held.left = false
  else if (k === 'b2') held.right = false
  else if (k === 'back' || k === 'select' || k === 'b4') held.fire = false
}
const KEYS: { [k: string]: K } = {
  Digit1: 'b1', Digit2: 'b2', Digit3: 'b3', Digit4: 'b4', Numpad1: 'b1', Numpad2: 'b2', Numpad3: 'b3', Numpad4: 'b4',
  Enter: 'select', NumpadEnter: 'select', Space: 'back', Escape: 'back', Backspace: 'back', ArrowLeft: 'b1', ArrowRight: 'b2', KeyP: 'b3',
}
const FALLBACK: { [k: string]: K } = { '1': 'b1', '2': 'b2', '3': 'b3', '4': 'b4', Enter: 'select', Escape: 'back' }
window.addEventListener('keydown', (e) => { const k = KEYS[e.code] || FALLBACK[e.key]; if (!k) return; e.preventDefault(); e.stopPropagation(); if (e.repeat) return; press(k) }, true)
window.addEventListener('keyup', (e) => { const k = KEYS[e.code] || FALLBACK[e.key]; if (k) { e.preventDefault(); release(k) } }, true)
let lastWheel = 0
window.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault()
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!d) return
  const now = performance.now()
  if ((mode === 'title') && now - lastWheel < 60) return
  lastWheel = now
  let dir = d > 0 ? 1 : -1
  try { if (JSON.parse(localStorage.getItem('westward_opts') || '{}').reverseDial) dir = -dir } catch (er) { /* */ }
  press(dir > 0 ? 'cw' : 'ccw')
}, { capture: true, passive: false } as AddEventListenerOptions)
function touchAt(clientX: number) { const r = cv.getBoundingClientRect(); touchX = ((clientX - r.left) / r.width) * W }
cv.addEventListener('touchstart', (e) => {
  e.preventDefault()
  if (mode !== 'play' && mode !== 'waveIntro' || paused) { press('select'); release('select'); return }
  held.touch = true; touchAt(e.touches[0].clientX)
}, { passive: false } as AddEventListenerOptions)
cv.addEventListener('touchmove', (e) => { e.preventDefault(); touchAt(e.touches[0].clientX) }, { passive: false } as AddEventListenerOptions)
cv.addEventListener('touchend', (e) => { e.preventDefault(); held.touch = false }, { passive: false } as AddEventListenerOptions)
cv.addEventListener('mousedown', (e) => { if (mode !== 'play' && mode !== 'waveIntro' || paused) { press('select'); release('select'); return } held.touch = true; touchAt(e.clientX) })
cv.addEventListener('mousemove', (e) => { if (held.touch) touchAt(e.clientX) })
cv.addEventListener('mouseup', () => { held.touch = false })
document.addEventListener('contextmenu', (e) => e.preventDefault())

// ---------------------------------------------------------------- loop
let last = performance.now(), acc = 0
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (!isAsleep()) {
    if (!paused) { acc += dt; let n = 0; while (acc >= 1 / 60 && n < 6) { update(1 / 60); acc -= 1 / 60; n++ } if (n >= 6) acc = 0 }
    render()
  }
  requestAnimationFrame(frame)
}
function boot() { requestAnimationFrame((t) => { last = t; frame(t) }) }
const FF = (window as unknown as { FontFace?: typeof FontFace }).FontFace
if (FF && document.fonts) {
  const f = new FF('VT323', 'url(FONTURL)')
  f.load().then((ff) => { (document.fonts as unknown as { add(f: FontFace): void }).add(ff); boot() }).catch(boot)
} else boot()

;(window as unknown as { __nova: unknown }).__nova = {
  state: () => ({ mode, wave, score, lives, enemies: enemies.length, boss: boss ? boss.hp : null, alive: P.alive }),
  newGame, press, release, god: (v: boolean) => { god = v }, steps: (n: number) => { for (let i = 0; i < n; i++) update(1 / 60) },
  wave: (n: number) => { wave = n - 1; startWave() },
}
