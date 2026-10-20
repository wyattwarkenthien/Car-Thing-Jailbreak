// Procedurally drawn sprites, 16-bit arcade style: small canvases with shading, drawn once at startup.

export type Img = HTMLCanvasElement

// Sprites are drawn at 2x detail so they stay crisp at the Car Thing's full 800x480.
export const ART_SCALE = 2
function mk(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): Img {
  const c = document.createElement('canvas')
  c.width = w * ART_SCALE
  c.height = h * ART_SCALE
  const g = c.getContext('2d')!
  g.scale(ART_SCALE, ART_SCALE)
  draw(g)
  return c
}

function lin(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const gr = g.createLinearGradient(x0, y0, x1, y1)
  stops.forEach(([o, c]) => gr.addColorStop(o, c))
  return gr
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r)
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r)
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y)
  g.closePath()
}

// ---------------------------------------------------------------- race car, seen from behind
// lean: -1 turning left, 0 straight, 1 turning right
export function car(body: string, dark: string, accent: string, lean: number): Img {
  return mk(96, 56, (g) => {
    const L = lean * 3
    // shadow
    g.fillStyle = 'rgba(0,0,0,0.35)'
    g.beginPath(); g.ellipse ? g.ellipse(48, 52, 46, 5, 0, 0, Math.PI * 2) : g.rect(4, 48, 88, 8); g.fill()
    // rear tyres
    const tyre = (x: number) => {
      g.fillStyle = lin(g, x, 0, x + 22, 0, [[0, '#0b0b0d'], [0.45, '#3a3a40'], [1, '#08080a']])
      rr(g, x, 26, 22, 26, 5); g.fill()
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 3, 30, 16, 2); g.fillRect(x + 3, 38, 16, 2); g.fillRect(x + 3, 46, 16, 2)
    }
    tyre(2); tyre(72)
    // body / sidepods
    g.fillStyle = lin(g, 0, 22, 0, 50, [[0, body], [1, dark]])
    g.beginPath()
    g.moveTo(22, 48); g.lineTo(20 + L, 32); g.lineTo(34 + L, 22); g.lineTo(62 + L, 22); g.lineTo(76 + L, 32); g.lineTo(74, 48)
    g.closePath(); g.fill()
    // engine cover highlight
    g.fillStyle = 'rgba(255,255,255,0.22)'
    g.beginPath(); g.moveTo(38 + L, 23); g.lineTo(58 + L, 23); g.lineTo(54 + L, 34); g.lineTo(42 + L, 34); g.closePath(); g.fill()
    // diffuser + lights
    g.fillStyle = '#1a1a1f'; g.fillRect(28, 42, 40, 7)
    g.fillStyle = '#ff3b30'; g.fillRect(44, 43, 8, 4)
    g.fillStyle = 'rgba(255,120,110,0.5)'; g.fillRect(42, 42, 12, 6)
    // driver helmet
    g.fillStyle = lin(g, 0, 10, 0, 24, [[0, '#ffffff'], [1, '#9aa4b2']])
    g.beginPath(); g.arc(48 + L * 1.5, 18, 7, 0, Math.PI * 2); g.fill()
    g.fillStyle = accent; g.fillRect(41 + L * 1.5, 16, 14, 3)
    // rear wing
    g.fillStyle = '#121216'; g.fillRect(30 + L, 8, 3, 14); g.fillRect(63 + L, 8, 3, 14)
    g.fillStyle = lin(g, 0, 2, 0, 11, [[0, accent], [1, dark]])
    rr(g, 12 + L, 2, 72, 9, 2); g.fill()
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(14 + L, 3, 68, 2)
    // number plate
    g.fillStyle = '#fff'; g.fillRect(43 + L, 27, 10, 7)
    g.fillStyle = dark; g.fillRect(46 + L, 28, 4, 5)
  })
}

// ---------------------------------------------------------------- roadside
export function billboard(text: string, bg: [string, string], fg: string, sub: string): Img {
  return mk(132, 84, (g) => {
    g.fillStyle = lin(g, 0, 0, 10, 0, [[0, '#6b6f78'], [1, '#3b3e45']])
    g.fillRect(22, 50, 8, 34); g.fillRect(102, 50, 8, 34)
    g.fillStyle = '#2a2c31'; rr(g, 2, 2, 128, 56, 4); g.fill()
    g.fillStyle = lin(g, 0, 4, 0, 56, [[0, bg[0]], [1, bg[1]]]); rr(g, 5, 5, 122, 50, 3); g.fill()
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(7, 7, 118, 10)
    g.textAlign = 'center'
    let px = 22
    g.font = 'bold ' + px + 'px Arial, Helvetica, sans-serif'
    while (g.measureText(text).width > 114 && px > 12) { px--; g.font = 'bold ' + px + 'px Arial, Helvetica, sans-serif' }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(text, 67, 35)
    g.fillStyle = fg; g.fillText(text, 66, 34)
    g.font = 'bold 10px Arial, Helvetica, sans-serif'
    g.fillText(sub, 66, 49)
  })
}

export function palm(seed: number): Img {
  return mk(80, 140, (g) => {
    const lean = (seed % 3) - 1
    // trunk
    for (let i = 0; i < 16; i++) {
      const t = i / 16
      const x = 40 + lean * 14 * t * t
      const y = 136 - i * 7
      g.fillStyle = i % 2 ? '#7a5634' : '#8d6640'
      g.beginPath(); g.ellipse ? g.ellipse(x, y, 6 - t * 2, 4, 0, 0, Math.PI * 2) : g.rect(x - 5, y - 4, 10, 8); g.fill()
    }
    const tx = 40 + lean * 14, ty = 26
    // fronds
    const frond = (ang: number, len: number, col: string) => {
      g.strokeStyle = col
      g.lineWidth = 5
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(tx, ty)
      const ex = tx + Math.cos(ang) * len, ey = ty + Math.sin(ang) * len * 0.6 + len * 0.35
      g.quadraticCurveTo(tx + Math.cos(ang) * len * 0.5, ty + Math.sin(ang) * len * 0.5 - 12, ex, ey)
      g.stroke()
    }
    const angs = [-2.9, -2.4, -1.9, -1.2, -0.7, -0.2, 0.3]
    angs.forEach((a, i) => frond(a, 34 + (i % 2) * 6, '#1f6b2a'))
    angs.forEach((a, i) => frond(a + 0.08, 30 + (i % 2) * 6, '#2f9a3a'))
    g.fillStyle = '#5a3a1e'; g.beginPath(); g.arc(tx, ty + 2, 5, 0, Math.PI * 2); g.fill()
  })
}

export function bush(): Img {
  return mk(70, 40, (g) => {
    const blob = (x: number, y: number, r: number, c: string) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill() }
    blob(20, 26, 14, '#1d5e26'); blob(38, 20, 17, '#226b2c'); blob(52, 28, 12, '#1d5e26')
    blob(34, 15, 9, '#3a9a46'); blob(22, 22, 6, '#3a9a46')
  })
}

export function chevron(dir: number): Img {
  // turn warning sign: arrows point the way the road goes
  return mk(64, 56, (g) => {
    g.fillStyle = '#3b3e45'; g.fillRect(29, 34, 6, 22)
    g.fillStyle = '#1a1a1a'; rr(g, 2, 2, 60, 34, 3); g.fill()
    g.fillStyle = '#ffd21f'; rr(g, 4, 4, 56, 30, 2); g.fill()
    g.fillStyle = '#1a1a1a'
    for (let i = 0; i < 3; i++) {
      const cx = 16 + i * 16
      g.beginPath()
      if (dir > 0) { g.moveTo(cx - 6, 8); g.lineTo(cx + 4, 19); g.lineTo(cx - 6, 30); g.lineTo(cx - 1, 30); g.lineTo(cx + 9, 19); g.lineTo(cx - 1, 8) }
      else { g.moveTo(cx + 6, 8); g.lineTo(cx - 4, 19); g.lineTo(cx + 6, 30); g.lineTo(cx + 1, 30); g.lineTo(cx - 9, 19); g.lineTo(cx + 1, 8) }
      g.closePath(); g.fill()
    }
  })
}

export function gantry(): Img {
  // start / finish banner spanning the road
  return mk(320, 96, (g) => {
    g.fillStyle = lin(g, 0, 0, 12, 0, [[0, '#8a8f99'], [1, '#4a4e57']])
    g.fillRect(4, 10, 12, 86); g.fillRect(304, 10, 12, 86)
    g.fillStyle = '#20232a'; g.fillRect(0, 8, 320, 30)
    for (let i = 0; i < 40; i++) for (let j = 0; j < 3; j++) {
      g.fillStyle = (i + j) % 2 ? '#f2f2f2' : '#15161a'
      g.fillRect(i * 8, 10 + j * 8.6, 8, 8.6)
    }
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(110, 12, 100, 22)
    g.font = 'bold 18px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffd21f'
    g.fillText('START', 160, 29)
  })
}

export function explosion(f: number): Img {
  // a few expanding rings of fire and smoke; f in 0..1
  return mk(120, 100, (g) => {
    const cx = 60, cy = 62
    const rad = (r: number, c0: string, c1: string) => {
      const gr = g.createRadialGradient(cx, cy, 2, cx, cy, r)
      gr.addColorStop(0, c0); gr.addColorStop(1, c1)
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill()
    }
    const k = Math.sin(Math.min(1, f) * Math.PI)
    rad(14 + 40 * f, 'rgba(90,90,90,' + (0.7 * k) + ')', 'rgba(60,60,60,0)')
    rad(10 + 26 * k, 'rgba(255,240,170,' + k + ')', 'rgba(255,90,20,0)')
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7 + f * 2
      g.fillStyle = 'rgba(255,' + (120 + i * 12) + ',40,' + k + ')'
      g.beginPath(); g.arc(cx + Math.cos(a) * 30 * f, cy + Math.sin(a) * 22 * f - 10 * f, 5 * (1 - f) + 2, 0, Math.PI * 2); g.fill()
    }
  })
}

// ---------------------------------------------------------------- backdrop (drawn wide so it can scroll)
export function mountains(w: number, h: number): Img {
  return mk(w, h, (g) => {
    const ridge = (base: number, amp: number, seed: number, top: string, bot: string) => {
      g.fillStyle = lin(g, 0, base - amp, 0, h, [[0, top], [1, bot]])
      g.beginPath(); g.moveTo(0, h)
      for (let x = 0; x <= w; x += 4) {
        const y = base - amp * (0.55 + 0.25 * Math.sin(x * 0.011 + seed) + 0.15 * Math.sin(x * 0.031 + seed * 2) + 0.05 * Math.sin(x * 0.09 + seed))
        g.lineTo(x, y)
      }
      g.lineTo(w, h); g.closePath(); g.fill()
    }
    // the big snow-capped peak
    const px = w * 0.3
    g.fillStyle = lin(g, 0, 10, 0, h, [[0, '#6c5f8e'], [1, '#3d3560']])
    g.beginPath(); g.moveTo(px - 150, h); g.lineTo(px - 30, 18); g.quadraticCurveTo(px, 8, px + 30, 18); g.lineTo(px + 150, h); g.closePath(); g.fill()
    g.fillStyle = '#f3eefc'
    g.beginPath(); g.moveTo(px - 30, 18); g.quadraticCurveTo(px, 8, px + 30, 18); g.lineTo(px + 44, 36); g.lineTo(px + 22, 30); g.lineTo(px + 6, 40); g.lineTo(px - 10, 30); g.lineTo(px - 26, 38); g.lineTo(px - 44, 36); g.closePath(); g.fill()
    ridge(h * 0.62, 34, 1.3, '#5b4f7a', '#2f2a4a')
    ridge(h * 0.86, 22, 4.1, '#3b3a5c', '#22233a')
  })
}
