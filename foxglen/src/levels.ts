// Foxglen levels, written with a little builder. Rows are 0 (top) to 14 (bottom); one tile = 16 px.
export const ROWS = 15
export const T = { E: 0, G: 1, S: 2, C: 3, CF: 4, CU: 5, P: 6, TH: 7, A: 10 }
export type EntKind = 'beetle' | 'burr' | 'bee' | 'spider' | 'liftH' | 'liftV' | 'check' | 'goal'
export interface Ent { k: EntKind; x: number; y: number; a?: number } // x,y in tiles; a = range for lifts/bees
export interface Level { id: string; name: string; theme: string; cols: number; map: Uint8Array; ents: Ent[]; time: number }

class B {
  x = 0
  h = 2
  cells: { [k: string]: number } = {}
  ents: Ent[] = []
  set(c: number, r: number, t: number) { if (r >= 0 && r < ROWS && c >= 0) this.cells[c + ',' + r] = t }
  get top() { return ROWS - this.h }
  get on() { return ROWS - this.h - 1 }
  ground(n: number, h?: number) {
    if (h !== undefined) this.h = h
    for (let c = this.x; c < this.x + n; c++) for (let r = this.top; r < ROWS; r++) this.set(c, r, T.G)
    this.x += n
    return this
  }
  gap(n: number) { this.x += n; return this }
  // staircase of stone blocks on top of the ground: heights 1..n (up) or n..1 (down)
  stairs(n: number, up: boolean) {
    this.ground(n)
    for (let i = 0; i < n; i++) {
      const hh = up ? i + 1 : n - i
      for (let k = 0; k < hh; k++) this.set(this.x - n + i, this.top - 1 - k, T.S)
    }
    return this
  }
  stone(c: number, r: number, w = 1, h = 1) { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) this.set(c + i, r + j, T.S); return this }
  plank(c: number, r: number, w: number) { for (let i = 0; i < w; i++) this.set(c + i, r, T.P); return this }
  crate(c: number, r: number, feather = false) { this.set(c, r, feather ? T.CF : T.C); return this }
  crates(c: number, r: number, n: number) { for (let i = 0; i < n; i++) this.set(c + i, r, T.C); return this }
  thorns(c: number, r: number, w: number) { for (let i = 0; i < w; i++) this.set(c + i, r, T.TH); return this }
  acorns(c: number, r: number, n: number) { for (let i = 0; i < n; i++) this.set(c + i, r, T.A); return this }
  arc(c: number, r: number, n: number) {
    for (let i = 0; i < n; i++) { const t = n > 1 ? i / (n - 1) : 0.5; this.set(c + i, r - Math.round(Math.sin(t * Math.PI) * 2), T.A) }
    return this
  }
  e(k: EntKind, c: number, r?: number, a?: number) { this.ents.push({ k, x: c, y: r === undefined ? this.on : r, a }); return this }
  ceiling(rows: number) { for (let c = 0; c < this.x; c++) for (let r = 0; r < rows; r++) if (!this.cells[c + ',' + r]) this.set(c, r, T.S); return this }
  done(id: string, name: string, theme: string, time: number): Level {
    const cols = this.x
    const map = new Uint8Array(cols * ROWS)
    for (const k in this.cells) { const p = k.split(','); const c = +p[0], r = +p[1]; if (c < cols) map[r * cols + c] = this.cells[k] }
    return { id, name, theme, cols, map, ents: this.ents, time }
  }
}

// ---------------------------------------------------------------- 1-1 Meadow Run: learn to run, jump and stomp
function meadow(): Level {
  const b = new B()
  let x = b.x
  b.ground(22)
  b.crate(x + 9, 9).crate(x + 10, 9, true).crate(x + 11, 9)
  b.arc(x + 14, 10, 4)
  b.e('beetle', x + 19)
  b.gap(2)
  x = b.x; b.ground(16)
  b.stone(x + 5, b.on - 1, 1, 2)
  b.arc(x + 3, 9, 5)
  b.e('beetle', x + 9).e('beetle', x + 12)
  b.acorns(x + 11, 9, 3)
  b.gap(3)
  x = b.x; b.ground(12)
  b.plank(x + 2, 9, 5).acorns(x + 2, 8, 5)
  b.e('beetle', x + 9)
  x = b.x; b.stairs(4, true)
  b.gap(2)
  x = b.x; b.stairs(4, false)
  b.acorns(x - 4, 6, 2)
  x = b.x; b.ground(14)
  b.crates(x + 3, 9, 3).crate(x + 4, 5)
  b.e('bee', x + 10, 9, 2)
  b.e('beetle', x + 12)
  b.gap(3)
  x = b.x; b.ground(10)
  b.e('check', x + 3)
  b.acorns(x + 6, 11, 3)
  b.gap(2)
  x = b.x; b.ground(5, 4)
  b.gap(2)
  x = b.x; b.ground(5, 6)
  b.arc(x, 6, 5)
  b.gap(3)
  x = b.x; b.ground(16, 2)
  b.thorns(x + 4, b.on, 2)
  b.e('beetle', x + 9).e('beetle', x + 11).e('beetle', x + 13)
  b.plank(x + 8, 9, 6).acorns(x + 8, 8, 6)
  b.gap(4)
  x = b.x; b.ground(12)
  b.crate(x + 3, 9).crate(x + 4, 9, true).crate(x + 5, 9)
  b.e('bee', x + 9, 8, 3)
  b.gap(2)
  x = b.x; b.ground(4, 3)
  b.gap(3)
  x = b.x; b.ground(4, 4)
  b.acorns(x, 8, 4)
  b.gap(3)
  x = b.x; b.ground(14, 2)
  b.e('beetle', x + 5).e('burr', x + 9)
  b.arc(x + 4, 8, 6)
  x = b.x; b.stairs(5, true)
  b.ground(2)
  b.stone(b.x - 2, b.on - 4, 2, 5)
  b.gap(3)
  x = b.x; b.ground(24)
  b.e('goal', x + 14)
  return b.done('1-1', 'Meadow Run', 'meadow', 300)
}

// ---------------------------------------------------------------- 1-2 The Hollow: caves, spiders, thorns
function hollow(): Level {
  const b = new B()
  let x = b.x
  b.ground(16)
  b.arc(x + 9, 10, 4)
  b.e('beetle', x + 13)
  x = b.x; b.ground(10)
  b.thorns(x + 3, b.on, 2)
  b.e('spider', x + 7, 3)
  b.crate(x + 6, 9, true)
  b.gap(3)
  x = b.x; b.ground(12)
  b.stone(x + 2, 8, 3, 1).acorns(x + 2, 7, 3)
  b.e('burr', x + 8)
  b.e('spider', x + 10, 3)
  x = b.x; b.ground(6, 1)
  b.thorns(x, b.on, 6)
  b.plank(x + 1, 10, 4).acorns(x + 1, 9, 4)
  x = b.x; b.ground(10, 2)
  b.e('beetle', x + 4).e('beetle', x + 6)
  b.stone(x + 7, b.on - 2, 2, 3)
  b.gap(3)
  x = b.x; b.ground(4, 3)
  b.gap(3)
  x = b.x; b.ground(4, 5)
  b.acorns(x, 7, 4)
  b.gap(3)
  x = b.x; b.ground(12, 2)
  b.e('check', x + 2)
  b.crates(x + 5, 9, 2).crate(x + 7, 9, true)
  b.e('spider', x + 9, 3)
  b.e('burr', x + 10)
  x = b.x; b.ground(8, 1)
  b.thorns(x, b.on, 8)
  b.plank(x + 1, 10, 2).plank(x + 5, 9, 2)
  b.acorns(x + 5, 8, 2)
  x = b.x; b.ground(14, 2)
  b.e('beetle', x + 3).e('spider', x + 6, 3).e('beetle', x + 8).e('spider', x + 11, 3)
  b.arc(x + 4, 9, 7)
  b.gap(2)
  x = b.x; b.gap(6)
  b.e('liftH', x, 10, 4)
  b.acorns(x + 1, 6, 5)
  x = b.x; b.ground(10)
  b.e('burr', x + 5).e('burr', x + 7)
  b.stone(x + 3, 9, 4, 1)
  x = b.x; b.stairs(4, true)
  b.gap(3)
  x = b.x; b.ground(4, 6)
  b.e('spider', x + 2, 3)
  b.gap(2)
  x = b.x; b.ground(0, 2).stairs(4, false)
  x = b.x; b.ground(24, 2)
  b.e('goal', x + 14)
  b.ceiling(2)
  return b.done('1-2', 'The Hollow', 'hollow', 300)
}

// ---------------------------------------------------------------- 1-3 Canopy: treetop hopping, lifts and bees
function canopy(): Level {
  const b = new B()
  let x = b.x
  b.ground(14, 3)
  b.crate(x + 8, 7, true)
  b.arc(x + 10, 8, 3)
  b.gap(3)
  x = b.x; b.ground(5, 4)
  b.e('bee', x + 3, 7, 2)
  b.gap(3)
  x = b.x; b.ground(5, 5)
  b.acorns(x + 1, 7, 3)
  b.gap(2)
  x = b.x; b.gap(7)
  b.e('liftH', x, 8, 4)
  b.arc(x + 1, 6, 6)
  x = b.x; b.ground(8, 4)
  b.e('beetle', x + 5)
  b.plank(x + 2, 6, 4).acorns(x + 2, 5, 4)
  b.gap(3)
  x = b.x; b.ground(3, 3)
  b.gap(3)
  x = b.x; b.ground(3, 5)
  b.gap(3)
  x = b.x; b.ground(10, 4)
  b.e('check', x + 2)
  b.e('bee', x + 7, 6, 2)
  b.crates(x + 4, 6, 2)
  x = b.x; b.gap(4)
  b.e('liftV', x + 1, 9, 4)
  x = b.x; b.ground(6, 7)
  b.e('beetle', x + 3)
  b.acorns(x + 1, 4, 4)
  b.gap(3)
  x = b.x; b.ground(4, 6)
  b.gap(2)
  x = b.x; b.gap(9)
  b.e('liftH', x, 9, 6)
  b.e('bee', x + 4, 5, 3)
  b.arc(x + 2, 7, 5)
  x = b.x; b.ground(12, 3)
  b.crate(x + 3, 7).crate(x + 4, 7, true)
  b.e('burr', x + 7).e('beetle', x + 9)
  b.gap(3)
  x = b.x; b.ground(3, 4)
  b.gap(4)
  x = b.x; b.ground(3, 4)
  b.e('bee', x - 2, 7, 1)
  b.gap(4)
  x = b.x; b.ground(3, 4)
  b.acorns(x, 7, 3)
  b.gap(3)
  x = b.x; b.ground(24, 3)
  b.e('goal', x + 14)
  return b.done('1-3', 'Canopy', 'canopy', 300)
}

// ---------------------------------------------------------------- 1-4 Frostpeak: slippery, everything at once
function frost(): Level {
  const b = new B()
  let x = b.x
  b.ground(16)
  b.e('beetle', x + 12)
  b.crate(x + 7, 9, true)
  b.gap(3)
  x = b.x; b.ground(12)
  b.e('burr', x + 5).e('beetle', x + 8)
  b.plank(x + 3, 9, 5).acorns(x + 3, 8, 5)
  x = b.x; b.stairs(3, true)
  b.gap(3)
  x = b.x; b.ground(6, 5)
  b.e('bee', x + 3, 6, 2)
  b.gap(3)
  x = b.x; b.ground(10, 2)
  b.thorns(x + 3, b.on, 3)
  b.e('beetle', x + 7)
  x = b.x; b.gap(7)
  b.e('liftV', x + 1, 12, 4)
  b.acorns(x + 1, 6, 3)
  x = b.x; b.ground(12, 3)
  b.e('check', x + 2)
  b.crates(x + 5, 8, 3).crate(x + 6, 4, true)
  b.e('burr', x + 9)
  b.gap(2)
  x = b.x; b.ground(4, 4)
  b.gap(3)
  x = b.x; b.ground(4, 4)
  b.e('bee', x - 2, 6, 2)
  b.gap(2)
  x = b.x; b.ground(14, 2)
  b.e('beetle', x + 3).e('burr', x + 6).e('beetle', x + 9).e('beetle', x + 11)
  b.arc(x + 2, 9, 9)
  b.gap(2)
  x = b.x; b.gap(8)
  b.e('liftH', x, 9, 5)
  b.e('bee', x + 4, 5, 3)
  x = b.x; b.ground(8, 3)
  b.thorns(x + 2, b.on, 2)
  b.e('spider', x + 6, 1)
  x = b.x; b.stairs(5, true)
  b.gap(3)
  x = b.x; b.ground(4, 7)
  b.acorns(x, 5, 4)
  b.gap(3)
  x = b.x; b.ground(0, 2).stairs(5, false)
  x = b.x; b.ground(26, 2)
  b.e('goal', x + 16)
  return b.done('1-4', 'Frostpeak', 'frost', 300)
}

export const LEVELS = [meadow, hollow, canopy, frost]
