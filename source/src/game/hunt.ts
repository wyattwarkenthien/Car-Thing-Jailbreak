import { ANIMALS, AnimalDef, REGION_ANIMALS } from './data'
import { C, G, H, W, frame, landscape, rect, text, drawPerson } from './gfx'
import { GameState, pick, region } from './state'
import { Hints, Inp, Screen, app } from './ui'

interface Animal { def: AnimalDef; x: number; lane: number; dir: number; dead: boolean; deadT: number; fleeing: boolean }

const LANES = [190, 265, 345]
const DURATION = 40

export class HuntScreen implements Screen {
  animals: Animal[] = []
  x = W / 2
  lane = 1
  time = DURATION
  spawnT = 0.6
  meat = 0
  shots = 0
  kills: string[] = []
  flash = 0
  done = false
  scroll = 0
  constructor(public s: GameState, public onDone: (meat: number, shots: number, kills: string[]) => void) {}
  hints(): Hints { return ['High', 'Middle', 'Low', 'Stop'] }
  input(e: Inp) {
    if (this.done) { if (e === 'select' || e === 'back' || e === 'b4') this.finish(); return }
    if (e === 'left') this.x = Math.max(30, this.x - 30)
    else if (e === 'right') this.x = Math.min(W - 30, this.x + 30)
    else if (e === 'b1') this.lane = 0
    else if (e === 'b2') this.lane = 1
    else if (e === 'b3') this.lane = 2
    else if (e === 'select') this.shoot()
    else if (e === 'back' || e === 'b4') this.done = true
  }
  tap(x: number, y: number) {
    if (this.done) return false
    this.x = Math.max(30, Math.min(W - 30, x))
    let best = 0; for (let i = 1; i < 3; i++) if (Math.abs(LANES[i] - y) < Math.abs(LANES[best] - y)) best = i
    this.lane = best; this.shoot(); return true
  }
  shoot() {
    if (this.s.supplies.bullets <= 0) { this.done = true; return }
    this.s.supplies.bullets--; this.shots++; this.flash = 0.12
    let hit: Animal | null = null
    for (const a of this.animals) {
      if (a.dead || a.lane !== this.lane) continue
      const half = a.def.w / 2 + 10
      if (Math.abs(a.x - this.x) <= half) { hit = a; break }
    }
    if (hit) { hit.dead = true; hit.deadT = 0; this.meat += hit.def.meat; this.kills.push(hit.def.name) }
    for (const a of this.animals) if (!a.dead && Math.abs(a.x - this.x) < 220) a.fleeing = true
    if (this.s.supplies.bullets <= 0) this.time = Math.min(this.time, 1.5)
  }
  update(dt: number) {
    if (this.done) return
    this.time -= dt
    this.flash = Math.max(0, this.flash - dt)
    if (this.time <= 0) { this.done = true; return }
    const reg = region(this.s)
    const depletion = Math.max(0.35, 1 - (this.s.hunted[reg] || 0) * 0.12)
    this.spawnT -= dt
    if (this.spawnT <= 0) {
      this.spawnT = (1.1 + Math.random() * 1.8) / depletion
      const pool: AnimalDef[] = []
      for (const id of REGION_ANIMALS[reg]) { const d = ANIMALS[id]; for (let i = 0; i < d.weight; i++) pool.push(d) }
      const def = pick(pool)
      const dir = Math.random() < 0.5 ? 1 : -1
      this.animals.push({ def, x: dir > 0 ? -def.w : W + def.w, lane: Math.floor(Math.random() * 3), dir, dead: false, deadT: 0, fleeing: false })
    }
    for (const a of this.animals) {
      if (a.dead) { a.deadT += dt; continue }
      a.x += a.dir * a.def.speed * (a.fleeing ? 1.7 : 1) * dt
    }
    this.animals = this.animals.filter((a) => (a.dead ? true : a.x > -120 && a.x < W + 120))
  }
  finish() {
    app.pop()
    const reg = region(this.s)
    this.s.hunted[reg] = (this.s.hunted[reg] || 0) + 1
    this.onDone(this.meat, this.shots, this.kills)
  }
  draw(g: G, t: number) {
    landscape(g, region(this.s), 32, 360, this.scroll, 'day')
    // lane guides
    for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, LANES[i] + 18, W, 4) }
    for (const a of this.animals) drawAnimal(g, a, t)
    // hunter
    drawPerson(g, W / 2 - 6, 400, t, '#6a4a2a', 4, false)
    // crosshair
    const cy = LANES[this.lane]
    g.strokeStyle = this.flash > 0 ? '#fff6c0' : '#ffefc8'; g.lineWidth = 3
    g.beginPath(); g.arc(this.x, cy, 22, 0, Math.PI * 2); g.stroke()
    rect(g, this.x - 32, cy - 1, 20, 3, '#ffefc8'); rect(g, this.x + 12, cy - 1, 20, 3, '#ffefc8'); rect(g, this.x - 1, cy - 32, 3, 20, '#ffefc8'); rect(g, this.x - 1, cy + 12, 3, 20, '#ffefc8')
    if (this.flash > 0) { g.fillStyle = 'rgba(255,240,180,0.35)'; g.fillRect(0, 32, W, 360) }
    // HUD
    rect(g, 0, 392, W, 88, C.panel)
    text(g, `Time ${Math.max(0, Math.ceil(this.time))}s`, 20, 428, 30, this.time < 8 ? C.red : C.text)
    text(g, `Bullets ${this.s.supplies.bullets}`, 20, 462, 26, C.dim)
    text(g, `Meat ${this.meat} lbs`, W - 20, 428, 30, C.accent2, 'right')
    text(g, this.kills.length ? `Shot: ${this.kills.slice(-3).join(', ')}` : 'Dial aims • 1/2/3 pick row • Press dial to fire', W - 20, 462, 22, C.dim, 'right')
    if (this.done) {
      g.fillStyle = 'rgba(10,6,3,0.7)'; g.fillRect(0, 32, W, H - 32)
      frame(g, 150, 130, 500, 210)
      text(g, 'Hunt over', W / 2, 180, 38, C.accent2, 'center')
      const carry = Math.min(this.meat, 100)
      text(g, this.meat ? `You shot ${this.meat} lbs of meat.` : 'You came back empty-handed.', W / 2, 228, 28, C.text, 'center')
      if (this.meat > 100) text(g, 'You can only carry 100 lbs back to the wagon.', W / 2, 262, 24, C.dim, 'center')
      else if (this.meat) text(g, `${carry} lbs added to your stores.`, W / 2, 262, 24, C.dim, 'center')
      text(g, 'Press dial to return', W / 2, 316, 22, C.faint, 'center')
    }
  }
}

function drawAnimal(g: G, a: Animal, t: number) {
  const d = a.def; const cy = LANES[a.lane]
  const x = a.x - d.w / 2; const y = cy + 18 - d.h
  g.save()
  if (a.dead) { g.globalAlpha = Math.max(0.25, 1 - a.deadT * 0.4); g.translate(a.x, cy + 18); g.rotate(a.dir > 0 ? 1.4 : -1.4); g.translate(-a.x, -(cy + 18)) }
  const step = Math.floor(t * 10) % 2
  if (d.name === 'goose') {
    g.fillStyle = d.color; g.beginPath(); g.ellipse(a.x, y + d.h * 0.6, d.w / 2, d.h / 3, 0, 0, Math.PI * 2); g.fill()
    rect(g, a.x + a.dir * d.w * 0.35, y, 4, d.h * 0.5, '#2b2b2b'); rect(g, a.x + a.dir * d.w * 0.35 - 2, y - 4, 8, 6, '#2b2b2b')
    g.restore(); return
  }
  // body
  rect(g, x + d.w * 0.12, y + d.h * 0.25, d.w * 0.76, d.h * 0.45, d.color)
  if (d.name === 'buffalo' || d.name === 'bear') rect(g, a.dir > 0 ? x + d.w * 0.5 : x + d.w * 0.12, y + d.h * 0.1, d.w * 0.38, d.h * 0.4, shade(d.color))
  // head
  const hx = a.dir > 0 ? x + d.w * 0.82 : x
  rect(g, hx, y + d.h * 0.15, d.w * 0.18, d.h * 0.3, shade(d.color))
  if (d.name === 'deer' || d.name === 'elk') { rect(g, hx + d.w * 0.05, y - d.h * 0.15, 3, d.h * 0.32, '#e8dcc0'); rect(g, hx + d.w * 0.12, y - d.h * 0.1, 3, d.h * 0.26, '#e8dcc0') }
  if (d.name === 'rabbit') rect(g, hx + 2, y - 2, 3, d.h * 0.4, d.color)
  if (d.name === 'pronghorn') rect(g, hx + 4, y + 2, 3, d.h * 0.2, '#2b1d10')
  // legs
  const lh = d.h * 0.3; const lw = Math.max(3, d.w * 0.07)
  const off = step && !a.dead ? lw : 0
  rect(g, x + d.w * 0.18 + off, y + d.h * 0.7, lw, lh, shade(d.color)); rect(g, x + d.w * 0.32 - off, y + d.h * 0.7, lw, lh, shade(d.color))
  rect(g, x + d.w * 0.66 + off, y + d.h * 0.7, lw, lh, shade(d.color)); rect(g, x + d.w * 0.78 - off, y + d.h * 0.7, lw, lh, shade(d.color))
  g.restore()
}
function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, ((n >> 16) & 255) - 40), gg = Math.max(0, ((n >> 8) & 255) - 40), b = Math.max(0, (n & 255) - 40)
  return `rgb(${r},${gg},${b})`
}
