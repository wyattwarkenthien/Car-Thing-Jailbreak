// The Legend of Sting: all art is drawn in code as crisp pixel art (no image files).
export type Img = HTMLCanvasElement

const canvas = (w: number, h: number): [Img, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return [c, c.getContext('2d')!]
}
let seed = 1
export const srand = (s: number) => { seed = s }
export const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }

// ---------------------------------------------------------------- pixel painter with automatic outline
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
export function flip(img: Img): Img {
  const [c, g] = canvas(img.width, img.height)
  g.translate(img.width, 0); g.scale(-1, 1); g.drawImage(img, 0, 0)
  return c
}
export function tint(img: Img, col: string): Img { // solid silhouette, for hit flashes
  const [c, g] = canvas(img.width, img.height)
  g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, img.width, img.height)
  return c
}

// ---------------------------------------------------------------- Sting (16x16): curly hair, slate cloak, russet waistcoat, bare feet
const SKIN = '#f2c9a0', HAIR = '#6b3a1a', HAIR2 = '#8a5228', CLOAK = '#4a5f86', CLOAK2 = '#33456a', VEST = '#9a5a2a', CLASP = '#ffd23a', FEET = '#e2b088', OUT = '#1a1018'
export type Dir4 = 'down' | 'up' | 'right' | 'left'
export interface HeroSet { [k: string]: Img[] } // dir -> [walk0, walk1, attack]
export function hero(): HeroSet {
  const make = (d: Dir4, f: number, atk: boolean) => {
    const p = new Paint(16, 16)
    const step = f === 1
    if (d === 'down' || d === 'up') {
      // feet
      p.rect(5, step ? 14 : 15, 2, 1, FEET); p.rect(9, step ? 15 : 14, 2, 1, FEET)
      p.ell(8, 11.2, 5, 4, CLOAK, (x, y) => y >= 8 && y <= 14)
      if (d === 'down') {
        p.rect(7, 9, 3, 4, VEST); p.set(8, 9, CLASP)
        p.ell(8, 6, 4.2, 3.8, SKIN)
        p.ell(8, 3.4, 4.6, 2.6, HAIR)
        p.set(4, 5, HAIR); p.set(12, 5, HAIR); p.set(4, 6, HAIR2); p.set(12, 6, HAIR2)
        p.set(6, 3, HAIR2); p.set(9, 2, HAIR2); p.set(11, 4, HAIR2)
        p.set(6, 6, '#2a1a10'); p.set(9, 6, '#2a1a10'); p.set(7, 8, '#d89a80')
        if (atk) p.rect(8, 12, 2, 3, SKIN)
      } else {
        p.ell(8, 10.5, 5.2, 4, CLOAK2, (x, y) => y >= 9 && y <= 14)
        p.line(8, 9, 8, 14, CLOAK)
        p.ell(8, 5.5, 4.4, 4.2, HAIR)
        p.set(6, 4, HAIR2); p.set(9, 3, HAIR2); p.set(10, 6, HAIR2); p.set(6, 7, HAIR2)
        if (atk) p.rect(8, 2, 2, 3, SKIN)
      }
    } else {
      p.rect(step ? 5 : 6, 15, 2, 1, FEET); p.rect(step ? 9 : 8, 15, 2, 1, FEET)
      p.ell(7, 11, 4.5, 4, CLOAK, (x, y) => y >= 8 && y <= 14)
      p.rect(8, 9, 3, 4, VEST); p.set(10, 9, CLASP)
      p.ell(9, 6, 3.8, 3.8, SKIN)
      p.ell(8, 4, 4.4, 2.8, HAIR)
      p.ell(6, 6.5, 2.2, 2.8, HAIR)
      p.set(7, 3, HAIR2); p.set(10, 2, HAIR2); p.set(5, 6, HAIR2)
      p.set(11, 6, '#2a1a10'); p.set(12, 7, SKIN)
      if (atk) p.rect(11, 10, 3, 2, SKIN)
      else p.rect(9, 11, 2, 2, SKIN)
    }
    p.outline(OUT)
    const im = p.img()
    return d === 'left' ? flip(im) : im
  }
  const out: HeroSet = {}
  ;(['down', 'up', 'right', 'left'] as Dir4[]).forEach((d) => { out[d] = [make(d, 0, false), make(d, 1, false), make(d, 0, true)] })
  return out
}
// the short sword, drawn pointing right (rotated when used)
export function sword(): Img {
  const p = new Paint(14, 7)
  p.rect(0, 3, 3, 1, '#6b3a1a')
  p.rect(3, 1, 1, 5, '#c9a040')
  p.rect(4, 2, 9, 3, '#dfe8f2'); p.rect(4, 2, 9, 1, '#ffffff'); p.set(13, 3, '#dfe8f2')
  p.rect(5, 3, 7, 1, '#8aa8c8')
  p.outline('#22202a')
  return p.img()
}
export function arrow(): Img {
  const p = new Paint(14, 5)
  p.rect(0, 2, 11, 1, '#9a6a3a'); p.rect(11, 1, 2, 3, '#c8d0d8'); p.set(13, 2, '#c8d0d8')
  p.set(0, 1, '#e8e8e8'); p.set(1, 1, '#e8e8e8'); p.set(0, 3, '#e8e8e8'); p.set(1, 3, '#e8e8e8')
  return p.img()
}

// ---------------------------------------------------------------- people
export function npc(kind: string): Img {
  const p = new Paint(16, 16)
  if (kind === 'elder') {
    p.ell(8, 11.5, 5.5, 4.5, '#7a5a3a', (x, y) => y >= 8)
    p.ell(8, 6, 4, 3.8, SKIN)
    p.ell(8, 9, 3.4, 3.4, '#f0f0f0', (x, y) => y >= 7)
    p.ell(8, 3.2, 3.6, 1.6, '#d8d8d8')
    p.set(6, 6, '#2a1a10'); p.set(9, 6, '#2a1a10')
    p.line(14, 3, 14, 15, '#8a5a2a')
  } else if (kind === 'shop') {
    p.ell(8, 11.5, 5.5, 4.5, '#3a7a5a', (x, y) => y >= 8)
    p.rect(5, 10, 6, 4, '#f0e8d0')
    p.ell(8, 6, 4.2, 3.8, SKIN)
    p.ell(8, 3.6, 4.6, 2.4, '#b8742a')
    p.set(6, 6, '#2a1a10'); p.set(9, 6, '#2a1a10'); p.set(8, 8, '#c0705a')
  } else if (kind === 'hermit') {
    p.ell(8, 11.5, 5.5, 4.5, '#5a5a6a', (x, y) => y >= 7)
    p.ell(8, 6.5, 4, 3.6, '#c8a080')
    p.ell(8, 4.5, 5, 3.2, '#5a5a6a', (x, y) => y <= 5)
    p.set(6, 7, '#2a1a10'); p.set(9, 7, '#2a1a10')
    p.line(1, 4, 1, 15, '#6a4a2a')
  } else { // villager
    p.ell(8, 11.5, 5, 4.5, '#b84a4a', (x, y) => y >= 8)
    p.ell(8, 6, 4.2, 3.8, SKIN)
    p.ell(8, 3.6, 4.6, 2.6, '#e8c058')
    p.set(4, 6, '#e8c058'); p.set(12, 6, '#e8c058')
    p.set(6, 6, '#2a1a10'); p.set(9, 6, '#2a1a10')
  }
  p.outline(OUT)
  return p.img()
}

// ---------------------------------------------------------------- enemies
export function goblin(f: number): Img {
  const p = new Paint(16, 16)
  p.rect(5, f ? 14 : 15, 2, 1, '#3a4a2a'); p.rect(9, f ? 15 : 14, 2, 1, '#3a4a2a')
  p.ell(8, 11, 4.5, 3.8, '#6a4a3a', (x, y) => y >= 8)
  p.ell(8, 6.5, 4, 3.6, '#7a9a4a')
  p.line(2, 4, 4, 6, '#7a9a4a'); p.line(14, 4, 12, 6, '#7a9a4a')
  p.set(6, 6, '#ffde40'); p.set(9, 6, '#ffde40')
  p.rect(6, 8, 4, 1, '#3a2a1a'); p.set(7, 9, '#ffffff')
  p.line(13, 9, 13, 13, '#b0b8c0')
  p.outline(OUT)
  return p.img()
}
export function wolf(f: number): Img {
  const p = new Paint(18, 12)
  for (const lx of [4, 7, 12, 15]) p.line(lx, 8, lx + (f ? 1 : -1) * ((lx % 2) ? 1 : -1), 11, '#5a5a62')
  p.ell(9.5, 6.5, 6.5, 3.2, '#8a8a94')
  p.ell(3.5, 4.5, 3, 2.6, '#8a8a94')
  p.line(1, 2, 2, 4, '#8a8a94'); p.line(4, 1, 4, 3, '#8a8a94')
  p.rect(0, 5, 2, 1, '#8a8a94'); p.set(2, 4, '#ff5040')
  p.line(16, 5, 17, f ? 2 : 3, '#8a8a94')
  p.ell(10, 5.2, 4, 1, '#a8a8b2')
  p.outline(OUT)
  return p.img()
}
export function spider(f: number): Img {
  const p = new Paint(16, 14)
  for (let i = 0; i < 4; i++) {
    const y = 4 + i * 2 + (f && i % 2 ? 1 : 0)
    p.line(8, 7, 1, y - 2, '#2a2230'); p.line(1, y - 2, 0, y + 2, '#2a2230')
    p.line(8, 7, 15, y - 2, '#2a2230'); p.line(15, y - 2, 15, y + 2, '#2a2230')
  }
  p.ell(8, 8.5, 4.5, 4, '#3a2a48')
  p.ell(8, 4.5, 2.6, 2.2, '#4a3a5a')
  p.set(7, 4, '#ff3050'); p.set(9, 4, '#ff3050'); p.set(7, 9, '#a07ac0'); p.set(8, 10, '#a07ac0')
  p.outline('#0e0a12')
  return p.img()
}
export function bat(f: number): Img {
  const p = new Paint(16, 10)
  p.ell(8, 5, 2.4, 2.4, '#4a3a5a')
  if (f) { p.line(6, 4, 1, 1, '#4a3a5a'); p.line(1, 1, 3, 6, '#4a3a5a'); p.line(10, 4, 15, 1, '#4a3a5a'); p.line(15, 1, 13, 6, '#4a3a5a') }
  else { p.line(6, 5, 1, 7, '#4a3a5a'); p.line(1, 7, 4, 8, '#4a3a5a'); p.line(10, 5, 15, 7, '#4a3a5a'); p.line(15, 7, 12, 8, '#4a3a5a') }
  p.set(7, 4, '#ffe040'); p.set(9, 4, '#ffe040')
  p.outline('#0e0a12')
  return p.img()
}
export function skeleton(f: number): Img {
  const p = new Paint(16, 16)
  p.rect(6, f ? 14 : 15, 1, 1, '#e8e4d8'); p.rect(9, f ? 15 : 14, 1, 1, '#e8e4d8')
  p.line(6, 10, 6, 14, '#e8e4d8'); p.line(9, 10, 9, 14, '#e8e4d8')
  p.rect(5, 8, 6, 3, '#e8e4d8'); p.line(5, 9, 10, 9, '#9a9488')
  p.line(4, 8, 3, 12, '#e8e4d8'); p.line(11, 8, 12, 12, '#e8e4d8')
  p.ell(8, 4.5, 3.6, 3.6, '#f2eee2')
  p.rect(6, 4, 1, 2, '#1a1418'); p.rect(9, 4, 1, 2, '#1a1418'); p.rect(7, 7, 2, 1, '#9a9488')
  p.outline('#1a1418')
  return p.img()
}
export function imp(f: number): Img {
  const p = new Paint(16, 16)
  p.ell(8, 9, 4.6, 5, '#d8482a')
  p.ell(8, 10, 2.8, 3, '#ffa040')
  p.line(4, 4, 3, 1, '#d8482a'); p.line(12, 4, 13, 1, '#d8482a')
  p.set(6, 7, '#fff0a0'); p.set(9, 7, '#fff0a0')
  p.line(3, 9, 1, f ? 7 : 11, '#d8482a'); p.line(12, 9, 14, f ? 11 : 7, '#d8482a')
  p.outline('#2a0a08')
  return p.img()
}
export function troll(f: number): Img {
  const p = new Paint(32, 32)
  p.rect(8, f ? 27 : 29, 6, 3, '#5a6a4a'); p.rect(18, f ? 29 : 27, 6, 3, '#5a6a4a')
  p.ell(16, 19, 11, 10, '#7a8a5a')
  p.ell(16, 20, 8, 7, '#6a5a3a', (x, y) => y >= 19)
  p.ell(16, 9, 7, 6, '#8a9a6a')
  p.rect(12, 8, 2, 2, '#ffdd30'); p.rect(19, 8, 2, 2, '#ffdd30')
  p.rect(12, 13, 9, 2, '#3a2a1a'); p.set(13, 13, '#fff'); p.set(19, 13, '#fff')
  p.ell(14, 6, 3, 1.4, '#9aaa7a')
  p.ell(4, 22, 3.5, 4, '#7a8a5a'); p.ell(28, 22, 3.5, 4, '#7a8a5a')
  p.line(29, 26, 31, 16, '#7a5a3a'); p.ell(31, 14, 2, 3, '#8a6a4a')
  p.outline(OUT)
  return p.img()
}
export function barrowKing(f: number): Img {
  const p = new Paint(24, 28)
  p.ell(12, 19, 9, 9, '#3a3450', (x, y) => y >= 12)
  p.rect(9, 13, 6, 6, '#e8e4d8'); p.line(9, 15, 14, 15, '#9a9488'); p.line(9, 17, 14, 17, '#9a9488')
  p.ell(12, 8, 5, 5, '#f2eee2')
  p.rect(9, 7, 2, 2, f ? '#60f0ff' : '#1a1418'); p.rect(13, 7, 2, 2, f ? '#60f0ff' : '#1a1418'); p.rect(10, 11, 4, 1, '#9a9488')
  for (let i = 0; i < 4; i++) p.line(7 + i * 3, 3, 8 + i * 3, 0, '#c9a040')
  p.rect(7, 3, 10, 2, '#c9a040'); p.set(12, 3, '#40e0ff')
  p.line(22, 6, 22, 27, '#8a8a94'); p.rect(20, 6, 5, 1, '#8a8a94')
  p.outline('#0e0a12')
  return p.img()
}
export function ashKing(f: number): Img {
  const p = new Paint(32, 32)
  p.ell(16, 21, 12, 10, '#3a2a2a')
  for (let i = 0; i < 9; i++) p.set(8 + Math.floor(hash(i, 3) * 16), 15 + Math.floor(hash(i, 7) * 12), f ? '#ff9030' : '#ff5a20')
  p.ell(16, 21, 6, 5, f ? '#ff8030' : '#d84a20', (x, y) => y >= 18)
  p.ell(16, 9, 7, 6.5, '#4a3434')
  p.rect(12, 8, 3, 2, '#ffcc40'); p.rect(18, 8, 3, 2, '#ffcc40')
  for (let i = 0; i < 5; i++) p.line(10 + i * 3, 4, 10 + i * 3 + (i - 2), 0, '#2a1a1a')
  p.ell(4, 20, 4, 5, '#3a2a2a'); p.ell(28, 20, 4, 5, '#3a2a2a')
  p.ell(4, 25, 2, 2, f ? '#ffb040' : '#ff6a20'); p.ell(28, 25, 2, 2, f ? '#ffb040' : '#ff6a20')
  p.outline('#0a0606')
  return p.img()
}
export function fireball(f: number): Img {
  const p = new Paint(8, 8)
  p.ell(4, 4, 3.6, 3.6, f ? '#ff7a20' : '#ff9a30'); p.ell(4, 4, 2, 2, '#fff0a0')
  return p.img()
}
export function bone(f: number): Img {
  const p = new Paint(8, 8)
  if (f) p.line(1, 1, 6, 6, '#e8e4d8'); else p.line(6, 1, 1, 6, '#e8e4d8')
  p.outline('#1a1418')
  return p.img()
}

// ---------------------------------------------------------------- pickups
export function heart(full: number): Img { // 1 = full, 0.5 = half, 0 = empty (HUD)
  const p = new Paint(9, 8)
  const shape = (c: string, clip?: (x: number, y: number) => boolean) => {
    p.ell(2.5, 2.5, 2.5, 2.5, c, clip); p.ell(6.5, 2.5, 2.5, 2.5, c, clip)
    for (let y = 3; y < 8; y++) for (let x = 0; x < 9; x++) if (Math.abs(x + 0.5 - 4.5) <= 4.5 - (y - 2.5) && (!clip || clip(x, y))) p.set(x, y, c)
  }
  shape('#4a2a30')
  if (full > 0) shape('#e8303a', full < 1 ? (x) => x < 5 : undefined)
  if (full > 0) p.set(2, 1, '#ffb0b0')
  return p.img()
}
export function coin(f: number): Img {
  const p = new Paint(8, 8)
  p.ell(4, 4, f ? 2 : 3.4, 3.4, '#d8dce8'); p.ell(4, 4, f ? 1 : 2, 2, '#f8fcff')
  p.outline('#4a4a5a')
  return p.img()
}
export function key(): Img {
  const p = new Paint(8, 14)
  p.ell(4, 3, 3, 3, '#e8c040'); p.set(4, 3, null as unknown as string)
  p.rect(3, 5, 2, 8, '#e8c040'); p.rect(5, 10, 2, 1, '#e8c040'); p.rect(5, 12, 2, 1, '#e8c040')
  p.outline('#5a4010')
  const im = p.img(); im.getContext('2d')!.clearRect(3, 2, 2, 2); return im
}
export function potion(): Img {
  const p = new Paint(10, 12)
  p.ell(5, 7.5, 4, 4, '#e84a7a'); p.ell(4, 6.5, 1.4, 1.4, '#ffb0d0')
  p.rect(4, 1, 2, 3, '#c8e0f0'); p.rect(3, 0, 4, 1, '#8a5a2a')
  p.outline('#2a1020')
  return p.img()
}
export function bow(): Img {
  const p = new Paint(14, 14)
  for (let i = 0; i <= 20; i++) { const t = (i / 20) * Math.PI; p.set(3 + Math.sin(t) * 8, 1 + (i / 20) * 12, '#9a6a3a') }
  p.line(3, 1, 3, 13, '#e8e8e8')
  p.outline('#2a1a10')
  return p.img()
}
export function heartBig(): Img {
  const p = new Paint(14, 13)
  p.ell(4, 4, 4, 4, '#e8303a'); p.ell(10, 4, 4, 4, '#e8303a')
  for (let y = 5; y < 13; y++) for (let x = 0; x < 14; x++) if (Math.abs(x + 0.5 - 7) <= 7 - (y - 4.5) * 0.95) p.set(x, y, '#e8303a')
  p.ell(4, 3, 1.5, 1.5, '#ffc0c0')
  p.outline('#ffffff')
  return p.img()
}
export function dawnstone(f: number): Img {
  const p = new Paint(14, 16)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 14; x++) { const d = Math.abs(x + 0.5 - 7) / 6 + Math.abs(y + 0.5 - 8) / 8; if (d <= 1) p.set(x, y, d < 0.45 ? '#fffbe0' : f ? '#ffd860' : '#ffc040') }
  p.outline('#7a4a10')
  return p.img()
}
export function glow(r: number, col: string): Img {
  const [c, g] = canvas(r * 2, r * 2)
  const gr = g.createRadialGradient(r, r, 0, r, r, r)
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2)
  return c
}
export function puff(): Img { const p = new Paint(8, 8); p.ell(4, 4, 3.5, 3.5, '#ffffff'); return p.img() }

// ---------------------------------------------------------------- tiles
// Each tile is drawn for a theme; variant picks from the tile position so fields don't look stamped.
export const THEMES: { [k: string]: { ground: string; ground2: string; blade: string } } = {
  green: { ground: '#5aa84a', ground2: '#64b252', blade: '#3f8a3a' },
  dark: { ground: '#2f5a3a', ground2: '#335f3e', blade: '#21452c' },
  ash: { ground: '#5a4a48', ground2: '#625150', blade: '#3e3232' },
  barrow: { ground: '#3a3a48', ground2: '#40404e', blade: '#2c2c38' },
  keep: { ground: '#3a2a2a', ground2: '#412f2f', blade: '#2a1c1c' },
}
const tileCache: { [k: string]: Img } = {}
export function tile(ch: string, theme: string, tx: number, ty: number, frame: number): Img {
  const v = Math.floor(hash(tx, ty) * 4)
  const k = ch + theme + v + (ch === '~' || ch === 'L' || ch === 't' ? frame : 0)
  if (tileCache[k]) return tileCache[k]
  const th = THEMES[theme] || THEMES.green
  const [c, g] = canvas(16, 16)
  const P = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, w, h) }
  const ground = () => {
    P(0, 0, 16, 16, v % 2 ? th.ground2 : th.ground)
    srand(v * 31 + 7)
    for (let i = 0; i < 5; i++) { const x = Math.floor(rnd() * 14), y = Math.floor(rnd() * 14); P(x, y, 1, 2, th.blade); P(x + 1, y + 1, 1, 1, th.blade) }
  }
  const floor = () => {
    P(0, 0, 16, 16, th.ground)
    P(0, 0, 16, 1, th.ground2); P(0, 0, 1, 16, th.ground2)
    P(0, 15, 16, 1, th.blade); P(15, 0, 1, 16, th.blade)
    if (v === 1) { P(5, 6, 3, 1, th.blade); P(9, 10, 2, 1, th.blade) }
  }
  const stamp = (paint: Paint) => g.drawImage(paint.img(), 0, 0)
  switch (ch) {
    case '.': case 'd': case 'a': ground(); if (ch === 'a' && v === 2) { P(4, 7, 5, 1, '#3a2c2c'); P(8, 8, 3, 1, '#3a2c2c') } break
    case ',': ground(); { const col = v % 2 ? '#ffffff' : '#ffd84a'; P(3, 4, 2, 2, col); P(10, 9, 2, 2, v > 1 ? '#ff7aa0' : col); P(4, 5, 1, 1, '#ffb030'); P(6, 12, 2, 2, col) } break
    case ':': P(0, 0, 16, 16, '#d6b47a'); P((v * 5) % 13, 3, 2, 1, '#c09a60'); P((v * 7 + 3) % 13, 11, 3, 1, '#c09a60'); P(2, 8, 1, 1, '#e8cc98'); break
    case 's': P(0, 0, 16, 16, '#e0d0a0'); P(4, 5, 1, 1, '#c8b480'); P(11, 10, 1, 1, '#c8b480'); break
    case '_': floor(); break
    case 'T': case 'D': case 'X': {
      if (ch === 'X') { P(0, 0, 16, 16, THEMES.ash.ground); const p = new Paint(16, 16); p.line(8, 15, 8, 5, '#2a1e1a'); p.line(8, 8, 3, 3, '#2a1e1a'); p.line(8, 6, 13, 2, '#2a1e1a'); p.line(8, 10, 12, 8, '#2a1e1a'); p.rect(7, 12, 3, 4, '#2a1e1a'); stamp(p); break }
      const dark = ch === 'D'
      P(0, 0, 16, 16, dark ? THEMES.dark.ground : th.ground)
      const p = new Paint(16, 16)
      p.rect(6, 11, 4, 5, '#6a4426')
      p.ell(8, 7, 7.6, 6.8, dark ? '#1c3a2a' : '#2f7a3a')
      p.ell(6, 5, 3.4, 2.6, dark ? '#2a4e36' : '#4a9a4a')
      p.set(10, 8, dark ? '#16301f' : '#25602e'); p.set(4, 9, dark ? '#16301f' : '#25602e')
      p.outline(dark ? '#0a160e' : '#173a1c')
      stamp(p); break
    }
    case 'R': { ground(); const p = new Paint(16, 16); p.ell(8, 9, 7, 6, '#8a8a94'); p.ell(6, 7, 3, 2, '#b4b4be'); p.line(9, 10, 12, 12, '#6a6a74'); p.outline('#2a2a32'); stamp(p); break }
    case 'B': { ground(); const p = new Paint(16, 16); p.ell(8, 9, 7, 6, '#4aa83a'); p.ell(5, 7, 2.5, 2, '#8ad86a'); p.ell(11, 10, 2, 1.6, '#3a8a2e'); p.outline('#1a4a1a'); stamp(p); break }
    case '~': {
      P(0, 0, 16, 16, '#3a78c8')
      const o = frame * 4
      P((v * 4 + o) % 16, 4, 5, 1, '#6aa4e8'); P((v * 7 + 8 + o) % 16, 11, 4, 1, '#6aa4e8'); P((v * 3 + o + 3) % 16, 8, 2, 1, '#9ac4f4')
      break
    }
    case 'L': {
      P(0, 0, 16, 16, frame ? '#e85a20' : '#d84a18')
      P((v * 5 + frame * 6) % 14, 4, 4, 2, '#ffb040'); P((v * 9 + 7 - frame * 4 + 16) % 14, 10, 3, 2, '#ffd060'); P(2, 13, 2, 1, '#a82a10')
      break
    }
    case '=': P(0, 0, 16, 16, '#3a78c8'); P(0, 1, 16, 14, '#a8743a'); for (let x = 0; x < 16; x += 4) P(x, 1, 1, 14, '#7a4e22'); P(0, 1, 16, 1, '#c89458'); P(0, 14, 16, 1, '#5a3a18'); break
    case '|': P(0, 0, 16, 16, '#3a78c8'); P(1, 0, 14, 16, '#a8743a'); for (let y = 0; y < 16; y += 4) P(1, y, 14, 1, '#7a4e22'); P(1, 0, 1, 16, '#c89458'); P(14, 0, 1, 16, '#5a3a18'); break
    case 'H': case 'M': {
      // grassy hill / barrow mound (solid)
      P(0, 0, 16, 16, ch === 'M' ? '#4e8a42' : '#5f9e4a')
      P(0, 0, 16, 2, ch === 'M' ? '#5e9a50' : '#78b85a')
      P((v * 5) % 12, 6, 3, 1, '#4a8a3a'); P((v * 3 + 6) % 12, 11, 4, 1, '#4a8a3a')
      break
    }
    case 'O': { // round burrow door
      P(0, 0, 16, 16, '#5f9e4a')
      const p = new Paint(16, 16); p.ell(8, 10, 6.5, 7, '#3a7a3a'); p.ell(8, 10, 5.5, 6, '#2e6a3a'); p.set(11, 11, '#ffd23a'); p.line(8, 4, 8, 16, '#24582e')
      stamp(p); break
    }
    case 'W': { // window in a hill
      P(0, 0, 16, 16, '#5f9e4a')
      const p = new Paint(16, 16); p.ell(8, 8, 4.5, 4.5, '#ffe08a'); p.line(8, 4, 8, 12, '#6a4426'); p.line(4, 8, 12, 8, '#6a4426'); p.outline('#6a4426'); stamp(p); break
    }
    case 'F': ground(); P(0, 6, 16, 2, '#a8743a'); P(0, 11, 16, 2, '#a8743a'); P(2, 3, 3, 13, '#8a5a2a'); P(11, 3, 3, 13, '#8a5a2a'); P(2, 3, 3, 1, '#c89458'); P(11, 3, 3, 1, '#c89458'); break
    case 'S': { ground(); const p = new Paint(16, 16); p.rect(7, 9, 2, 7, '#6a4426'); p.rect(2, 2, 12, 8, '#b8844a'); p.line(4, 4, 11, 4, '#7a4e22'); p.line(4, 6, 10, 6, '#7a4e22'); p.outline('#3a2410'); stamp(p); break }
    case 'C': { // cliff / mountain rock
      P(0, 0, 16, 16, theme === 'ash' ? '#4a3a38' : '#8a6e50')
      P(0, 4 + (v % 3), 16, 1, theme === 'ash' ? '#3a2c2a' : '#6e563c'); P(0, 11 - (v % 2), 16, 1, theme === 'ash' ? '#3a2c2a' : '#6e563c')
      P((v * 4) % 12, 1, 3, 2, theme === 'ash' ? '#5e4c48' : '#a88a68'); P((v * 6 + 5) % 12, 7, 2, 2, theme === 'ash' ? '#5e4c48' : '#a88a68')
      break
    }
    case 'c': case 'v': { // cave mouth / stairs (walkable warp)
      if (ch === 'c') { P(0, 0, 16, 16, theme === 'ash' ? '#4a3a38' : '#8a6e50'); const p = new Paint(16, 16); p.ell(8, 12, 7, 10, '#120c10'); stamp(p) }
      else { P(0, 0, 16, 16, '#1a1418'); for (let i = 0; i < 4; i++) P(1 + i, 2 + i * 3, 14 - i * 2, 2, i % 2 ? '#5a5a66' : '#7a7a86') }
      break
    }
    case '#': { // dungeon wall
      const keep = theme === 'keep'
      P(0, 0, 16, 16, keep ? '#4a2e2a' : '#4e4e5e')
      const m = keep ? '#2a1612' : '#2e2e3a'
      P(0, 7, 16, 1, m); P(0, 15, 16, 1, m); P(v % 2 ? 4 : 10, 0, 1, 7, m); P(v % 2 ? 11 : 3, 8, 1, 7, m)
      P(0, 0, 16, 1, keep ? '#6a443a' : '#6a6a7a')
      break
    }
    case 'b': { floor(); const p = new Paint(16, 16); p.rect(1, 1, 14, 14, theme === 'keep' ? '#6a4a3a' : '#6a6a7a'); p.rect(1, 1, 14, 2, theme === 'keep' ? '#8a6a52' : '#8e8e9e'); p.rect(3, 5, 10, 8, theme === 'keep' ? '#5a3c2e' : '#5a5a6a'); p.outline('#1a1418'); stamp(p); break }
    case 't': { // wall torch
      g.drawImage(tile('#', theme, tx, ty, 0), 0, 0)
      P(7, 8, 2, 6, '#6a4426'); P(6, 3 + frame, 4, 5 - frame, '#ff8a20'); P(7, 4 + frame, 2, 3, '#ffe060')
      break
    }
    case 'k': { // locked door
      floor(); P(1, 0, 14, 16, '#7a4e22'); P(1, 0, 14, 2, '#a8743a'); for (let x = 4; x < 15; x += 4) P(x, 2, 1, 14, '#5a3412')
      P(6, 6, 4, 5, '#e8c040'); P(7, 8, 2, 2, '#1a1418')
      break
    }
    case 'u': P(0, 0, 16, 16, '#2a2a34'); for (let x = 1; x < 16; x += 3) P(x, 0, 2, 16, '#7a7a8a'); P(0, 0, 16, 2, '#9a9aaa'); break
    case 'G': P(0, 0, 16, 16, '#1a1214'); for (let x = 1; x < 16; x += 4) P(x, 0, 2, 16, '#6a6470'); P(0, 3, 16, 2, '#5a5460'); P(0, 11, 16, 2, '#5a5460'); break
    case 'g': P(0, 0, 16, 16, '#1a1214'); P(0, 0, 16, 2, '#5a5460'); break // open gate (walkable dark arch)
    case 'Y': { // rune crystal
      P(0, 0, 16, 16, '#4a3a38'); const p = new Paint(16, 16)
      for (let y = 1; y < 15; y++) for (let x = 2; x < 14; x++) if (Math.abs(x + 0.5 - 8) / 6 + Math.abs(y + 0.5 - 8) / 7 <= 1) p.set(x, y, frame ? '#80f0ff' : '#40a8d0')
      p.outline('#102a3a'); stamp(p); break
    }
    case 'y': { P(0, 0, 16, 16, '#4a3a38'); const p = new Paint(16, 16); for (let y = 1; y < 15; y++) for (let x = 2; x < 14; x++) if (Math.abs(x + 0.5 - 8) / 6 + Math.abs(y + 0.5 - 8) / 7 <= 1) p.set(x, y, '#ffd860'); p.outline('#5a3a10'); stamp(p); break }
    default: ground()
  }
  tileCache[k] = c
  return c
}

// ---------------------------------------------------------------- title backdrop
export function titleArt(W: number, H: number): Img {
  const [c, g] = canvas(W, H)
  const gr = g.createLinearGradient(0, 0, 0, H)
  gr.addColorStop(0, '#1a1438'); gr.addColorStop(0.55, '#5a3060'); gr.addColorStop(0.8, '#c0604a'); gr.addColorStop(1, '#e89a5a')
  g.fillStyle = gr; g.fillRect(0, 0, W, H)
  srand(9)
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`; g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H * 0.5), 1, 1) }
  // far volcano with a glowing crown
  g.fillStyle = '#2a1a2a'
  g.beginPath(); g.moveTo(230, H); g.lineTo(300, 120); g.lineTo(318, 120); g.lineTo(400, H); g.closePath(); g.fill()
  const gl = glow(40, 'rgba(255,120,40,0.7)'); g.drawImage(gl, 269, 80)
  // mountains
  g.fillStyle = '#3a2440'
  g.beginPath(); g.moveTo(0, H); let x = 0
  while (x < W) { const w = 50 + rnd() * 60; g.lineTo(x + w / 2, 160 - rnd() * 40); g.lineTo(x + w, 190); x += w }
  g.lineTo(W, H); g.closePath(); g.fill()
  // green hill in front
  g.fillStyle = '#2f5a3a'
  g.beginPath(); g.moveTo(0, H); g.quadraticCurveTo(110, 168, 230, 210); g.lineTo(W, 214); g.lineTo(W, H); g.closePath(); g.fill()
  return c
}
export function chest(open: boolean, theme: string): Img {
  const p = new Paint(16, 16)
  const wood = theme === 'keep' ? '#7a3a2a' : theme === 'barrow' ? '#6a5a7a' : '#a8743a', dark = theme === 'keep' ? '#4a1e14' : theme === 'barrow' ? '#3e3450' : '#6a4426'
  p.rect(1, 6, 14, 9, wood); p.rect(1, 10, 14, 1, dark)
  if (open) { p.rect(1, 3, 14, 3, dark); p.rect(2, 6, 12, 2, '#1a1010') }
  else { p.rect(1, 3, 14, 4, wood); p.rect(1, 3, 14, 1, '#e8c080'); p.rect(7, 8, 2, 3, '#e8c040') }
  p.rect(1, 6, 1, 9, '#c9a040'); p.rect(14, 6, 1, 9, '#c9a040')
  p.outline('#1a1010')
  return p.img()
}
