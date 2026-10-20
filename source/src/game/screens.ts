import { ITEM_INFO, ITEMS, Item, LANDMARKS, Landmark, NAME_POOL, OCCUPATIONS, Occupation, START_MONTHS, SEG_SP_A, SEG_SP_B, SEG_MID, SEG_BM_A, SEG_BM_B, BARLOW_MILES, EPITAPHS } from './data'
import { C, G, H, W, bar, drawOx, drawWagon, frame, landmarkArt, landscape, para, rect, text, tombstone, weatherFx, wrap } from './gfx'
import { HuntScreen } from './hunt'
import { RaftScreen } from './raft'
import { Msg, crossRiver, dayTick, fmtQty, makeOffer, milesPerDay, priceMult, riverNow, scoreBreakdown, tryRepair, weatherText, CrossMethod } from './sim'
import { GameState, PACES, PACE_INFO, RATIONS, RATION_INFO, appendRoute, avgHealth, currentLandmark, fmtDate, healthLabel, living, milesToNext, newGame, nextLandmark, pick, region, dateParts } from './state'
import { store } from './storage'
import { Hints, Inp, Menu, MenuItem, NumberScreen, Screen, app, bgFill, choose, footer, say, sayAll } from './ui'

let game: GameState | null = null
export const env = { inDeskThing: false, exit: () => {}, exitLabel: 'Leave game' }

function save() { if (game && !game.over && !game.arrived) store.saveGame(game) }

// ====================================================================== Title
export class TitleScreen implements Screen {
  menu!: Menu
  scroll = 0
  onEnter() { this.build() }
  build() {
    const saved = store.loadGame()
    const items: MenuItem[] = []
    if (saved) items.push({ label: 'Continue journey', right: fmtDate(saved.day, true) + ', ' + Math.round(saved.miles) + ' mi', on: () => { game = saved; startTravel(true) } })
    items.push({ label: 'Begin a new journey', on: () => app.push(new OccupationScreen()) })
    items.push({ label: 'Learn about the trail', on: () => app.push(new HelpScreen()) })
    items.push({ label: 'The Westward Ten', right: 'high scores', on: () => app.push(new ScoresScreen()) })
    items.push({ label: 'Options', on: () => app.push(new OptionsScreen()) })
    if (env.inDeskThing) items.push({ label: env.exitLabel, on: () => env.exit() })
    this.menu = new Menu(items, 150, 238, 500, items.length * 38, 38, 28)
  }
  hints(): Hints { return ['New', 'Help', 'Scores', 'Options'] }
  input(e: Inp) {
    if (e === 'b1') app.push(new OccupationScreen())
    else if (e === 'b2') app.push(new HelpScreen())
    else if (e === 'b3') app.push(new ScoresScreen())
    else if (e === 'b4') app.push(new OptionsScreen())
    else this.menu.input(e)
  }
  tap(x: number, y: number) { return this.menu.tap(x, y) }
  update(dt: number) { this.scroll += dt * 40 }
  draw(g: G, t: number) {
    landscape(g, 'prairie', 32, 448, this.scroll, 'dusk')
    drawOx(g, 520, 395, t, 3); drawOx(g, 572, 395, t, 3)
    drawWagon(g, 430, 386, t, 3)
    g.fillStyle = 'rgba(20,12,6,0.55)'; g.fillRect(0, 60, W, 150)
    text(g, 'WESTWARD', W / 2, 140, 96, '#f6d48a', 'center')
    text(g, '— 1 8 4 8 —', W / 2, 186, 34, C.text, 'center')
    g.fillStyle = 'rgba(20,12,6,0.72)'; g.fillRect(130, 226, 540, this.menu.h + 24)
    this.menu.draw(g)
  }
}

// ====================================================================== Help
const HELP_PAGES: [string, string][] = [
  ['Controls', 'DIAL: turn to move the highlight, change numbers, aim, or steer.\nPRESS DIAL: select, confirm, or fire.\nBACK: go back, or stop the wagon.\nBUTTONS 1 to 4: shortcuts. The bar at the top of the screen always shows what they do.'],
  ['The goal', 'Lead your party of five from Independence, Missouri, to the Willamette Valley in Oregon, about 2,000 miles away. Leave in spring, reach the valley before the snows, and keep as many people alive as you can.'],
  ['Supplies', 'Buy oxen, food, clothing, ammunition, and spare parts before you leave. Forts along the way sell more, but prices climb the farther west you go. Check your stores often.'],
  ['On the trail', 'The wagon rolls on by itself, one day at a time. Press the dial or Back to stop. While travelling: 1 Supplies, 2 Map, 3 Hunt, 4 Camp (pace, rations, rest).'],
  ['Health', 'Hard pace, thin rations, cold without warm clothes, and bad water all wear your party down. Sick people heal faster when you rest. A party in poor health falls ill more often.'],
  ['Rivers', 'You can ford shallow rivers, caulk the wagon and float it, pay for a ferry, or hire a guide where one is offered. Water deeper than about 3 feet is dangerous to ford. Waiting a day can change the river.'],
  ['Hunting', 'Turn the dial to sweep your sights. Buttons 1, 2, 3 pick the high, middle, or low row. Press the dial to fire. Each shot uses a bullet, and you can carry 100 lbs of meat back to the wagon.'],
  ['The end of the trail', 'At The Dalles, choose between rafting the Columbia River (steer with the dial, hard turns with 1 and 4, speed with 2 and 3) or paying the Barlow Road toll to cross Mount Hood.'],
  ['Scoring', 'Your score counts surviving travelers by health, plus leftover supplies and cash. Carpenters double the score and farmers triple it.'],
]
class HelpScreen implements Screen {
  page = 0
  hints(): Hints { return ['Prev', 'Next', '', 'Done'] }
  input(e: Inp) {
    if (e === 'right' || e === 'select' || e === 'b2') { if (this.page < HELP_PAGES.length - 1) this.page++; else if (e === 'select') app.pop() }
    else if (e === 'left' || e === 'b1') this.page = Math.max(0, this.page - 1)
    else if (e === 'back' || e === 'b4') app.pop()
  }
  draw(g: G) {
    bgFill(g)
    const [title, body] = HELP_PAGES[this.page]
    frame(g, 40, 50, W - 80, 380)
    text(g, title, 70, 100, 40, C.accent2)
    text(g, `${this.page + 1} / ${HELP_PAGES.length}`, W - 70, 100, 24, C.dim, 'right')
    para(g, body, 70, 150, W - 140, 28, C.text, 1.1)
    footer(g, 'Turn dial for pages  •  Back when done')
  }
}

// ====================================================================== Scores
class ScoresScreen implements Screen {
  hints(): Hints { return ['', '', '', 'Done'] }
  input(e: Inp) { if (e === 'back' || e === 'select' || e === 'b4') app.pop() }
  draw(g: G) {
    bgFill(g)
    text(g, 'The Westward Ten', W / 2, 82, 42, C.accent2, 'center')
    const rows = store.scores()
    rows.forEach((r, i) => {
      const y = 126 + i * 32
      text(g, `${i + 1}.`, 120, y, 26, C.dim, 'right')
      text(g, r.name, 140, y, 26, C.text)
      text(g, r.occupation, 470, y, 24, C.dim)
      text(g, String(r.score), 680, y, 26, C.accent, 'right')
    })
    footer(g, 'Press dial to return')
  }
}

// ====================================================================== Options
class OptionsScreen implements Screen {
  menu: Menu
  constructor() { this.menu = new Menu([], 120, 120, 560, 240, 46, 28); this.build() }
  build() {
    const o = store.options()
    this.menu.items = [
      { label: 'Dial direction', right: o.reverseDial ? 'reversed' : 'normal', on: () => { o.reverseDial = !o.reverseDial; store.saveOptions(o); this.build() } },
      { label: 'Travel speed', right: ['slow', 'normal', 'fast'][o.speed], on: () => { o.speed = ((o.speed + 1) % 3) as 0 | 1 | 2; store.saveOptions(o); this.build() } },
      { label: 'Reset high scores', on: () => choose('Reset scores?', 'This erases the Westward Ten.', [{ label: 'Yes, erase them', on: () => store.resetScores() }, { label: 'Never mind' }], () => {}) },
      { label: 'Back', on: () => app.pop() },
    ]
  }
  hints(): Hints { return ['', '', '', 'Done'] }
  input(e: Inp) { if (e === 'back' || e === 'b4') app.pop(); else this.menu.input(e) }
  tap(x: number, y: number) { return this.menu.tap(x, y) }
  draw(g: G) { bgFill(g); text(g, 'Options', W / 2, 90, 42, C.accent2, 'center'); this.menu.draw(g); footer(g) }
}

// ====================================================================== New game setup
class OccupationScreen implements Screen {
  menu: Menu
  constructor() {
    this.menu = new Menu(OCCUPATIONS.map((o) => ({ label: o.label, right: '$' + o.money, desc: o.blurb, on: () => app.push(new PartyNamesScreen(o.id)) })), 100, 140, 600, 140, 46, 30)
  }
  hints(): Hints { return ['', '', '', ''] }
  input(e: Inp) { if (e === 'back') app.pop(); else this.menu.input(e) }
  tap(x: number, y: number) { return this.menu.tap(x, y) }
  draw(g: G) {
    bgFill(g)
    text(g, 'Who are you?', W / 2, 92, 42, C.accent2, 'center')
    text(g, 'Many kinds of people made the journey west.', W / 2, 124, 24, C.dim, 'center')
    this.menu.draw(g)
    frame(g, 100, 300, 600, 110, C.panel2)
    para(g, this.menu.current().desc || '', 124, 340, 552, 28, C.text)
    footer(g)
  }
}

class PartyNamesScreen implements Screen {
  names: string[]
  menu!: Menu
  constructor(public occ: Occupation) {
    const pool = NAME_POOL.slice().sort(() => Math.random() - 0.5)
    this.names = pool.slice(0, 5)
    this.build()
  }
  build() {
    const sel = this.menu ? this.menu.sel : 0
    const items: MenuItem[] = this.names.map((n, i) => ({ label: n, right: i === 0 ? 'leader' : 'companion', on: () => app.push(new NameEditScreen(n, (v) => { this.names[i] = v; this.build() })) }))
    items.push({ label: 'Shuffle names', color: C.dim, on: () => this.shuffle() })
    items.push({ label: 'These are my travelers →', color: C.green, on: () => app.push(new MonthScreen(this.occ, this.names.slice())) })
    this.menu = new Menu(items, 160, 130, 480, items.length * 40, 40, 30)
    this.menu.sel = sel
  }
  shuffle() { const pool = NAME_POOL.slice().sort(() => Math.random() - 0.5); this.names = pool.slice(0, 5); this.build() }
  hints(): Hints { return ['', '', 'Shuffle', 'Done'] }
  input(e: Inp) {
    if (e === 'back') app.pop()
    else if (e === 'b3') this.shuffle()
    else if (e === 'b4') app.push(new MonthScreen(this.occ, this.names.slice()))
    else this.menu.input(e)
  }
  tap(x: number, y: number) { return this.menu.tap(x, y) }
  draw(g: G) {
    bgFill(g)
    text(g, 'Your party', W / 2, 82, 42, C.accent2, 'center')
    text(g, 'Press the dial on a name to change it.', W / 2, 112, 24, C.dim, 'center')
    this.menu.draw(g)
    footer(g)
  }
}

const LETTERS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz\'-'
class NameEditScreen implements Screen {
  chars: string[]
  pos: number
  constructor(name: string, public onOk: (v: string) => void) { this.chars = name.split(''); this.pos = this.chars.length - 1 }
  hints(): Hints { return ['◀ Letter', 'Letter ▶', 'Delete', 'Done'] }
  cyc(d: number) {
    const cur = this.chars[this.pos] || ' '
    let i = LETTERS.indexOf(cur); if (i < 0) i = 0
    i = (i + d + LETTERS.length) % LETTERS.length
    this.chars[this.pos] = LETTERS[i]
  }
  input(e: Inp) {
    if (e === 'left') this.cyc(-1)
    else if (e === 'right') this.cyc(1)
    else if (e === 'b1') this.pos = Math.max(0, this.pos - 1)
    else if (e === 'b2' || e === 'select') { if (this.pos < 11) { this.pos++; if (this.pos >= this.chars.length) this.chars.push(this.pos === 0 ? 'A' : 'a') } }
    else if (e === 'b3') { if (this.chars.length > 1) { this.chars.splice(this.pos, 1); this.pos = Math.max(0, Math.min(this.pos, this.chars.length - 1)) } }
    else if (e === 'b4' || e === 'back') { const v = this.chars.join('').trim(); app.pop(); if (v) this.onOk(v.charAt(0).toUpperCase() + v.slice(1)) }
  }
  draw(g: G, t: number) {
    bgFill(g)
    text(g, 'Change name', W / 2, 90, 40, C.accent2, 'center')
    const cw = 44; const x0 = W / 2 - (12 * cw) / 2
    for (let i = 0; i < 12; i++) {
      const x = x0 + i * cw
      rect(g, x + 4, 250, cw - 8, 4, i === this.pos ? C.accent : C.line)
      const ch = this.chars[i] || ''
      text(g, ch, x + cw / 2, 240, 52, i === this.pos ? C.accent2 : C.text, 'center')
      if (i === this.pos && Math.floor(t * 2) % 2 === 0) { text(g, '▲', x + cw / 2, 290, 22, C.accent, 'center') }
    }
    para(g, 'Turn the dial to change the letter. Press the dial for the next letter. 1 moves back, 3 deletes, 4 is done.', 120, 350, 560, 24, C.dim)
  }
}

class MonthScreen implements Screen {
  menu: Menu
  constructor(public occ: Occupation, public names: string[]) {
    this.menu = new Menu(START_MONTHS.map((m) => ({ label: m.label, desc: m.note, on: () => this.go(m.month) })), 240, 130, 320, START_MONTHS.length * 40, 40, 30)
    this.menu.sel = 1
  }
  go(month: number) {
    game = newGame(this.occ, this.names, month)
    const s = game
    app.reset(new TitleScreen())
    say('Independence, Missouri', `It is ${fmtDate(s.day)}. Your party of five has come to Independence to join the great migration west. Before you leave, you need to outfit your wagon. You have $${s.money} to spend.`, () => {
      app.push(new StoreScreen(s, 'Hollister\'s Outfitting', 1, true, () => startTravel(false)))
    }, 'info', (g, t) => landmarkArt(g, 'town', 32, 448, t))
  }
  hints(): Hints { return ['', '', '', ''] }
  input(e: Inp) { if (e === 'back') app.pop(); else this.menu.input(e) }
  tap(x: number, y: number) { return this.menu.tap(x, y) }
  draw(g: G) {
    bgFill(g)
    text(g, 'When will you leave?', W / 2, 92, 42, C.accent2, 'center')
    this.menu.draw(g)
    frame(g, 100, 350, 600, 90, C.panel2)
    para(g, this.menu.current().desc || '', 124, 386, 552, 26, C.text)
  }
}

// ====================================================================== Store
class StoreScreen implements Screen {
  cart: Record<Item, number> = { oxen: 0, food: 0, clothing: 0, bullets: 0, wheels: 0, axles: 0, tongues: 0 }
  sel = 0
  editing = false
  constructor(public s: GameState, public title: string, public mult: number, public first: boolean, public onLeave: () => void) {
    if (first) { this.cart.oxen = 3; this.cart.food = 100; this.cart.clothing = 10; this.cart.bullets = 10; this.cart.wheels = 1; this.cart.axles = 1; this.cart.tongues = 1; this.fit() }
  }
  price(it: Item) { return Math.round(ITEM_INFO[it].basePrice * this.mult * 100) / 100 }
  bill() { return ITEMS.reduce((a, it) => a + this.cart[it] * this.price(it), 0) }
  fit() { // trim the suggested cart if it can't be afforded
    const order: Item[] = ['food', 'bullets', 'clothing', 'tongues', 'axles', 'wheels', 'oxen']
    let i = 0
    while (this.bill() > this.s.money && i < 400) { const it = order[i % order.length]; const min = it === 'oxen' ? 2 : it === 'food' ? 40 : 0; if (this.cart[it] > min) this.cart[it]--; i++ }
  }
  hints(): Hints { return this.editing ? ['-10', '+10', 'None', 'OK'] : ['', '', 'Clear', 'Leave'] }
  maxFor(it: Item) {
    const inf = ITEM_INFO[it]
    const capByMoney = Math.floor((this.s.money - (this.bill() - this.cart[it] * this.price(it))) / this.price(it))
    let cap = inf.max
    if (it === 'wheels' || it === 'axles' || it === 'tongues') cap = Math.max(0, 3 - this.s.supplies[it])
    return Math.max(0, Math.min(cap, capByMoney))
  }
  adjust(d: number) { const it = ITEMS[this.sel]; this.cart[it] = Math.max(0, Math.min(this.maxFor(it), this.cart[it] + d)) }
  input(e: Inp) {
    if (this.editing) {
      if (e === 'left') this.adjust(-1)
      else if (e === 'right') this.adjust(1)
      else if (e === 'b1') this.adjust(-10)
      else if (e === 'b2') this.adjust(10)
      else if (e === 'b3') this.cart[ITEMS[this.sel]] = 0
      else if (e === 'select' || e === 'back' || e === 'b4') this.editing = false
      return
    }
    if (e === 'left') this.sel = Math.max(0, this.sel - 1)
    else if (e === 'right') this.sel = Math.min(ITEMS.length, this.sel + 1)
    else if (e === 'select') { if (this.sel === ITEMS.length) this.leave(); else this.editing = true }
    else if (e === 'b3') { for (const it of ITEMS) this.cart[it] = 0 }
    else if (e === 'b4' || e === 'back') this.leave()
  }
  tap(x: number, y: number) {
    const row = Math.floor((y - 104) / 36)
    if (y > 104 && row >= 0 && row <= ITEMS.length) { this.sel = row; if (row === ITEMS.length) this.leave(); else this.editing = !this.editing; return true }
    return false
  }
  leave() {
    const total = this.bill()
    const s = this.s
    const oxAfter = s.supplies.oxen + this.cart.oxen * 2
    if (this.first && oxAfter < 2) { say('Wait!', 'You need at least one yoke of oxen to pull your wagon.', undefined, 'bad'); return }
    if (this.first && s.supplies.food + this.cart.food * 10 < 200) {
      choose('Not much food', 'You are leaving with very little food. Your party could starve before the first fort. Leave anyway?', [
        { label: 'Buy more food', on: () => { this.sel = 1; this.editing = true } },
        { label: 'Leave anyway', on: () => this.commit(total) },
      ], () => {})
      return
    }
    this.commit(total)
  }
  commit(total: number) {
    const s = this.s
    for (const it of ITEMS) s.supplies[it] += this.cart[it] * ITEM_INFO[it].perUnit
    s.money = Math.round((s.money - total) * 100) / 100
    app.pop()
    this.onLeave()
  }
  draw(g: G) {
    bgFill(g)
    text(g, this.title, 30, 74, 36, C.accent2)
    text(g, fmtDate(this.s.day), W - 30, 74, 26, C.dim, 'right')
    text(g, 'Item', 50, 98, 22, C.faint); text(g, 'Price', 390, 98, 22, C.faint, 'right'); text(g, 'Buying', 540, 98, 22, C.faint, 'right'); text(g, 'Have now', 650, 98, 22, C.faint, 'right'); text(g, 'Cost', 760, 98, 22, C.faint, 'right')
    ITEMS.forEach((it, i) => {
      const y = 104 + i * 36
      const on = i === this.sel
      if (on) { rect(g, 30, y + 2, W - 60, 32, this.editing ? '#5a3a1a' : C.sel); rect(g, 30, y + 2, 5, 32, C.accent) }
      const inf = ITEM_INFO[it]
      text(g, inf.storeLabel, 50, y + 27, 28, on ? C.accent2 : C.text)
      text(g, `$${this.price(it).toFixed(2)}/${inf.storeUnit.split(' ')[0] === 'box' ? 'box' : inf.storeUnit.split(' ')[0] === 'yoke' ? 'yoke' : inf.storeUnit === '10 lbs' ? '10lb' : inf.storeUnit === 'set' ? 'set' : 'ea'}`, 390, y + 27, 24, C.dim, 'right')
      const q = this.cart[it]
      text(g, (on && this.editing ? '◀ ' : '') + String(q) + (on && this.editing ? ' ▶' : ''), 540, y + 27, 28, on && this.editing ? C.accent2 : C.text, 'right')
      text(g, String(this.s.supplies[it]), 650, y + 27, 24, C.dim, 'right')
      text(g, `$${(q * this.price(it)).toFixed(2)}`, 760, y + 27, 26, C.text, 'right')
    })
    const ly = 104 + ITEMS.length * 36
    const onLeave = this.sel === ITEMS.length
    if (onLeave) { rect(g, 30, ly + 2, W - 60, 32, C.sel); rect(g, 30, ly + 2, 5, 32, C.accent) }
    text(g, (onLeave ? '▶ ' : '  ') + 'Pay and leave the store', 50, ly + 27, 28, onLeave ? C.accent2 : C.green)
    rect(g, 30, 400, W - 60, 2, C.line)
    const bill = this.bill(); const left = this.s.money - bill
    text(g, `Total $${bill.toFixed(2)}`, 50, 434, 30, C.text)
    text(g, `You have $${this.s.money.toFixed(2)}  →  $${left.toFixed(2)} left`, 760, 434, 26, left < 0 ? C.red : C.dim, 'right')
    const tip = this.sel < ITEMS.length ? (this.editing ? `1 yoke = 2 oxen. Food comes in 10 lb sacks, bullets in boxes of 20.` : ITEM_INFO[ITEMS[this.sel]].advice) : 'Press the dial to pay and set off.'
    const lines = wrap(g, tip, W - 80, 21)
    lines.slice(0, 2).forEach((l, i) => text(g, l, 40, 454 + i * 20, 21, C.faint))
  }
}

// ====================================================================== Travel
function startTravel(resumed: boolean) {
  app.reset(new TitleScreen())
  const tr = new TravelScreen(game!)
  app.push(tr)
  if (!resumed) {
    say('On the trail', `You leave Independence on ${fmtDate(game!.day)} with ${game!.supplies.oxen} oxen and ${game!.supplies.food} lbs of food. The Kansas River is ${milesToNext(game!)} miles ahead.\n\nThe wagon will roll on its own. Press the dial whenever you want to stop.`, () => { tr.moving = true })
  } else {
    tr.moving = false
    const s = game!
    const prev = s.route[s.legIndex - 1]
    const lm = prev && s.legIndex > 1 && s.miles === prev[1] ? LANDMARKS[prev[0]] : null
    if (lm && lm.kind === 'river' && s.visited.indexOf('x:' + lm.id) < 0) app.push(new RiverScreen(s, lm, tr))
    else app.push(new CampMenu(s, lm, tr, false))
  }
}

class TravelScreen implements Screen {
  moving = false
  acc = 0
  scroll = 0
  lastMsg = ''
  lowFoodWarned = false
  constructor(public s: GameState) {}
  get interval() { return [1.6, 1.0, 0.55][store.options().speed] }
  hints(): Hints { return ['Supplies', 'Map', 'Hunt', 'Camp'] }
  stop() { this.moving = false }
  input(e: Inp) {
    if (e === 'select' || e === 'back') { this.stop(); this.openCamp(); return }
    if (e === 'b1') { this.stop(); app.push(new SuppliesScreen(this.s, () => { this.moving = true })) }
    else if (e === 'b2') { this.stop(); app.push(new MapScreen(this.s, () => { this.moving = true })) }
    else if (e === 'b3') { this.stop(); goHunt(this.s, () => { this.moving = true }) }
    else if (e === 'b4') { this.stop(); app.push(new CampMenu(this.s, null, this, true)) }
  }
  openCamp() { app.push(new CampMenu(this.s, null, this, false)) }
  update(dt: number) {
    if (!this.moving || app.top() !== this) return
    const s = this.s
    this.scroll += dt * 70
    this.acc += dt
    if (this.acc < this.interval) return
    this.acc = 0
    if (s.broken || s.supplies.oxen <= 0) {
      this.stop()
      say(s.broken ? 'The wagon is broken' : 'No oxen', s.broken ? 'You can\'t travel until the wagon is fixed. Try a repair, or trade for a spare part.' : 'You have no oxen to pull the wagon. You must trade for oxen.', () => this.openCamp(), 'bad')
      return
    }
    let mode: 'travel' | 'wait' = 'travel'
    let delayed = ''
    if (s.delay > 0) { s.delay--; mode = 'wait'; delayed = s.delayReason }
    const { msgs, arrived } = dayTick(s, mode)
    if (s.daysTraveled % 5 === 0) save()
    if (delayed) this.lastMsg = `Delayed: ${delayed}`
    else this.lastMsg = msgs.length ? msgs[msgs.length - 1].text : ''
    const totalNeed = living(s).length * [2, 1.5, 1][s.rations]
    if (!this.lowFoodWarned && s.supplies.food > 0 && s.supplies.food < totalNeed * 6) { msgs.push({ title: 'Food running low', text: `Only ${s.supplies.food} lbs of food left, about ${Math.floor(s.supplies.food / Math.max(1, totalNeed))} days at this ration. Hunt, trade, or cut rations.`, tone: 'bad' }); this.lowFoodWarned = true }
    if (s.supplies.food > totalNeed * 12) this.lowFoodWarned = false
    if (msgs.length || arrived || s.over) {
      this.stop()
      sayAll(msgs, () => {
        if (s.over) { gameOver(s); return }
        if (arrived) arrive(s, this)
        else this.moving = true
      })
    }
  }
  draw(g: G, t: number) {
    const s = this.s
    const w = s.weather
    const mood = w.precip.indexOf('snow') >= 0 ? 'snow' : w.precip.indexOf('rain') >= 0 ? 'storm' : w.temp >= 92 ? 'hot' : 'day'
    const reg = region(s)
    landscape(g, reg, 32, 260, this.scroll, mood)
    const bob = this.moving ? Math.sin(t * 12) * 1.5 : 0
    drawOx(g, 520, 236 + bob, this.moving ? t : 0, 3, this.moving)
    drawOx(g, 572, 238 - bob, this.moving ? t + 0.1 : 0, 3, this.moving)
    drawWagon(g, 432, 226 + bob * 0.5, this.moving ? t : 0, 3)
    weatherFx(g, w.precip, t, 32, 260)
    // panel
    rect(g, 0, 292, W, H - 292, C.panel)
    rect(g, 0, 292, W, 2, C.line)
    const next = nextLandmark(s)
    const left = milesToNext(s)
    const rows: [string, string, string?][] = [
      ['Date', fmtDate(s.day)],
      ['Weather', `${weatherText(w)} (${w.temp}°F)`],
      ['Health', healthLabel(avgHealth(s)), avgHealth(s) < 50 ? C.red : avgHealth(s) < 75 ? C.accent : C.green],
      ['Food', `${s.supplies.food} lbs`, s.supplies.food < living(s).length * 30 ? C.red : undefined],
    ]
    rows.forEach(([k, v, col], i) => { text(g, k, 30, 326 + i * 31, 26, C.dim); text(g, v, 140, 326 + i * 31, 28, col || C.text) })
    const rx = 440
    text(g, 'Next', rx, 326, 26, C.dim); text(g, next ? next.name : '—', rx + 70, 326, 26, C.text)
    text(g, `${Math.round(left)} miles to go`, rx + 70, 357, 26, C.accent2)
    const prevM = s.route[s.legIndex - 1] ? s.route[s.legIndex - 1][1] : 0
    const nextM = s.route[s.legIndex] ? s.route[s.legIndex][1] : prevM + 1
    bar(g, rx, 368, 330, 18, (s.miles - prevM) / Math.max(1, nextM - prevM), C.accent)
    text(g, `${Math.round(s.miles)} miles traveled • ${PACES[s.pace]} pace • ${RATIONS[s.rations]}`, rx, 412, 22, C.dim)
    text(g, this.lastMsg ? this.lastMsg.slice(0, 48) : `${living(s).length} travelers • ~${Math.round(milesPerDay(s))} mi/day`, rx, 440, 22, C.faint)
    text(g, this.moving ? 'Press dial to stop' : 'Stopped', W / 2, H - 6, 20, C.faint, 'center')
  }
}

// ====================================================================== Camp / landmark menu
class CampMenu implements Screen {
  menu: Menu
  talkIdx = 0
  constructor(public s: GameState, public here: Landmark | null, public tr: TravelScreen, public quick: boolean) {
    this.menu = new Menu([], 30, 250, 440, 220, 36, 27)
    this.build()
  }
  onEnter() { this.build() }
  build() {
    const s = this.s
    const here = this.here
    const sel = this.menu.sel
    const items: MenuItem[] = []
    if (!this.quick) items.push({ label: here ? 'Continue on the trail' : 'Continue traveling', color: C.green, on: () => this.continueOn() })
    if (here && here.kind !== 'river') items.push({ label: 'Look around', on: () => say(here.name, here.blurb, undefined, 'info', (g, t) => landmarkArt(g, here.scene, 32, 448, t)) })
    if (here && here.talk.length) items.push({ label: 'Talk to people', on: () => { const q = here.talk[this.talkIdx % here.talk.length]; this.talkIdx++; say('You talk to people', q) } })
    if (here && (here.kind === 'fort' || here.kind === 'town')) items.push({ label: 'Buy supplies', right: `$${s.money.toFixed(0)}`, on: () => app.push(new StoreScreen(s, `${here.name} Store`, priceMult(s), false, () => {})) })
    items.push({ label: 'Check supplies', on: () => app.push(new SuppliesScreen(s)) })
    items.push({ label: 'Look at the map', on: () => app.push(new MapScreen(s)) })
    items.push({ label: 'Change pace', right: PACES[s.pace], on: () => this.pace() })
    items.push({ label: 'Change food rations', right: RATIONS[s.rations], on: () => this.rations() })
    items.push({ label: 'Stop to rest', on: () => this.rest() })
    items.push({ label: 'Attempt to trade', on: () => this.trade() })
    items.push({ label: 'Go hunting', right: `${s.supplies.bullets} bullets`, disabled: s.supplies.bullets <= 0 || (here != null && here.kind === 'town'), on: () => goHunt(s, () => this.build()) })
    if (s.broken) items.push({ label: 'Try to repair the wagon', color: C.red, on: () => { const r = tryRepair(s); const { msgs } = dayTick(s, 'hunt'); sayAll([r, ...msgs], () => { if (s.over) gameOver(s); else this.build() }) } })
    items.push({ label: 'Save and quit to title', color: C.dim, on: () => { save(); app.reset(new TitleScreen()) } })
    this.menu.items = items
    this.menu.sel = Math.min(sel, items.length - 1)
    if (this.menu.items[this.menu.sel] && this.menu.items[this.menu.sel].disabled) this.menu.move(1)
  }
  continueOn() {
    const s = this.s
    if (this.here && s.legIndex >= s.route.length) { forkChoice(s, this.here, this.tr); return }
    if (s.broken || s.supplies.oxen <= 0) { say('Can\'t move', s.broken ? 'Your wagon is broken. Repair it or trade for a spare part first.' : 'You need oxen to pull the wagon. Try trading.', undefined, 'bad'); return }
    app.pop(); this.tr.moving = true
  }
  pace() {
    choose('Change pace', `Current pace: ${PACES[this.s.pace]}.`, PACES.map((p, i) => ({ label: p.charAt(0).toUpperCase() + p.slice(1), desc: PACE_INFO[i], on: () => { this.s.pace = i as 0 | 1 | 2; this.build() } })), () => {})
  }
  rations() {
    choose('Change rations', `Current rations: ${RATIONS[this.s.rations]}.`, RATIONS.map((p, i) => ({ label: p.charAt(0).toUpperCase() + p.slice(1), desc: RATION_INFO[i], on: () => { this.s.rations = i as 0 | 1 | 2; this.build() } })), () => {})
  }
  rest() {
    app.push(new NumberScreen('Rest', 'How many days would you like to rest? Resting helps the sick heal and lets the oxen recover.', 2, 1, 9, (n) => `${n} day${n > 1 ? 's' : ''}`, (n) => {
      const all: Msg[] = []
      for (let i = 0; i < n && !this.s.over; i++) all.push(...dayTick(this.s, 'rest').msgs)
      all.push({ title: 'Rested', text: `You rested ${n} day${n > 1 ? 's' : ''}. It is now ${fmtDate(this.s.day)}. Party health: ${healthLabel(avgHealth(this.s))}.`, tone: 'good' })
      save()
      sayAll(all, () => { if (this.s.over) gameOver(this.s); else this.build() })
    }))
  }
  trade() {
    const s = this.s
    const { msgs } = dayTick(s, 'hunt')
    sayAll(msgs, () => {
      if (s.over) { gameOver(s); return }
      const o = makeOffer(s)
      if (!o) { say('No trades', 'You ask around all day, but nobody wants anything you can offer.'); this.build(); return }
      choose('A trade offer', o.text + `\n\nYou have ${fmtQty(o.give, s.supplies[o.give])}.`, [
        { label: 'Accept the trade', on: () => { s.supplies[o.give] -= o.giveN; s.supplies[o.get] += o.getN; say('Traded', `You now have ${fmtQty(o.get, s.supplies[o.get])}.`, () => this.build(), 'good') } },
        { label: 'No, thank you', on: () => this.build() },
      ], () => this.build())
    })
  }
  hints(): Hints { return ['Supplies', 'Map', 'Hunt', this.quick ? 'Close' : 'Go'] }
  input(e: Inp) {
    if (e === 'b1') app.push(new SuppliesScreen(this.s))
    else if (e === 'b2') app.push(new MapScreen(this.s))
    else if (e === 'b3') { if (this.s.supplies.bullets > 0) goHunt(this.s, () => this.build()) }
    else if (e === 'b4') { if (this.quick) { app.pop(); this.tr.moving = true } else this.continueOn() }
    else if (e === 'back') { if (this.quick || !this.here) { this.continueOnSoft() } }
    else this.menu.input(e)
  }
  continueOnSoft() { if (this.quick) { app.pop(); this.tr.moving = true } else if (!this.here) this.continueOn() }
  tap(x: number, y: number) { return this.menu.tap(x, y) }
  draw(g: G, t: number) {
    const s = this.s
    bgFill(g)
    if (this.here) landmarkArt(g, this.here.scene, 32, 200, t)
    else landscape(g, region(s), 32, 200, 0, 'day')
    if (!this.here) { drawOx(g, 520, 172, 0, 3, false); drawOx(g, 572, 174, 0, 3, false); drawWagon(g, 432, 162, 0, 3) }
    g.fillStyle = 'rgba(20,12,6,0.65)'; g.fillRect(0, 32, W, 44)
    text(g, this.here ? this.here.name : this.quick ? 'Camp' : 'Stopped on the trail', 20, 64, 32, C.accent2)
    text(g, fmtDate(s.day), W - 20, 64, 26, C.text, 'right')
    rect(g, 0, 232, W, H - 232, C.bg)
    this.menu.draw(g)
    frame(g, 490, 246, 290, 222, C.panel)
    const next = nextLandmark(s)
    const info: [string, string][] = [
      ['Weather', weatherText(s.weather)],
      ['Health', healthLabel(avgHealth(s))],
      ['Pace', PACES[s.pace]],
      ['Rations', RATIONS[s.rations]],
      ['Food', `${s.supplies.food} lbs`],
      ['Money', `$${s.money.toFixed(2)}`],
      ['Next', next ? `${Math.round(milesToNext(s))} mi` : 'fork ahead'],
    ]
    info.forEach(([k, v], i) => { text(g, k, 508, 278 + i * 28, 24, C.dim); text(g, v, 762, 278 + i * 28, 24, C.text, 'right') })
  }
}

// ====================================================================== Arrival & forks
function arrive(s: GameState, tr: TravelScreen) {
  const lm = nextLandmark(s)!
  s.legIndex++
  s.visited.push(lm.id)
  save()
  if (lm.kind === 'end') { finish(s); return }
  say(lm.name, `${fmtDate(s.day)}. You have reached ${lm.name}.` + (lm.kind === 'river' ? '' : ` ${lm.blurb}`), () => {
    if (lm.kind === 'river') app.push(new RiverScreen(s, lm, tr))
    else app.push(new CampMenu(s, lm, tr, false))
  }, 'info', (g, t) => landmarkArt(g, lm.scene, 32, 448, t))
}

function forkChoice(s: GameState, here: Landmark, tr: TravelScreen) {
  if (here.id === 'south_pass') {
    choose('The trail divides', 'Beyond South Pass the trail splits. Which way will you go?', [
      { label: 'Green River crossing', desc: 'Shorter, but a deep, cold river to cross.', on: () => { s.forks.sp = 'A'; appendRoute(s, SEG_SP_A); appendRoute(s, SEG_MID); go() } },
      { label: 'Fort Bridger', desc: 'About 70 miles longer, with a store and good grazing.', on: () => { s.forks.sp = 'B'; appendRoute(s, SEG_SP_B); appendRoute(s, SEG_MID); go() } },
    ], () => {})
  } else if (here.id === 'blue_mountains') {
    choose('The trail divides', 'Past the Blue Mountains, the trail forks again.', [
      { label: 'Head for The Dalles', desc: 'The direct route.', on: () => { s.forks.bm = 'A'; appendRoute(s, SEG_BM_A); go() } },
      { label: 'Fort Walla Walla', desc: 'About 50 miles longer, with a last chance to resupply.', on: () => { s.forks.bm = 'B'; appendRoute(s, SEG_BM_B); go() } },
    ], () => {})
  } else if (here.id === 'the_dalles') {
    const canPay = s.money >= 30
    choose('The last leg', 'The Willamette Valley lies beyond the Cascade Mountains. How will you get there?', [
      { label: 'Raft down the Columbia', desc: 'Fast and free, but the rapids are deadly. You steer.', on: () => { s.forks.end = 'raft'; app.push(new RaftScreen(s, (msgs) => sayAll(msgs, () => { if (s.over) { gameOver(s); return } s.route.push(['willamette', s.miles + 100]); s.miles += 100; s.day += 4; finish(s) }))) } },
      { label: 'Take the Barlow Road', right: '$30', disabled: !canPay, desc: canPay ? 'A rough toll road over Mount Hood. Slow, cold, but no rapids.' : 'You can\'t afford the $30 toll.', on: () => { s.forks.end = 'barlow'; s.money -= 30; s.route.push(['willamette', s.miles + BARLOW_MILES]); go() } },
    ], () => {})
  } else { app.pop(); tr.moving = true }
  function go() { app.pop(); tr.moving = true }
}

// ====================================================================== River
class RiverScreen implements Screen {
  menu: Menu
  width = 0
  depth = 0
  constructor(public s: GameState, public lm: Landmark, public tr: TravelScreen) {
    this.menu = new Menu([], 30, 300, 470, 170, 34, 26)
    this.measure(); this.build()
  }
  measure() { const r = riverNow(this.lm.river!, this.s); this.width = r.width; this.depth = r.depth }
  build() {
    const r = this.lm.river!; const s = this.s
    const items: MenuItem[] = [
      { label: 'Attempt to ford the river', desc: 'Drive the wagon straight through. Safe only in shallow water.', on: () => this.cross('ford') },
      { label: 'Caulk the wagon and float it', desc: 'Seal the wagon bed and float it across like a boat. Risky in fast water.', on: () => this.cross('float') },
    ]
    if (r.ferry) items.push({ label: 'Take the ferry', right: `$${r.ferry}`, disabled: s.money < r.ferry, desc: 'Pay to be carried across. You may have to wait a few days for your turn.', on: () => this.cross('ferry') })
    if (r.guide) items.push({ label: 'Hire a guide', right: '3 sets clothing', disabled: s.supplies.clothing < 3, desc: 'A local guide knows the safe route across the islands.', on: () => this.cross('guide') })
    items.push({ label: 'Wait a day', desc: 'See whether the river rises or falls.', on: () => { const { msgs } = dayTick(s, 'wait'); this.measure(); sayAll(msgs.concat([{ title: 'You wait a day', text: `The river is now ${this.depth} feet deep.` }]), () => { if (s.over) gameOver(s); else this.build() }) } })
    items.push({ label: 'Check supplies', on: () => app.push(new SuppliesScreen(s)) })
    this.menu.items = items
  }
  cross(m: CrossMethod) {
    const s = this.s; const r = this.lm.river!
    const pre: Msg[] = []
    if (m === 'ferry') {
      s.money -= r.ferry!
      const wait = Math.floor(Math.random() * 4)
      for (let i = 0; i < wait; i++) pre.push(...dayTick(s, 'wait').msgs)
      if (wait) pre.unshift({ title: 'Waiting for the ferry', text: `You wait ${wait} day${wait > 1 ? 's' : ''} for your turn on the ferry.` })
    }
    if (m === 'guide') s.supplies.clothing -= 3
    const res = crossRiver(s, m, this.depth, r)
    s.visited.push('x:' + this.lm.id)
    app.pop()
    sayAll(pre, () => {
      app.push(new CrossAnimScreen(s, this.lm, res.anim, () => {
        sayAll(res.msgs, () => { if (s.over) gameOver(s); else { save(); this.tr.moving = true } })
      }))
    })
  }
  hints(): Hints { return ['Supplies', 'Map', '', ''] }
  input(e: Inp) {
    if (e === 'b1') app.push(new SuppliesScreen(this.s))
    else if (e === 'b2') app.push(new MapScreen(this.s))
    else if (e !== 'back') this.menu.input(e)
  }
  tap(x: number, y: number) { return this.menu.tap(x, y) }
  draw(g: G, t: number) {
    bgFill(g)
    landmarkArt(g, 'river', 32, 236, t)
    g.fillStyle = 'rgba(20,12,6,0.65)'; g.fillRect(0, 32, W, 44)
    text(g, this.lm.name, 20, 64, 32, C.accent2); text(g, fmtDate(this.s.day), W - 20, 64, 26, C.text, 'right')
    text(g, `The river is ${this.width} feet across and ${this.depth} feet deep.`, 30, 296, 26, this.depth >= 3 ? C.red : C.text)
    this.menu.y = 304
    this.menu.draw(g)
    frame(g, 515, 312, 265, 156, C.panel)
    para(g, this.menu.current().desc || '', 530, 344, 240, 22, C.dim)
  }
}

class CrossAnimScreen implements Screen {
  t0 = 0
  constructor(public s: GameState, public lm: Landmark, public kind: 'ok' | 'tip' | 'stuck', public onDone: () => void) {}
  hints(): Hints { return ['', '', '', ''] }
  input(e: Inp) { if ((e === 'select' || e === 'back') && this.t0 > 1) this.end() }
  end() { app.pop(); this.onDone() }
  update(dt: number) { this.t0 += dt; if (this.t0 > 3.6) this.end() }
  draw(g: G, t: number) {
    landmarkArt(g, 'river', 32, 448, t)
    const p = Math.min(1, this.t0 / 3.2)
    const x = this.kind === 'stuck' ? 60 + Math.min(p, 0.3) * 600 : 40 + p * 640
    const tipped = this.kind === 'tip' && p > 0.45
    const y = 32 + 448 * 0.74 + 6 + Math.sin(t * 4) * 3
    drawWagon(g, x, y, t, 3, tipped)
    if (!tipped) { drawOx(g, x + 88, y + 12, t, 3); drawOx(g, x + 140, y + 14, t, 3) }
    if (tipped) { g.fillStyle = 'rgba(240,240,250,0.8)'; for (let i = 0; i < 8; i++) g.fillRect(x + (i * 23) % 110, y + 40 + Math.sin(t * 6 + i) * 6, 14, 3) }
    text(g, 'Crossing the river…', W / 2, 80, 32, '#ffffff', 'center')
  }
}

// ====================================================================== Supplies & party
class SuppliesScreen implements Screen {
  constructor(public s: GameState, public onClose?: () => void) {}
  hints(): Hints { return ['', '', '', 'Done'] }
  input(e: Inp) { if (e === 'select' || e === 'back' || e === 'b4' || e === 'b1') { app.pop(); this.onClose && this.onClose() } }
  draw(g: G) {
    const s = this.s
    bgFill(g)
    text(g, 'Supplies', 40, 78, 36, C.accent2)
    text(g, `$${s.money.toFixed(2)}`, 360, 78, 30, C.green, 'right')
    const rows: [string, string][] = [
      ['Oxen', `${s.supplies.oxen} (${healthLabel(s.oxenHealth)})`], ['Food', `${s.supplies.food} lbs`], ['Clothing', `${s.supplies.clothing} sets`], ['Bullets', String(s.supplies.bullets)],
      ['Spare wheels', String(s.supplies.wheels)], ['Spare axles', String(s.supplies.axles)], ['Spare tongues', String(s.supplies.tongues)],
    ]
    rows.forEach(([k, v], i) => { text(g, k, 40, 124 + i * 34, 28, C.dim); text(g, v, 360, 124 + i * 34, 28, C.text, 'right') })
    if (s.broken) text(g, `Broken ${s.broken.replace(/s$/, '')}!`, 40, 124 + 7 * 34, 26, C.red)
    rect(g, 395, 50, 2, 400, C.line)
    text(g, 'Party', 430, 78, 36, C.accent2)
    s.party.forEach((m, i) => {
      const y = 124 + i * 64
      text(g, m.name + (i === 0 ? ' ★' : ''), 430, y, 28, m.alive ? C.text : C.faint)
      if (m.alive) {
        bar(g, 600, y - 18, 160, 18, m.health / 100, m.health >= 75 ? C.green : m.health >= 50 ? C.accent : C.red)
        const cond = [m.illness, m.injury].filter(Boolean).join(', ') || healthLabel(m.health)
        text(g, cond, 430, y + 26, 22, m.illness || m.injury ? C.red : C.dim)
      } else text(g, `died of ${m.cause || 'unknown causes'}`, 600, y, 22, C.faint)
    })
    footer(g, 'Press dial to return')
  }
}

const MAP_POS: Record<string, [number, number]> = {
  independence: [742, 336], kansas_river: [702, 324], big_blue: [660, 308], fort_kearney: [592, 298], chimney_rock: [502, 286], fort_laramie: [456, 278],
  independence_rock: [396, 268], south_pass: [346, 256], green_river: [306, 266], fort_bridger: [302, 304], soda_springs: [262, 242], fort_hall: [228, 226],
  snake_river: [184, 238], fort_boise: [148, 212], blue_mountains: [124, 182], fort_walla_walla: [130, 142], the_dalles: [90, 152], willamette: [54, 174],
}
function T(x: number, y: number): [number, number] { return [60 + (x - 48) * 0.98, 150 + (y - 140) * 1.55] }
const ALL_EDGES: [string, string][] = [['independence', 'kansas_river'], ['kansas_river', 'big_blue'], ['big_blue', 'fort_kearney'], ['fort_kearney', 'chimney_rock'], ['chimney_rock', 'fort_laramie'], ['fort_laramie', 'independence_rock'], ['independence_rock', 'south_pass'], ['south_pass', 'green_river'], ['green_river', 'soda_springs'], ['south_pass', 'fort_bridger'], ['fort_bridger', 'soda_springs'], ['soda_springs', 'fort_hall'], ['fort_hall', 'snake_river'], ['snake_river', 'fort_boise'], ['fort_boise', 'blue_mountains'], ['blue_mountains', 'the_dalles'], ['blue_mountains', 'fort_walla_walla'], ['fort_walla_walla', 'the_dalles'], ['the_dalles', 'willamette']]
class MapScreen implements Screen {
  sel: number
  ids = Object.keys(MAP_POS)
  constructor(public s: GameState, public onClose?: () => void) { this.sel = Math.max(0, this.ids.indexOf(currentLandmark(s).id)) }
  hints(): Hints { return ['', '', '', 'Done'] }
  input(e: Inp) {
    if (e === 'left') this.sel = (this.sel - 1 + this.ids.length) % this.ids.length
    else if (e === 'right') this.sel = (this.sel + 1) % this.ids.length
    else if (e === 'select' || e === 'back' || e === 'b4' || e === 'b2') { app.pop(); this.onClose && this.onClose() }
  }
  P(id: string): [number, number] { const [x, y] = MAP_POS[id]; return T(x, y) }
  draw(g: G, t: number) {
    const s = this.s
    rect(g, 0, 32, W, H - 32, '#d9c49a')
    g.fillStyle = 'rgba(120,90,50,0.08)'; for (let i = 0; i < 60; i++) g.fillRect((i * 173) % W, 32 + (i * 97) % (H - 32), 40, 2)
    // mountains
    const mtn = (x: number, y: number, s2 = 1) => { g.fillStyle = '#8a7656'; g.beginPath(); g.moveTo(x - 14 * s2, y); g.lineTo(x, y - 18 * s2); g.lineTo(x + 14 * s2, y); g.fill(); g.fillStyle = '#f2ead8'; g.beginPath(); g.moveTo(x - 5 * s2, y - 12 * s2); g.lineTo(x, y - 18 * s2); g.lineTo(x + 5 * s2, y - 12 * s2); g.fill() }
    ;[[330, 228], [372, 236], [352, 300], [318, 330], [276, 290], [250, 318], [380, 304], [96, 214], [70, 236], [104, 252], [150, 168], [172, 190], [60, 128]].forEach(([x, y]) => { const [a, b] = T(x, y); mtn(a, b) })
    const riv = (pts: number[][]) => { g.strokeStyle = '#6f9ab4'; g.lineWidth = 3; g.beginPath(); const a = T(pts[0][0], pts[0][1]); g.moveTo(a[0], a[1]); for (let i = 1; i < pts.length; i += 2) { const c = T(pts[i][0], pts[i][1]); const d = T(pts[i + 1][0], pts[i + 1][1]); g.quadraticCurveTo(c[0], c[1], d[0], d[1]) } g.stroke() }
    riv([[0, 160], [60, 132], [130, 150], [190, 200], [260, 214]]); riv([[456, 278], [560, 300], [640, 340]])
    // pacific
    rect(g, 0, 32, 22, H - 32, '#7aa0b8')
    'PACIFIC'.split('').forEach((ch, i) => text(g, ch, 11, 200 + i * 18, 18, '#2e4e64', 'center'))
    text(g, 'OREGON COUNTRY', 130, 380, 24, '#8a7050', 'center'); text(g, 'GREAT PLAINS', 590, 400, 24, '#8a7050', 'center'); text(g, 'ROCKY MOUNTAINS', 330, 430, 22, '#8a7050', 'center')
    // edges
    const trav = new Set<string>()
    for (let i = 0; i < s.legIndex; i++) trav.add(s.route[i][0])
    for (const [a, b] of ALL_EDGES) {
      const [x1, y1] = this.P(a); const [x2, y2] = this.P(b)
      const done = trav.has(a) && trav.has(b) && s.route.some((r, i) => r[0] === b && i < s.legIndex && s.route[i - 1] && s.route[i - 1][0] === a)
      g.strokeStyle = done ? '#9a3a20' : '#7a6440'; g.lineWidth = done ? 4 : 2
      g.setLineDash(done ? [] : [6, 6]); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke()
    }
    g.setLineDash([])
    // current position
    const a = s.route[s.legIndex - 1]; const b = s.route[s.legIndex]
    let px: number, py: number
    if (a && b) { const f = (s.miles - a[1]) / Math.max(1, b[1] - a[1]); const [x1, y1] = this.P(a[0]); const [x2, y2] = this.P(b[0]); px = x1 + (x2 - x1) * f; py = y1 + (y2 - y1) * f; g.strokeStyle = '#9a3a20'; g.lineWidth = 4; g.beginPath(); g.moveTo(x1, y1); g.lineTo(px, py); g.stroke() }
    else { [px, py] = this.P(a ? a[0] : 'independence') }
    this.ids.forEach((id, i) => {
      const [x, y] = this.P(id)
      const lm = LANDMARKS[id]
      g.fillStyle = trav.has(id) ? '#9a3a20' : '#5a4a30'
      if (lm.kind === 'fort' || lm.kind === 'town' || lm.kind === 'end') g.fillRect(x - 6, y - 6, 12, 12)
      else if (lm.kind === 'river') { g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill() }
      else { g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 7, y + 5); g.lineTo(x - 7, y + 5); g.fill() }
      if (i === this.sel) { g.strokeStyle = '#2a1a0a'; g.lineWidth = 2; g.strokeRect(x - 11, y - 11, 22, 22) }
    })
    const pulse = 6 + Math.sin(t * 5) * 2
    g.fillStyle = '#e8a845'; g.beginPath(); g.arc(px, py, pulse, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#2a1a0a'; g.lineWidth = 2; g.stroke()
    // info box
    const lm = LANDMARKS[this.ids[this.sel]]
    rect(g, 420, 40, 370, 72, 'rgba(42,30,19,0.92)')
    text(g, lm.name, 436, 68, 26, C.accent2)
    const ri = s.route.findIndex((r) => r[0] === lm.id)
    const sub = ri >= 0 ? (ri < s.legIndex ? `Reached • mile ${s.route[ri][1]}` : `${Math.round(s.route[ri][1] - s.miles)} miles ahead`) : 'Not on your planned route (yet)'
    text(g, sub, 436, 98, 22, C.dim)
    text(g, 'The Trail West', 40, 70, 32, '#4a3018')
    text(g, `${Math.round(s.miles)} miles from Independence`, 40, 98, 22, '#6a5030')
    text(g, 'Dial: browse places • Press to close', 40, H - 14, 20, '#6a5030')
  }
}

// ====================================================================== Hunting wrapper
function goHunt(s: GameState, after: () => void) {
  if (s.supplies.bullets <= 0) { say('No bullets', 'You have no ammunition left to hunt with.', after, 'bad'); return }
  const here = s.route[s.legIndex - 1] && s.miles === s.route[s.legIndex - 1][1] ? LANDMARKS[s.route[s.legIndex - 1][0]] : null
  if (here && here.kind === 'town') { say('No hunting here', 'There\'s no game this close to town.', after); return }
  app.push(new HuntScreen(s, (meat, shots, kills) => {
    const carry = Math.min(100, meat)
    s.supplies.food += carry
    const { msgs } = dayTick(s, 'hunt')
    const summary: Msg = { title: 'Back at the wagon', text: kills.length ? `You fired ${shots} shot${shots === 1 ? '' : 's'} and brought down ${kills.length} animal${kills.length > 1 ? 's' : ''}. ${carry} lbs of meat added. You now have ${s.supplies.food} lbs of food.` : `You fired ${shots} shot${shots === 1 ? '' : 's'} and hit nothing. Better luck next time.`, tone: kills.length ? 'good' : 'info' }
    sayAll([summary, ...msgs], () => { if (s.over) gameOver(s); else after() })
  }))
}

// ====================================================================== End states
function finish(s: GameState) {
  s.arrived = true
  store.clearGame()
  const sc = scoreBreakdown(s)
  const rank = store.addScore({ name: s.party[0].name, score: sc.total, occupation: s.occupation, date: fmtDate(s.day, true), survivors: living(s).length })
  app.reset(new TitleScreen())
  app.push(new EndScreen(s, sc, rank))
}

class EndScreen implements Screen {
  page = 0
  constructor(public s: GameState, public sc: ReturnType<typeof scoreBreakdown>, public rank: number) {}
  hints(): Hints { return ['', '', '', 'Done'] }
  input(e: Inp) {
    if (e === 'select' || e === 'right') { if (this.page < 1) this.page++; else app.pop() }
    else if (e === 'back' || e === 'b4') app.pop()
    else if (e === 'left') this.page = 0
  }
  draw(g: G, t: number) {
    const s = this.s
    if (this.page === 0) {
      landmarkArt(g, 'valley', 32, 448, t)
      g.fillStyle = 'rgba(20,12,6,0.7)'; g.fillRect(60, 60, W - 120, 200)
      text(g, 'Welcome to Oregon!', W / 2, 116, 48, '#f6d48a', 'center')
      const days = s.day - s.startDay
      para(g, `You reached the Willamette Valley on ${fmtDate(s.day)}, after ${days} days on the trail. ${living(s).length} of your party of ${s.party.length} made it.`, 90, 160, W - 180, 28, C.text)
      text(g, 'Press dial for your score', W / 2, 246, 22, C.dim, 'center')
    } else {
      bgFill(g)
      text(g, 'Final score', W / 2, 76, 40, C.accent2, 'center')
      this.sc.rows.slice(0, 11).forEach(([k, v], i) => { text(g, k, 150, 116 + i * 28, 24, C.text); text(g, String(v), 650, 116 + i * 28, 24, C.dim, 'right') })
      const y = 116 + Math.min(11, this.sc.rows.length) * 28 + 6
      rect(g, 150, y - 18, 500, 2, C.line)
      text(g, `${this.sc.base} × ${this.sc.mult} (${s.occupation})`, 150, y + 12, 26, C.dim)
      text(g, String(this.sc.total), 650, y + 12, 34, C.accent2, 'right')
      if (this.rank >= 0) text(g, `You made the Westward Ten at #${this.rank + 1}!`, W / 2, H - 20, 26, C.green, 'center')
    }
  }
}

function gameOver(s: GameState) {
  s.over = true
  store.clearGame()
  app.reset(new TitleScreen())
  app.push(new GameOverScreen(s))
}
class GameOverScreen implements Screen {
  ep = pick(EPITAPHS)
  constructor(public s: GameState) {}
  hints(): Hints { return ['', '', '', 'Done'] }
  input(e: Inp) { if (e === 'select' || e === 'back' || e === 'b4') app.pop() }
  draw(g: G, t: number) {
    landscape(g, region(this.s), 32, 448, 0, dateParts(this.s.day).month >= 9 ? 'snow' : 'dusk')
    tombstone(g, 365, 300)
    g.fillStyle = 'rgba(20,12,6,0.75)'; g.fillRect(60, 60, W - 120, 170)
    text(g, 'Your journey has ended', W / 2, 110, 42, C.red, 'center')
    para(g, `${this.s.overReason} ${fmtDate(this.s.day)}, ${Math.round(this.s.miles)} miles from Independence.`, 90, 152, W - 180, 26, C.text)
    text(g, `“${this.ep}”`, W / 2, 218, 24, C.dim, 'center')
    void t
  }
}
