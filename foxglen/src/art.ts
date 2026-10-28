// Foxglen art: every sprite and tile is drawn here in code (no image files), as crisp pixel art.
export type Img = HTMLCanvasElement

const canvas = (w: number, h: number): [Img, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return [c, c.getContext('2d')!]
}

// seeded random so the art looks the same every time
let seed = 1
export const srand = (s: number) => { seed = s }
export const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }

// ---------------------------------------------------------------- pixel strings
export function pix(rows: string[], pal: { [c: string]: string }): Img {
  const w = Math.max.apply(null, rows.map((r) => r.length)), h = rows.length
  const [c, g] = canvas(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
    const col = pal[rows[y][x]]
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1) }
  }
  return c
}

export function flip(img: Img): Img {
  const [c, g] = canvas(img.width, img.height)
  g.translate(img.width, 0); g.scale(-1, 1); g.drawImage(img, 0, 0)
  return c
}
export function flipV(img: Img): Img {
  const [c, g] = canvas(img.width, img.height)
  g.translate(0, img.height); g.scale(1, -1); g.drawImage(img, 0, 0)
  return c
}

// ---------------------------------------------------------------- shape painter with an automatic outline
type Px = (string | null)[]
class Paint {
  px: Px
  constructor(public w: number, public h: number) { this.px = new Array(w * h).fill(null) }
  set(x: number, y: number, c: string) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c }
  get(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : null }
  ell(cx: number, cy: number, rx: number, ry: number, c: string, clip?: (x: number, y: number) => boolean) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
      if (dx * dx + dy * dy <= 1 && (!clip || clip(x, y))) this.set(x, y, c)
    }
  }
  rect(x: number, y: number, w: number, h: number, c: string) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c) }
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1
    for (let i = 0; i <= n; i++) this.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c)
  }
  outline(c: string) {
    const add: number[] = []
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(y * this.w + x)
    }
    add.forEach((i) => (this.px[i] = c))
  }
  img(): Img {
    const [cv, g] = canvas(this.w, this.h)
    for (let i = 0; i < this.px.length; i++) { const c = this.px[i]; if (c) { g.fillStyle = c; g.fillRect(i % this.w, Math.floor(i / this.w), 1, 1) } }
    return cv
  }
}

// ---------------------------------------------------------------- Pip the fox (16x16, facing right)
const FOX_TOP = [
  '.........o..o...',
  '........oRooRo..',
  '........orrrrro.',
  '........orrrkro.',
  '.......orrrrrrrk',
  '.......orwwwwwo.',
  '..ooo...owwwwo..',
  '.orrro.oGGGGGo..',
  'orrrrrorgggggo..',
  'owwrrrorrrrrro..',
  '.owwrrrrrrrrro..',
  '..oooorrrrrrro..',
  '......orwwwwro..',
]
const FOX_LEGS: { [k: string]: string[] } = {
  stand: ['......orrooRro..', '......oko..oko..', '......oo...oo...'],
  runA: ['.....orrooRrro..', '....oko.....oko.', '....oo.......oo.'],
  runB: ['......orrrRro...', '.......okoko....', '.......oooo.....'],
  jump: ['.....orrrrRrro..', '.....oko...oko..', '................'],
}
export interface FoxSet { [frame: string]: [Img, Img] } // [facing right, facing left]
export function fox(scarf: [string, string]): FoxSet {
  const pal = { o: '#2b1610', r: '#ee7a2c', R: '#b4511c', w: '#fff3dc', k: '#140c0a', g: scarf[0], G: scarf[1] }
  const out: FoxSet = {}
  for (const k in FOX_LEGS) { const im = pix(FOX_TOP.concat(FOX_LEGS[k]), pal); out[k] = [im, flip(im)] }
  // tail-flick variant of the run frames
  const flick = FOX_TOP.slice(); flick[6] = '.ooo....owwwwo..'; flick[7] = 'orrro..oGGGGGo..'
  out.runC = ((im) => [im, flip(im)] as [Img, Img])(pix(flick.concat(FOX_LEGS.runA), pal))
  return out
}

// ---------------------------------------------------------------- enemies
const OUT = '#170d1c'
export function beetle(step: number, shell = '#5b3fd1', hi = '#a693ff'): Img {
  const p = new Paint(16, 12)
  for (let i = 0; i < 4; i++) p.set(4 + i * 3 + (step ? 1 : 0), 11, '#2a1f55')
  p.ell(9.5, 7, 6, 5.5, shell, (x, y) => y <= 9)
  p.rect(4, 9, 12, 1, '#2a1f55')
  p.line(9, 2, 9, 8, '#3a2a99')
  p.ell(7, 4.5, 2, 1.3, hi)
  p.ell(3.2, 8, 2.6, 2.3, '#2a1f55')
  p.set(2, 7, '#ffffff'); p.set(1, 5, '#2a1f55'); p.set(0, 4, '#2a1f55')
  p.outline(OUT)
  return p.img()
}
export function burr(step: number): Img {
  const p = new Paint(16, 15)
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2 + (step ? 0.25 : 0)
    p.line(8 + Math.cos(t) * 5, 8 + Math.sin(t) * 5, 8 + Math.cos(t) * 7.4, 8 + Math.sin(t) * 6.8, '#e9c46a')
  }
  p.ell(8, 8.5, 5.5, 5.2, '#8a5a24')
  p.ell(6.5, 6.5, 2, 1.4, '#b07a38')
  p.rect(4, 8, 2, 2, '#ffffff'); p.rect(9, 8, 2, 2, '#ffffff')
  p.set(4, 9, '#000000'); p.set(9, 9, '#000000')
  p.rect(6, 12, 3, 1, '#4a2a10')
  p.outline(OUT)
  return p.img()
}
export function bee(flap: number): Img {
  const p = new Paint(16, 13)
  p.ell(8.5, 8.5, 5.5, 3.8, '#ffd23a')
  p.rect(7, 5, 1, 8, '#2a1a10'); p.rect(10, 5, 1, 8, '#2a1a10')
  p.set(2, 8, '#2a1a10'); p.set(1, 8, '#2a1a10')
  p.rect(12, 7, 1, 1, '#000000')
  if (flap) { p.ell(7, 3, 2.5, 2.4, '#e6f8ff'); p.ell(10.5, 2.6, 2.4, 2.4, '#e6f8ff') }
  else { p.ell(6, 4.5, 3, 1.4, '#e6f8ff'); p.ell(11, 4.5, 2.6, 1.4, '#e6f8ff') }
  p.outline(OUT)
  return p.img()
}
export function spider(step: number): Img {
  const p = new Paint(16, 12)
  for (let i = 0; i < 4; i++) {
    const lx = 3 + i * 3 + (i > 1 ? 1 : 0), dir = i < 2 ? -1 : 1
    p.line(8, 6, lx + dir, 4 + (step ? 1 : 0), '#2a2238'); p.line(lx + dir, 4 + (step ? 1 : 0), lx + dir * 2, 10, '#2a2238')
  }
  p.ell(8, 6, 4, 3.6, '#4a3a63')
  p.ell(7, 4.5, 1.5, 1, '#7a6a98')
  p.set(6, 7, '#ff4060'); p.set(9, 7, '#ff4060')
  p.outline(OUT)
  return p.img()
}

// ---------------------------------------------------------------- items
export function acorn(phase: number): Img { // 4 frames: a glint slides across the nut
  const p = new Paint(10, 13)
  p.ell(5, 8, 3.9, 4.2, '#e8a33a')
  p.ell(5, 4, 4.9, 2.4, '#8a5a2b')
  p.rect(5, 0, 1, 2, '#5a3416')
  for (let x = 1; x < 9; x += 2) p.set(x, 3, '#6b4220')
  const gx = [3, 4, 6, -9][phase]
  p.rect(gx, 7, 1, 3, '#fff0b0'); p.set(gx + 1, 6, '#ffd27a')
  p.outline('#3a1d0a')
  return p.img()
}
export function feather(): Img {
  const p = new Paint(12, 16)
  for (let i = 0; i <= 40; i++) {
    const t = i / 40
    const x = 2 + t * 8, y = 14 - t * 12
    const w = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 3.2
    for (let d = -w; d <= w; d += 0.5) p.set(x + d * 0.8, y + d * 0.6, d < 0 ? '#9be3ff' : '#5ec8ff')
  }
  p.line(1, 15, 10, 2, '#ffffff')
  p.outline('#1d4f7a')
  return p.img()
}
export function sparkle(size: number): Img {
  const p = new Paint(7, 7)
  p.set(3, 3, '#ffffff')
  for (let i = 1; i <= size; i++) { p.set(3 + i, 3, '#fff6b0'); p.set(3 - i, 3, '#fff6b0'); p.set(3, 3 + i, '#fff6b0'); p.set(3, 3 - i, '#fff6b0') }
  return p.img()
}
export function puff(): Img {
  const p = new Paint(8, 8)
  p.ell(4, 4, 3.5, 3.5, '#ffffff')
  p.ell(3, 3, 1.5, 1.5, '#f0f6ff')
  return p.img()
}

// ---------------------------------------------------------------- themes and tiles
export interface Theme {
  id: string
  sky: string[] // gradient stops top -> bottom
  grass: string; grassHi: string; dirt: string; dirtDark: string; speck: string
  stone: string; stoneHi: string; stoneLo: string
  far: string; mid: string; mid2: string
  icy?: boolean; dark?: boolean; snow?: boolean
}
export const THEMES: { [id: string]: Theme } = {
  meadow: { id: 'meadow', sky: ['#5fb8ff', '#a8dcff', '#e9f7ff'], grass: '#4fc04a', grassHi: '#9be86a', dirt: '#a9683a', dirtDark: '#7b4524', speck: '#c98a52', stone: '#9aa3ad', stoneHi: '#d3d9de', stoneLo: '#5d6670', far: '#8fc8e8', mid: '#5aa86a', mid2: '#3d8a55' },
  hollow: { id: 'hollow', sky: ['#120c22', '#24183c', '#3a2650'], grass: '#3fae9a', grassHi: '#7ef0d0', dirt: '#5a4466', dirtDark: '#3a2a48', speck: '#7a5e8a', stone: '#6a6080', stoneHi: '#9a8fb2', stoneLo: '#3c3450', far: '#2a1f40', mid: '#33264d', mid2: '#40305e', dark: true },
  canopy: { id: 'canopy', sky: ['#ff9d5c', '#ffc77a', '#fff0b8'], grass: '#62b83a', grassHi: '#b4ec6a', dirt: '#7a4d2a', dirtDark: '#55331a', speck: '#9a6a3e', stone: '#a08a6a', stoneHi: '#d6c09a', stoneLo: '#6a5638', far: '#e8a070', mid: '#7a5a3a', mid2: '#4e7a32' },
  frost: { id: 'frost', sky: ['#2c2f6e', '#7a5a9e', '#f0a8c0'], grass: '#f4fbff', grassHi: '#ffffff', dirt: '#6a7aa0', dirtDark: '#4a5680', speck: '#8a9ac0', stone: '#a8c8e8', stoneHi: '#e8f6ff', stoneLo: '#6a88b0', far: '#b0b8e0', mid: '#5a6aa0', mid2: '#2e4a6a', icy: true, snow: true },
}

export interface Tiles { top: Img; fill: Img[]; stone: Img; crate: Img; used: Img; plank: Img; thorns: Img; ice?: Img }
export function tiles(t: Theme): Tiles {
  srand(t.id.length * 97 + 13)
  const top = (() => {
    const [c, g] = canvas(16, 16)
    g.fillStyle = t.dirt; g.fillRect(0, 0, 16, 16)
    speckle(g, t)
    g.fillStyle = t.grass; g.fillRect(0, 0, 16, 5)
    for (let x = 0; x < 16; x++) { const d = (x * 7) % 3; g.fillRect(x, 5, 1, d === 0 ? 2 : d === 1 ? 1 : 0) }
    g.fillStyle = t.grassHi; g.fillRect(0, 0, 16, 1)
    for (let x = 1; x < 16; x += 4) g.fillRect(x, 1, 2, 1)
    return c
  })()
  const fill = [0, 1].map(() => { const [c, g] = canvas(16, 16); g.fillStyle = t.dirt; g.fillRect(0, 0, 16, 16); speckle(g, t); return c })
  const stone = (() => {
    const [c, g] = canvas(16, 16)
    g.fillStyle = t.stone; g.fillRect(0, 0, 16, 16)
    g.fillStyle = t.stoneHi; g.fillRect(0, 0, 16, 2); g.fillRect(0, 0, 2, 16)
    g.fillStyle = t.stoneLo; g.fillRect(0, 14, 16, 2); g.fillRect(14, 0, 2, 16)
    g.fillRect(4, 5, 3, 1); g.fillRect(9, 9, 3, 1)
    return c
  })()
  const crateDraw = (used: boolean) => {
    const [c, g] = canvas(16, 16)
    g.fillStyle = used ? '#6b5440' : '#d08a3c'; g.fillRect(0, 0, 16, 16)
    g.fillStyle = used ? '#4a3a2c' : '#8a4e1c'
    g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16)
    g.fillRect(1, 5, 14, 1); g.fillRect(1, 10, 14, 1)
    g.fillStyle = used ? '#7a6250' : '#f0b060'; g.fillRect(1, 1, 14, 1); g.fillRect(1, 6, 14, 1); g.fillRect(1, 11, 14, 1)
    g.fillStyle = used ? '#4a3a2c' : '#8a4e1c'
    g.fillRect(2, 2, 1, 1); g.fillRect(13, 2, 1, 1); g.fillRect(2, 13, 1, 1); g.fillRect(13, 13, 1, 1)
    if (!used) { // golden leaf mark
      g.fillStyle = '#fff2a0'; g.fillRect(7, 6, 2, 4); g.fillRect(6, 7, 4, 2)
      g.fillStyle = '#ffd23a'; g.fillRect(7, 7, 2, 2)
    }
    return c
  }
  const plank = (() => {
    const [c, g] = canvas(16, 16)
    g.fillStyle = '#c0884a'; g.fillRect(0, 0, 16, 6)
    g.fillStyle = '#e8b070'; g.fillRect(0, 0, 16, 1)
    g.fillStyle = '#7a4a22'; g.fillRect(0, 5, 16, 1); g.fillRect(0, 2, 1, 3); g.fillRect(8, 1, 1, 4)
    g.fillStyle = '#5a3416'; g.fillRect(3, 2, 1, 1); g.fillRect(12, 2, 1, 1)
    if (t.snow) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 16, 1); g.fillRect(2, 0, 9, 2) }
    return c
  })()
  const thorns = (() => {
    const p = new Paint(16, 16)
    for (let i = 0; i < 4; i++) { const x = 2 + i * 4; p.line(x, 15, x - 1, 7 + (i % 2) * 2, '#5a2a6a'); p.line(x - 1, 9 + (i % 2), x + 2, 6 + (i % 2) * 2, '#5a2a6a') }
    p.ell(8, 14, 8, 3, '#3a6a2a')
    for (let i = 0; i < 6; i++) p.set(1 + i * 3, 6 + (i % 3) * 2, '#ff8ab0')
    p.outline('#1a0d1c')
    return p.img()
  })()
  return { top, fill, stone, crate: crateDraw(false), used: crateDraw(true), plank, thorns }
}
function speckle(g: CanvasRenderingContext2D, t: Theme) {
  for (let i = 0; i < 9; i++) {
    g.fillStyle = rnd() < 0.5 ? t.speck : t.dirtDark
    g.fillRect(Math.floor(rnd() * 15), Math.floor(rnd() * 15), rnd() < 0.5 ? 2 : 1, 1)
  }
}

// ---------------------------------------------------------------- big pieces
export function lantern(lit: boolean): Img {
  const p = new Paint(20, 72)
  p.rect(9, 18, 2, 54, '#3a2a20')
  p.rect(8, 68, 4, 4, '#2a1a10')
  p.rect(4, 14, 12, 3, '#3a2a20')
  p.rect(5, 3, 10, 11, lit ? '#ffe27a' : '#55606e')
  if (lit) p.ell(10, 8.5, 3, 4, '#fffbe0')
  p.rect(5, 3, 10, 1, '#3a2a20'); p.rect(5, 13, 10, 1, '#3a2a20'); p.rect(5, 3, 1, 11, '#3a2a20'); p.rect(14, 3, 1, 11, '#3a2a20'); p.rect(9, 3, 2, 11, '#3a2a20')
  p.rect(7, 1, 6, 2, '#3a2a20'); p.set(10, 0, '#3a2a20')
  p.outline('#120a08')
  return p.img()
}
export function glow(r: number, col: string): Img {
  const [c, g] = canvas(r * 2, r * 2)
  const gr = g.createRadialGradient(r, r, 0, r, r, r)
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2)
  return c
}
export function flag(on: boolean): Img {
  const p = new Paint(16, 32)
  p.rect(3, 2, 2, 30, '#5a3a20')
  const col = on ? '#46c774' : '#8a8f99', dk = on ? '#2a8a4a' : '#5a5f68'
  for (let y = 0; y < 9; y++) p.rect(5, 3 + y, 10 - Math.abs(4 - y), 1, y < 2 ? dk : col)
  if (on) p.ell(10, 8, 1.6, 1.6, '#ffffff')
  p.outline('#120a08')
  return p.img()
}
export function log(w: number, snow: boolean): Img {
  const [c, g] = canvas(w, 10)
  g.fillStyle = '#5a3416'; g.fillRect(0, 0, w, 10)
  g.fillStyle = '#9a6234'; g.fillRect(1, 1, w - 2, 7)
  g.fillStyle = '#c08a50'; g.fillRect(1, 1, w - 2, 2)
  g.fillStyle = '#6b4220'; for (let x = 6; x < w - 4; x += 9) g.fillRect(x, 4, 4, 1)
  g.fillStyle = '#e8c090'; g.fillRect(1, 2, 3, 5); g.fillRect(w - 4, 2, 3, 5)
  if (snow) { g.fillStyle = '#ffffff'; g.fillRect(2, 0, w - 4, 2) }
  return c
}

// ---------------------------------------------------------------- decorations (drawn into the level image)
export function decor(t: Theme, kind: number): Img {
  const p = new Paint(16, 16)
  if (t.id === 'meadow' || t.id === 'canopy') {
    if (kind === 0) { p.line(4, 15, 3, 10, '#2f8a3a'); p.line(8, 15, 8, 8, '#2f8a3a'); p.line(12, 15, 13, 11, '#2f8a3a') }
    else if (kind === 1) { p.line(8, 15, 8, 9, '#2f8a3a'); p.ell(8, 7, 2.5, 2.5, t.id === 'canopy' ? '#ff6a8a' : '#ffffff'); p.set(8, 7, '#ffd23a') }
    else { p.ell(8, 12, 7, 4.5, '#3d9a45'); p.ell(6, 10, 3, 2, '#6acb5a') }
  } else if (t.id === 'hollow') {
    if (kind === 0) { p.line(6, 15, 4, 8, '#7ef0d0'); p.line(9, 15, 10, 6, '#b8a0ff'); p.ell(10, 6, 1.5, 2, '#d8c8ff') }
    else if (kind === 1) { p.ell(8, 13, 5, 3, '#4a3a63'); p.ell(7, 12, 2, 1, '#7a6a98') }
    else { p.line(8, 15, 8, 10, '#3fae9a'); p.ell(8, 9, 3, 2, '#7ef0d0') }
  } else {
    if (kind === 0) { p.ell(8, 13, 6, 3, '#ffffff'); p.ell(6, 12, 2, 1, '#e0f0ff') }
    else if (kind === 1) { p.line(8, 15, 8, 10, '#3a5a4a'); p.ell(8, 9, 3, 3, '#4a7a5a'); p.ell(8, 8, 2, 1, '#ffffff') }
    else { p.ell(8, 14, 6, 2, '#c8d8f0') }
  }
  p.outline('rgba(0,0,0,0.35)')
  return p.img()
}

// ---------------------------------------------------------------- parallax backdrops (tileable, 512 wide)
export function sky(t: Theme, w: number, h: number): Img {
  const [c, g] = canvas(w, h)
  const gr = g.createLinearGradient(0, 0, 0, h)
  t.sky.forEach((col, i) => gr.addColorStop(i / (t.sky.length - 1), col))
  g.fillStyle = gr; g.fillRect(0, 0, w, h)
  srand(5)
  if (t.id === 'frost' || t.id === 'hollow') {
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`; g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h * 0.55), 1, 1) }
  }
  if (t.id === 'frost') { g.fillStyle = '#fff4e0'; g.beginPath(); g.arc(310, 50, 14, 0, Math.PI * 2); g.fill() }
  if (t.id === 'canopy') { g.fillStyle = 'rgba(255,250,220,0.9)'; g.beginPath(); g.arc(300, 150, 26, 0, Math.PI * 2); g.fill() }
  return c
}
export function layer(t: Theme, depth: number): Img {
  const W = 512, H = 240
  const [c, g] = canvas(W, H)
  srand(depth * 31 + t.id.charCodeAt(0))
  const col = depth === 0 ? t.far : depth === 1 ? t.mid : t.mid2
  g.fillStyle = col
  const wave = (base: number, amp: number, n: number) => {
    const ph = rnd() * 6
    g.beginPath(); g.moveTo(0, H)
    for (let x = 0; x <= W; x += 4) g.lineTo(x, base - Math.abs(Math.sin((x / W) * Math.PI * n + ph)) * amp - Math.sin((x / W) * Math.PI * 2 * 3) * amp * 0.15)
    g.lineTo(W, H); g.closePath(); g.fill()
  }
  if (t.id === 'meadow') {
    if (depth === 0) {
      wave(190, 60, 2)
      g.fillStyle = 'rgba(255,255,255,0.95)' // clouds
      for (let i = 0; i < 4; i++) { const x = 30 + i * 128 + rnd() * 40, y = 30 + rnd() * 50; blob(g, x, y, 22 + rnd() * 10) }
    } else if (depth === 1) {
      wave(205, 34, 3)
      for (let i = 0; i < 9; i++) { const x = rnd() * W; tree(g, x, 190 - rnd() * 16, 10 + rnd() * 6, t.mid2) }
    } else return c
  } else if (t.id === 'hollow') {
    if (depth === 0) {
      for (let x = 0; x < W; x += 18) { const h = 30 + rnd() * 70; tri(g, x, 0, x + 18, 0, x + 9, h) }
      wave(215, 50, 4)
    } else if (depth === 1) {
      for (let i = 0; i < 6; i++) { const x = rnd() * W, w = 14 + rnd() * 14; g.fillRect(Math.floor(x), 0, Math.floor(w), H); g.fillRect(Math.floor(x - 6), 0, Math.floor(w + 12), 20) }
      g.fillStyle = 'rgba(126,240,208,0.5)'
      for (let i = 0; i < 18; i++) g.fillRect(Math.floor(rnd() * W), Math.floor(40 + rnd() * 150), 2, 2)
    } else return c
  } else if (t.id === 'canopy') {
    if (depth === 0) {
      for (let i = 0; i < 14; i++) tree(g, rnd() * W, 210 - rnd() * 40, 18 + rnd() * 10, t.far)
      g.fillRect(0, 200, W, 40)
    } else if (depth === 1) {
      for (let i = 0; i < 4; i++) { const x = Math.floor(i * 128 + rnd() * 60); g.fillRect(x, 0, 22, H); g.fillStyle = '#6a4c30'; g.fillRect(x + 4, 0, 3, H); g.fillStyle = col }
      g.fillStyle = t.mid2
      for (let i = 0; i < 10; i++) blob(g, rnd() * W, rnd() * 50, 30)
    } else return c
  } else {
    if (depth === 0) {
      g.beginPath(); g.moveTo(0, H)
      let x = 0
      while (x < W) { const w = 60 + rnd() * 70, h = 70 + rnd() * 70; g.lineTo(x + w / 2, 200 - h); g.lineTo(x + w, 200); x += w }
      g.lineTo(W, H); g.closePath(); g.fill()
      g.fillStyle = '#ffffff'
      x = 0; srand(depth * 31 + t.id.charCodeAt(0))
      while (x < W) { const w = 60 + rnd() * 70, h = 70 + rnd() * 70; tri(g, x + w / 2 - 14, 200 - h + 22, x + w / 2 + 14, 200 - h + 22, x + w / 2, 200 - h); x += w }
      g.fillStyle = col; g.fillRect(0, 196, W, 44)
    } else if (depth === 1) {
      for (let i = 0; i < 12; i++) pine(g, rnd() * W, 215, 14 + rnd() * 8, col)
      g.fillRect(0, 212, W, 28)
    } else return c
  }
  return c
}
function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath(); g.arc(x, y, r * 0.6, 0, Math.PI * 2); g.arc(x + r * 0.6, y + 4, r * 0.5, 0, Math.PI * 2); g.arc(x - r * 0.6, y + 5, r * 0.45, 0, Math.PI * 2); g.fill()
  wrap(g, x, r, () => { g.beginPath(); g.arc(x, y, r * 0.6, 0, Math.PI * 2); g.fill() })
}
function wrap(g: CanvasRenderingContext2D, x: number, r: number, fn: () => void) {
  if (x - r < 0) { g.save(); g.translate(512, 0); fn(); g.restore() }
  if (x + r > 512) { g.save(); g.translate(-512, 0); fn(); g.restore() }
}
function tri(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); g.fill() }
function tree(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  const f = () => { g.fillStyle = col; g.fillRect(x - 2, y, 4, 40); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill() }
  f(); wrap(g, x, r, f)
}
function pine(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  const f = () => {
    g.fillStyle = col
    for (let i = 0; i < 3; i++) tri(g, x - r + i * 3, y - i * r * 0.8, x + r - i * 3, y - i * r * 0.8, x, y - (i + 1.4) * r * 0.8)
    g.fillStyle = 'rgba(255,255,255,0.85)'
    for (let i = 0; i < 3; i++) tri(g, x - 4 + i, y - (i + 1) * r * 0.8 - 2, x + 4 - i, y - (i + 1) * r * 0.8 - 2, x, y - (i + 1.4) * r * 0.8)
  }
  f(); wrap(g, x, r, f)
}

// ---------------------------------------------------------------- title art: Pip, big
export function bigFox(scale: number): Img {
  const src = fox(['#46c774', '#2f9e5a']).stand[0]
  const [c, g] = canvas(16 * scale, 16 * scale)
  g.imageSmoothingEnabled = false
  g.drawImage(src, 0, 0, 16 * scale, 16 * scale)
  return c
}
