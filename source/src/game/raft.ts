import { C, G, H, W, frame, rect, text, tree, bar } from './gfx'
import { GameState, chance, living, pick } from './state'
import { Hints, Inp, Screen, app } from './ui'
import type { Msg } from './sim'

interface Obstacle { x: number; y: number; r: number; kind: 'rock' | 'whirl' | 'log'; hit: boolean }

const LEN = 6200 // pixels of river
export class RaftScreen implements Screen {
  x = W / 2
  vx = 0
  y = 0
  speed = 150
  obs: Obstacle[] = []
  nextObs = 300
  hits = 0
  shake = 0
  msgs: Msg[] = []
  done = false
  constructor(public s: GameState, public onDone: (msgs: Msg[]) => void) {}
  hints(): Hints { return ['Hard left', 'Slow', 'Fast', 'Hard right'] }
  bankL(y: number) { return 90 + Math.sin(y / 260) * 50 + Math.sin(y / 97) * 18 }
  bankR(y: number) { return W - 90 - Math.sin(y / 300 + 1) * 50 - Math.sin(y / 83) * 18 }
  input(e: Inp) {
    if (this.done) { if (e === 'select' || e === 'back') { app.pop(); this.onDone(this.msgs) } return }
    if (e === 'left') this.vx -= 70
    else if (e === 'right') this.vx += 70
    else if (e === 'b1') this.vx -= 240
    else if (e === 'b4') this.vx += 240
    else if (e === 'b2') this.speed = 110
    else if (e === 'b3') this.speed = 220
  }
  tap(x: number) { this.vx += x < W / 2 ? -120 : 120; return true }
  update(dt: number) {
    if (this.done) return
    this.y += this.speed * dt
    this.x += this.vx * dt
    this.vx *= Math.pow(0.08, dt)
    this.shake = Math.max(0, this.shake - dt)
    while (this.nextObs < this.y + H) {
      const yy = this.nextObs + 600
      const l = this.bankL(yy) + 30, r = this.bankR(yy) - 30
      const kind = chance(0.7) ? 'rock' : chance(0.6) ? 'whirl' : 'log'
      this.obs.push({ x: l + Math.random() * (r - l), y: yy, r: kind === 'rock' ? 20 + Math.random() * 16 : kind === 'whirl' ? 30 : 18, kind, hit: false })
      this.nextObs += 70 + Math.random() * 110 - Math.min(50, this.y / 200)
    }
    const raftY = this.y + 120 // world y at raft
    const l = this.bankL(raftY), r = this.bankR(raftY)
    if (this.x < l + 24) { this.x = l + 24; this.vx = 80; this.bump('bank') }
    if (this.x > r - 24) { this.x = r - 24; this.vx = -80; this.bump('bank') }
    for (const o of this.obs) {
      if (o.hit) continue
      const dy = o.y - raftY
      if (Math.abs(dy) < o.r + 18 && Math.abs(o.x - this.x) < o.r + 24) { o.hit = true; this.bump(o.kind) }
    }
    this.obs = this.obs.filter((o) => o.y > this.y - 200)
    if (this.y >= LEN) this.done = true
  }
  bump(kind: string) {
    if (this.shake > 0.6) return
    this.shake = 1
    if (kind === 'bank') { this.speed = Math.max(90, this.speed - 30); return }
    this.hits++
    const s = this.s
    if (kind === 'whirl') { this.vx += (Math.random() - 0.5) * 300; const f = Math.floor(s.supplies.food * 0.08); s.supplies.food -= f; if (f) this.msgs.push({ title: 'Whirlpool', text: `A whirlpool spun the raft and ${f} lbs of food went overboard.`, tone: 'bad' }); return }
    const items: ['food' | 'clothing' | 'bullets', string][] = [['food', 'lbs of food'], ['clothing', 'sets of clothing'], ['bullets', 'bullets']]
    const [it, label] = pick(items)
    const n = Math.floor(s.supplies[it] * (0.15 + Math.random() * 0.2))
    s.supplies[it] -= n
    let txt = `The raft slammed into a ${kind === 'log' ? 'floating log' : 'rock'}.${n ? ` ${n} ${label} were lost.` : ''}`
    if (this.hits >= 3 && chance(0.3)) {
      const v = pick(living(s))
      if (v) { v.alive = false; v.health = 0; v.cause = 'drowning'; txt += ` ${v.name} was thrown into the rapids and drowned.` }
      if (living(s).length === 0) { s.over = true; s.overReason = 'The Columbia River took your whole party.' }
    }
    this.msgs.push({ title: 'Crash!', text: txt, tone: 'bad' })
  }
  draw(g: G, t: number) {
    const sx = this.shake > 0 ? (Math.random() - 0.5) * 8 * this.shake : 0
    g.save(); g.translate(sx, 0)
    rect(g, -10, 32, W + 20, H - 32, '#3f5e36')
    // water polygon
    g.fillStyle = '#2f5f86'
    g.beginPath()
    for (let sy = 32; sy <= H; sy += 8) { const wy = this.y + (H - sy); g.lineTo(this.bankL(wy), sy) }
    for (let sy = H; sy >= 32; sy -= 8) { const wy = this.y + (H - sy); g.lineTo(this.bankR(wy), sy) }
    g.closePath(); g.fill()
    // streaks
    g.fillStyle = 'rgba(210,230,250,0.35)'
    for (let i = 0; i < 40; i++) { const wy = Math.floor(this.y / 40) * 40 + i * 40 - (i % 7) * 13; const sy = H - (wy - this.y); if (sy < 32 || sy > H) continue; const l = this.bankL(wy), r = this.bankR(wy); const px = l + ((i * 137) % 1000) / 1000 * (r - l); g.fillRect(px, sy, 22, 2) }
    // trees on banks
    for (let i = 0; i < 12; i++) { const wy = Math.floor(this.y / 90) * 90 + i * 90; const sy = H - (wy - this.y); if (sy < 20 || sy > H) continue; tree(g, this.bankL(wy) - 50 - (i % 3) * 14, sy - 26); tree(g, this.bankR(wy) + 20 + (i % 2) * 18, sy - 26) }
    for (const o of this.obs) {
      const sy = H - (o.y - this.y)
      if (sy < 20 || sy > H + 40) continue
      if (o.kind === 'rock') { g.fillStyle = '#6e6a62'; g.beginPath(); g.arc(o.x, sy, o.r, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(235,245,255,0.6)'; g.fillRect(o.x - o.r, sy + o.r * 0.6, o.r * 2, 3) }
      else if (o.kind === 'whirl') { g.strokeStyle = 'rgba(220,235,250,0.7)'; g.lineWidth = 3; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(o.x, sy, o.r - k * 9, t * 4 + k, t * 4 + k + 4); g.stroke() } }
      else { rect(g, o.x - o.r * 2, sy - 6, o.r * 4, 12, '#6a4a2a'); rect(g, o.x - o.r * 2, sy - 6, o.r * 4, 3, '#8a6a3a') }
    }
    // raft
    const ry = H - 120
    rect(g, this.x - 26, ry - 34, 52, 68, '#8a6034')
    for (let i = 0; i < 4; i++) rect(g, this.x - 26 + i * 13, ry - 34, 2, 68, '#5a3a1e')
    rect(g, this.x - 18, ry - 24, 36, 34, '#efe3c6'); rect(g, this.x - 18, ry - 24, 36, 4, '#cdbb98')
    g.restore()
    // HUD
    rect(g, 0, 32, W, 40, 'rgba(20,12,6,0.75)')
    text(g, 'The Columbia River', 16, 60, 26, C.accent2)
    bar(g, 300, 44, 300, 18, this.y / LEN, C.accent)
    text(g, `Crashes ${this.hits}`, W - 16, 60, 24, this.hits ? C.red : C.dim, 'right')
    if (this.y < 400) text(g, 'Turn dial to steer • 1/4 hard turn • 2/3 speed', W / 2, H - 20, 22, '#f4e6c8', 'center')
    if (this.done) {
      g.fillStyle = 'rgba(10,6,3,0.7)'; g.fillRect(0, 32, W, H - 32)
      frame(g, 150, 150, 500, 170)
      text(g, 'Through the gorge!', W / 2, 200, 36, C.accent2, 'center')
      text(g, this.hits === 0 ? 'Not a scratch on the raft.' : `You hit ${this.hits} obstacle${this.hits > 1 ? 's' : ''} on the way down.`, W / 2, 246, 26, C.text, 'center')
      text(g, 'Press dial to continue', W / 2, 296, 22, C.faint, 'center')
    }
  }
}
