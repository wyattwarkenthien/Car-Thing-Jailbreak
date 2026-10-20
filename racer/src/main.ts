// APEX '82: a retro pseudo-3D racer for the Car Thing.
// Dial = steer, Back = shift LO/HI, 1 = brake, 2 = pause, 4 or hold dial = gas (or automatic gas).
import * as Art from './art'

// ---------------------------------------------------------------- constants
const SW = 800, SH = 480 // screen
const RS = 2 // render scale: 2 = full 800x480
const W = 400 * RS, H = 240 * RS
const SEG = 200 // segment length
const ROAD_W = 2000 // half road width in world units
const RUMBLE = 3
const LANES = 3
const DRAW = 300 // most segments drawn (lowered automatically if the device can't keep up)
let drawDist = DRAW
const CAM_H = 1000
const FOV = 100
const CAM_D = 1 / Math.tan(((FOV / 2) * Math.PI) / 180)
const PLAYER_Z = CAM_H * CAM_D
const MAX = SEG * 60 // top speed (HI gear), units/s
const LO_MAX = MAX * 0.56
const KMH = 296 / MAX
const CENTRIFUGAL = 0.3
const OFF_ROAD_MAX = MAX / 3.2
const LAPS = 4
const CARS = 7
const CAR_W = 0.3 // car width as a fraction of half road width

// ---------------------------------------------------------------- canvas setup
const screen = document.getElementById('c') as HTMLCanvasElement
const sg = screen.getContext('2d')!
// At full resolution we draw straight to the screen (copying a full-size buffer was the slowest step).
const g = sg
function fit() {
  const s = Math.min(window.innerWidth / SW, window.innerHeight / SH)
  screen.style.width = Math.floor(SW * s) + 'px'
  screen.style.height = Math.floor(SH * s) + 'px'
}
window.addEventListener('resize', fit); fit()

// ---------------------------------------------------------------- sprites
const PALETTE: [string, string, string][] = [
  ['#2f7bff', '#123a8a', '#ffd21f'], ['#1fb35a', '#0b5a2a', '#ffffff'], ['#ffcc00', '#a07800', '#1a1a1a'], ['#ff7a00', '#8a3c00', '#ffffff'],
  ['#9b5cff', '#4a1f9a', '#7cf5ff'], ['#f2f2f2', '#8a8f99', '#ff2d55'], ['#00c2d1', '#00616a', '#ff7a00'],
]
const IMG = {
  player: [Art.car('#e8202a', '#7a0d12', '#ffffff', -1), Art.car('#e8202a', '#7a0d12', '#ffffff', 0), Art.car('#e8202a', '#7a0d12', '#ffffff', 1)],
  rivals: PALETTE.map((p) => Art.car(p[0], p[1], p[2], 0)),
  boards: [
    Art.billboard('TURBO COLA', ['#e8202a', '#8a0d12'], '#ffffff', 'ICE COLD SINCE 1971'),
    Art.billboard('NEON GAS', ['#1a1f4a', '#0b0d24'], '#7cf5ff', 'HIGH OCTANE'),
    Art.billboard('ZIPPO OIL', ['#ffd21f', '#d19a00'], '#1a1a1a', 'RACE FORMULA'),
    Art.billboard('APEX ’82', ['#ff7a00', '#b33c00'], '#ffffff', 'SUNSET COAST GP'),
    Art.billboard('KOMET TYRES', ['#f2f2f2', '#b9bec7'], '#1a1a1a', 'GRIP FOR DAYS'),
  ],
  palms: [Art.palm(0), Art.palm(1), Art.palm(2)],
  bush: Art.bush(),
  chevL: Art.chevron(-1), chevR: Art.chevron(1),
  gantry: Art.gantry(),
  boom: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => Art.explosion(i / 7)),
  hills: Art.mountains(1200, 110), // 2400x220 after ART_SCALE
}
// world widths (units) of each kind of sprite
const SIZE = { car: 620, board: 1500, palm: 900, bush: 700, chev: 650, gantry: ROAD_W * 2.5 }

// ---------------------------------------------------------------- track
interface P { world: { x: number; y: number; z: number }; cam: { x: number; y: number; z: number }; scr: { x: number; y: number; w: number; scale: number } }
interface Sprite { img: Art.Img; offset: number; w: number; solid: boolean }
interface Car { z: number; offset: number; speed: number; img: Art.Img; target: number; lap: number; seg: Seg | null; id: number }
interface Seg { i: number; p1: P; p2: P; curve: number; sprites: Sprite[]; cars: Car[]; dark: boolean; start: boolean; clip: number; looped: boolean; fog: number }

const segs: Seg[] = []
let trackLen = 0
const pt = (y: number, z: number): P => ({ world: { x: 0, y, z }, cam: { x: 0, y: 0, z: 0 }, scr: { x: 0, y: 0, w: 0, scale: 0 } })
const lastY = () => (segs.length ? segs[segs.length - 1].p2.world.y : 0)
function addSeg(curve: number, y: number) {
  const n = segs.length
  segs.push({ i: n, p1: pt(lastY(), n * SEG), p2: pt(y, (n + 1) * SEG), curve, sprites: [], cars: [], dark: Math.floor(n / RUMBLE) % 2 === 1, start: false, clip: 0, looped: false, fog: 0 })
}
const easeIn = (a: number, b: number, t: number) => a + (b - a) * t * t
const easeInOut = (a: number, b: number, t: number) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5)
function road(enter: number, hold: number, leave: number, curve: number, hill: number) {
  const y0 = lastY(), y1 = y0 + hill * SEG, total = enter + hold + leave
  for (let n = 0; n < enter; n++) addSeg(easeIn(0, curve, n / enter), easeInOut(y0, y1, n / total))
  for (let n = 0; n < hold; n++) addSeg(curve, easeInOut(y0, y1, (enter + n) / total))
  for (let n = 0; n < leave; n++) addSeg(easeInOut(curve, 0, n / leave), easeInOut(y0, y1, (enter + hold + n) / total))
}
const L = { S: 25, M: 50, L: 100 } // lengths
const C = { E: 2, M: 4, H: 6 } // curves
const Hl = { L: 20, M: 40, H: 60 } // hills

function buildTrack() {
  segs.length = 0
  // "Sunset Coast": mostly right-handers, a fast back straight, a chicane and a tight final corner
  road(L.M, L.M, L.M, 0, 0)
  road(L.M, L.M, L.M, C.E, Hl.L)
  road(L.L, L.L, L.L, 0, 0)
  road(L.M, L.M, L.M, C.M, -Hl.L)
  road(L.S, L.S, L.S, -C.E, 0)
  road(L.M, L.L, L.M, C.M, Hl.M)
  road(L.L, L.L, L.L, 0, -Hl.M)
  road(L.S, L.S, L.S, -C.M, 0)
  road(L.S, L.S, L.S, C.M, 0)          // chicane
  road(L.L, L.M, L.L, 0, Hl.L)
  road(L.M, L.M, L.M, -C.E, 0)
  road(L.M, L.S, L.M, C.H, -Hl.L)       // hard right
  road(L.L, L.L, L.M, 0, Hl.M)
  road(L.M, L.M, L.M, C.M, -Hl.M)
  road(L.L, L.M, L.L, 0, -lastY() / SEG) // back down to start height
  trackLen = segs.length * SEG
  for (let n = 0; n < 8; n++) segs[n + 6].start = true
  placeSprites()
}

function addSprite(n: number, img: Art.Img, offset: number, w: number, solid = true) {
  if (n >= 0 && n < segs.length) segs[n].sprites.push({ img, offset, w, solid })
}
function placeSprites() {
  let r = 7
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647 }
  addSprite(10, IMG.gantry, 0, SIZE.gantry, false)
  for (let n = 30; n < segs.length - 20; n++) {
    const s = segs[n]
    const ahead = segs[(n + 30) % segs.length]
    // warning chevrons on the outside of corners
    if (Math.abs(ahead.curve) >= C.M && n % 8 === 0) {
      const dir = ahead.curve > 0 ? 1 : -1
      addSprite(n, dir > 0 ? IMG.chevR : IMG.chevL, dir > 0 ? -1.25 : 1.25, SIZE.chev)
      continue
    }
    if (n % 45 === 0) addSprite(n, IMG.boards[Math.floor(rnd() * IMG.boards.length)], rnd() < 0.5 ? -1.4 : 1.4, SIZE.board)
    else if (n % 11 === 0) addSprite(n, IMG.palms[Math.floor(rnd() * 3)], (rnd() < 0.5 ? -1 : 1) * (1.3 + rnd() * 1.6), SIZE.palm)
    else if (n % 7 === 0 && rnd() < 0.6) addSprite(n, IMG.bush, (rnd() < 0.5 ? -1 : 1) * (1.4 + rnd() * 2.5), SIZE.bush)
    void s
  }
}
const segAt = (z: number) => segs[Math.floor(((z % trackLen) + trackLen) % trackLen / SEG) % segs.length]

// ---------------------------------------------------------------- state
type Mode = 'title' | 'grid' | 'qualify' | 'race' | 'crash' | 'qresult' | 'finish' | 'over'
interface Save { bestLap: number; scores: { score: number; pos: number; date: string }[]; autoGas: boolean }
function load(): Save {
  try { const s = JSON.parse(localStorage.getItem('apex82') || 'null'); if (s) return { bestLap: s.bestLap || 0, scores: s.scores || [], autoGas: s.autoGas !== false } } catch (e) { /* */ }
  return { bestLap: 0, scores: [], autoGas: true }
}
const save = load()
function persist() { try { localStorage.setItem('apex82', JSON.stringify(save)) } catch (e) { /* */ } }

let mode: Mode = 'title'
let afterCrash: Mode = 'race'
let paused = false
let position = 0 // camera z
let playerX = 0
let speed = 0
let gear: 'LO' | 'HI' = 'LO'
let steer = 0
let lastSteer = 0
let skyOffset = 0
let hillOffset = 0
let timeLeft = 0
let lapTime = 0
let lapStart = 0
let raceTime = 0
let lap = 0
let lastLap = 0
let qualTime = 0
let gridPos = 8
let score = 0
let distance = 0
let place = 8
let crashT = 0
let msg = ''
let msgT = 0
let modeT = 0
let shiftFlash = 0
let bogT = 0
const cars: Car[] = []
const input = { left: false, right: false, gas: false, brake: false }

function parTime() { return trackLen / (MAX * 0.84) } // a good lap
function flash(m: string, t = 2) { msg = m; msgT = t }

function resetCars(forRace: boolean) {
  cars.length = 0
  segs.forEach((s) => (s.cars.length = 0))
  for (let i = 0; i < CARS; i++) {
    let z: number, offset: number
    if (forRace) {
      // grid: two by two, player in gridPos
      const slot = i < gridPos - 1 ? i : i + 1
      z = PLAYER_Z + 7 * SEG + (7 - slot) * 3 * SEG
      offset = slot % 2 ? 0.45 : -0.45
    } else {
      z = PLAYER_Z + (20 + i * 300) * SEG % trackLen
      offset = (i % 3 - 1) * 0.55
    }
    const skill = forRace ? 0.78 + 0.13 * (1 - i / CARS) : 0.5 + (i % 3) * 0.08
    const car: Car = { z: z % trackLen, offset, speed: 0, img: IMG.rivals[i], target: offset, lap: 0, seg: null, id: i }
    ;(car as Car & { skill: number }).skill = skill
    if (!forRace) car.speed = MAX * skill
    cars.push(car)
    placeCar(car)
  }
}
function placeCar(c: Car) {
  const s = segAt(c.z)
  if (c.seg === s) return
  if (c.seg) { const k = c.seg.cars.indexOf(c); if (k >= 0) c.seg.cars.splice(k, 1) }
  s.cars.push(c)
  c.seg = s
}

function startQualify() {
  mode = 'qualify'; modeT = 0
  position = 0; playerX = 0; speed = 0; gear = 'LO'; steer = 0
  lap = 0; lapStart = 0; lapTime = 0; raceTime = 0; score = 0; distance = 0
  timeLeft = Math.round(parTime() * 1.35)
  resetCars(false)
  flash('QUALIFYING LAP', 2.5)
}
function startRace() {
  mode = 'grid'; modeT = 0
  // player sits in their own grid slot, same spacing as the rivals
  position = 7 * SEG + (7 - (gridPos - 1)) * 3 * SEG
  playerX = gridPos % 2 ? -0.45 : 0.45; speed = 0; gear = 'LO'; steer = 0
  lap = 0; lapTime = 0; raceTime = 0; distance = 0
  timeLeft = Math.round(parTime() * 1.3)
  resetCars(true)
}

// ---------------------------------------------------------------- update
const overlap = (x1: number, w1: number, x2: number, w2: number, k = 1) => {
  const h = k / 2
  return !(x1 + w1 * h < x2 - w2 * h || x1 - w1 * h > x2 + w2 * h)
}

let crashes = 0
function crash() {
  crashes++
  mode = 'crash'; crashT = 0
  speed = 0
  flash('CRASH!', 1.6)
}

function update(dt: number) {
  modeT += dt
  if (msgT > 0) msgT -= dt
  if (shiftFlash > 0) shiftFlash -= dt
  if (mode === 'title' || mode === 'over') { attract(dt); return }
  if (mode === 'qresult') { if (modeT > 3.5) startRace(); return }
  if (mode === 'finish') {
    speed = Math.max(0, speed - MAX * 0.25 * dt)
    position = (position + speed * dt) % trackLen
    playerX += (0 - playerX) * dt
    carsUpdate(dt)
    return
  }
  if (mode === 'grid') {
    carsUpdate(0)
    if (modeT > 3.2) { mode = 'race'; modeT = 0; lapStart = 0; cars.forEach((c) => (c.speed = 0)) }
    return
  }
  if (mode === 'crash') {
    crashT += dt
    if (crashT > 1.6) { mode = afterCrash; playerX = 0; steer = 0; speed = 0; gear = 'LO' }
    tickTime(dt)
    carsUpdate(dt)
    return
  }
  afterCrash = mode
  const pseg = segAt(position + PLAYER_Z)
  const pct = speed / MAX
  const dx = dt * 2 * pct

  // steering: each dial click moves the wheel; it eases back to centre
  if (input.left) steer = Math.max(-1, steer - dt * 3)
  else if (input.right) steer = Math.min(1, steer + dt * 3)
  else if (Date.now() - lastSteer > 140) steer = steer > 0 ? Math.max(0, steer - dt * 1.6) : Math.min(0, steer + dt * 1.6)
  playerX += steer * dx * 1.15
  playerX -= dx * pct * pseg.curve * CENTRIFUGAL

  // engine / gears
  const gas = (save.autoGas || input.gas) && !input.brake
  bogT = 0
  if (input.brake) speed -= MAX * 0.75 * dt
  else if (gas) {
    if (gear === 'LO') {
      if (speed < LO_MAX) speed += MAX * 0.2 * dt
      else speed -= MAX * 0.12 * dt // limiter
    } else {
      const low = speed < MAX * 0.42
      if (low) bogT = 1
      speed += MAX * (low ? 0.03 : 0.085) * dt
    }
  } else speed -= MAX * 0.18 * dt

  // off road
  if (Math.abs(playerX) > 1) {
    if (speed > OFF_ROAD_MAX) speed -= MAX * 0.9 * dt
    for (const s of pseg.sprites) {
      if (!s.solid) continue
      const sw = s.w / ROAD_W
      const sx = s.offset + (s.offset > 0 ? 1 : -1) * sw / 2
      if (overlap(playerX, CAR_W, sx, sw * 0.7)) {
        if (speed > MAX * 0.25) { crash(); return }
        speed = 0; playerX = playerX > 0 ? Math.min(playerX, sx - sw * 0.4) : Math.max(playerX, sx + sw * 0.4)
      }
    }
  }
  // traffic
  for (let k = 0; k < 2; k++) {
    const s = segs[(pseg.i + k) % segs.length]
    for (const c of s.cars) {
      if (speed > c.speed && overlap(playerX, CAR_W, c.offset, CAR_W, 0.85)) {
        if (speed - c.speed > MAX * 0.22) { crash(); return }
        speed = c.speed * 0.85
        position = (c.z - PLAYER_Z - SEG * 0.6 + trackLen) % trackLen
      }
    }
  }
  playerX = Math.max(-3, Math.min(3, playerX))
  speed = Math.max(0, Math.min(MAX, speed))

  const before = position
  position = (position + speed * dt) % trackLen
  distance += speed * dt
  score += speed * dt * 0.01 * (mode === 'race' ? 1 : 0)
  skyOffset += 0.0006 * pseg.curve * pct
  hillOffset += 0.0018 * pseg.curve * pct

  // laps (counted before the standings are worked out, so crossing the line doesn't briefly drop you to last)
  if (position >= before) carsUpdate(dt)
  else {
    const t = lapTime
    if (mode === 'qualify') {
      qualTime = t
      if (!save.bestLap || t < save.bestLap) save.bestLap = t
      const r = t / parTime()
      gridPos = r < 0.97 ? 1 : r < 1.0 ? 2 : r < 1.03 ? 3 : r < 1.06 ? 4 : r < 1.1 ? 5 : r < 1.15 ? 6 : r < 1.22 ? 7 : 8
      persist()
      mode = 'qresult'; modeT = 0
      return
    }
    lap++
    lastLap = t
    lapTime = 0
    carsUpdate(dt)
    if (!save.bestLap || t < save.bestLap) { save.bestLap = t; persist(); flash('BEST LAP!', 2) }
    if (lap >= LAPS) { finishRace(); return }
    const extend = Math.round(parTime() * 1.05)
    timeLeft += extend
    flash(`LAP ${lap + 1}  +${extend}s`, 2.2)
    lapStart = raceTime
  }
  tickTime(dt)
}

function tickTime(dt: number) {
  if (mode !== 'race' && mode !== 'qualify' && mode !== 'crash') return
  lapTime += dt
  raceTime += dt
  timeLeft -= dt
  if (timeLeft <= 0) {
    timeLeft = 0
    mode = 'over'; modeT = 0
    endGame(false)
  }
}

function carsUpdate(dt: number) {
  const racing = mode === 'race' || (mode === 'crash' && afterCrash === 'race') || mode === 'finish'
  for (const c of cars) {
    const skill = (c as Car & { skill: number }).skill
    const top = MAX * skill
    if (racing || mode === 'qualify' || afterCrash === 'qualify') {
      if (c.speed < top) c.speed = Math.min(top, c.speed + MAX * 0.2 * dt)
    }
    // slow a little in sharp corners
    const s = segAt(c.z)
    const cornering = Math.abs(s.curve) >= C.H ? 0.85 : 1
    const before = c.z
    c.z = (c.z + c.speed * cornering * dt) % trackLen
    if (c.z < before) c.lap++
    // lane changes: avoid the car ahead, occasionally drift
    const ahead = cars.filter((o) => o !== c && ((o.z - c.z + trackLen) % trackLen) < SEG * 12 && Math.abs(o.offset - c.offset) < 0.4 && o.speed < c.speed)
    if (ahead.length) c.target = c.offset > 0 ? c.offset - 0.6 : c.offset + 0.6
    else if (Math.random() < dt * 0.15) c.target = (Math.floor(Math.random() * 3) - 1) * 0.55
    c.target = Math.max(-0.75, Math.min(0.75, c.target))
    c.offset += (c.target - c.offset) * Math.min(1, dt * 1.2)
    placeCar(c)
  }
  // standings: total distance
  if (racing && mode !== 'finish') { // the finishing place is frozen at the line
    const me = lap * trackLen + position + PLAYER_Z
    place = 1 + cars.filter((c) => c.lap * trackLen + c.z > me).length
  }
}

function finishRace() {
  mode = 'finish'; modeT = 0
  const bonus = Math.round(timeLeft * 200) + [0, 5000, 3000, 2000, 1200, 800, 500, 300, 100][place]
  score += bonus
  flash(place === 1 ? 'YOU WIN!' : `FINISHED P${place}`, 4)
  endGame(true)
}

function endGame(finished: boolean) {
  const row = { score: Math.round(score), pos: finished ? place : 0, date: new Date().toISOString().slice(0, 10) }
  save.scores.push(row)
  save.scores.sort((a, b) => b.score - a.score)
  save.scores = save.scores.slice(0, 5)
  persist()
}

// title/game-over background: cruise the track
function attract(dt: number) {
  const pseg = segAt(position + PLAYER_Z)
  speed = MAX * 0.55
  playerX += (0 - playerX) * dt
  position = (position + speed * dt) % trackLen
  skyOffset += 0.0006 * pseg.curve * 0.55
  hillOffset += 0.0018 * pseg.curve * 0.55
  if (cars.length === 0) resetCars(false)
  carsUpdate(dt)
}

// ---------------------------------------------------------------- render
function project(p: P, cx: number, cy: number, cz: number) {
  p.cam.x = p.world.x - cx
  p.cam.y = p.world.y - cy
  p.cam.z = p.world.z - cz
  p.scr.scale = CAM_D / p.cam.z
  p.scr.x = Math.round(W / 2 + p.scr.scale * p.cam.x * W / 2)
  p.scr.y = Math.round(H / 2 - p.scr.scale * p.cam.y * H / 2)
  p.scr.w = Math.round(p.scr.scale * ROAD_W * W / 2)
}

function poly(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, c: string) {
  g.fillStyle = c
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.lineTo(x4, y4); g.closePath(); g.fill()
}

interface Pal { road: string; grass: string; rumble: string; lane: string }
const BASE = {
  light: { road: '#6e6e74', grass: '#3fa23a', rumble: '#f4f4f4', lane: '#e8e8e8' },
  dark: { road: '#646469', grass: '#36932f', rumble: '#d8262a', lane: '' },
}
// distance haze baked into the colours (16 steps), so it costs nothing extra to draw
const HAZE = [255, 170, 140]
function mix(hex: string, f: number) {
  if (!hex) return ''
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v + (HAZE[i] - v) * f))
  return 'rgb(' + c.join(',') + ')'
}
const FOG_STEPS = 16
const COLS: { light: Pal; dark: Pal }[] = []
for (let k = 0; k < FOG_STEPS; k++) {
  const f = (k / (FOG_STEPS - 1)) * 0.62
  const m = (p: Pal): Pal => ({ road: mix(p.road, f), grass: mix(p.grass, f), rumble: mix(p.rumble, f), lane: mix(p.lane, f) })
  COLS.push({ light: m(BASE.light), dark: m(BASE.dark) })
}

function drawSegment(s: Seg) {
  const p1 = s.p1.scr, p2 = s.p2.scr
  const pal = COLS[Math.min(FOG_STEPS - 1, Math.round(Math.min(1, s.fog / 0.62) * (FOG_STEPS - 1)))]
  const c = s.dark ? pal.dark : pal.light
  g.fillStyle = c.grass
  g.fillRect(0, p2.y, W, p1.y - p2.y)
  const r1 = p1.w / Math.max(6, 2 * LANES), r2 = p2.w / Math.max(6, 2 * LANES)
  poly(p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, c.rumble)
  poly(p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, c.rumble)
  if (s.start) {
    // checkered start line
    const n = 10
    for (let k = 0; k < n; k++) {
      const a1 = p1.x - p1.w + (2 * p1.w * k) / n, b1 = p1.x - p1.w + (2 * p1.w * (k + 1)) / n
      const a2 = p2.x - p2.w + (2 * p2.w * k) / n, b2 = p2.x - p2.w + (2 * p2.w * (k + 1)) / n
      poly(a1, p1.y, b1, p1.y, b2, p2.y, a2, p2.y, (k + s.i) % 2 ? '#f2f2f2' : '#1a1a1f')
    }
    return
  }
  poly(p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, c.road)
  if (c.lane) {
    const l1 = p1.w / 32, l2 = p2.w / 32
    const lw1 = (p1.w * 2) / LANES, lw2 = (p2.w * 2) / LANES
    for (let k = 1; k < LANES; k++) {
      const x1 = p1.x - p1.w + lw1 * k, x2 = p2.x - p2.w + lw2 * k
      poly(x1 - l1 / 2, p1.y, x1 + l1 / 2, p1.y, x2 + l2 / 2, p2.y, x2 - l2 / 2, p2.y, c.lane)
    }
  }
}

function drawSprite(img: Art.Img, worldW: number, scale: number, x: number, y: number, ox: number, oy: number, clipY: number) {
  const dw = worldW * scale * W / 2
  const dh = dw * (img.height / img.width)
  if (dw < 1 || dw > W * 4) return
  const dx = x + dw * ox
  const dy = y + dh * oy
  const clipH = clipY ? Math.max(0, dy + dh - clipY) : 0
  if (clipH >= dh) return
  g.drawImage(img, 0, 0, img.width, img.height - (img.height * clipH) / dh, dx, dy, dw, dh - clipH)
}

let SKY: CanvasGradient | null = null
let SUN: HTMLCanvasElement | null = null
function makeSun() {
  const c = document.createElement('canvas')
  c.width = c.height = 140 * RS
  const s = c.getContext('2d')!
  const m = 70 * RS
  const gr = s.createRadialGradient(m, m, 4 * RS, m, m, 70 * RS)
  gr.addColorStop(0, 'rgba(255,240,180,0.9)'); gr.addColorStop(0.3, 'rgba(255,190,100,0.5)'); gr.addColorStop(1, 'rgba(255,120,80,0)')
  s.fillStyle = gr; s.fillRect(0, 0, c.width, c.height)
  s.fillStyle = '#ffe59a'; s.beginPath(); s.arc(m, m, 20 * RS, 0, Math.PI * 2); s.fill()
  s.fillStyle = '#ef6a4c'; for (let b = 0; b < 4; b++) s.fillRect(m - 22 * RS, m + (4 + b * 4) * RS, 44 * RS, (1 + b * 0.5) * RS)
  return c
}
function drawBackground() {
  // sunset sky (gradient and sun are built once and reused)
  if (!SKY) {
    SKY = g.createLinearGradient(0, 0, 0, H * 0.62)
    SKY.addColorStop(0, '#1b1446'); SKY.addColorStop(0.45, '#6b2f7a'); SKY.addColorStop(0.8, '#ef6a4c'); SKY.addColorStop(1, '#ffc36b')
    SUN = makeSun()
  }
  g.fillStyle = SKY; g.fillRect(0, 0, W, H)
  const sx = W * 0.72 - (skyOffset * W) % W, sy = H * 0.42
  for (const off of [0, W, -W]) {
    const x = sx + off - SUN!.width / 2
    if (x > -SUN!.width && x < W) g.drawImage(SUN!, x, sy - SUN!.height / 2)
  }
  // mountains (parallax, tiled)
  const hw = IMG.hills.width, hh = IMG.hills.height
  const hx = -((hillOffset * W) % hw + hw) % hw
  const hy = H * 0.5 - hh * 0.55
  for (let x = hx; x < W; x += hw) g.drawImage(IMG.hills, x, hy)
}

function render() {
  const base = segAt(position)
  const basePct = (position % SEG) / SEG
  const pseg = segAt(position + PLAYER_Z)
  const ppct = ((position + PLAYER_Z) % SEG) / SEG
  const playerY = pseg.p1.world.y + (pseg.p2.world.y - pseg.p1.world.y) * ppct
  let maxy = H
  let x = 0
  let dx = -(base.curve * basePct)

  drawBackground()

  for (let n = 0; n < drawDist; n++) {
    const s = segs[(base.i + n) % segs.length]
    s.looped = s.i < base.i
    s.fog = Math.max(0, (n / drawDist - 0.35) * 0.95)
    s.clip = maxy
    project(s.p1, playerX * ROAD_W - x, playerY + CAM_H, position - (s.looped ? trackLen : 0))
    project(s.p2, playerX * ROAD_W - x - dx, playerY + CAM_H, position - (s.looped ? trackLen : 0))
    x += dx
    dx += s.curve
    if (s.p1.cam.z <= CAM_D || s.p2.scr.y >= s.p1.scr.y || s.p2.scr.y >= maxy) continue
    drawSegment(s)
    maxy = s.p1.scr.y
  }

  for (let n = drawDist - 1; n > 0; n--) {
    const s = segs[(base.i + n) % segs.length]
    for (const c of s.cars) {
      const pct = ((c.z % SEG) + SEG) % SEG / SEG
      const sc = s.p1.scr.scale + (s.p2.scr.scale - s.p1.scr.scale) * pct
      const sx = s.p1.scr.x + (s.p2.scr.x - s.p1.scr.x) * pct + (sc * c.offset * ROAD_W * W) / 2
      const sy = s.p1.scr.y + (s.p2.scr.y - s.p1.scr.y) * pct
      drawSprite(c.img, SIZE.car, sc, sx, sy, -0.5, -1, s.clip)
    }
    for (const sp of s.sprites) {
      const sc = s.p1.scr.scale
      const sx = s.p1.scr.x + (sc * sp.offset * ROAD_W * W) / 2
      drawSprite(sp.img, sp.w, sc, sx, s.p1.scr.y, sp.offset < 0 ? -1 : sp.offset > 0 ? 0 : -0.5, -1, s.clip)
    }
  }

  // player
  if (mode !== 'title' && mode !== 'over' && mode !== 'qresult') {
    const bounce = speed > 0 ? Math.sin(Date.now() / 45) * (speed / MAX) * 1.2 : 0
    const frame = steer < -0.25 ? 0 : steer > 0.25 ? 2 : 1
    const pw = IMG.player[1].width, ph = IMG.player[1].height
    const px = W / 2 - pw / 2, py = H - ph - 6 * RS + bounce * RS
    if (mode === 'crash') {
      const f = Math.min(7, Math.floor((crashT / 1.6) * 8))
      g.drawImage(IMG.boom[f], W / 2 - IMG.boom[f].width / 2, H - IMG.boom[f].height)
    } else g.drawImage(IMG.player[frame], px, py)
    // dust when off road
    if (Math.abs(playerX) > 1 && speed > 0 && mode !== 'crash') {
      g.fillStyle = 'rgba(200,170,120,0.5)'
      for (let k = 0; k < 4; k++) g.fillRect(px + ((k % 2 ? 72 : 4) + Math.random() * 18) * RS, py + (46 + Math.random() * 6) * RS, 6 * RS, 4 * RS)
    }
  }
}

// ---------------------------------------------------------------- HUD (drawn at full resolution for crisp text)
const FONT = (px: number) => `${px}px VT323, "Courier New", monospace`
function txt(s: string, x: number, y: number, px: number, col: string, align: CanvasTextAlign = 'left', shadow = true) {
  sg.font = FONT(px)
  sg.textAlign = align
  if (shadow) { sg.fillStyle = 'rgba(0,0,0,0.65)'; sg.fillText(s, x + 2, y + 2) }
  sg.fillStyle = col
  sg.fillText(s, x, y)
}
const fmt = (t: number) => { const m = Math.floor(t / 60); const s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}` }

function hud() {
  const racing = mode === 'race' || mode === 'qualify' || mode === 'crash' || mode === 'grid' || mode === 'finish'
  if (racing) {
    // top bar
    sg.fillStyle = 'rgba(10,8,30,0.55)'; sg.fillRect(0, 0, SW, 64)
    txt('TIME', SW / 2, 22, 22, '#ffd21f', 'center')
    const tl = Math.ceil(timeLeft)
    txt(String(tl), SW / 2, 58, 44, tl <= 10 && Math.floor(Date.now() / 300) % 2 ? '#ff4d4d' : '#ffffff', 'center')
    const qual = mode === 'qualify' || (mode === 'crash' && afterCrash === 'qualify')
    txt(qual ? 'QUALIFY' : `LAP ${Math.min(lap + 1, LAPS)}/${LAPS}`, 20, 26, 26, '#7cf5ff')
    txt(fmt(lapTime), 20, 54, 28, '#ffffff')
    txt('SCORE', SW - 20, 26, 22, '#ffd21f', 'right')
    txt(String(Math.round(score)), SW - 20, 54, 30, '#ffffff', 'right')
    if (!qual) txt(`P${place}`, SW - 150, 54, 40, place === 1 ? '#ffd21f' : '#ffffff', 'right')
    // speed + gear
    txt(`${Math.round(speed * KMH)}`, 26, SH - 22, 52, '#ffffff')
    txt('KM/H', 120, SH - 26, 22, '#c9c9d6')
    const gx = SW - 112, gy = SH - 72
    sg.fillStyle = 'rgba(10,8,30,0.6)'; sg.fillRect(gx, gy, 92, 56)
    sg.strokeStyle = shiftFlash > 0 ? '#ffd21f' : 'rgba(255,255,255,0.35)'; sg.lineWidth = 2; sg.strokeRect(gx, gy, 92, 56)
    txt('LO', gx + 24, gy + 38, 30, gear === 'LO' ? '#ffd21f' : '#6b6b80', 'center', false)
    txt('HI', gx + 68, gy + 38, 30, gear === 'HI' ? '#ffd21f' : '#6b6b80', 'center', false)
    if (gear === 'LO' && speed > LO_MAX * 0.97 && mode === 'race' || gear === 'LO' && speed > LO_MAX * 0.97 && mode === 'qualify') txt('SHIFT ▲  BACK', gx + 46, gy - 10, 20, Math.floor(Date.now() / 250) % 2 ? '#ffd21f' : '#ffffff', 'center')
    else if (bogT > 0 && gear === 'HI') txt('BOGGING', gx + 46, gy - 10, 20, '#ff9a4d', 'center')
    if (!save.autoGas) txt('4 / HOLD DIAL = GAS', SW / 2, SH - 14, 20, 'rgba(255,255,255,0.6)', 'center', false)
  }
  if (mode === 'grid') {
    const n = Math.max(0, 3 - Math.floor(modeT))
    const lights = ['#ff2d2d', '#ff2d2d', '#ff2d2d']
    for (let i = 0; i < 3; i++) {
      sg.fillStyle = '#111'; sg.beginPath(); sg.arc(SW / 2 - 60 + i * 60, 150, 22, 0, Math.PI * 2); sg.fill()
      sg.fillStyle = i < 3 - n ? lights[i] : '#3a1010'; sg.beginPath(); sg.arc(SW / 2 - 60 + i * 60, 150, 17, 0, Math.PI * 2); sg.fill()
    }
    txt(`STARTING P${gridPos}`, SW / 2, 220, 34, '#ffffff', 'center')
    if (modeT > 2.4) txt('GO!', SW / 2, 290, 80, '#3bff6b', 'center')
  }
  if (msgT > 0 && mode !== 'grid') txt(msg, SW / 2, 190, 56, msg === 'CRASH!' ? '#ff4d4d' : '#ffd21f', 'center')
  if (mode === 'qresult') {
    panel(160, 120, 480, 240)
    txt('QUALIFYING', SW / 2, 170, 40, '#ffd21f', 'center')
    txt(`LAP TIME  ${fmt(qualTime)}`, SW / 2, 230, 34, '#ffffff', 'center')
    txt(`GRID POSITION  P${gridPos}`, SW / 2, 280, 34, gridPos <= 3 ? '#3bff6b' : '#ffffff', 'center')
    txt('Race starts in a moment…', SW / 2, 330, 24, '#c9c9d6', 'center')
  }
  if (mode === 'finish' && modeT > 2) {
    panel(150, 100, 500, 290)
    txt(place === 1 ? 'VICTORY' : 'RACE OVER', SW / 2, 150, 44, '#ffd21f', 'center')
    txt(`FINISHED  P${place}`, SW / 2, 205, 34, '#ffffff', 'center')
    txt(`RACE TIME  ${fmt(raceTime)}`, SW / 2, 245, 30, '#ffffff', 'center')
    txt(`SCORE  ${Math.round(score)}`, SW / 2, 285, 34, '#7cf5ff', 'center')
    txt('Press dial to continue', SW / 2, 355, 24, '#c9c9d6', 'center')
  }
  if (mode === 'title') titleScreen()
  if (mode === 'over') {
    panel(170, 120, 460, 240)
    txt('TIME UP', SW / 2, 180, 56, '#ff4d4d', 'center')
    txt(`SCORE  ${Math.round(score)}`, SW / 2, 245, 34, '#ffffff', 'center')
    txt('Press dial to continue', SW / 2, 320, 24, '#c9c9d6', 'center')
  }
  if (paused) {
    sg.fillStyle = 'rgba(0,0,0,0.6)'; sg.fillRect(0, 0, SW, SH)
    txt('PAUSED', SW / 2, 200, 64, '#ffffff', 'center')
    txt('Press dial or 2 to resume', SW / 2, 260, 28, '#c9c9d6', 'center')
    txt('Press Back to quit the race', SW / 2, 300, 28, '#c9c9d6', 'center')
  }
}

function panel(x: number, y: number, w: number, h: number) {
  sg.fillStyle = 'rgba(12,10,36,0.82)'; sg.fillRect(x, y, w, h)
  sg.strokeStyle = '#ffd21f'; sg.lineWidth = 3; sg.strokeRect(x + 4, y + 4, w - 8, h - 8)
}

function titleScreen() {
  const t = Date.now() / 1000
  sg.fillStyle = 'rgba(10,8,30,0.45)'; sg.fillRect(0, 0, SW, SH)
  // logo
  sg.save()
  sg.font = 'italic bold 92px Arial, Helvetica, sans-serif'
  sg.textAlign = 'center'
  const lg = sg.createLinearGradient(0, 70, 0, 150)
  lg.addColorStop(0, '#fff6b0'); lg.addColorStop(0.5, '#ffb21f'); lg.addColorStop(1, '#e8202a')
  sg.fillStyle = '#1a0d2e'; sg.fillText('APEX ’82', SW / 2 + 5, 145)
  sg.fillStyle = lg; sg.fillText('APEX ’82', SW / 2, 140)
  sg.restore()
  txt('SUNSET COAST GRAND PRIX', SW / 2, 182, 30, '#7cf5ff', 'center')
  if (Math.floor(t * 2) % 2) txt('PRESS DIAL TO RACE', SW / 2, 250, 40, '#ffffff', 'center')
  txt('DIAL steer · BACK shift LO/HI · 1 brake · 2 pause', SW / 2, 300, 24, '#e6e6f0', 'center')
  txt(`3  GAS: ${save.autoGas ? 'AUTOMATIC' : 'MANUAL (hold 4 or dial)'}`, SW / 2, 332, 24, '#ffd21f', 'center')
  if (save.bestLap) txt(`BEST LAP  ${fmt(save.bestLap)}`, SW / 2, 372, 26, '#ffffff', 'center')
  const top = save.scores[0]
  if (top) txt(`HIGH SCORE  ${top.score}${top.pos ? '  (P' + top.pos + ')' : ''}`, SW / 2, 404, 26, '#ffffff', 'center')
  if (env.hosted) txt('BACK  home', 20, SH - 16, 22, 'rgba(255,255,255,0.6)', 'left', false)
}

// ---------------------------------------------------------------- input
const env = { hosted: /[?&]from=home(&|$)/.test(location.search) }
function goHome() { if (env.hosted) location.href = '../../index.html' }

function press(k: string) {
  if (paused) {
    if (k === 'select' || k === 'b2') paused = false
    else if (k === 'back') { paused = false; mode = 'title'; modeT = 0; cars.length = 0; segs.forEach((s) => (s.cars.length = 0)) }
    return
  }
  switch (mode) {
    case 'title':
      if (k === 'select' || k === 'b4') startQualify()
      else if (k === 'b3') { save.autoGas = !save.autoGas; persist() }
      else if (k === 'back') goHome()
      return
    case 'over':
    case 'finish':
      if ((k === 'select' || k === 'back') && modeT > 1.5) { mode = 'title'; modeT = 0; cars.length = 0; segs.forEach((s) => (s.cars.length = 0)) }
      return
    case 'qresult':
      if (k === 'select' && modeT > 1) startRace()
      return
    default:
      if (k === 'back') { gear = gear === 'LO' ? 'HI' : 'LO'; shiftFlash = 0.3 }
      else if (k === 'b2') paused = true
      else if (k === 'select' || k === 'b4') input.gas = true
      else if (k === 'b1') input.brake = true
  }
}
function release(k: string) {
  if (k === 'select' || k === 'b4') input.gas = false
  if (k === 'b1') input.brake = false
}

const KEYS: { [k: string]: string } = {
  Digit1: 'b1', Digit2: 'b2', Digit3: 'b3', Digit4: 'b4', Numpad1: 'b1', Numpad2: 'b2', Numpad3: 'b3', Numpad4: 'b4',
  Enter: 'select', NumpadEnter: 'select', Space: 'select', Escape: 'back', Backspace: 'back', KeyM: 'back',
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'select', ArrowDown: 'b1',
}
const FALLBACK: { [k: string]: string } = { '1': 'b1', '2': 'b2', '3': 'b3', '4': 'b4', Enter: 'select', Escape: 'back', m: 'back', M: 'back' }
window.addEventListener('keydown', (e) => {
  const k = KEYS[e.code] || FALLBACK[e.key]
  if (!k) return
  e.preventDefault(); e.stopPropagation()
  if (k === 'left') { input.left = true; return }
  if (k === 'right') { input.right = true; return }
  if (e.repeat) return
  press(k)
}, true)
window.addEventListener('keyup', (e) => {
  const k = KEYS[e.code] || FALLBACK[e.key]
  if (!k) return
  e.preventDefault()
  if (k === 'left') input.left = false
  else if (k === 'right') input.right = false
  else release(k)
}, true)
let lastWheel = 0
window.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault()
  const now = Date.now()
  if (now - lastWheel < 16) return
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!d) return
  lastWheel = now
  let dir = d > 0 ? 1 : -1
  try { if (JSON.parse(localStorage.getItem('westward_opts') || '{}').reverseDial) dir = -dir } catch (er) { /* */ }
  steer = Math.max(-1, Math.min(1, steer + dir * 0.24))
  lastSteer = now
}, { capture: true, passive: false } as AddEventListenerOptions)
screen.addEventListener('touchstart', (e) => { e.preventDefault(); press('select') }, { passive: false } as AddEventListenerOptions)
screen.addEventListener('touchend', (e) => { e.preventDefault(); release('select') }, { passive: false } as AddEventListenerOptions)
screen.addEventListener('mousedown', () => press('select'))
screen.addEventListener('mouseup', () => release('select'))
document.addEventListener('contextmenu', (e) => e.preventDefault())

// ---------------------------------------------------------------- loop
let last = performance.now()
let frameMs = 16
let frames = 0
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  frameMs = frameMs * 0.95 + (now - last) * 0.05
  last = now
  // adaptive detail: keep ~40+ fps on the Car Thing by trimming the far road if needed
  if (++frames % 60 === 0) {
    if (frameMs > 24 && drawDist > 140) drawDist -= 40
    else if (frameMs < 18 && drawDist < DRAW) drawDist += 20
  }
  if (!paused) {
    // fixed sub-steps keep the physics stable on a slow device
    let t = dt
    while (t > 0) { const s = Math.min(1 / 60, t); update(s); t -= s }
  }
  render()
  hud()
  requestAnimationFrame(frame)
}

function boot() {
  buildTrack()
  resetCars(false)
  requestAnimationFrame(frame)
}
const FF = (window as unknown as { FontFace?: typeof FontFace }).FontFace
if (FF && document.fonts) {
  const f = new FF('VT323', 'url(FONTURL)')
  f.load().then((ff) => { (document.fonts as unknown as { add(f: FontFace): void }).add(ff); boot() }).catch(boot)
} else boot()

// test hooks
;(window as unknown as { __apex: unknown }).__apex = {
  state: () => ({ mode, position, playerX, speed: Math.round(speed * KMH), gear, lap, place, timeLeft, score: Math.round(score), gridPos, qualTime, lapTime, steer, trackLen, segs: segs.length, frameMs, drawDist }),
  set: (o: { playerX?: number; steer?: number }) => { if (o.playerX !== undefined) playerX = o.playerX; if (o.steer !== undefined) { steer = o.steer; lastSteer = Date.now() + 100000 } },
  curve: () => segAt(position + PLAYER_Z).curve,
  ahead: (n: number) => segAt(position + PLAYER_Z + n * SEG).curve,
  carsNear: () => cars.map((c) => ({ dz: ((c.z - position - PLAYER_Z) % trackLen + trackLen) % trackLen, offset: c.offset, speed: c.speed * KMH })),
  press, release,
  parts: (n: number) => {
    const T: { [k: string]: number } = { bg: 0, road: 0, all: 0, copy: 0, hud: 0 }
    for (let i = 0; i < n; i++) {
      let t = performance.now(); drawBackground(); T.bg += performance.now() - t
      t = performance.now(); render(); T.all += performance.now() - t
      t = performance.now(); hud(); T.hud += performance.now() - t
    }
    Object.keys(T).forEach((k) => (T[k] = Math.round((T[k] / n) * 100) / 100))
    return T
  },
  bench: (n: number) => { const t0 = performance.now(); for (let i = 0; i < n; i++) { render(); hud() } return (performance.now() - t0) / n },
  // fast-forward with a simple autopilot (tests only): steers against the curve, shifts at the limiter
  sim: (seconds: number, opts: { skill?: number; shift?: boolean }) => {
    const skill = opts.skill === undefined ? 1 : opts.skill
    let t = 0
    while (t < seconds && mode !== 'over' && mode !== 'title') {
      if (mode === 'race' || mode === 'qualify') {
        const look = segAt(position + PLAYER_Z + 6 * SEG).curve
        const want = -playerX * 1.4 + look * 0.16 * skill
        steer += (Math.max(-1, Math.min(1, want)) - steer) * 0.25
        lastSteer = Date.now() + 1e9
        if (opts.shift !== false && gear === 'LO' && speed > LO_MAX * 0.95) { gear = 'HI'; shiftFlash = 0.3 }
        if (gear === 'HI' && speed < MAX * 0.3) gear = 'LO'
        // dodge traffic
        for (const c of cars) {
          const dz = ((c.z - position - PLAYER_Z) % trackLen + trackLen) % trackLen
          if (dz < SEG * 8 && Math.abs(c.offset - playerX) < 0.4 && c.speed < speed) steer += (c.offset > playerX ? -0.5 : 0.5)
        }
        steer = Math.max(-1, Math.min(1, steer))
      }
      update(1 / 60); t += 1 / 60
    }
    lastSteer = 0
    return { mode, lap, place, timeLeft: Math.round(timeLeft), qualTime, gridPos, score: Math.round(score), crashes }
  },
}
