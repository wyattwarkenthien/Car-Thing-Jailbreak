// Canvas drawing helpers and procedural pixel art (all original).
export const W = 800
export const H = 480
export const C = {
  bg: '#1b130c', panel: '#2a1e13', panel2: '#35261a', line: '#5f4a33', text: '#f4e6c8', dim: '#b39d7c', faint: '#7d6a52',
  accent: '#e8a845', accent2: '#f3c46b', red: '#d9634a', green: '#9cc174', blue: '#7fb4d9', sel: '#4a3522',
}
export const FONT = 'VT323, "Courier New", monospace'

export type G = CanvasRenderingContext2D

export function text(g: G, s: string, x: number, y: number, size = 26, color = C.text, align: CanvasTextAlign = 'left', base: CanvasTextBaseline = 'alphabetic') {
  g.font = `${size}px ${FONT}`
  g.fillStyle = color
  g.textAlign = align
  g.textBaseline = base
  g.fillText(s, x, y)
}

export function wrap(g: G, s: string, maxW: number, size = 26): string[] {
  g.font = `${size}px ${FONT}`
  const out: string[] = []
  for (const para of s.split('\n')) {
    const words = para.split(' ')
    let line = ''
    for (const w of words) {
      const t = line ? line + ' ' + w : w
      if (g.measureText(t).width > maxW && line) { out.push(line); line = w } else line = t
    }
    out.push(line)
  }
  return out
}

export function para(g: G, s: string, x: number, y: number, maxW: number, size = 26, color = C.text, lh = 1.05) {
  const lines = wrap(g, s, maxW, size)
  lines.forEach((l, i) => text(g, l, x, y + i * size * lh, size, color))
  return lines.length * size * lh
}

export function rect(g: G, x: number, y: number, w: number, h: number, color: string) { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)) }

export function frame(g: G, x: number, y: number, w: number, h: number, fill = C.panel, stroke = C.line) {
  rect(g, x, y, w, h, fill)
  g.strokeStyle = stroke; g.lineWidth = 2
  g.strokeRect(x + 1, y + 1, w - 2, h - 2)
  // notched corners for a woodcut feel
  rect(g, x, y, 4, 4, C.bg); rect(g, x + w - 4, y, 4, 4, C.bg); rect(g, x, y + h - 4, 4, 4, C.bg); rect(g, x + w - 4, y + h - 4, 4, 4, C.bg)
}

export function bar(g: G, x: number, y: number, w: number, h: number, frac: number, color: string) {
  rect(g, x, y, w, h, '#120c07')
  rect(g, x + 2, y + 2, Math.max(0, (w - 4) * Math.max(0, Math.min(1, frac))), h - 4, color)
}

// Pixel sprite renderer: rows of chars mapped to palette
export function sprite(g: G, rows: string[], pal: Record<string, string>, x: number, y: number, px = 3, flip = false) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]
      if (ch === '.' || ch === ' ') continue
      const col = pal[ch]; if (!col) continue
      const cx = flip ? row.length - 1 - c : c
      g.fillStyle = col
      g.fillRect(Math.round(x + cx * px), Math.round(y + r * px), px, px)
    }
  }
}

const WAGON = [
  '.......wwwwwwwwwwwwww.......',
  '.....wwWWWWWWWWWWWWWWww.....',
  '....wWWWWWWWWWWWWWWWWWWw....',
  '...wWWWWWWWWWWWWWWWWWWWWw...',
  '...wWWWWwWWWWWwWWWWWwWWWw...',
  '...wWWWWwWWWWWwWWWWWwWWWw...',
  '...wWWWWwWWWWWwWWWWWwWWWw...',
  '..bbbbbbbbbbbbbbbbbbbbbbbb..',
  '..bBBBBBBBBBBBBBBBBBBBBBBb..',
  '..bBBBBBBBBBBBBBBBBBBBBBBbtt',
  '..bbbbbbbbbbbbbbbbbbbbbbbbtt',
]
const WHEEL_A = ['..kkkk..', '.k.kk.k.', 'k..kk..k', 'kkkkkkkk', 'kkkkkkkk', 'k..kk..k', '.k.kk.k.', '..kkkk..']
const WHEEL_B = ['..kkkk..', '.kk..kk.', 'k.k..k.k', 'k..kk..k', 'k..kk..k', 'k.k..k.k', '.kk..kk.', '..kkkk..']
const WAGON_PAL = { w: '#cdbb98', W: '#efe3c6', b: '#5a3a1e', B: '#7d5430', t: '#5a3a1e', k: '#2b1d10' }

export function drawWagon(g: G, x: number, y: number, t: number, px = 3, tipped = false) {
  g.save()
  if (tipped) { g.translate(x + 40 * px / 3, y + 30); g.rotate(-0.5); g.translate(-(x + 40 * px / 3), -(y + 30)) }
  sprite(g, WAGON, WAGON_PAL, x, y, px)
  const wh = Math.floor(t * 6) % 2 === 0 ? WHEEL_A : WHEEL_B
  sprite(g, wh, WAGON_PAL, x + 3 * px, y + 9 * px, px)
  sprite(g, wh, WAGON_PAL, x + 17 * px, y + 9 * px, px)
  g.restore()
}

const OX_A = [
  '..hh.............',
  '.hhoooooooooooo..',
  'ohooOOOOOOOOOOOoo',
  'oooOOOOOOOOOOOOOo',
  '.ooOOOOOOOOOOOOo.',
  '..oOOOOOOOOOOOOo.',
  '..oo.oo....oo.oo.',
  '..oo..oo..oo...oo',
]
const OX_B = [
  '..hh.............',
  '.hhoooooooooooo..',
  'ohooOOOOOOOOOOOoo',
  'oooOOOOOOOOOOOOOo',
  '.ooOOOOOOOOOOOOo.',
  '..oOOOOOOOOOOOOo.',
  '..oo.oo....oo.oo.',
  '.oo...oo.oo...oo.',
]
const OX_PAL = { h: '#e8dcc0', o: '#3a2616', O: '#6b4428' }
export function drawOx(g: G, x: number, y: number, t: number, px = 3, moving = true) {
  sprite(g, moving && Math.floor(t * 6) % 2 ? OX_B : OX_A, OX_PAL, x, y, px)
}

export function drawPerson(g: G, x: number, y: number, t: number, color = '#8a5a3a', px = 3, moving = true) {
  const step = moving ? Math.floor(t * 6) % 2 : 0
  const rows = ['.hh.', 'hhhh', '.ff.', 'cccc', 'cccc', 'cccc', step ? 'l..l' : '.ll.', step ? 'l..l' : '.ll.']
  sprite(g, rows, { h: '#3b2a1a', f: '#e2b48a', c: color, l: '#2b1d10' }, x, y, px)
}

// Scenery ---------------------------------------------------------------
export function sky(g: G, y0: number, h: number, mood: 'day' | 'storm' | 'snow' | 'dusk' | 'hot') {
  const grad = g.createLinearGradient(0, y0, 0, y0 + h)
  const pal = { day: ['#5d93c2', '#b9d4e6'], storm: ['#3b4552', '#76808a'], snow: ['#8e9aa6', '#d7dde2'], dusk: ['#3a2a52', '#e39a5a'], hot: ['#c9a25e', '#f1dca0'] }[mood]
  grad.addColorStop(0, pal[0]); grad.addColorStop(1, pal[1])
  g.fillStyle = grad; g.fillRect(0, y0, W, h)
}

function hash(n: number) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x) }

export function ridge(g: G, yBase: number, amp: number, scale: number, offset: number, color: string, seed: number, jag = 0) {
  g.fillStyle = color
  g.beginPath(); g.moveTo(0, H)
  for (let x = 0; x <= W; x += 8) {
    const u = (x + offset) / scale
    const i = Math.floor(u); const f = u - i
    const a = hash(i + seed); const b = hash(i + 1 + seed)
    const s = f * f * (3 - 2 * f)
    let y = yBase - (a + (b - a) * s) * amp
    if (jag) y -= Math.abs(Math.sin((x + offset) * 0.05)) * jag
    g.lineTo(x, Math.round(y / 4) * 4)
  }
  g.lineTo(W, H); g.closePath(); g.fill()
}

export function landscape(g: G, region: string, y0: number, h: number, scroll: number, mood: 'day' | 'storm' | 'snow' | 'dusk' | 'hot') {
  g.save(); g.beginPath(); g.rect(0, y0, W, h); g.clip()
  landscapeInner(g, region, y0, h, scroll, mood)
  g.restore()
}
function landscapeInner(g: G, region: string, y0: number, h: number, scroll: number, mood: 'day' | 'storm' | 'snow' | 'dusk' | 'hot') {
  sky(g, y0, h, mood)
  const gy = y0 + h * 0.72
  const snow = mood === 'snow'
  const far = { prairie: '#7d9a7a', plains: '#a9a27a', rockies: '#6f7a8e', snake: '#b29a72', cascades: '#4f6a5c' }[region] || '#7d9a7a'
  const mid = { prairie: '#5d7d4c', plains: '#8a8452', rockies: '#556070', snake: '#93784e', cascades: '#3c5a42' }[region] || '#5d7d4c'
  const ground = snow ? '#e4e6e6' : ({ prairie: '#6f8f45', plains: '#a39a5a', rockies: '#7d7a5a', snake: '#b89c64', cascades: '#4f7a3e' }[region] || '#6f8f45')
  if (region === 'rockies' || region === 'cascades') {
    ridge(g, gy - 10, h * 0.5, 160, scroll * 0.15, far, 3, 20)
    if (snow || region === 'rockies') { g.save(); g.globalCompositeOperation = 'source-atop'; g.restore() }
  } else ridge(g, gy - 6, h * 0.18, 220, scroll * 0.15, far, 3)
  ridge(g, gy + 4, h * 0.12, 120, scroll * 0.4, mid, 11)
  rect(g, 0, gy + 4, W, y0 + h - gy - 4, ground)
  // trail ruts
  rect(g, 0, y0 + h - 26, W, 3, snow ? '#c9cccc' : '#6a5536')
  rect(g, 0, y0 + h - 14, W, 3, snow ? '#c9cccc' : '#6a5536')
  // tufts / trees scrolling
  for (let i = 0; i < 14; i++) {
    const x = ((i * 97 - scroll) % (W + 60) + W + 60) % (W + 60) - 30
    const yy = gy + 14 + (i % 3) * 14
    if (region === 'cascades' || (region === 'rockies' && i % 3 === 0)) tree(g, x, yy, snow)
    else tuft(g, x, yy, snow ? '#b8bcbc' : region === 'snake' || region === 'plains' ? '#8a8048' : '#4e6e32')
  }
}

export function tuft(g: G, x: number, y: number, color: string) { rect(g, x, y, 3, 6, color); rect(g, x + 4, y - 3, 3, 9, color); rect(g, x + 8, y, 3, 6, color) }
export function tree(g: G, x: number, y: number, snow = false) {
  const c = '#24442c'; const s = snow ? '#e9eeee' : c
  rect(g, x + 8, y + 18, 5, 8, '#4a3020')
  rect(g, x + 6, y, 9, 6, c); rect(g, x + 3, y + 6, 15, 6, c); rect(g, x, y + 12, 21, 7, c)
  if (snow) { rect(g, x + 6, y, 9, 2, s); rect(g, x + 3, y + 6, 15, 2, s); rect(g, x, y + 12, 21, 2, s) }
}

export function weatherFx(g: G, kind: string, t: number, y0: number, h: number) {
  if (kind.indexOf('rain') >= 0) {
    g.fillStyle = 'rgba(200,220,240,0.6)'
    const n = kind.indexOf('heavy') >= 0 ? 90 : 45
    for (let i = 0; i < n; i++) { const x = (hash(i) * W + t * 60) % W; const y = y0 + ((hash(i + 50) * h + t * 500) % h); g.fillRect(x, y, 2, 10) }
  } else if (kind.indexOf('snow') >= 0) {
    g.fillStyle = 'rgba(255,255,255,0.9)'
    const n = kind.indexOf('heavy') >= 0 ? 110 : 55
    for (let i = 0; i < n; i++) { const x = (hash(i) * W + Math.sin(t + i) * 20 + t * 30) % W; const y = y0 + ((hash(i + 70) * h + t * 70) % h); g.fillRect(x, y, 3, 3) }
  }
}

// Landmark illustrations -----------------------------------------------
export function landmarkArt(g: G, scene: string, y0: number, h: number, t: number) {
  g.save(); g.beginPath(); g.rect(0, y0, W, h); g.clip()
  landmarkInner(g, scene, y0, h, t)
  g.restore()
}
function landmarkInner(g: G, scene: string, y0: number, h: number, t: number) {
  const gy = y0 + h * 0.74
  switch (scene) {
    case 'town': {
      sky(g, y0, h, 'day'); ridge(g, gy, 20, 200, 0, '#7d9a7a', 5); rect(g, 0, gy, W, h - (gy - y0), '#7a6a44')
      const cols = ['#8a5a3a', '#a0704a', '#6e4a30', '#9a8a6a', '#7a5a3a']
      for (let i = 0; i < 7; i++) { const x = 40 + i * 108; const bh = 70 + (i % 3) * 22; rect(g, x, gy - bh, 92, bh, cols[i % 5]); rect(g, x - 4, gy - bh - 8, 100, 10, '#3b2a1a'); for (let k = 0; k < 3; k++) rect(g, x + 10 + k * 28, gy - bh + 18, 14, 18, '#f2d58a'); rect(g, x + 38, gy - 30, 16, 30, '#3b2a1a') }
      drawWagon(g, 300, gy - 4, t, 3); drawOx(g, 390, gy + 8, t, 3, false); drawPerson(g, 250, gy + 6, t, '#5a6a8a', 3, false)
      break
    }
    case 'river': case 'dalles': {
      sky(g, y0, h, 'day'); ridge(g, gy - 20, scene === 'dalles' ? 90 : 30, 140, 0, scene === 'dalles' ? '#6a5a4a' : '#7d9a7a', 9, scene === 'dalles' ? 10 : 0)
      rect(g, 0, gy - 18, W, 30, '#7a8a4a')
      const wg = g.createLinearGradient(0, gy, 0, y0 + h); wg.addColorStop(0, '#3e6e96'); wg.addColorStop(1, '#2a4a6a'); g.fillStyle = wg; g.fillRect(0, gy + 8, W, y0 + h - gy - 8)
      g.fillStyle = 'rgba(220,235,250,0.5)'
      for (let i = 0; i < 30; i++) { const x = (hash(i) * W + t * 40 * (1 + hash(i + 3))) % W; const y = gy + 16 + hash(i + 9) * (y0 + h - gy - 24); g.fillRect(x, y, 18, 2) }
      if (scene === 'dalles') { for (let i = 0; i < 5; i++) tree(g, 600 + i * 34, gy - 46 + (i % 2) * 6) }
      break
    }
    case 'fort': {
      sky(g, y0, h, 'day'); ridge(g, gy, 26, 180, 0, '#a9a27a', 13); rect(g, 0, gy, W, h - (gy - y0), '#9a8a58')
      const fx = 230, fw = 340, fh = 90
      rect(g, fx, gy - fh, fw, fh, '#b48a5a'); for (let i = 0; i < fw; i += 14) rect(g, fx + i, gy - fh - 10, 8, 10, '#b48a5a')
      rect(g, fx - 30, gy - fh - 40, 50, fh + 40, '#9a7448'); rect(g, fx + fw - 20, gy - fh - 40, 50, fh + 40, '#9a7448')
      rect(g, fx - 36, gy - fh - 50, 62, 12, '#5a3a20'); rect(g, fx + fw - 26, gy - fh - 50, 62, 12, '#5a3a20')
      rect(g, fx + fw / 2 - 26, gy - 56, 52, 56, '#4a3018')
      rect(g, fx + fw / 2 - 1, gy - fh - 80, 3, 70, '#3b2a1a')
      const wave = Math.sin(t * 3) * 3; rect(g, fx + fw / 2 + 2, gy - fh - 78 + wave * 0.2, 34, 20, '#c0503a'); rect(g, fx + fw / 2 + 2, gy - fh - 72, 34, 4, '#efe3c6')
      drawWagon(g, 610, gy - 4, t, 3); drawPerson(g, 180, gy + 6, t, '#4a5a7a', 3, false)
      break
    }
    case 'chimney': {
      sky(g, y0, h, 'hot'); ridge(g, gy, 30, 200, 0, '#c2a77a', 21); rect(g, 0, gy, W, h - (gy - y0), '#a89860')
      g.fillStyle = '#b8865a'; g.beginPath(); g.moveTo(300, gy); g.lineTo(360, gy - 70); g.lineTo(440, gy - 70); g.lineTo(500, gy); g.fill()
      rect(g, 384, gy - 190, 32, 122, '#b07a50'); rect(g, 390, gy - 205, 20, 18, '#b07a50'); rect(g, 384, gy - 190, 6, 122, '#8e5e3a')
      drawWagon(g, 120, gy - 4, t, 2)
      break
    }
    case 'rock': {
      sky(g, y0, h, 'day'); rect(g, 0, gy, W, h - (gy - y0), '#a39a5a')
      g.fillStyle = '#8a8478'; g.beginPath(); g.ellipse(400, gy + 6, 240, 90, 0, Math.PI, 0); g.fill()
      g.fillStyle = '#a19a8c'; g.beginPath(); g.ellipse(380, gy, 200, 70, 0, Math.PI, 0); g.fill()
      for (let i = 0; i < 9; i++) text(g, ['J.B.', 'Wm.', '1847', 'O.C.', 'M+R', 'Tenn', '1845', 'H.L.', 'Ohio'][i], 230 + i * 36, gy - 20 - (i % 3) * 14, 18, '#3b2a1a')
      drawWagon(g, 640, gy - 4, t, 2)
      break
    }
    case 'pass': {
      sky(g, y0, h, 'day'); ridge(g, gy - 30, 120, 150, 40, '#6f7a8e', 4, 30); ridge(g, gy, 30, 300, 0, '#8a9068', 8); rect(g, 0, gy + 10, W, h, '#8a8a60')
      for (let i = 0; i < 6; i++) { const x = 90 + i * 130; rect(g, x, gy - 110 - (i % 2) * 20, 30, 10, '#eef2f4') }
      drawWagon(g, 360, gy, t, 3)
      break
    }
    case 'springs': {
      sky(g, y0, h, 'day'); ridge(g, gy, 60, 160, 0, '#6f7a8e', 6, 10); rect(g, 0, gy, W, h - (gy - y0), '#9aa070')
      for (let i = 0; i < 4; i++) { const x = 160 + i * 150; g.fillStyle = '#d8d0b0'; g.beginPath(); g.ellipse(x, gy + 30, 50, 12, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#7fb4d9'; g.beginPath(); g.ellipse(x, gy + 30, 38, 8, 0, 0, Math.PI * 2); g.fill() }
      const jet = 60 + Math.sin(t * 5) * 20; rect(g, 456, gy + 26 - jet, 8, jet, 'rgba(230,240,250,0.85)'); g.fillStyle = 'rgba(230,240,250,0.5)'; g.beginPath(); g.arc(460, gy + 26 - jet, 16, 0, Math.PI * 2); g.fill()
      break
    }
    case 'mountains': {
      sky(g, y0, h, 'day'); ridge(g, gy - 40, 140, 120, 10, '#3e5470', 12, 40); ridge(g, gy, 60, 90, 0, '#2c4a36', 3, 10); rect(g, 0, gy + 10, W, h, '#3c5a32')
      for (let i = 0; i < 18; i++) tree(g, i * 46 + (i % 2) * 10, gy - 20 + (i % 3) * 14)
      break
    }
    case 'valley': {
      sky(g, y0, h, 'dusk'); ridge(g, gy - 30, 110, 180, 0, '#4a5a72', 2, 40); ridge(g, gy, 30, 160, 0, '#3e6a3a', 8)
      for (let i = 0; i < 6; i++) rect(g, 0, gy + i * 14, W, 7, i % 2 ? '#5f8a3a' : '#4f7a2e')
      for (let i = 0; i < 8; i++) tree(g, 30 + i * 100, gy - 26)
      rect(g, 560, gy - 40, 60, 40, '#8a5a3a'); rect(g, 552, gy - 50, 76, 12, '#4a3020'); rect(g, 600, gy - 66, 10, 18, '#4a3020')
      g.fillStyle = 'rgba(220,220,220,0.5)'; g.beginPath(); g.arc(606 + Math.sin(t) * 4, gy - 80 - (t * 10 % 20), 7, 0, Math.PI * 2); g.fill()
      drawWagon(g, 300, gy + 30, t, 3); drawOx(g, 390, gy + 42, t, 3, false)
      break
    }
    default: sky(g, y0, h, 'day')
  }
}

export function tombstone(g: G, x: number, y: number) {
  rect(g, x, y + 10, 70, 80, '#9a9a90'); g.fillStyle = '#9a9a90'; g.beginPath(); g.arc(x + 35, y + 12, 35, Math.PI, 0); g.fill()
  rect(g, x + 31, y + 10, 8, 40, '#5a5a52'); rect(g, x + 18, y + 22, 34, 8, '#5a5a52')
}
