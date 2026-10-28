// The Legend of Sting: the world. 25 x 14 tiles per screen. Overworld is a 4 x 3 grid; dungeons are linked rooms.
export const COLS = 25, ROWS = 14
export type Dirn = 'n' | 's' | 'e' | 'w'
export interface Ent { k: string; x: number; y: number; [p: string]: unknown }
export interface Screen { id: string; area: string; theme: string; grid: string[]; links: { [d in Dirn]?: string }; ents: Ent[]; dark?: boolean; checkpoint?: boolean }

// walkable tiles (others are solid). Gates, shutters and locks are decided at runtime.
export const WALK = '.d,a:s_=|cvg'

class M {
  g: string[][]
  prot: boolean[][]
  constructor(public ground: string) {
    this.g = []; this.prot = []
    for (let y = 0; y < ROWS; y++) { this.g.push(new Array(COLS).fill(ground)); this.prot.push(new Array(COLS).fill(false)) }
  }
  set(x: number, y: number, ch: string, protect = false) { if (x >= 0 && y >= 0 && x < COLS && y < ROWS) { this.g[y][x] = ch; if (protect) this.prot[y][x] = true } return this }
  fill(x: number, y: number, w: number, h: number, ch: string, protect = false) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, ch, protect); return this }
  clear(x: number, y: number, w: number, h: number) { return this.fill(x, y, w, h, this.ground, true) }
  // outer wall with 3-wide openings (N/S at cols 11-13) and 2-tall openings (E/W at rows 6-7)
  border(ch: string, open: string, thick = 1) {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const edge = x < thick || y < thick || x >= COLS - thick || y >= ROWS - thick
      if (!edge) continue
      const gapN = y < thick && x >= 11 && x <= 13 && open.indexOf('n') >= 0
      const gapS = y >= ROWS - thick && x >= 11 && x <= 13 && open.indexOf('s') >= 0
      const gapW = x < thick && y >= 6 && y <= 7 && open.indexOf('w') >= 0
      const gapE = x >= COLS - thick && y >= 6 && y <= 7 && open.indexOf('e') >= 0
      if (gapN || gapS || gapW || gapE) this.set(x, y, this.ground, true)
      else this.set(x, y, ch)
    }
    return this
  }
  // a path between points (horizontal then vertical legs), 2 wide, protected from scatter
  path(pts: [number, number][], ch = ':') {
    for (let i = 1; i < pts.length; i++) {
      let [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i]
      while (x0 !== x1) { this.set(x0, y0, ch, true); this.set(x0, y0 + 1, ch, true); x0 += Math.sign(x1 - x0) }
      while (y0 !== y1) { this.set(x0, y0, ch, true); this.set(x0 + 1, y0, ch, true); y0 += Math.sign(y1 - y0) }
      this.set(x1, y1, ch, true); this.set(x1 + 1, y1, ch, true); this.set(x1, y1 + 1, ch, true)
    }
    return this
  }
  stamp(x: number, y: number, rows: string[], protect = true) {
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== ' ') this.set(x + i, y + j, r[i], protect) })
    return this
  }
  scatter(ch: string, n: number, seed: number) {
    let s = seed
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
    let tries = 0
    while (n > 0 && tries++ < 2000) {
      const x = 2 + Math.floor(r() * (COLS - 4)), y = 2 + Math.floor(r() * (ROWS - 4))
      if (this.prot[y][x] || this.g[y][x] !== this.ground) continue
      this.set(x, y, ch); n--
    }
    return this
  }
  rows() { return this.g.map((r) => r.join('')) }
}

const burrow = ['  HHH  ', ' HHHHH ', 'HHWOWHH']
const S: Screen[] = []
function add(id: string, area: string, theme: string, m: M, links: Screen['links'], ents: Ent[], extra: Partial<Screen> = {}) {
  S.push(Object.assign({ id, area, theme, grid: m.rows(), links, ents }, extra))
}
const E = (k: string, x: number, y: number, p: { [k: string]: unknown } = {}): Ent => Object.assign({ k, x, y }, p)

// ================================================================ overworld
// o11  Bramblewick, the village (start)
{
  const m = new M('.').border('T', 'nsew')
  m.path([[0, 6], [24, 6]]).path([[11, 0], [11, 13]])
  m.stamp(2, 1, burrow).stamp(16, 1, burrow).stamp(2, 9, burrow)
  m.clear(3, 4, 5, 1).clear(17, 4, 5, 1).clear(3, 12, 5, 1)
  m.stamp(16, 9, ['FFFFFFF'], true) // market stall counter
  m.set(9, 4, 'S', true)
  m.scatter(',', 8, 3).scatter('B', 4, 9)
  add('o11', 'Bramblewick', 'green', m, { n: 'o10', s: 'o12', e: 'o21', w: 'o01' }, [
    E('npc', 14, 4, { who: 'elder', id: 'elder', say: [
      'Sting! Thank the stars you are awake.',
      'Last night the Ash King\'s goblins crept into Bramblewick and stole the Dawnstone from the hearth hall.',
      'Without it the fields will grey and the winter will never lift.',
      'Take your sword. Seek a bow in the old Barrow to the southwest, then cross the river east, past the troll who guards the bridge.',
      'The Ashen Keep lies beyond the burning plains, in the far northeast. Be careful, little one.',
    ] }),
    E('npc', 19, 8, { who: 'shop', say: ['Welcome to Mossbottom\'s! Walk into what you want to buy.'] }),
    E('shop', 17, 10, { item: 'potion', price: 20 }),
    E('shop', 21, 10, { item: 'arrows', price: 10 }),
    E('npc', 6, 7, { who: 'villager', say: ['They say the old Barrow kings were buried with their weapons. Bows, even!'] }),
    E('sign', 9, 4, { say: ['BRAMBLEWICK. Mind the gardens.', 'North: Darkwood.  South: the Downs.  East: the river road.'] }),
  ], { checkpoint: true })
}
// o01  Mirrormere, the lake
{
  const m = new M('.').border('T', 'e')
  m.fill(3, 2, 16, 10, '~')
  m.fill(8, 4, 6, 5, '.', true) // island
  m.set(10, 5, 'T').set(12, 7, 'B')
  m.path([[19, 6], [24, 6]])
  m.fill(14, 6, 5, 2, '=', true)
  m.scatter(',', 6, 11).scatter('T', 4, 12)
  add('o01', 'Mirrormere', 'green', m, { e: 'o11' }, [
    E('chest', 9, 7, { item: 'heart', id: 'lake-heart' }),
    E('npc', 21, 9, { who: 'villager', say: ['Not a bite all day. Something shiny washed up on the island, though.'] }),
    E('goblin', 20, 3), E('goblin', 18, 11),
  ])
}
// o10  Darkwood
{
  const m = new M('d').border('D', 'sw')
  m.path([[11, 13], [11, 7], [0, 6]], 'd')
  m.scatter('D', 30, 21).scatter('B', 3, 5)
  add('o10', 'Darkwood', 'dark', m, { s: 'o11', w: 'o00' }, [E('spider', 6, 3), E('spider', 17, 4), E('spider', 19, 10), E('wolf', 7, 10)], { dark: true })
}
// o00  Darkwood, the spider hollow
{
  const m = new M('d').border('D', 'e')
  m.path([[24, 6], [14, 6], [14, 3], [5, 3]], 'd')
  m.fill(2, 8, 7, 4, 'D')
  m.clear(4, 9, 3, 2)
  m.set(5, 8, 'd', true).set(5, 7, 'd', true).set(5, 6, 'd', true).set(5, 5, 'd', true).set(5, 4, 'd', true)
  m.scatter('D', 22, 33)
  add('o00', 'Spider Hollow', 'dark', m, { e: 'o10' }, [
    E('chest', 5, 10, { item: 'heart', id: 'hollow-heart' }),
    E('spider', 9, 5), E('spider', 16, 9), E('spider', 20, 3), E('spider', 3, 3),
  ], { dark: true })
}
// o21  Eastfold meadow
{
  const m = new M('.').border('T', 'wns')
  m.path([[0, 6], [11, 6], [11, 0]]).path([[11, 6], [11, 13]])
  m.fill(18, 2, 5, 10, 'T')
  m.scatter('B', 10, 41).scatter(',', 10, 42).scatter('R', 4, 43)
  add('o21', 'Eastfold', 'green', m, { w: 'o11', n: 'o20', s: 'o22' }, [E('goblin', 6, 3), E('goblin', 15, 10), E('wolf', 16, 4)])
}
// o20  Greyspine pass
{
  const m = new M('.').border('C', 's', 2)
  m.path([[11, 13], [11, 4]])
  m.fill(2, 2, 4, 4, 'C').fill(19, 2, 4, 5, 'C')
  m.scatter('R', 10, 51)
  add('o20', 'Greyspine Pass', 'green', m, { s: 'o21' }, [
    E('npc', 16, 3, { who: 'hermit', say: [
      'Hm. A Bramblewick lad, out this far?',
      'The Ashen Keep\'s gate is sealed by a rune stone, set out in the lava where no sword can reach.',
      'An arrow might, though. Find a bow first.',
    ] }),
    E('chest', 8, 4, { item: 'coins30', id: 'pass-coins' }),
    E('goblin', 6, 9), E('goblin', 15, 8), E('goblin', 9, 5), E('wolf', 4, 10),
  ])
}
// o12  Southfarthing fields
{
  const m = new M('.').border('T', 'nwe')
  m.path([[11, 0], [11, 6], [0, 6]]).path([[11, 6], [24, 6]])
  m.fill(4, 9, 7, 3, 'F').clear(5, 10, 5, 1)
  m.set(13, 3, 'S', true)
  m.scatter('B', 12, 61).scatter(',', 6, 62)
  add('o12', 'Southfields', 'green', m, { n: 'o11', w: 'o02', e: 'o22' }, [
    E('sign', 13, 3, { say: ['West: the Barrow Downs. Keep out!', 'East: the river road and the old bridge.'] }),
    E('goblin', 18, 3), E('goblin', 17, 10), E('wolf', 6, 3),
  ])
}
// o02  Barrow Downs
{
  const m = new M('.').border('T', 'e')
  m.path([[24, 6], [12, 6]])
  m.fill(9, 1, 8, 5, 'M').set(12, 5, 'c', true).set(13, 5, 'M')
  m.fill(2, 9, 4, 3, 'M').fill(18, 9, 4, 3, 'M')
  m.scatter('R', 6, 71).scatter(',', 4, 72)
  add('o02', 'Barrow Downs', 'green', m, { e: 'o12' }, [
    E('warp', 12, 5, { to: 'b0', tx: 12, ty: 10 }),
    E('wolf', 5, 4), E('wolf', 19, 4), E('skeleton', 8, 8),
  ])
}
// o22  the river and the troll's bridge
{
  const m = new M('.').border('T', 'we')
  m.fill(15, 1, 3, 12, '~')
  m.path([[0, 6], [15, 6]]).fill(15, 6, 3, 2, '=', true).path([[18, 6], [24, 6]])
  m.scatter('B', 6, 81).scatter('R', 4, 82)
  add('o22', 'Riverford', 'green', m, { w: 'o12', e: 'o32' }, [E('troll', 11, 5, { boss: 'troll' })])
}
// o32  Cinderfoot
{
  const m = new M('a').border('C', 'wn')
  m.path([[0, 6], [11, 6], [11, 0]], 'a')
  m.fill(15, 3, 4, 3, 'L').fill(4, 9, 5, 3, 'L').fill(17, 9, 4, 2, 'L')
  m.scatter('X', 6, 91).scatter('R', 3, 92)
  add('o32', 'Cinderfoot', 'ash', m, { w: 'o22', n: 'o31' }, [E('imp', 7, 3), E('imp', 19, 7), E('goblin', 13, 10), E('goblin', 3, 4)])
}
// o31  the Burning Plains
{
  const m = new M('a').border('C', 'ns')
  m.path([[11, 13], [11, 0]], 'a')
  m.fill(3, 3, 5, 2, 'L').fill(16, 9, 5, 2, 'L').fill(17, 2, 3, 3, 'L')
  m.set(14, 11, 'S', true)
  m.scatter('X', 7, 101)
  add('o31', 'Burning Plains', 'ash', m, { s: 'o32', n: 'o30' }, [
    E('sign', 14, 11, { say: ['Turn back, hill-folk. Here the fire rules.'] }),
    E('imp', 5, 8), E('imp', 19, 6), E('imp', 8, 2), E('goblin', 15, 4),
  ])
}
// o30  the Ashen Gate
{
  const m = new M('a').border('C', 's', 2)
  m.fill(2, 2, 21, 2, 'C')
  m.fill(11, 2, 3, 1, 'G').set(12, 1, 'v', true).set(11, 1, 'C').set(13, 1, 'C')
  m.path([[11, 13], [11, 4]], 'a').clear(11, 3, 3, 1)
  m.fill(2, 4, 8, 6, 'L').set(5, 6, 'Y')
  m.fill(16, 5, 6, 5, 'L')
  m.scatter('X', 3, 111)
  add('o30', 'The Ashen Gate', 'ash', m, { s: 'o31' }, [
    E('warp', 12, 1, { to: 'k0', tx: 12, ty: 10 }),
    E('imp', 18, 11), E('imp', 6, 11),
  ])
}

// ================================================================ the Barrow (theme barrow)
function room(open: string, theme: string) { return new M('_').border('#', open) }
{
  const m = room('ne', 'barrow')
  m.set(24, 6, 'k').set(24, 7, 'k')
  m.set(12, 12, 'v', true).set(5, 0, 't').set(19, 0, 't')
  m.fill(4, 4, 2, 2, 'b').fill(19, 4, 2, 2, 'b')
  add('b0', 'The Barrow', 'barrow', m, { n: 'b1', e: 'b2' }, [E('warp', 12, 12, { to: 'o02', tx: 12, ty: 7 }), E('bat', 8, 8), E('bat', 16, 3)], { checkpoint: true })
}
{
  const m = room('s', 'barrow')
  m.fill(3, 3, 1, 8, 'b').fill(21, 3, 1, 8, 'b').fill(8, 6, 9, 1, 'b').clear(11, 6, 3, 1)
  m.set(7, 0, 't').set(17, 0, 't')
  add('b1', 'The Barrow', 'barrow', m, { s: 'b0' }, [E('chest', 12, 3, { item: 'key', id: 'b-key' }), E('skeleton', 6, 3), E('skeleton', 18, 3), E('skeleton', 12, 10), E('bat', 4, 11)])
}
{
  const m = room('wn', 'barrow')
  m.fill(11, 0, 3, 1, 'u')
  m.fill(6, 3, 2, 2, 'b').fill(17, 3, 2, 2, 'b').fill(6, 9, 2, 2, 'b').fill(17, 9, 2, 2, 'b')
  add('b2', 'The Barrow', 'barrow', m, { w: 'b0', n: 'b3' }, [E('chest', 21, 11, { item: 'bow', id: 'b-bow' }), E('skeleton', 10, 4), E('skeleton', 14, 9), E('skeleton', 20, 5), E('bat', 3, 11), E('bat', 12, 7)], { dark: true })
}
{
  const m = room('s', 'barrow')
  m.set(4, 0, 't').set(12, 0, 't').set(20, 0, 't')
  add('b3', 'Barrow King\'s Tomb', 'barrow', m, { s: 'b2' }, [E('barrowKing', 12, 4, { boss: 'barrow' })])
}

// ================================================================ the Ashen Keep (theme keep)
{
  const m = room('n', 'keep')
  m.set(12, 12, 'v', true).set(6, 0, 't').set(18, 0, 't')
  m.fill(3, 3, 3, 1, 'L').fill(19, 3, 3, 1, 'L')
  add('k0', 'The Ashen Keep', 'keep', m, { n: 'k1' }, [E('warp', 12, 12, { to: 'o30', tx: 12, ty: 5 }), E('imp', 6, 6), E('imp', 18, 6)], { checkpoint: true })
}
{
  const m = room('sen', 'keep')
  m.fill(11, 0, 3, 1, 'k')
  m.fill(2, 2, 8, 4, 'L').fill(15, 2, 8, 4, 'L').fill(2, 8, 8, 4, 'L').fill(15, 8, 8, 4, 'L')
  m.fill(10, 6, 5, 2, '_')
  add('k1', 'The Ashen Keep', 'keep', m, { s: 'k0', e: 'k2', n: 'k3' }, [E('imp', 12, 3), E('imp', 12, 10), E('bat', 5, 6), E('bat', 19, 7)])
}
{
  const m = room('w', 'keep')
  m.fill(5, 3, 2, 8, 'b').fill(12, 2, 1, 4, 'b').fill(12, 8, 1, 4, 'b').fill(18, 3, 2, 8, 'b')
  add('k2', 'The Ashen Keep', 'keep', m, { w: 'k1' }, [E('chest', 22, 6, { item: 'key', id: 'k-key' }), E('goblin', 9, 4), E('goblin', 9, 9), E('skeleton', 15, 3), E('skeleton', 15, 10), E('goblin', 21, 11)])
}
{
  const m = room('sn', 'keep')
  m.fill(11, 0, 3, 1, 'u')
  m.fill(4, 4, 3, 6, 'L').fill(18, 4, 3, 6, 'L')
  m.set(3, 0, 't').set(21, 0, 't')
  add('k3', 'The Ashen Keep', 'keep', m, { s: 'k1', n: 'k4' }, [E('skeleton', 9, 3), E('skeleton', 15, 3), E('imp', 12, 7), E('wolf', 8, 10), E('wolf', 16, 10)], { dark: true })
}
{
  const m = room('s', 'keep')
  m.set(4, 0, 't').set(12, 0, 't').set(20, 0, 't')
  m.fill(2, 2, 2, 2, 'L').fill(21, 2, 2, 2, 'L').fill(2, 10, 2, 2, 'L').fill(21, 10, 2, 2, 'L')
  add('k4', 'Throne of Ash', 'keep', m, { s: 'k3' }, [E('ashKing', 12, 4, { boss: 'ash' })])
}

export const SCREENS: { [id: string]: Screen } = {}
S.forEach((s) => (SCREENS[s.id] = s))
export const START = { screen: 'o11', x: 12, y: 8 }
// overworld grid for the pause map
export const MAP = [['o00', 'o10', 'o20', 'o30'], ['o01', 'o11', 'o21', 'o31'], ['o02', 'o12', 'o22', 'o32']]
