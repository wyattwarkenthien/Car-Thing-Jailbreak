// THE LEGEND OF STING: an original top-down adventure for the Car Thing.
// Turn the dial to aim (8 directions), hold the dial (or 4) to walk, Back = sword, 1 = bow, 2 = potion, 3 = pause/map.
// Touch and hold to walk toward your finger; tap Sting to swing.
import * as A from './art'
import { SCREENS, Screen, Ent, COLS, ROWS, WALK, START, MAP, Dirn } from './world'
import { installSleep, isAsleep } from '../../shared/sleep'

const W = 400, H = 240, TS = 16, TOP = 16, PH = ROWS * TS // playfield 400 x 224 under a 16px HUD
const cv = document.getElementById('c') as HTMLCanvasElement
const g = cv.getContext('2d')!
g.imageSmoothingEnabled = false
function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H)
  cv.style.width = Math.floor(W * s) + 'px'
  cv.style.height = Math.floor(H * s) + 'px'
}
window.addEventListener('resize', fit); fit()

// ---------------------------------------------------------------- art
const HERO = A.hero()
const two = (f: (i: number) => A.Img) => [f(0), f(1)]
const IMG: { [k: string]: A.Img[] } = {
  goblin: two(A.goblin), wolf: two(A.wolf), spider: two(A.spider), bat: two(A.bat), skeleton: two(A.skeleton), imp: two(A.imp),
  troll: two(A.troll), barrowKing: two(A.barrowKing), ashKing: two(A.ashKing), fire: two(A.fireball), bone: two(A.bone), coin: two(A.coin), dawn: two(A.dawnstone),
}
const NPC: { [k: string]: A.Img } = { elder: A.npc('elder'), shop: A.npc('shop'), hermit: A.npc('hermit'), villager: A.npc('villager') }
const SWORD = A.sword(), ARROW = A.arrow(), PUFF = A.puff()
const HEARTS = [A.heart(0), A.heart(0.5), A.heart(1)]
const KEY = A.key(), POTION = A.potion(), BOW = A.bow(), HEARTBIG = A.heartBig()
const TITLE = A.titleArt(W, H)
const GLOW = A.glow(40, 'rgba(255,200,90,0.5)')
// darkness with a lit circle around Sting (drawn offset so the hole follows him)
const DARK = (() => {
  const c = document.createElement('canvas'); c.width = W * 2; c.height = PH * 2
  const x = c.getContext('2d')!
  x.fillStyle = 'rgba(4,2,12,0.88)'; x.fillRect(0, 0, c.width, c.height)
  x.globalCompositeOperation = 'destination-out'
  const gr = x.createRadialGradient(W, PH, 20, W, PH, 92)
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
  x.fillStyle = gr; x.fillRect(0, 0, c.width, c.height)
  return c
})()
const chestImg: { [k: string]: A.Img } = {}
const chestOf = (open: boolean, th: string) => chestImg[th + open] || (chestImg[th + open] = A.chest(open, th))

// ---------------------------------------------------------------- save
interface SaveData {
  v: number; screen: string; x: number; y: number; maxHp: number
  bow: boolean; arrows: number; potions: number; coins: number; keys: number
  flags: { [k: string]: boolean }; visited: { [k: string]: boolean }; deaths: number
}
const fresh = (): SaveData => ({ v: 1, screen: START.screen, x: START.x, y: START.y, maxHp: 6, bow: false, arrows: 0, potions: 0, coins: 0, keys: 0, flags: {}, visited: {}, deaths: 0 })
let S: SaveData = fresh()
function loadSave(): SaveData | null {
  try { const s = JSON.parse(localStorage.getItem('sting_save') || 'null'); return s && s.v === 1 ? s : null } catch (e) { return null }
}
function persist() { try { localStorage.setItem('sting_save', JSON.stringify(S)) } catch (e) { /* */ } }
const reverseDial = () => { try { return !!JSON.parse(localStorage.getItem('westward_opts') || '{}').reverseDial } catch (e) { return false } }

// ---------------------------------------------------------------- runtime state
interface Body { x: number; y: number; w: number; h: number }
interface Actor extends Body {
  k: string; hp: number; vx: number; vy: number; t: number; inv: number; kx: number; ky: number; kt: number
  state: number; st: number; dir: number; ent?: Ent; alive: boolean; boss?: string; dmg: number; flying?: boolean; solid?: boolean
}
interface Shot extends Body { k: 'arrow' | 'fire' | 'bone'; vx: number; vy: number; t: number; friendly: boolean; ang: number }
interface Pick extends Body { k: string; t: number; amt: number; float?: boolean }
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; kind: 'puff' | 'spark' | 'text' | 'leaf'; text?: string; col?: string }

let scr: Screen
let grid: string[][] = []
let bg: HTMLCanvasElement
let bgg: CanvasRenderingContext2D
let animTiles: [number, number][] = []
let animFrame = 0
let actors: Actor[] = []
let shots: Shot[] = []
let picks: Pick[] = []
let parts: Part[] = []

const hero = { x: 0, y: 0, w: 10, h: 10, dir: 2, hp: 6, inv: 0, kx: 0, ky: 0, kt: 0, swing: 0, walkT: 0, pushT: 0, warpArmed: true }
type Mode = 'title' | 'play' | 'slide' | 'dead' | 'win'
let mode: Mode = 'title'
let modeT = 0
let paused = false
let pauseSel = 0
let titleSel = 0
let showHelp = false
let dialog: string[] = []
let dialogAfter: (() => void) | null = null
let banner = '', bannerT = 0
let slide: { from: HTMLCanvasElement; d: Dirn; t: number } | null = null

const DX = [1, 0.7071, 0, -0.7071, -1, -0.7071, 0, 0.7071]
const DY = [0, 0.7071, 1, 0.7071, 0, -0.7071, -1, -0.7071]
const dir4 = (d: number): A.Dir4 => (d === 2 ? 'down' : d === 6 ? 'up' : d === 3 || d === 4 || d === 5 ? 'left' : 'right')

// ---------------------------------------------------------------- tiles
function tileAt(cx: number, cy: number): string {
  if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return '' // off screen: only reachable through openings
  const ch = grid[cy][cx]
  if (ch === 'G') return S.flags.gate ? 'g' : 'G'
  if (ch === 'Y') return S.flags.gate ? 'y' : 'Y'
  if (ch === 'k') return S.flags['lock:' + scr.id] ? '_' : 'k'
  if (ch === 'u') return S.flags['clear:' + scr.id] ? '_' : 'u'
  return ch
}
const walkable = (ch: string) => ch === '' || WALK.indexOf(ch) >= 0
const flyable = (ch: string) => ch === '' || walkable(ch) || ch === '~' || ch === 'L' || ch === 'B' || ch === 'R' || ch === 'T' || ch === 'D' || ch === 'X' || ch === 'F'
const shotPasses = (ch: string) => ch === '' || walkable(ch) || ch === '~' || ch === 'L' || ch === 'F'

function blocked(b: Body, pass: (ch: string) => boolean) {
  for (let y = b.y; ; y = Math.min(b.y + b.h - 0.01, y + 8)) {
    for (let x = b.x; ; x = Math.min(b.x + b.w - 0.01, x + 8)) {
      if (!pass(tileAt(Math.floor(x / TS), Math.floor(y / TS)))) return true
      if (x >= b.x + b.w - 0.01) break
    }
    if (y >= b.y + b.h - 0.01) break
  }
  return false
}
const overlap = (a: Body, b: Body) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
const solidActorAt = (b: Body, self?: Actor) => actors.some((a) => a !== self && a.alive && a.solid && overlap(a, b))

function moveBody(b: Body, dx: number, dy: number, pass: (ch: string) => boolean, isHero = false) {
  let hitX = false, hitY = false
  if (dx) {
    b.x += dx
    if (blocked(b, pass) || (isHero && solidActorAt(b))) { b.x -= dx; hitX = true }
  }
  if (dy) {
    b.y += dy
    if (blocked(b, pass) || (isHero && solidActorAt(b))) { b.y -= dy; hitY = true }
  }
  return { hitX, hitY }
}

// ---------------------------------------------------------------- screen loading
function paintTile(cx: number, cy: number) {
  const ch = tileAt(cx, cy)
  bgg.drawImage(A.tile(ch || '.', scr.theme, cx, cy, animFrame), cx * TS, cy * TS)
  // round off hills and barrow mounds so they read as mounds, not squares
  const hill = (c: string) => c === 'H' || c === 'M' || c === 'O' || c === 'W'
  if (hill(ch)) {
    const x = cx * TS, y = cy * TS, gr = scr.theme === 'dark' ? '#2f5a3a' : '#5aa84a'
    const up = hill(tileAt(cx, cy - 1)), dn = hill(tileAt(cx, cy + 1)), lf = hill(tileAt(cx - 1, cy)), rt = hill(tileAt(cx + 1, cy))
    bgg.fillStyle = '#9ad070'
    if (!up) bgg.fillRect(x, y, 16, 2)
    bgg.fillStyle = 'rgba(20,50,20,0.45)'
    if (!dn && ch !== 'O') bgg.fillRect(x, y + 13, 16, 3)
    if (!lf) bgg.fillRect(x, y, 2, 16)
    if (!rt) bgg.fillRect(x + 14, y, 2, 16)
    bgg.fillStyle = gr
    if (!up && !lf) { bgg.fillRect(x, y, 4, 2); bgg.fillRect(x, y, 2, 4) }
    if (!up && !rt) { bgg.fillRect(x + 12, y, 4, 2); bgg.fillRect(x + 14, y, 2, 4) }
  }
}
function buildBg() {
  bg = document.createElement('canvas'); bg.width = W; bg.height = PH
  bgg = bg.getContext('2d')!
  animTiles = []
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const ch = grid[y][x]
    // trees, rocks and bushes sit on the screen's ground colour
    paintTile(x, y)
    if (ch === '~' || ch === 'L' || ch === 't' || ch === 'Y') animTiles.push([x, y])
  }
}

function enterScreen(id: string) {
  scr = SCREENS[id]
  grid = scr.grid.map((r) => r.split(''))
  actors = []; shots = []; picks = []; parts = []
  scr.ents.forEach(spawn)
  buildBg()
  if (!S.visited[id]) { S.visited[id] = true }
  if (scr.checkpoint) { S.screen = id; S.x = Math.floor((hero.x + 5) / TS); S.y = Math.floor((hero.y + 5) / TS); persist() }
}

const ENEMY: { [k: string]: { hp: number; w: number; h: number; dmg: number; flying?: boolean } } = {
  goblin: { hp: 2, w: 12, h: 12, dmg: 1 }, wolf: { hp: 2, w: 14, h: 10, dmg: 2 }, spider: { hp: 2, w: 12, h: 10, dmg: 1 },
  bat: { hp: 1, w: 10, h: 8, dmg: 1, flying: true }, skeleton: { hp: 3, w: 12, h: 12, dmg: 1 }, imp: { hp: 2, w: 12, h: 12, dmg: 1 },
  troll: { hp: 14, w: 24, h: 24, dmg: 2 }, barrowKing: { hp: 14, w: 18, h: 22, dmg: 2, flying: true }, ashKing: { hp: 20, w: 26, h: 26, dmg: 2 },
}
function spawn(e: Ent) {
  const base = { vx: 0, vy: 0, t: Math.random() * 3, inv: 0, kx: 0, ky: 0, kt: 0, state: 0, st: Math.random() * 2, dir: 2, ent: e, alive: true, dmg: 0, hp: 1 }
  const at = (w: number, h: number) => ({ x: e.x * TS + (TS - w) / 2, y: e.y * TS + (TS - h) / 2, w, h })
  if (ENEMY[e.k]) {
    const boss = e.boss as string | undefined
    if (boss && S.flags['boss:' + boss]) { bossReward(boss, e.x * TS + 8, e.y * TS + 8, true); return }
    const d = ENEMY[e.k]
    actors.push(Object.assign(base, at(d.w, d.h), { k: e.k, hp: d.hp, dmg: d.dmg, flying: d.flying, boss }))
  } else if (e.k === 'npc' || e.k === 'shop' || e.k === 'chest') {
    actors.push(Object.assign(base, { x: e.x * TS, y: e.y * TS + 2, w: 16, h: 14, k: e.k, solid: true }))
  } else if (e.k === 'warp' || e.k === 'sign') {
    actors.push(Object.assign(base, { x: e.x * TS, y: e.y * TS, w: 16, h: 16, k: e.k }))
  }
}
const isEnemy = (a: Actor) => !!ENEMY[a.k]

// ---------------------------------------------------------------- effects
function puff(x: number, y: number, n: number, col?: string) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, life: 0, max: 0.35 + Math.random() * 0.2, kind: 'puff', col }) }
function popText(x: number, y: number, text: string, col = '#ffffff') { parts.push({ x, y, vx: 0, vy: -0.5, life: 0, max: 1, kind: 'text', text, col }) }
function say(lines: string[], after?: () => void) { dialog = lines.slice(); dialogAfter = after || null; heldWalk.dial = heldWalk.key4 = false }
function showBanner(t: string) { banner = t; bannerT = 2.2 }

// ---------------------------------------------------------------- hero
const heldWalk = { dial: false, key4: false, touch: false }
const arrows = { up: false, down: false, left: false, right: false }
let touchTarget: { x: number; y: number } | null = null

function heroUpdate() {
  // aim from the arrow keys (desktop) or the touch point
  const ax = (arrows.right ? 1 : 0) - (arrows.left ? 1 : 0), ay = (arrows.down ? 1 : 0) - (arrows.up ? 1 : 0)
  let walking = heldWalk.dial || heldWalk.key4
  if (ax || ay) { hero.dir = (Math.round(Math.atan2(ay, ax) / (Math.PI / 4)) + 8) % 8; walking = true }
  if (heldWalk.touch && touchTarget) {
    const dx = touchTarget.x - (hero.x + 5), dy = touchTarget.y - (hero.y + 5)
    if (dx * dx + dy * dy > 64) { hero.dir = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8; walking = true }
  }
  if (hero.swing > 0) walking = false
  if (hero.inv > 0) hero.inv--
  if (hero.kt > 0) { hero.kt--; moveBody(hero, hero.kx, hero.ky, walkable, true); return }

  if (walking) {
    const sp = 1.35
    const dx = DX[hero.dir] * sp, dy = DY[hero.dir] * sp
    const r = moveBody(hero, dx, dy, walkable, true)
    // corner help: slide around corners and line up with doorways
    if (r.hitX && !dy) for (const n of [1, -1]) { const t = { x: hero.x + dx, y: hero.y + n * 5, w: 10, h: 10 }; if (!blocked(t, walkable) && !blocked({ x: hero.x, y: hero.y + n, w: 10, h: 10 }, walkable)) { hero.y += n * 0.8; break } }
    if (r.hitY && !dx) for (const n of [1, -1]) { const t = { x: hero.x + n * 5, y: hero.y + dy, w: 10, h: 10 }; if (!blocked(t, walkable) && !blocked({ x: hero.x + n, y: hero.y, w: 10, h: 10 }, walkable)) { hero.x += n * 0.8; break } }
    hero.walkT += 1
    // pushing against something you can talk to / open
    const px = hero.x + 5 + DX[hero.dir] * 9, py = hero.y + 5 + DY[hero.dir] * 9
    const target = interactAt(px, py)
    if (target && (r.hitX || r.hitY)) { hero.pushT++; if (hero.pushT > 8) { hero.pushT = -30; interact(target) } }
    else if (hero.pushT > 0) hero.pushT = 0
  }
  if (hero.pushT < 0) hero.pushT++

  // edges -> next screen
  const cx = hero.x + 5, cy = hero.y + 5
  if (cx < 1) tryLeave('w'); else if (cx > W - 1) tryLeave('e'); else if (cy < 1) tryLeave('n'); else if (cy > PH - 1) tryLeave('s')

  // warps
  let onWarp = false
  for (const a of actors) {
    if (a.k !== 'warp') continue
    if (overlap(hero, { x: a.x + 4, y: a.y + 4, w: 8, h: 8 })) {
      onWarp = true
      if (hero.warpArmed) { const e = a.ent!; warpTo(e.to as string, e.tx as number, e.ty as number); return }
    }
  }
  if (!onWarp) hero.warpArmed = true

  // pickups
  for (const p of picks) if (overlap(hero, p)) { collect(p); p.t = -1 }
  picks = picks.filter((p) => p.t >= 0)
}

function tryLeave(d: Dirn) {
  const to = scr.links[d]
  if (!to) { hero.x = Math.max(0, Math.min(W - 10, hero.x)); hero.y = Math.max(0, Math.min(PH - 10, hero.y)); return }
  const from = bg
  if (d === 'w') hero.x = W - 12; else if (d === 'e') hero.x = 2; else if (d === 'n') hero.y = PH - 12; else hero.y = 2
  const oldArea = scr.area
  enterScreen(to)
  slide = { from, d, t: 0 }
  mode = 'slide'
  if (scr.area !== oldArea) showBanner(scr.area)
}
function warpTo(id: string, tx: number, ty: number) {
  hero.x = tx * TS + 3; hero.y = ty * TS + 3; hero.warpArmed = false
  const oldArea = scr.area
  enterScreen(id)
  fadeT = 0.5
  if (scr.area !== oldArea) showBanner(scr.area)
}
let fadeT = 0

// what's in front of Sting that he can use?
type Target = { kind: 'actor'; a: Actor } | { kind: 'lock' } | { kind: 'sign'; a: Actor }
function interactAt(px: number, py: number): Target | null {
  const cx = Math.floor(px / TS), cy = Math.floor(py / TS)
  const ch = tileAt(cx, cy)
  if (ch === 'k') return { kind: 'lock' }
  if (ch === 'S') { const s = actors.filter((a) => a.k === 'sign' && Math.floor(a.x / TS) === cx && Math.floor(a.y / TS) === cy)[0]; if (s) return { kind: 'sign', a: s } }
  for (const a of actors) if ((a.k === 'npc' || a.k === 'shop' || a.k === 'chest') && px >= a.x && px < a.x + a.w && py >= a.y - 2 && py < a.y + a.h) return { kind: 'actor', a }
  return null
}
function interact(t: Target) {
  if (t.kind === 'lock') {
    if (S.keys > 0) { S.keys--; S.flags['lock:' + scr.id] = true; persist(); redrawAll(); puff(hero.x + 5 + DX[hero.dir] * 12, hero.y + 5 + DY[hero.dir] * 12, 6) }
    else say(['The door is locked. A small key would open it.'])
    return
  }
  const a = t.a, e = a.ent!
  if (t.kind === 'sign') { say(e.say as string[]); return }
  if (a.k === 'npc') {
    const lines = (e.say as string[]).slice()
    if (e.id === 'elder' && !S.flags.elder) {
      S.flags.elder = true; S.potions = Math.min(5, S.potions + 1); persist()
      say(lines.concat(['Here, take this Healing Draught. Press 2 to drink it when you\'re hurt.']))
    } else if (e.id === 'elder' && S.bow) say(['You found a bow! Now east, over the river, and on to the Ashen Gate.'])
    else say(lines)
  } else if (a.k === 'shop') {
    const item = e.item as string, price = e.price as number
    if (item === 'arrows' && !S.bow) { say(['Arrows, 10 for ' + price + ' silver. You\'ll want a bow first, mind.']); return }
    if (item === 'potion' && S.potions >= 5) { say(['You can\'t carry any more draughts.']); return }
    if (S.coins < price) { say([(item === 'potion' ? 'A Healing Draught' : '10 arrows') + ' costs ' + price + ' silver. Come back when you have it!']); return }
    S.coins -= price
    if (item === 'potion') S.potions++; else S.arrows = Math.min(40, S.arrows + 10)
    persist()
    say(['Thank you kindly! ' + (item === 'potion' ? 'One Healing Draught.' : 'Ten arrows.')])
  } else if (a.k === 'chest') {
    const id = e.id as string
    if (S.flags['chest:' + id]) return
    S.flags['chest:' + id] = true
    const item = e.item as string
    if (item === 'key') { S.keys++; say(['You found a small key!']) }
    else if (item === 'bow') { S.bow = true; S.arrows = Math.max(S.arrows, 15); say(['You found the BARROW BOW and 15 arrows!', 'Press 1 to shoot. Buy more arrows in Bramblewick.']) }
    else if (item === 'heart') { S.maxHp = Math.min(20, S.maxHp + 2); hero.hp = S.maxHp; say(['A Heart Charm! Your courage grows by one heart.']) }
    else if (item === 'coins30') { S.coins += 30; say(['30 silver pennies!']) }
    persist()
  }
}

function hurtHero(dmg: number, fromX: number, fromY: number) {
  if (hero.inv > 0 || mode !== 'play' || god) return
  hero.hp -= dmg
  hero.inv = 70
  const dx = hero.x + 5 - fromX, dy = hero.y + 5 - fromY, d = Math.sqrt(dx * dx + dy * dy) || 1
  hero.kx = (dx / d) * 2.6; hero.ky = (dy / d) * 2.6; hero.kt = 10
  if (hero.hp <= 0) { hero.hp = 0; mode = 'dead'; modeT = 0; S.deaths++; persist() }
}

function swing() {
  if (hero.swing > 0 || hero.kt > 0) return
  hero.swing = 16
}
function swordHits() {
  if (hero.swing < 4 || hero.swing > 13) return
  const cx = hero.x + 5 + DX[hero.dir] * 13, cy = hero.y + 5 + DY[hero.dir] * 13
  const box = { x: cx - 9, y: cy - 9, w: 18, h: 18 }
  for (const a of actors) if (a.alive && isEnemy(a) && overlap(box, a)) damage(a, 1, hero.x + 5, hero.y + 5)
  // cut bushes
  for (const [ox, oy] of [[0, 0], [-6, -6], [6, 6], [-6, 6], [6, -6]]) {
    const tx = Math.floor((cx + ox) / TS), ty = Math.floor((cy + oy) / TS)
    if (tileAt(tx, ty) === 'B') {
      grid[ty][tx] = scr.theme === 'dark' ? 'd' : '.'
      paintTile(tx, ty)
      for (let i = 0; i < 6; i++) parts.push({ x: tx * TS + 8, y: ty * TS + 8, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 0, max: 0.5, kind: 'leaf', col: '#4aa83a' })
      maybeDrop(tx * TS + 4, ty * TS + 4, 0.5)
    }
  }
}
function shoot() {
  if (!S.bow) { popText(hero.x - 4, hero.y - 8, 'NO BOW', '#c0c0c0'); return }
  if (S.arrows <= 0) { popText(hero.x - 8, hero.y - 8, 'NO ARROWS', '#c0c0c0'); return }
  if (shots.some((s) => s.friendly)) return
  S.arrows--
  shots.push({ k: 'arrow', x: hero.x + 5 + DX[hero.dir] * 8 - 3, y: hero.y + 5 + DY[hero.dir] * 8 - 3, w: 6, h: 6, vx: DX[hero.dir] * 4.2, vy: DY[hero.dir] * 4.2, t: 0, friendly: true, ang: hero.dir * Math.PI / 4 })
}
function drink() {
  if (S.potions <= 0) { popText(hero.x - 8, hero.y - 8, 'NO DRAUGHTS', '#c0c0c0'); return }
  if (hero.hp >= S.maxHp) { popText(hero.x - 4, hero.y - 8, 'FULL', '#c0c0c0'); return }
  S.potions--; hero.hp = S.maxHp; persist()
  for (let i = 0; i < 10; i++) parts.push({ x: hero.x + 5, y: hero.y + 5, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 2, life: 0, max: 0.7, kind: 'spark', col: '#ff8ab0' })
}

// ---------------------------------------------------------------- enemies
function damage(a: Actor, n: number, fx: number, fy: number) {
  if (a.inv > 0 || !a.alive) return
  a.hp -= n
  a.inv = 18
  const big = a.w > 16
  const dx = a.x + a.w / 2 - fx, dy = a.y + a.h / 2 - fy, d = Math.sqrt(dx * dx + dy * dy) || 1
  a.kx = (dx / d) * (big ? 1 : 3); a.ky = (dy / d) * (big ? 1 : 3); a.kt = big ? 4 : 9
  if (a.hp <= 0) {
    a.alive = false
    puff(a.x + a.w / 2, a.y + a.h / 2, big ? 16 : 7)
    if (a.boss) { S.flags['boss:' + a.boss] = true; persist(); bossReward(a.boss, a.x + a.w / 2, a.y + a.h / 2, false) }
    else maybeDrop(a.x + a.w / 2 - 4, a.y + a.h / 2 - 4, 1)
    if (scr.grid.some((r) => r.indexOf('u') >= 0) && !actors.some((o) => o.alive && isEnemy(o))) { S.flags['clear:' + scr.id] = true; persist(); redrawAll(); puff(12.5 * TS, 8, 8) }
  }
}
function bossReward(boss: string, x: number, y: number, already: boolean) {
  if (boss === 'ash') {
    if (!S.flags.won) picks.push({ k: 'dawn', x: x - 7, y: y - 8, w: 14, h: 16, t: 0, amt: 1, float: true })
    return
  }
  if (!S.flags['hc:' + boss]) picks.push({ k: 'container', x: x - 7, y: y - 6, w: 14, h: 13, t: 0, amt: 1, float: true })
  if (!already) showBanner(boss === 'troll' ? 'The troll is beaten!' : 'The Barrow King falls!')
  void already
}
function maybeDrop(x: number, y: number, mult: number) {
  const r = Math.random()
  if (r < 0.14 * mult) picks.push({ k: 'heart', x, y, w: 9, h: 8, t: 0, amt: 2 })
  else if (r < 0.44 * mult) picks.push({ k: 'coin', x, y, w: 8, h: 8, t: 0, amt: Math.random() < 0.2 ? 5 : 1 })
  else if (S.bow && r < 0.56 * mult) picks.push({ k: 'arrows', x, y, w: 14, h: 5, t: 0, amt: 4 })
}
function collect(p: Pick) {
  if (p.k === 'heart') hero.hp = Math.min(S.maxHp, hero.hp + p.amt)
  else if (p.k === 'coin') { S.coins = Math.min(999, S.coins + p.amt); popText(p.x, p.y - 4, '+' + p.amt, '#e8ecf8') }
  else if (p.k === 'arrows') S.arrows = Math.min(40, S.arrows + p.amt)
  else if (p.k === 'container') {
    const boss = scr.ents.filter((e) => e.boss)[0]
    S.flags['hc:' + (boss ? boss.boss : scr.id)] = true
    S.maxHp = Math.min(20, S.maxHp + 2); hero.hp = S.maxHp
    say(['A Heart Charm! Your courage grows by one heart.'])
  } else if (p.k === 'dawn') {
    S.flags.won = true
    say(['You hold the DAWNSTONE!', 'Its warm light pours through the Ashen Keep, and the fires below begin to cool.'], () => { mode = 'win'; modeT = 0 })
  }
  persist()
}

const distTo = (a: Body) => { const dx = hero.x + 5 - (a.x + a.w / 2), dy = hero.y + 5 - (a.y + a.h / 2); return { dx, dy, d: Math.sqrt(dx * dx + dy * dy) || 1 } }
function fire(a: Actor, k: 'fire' | 'bone', ang: number, sp: number) {
  shots.push({ k, x: a.x + a.w / 2 - 3, y: a.y + a.h / 2 - 3, w: 6, h: 6, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t: 0, friendly: false, ang })
}

function enemyUpdate(a: Actor) {
  a.t += 1 / 60
  if (a.inv > 0) a.inv--
  const pass = a.flying ? flyable : walkable
  if (a.kt > 0) { a.kt--; moveBody(a, a.kx, a.ky, pass); return }
  const { dx, dy, d } = distTo(a)
  const toward = (sp: number) => { const r = moveBody(a, (dx / d) * sp, (dy / d) * sp, pass); if (r.hitX || r.hitY) a.st = 0; a.vx = dx / d }
  const wander = (sp: number) => {
    a.st -= 1 / 60
    if (a.st <= 0) { const ang = Math.floor(Math.random() * 4) * (Math.PI / 2); a.vx = Math.cos(ang) * sp; a.vy = Math.sin(ang) * sp; a.st = 0.8 + Math.random() * 1.6 }
    const r = moveBody(a, a.vx, a.vy, pass)
    if (r.hitX || r.hitY) a.st = 0
  }
  switch (a.k) {
    case 'goblin': if (d < 96) toward(0.75); else wander(0.5); break
    case 'skeleton': if (d < 110) toward(0.55); else wander(0.4); break
    case 'wolf':
      if (a.state === 1) { const r = moveBody(a, a.vx, a.vy, pass); a.st -= 1 / 60; if (a.st <= 0 || r.hitX || r.hitY) { a.state = 0; a.st = 1.4 } }
      else { a.st -= 1 / 60; if (d < 120 && a.st <= 0) { a.state = 1; a.vx = (dx / d) * 2.6; a.vy = (dy / d) * 2.6; a.st = 0.55 } else if (d >= 120) wander(0.45) }
      break
    case 'spider':
      a.st -= 1 / 60
      if (a.state === 1) { moveBody(a, a.vx, a.vy, pass); if (a.st <= 0) { a.state = 0; a.st = 0.9 + Math.random() * 0.6 } }
      else if (a.st <= 0) { a.state = 1; a.st = 0.3; const sp = d < 140 ? 2.2 : 1.2, ang = d < 140 ? Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.8 : Math.random() * 6.28; a.vx = Math.cos(ang) * sp; a.vy = Math.sin(ang) * sp }
      break
    case 'bat': {
      const ang = Math.atan2(dy, dx) + Math.sin(a.t * 3) * 1.2
      moveBody(a, Math.cos(ang) * 1.0, Math.sin(ang) * 1.0 + Math.sin(a.t * 7) * 0.6, flyable)
      break
    }
    case 'imp':
      if (d < 70) moveBody(a, (-dx / d) * 0.6, (-dy / d) * 0.6, pass); else wander(0.35)
      a.st -= 1 / 60
      if (d < 170 && a.state === 0) { a.state = 1; a.st = 1 + Math.random() }
      if (a.state === 1 && a.st <= 0) { fire(a, 'fire', Math.atan2(dy, dx), 1.7); a.st = 2.2 }
      break
    case 'troll':
      if (a.state === 1) { const r = moveBody(a, a.vx, a.vy, pass); a.st -= 1 / 60; if (a.st <= 0 || r.hitX || r.hitY) { a.state = 0; a.st = 2.4; if (r.hitX || r.hitY) puff(a.x + 12, a.y + 20, 6, '#c8b090') } }
      else { a.st -= 1 / 60; if (d < 160) toward(0.45); if (a.st <= 0 && d < 170) { a.state = 1; a.vx = (dx / d) * 2.6; a.vy = (dy / d) * 2.6; a.st = 0.8 } }
      break
    case 'barrowKing':
      toward(a.hp < 7 ? 0.65 : 0.45)
      a.st -= 1 / 60
      if (a.st <= 0) {
        const base = Math.atan2(dy, dx)
        for (const o of [-0.35, 0, 0.35]) fire(a, 'bone', base + o, 1.9)
        a.st = a.hp < 7 ? 1.5 : 2.1
        if (a.hp < 7 && actors.filter((x) => x.alive && x.k === 'bat').length < 2 && Math.random() < 0.5) {
          actors.push({ k: 'bat', x: a.x, y: a.y, w: 10, h: 8, hp: 1, vx: 0, vy: 0, t: 0, inv: 0, kx: 0, ky: 0, kt: 0, state: 0, st: 0, dir: 0, alive: true, dmg: 1, flying: true })
        }
      }
      break
    case 'ashKing': {
      const angry = a.hp < 10
      if (a.state === 1) { const r = moveBody(a, a.vx, a.vy, pass); a.st -= 1 / 60; if (a.st <= 0 || r.hitX || r.hitY) { a.state = 0; a.st = angry ? 1.6 : 2.2 } }
      else {
        toward(0.4)
        a.st -= 1 / 60
        if (a.st <= 0) {
          a.state = 2
          const n = angry ? 12 : 8
          for (let i = 0; i < n; i++) fire(a, 'fire', (i / n) * Math.PI * 2 + a.t, 1.5)
          a.st = 0.9
        }
      }
      if (a.state === 2) { a.st -= 1 / 60; if (a.st <= 0) { a.state = 1; a.vx = (dx / d) * (angry ? 3 : 2.4); a.vy = (dy / d) * (angry ? 3 : 2.4); a.st = 0.7 } }
      break
    }
  }
  // keep on screen
  a.x = Math.max(0, Math.min(W - a.w, a.x)); a.y = Math.max(0, Math.min(PH - a.h, a.y))
  if (overlap(a, hero)) hurtHero(a.dmg, a.x + a.w / 2, a.y + a.h / 2)
}

function shotsUpdate() {
  for (const s of shots) {
    s.x += s.vx; s.y += s.vy; s.t++
    const cx = Math.floor((s.x + 3) / TS), cy = Math.floor((s.y + 3) / TS)
    const ch = tileAt(cx, cy)
    if (s.x < -8 || s.y < -8 || s.x > W || s.y > PH) { s.t = -1; continue }
    if (s.friendly && ch === 'Y') { s.t = -1; S.flags.gate = true; persist(); redrawAll(); popText(cx * TS - 10, cy * TS - 6, 'THE GATE OPENS!', '#80f0ff'); puff(cx * TS + 8, cy * TS + 8, 10, '#80f0ff'); continue }
    if (!shotPasses(ch)) { s.t = -1; if (s.friendly) puff(s.x + 3, s.y + 3, 2); continue }
    if (s.friendly) {
      for (const a of actors) if (a.alive && isEnemy(a) && overlap(s, a)) { damage(a, 2, s.x - s.vx * 4, s.y - s.vy * 4); s.t = -1; break }
    } else if (overlap(s, hero)) { hurtHero(1, s.x, s.y); s.t = -1 }
    if (s.t > 200) s.t = -1
  }
  shots = shots.filter((s) => s.t >= 0)
}

function redrawAll() { for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) paintTile(x, y) }

// ---------------------------------------------------------------- step
let god = false
function step() {
  const dt = 1 / 60
  modeT += dt
  if (bannerT > 0) bannerT -= dt
  if (fadeT > 0) fadeT -= dt
  if (mode === 'slide') {
    slide!.t += dt / 0.4
    if (slide!.t >= 1) { slide = null; mode = 'play' }
    return
  }
  if (mode !== 'play' || dialog.length) return
  // animated tiles
  const f = Math.floor(performance.now() / 420) % 2
  if (f !== animFrame) { animFrame = f; animTiles.forEach(([x, y]) => paintTile(x, y)) }
  heroUpdate()
  if (mode !== 'play') return
  if (hero.swing > 0) { swordHits(); hero.swing-- }
  for (const a of actors) if (a.alive && isEnemy(a)) enemyUpdate(a)
  actors = actors.filter((a) => a.alive)
  shotsUpdate()
  for (const p of picks) { p.t += dt; if (!p.float && p.t > 9) p.t = -1 }
  picks = picks.filter((p) => p.t >= 0)
  for (const p of parts) { p.life += dt; p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92 }
  parts = parts.filter((p) => p.life < p.max)
}

// ---------------------------------------------------------------- drawing
function txt(s: string, x: number, y: number, size: number, col = '#ffffff', align: CanvasTextAlign = 'left', shadow = true) {
  g.font = `${size}px VT323, monospace`
  g.textAlign = align; g.textBaseline = 'alphabetic'
  if (shadow) { g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(s, x + 1, y + 1) }
  g.fillStyle = col; g.fillText(s, x, y)
}

function drawActors() {
  const list: { y: number; draw: () => void }[] = []
  const fr = Math.floor(performance.now() / 220) % 2
  for (const a of actors) {
    if (a.k === 'warp' || a.k === 'sign') continue
    const flash = a.inv > 0 && Math.floor(a.inv / 3) % 2 === 0
    list.push({ y: a.y + a.h, draw: () => {
      const x = Math.round(a.x), y = Math.round(a.y) + TOP
      if (a.k === 'npc') g.drawImage(NPC[(a.ent!.who as string)] || NPC.villager, x, y - 2)
      else if (a.k === 'chest') g.drawImage(chestOf(!!S.flags['chest:' + a.ent!.id], scr.theme), x, y - 2)
      else if (a.k === 'shop') {
        const item = a.ent!.item as string
        g.fillStyle = '#7a4e22'; g.fillRect(x + 1, y + 6, 14, 8); g.fillStyle = '#a8743a'; g.fillRect(x + 1, y + 6, 14, 2)
        if (item === 'potion') g.drawImage(POTION, x + 3, y - 4); else g.drawImage(ARROW, x + 1, y + 1)
        txt(String(a.ent!.price), x + 8, y + 22, 12, '#ffe8a0', 'center')
      } else {
        const imgs = IMG[a.k]
        let im = imgs[(a.k === 'bat' ? Math.floor(a.t * 10) : Math.floor(a.t * 5)) % 2]
        const ox = (a.w - im.width) / 2, oy = a.h - im.height
        if (flash) { im = A.tint(im, '#ffffff') }
        const faceLeft = (a.k === 'wolf' || a.k === 'goblin') && (a.vx < 0)
        if (faceLeft) { g.save(); g.translate(x + ox + im.width, y + oy); g.scale(-1, 1); g.drawImage(im, 0, 0); g.restore() }
        else g.drawImage(im, Math.round(x + ox), Math.round(y + oy))
        if (a.boss && a.alive) { // boss health bar
          const ent = ENEMY[a.k]
          g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(W / 2 - 60, TOP + PH - 10, 120, 6)
          g.fillStyle = '#e8303a'; g.fillRect(W / 2 - 59, TOP + PH - 9, Math.max(0, (a.hp / ent.hp) * 118), 4)
        }
      }
    } })
  }
  for (const p of picks) list.push({ y: p.y + p.h, draw: () => {
    if (!p.float && p.t > 6 && Math.floor(p.t * 8) % 2) return
    const x = Math.round(p.x), y = Math.round(p.y) + TOP + (p.float ? Math.round(Math.sin(p.t * 3) * 2) : 0)
    if (p.k === 'heart') g.drawImage(HEARTS[2], x, y)
    else if (p.k === 'coin') g.drawImage(IMG.coin[fr], x, y)
    else if (p.k === 'arrows') g.drawImage(ARROW, x, y)
    else if (p.k === 'container') g.drawImage(HEARTBIG, x, y)
    else if (p.k === 'dawn') { g.drawImage(GLOW, x + 7 - 40, y + 8 - 40); g.drawImage(IMG.dawn[fr], x, y) }
  } })
  list.push({ y: hero.y + hero.h, draw: drawHero })
  list.sort((a, b) => a.y - b.y).forEach((o) => o.draw())
}

function drawHero() {
  if (hero.inv > 0 && Math.floor(hero.inv / 4) % 2 === 0 && mode === 'play') return
  const d4 = dir4(hero.dir)
  const set = HERO[d4]
  const moving = heldWalk.dial || heldWalk.key4 || heldWalk.touch || arrows.up || arrows.down || arrows.left || arrows.right
  const im = hero.swing > 0 ? set[2] : set[moving ? Math.floor(hero.walkT / 9) % 2 : 0]
  const x = Math.round(hero.x - 3), y = Math.round(hero.y - 6) + TOP
  const drawSword = () => {
    if (hero.swing <= 0) return
    const k = 1 - hero.swing / 16
    const ang = hero.dir * Math.PI / 4 + (k - 0.5) * 1.9
    g.save(); g.translate(hero.x + 5, hero.y + 5 + TOP); g.rotate(ang); g.drawImage(SWORD, 3, -3); g.restore()
  }
  if (d4 === 'up') drawSword()
  g.drawImage(im, x, y)
  if (d4 !== 'up') drawSword()
}

function drawWorld(offX = 0, offY = 0) {
  g.drawImage(bg, offX, TOP + offY)
}

function drawPlay() {
  if (mode === 'slide' && slide) {
    const k = Math.min(1, slide.t)
    const ox = slide.d === 'e' ? -W : slide.d === 'w' ? W : 0, oy = slide.d === 's' ? -PH : slide.d === 'n' ? PH : 0
    g.save(); g.beginPath(); g.rect(0, TOP, W, PH); g.clip()
    g.drawImage(slide.from, Math.round(ox * k), TOP + Math.round(oy * k))
    g.drawImage(bg, Math.round(-ox * (1 - k)), TOP + Math.round(-oy * (1 - k)))
    g.restore()
  } else {
    drawWorld()
    g.save(); g.beginPath(); g.rect(0, TOP, W, PH); g.clip()
    drawActors()
    for (const s of shots) {
      const x = Math.round(s.x), y = Math.round(s.y) + TOP
      if (s.k === 'arrow') { g.save(); g.translate(x + 3, y + 3); g.rotate(s.ang); g.drawImage(ARROW, -10, -2); g.restore() }
      else g.drawImage(IMG[s.k][Math.floor(s.t / 5) % 2], x - 1, y - 1)
    }
    for (const p of parts) {
      const k = p.life / p.max, x = Math.round(p.x), y = Math.round(p.y) + TOP
      if (p.kind === 'puff') { g.globalAlpha = 1 - k; g.drawImage(PUFF, x - 4, y - 4); g.globalAlpha = 1 }
      else if (p.kind === 'leaf' || p.kind === 'spark') { g.fillStyle = p.col || '#fff'; g.fillRect(x, y, 2, 2) }
      else if (p.kind === 'text') { g.globalAlpha = 1 - k * k; txt(p.text || '', x, y, 12, p.col); g.globalAlpha = 1 }
    }
    if (scr.dark) g.drawImage(DARK, Math.round(hero.x + 5 - W), Math.round(hero.y + 5 - PH) + TOP)
    g.restore()
  }
  if (fadeT > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, fadeT * 2)})`; g.fillRect(0, TOP, W, PH) }
  drawHud()
  if (bannerT > 0) {
    g.globalAlpha = Math.min(1, bannerT * 2)
    g.fillStyle = 'rgba(10,6,20,0.6)'; g.fillRect(0, TOP + 26, W, 26)
    txt(banner.toUpperCase(), W / 2, TOP + 45, 20, '#ffe8a0', 'center')
    g.globalAlpha = 1
  }
  if (dialog.length) drawDialog()
}

function drawHud() {
  g.fillStyle = '#0e0a14'; g.fillRect(0, 0, W, TOP)
  for (let i = 0; i < S.maxHp / 2; i++) {
    const v = hero.hp - i * 2
    g.drawImage(HEARTS[v >= 2 ? 2 : v === 1 ? 1 : 0], 4 + i * 10, 4)
  }
  let x = 116
  g.drawImage(IMG.coin[0], x, 4); txt(String(S.coins), x + 10, 13, 15); x += 40
  if (S.bow) { g.drawImage(ARROW, x, 6); txt(String(S.arrows), x + 16, 13, 15); x += 40 }
  g.drawImage(POTION, x, 2); txt(String(S.potions), x + 12, 13, 15); x += 32
  if (S.keys) { g.save(); g.translate(x, 1); g.scale(0.9, 0.9); g.drawImage(KEY, 0, 0); g.restore(); txt(String(S.keys), x + 10, 13, 15); x += 28 }
  txt(scr ? scr.area.toUpperCase() : '', W - 4, 13, 15, '#c8b8e8', 'right')
}

function wrap(s: string, max: number): string[] {
  g.font = '16px VT323, monospace'
  const out: string[] = []; let line = ''
  s.split(' ').forEach((w) => { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > max && line) { out.push(line); line = w } else line = t })
  if (line) out.push(line)
  return out
}
let dialogStart = 0
function drawDialog() {
  const y = TOP + PH - 66
  g.fillStyle = 'rgba(10,6,24,0.92)'; g.fillRect(8, y, W - 16, 60)
  g.fillStyle = '#c9a040'; g.fillRect(8, y, W - 16, 2); g.fillRect(8, y + 58, W - 16, 2)
  const lines = wrap(dialog[0], W - 40)
  const shown = Math.floor((performance.now() - dialogStart) / 22)
  let left = shown
  lines.slice(0, 3).forEach((l, i) => { const part = l.slice(0, Math.max(0, left)); left -= l.length; txt(part, 20, y + 20 + i * 16, 16, '#ffffff', 'left', false) })
  if (Math.floor(performance.now() / 400) % 2) txt('▼', W - 22, y + 54, 14, '#c9a040', 'center', false)
}
function advanceDialog() {
  const full = dialog.length ? dialog[0].length : 0
  if ((performance.now() - dialogStart) / 22 < full) { dialogStart = -1e9; return }
  dialog.shift(); dialogStart = performance.now()
  if (!dialog.length && dialogAfter) { const f = dialogAfter; dialogAfter = null; f() }
}

function drawPause() {
  g.fillStyle = 'rgba(8,6,18,0.9)'; g.fillRect(20, 24, W - 40, H - 40)
  txt('PAUSED', W / 2, 44, 22, '#ffe8a0', 'center')
  // map of the overworld
  const mx = 40, my = 60, cw = 34, ch = 22
  txt('MAP', mx, my - 4, 14, '#c8b8e8')
  MAP.forEach((row, j) => row.forEach((id, i) => {
    const seen = S.visited[id]
    g.fillStyle = seen ? (SCREENS[id].theme === 'ash' ? '#6a4a48' : SCREENS[id].theme === 'dark' ? '#2f5a3a' : '#5aa84a') : '#2a2438'
    g.fillRect(mx + i * (cw + 2), my + j * (ch + 2), cw, ch)
    const here = scr.id === id || (scr.id[0] === 'b' && id === 'o02') || (scr.id[0] === 'k' && id === 'o30')
    if (here && Math.floor(performance.now() / 300) % 2) { g.fillStyle = '#ffffff'; g.fillRect(mx + i * (cw + 2) + cw / 2 - 3, my + j * (ch + 2) + ch / 2 - 3, 6, 6) }
  }))
  // gear
  const gx = 200
  txt('SWORD', gx, 70, 16, '#ffffff'); g.drawImage(SWORD, gx + 60, 61)
  txt('BOW', gx, 90, 16, S.bow ? '#ffffff' : '#5a5470'); if (S.bow) txt(S.arrows + ' arrows', gx + 60, 90, 16, '#c8c0d8')
  txt('DRAUGHTS', gx, 110, 16, '#ffffff'); txt(String(S.potions), gx + 80, 110, 16, '#c8c0d8')
  txt('HEARTS', gx, 130, 16, '#ffffff'); txt(String(S.maxHp / 2), gx + 80, 130, 16, '#c8c0d8')
  const items = ['RESUME', 'SAVE & QUIT TO TITLE']
  items.forEach((it, i) => txt((i === pauseSel ? '> ' : '  ') + it, W / 2, 176 + i * 20, 17, i === pauseSel ? '#ffe8a0' : '#ffffff', 'center'))
}

function titleItems() {
  const items: string[] = []
  if (loadSave()) items.push('CONTINUE')
  items.push('NEW JOURNEY', 'HOW TO PLAY')
  if (env.hosted) items.push('HOME')
  return items
}
function drawTitle() {
  g.drawImage(TITLE, 0, 0)
  txt('THE LEGEND OF', W / 2, 46, 20, '#e8d8b0', 'center')
  txt('STING', W / 2 + 2, 92, 60, '#2a1410', 'center', false)
  txt('STING', W / 2, 90, 60, '#ffd860', 'center', false)
  txt('A TALE OF BRAMBLEWICK', W / 2, 108, 14, '#c8b8e8', 'center')
  // Sting on the hill
  g.save(); g.translate(64, 150); g.scale(3, 3); g.drawImage(HERO.right[2], 0, 0); g.restore()
  g.save(); g.translate(64 + 30, 150 + 21); g.rotate(-0.9); g.scale(2, 2); g.drawImage(SWORD, 0, -3); g.restore()
  titleItems().forEach((it, i) => {
    const sel = i === titleSel
    txt((sel ? '> ' : '  ') + it, 270, 146 + i * 20, 18, sel ? '#ffe8a0' : '#ffffff', 'center')
  })
  txt('DIAL choose  PRESS start', 8, H - 8, 14, 'rgba(255,255,255,0.8)')
}
function drawHelp() {
  g.fillStyle = 'rgba(8,6,18,0.94)'; g.fillRect(16, 14, W - 32, H - 28)
  txt('HOW TO PLAY', W / 2, 36, 20, '#ffe8a0', 'center')
  ;[
    'TURN THE DIAL    aim Sting (8 directions)',
    'HOLD THE DIAL    walk (or hold 4)',
    'BACK             swing your sword',
    '1  shoot the bow     2  drink a draught',
    '3  pause and map     TOUCH  walk to finger',
    '',
    'Walk into people, signs and chests to use',
    'them. Cut bushes for silver and hearts.',
    'Find the bow in the Barrow, beat the troll,',
    'and take back the Dawnstone from the Ash King.',
  ].forEach((l, i) => txt(l, 30, 58 + i * 15, 15, '#ffffff', 'left', false))
}

function render() {
  if (mode === 'title') { drawTitle(); if (showHelp) drawHelp(); return }
  drawPlay()
  if (mode === 'dead') {
    g.fillStyle = `rgba(30,0,10,${Math.min(0.8, modeT)})`; g.fillRect(0, 0, W, H)
    txt('STING HAS FALLEN', W / 2, 108, 30, '#ff8a8a', 'center')
    if (modeT > 1.2) txt('PRESS to rise again', W / 2, 138, 16, '#ffffff', 'center')
  } else if (mode === 'win') {
    g.fillStyle = `rgba(255,220,140,${Math.min(0.85, modeT * 0.5)})`; g.fillRect(0, 0, W, H)
    if (modeT > 1) {
      txt('THE DAWNSTONE IS HOME', W / 2, 70, 26, '#5a2a10', 'center', false)
      ;['Sting carried the stone back to Bramblewick,', 'and spring came to the hills at last.', '', 'THE END'].forEach((l, i) => txt(l, W / 2, 104 + i * 18, 16, '#3a1a08', 'center', false))
      txt('Deaths: ' + S.deaths, W / 2, 196, 14, '#5a2a10', 'center', false)
      if (modeT > 3) txt('PRESS for the title', W / 2, 220, 14, '#5a2a10', 'center', false)
    }
  }
  if (paused) drawPause()
}

// ---------------------------------------------------------------- game flow
function newGame() { S = fresh(); persist(); begin() }
function begin() {
  hero.hp = S.maxHp; hero.inv = 0; hero.kt = 0; hero.swing = 0; hero.dir = 2; hero.warpArmed = false
  hero.x = S.x * TS + 3; hero.y = S.y * TS + 3
  mode = 'play'; modeT = 0; paused = false
  enterScreen(S.screen)
  showBanner(scr.area)
  fadeT = 0.6
}

// ---------------------------------------------------------------- input
installSleep((asleep) => { if (asleep && mode === 'play') { paused = true; pauseSel = 0 } heldWalk.dial = heldWalk.key4 = heldWalk.touch = false })
const env = { hosted: /[?&]from=home(&|$)/.test(location.search) }
function goHome() { if (env.hosted) location.href = '../../index.html' }

type Key = 'select' | 'back' | 'b1' | 'b2' | 'b3' | 'b4' | 'up' | 'down' | 'left' | 'right' | 'cw' | 'ccw'
function menuMove(n: number) {
  if (mode === 'title') { const k = titleItems().length; titleSel = (titleSel + n + k) % k }
  else if (paused) pauseSel = (pauseSel + n + 2) % 2
}
function press(k: Key) {
  if (mode === 'title') {
    if (showHelp) { showHelp = false; return }
    if (k === 'cw' || k === 'down' || k === 'right') menuMove(1)
    else if (k === 'ccw' || k === 'up' || k === 'left') menuMove(-1)
    else if (k === 'select' || k === 'b4') {
      const it = titleItems()[titleSel]
      if (it === 'CONTINUE') { S = loadSave()!; begin() }
      else if (it === 'NEW JOURNEY') newGame()
      else if (it === 'HOW TO PLAY') showHelp = true
      else if (it === 'HOME') goHome()
    } else if (k === 'back') goHome()
    return
  }
  if (mode === 'dead') { if (modeT > 1.2 && (k === 'select' || k === 'back' || k === 'b4')) { const s = loadSave(); if (s) S = Object.assign(s, { deaths: S.deaths }); begin() } return }
  if (mode === 'win') { if (modeT > 3 && (k === 'select' || k === 'back' || k === 'b4')) { mode = 'title'; titleSel = 0 } return }
  if (paused) {
    if (k === 'cw' || k === 'ccw' || k === 'up' || k === 'down') menuMove(k === 'cw' || k === 'down' ? 1 : -1)
    else if (k === 'b3' || k === 'back') paused = false
    else if (k === 'select' || k === 'b4') { if (pauseSel === 0) paused = false; else { persist(); paused = false; mode = 'title'; titleSel = 0 } }
    return
  }
  if (dialog.length) { if (k === 'select' || k === 'back' || k === 'b4') advanceDialog(); return }
  if (mode !== 'play') return
  switch (k) {
    case 'cw': hero.dir = (hero.dir + 1) % 8; break
    case 'ccw': hero.dir = (hero.dir + 7) % 8; break
    case 'select': heldWalk.dial = true; break
    case 'b4': heldWalk.key4 = true; break
    case 'back': swing(); break
    case 'b1': shoot(); break
    case 'b2': drink(); break
    case 'b3': paused = true; pauseSel = 0; heldWalk.dial = heldWalk.key4 = false; break
    case 'up': arrows.up = true; break
    case 'down': arrows.down = true; break
    case 'left': arrows.left = true; break
    case 'right': arrows.right = true; break
  }
}
function release(k: Key) {
  if (k === 'select') heldWalk.dial = false
  else if (k === 'b4') heldWalk.key4 = false
  else if (k === 'up') arrows.up = false
  else if (k === 'down') arrows.down = false
  else if (k === 'left') arrows.left = false
  else if (k === 'right') arrows.right = false
}
const KEYS: { [k: string]: Key } = {
  Digit1: 'b1', Digit2: 'b2', Digit3: 'b3', Digit4: 'b4', Numpad1: 'b1', Numpad2: 'b2', Numpad3: 'b3', Numpad4: 'b4',
  Enter: 'select', NumpadEnter: 'select', Escape: 'back', Backspace: 'back', Space: 'back', KeyZ: 'back', KeyX: 'b1', KeyC: 'b2', KeyP: 'b3',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyQ: 'ccw', KeyE: 'cw',
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
  if (now - lastWheel < 45) return
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!d) return
  lastWheel = now
  let dir = d > 0 ? 1 : -1
  if (reverseDial()) dir = -dir
  press(dir > 0 ? 'cw' : 'ccw')
}, { capture: true, passive: false } as AddEventListenerOptions)

// touch: hold to walk toward your finger; tap Sting to swing; tap anywhere to advance text / pick menu items
function toPlay(clientX: number, clientY: number) {
  const r = cv.getBoundingClientRect()
  return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H - TOP }
}
function touchDown(x: number, y: number) {
  if (mode === 'title' || mode === 'dead' || mode === 'win' || paused || dialog.length) { press('select'); release('select'); return }
  const p = toPlay(x, y)
  if (Math.abs(p.x - (hero.x + 5)) < 12 && Math.abs(p.y - (hero.y + 2)) < 14) { swing(); return }
  touchTarget = p; heldWalk.touch = true
}
cv.addEventListener('touchstart', (e) => { e.preventDefault(); touchDown(e.touches[0].clientX, e.touches[0].clientY) }, { passive: false } as AddEventListenerOptions)
cv.addEventListener('touchmove', (e) => { e.preventDefault(); if (heldWalk.touch) touchTarget = toPlay(e.touches[0].clientX, e.touches[0].clientY) }, { passive: false } as AddEventListenerOptions)
cv.addEventListener('touchend', (e) => { e.preventDefault(); heldWalk.touch = false }, { passive: false } as AddEventListenerOptions)
cv.addEventListener('mousedown', (e) => touchDown(e.clientX, e.clientY))
cv.addEventListener('mousemove', (e) => { if (heldWalk.touch) touchTarget = toPlay(e.clientX, e.clientY) })
cv.addEventListener('mouseup', () => { heldWalk.touch = false })
document.addEventListener('contextmenu', (e) => e.preventDefault())

// ---------------------------------------------------------------- loop
let last = performance.now(), acc = 0
let dialogWas = 0
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (isAsleep()) { requestAnimationFrame(frame); return }
  if (dialog.length !== dialogWas) { if (dialog.length && !dialogWas) dialogStart = performance.now(); dialogWas = dialog.length }
  if (!paused && mode !== 'title') {
    acc += dt
    let n = 0
    while (acc >= 1 / 60 && n < 6) { step(); acc -= 1 / 60; n++ }
    if (n >= 6) acc = 0
  } else if (mode === 'dead' || mode === 'win') modeT += dt
  render()
  requestAnimationFrame(frame)
}
function boot() { requestAnimationFrame((t) => { last = t; frame(t) }) }
const FF = (window as unknown as { FontFace?: typeof FontFace }).FontFace
if (FF && document.fonts) {
  const f = new FF('VT323', 'url(FONTURL)')
  f.load().then((ff) => { (document.fonts as unknown as { add(f: FontFace): void }).add(ff); boot() }).catch(boot)
} else boot()

// test hooks
;(window as unknown as { __sting: unknown }).__sting = {
  state: () => ({ mode, screen: scr && scr.id, x: hero.x, y: hero.y, dir: hero.dir, hp: hero.hp, dialog: dialog.slice(), paused, save: S, enemies: actors.filter((a) => a.alive && isEnemy(a)).length }),
  newGame, god: (v: boolean) => { god = v },
  go: (id: string, tx: number, ty: number) => { hero.x = tx * TS + 3; hero.y = ty * TS + 3; enterScreen(id); mode = 'play' },
  give: (o: Partial<SaveData>) => Object.assign(S, o),
  steps: (n: number) => { for (let i = 0; i < n; i++) step() },
  press, release, screens: () => SCREENS, killAll: () => actors.forEach((a) => { if (isEnemy(a)) damage(a, 99, a.x, a.y - 10) }),
}
