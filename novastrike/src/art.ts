// Nova Strike art: every sprite is drawn in code as pixel art.
export type Img = HTMLCanvasElement
const canvas = (w: number, h: number): [Img, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  return [c, c.getContext('2d')!]
}
export class Paint {
  px: (string | null)[]
  constructor(public w: number, public h: number) { this.px = new Array(w * h).fill(null) }
  set(x: number, y: number, c: string) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c }
  get(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : null }
  ell(cx: number, cy: number, rx: number, ry: number, c: string, clip?: (x: number, y: number) => boolean) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
      if (dx * dx + dy * dy <= 1 && (!clip || clip(x, y))) this.set(x, y, c)
    }
    return this
  }
  rect(x: number, y: number, w: number, h: number, c: string) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); return this }
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1
    for (let i = 0; i <= n; i++) this.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c)
    return this
  }
  outline(c: string) {
    const add: number[] = []
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(y * this.w + x)
    }
    add.forEach((i) => (this.px[i] = c))
    return this
  }
  img(): Img {
    const [cv, g] = canvas(this.w, this.h)
    for (let i = 0; i < this.px.length; i++) { const c = this.px[i]; if (c) { g.fillStyle = c; g.fillRect(i % this.w, Math.floor(i / this.w), 1, 1) } }
    return cv
  }
}

const mirror = (p: Paint) => { for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w / 2; x++) { const c = p.get(x, y); if (c) p.set(p.w - 1 - x, y, c) } return p }

// the player's ship (15x16): white hull, blue canopy, red wingtips
export function ship(thrust: number): Img {
  const p = new Paint(15, 16)
  p.rect(7, 0, 1, 3, '#e8eef8')
  p.rect(6, 3, 2, 6, '#e8eef8'); p.rect(6, 5, 2, 3, '#4ab0ff')
  p.rect(4, 8, 4, 4, '#c8d0e0'); p.rect(2, 10, 6, 2, '#c8d0e0'); p.rect(0, 11, 2, 3, '#ff4a5a')
  p.rect(5, 12, 3, 2, '#8a94a8')
  if (thrust) p.rect(6, 14, 2, 1 + thrust, thrust > 1 ? '#ffe070' : '#ff9a30')
  mirror(p)
  p.outline('#10142a')
  return p.img()
}
export function lifeIcon(): Img {
  const p = new Paint(9, 9)
  p.rect(4, 0, 1, 3, '#e8eef8'); p.rect(3, 3, 3, 3, '#e8eef8'); p.rect(1, 5, 7, 2, '#c8d0e0'); p.rect(0, 6, 1, 2, '#ff4a5a'); p.rect(8, 6, 1, 2, '#ff4a5a')
  return p.img()
}
// enemies (13 wide), two animation frames each
export function darter(f: number): Img {
  const p = new Paint(13, 12)
  p.ell(6.5, 5, 3, 3.5, '#ffd84a'); p.rect(5, 3, 3, 2, '#2a1a40')
  if (f) { p.line(3, 4, 0, 1, '#9aff6a'); p.line(3, 6, 0, 9, '#9aff6a') } else { p.line(3, 5, 0, 3, '#9aff6a'); p.line(3, 6, 0, 7, '#9aff6a') }
  p.rect(6, 8, 1, 3, '#ffd84a')
  mirror(p); p.outline('#1a1030')
  return p.img()
}
export function stinger(f: number): Img {
  const p = new Paint(13, 12)
  p.rect(5, 1, 3, 8, '#ff4a6a'); p.rect(6, 9, 1, 2, '#ffb0c0')
  p.rect(2, 3, 3, 4, '#c8203a'); p.rect(0, f ? 2 : 4, 2, 4, '#ff7a8a')
  p.rect(6, 3, 1, 2, '#fff')
  mirror(p); p.outline('#1a1030')
  return p.img()
}
export function warden(f: number, hurt: boolean): Img {
  const p = new Paint(15, 13)
  const body = hurt ? '#4ad8c8' : '#a85aff', dark = hurt ? '#1a8a7a' : '#5a2aaa'
  p.ell(7.5, 6, 5.5, 4.5, body)
  p.rect(5, 4, 5, 2, '#ffe070'); p.rect(6, 4, 1, 1, '#2a1a40')
  p.rect(1, f ? 3 : 5, 2, 6, dark); p.rect(0, 8, 2, 4, body)
  p.rect(6, 10, 3, 2, dark)
  mirror(p); p.outline('#120a20')
  return p.img()
}
export function boss(f: number, flash: boolean): Img {
  const p = new Paint(64, 34)
  const hull = flash ? '#ffffff' : '#5a4a8a', hi = flash ? '#ffffff' : '#8a7ac8', dk = flash ? '#ffffff' : '#2e2450'
  p.ell(32, 14, 22, 11, hull)
  p.ell(32, 10, 14, 6, hi)
  p.rect(10, 16, 44, 6, dk)
  p.rect(2, 12, 12, 8, hull); p.rect(0, 18, 6, 10, dk)
  p.rect(26, 22, 12, 6, hull); p.rect(29, 28, 6, 4, '#ff5a3a')
  p.ell(32, 11, 4, 3, f ? '#ff3a6a' : '#ffd040')
  for (const x of [16, 24, 40, 48]) p.rect(x, 22, 2, 5, '#3ad8ff')
  mirror(p); p.outline('#0a0618')
  return p.img()
}
export function bullet(friendly: boolean): Img {
  const p = new Paint(3, friendly ? 7 : 5)
  if (friendly) { p.rect(1, 0, 1, 7, '#ffffff'); p.rect(0, 2, 3, 3, '#7ae8ff') }
  else { p.rect(0, 0, 3, 5, '#ff6a3a'); p.rect(1, 1, 1, 3, '#fff0a0') }
  return p.img()
}
export function power(kind: string): Img {
  const p = new Paint(12, 12)
  const col = kind === 'double' ? '#3ad8ff' : kind === 'shield' ? '#9aff6a' : '#ffd040'
  p.ell(6, 6, 5.5, 5.5, col); p.ell(6, 6, 4, 4, '#10142a')
  const L = kind === 'double' ? 'D' : kind === 'shield' ? 'S' : 'R'
  const glyph: { [k: string]: string[] } = { D: ['110', '101', '101', '110'], S: ['111', '110', '011', '111'], R: ['110', '101', '110', '101'] }
  glyph[L].forEach((row, j) => { for (let i = 0; i < 3; i++) if (row[i] === '1') p.set(5 + i - 1 + (i > 0 ? 0 : 0), 4 + j, col) })
  return p.img()
}
export function boom(k: number): Img { // k = 0..1
  const p = new Paint(16, 16)
  const r = 2 + k * 6
  p.ell(8, 8, r, r, k < 0.5 ? '#fff0a0' : '#ff8a30')
  if (k > 0.3) p.ell(8, 8, r * 0.6, r * 0.6, k < 0.7 ? '#ff8a30' : '#7a2a1a')
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + k; p.set(8 + Math.cos(a) * (r + 2), 8 + Math.sin(a) * (r + 2), '#ffd040') }
  return p.img()
}
export function stars(w: number, h: number, n: number, seed: number, cols: string[]): Img {
  const [c, g] = canvas(w, h)
  let s = seed
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1) }
  return c
}
export function nebula(w: number, h: number): Img {
  const [c, g] = canvas(w, h)
  const gr = g.createLinearGradient(0, 0, 0, h)
  gr.addColorStop(0, '#05030f'); gr.addColorStop(1, '#0c0620')
  g.fillStyle = gr; g.fillRect(0, 0, w, h)
  const blob = (x: number, y: number, rr: number, col: string) => { const q = g.createRadialGradient(x, y, 0, x, y, rr); q.addColorStop(0, col); q.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = q; g.fillRect(x - rr, y - rr, rr * 2, rr * 2) }
  blob(90, 70, 90, 'rgba(90,40,140,0.35)'); blob(320, 170, 110, 'rgba(30,70,140,0.3)'); blob(250, 40, 60, 'rgba(140,40,90,0.22)')
  return c
}
