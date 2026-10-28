// FOXGLEN: an original side-scrolling platformer for the Car Thing, starring Pip the fox.
// Spin the dial to run (faster spin = faster run), Back or press the dial to jump (hold for higher),
// 1/2 hold to walk left/right, 3 pause, 4 jump. Touch the screen to jump.
import * as Art from './art'
import { LEVELS, Level, ROWS, T, Ent } from './levels'
import { installSleep, isAsleep } from '../../shared/sleep'

const W = 400, H = 240, TS = 16
const cv = document.getElementById('c') as HTMLCanvasElement
const g = cv.getContext('2d')!
g.imageSmoothingEnabled = false
function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H)
  cv.style.width = Math.floor(W * s) + 'px'
  cv.style.height = Math.floor(H * s) + 'px'
}
window.addEventListener('resize', fit); fit()

// ---------------------------------------------------------------- tuning (px and frames at 60 fps)
const WALK = 1.8, RUN = 2.7, GRAV = 0.5, GRAV_HOLD = 0.32, MAXFALL = 7, GLIDE = 1.1
const JUMP = 7.0, JUMP_RUN_BONUS = 0.3, DOUBLE = 6.0, STOMP_BOUNCE = 4.5, STOMP_BOUNCE_HELD = 7.2
const COYOTE = 6, BUFFER = 7
const PW = 10, PH = 14 // hitbox

// ---------------------------------------------------------------- art
const IMG = {
  fox: Art.fox(['#46c774', '#2f9e5a']),
  foxF: Art.fox(['#7fd8ff', '#3a9ad8']), // with the feather
  beetle: [Art.beetle(0), Art.beetle(1)],
  burr: [Art.burr(0), Art.burr(1)],
  bee: [Art.bee(0), Art.bee(1)],
  spider: [Art.spider(0), Art.spider(1)],
  acorn: [0, 1, 2, 3].map((i) => Art.acorn(i)),
  feather: Art.feather(),
  spark: [Art.sparkle(1), Art.sparkle(2), Art.sparkle(3)],
  puff: Art.puff(),
  lantern: [Art.lantern(false), Art.lantern(true)],
  glow: Art.glow(48, 'rgba(255,226,122,0.55)'),
  flag: [Art.flag(false), Art.flag(true)],
  big: Art.bigFox(6),
}
interface Skin { theme: Art.Theme; tiles: Art.Tiles; sky: Art.Img; far: Art.Img; mid: Art.Img; decor: Art.Img[]; log: Art.Img }
const skins: { [id: string]: Skin } = {}
function skin(id: string): Skin {
  if (!skins[id]) {
    const t = Art.THEMES[id]
    skins[id] = { theme: t, tiles: Art.tiles(t), sky: Art.sky(t, W, H), far: Art.layer(t, 0), mid: Art.layer(t, 1), decor: [0, 1, 2].map((k) => Art.decor(t, k)), log: Art.log(48, !!t.snow) }
  }
  return skins[id]
}

// ---------------------------------------------------------------- save
interface Save { unlocked: number; best: number; dial: 'jog' | 'throttle' }
function loadSave(): Save {
  try { const s = JSON.parse(localStorage.getItem('foxglen_save') || '{}'); return { unlocked: s.unlocked || 0, best: s.best || 0, dial: s.dial === 'throttle' ? 'throttle' : 'jog' } } catch (e) { return { unlocked: 0, best: 0, dial: 'jog' } }
}
const save = loadSave()
function persist() { try { localStorage.setItem('foxglen_save', JSON.stringify(save)) } catch (e) { /* */ } }
const reverseDial = () => { try { return !!JSON.parse(localStorage.getItem('westward_opts') || '{}').reverseDial } catch (e) { return false } }

// ---------------------------------------------------------------- world state
interface Actor {
  k: string; x: number; y: number; w: number; h: number; vx: number; vy: number
  alive: boolean; dead: number; t: number; x0: number; y0: number; a: number; on?: boolean; state?: number
  lit?: boolean; dx?: number; dy?: number
}
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; kind: 'spark' | 'puff' | 'acorn' | 'text' | 'snow' | 'bit'; text?: string; col?: string }

let lvl: Level
let lvlIndex = 0
let sk: Skin
let map: Uint8Array
let cols = 0
let levelImg: HTMLCanvasElement
let lg: CanvasRenderingContext2D
let actors: Actor[] = []
let parts: Part[] = []
let camX = 0
let time = 300
let timeAcc = 0
let checkpointX = -1

const P = { x: 0, y: 0, vx: 0, vy: 0, face: 1, ground: false, coyote: 0, buffer: 0, jumpHeld: false, doubleUsed: false, inv: 0, anim: 0, lift: null as Actor | null, gliding: false }
let feather = false
let lives = 3
let score = 0
let acorns = 0
let combo = 0

type Mode = 'title' | 'intro' | 'play' | 'dying' | 'clear' | 'over' | 'win'
let mode: Mode = 'title'
let modeT = 0
let paused = false
let menuSel = 0
let titleSel = 0
let titleLevel = 0
let god = false // test hook only
let godFalls = 0, safeX = 0, safeY = 0

const tileAt = (c: number, r: number) => (c < 0 || c >= cols ? T.S : r < 0 || r >= ROWS ? T.E : map[r * cols + c])
const setTile = (c: number, r: number, t: number) => { if (c >= 0 && c < cols && r >= 0 && r < ROWS) { map[r * cols + c] = t; paintTile(c, r); paintTile(c, r + 1) } }
const solid = (t: number) => t === T.G || t === T.S || t === T.C || t === T.CF || t === T.CU

// ---------------------------------------------------------------- level image (static tiles drawn once)
function buildLevelImage() {
  levelImg = document.createElement('canvas')
  levelImg.width = cols * TS; levelImg.height = H
  lg = levelImg.getContext('2d')!
  for (let c = 0; c < cols; c++) for (let r = 0; r < ROWS; r++) paintTile(c, r)
  // decorations on grass tops
  Art.srand(lvlIndex * 7 + 3)
  for (let c = 0; c < cols; c++) for (let r = 1; r < ROWS; r++) {
    if (tileAt(c, r) === T.G && tileAt(c, r - 1) === T.E && Art.rnd() < 0.22) lg.drawImage(sk.decor[Math.floor(Art.rnd() * 3)], c * TS, (r - 1) * TS)
  }
}
function paintTile(c: number, r: number) {
  if (!lg || c < 0 || c >= cols || r < 0 || r >= ROWS) return
  const t = map[r * cols + c], x = c * TS, y = r * TS
  lg.clearRect(x, y, TS, TS)
  const tl = sk.tiles
  if (t === T.G) {
    const above = tileAt(c, r - 1)
    const exposed = r === 0 ? false : !(above === T.G)
    lg.drawImage(exposed ? tl.top : tl.fill[(c * 7 + r * 3) % 2], x, y)
    // shade edges next to open air
    lg.fillStyle = 'rgba(0,0,0,0.22)'
    if (c > 0 && tileAt(c - 1, r) !== T.G) lg.fillRect(x, y + (exposed ? 4 : 0), 2, TS)
    if (c < cols - 1 && tileAt(c + 1, r) !== T.G) lg.fillRect(x + TS - 2, y + (exposed ? 4 : 0), 2, TS)
    if (sk.theme.dark && r < 3) { lg.drawImage(tl.stone, x, y) }
  } else if (t === T.S) lg.drawImage(tl.stone, x, y)
  else if (t === T.C || t === T.CF) lg.drawImage(tl.crate, x, y)
  else if (t === T.CU) lg.drawImage(tl.used, x, y)
  else if (t === T.P) lg.drawImage(tl.plank, x, y)
  else if (t === T.TH) lg.drawImage(tl.thorns, x, y)
}

// ---------------------------------------------------------------- loading a level
function loadLevel(i: number, fromCheckpoint: boolean) {
  lvlIndex = i
  lvl = LEVELS[i]()
  sk = skin(lvl.theme)
  map = lvl.map
  cols = lvl.cols
  actors = []
  parts = []
  lvl.ents.forEach((e) => spawn(e))
  buildLevelImage()
  const startX = fromCheckpoint && checkpointX >= 0 ? checkpointX : 2 * TS
  if (fromCheckpoint && checkpointX >= 0) actors.forEach((a) => { if (a.k === 'check' && a.x <= checkpointX + 4) a.lit = true })
  P.x = startX; P.vx = 0; P.vy = 0; P.face = 1; P.inv = 0; P.lift = null; P.doubleUsed = false; P.jumpHeld = false; P.buffer = 0
  // stand on the ground below the start
  const c = Math.floor((P.x + PW / 2) / TS)
  let r = 0
  while (r < ROWS && !solid(tileAt(c, r))) r++
  P.y = r * TS - PH
  P.ground = true
  camX = clampCam(P.x - 150)
  time = lvl.time
  timeAcc = 0
  combo = 0
}

function spawn(e: Ent) {
  const base = { x: e.x * TS, y: e.y * TS, vx: 0, vy: 0, alive: true, dead: 0, t: Math.random() * 10, x0: e.x * TS, y0: e.y * TS, a: (e.a || 0) * TS }
  switch (e.k) {
    case 'beetle': actors.push(Object.assign(base, { k: 'beetle', w: 14, h: 11, y: e.y * TS + 5, vx: -0.55 })); break
    case 'burr': actors.push(Object.assign(base, { k: 'burr', w: 12, h: 12, y: e.y * TS + 4, vx: -0.45 })); break
    case 'bee': actors.push(Object.assign(base, { k: 'bee', w: 12, h: 10, vx: -0.6 })); break
    case 'spider': actors.push(Object.assign(base, { k: 'spider', w: 12, h: 10, state: 0 })); break
    case 'liftH': case 'liftV': actors.push(Object.assign(base, { k: e.k, w: 48, h: 10, dx: 0, dy: 0 })); break
    case 'check': actors.push(Object.assign(base, { k: 'check', w: 16, h: 32, y: e.y * TS - 16, lit: false })); break
    case 'goal': actors.push(Object.assign(base, { k: 'goal', w: 20, h: 72, y: e.y * TS + 16 - 72, lit: false })); break
  }
}

const clampCam = (x: number) => Math.max(0, Math.min(cols * TS - W, x))

// ---------------------------------------------------------------- input state
const input = { left: false, right: false, run: false }
let jogDir = 0
let jogUntil = 0
const jogTicks: number[] = []
let throttle = 0 // -2..2 in throttle mode

function moveDir(): { dir: number; run: boolean } {
  let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  let run = input.run
  if (save.dial === 'throttle') {
    if (!dir && throttle) { dir = throttle > 0 ? 1 : -1; run = Math.abs(throttle) > 1 }
  } else if (!dir && performance.now() < jogUntil) {
    dir = jogDir
    const now = performance.now()
    while (jogTicks.length && now - jogTicks[0] > 400) jogTicks.shift()
    run = run || jogTicks.length >= 5
  }
  return { dir, run }
}

// ---------------------------------------------------------------- physics helpers
function hitTiles(x: number, y: number, w: number, h: number, fn: (c: number, r: number, t: number) => boolean | void) {
  const c0 = Math.floor(x / TS), c1 = Math.floor((x + w - 0.01) / TS)
  const r0 = Math.floor(y / TS), r1 = Math.floor((y + h - 0.01) / TS)
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (fn(c, r, tileAt(c, r))) return true
  return false
}
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

// ---------------------------------------------------------------- player
function updatePlayer() {
  const icy = !!sk.theme.icy
  const { dir, run } = moveDir()
  const target = dir * (run ? RUN : WALK)
  if (dir) {
    const acc = P.ground ? (icy ? 0.07 : 0.16) : 0.1
    const turn = Math.sign(P.vx) !== dir && P.vx !== 0 ? (icy ? 0.08 : 0.2) : 0
    P.vx += Math.max(-acc - turn, Math.min(acc + turn, target - P.vx))
    P.face = dir
  } else {
    const fr = P.ground ? (icy ? 0.035 : 0.18) : 0.05
    P.vx = Math.abs(P.vx) <= fr ? 0 : P.vx - Math.sign(P.vx) * fr
  }

  // jump (buffered, with a little grace after walking off a ledge)
  if (P.ground) { P.coyote = COYOTE; P.doubleUsed = false } else if (P.coyote > 0) P.coyote--
  if (P.buffer > 0) {
    P.buffer--
    if (P.coyote > 0) {
      P.vy = -(JUMP + Math.abs(P.vx) * JUMP_RUN_BONUS)
      P.coyote = 0; P.buffer = 0; P.ground = false; P.lift = null
      dust(P.x + PW / 2, P.y + PH, 3)
    } else if (feather && !P.doubleUsed) {
      P.vy = -DOUBLE; P.doubleUsed = true; P.buffer = 0
      for (let i = 0; i < 5; i++) parts.push({ x: P.x + PW / 2, y: P.y + PH, vx: (Math.random() - 0.5) * 2, vy: Math.random(), life: 0, max: 0.4, kind: 'puff' })
    }
  }
  if (!P.jumpHeld && P.vy < -2.6) P.vy = -2.6
  P.vy += P.jumpHeld && P.vy < 0 ? GRAV_HOLD : GRAV
  P.gliding = feather && P.jumpHeld && P.vy > GLIDE && P.doubleUsed
  if (P.gliding) P.vy = GLIDE
  if (P.vy > MAXFALL) P.vy = MAXFALL

  // ride a lift
  if (P.lift) { P.x += P.lift.dx || 0; P.y += P.lift.dy || 0 }

  // horizontal move + walls
  P.x += P.vx
  if (P.x < camX - 2 && false) P.x = camX
  hitTiles(P.x, P.y, PW, PH, (c, r, t) => {
    if (!solid(t)) return
    if (P.vx > 0 || (P.vx === 0 && P.x + PW / 2 < c * TS + TS / 2)) P.x = c * TS - PW
    else P.x = c * TS + TS
    P.vx = 0
    return true
  })
  if (P.x < 0) { P.x = 0; P.vx = 0 }

  // vertical move
  const prevBottom = P.y + PH
  P.y += P.vy
  const wasGround = P.ground
  P.ground = false
  if (P.vy >= 0) {
    hitTiles(P.x, P.y, PW, PH, (c, r, t) => {
      const top = r * TS
      if (solid(t) || (t === T.P && prevBottom <= top + 0.5)) {
        if (P.y + PH > top && prevBottom <= top + 8) { P.y = top - PH; P.vy = 0; P.ground = true; return true }
      }
    })
    P.lift = null
    for (const a of actors) {
      if ((a.k !== 'liftH' && a.k !== 'liftV') || !a.alive) continue
      if (P.x + PW > a.x + 2 && P.x < a.x + a.w - 2 && P.y + PH >= a.y && prevBottom <= a.y + 6 + Math.max(0, -(a.dy || 0))) {
        P.y = a.y - PH; P.vy = 0; P.ground = true; P.lift = a
      }
    }
  } else {
    hitTiles(P.x, P.y, PW, PH, (c, r, t) => {
      if (!solid(t)) return
      P.y = r * TS + TS; P.vy = 0.5
      bump(c, r)
      return true
    })
  }
  if (P.ground && !P.lift) { safeX = P.x; safeY = P.y }
  if (P.ground && !wasGround) { combo = 0; if (prevBottom < P.y + PH - 0) dust(P.x + PW / 2, P.y + PH, 2) }

  // acorns + thorns
  hitTiles(P.x, P.y, PW, PH, (c, r, t) => {
    if (t === T.A) { setTile(c, r, T.E); getAcorn(c * TS + 8, r * TS + 8) }
    else if (t === T.TH && P.y + PH > r * TS + 6) hurt()
  })

  // fell in a pit
  if (P.y > H + 20) die()

  // animation clock
  P.anim += Math.abs(P.vx) * 0.09 + (P.vx ? 0.02 : 0)
  if (P.inv > 0) P.inv--
}

function bump(c: number, r: number) {
  const t = tileAt(c, r)
  if (t === T.C || t === T.CF) {
    setTile(c, r, T.CU)
    // knock enemies standing on it
    actors.forEach((a) => { if (a.alive && isEnemy(a) && overlap(a, { x: c * TS, y: r * TS - 6, w: TS, h: 6 })) kill(a, true) })
    if (t === T.CF) actors.push({ k: 'feather', x: c * TS + 2, y: r * TS - 4, w: 12, h: 14, vx: 0.6, vy: -2.2, alive: true, dead: 0, t: 0, x0: 0, y0: 0, a: 0 })
    else { parts.push({ x: c * TS + 3, y: r * TS - 12, vx: 0, vy: -3.2, life: 0, max: 0.55, kind: 'acorn' }); acorns++; score += 10; checkLife() }
    score += 50
    for (let i = 0; i < 4; i++) parts.push({ x: c * TS + 8, y: r * TS, vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random(), life: 0, max: 0.4, kind: 'bit', col: '#d08a3c' })
  } else if (t === T.S || t === T.CU) {
    parts.push({ x: c * TS + 8, y: r * TS + 16, vx: 0, vy: 0.3, life: 0, max: 0.25, kind: 'puff' })
  }
}

function getAcorn(x: number, y: number) {
  acorns++; score += 10
  parts.push({ x: x - 3, y: y - 3, vx: 0, vy: -0.4, life: 0, max: 0.35, kind: 'spark' })
  checkLife()
}
function checkLife() {
  if (acorns >= 100) { acorns -= 100; lives++; popText(P.x, P.y - 10, '1UP', '#7cff9a') }
}
function popText(x: number, y: number, text: string, col = '#ffffff') { parts.push({ x, y, vx: 0, vy: -0.6, life: 0, max: 0.9, kind: 'text', text, col }) }
function dust(x: number, y: number, n: number) { for (let i = 0; i < n; i++) parts.push({ x, y: y - 3, vx: (Math.random() - 0.5) * 1.6, vy: -Math.random() * 0.6, life: 0, max: 0.35, kind: 'puff' }) }

function hurt() {
  if (P.inv > 0 || god || mode !== 'play') return
  if (feather) {
    feather = false; P.inv = 100
    for (let i = 0; i < 8; i++) parts.push({ x: P.x + 5, y: P.y + 5, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2, life: 0, max: 0.6, kind: 'puff' })
    return
  }
  die()
}
function die() {
  if (mode !== 'play') return
  if (god) { godFalls++; P.x = safeX; P.y = safeY; P.vy = 0; P.vx = 0; return }
  mode = 'dying'; modeT = 0
  feather = false
  P.vy = -6; P.vx = 0
}

// ---------------------------------------------------------------- actors
const isEnemy = (a: Actor) => a.k === 'beetle' || a.k === 'burr' || a.k === 'bee' || a.k === 'spider'
function kill(a: Actor, flipped: boolean) {
  a.alive = false; a.dead = 0.001
  a.vy = flipped ? -3 : 0
  a.state = flipped ? 2 : 1
  combo++
  const pts = [100, 200, 400, 800, 1000][Math.min(4, combo - 1)]
  score += pts
  popText(a.x + a.w / 2 - 6, a.y - 4, String(pts))
  for (let i = 0; i < 3; i++) parts.push({ x: a.x + a.w / 2, y: a.y, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 1.5, life: 0, max: 0.4, kind: 'spark' })
}

function updateActors() {
  const near = (a: Actor) => a.x + a.w > camX - 48 && a.x < camX + W + 48
  for (const a of actors) {
    a.t += 1 / 60
    if (!a.alive) {
      if (a.dead) { a.dead += 1 / 60; if (a.state === 2) { a.vy += 0.3; a.y += a.vy } }
      continue
    }
    if (a.k === 'liftH' || a.k === 'liftV') {
      const off = (Math.sin(a.t * 0.9) * 0.5 + 0.5) * a.a
      const nx = a.k === 'liftH' ? a.x0 + off : a.x0, ny = a.k === 'liftV' ? a.y0 - off : a.y0
      a.dx = nx - a.x; a.dy = ny - a.y; a.x = nx; a.y = ny
      continue
    }
    if (a.k === 'feather') {
      a.vy = Math.min(a.vy + 0.12, 0.7); a.x += a.vx; a.y += a.vy
      if (hitTiles(a.x, a.y, a.w, a.h, (c, r, t) => solid(t))) { a.x -= a.vx; a.vx = -a.vx }
      if (a.y > H) a.alive = false
      if (overlap(a, { x: P.x, y: P.y, w: PW, h: PH })) {
        a.alive = false
        if (feather) { score += 1000; popText(a.x, a.y, '1000') } else { feather = true; popText(a.x - 8, a.y - 6, 'FEATHER!', '#9be3ff') }
      }
      continue
    }
    if (a.k === 'check') {
      if (!a.lit && P.x + PW > a.x) { a.lit = true; checkpointX = a.x; popText(a.x - 10, a.y - 8, 'CHECKPOINT', '#7cff9a') }
      continue
    }
    if (a.k === 'goal') {
      if (mode === 'play' && P.x + PW > a.x + 6) startClear(a)
      continue
    }
    if (!near(a)) continue
    if (a.k === 'beetle' || a.k === 'burr') {
      a.vy = Math.min(a.vy + GRAV, MAXFALL)
      a.x += a.vx
      const front = a.vx > 0 ? a.x + a.w : a.x
      if (hitTiles(a.x, a.y, a.w, a.h, (c, r, t) => solid(t))) { a.x -= a.vx; a.vx = -a.vx }
      a.y += a.vy
      let landed = false
      hitTiles(a.x, a.y, a.w, a.h, (c, r, t) => { if (solid(t) || t === T.P) { a.y = r * TS - a.h; a.vy = 0; landed = true; return true } })
      // turn around at ledges and thorns
      if (landed) {
        const fc = Math.floor((front + (a.vx > 0 ? 1 : -1)) / TS), fr = Math.floor((a.y + a.h + 2) / TS)
        const below = tileAt(fc, fr), ahead = tileAt(fc, fr - 1)
        if ((!solid(below) && below !== T.P) || ahead === T.TH) a.vx = -a.vx
      }
      if (a.y > H + 20) a.alive = false
    } else if (a.k === 'bee') {
      a.x += a.vx
      if (a.x < a.x0 - a.a - 8 || a.x > a.x0 + a.a + 8) a.vx = -a.vx
      a.y = a.y0 + Math.sin(a.t * 3) * 14
    } else if (a.k === 'spider') {
      // waits on its thread, drops when Pip comes close, then climbs back up
      if (a.state === 0 && Math.abs(P.x - a.x) < 44) a.state = 1
      if (a.state === 1) {
        a.y += 3.2
        const r = Math.floor((a.y + a.h) / TS), c = Math.floor((a.x + a.w / 2) / TS)
        if (solid(tileAt(c, r)) || tileAt(c, r) === T.TH || a.y > H) { a.y = r * TS - a.h; a.state = 3; a.vx = 0 }
      } else if (a.state === 3) { a.vx += 1 / 60; if (a.vx > 1.2) a.state = 4 }
      else if (a.state === 4) { a.y -= 0.8; if (a.y <= a.y0) { a.y = a.y0; a.state = 0 } }
    }
    // contact with Pip
    if (mode === 'play' && overlap(a, { x: P.x, y: P.y, w: PW, h: PH })) {
      const stomp = P.vy > 0 && P.y + PH - P.vy <= a.y + 6 && a.k !== 'burr'
      if (stomp) {
        kill(a, false)
        P.vy = -(P.jumpHeld ? STOMP_BOUNCE_HELD : STOMP_BOUNCE)
        P.doubleUsed = false
      } else hurt()
    }
  }
  actors = actors.filter((a) => a.alive || (a.dead > 0 && a.dead < 1.2))
}

// ---------------------------------------------------------------- particles
function updateParts(dt: number) {
  for (const p of parts) { p.life += dt; p.x += p.vx; p.y += p.vy; if (p.kind === 'acorn' || p.kind === 'bit') p.vy += 0.18 }
  parts = parts.filter((p) => p.life < p.max)
  if (sk && sk.theme.snow && Math.random() < 0.35) parts.push({ x: camX + Math.random() * (W + 60), y: -4, vx: -0.4 - Math.random() * 0.4, vy: 0.5 + Math.random() * 0.6, life: 0, max: 7, kind: 'snow' })
}

// ---------------------------------------------------------------- modes
function startGame(level: number) {
  lives = 3; score = 0; acorns = 0; feather = false; checkpointX = -1
  lvlIndex = level
  mode = 'intro'; modeT = 0
  loadLevel(level, false)
}
let goalActor: Actor | null = null
let bonusLeft = 0
function startClear(a: Actor) {
  mode = 'clear'; modeT = 0; goalActor = a; a.lit = true
  bonusLeft = Math.ceil(time)
  P.vx = 0
}

function step() {
  const dt = 1 / 60
  modeT += dt
  if (mode === 'play') {
    updatePlayer()
    updateActors()
    timeAcc += dt
    if (timeAcc >= 1) { timeAcc -= 1; time--; if (time <= 0) { time = 0; die() } }
  } else if (mode === 'dying') {
    if (modeT > 0.45) { P.vy += 0.35; P.y += P.vy }
    if (modeT > 2.0) {
      lives--
      if (lives < 0) { mode = 'over'; modeT = 0; if (score > save.best) { save.best = score; persist() } }
      else { mode = 'intro'; modeT = 0; loadLevel(lvlIndex, true) }
    }
  } else if (mode === 'clear') {
    // Pip trots past the lantern, then the timer counts into the score
    updateActors()
    if (P.x < (goalActor ? goalActor.x + 44 : P.x)) {
      P.vx = WALK; P.face = 1; P.x += P.vx; P.anim += 0.15
      P.vy += GRAV; P.y += P.vy
      hitTiles(P.x, P.y, PW, PH, (c, r, t) => { if (solid(t)) { P.y = r * TS - PH; P.vy = 0; return true } })
    } else {
      P.vx = 0
      if (modeT > 1.2 && bonusLeft > 0) { const n = Math.min(bonusLeft, 3); bonusLeft -= n; time = Math.max(0, time - n); score += n * 50 }
      if (bonusLeft <= 0 && modeT > 3.2) {
        checkpointX = -1
        if (lvlIndex + 1 >= LEVELS.length) { mode = 'win'; modeT = 0; if (score > save.best) { save.best = score; persist() } }
        else {
          save.unlocked = Math.max(save.unlocked, lvlIndex + 1); persist()
          mode = 'intro'; modeT = 0; loadLevel(lvlIndex + 1, false)
        }
      }
    }
  } else if (mode === 'intro') {
    if (modeT > 2.2) { mode = 'play'; modeT = 0 }
  }
  if (mode !== 'title') {
    const look = P.face * 24
    const target = clampCam(P.x - 170 + look)
    camX += (target - camX) * 0.1
    camX = clampCam(camX)
  }
  updateParts(dt)
}

// ---------------------------------------------------------------- drawing
function txt(s: string, x: number, y: number, size: number, col = '#ffffff', align: CanvasTextAlign = 'left', shadow = true) {
  g.font = `${size}px VT323, monospace`
  g.textAlign = align
  g.textBaseline = 'alphabetic'
  if (shadow) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(s, x + 1, y + 1) }
  g.fillStyle = col
  g.fillText(s, x, y)
}

function drawBackdrop() {
  g.drawImage(sk.sky, 0, 0)
  const par = (img: Art.Img, f: number) => {
    const off = Math.floor(camX * f) % img.width
    g.drawImage(img, -off, 0); g.drawImage(img, img.width - off, 0)
  }
  par(sk.far, 0.2)
  par(sk.mid, 0.45)
  g.drawImage(pitShade, 0, H - 40)
}
const pitShade = (() => {
  const c = document.createElement('canvas'); c.width = W; c.height = 40
  const x = c.getContext('2d')!, gr = x.createLinearGradient(0, 0, 0, 40)
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(10,6,24,0.6)')
  x.fillStyle = gr; x.fillRect(0, 0, W, 40)
  return c
})()

function drawWorld() {
  const cx = Math.round(camX)
  drawBackdrop()
  // static level slice
  g.drawImage(levelImg, cx, 0, W, H, 0, 0, W, H)
  // spinning acorns
  const c0 = Math.floor(cx / TS), c1 = Math.min(cols - 1, c0 + Math.ceil(W / TS) + 1)
  const fr = Math.floor(performance.now() / 160) % 4
  for (let c = c0; c <= c1; c++) for (let r = 0; r < ROWS; r++) {
    if (map[r * cols + c] === T.A) g.drawImage(IMG.acorn[(fr + c) % 4], c * TS - cx + 3, r * TS + 2 + (fr === 1 ? -1 : 0))
  }
  // actors
  for (const a of actors) {
    const x = Math.round(a.x - cx), y = Math.round(a.y)
    if (x < -80 || x > W + 80) continue
    const f = Math.floor(a.t * 6) % 2
    switch (a.k) {
      case 'beetle': case 'burr': {
        const imgs = a.k === 'beetle' ? IMG.beetle : IMG.burr
        if (a.state === 1) { g.drawImage(imgs[0], 0, 0, 16, imgs[0].height, x - 1, y + a.h - 5, 16, 5) }
        else {
          const im = imgs[f]
          if (a.state === 2) { g.save(); g.translate(x + 8, y + 6); g.scale(1, -1); g.drawImage(im, -8, -6); g.restore() }
          else drawFacing(im, x - 1, y + a.h - im.height + 1, a.vx > 0)
        }
        break
      }
      case 'bee': drawFacing(IMG.bee[Math.floor(a.t * 14) % 2], x - 2, y - 2, a.vx > 0); break
      case 'spider': {
        if (a.alive) { g.fillStyle = 'rgba(230,230,255,0.6)'; g.fillRect(x + 6, 0, 1, Math.max(0, y)) }
        if (a.state === 1 && a.dead) { /* */ }
        const im = IMG.spider[f]
        if (!a.alive && a.state === 1) g.drawImage(im, 0, 0, 16, 12, x - 2, y + 6, 16, 5)
        else g.drawImage(im, x - 2, y - 1)
        break
      }
      case 'liftH': case 'liftV': g.drawImage(sk.log, x, y); break
      case 'feather': g.drawImage(IMG.feather, x, y + Math.round(Math.sin(a.t * 6))); break
      case 'check': g.drawImage(IMG.flag[a.lit ? 1 : 0], x, y); break
      case 'goal':
        if (a.lit) g.drawImage(IMG.glow, x + 10 - 48, y + 9 - 48)
        g.drawImage(IMG.lantern[a.lit ? 1 : 0], x, y)
        break
    }
  }
  drawPip(cx)
  // particles
  for (const p of parts) {
    const x = Math.round(p.x - cx), y = Math.round(p.y), k = p.life / p.max
    if (p.kind === 'spark') g.drawImage(IMG.spark[Math.min(2, Math.floor(k * 3))], x, y)
    else if (p.kind === 'puff') { g.globalAlpha = 1 - k; g.drawImage(IMG.puff, x - 4, y - 4); g.globalAlpha = 1 }
    else if (p.kind === 'acorn') g.drawImage(IMG.acorn[Math.floor(k * 8) % 4], x, y)
    else if (p.kind === 'bit') { g.fillStyle = p.col || '#fff'; g.fillRect(x, y, 2, 2) }
    else if (p.kind === 'snow') { g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x, y, 1 + (Math.floor(p.x) % 2), 1 + (Math.floor(p.x) % 2)) }
    else if (p.kind === 'text') { g.globalAlpha = 1 - k * k; txt(p.text || '', x, y, 12, p.col); g.globalAlpha = 1 }
  }
  if (sk.theme.dark) { // soft light around Pip in the caves
    g.fillStyle = 'rgba(8,4,20,0.18)'; g.fillRect(0, 0, W, H)
  }
}
function drawFacing(im: Art.Img, x: number, y: number, right: boolean) {
  if (right) { g.save(); g.translate(x + im.width, y); g.scale(-1, 1); g.drawImage(im, 0, 0); g.restore() }
  else g.drawImage(im, x, y)
}

function drawPip(cx: number) {
  if (P.inv > 0 && Math.floor(P.inv / 4) % 2 === 0 && mode === 'play') return
  const set = feather ? IMG.foxF : IMG.fox
  let fr = 'stand'
  if (mode === 'dying') fr = 'jump'
  else if (!P.ground) fr = 'jump'
  else if (Math.abs(P.vx) > 0.2) fr = ['runA', 'stand', 'runB', 'runC'][Math.floor(P.anim) % 4]
  const im = set[fr][P.face > 0 ? 0 : 1]
  const x = Math.round(P.x - cx - 3), y = Math.round(P.y + PH - 16)
  if (mode === 'dying') { g.save(); g.translate(x + 8, y + 8); g.scale(1, -1); g.drawImage(im, -8, -8); g.restore(); return }
  g.drawImage(im, x, y)
  if (P.gliding) { g.drawImage(IMG.feather, x + (P.face > 0 ? -6 : 10), y - 8) }
}

function drawHud() {
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, 0, W, 17)
  g.drawImage(IMG.fox.stand[0], 4, 0)
  txt('x' + Math.max(0, lives), 21, 13, 16)
  g.drawImage(IMG.acorn[0], 50, 2)
  txt('x' + acorns, 62, 13, 16)
  txt(('0000000' + score).slice(-7), 155, 13, 16, '#ffffff', 'center')
  txt(lvl.id + ' ' + lvl.name.toUpperCase(), 268, 13, 16, '#fff2a0', 'center')
  txt('TIME ' + Math.max(0, Math.ceil(time)), 396, 13, 16, time < 60 && Math.floor(performance.now() / 300) % 2 ? '#ff6a6a' : '#ffffff', 'right')
  if (feather) g.drawImage(IMG.feather, 100, 1)
  if (save.dial === 'throttle' && mode === 'play') {
    const lbl = ['<< RUN', '< WALK', 'STOP', 'WALK >', 'RUN >>'][throttle + 2]
    txt(lbl, W / 2, H - 6, 14, 'rgba(255,255,255,0.75)', 'center')
  }
}

function panel(x: number, y: number, w: number, h: number) {
  g.fillStyle = 'rgba(14,10,30,0.86)'; g.fillRect(x, y, w, h)
  g.fillStyle = '#ffd23a'; g.fillRect(x, y, w, 2); g.fillRect(x, y + h - 2, w, 2)
}

function drawTitle() {
  sk = skin('meadow')
  camX += 0.4
  drawBackdrop()
  g.fillStyle = sk.theme.grass; g.fillRect(0, 206, W, 34)
  g.fillStyle = sk.theme.dirt; g.fillRect(0, 214, W, 26)
  for (let x = -((camX * 1) % 16); x < W; x += 16) g.drawImage(sk.tiles.top, Math.round(x), 206)
  // logo
  txt('FOXGLEN', W / 2 + 2, 62, 64, '#2b1610', 'center', false)
  txt('FOXGLEN', W / 2, 60, 64, '#ff9a3c', 'center', false)
  txt("PIP'S LANTERN QUEST", W / 2, 80, 16, '#ffffff', 'center')
  const bob = Math.round(Math.sin(performance.now() / 300) * 2)
  g.drawImage(IMG.big, 40, 206 - 96 + bob)
  const items = titleItems()
  items.forEach((it, i) => {
    const y = 118 + i * 20
    const sel = i === titleSel
    if (sel) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(W / 2 + 40 - 100, y - 14, 200, 18) }
    txt((sel ? '> ' : '  ') + it, W / 2 + 40, y, 18, sel ? '#fff2a0' : '#ffffff', 'center')
  })
  if (save.best) txt('BEST ' + save.best, W - 8, H - 8, 14, 'rgba(255,255,255,0.8)', 'right')
  txt('DIAL choose  PRESS start', 8, H - 8, 14, 'rgba(255,255,255,0.8)', 'left')
}
function titleItems() {
  const items = ['START']
  if (save.unlocked > 0) items.push('LEVEL  < 1-' + (titleLevel + 1) + ' >')
  items.push('DIAL: ' + (save.dial === 'jog' ? 'SPIN TO RUN' : 'THROTTLE'))
  items.push('HOW TO PLAY')
  if (env.hosted) items.push('HOME')
  return items
}
let showHelp = false
function drawHelp() {
  panel(20, 18, W - 40, H - 36)
  txt('HOW TO PLAY', W / 2, 40, 20, '#ffd23a', 'center')
  const lines = save.dial === 'jog'
    ? ['SPIN THE DIAL   run (spin faster to sprint)', 'BACK or PRESS   jump (hold to jump higher)']
    : ['TURN THE DIAL   set speed: run / walk / stop', 'BACK or PRESS   jump (hold to jump higher)']
  lines.concat([
    'HOLD 1 / 2      walk left / right',
    '4               jump      3   pause',
    '',
    'Stomp beetles, bees and spiders. Never',
    'stomp a spiky burr! Bump crates from below.',
    'A FEATHER lets Pip double jump, glide (hold',
    'jump while falling) and survive one hit.',
    '100 acorns = extra life. Reach the lantern!',
  ]).forEach((l, i) => txt(l, 34, 62 + i * 15, 15, '#ffffff', 'left', false))
}

function drawPause() {
  panel(110, 50, 180, 140)
  txt('PAUSED', W / 2, 74, 22, '#ffd23a', 'center')
  pauseItems().forEach((it, i) => txt((i === menuSel ? '> ' : '  ') + it, W / 2, 100 + i * 20, 17, i === menuSel ? '#fff2a0' : '#ffffff', 'center'))
}
function pauseItems() { return ['RESUME', 'DIAL: ' + (save.dial === 'jog' ? 'SPIN TO RUN' : 'THROTTLE'), 'RESTART LEVEL', 'QUIT TO TITLE'] }

function render() {
  if (mode === 'title') { drawTitle(); if (showHelp) drawHelp(); return }
  drawWorld()
  drawHud()
  if (mode === 'intro') {
    g.fillStyle = 'rgba(10,6,24,' + Math.max(0, Math.min(1, 2.2 - modeT) * 0.85) + ')'; g.fillRect(0, 0, W, H)
    const a = Math.min(1, (2.2 - modeT) * 2)
    g.globalAlpha = Math.max(0, a)
    txt('WORLD ' + lvl.id, W / 2, 100, 22, '#ffd23a', 'center')
    txt(lvl.name.toUpperCase(), W / 2, 128, 32, '#ffffff', 'center')
    g.drawImage(IMG.fox.stand[0], W / 2 - 30, 146)
    txt('x ' + lives, W / 2 - 8, 160, 18, '#ffffff', 'left')
    g.globalAlpha = 1
  } else if (mode === 'clear' && modeT > 0.8) {
    txt('LANTERN LIT!', W / 2, 90, 30, '#ffe27a', 'center')
    txt('TIME BONUS  ' + (Math.ceil(time) * 50), W / 2, 114, 18, '#ffffff', 'center')
  } else if (mode === 'over') {
    g.fillStyle = 'rgba(10,6,24,0.75)'; g.fillRect(0, 0, W, H)
    txt('GAME OVER', W / 2, 110, 40, '#ff6a6a', 'center')
    txt('SCORE ' + score, W / 2, 136, 18, '#ffffff', 'center')
    if (modeT > 1.5) txt('PRESS to continue', W / 2, 170, 16, 'rgba(255,255,255,0.8)', 'center')
  } else if (mode === 'win') {
    g.fillStyle = 'rgba(10,6,24,0.7)'; g.fillRect(0, 0, W, H)
    txt('ALL FOUR LANTERNS LIT!', W / 2, 84, 28, '#ffe27a', 'center')
    txt('Foxglen glows again. Thanks, Pip.', W / 2, 108, 18, '#ffffff', 'center')
    txt('FINAL SCORE ' + score, W / 2, 140, 22, '#ffffff', 'center')
    g.drawImage(IMG.big, W / 2 - 48, 146)
  }
  if (paused) drawPause()
}

// ---------------------------------------------------------------- input
installSleep((asleep) => { if (asleep && mode === 'play') { paused = true; menuSel = 0; input.left = input.right = false } })
const env = { hosted: /[?&]from=home(&|$)/.test(location.search) }
function goHome() { if (env.hosted) location.href = '../../index.html' }

type Key = 'select' | 'back' | 'b1' | 'b2' | 'b3' | 'b4' | 'left' | 'right' | 'run' | 'up' | 'down'
function jumpPress() { P.buffer = BUFFER; P.jumpHeld = true }

function press(k: Key) {
  if (mode === 'title') {
    if (showHelp) { showHelp = false; return }
    const items = titleItems()
    if (k === 'left' || k === 'up') titleSel = (titleSel + items.length - 1) % items.length
    else if (k === 'right' || k === 'down') titleSel = (titleSel + 1) % items.length
    else if (k === 'select' || k === 'b4') {
      const it = items[titleSel]
      if (it === 'START') startGame(0)
      else if (it.indexOf('LEVEL') === 0) startGame(titleLevel)
      else if (it.indexOf('DIAL') === 0) { save.dial = save.dial === 'jog' ? 'throttle' : 'jog'; persist() }
      else if (it === 'HOW TO PLAY') showHelp = true
      else if (it === 'HOME') goHome()
    } else if (k === 'b1' || k === 'b2') { // 1/2 change the level on the LEVEL row
      if (items[titleSel].indexOf('LEVEL') === 0) titleLevel = (titleLevel + (k === 'b2' ? 1 : save.unlocked)) % (save.unlocked + 1)
    } else if (k === 'back') goHome()
    return
  }
  if (paused) {
    const items = pauseItems()
    if (k === 'left' || k === 'up') menuSel = (menuSel + items.length - 1) % items.length
    else if (k === 'right' || k === 'down') menuSel = (menuSel + 1) % items.length
    else if (k === 'b3' || k === 'back') paused = false
    else if (k === 'select' || k === 'b4') {
      if (menuSel === 0) paused = false
      else if (menuSel === 1) { save.dial = save.dial === 'jog' ? 'throttle' : 'jog'; throttle = 0; persist() }
      else if (menuSel === 2) { paused = false; mode = 'intro'; modeT = 0; loadLevel(lvlIndex, true) }
      else { paused = false; mode = 'title'; modeT = 0; titleSel = 0 }
    }
    return
  }
  if (mode === 'over' || mode === 'win') {
    if ((k === 'select' || k === 'back' || k === 'b4') && modeT > 1.5) { mode = 'title'; modeT = 0; titleSel = 0 }
    return
  }
  if (k === 'b3') { if (mode === 'play' || mode === 'intro') { paused = true; menuSel = 0; input.left = input.right = false } return }
  if (k === 'select' || k === 'back' || k === 'b4' || k === 'up') jumpPress()
  else if (k === 'b1' || k === 'left') input.left = true
  else if (k === 'b2' || k === 'right') input.right = true
  else if (k === 'run') input.run = true
  else if (k === 'down' && save.dial === 'throttle') throttle = 0
}
function release(k: Key) {
  if (k === 'select' || k === 'back' || k === 'b4' || k === 'up') P.jumpHeld = false
  else if (k === 'b1' || k === 'left') input.left = false
  else if (k === 'b2' || k === 'right') input.right = false
  else if (k === 'run') input.run = false
}

const KEYS: { [k: string]: Key } = {
  Digit1: 'b1', Digit2: 'b2', Digit3: 'b3', Digit4: 'b4', Numpad1: 'b1', Numpad2: 'b2', Numpad3: 'b3', Numpad4: 'b4',
  Enter: 'select', NumpadEnter: 'select', Space: 'select', KeyZ: 'select', Escape: 'back', Backspace: 'back',
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', ShiftLeft: 'run', ShiftRight: 'run', KeyX: 'run', KeyP: 'b3',
}
const FALLBACK: { [k: string]: Key } = { '1': 'b1', '2': 'b2', '3': 'b3', '4': 'b4', Enter: 'select', Escape: 'back' }
window.addEventListener('keydown', (e) => {
  const k = KEYS[e.code] || FALLBACK[e.key]
  if (!k) return
  e.preventDefault(); e.stopPropagation()
  if (e.repeat) return
  press(k)
}, true)
window.addEventListener('keyup', (e) => {
  const k = KEYS[e.code] || FALLBACK[e.key]
  if (!k) return
  e.preventDefault()
  release(k)
}, true)

let lastWheel = 0
window.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault()
  const now = performance.now()
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!d) return
  let dir = d > 0 ? 1 : -1
  if (reverseDial()) dir = -dir
  if (mode === 'title' || paused || mode === 'over' || mode === 'win') {
    if (now - lastWheel < 40) return
    lastWheel = now
    press(dir > 0 ? 'right' : 'left'); release(dir > 0 ? 'right' : 'left')
    return
  }
  if (save.dial === 'throttle') {
    if (now - lastWheel < 60) return
    lastWheel = now
    throttle = Math.max(-2, Math.min(2, throttle + dir))
    return
  }
  // spin-to-run: every click of the dial keeps Pip moving a moment longer
  if (dir !== jogDir) jogTicks.length = 0
  jogDir = dir
  jogTicks.push(now)
  jogUntil = now + 230
}, { capture: true, passive: false } as AddEventListenerOptions)

cv.addEventListener('touchstart', (e) => { e.preventDefault(); press(mode === 'title' || paused ? 'select' : 'select') }, { passive: false } as AddEventListenerOptions)
cv.addEventListener('touchend', (e) => { e.preventDefault(); release('select') }, { passive: false } as AddEventListenerOptions)
cv.addEventListener('mousedown', () => press('select'))
cv.addEventListener('mouseup', () => release('select'))
document.addEventListener('contextmenu', (e) => e.preventDefault())

// ---------------------------------------------------------------- loop
let last = performance.now()
let acc = 0
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (isAsleep()) { requestAnimationFrame(frame); return }
  if (!paused && !showHelp) {
    acc += dt
    let n = 0
    while (acc >= 1 / 60 && n < 6) { step(); acc -= 1 / 60; n++ }
    if (n >= 6) acc = 0
  }
  render()
  requestAnimationFrame(frame)
}

function boot() {
  sk = skin('meadow')
  requestAnimationFrame((t) => { last = t; frame(t) })
}
const FF = (window as unknown as { FontFace?: typeof FontFace }).FontFace
if (FF && document.fonts) {
  const f = new FF('VT323', 'url(FONTURL)')
  f.load().then((ff) => { (document.fonts as unknown as { add(f: FontFace): void }).add(ff); boot() }).catch(boot)
} else boot()

// test hooks
;(window as unknown as { __fox: unknown }).__fox = {
  state: () => ({ falls: godFalls, mode, lvl: lvlIndex, x: P.x, y: P.y, vx: P.vx, ground: P.ground, lives, score, acorns, feather, time, cols, paused, cam: camX }),
  start: (i: number) => startGame(i),
  god: (v: boolean) => { god = v },
  warp: (x: number) => { P.x = x * TS; P.y = 0; P.vy = 0; camX = clampCam(P.x - 150) },
  play: () => { mode = 'play'; modeT = 0 },
  steps: (n: number) => { for (let i = 0; i < n; i++) step() },
  hold: (k: Key, on: boolean) => (on ? press(k) : release(k)),
  levels: () => LEVELS.map((f) => { const l = f(); return { id: l.id, cols: l.cols, map: Array.prototype.slice.call(l.map), ents: l.ents } }),
}
