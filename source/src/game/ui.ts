import { C, G, H, W, frame, para, rect, text, wrap } from './gfx'

export type Inp = 'left' | 'right' | 'select' | 'back' | 'b1' | 'b2' | 'b3' | 'b4'
export type Hints = [string, string, string, string]

export interface Screen {
  input(e: Inp): void
  update?(dt: number): void
  draw(g: G, t: number): void
  hints?(): Hints
  tap?(x: number, y: number): boolean
  onEnter?(): void
  overlay?: boolean // draw screen below first
}

class App {
  stack: Screen[] = []
  t = 0
  push(s: Screen) { this.stack.push(s); s.onEnter && s.onEnter() }
  pop() { this.stack.pop(); const top = this.top(); top && top.onEnter && top.onEnter() }
  replace(s: Screen) { this.stack.pop(); this.push(s) }
  reset(s: Screen) { this.stack = []; this.push(s) }
  top() { return this.stack[this.stack.length - 1] }
  input(e: Inp) { const s = this.top(); if (s) s.input(e) }
  update(dt: number) { this.t += dt; const s = this.top(); if (s && s.update) s.update(dt) }
  draw(g: G) {
    let i = this.stack.length - 1
    while (i > 0 && this.stack[i].overlay) i--
    for (let k = Math.max(0, i); k < this.stack.length; k++) this.stack[k].draw(g, this.t)
    const top = this.top()
    drawHints(g, top && top.hints ? top.hints() : ['', '', '', ''])
  }
  tap(x: number, y: number) {
    if (y < 34) { const idx = Math.floor(x / 200); this.input((['b1', 'b2', 'b3', 'b4'] as Inp[])[idx]); return }
    const s = this.top(); if (s && s.tap && s.tap(x, y)) return
    this.input('select')
  }
}
export const app = new App()

export function drawHints(g: G, h: Hints) {
  rect(g, 0, 0, W, 32, '#120c07')
  for (let i = 0; i < 4; i++) {
    const cx = 100 + i * 200
    if (h[i]) {
      frame(g, cx - 88, 3, 176, 26, '#2e2115', '#6b5236')
      text(g, String(i + 1), cx - 76, 23, 22, C.accent)
      text(g, h[i], cx + 8, 23, 22, C.text, 'center')
    }
  }
}

export interface MenuItem { label: string; right?: string; desc?: string; disabled?: boolean; on?: () => void; color?: string }

export class Menu {
  sel = 0
  top = 0
  constructor(public items: MenuItem[], public x: number, public y: number, public w: number, public h: number, public rowH = 38, public size = 28) {
    this.sel = Math.max(0, items.findIndex((i) => !i.disabled))
  }
  get rows() { return Math.floor(this.h / this.rowH) }
  move(d: number) {
    if (!this.items.length) return
    let n = this.sel
    for (let k = 0; k < this.items.length; k++) {
      n = Math.max(0, Math.min(this.items.length - 1, n + d))
      if (!this.items[n].disabled) break
      if (n === 0 || n === this.items.length - 1) { n = this.sel; break }
    }
    this.sel = n
    if (this.sel < this.top) this.top = this.sel
    if (this.sel >= this.top + this.rows) this.top = this.sel - this.rows + 1
  }
  input(e: Inp): boolean {
    if (e === 'left') { this.move(-1); return true }
    if (e === 'right') { this.move(1); return true }
    if (e === 'select') { const it = this.items[this.sel]; if (it && !it.disabled && it.on) it.on(); return true }
    return false
  }
  tap(x: number, y: number) {
    if (x < this.x || x > this.x + this.w || y < this.y || y > this.y + this.h) return false
    const idx = this.top + Math.floor((y - this.y) / this.rowH)
    if (idx < this.items.length && !this.items[idx].disabled) { this.sel = idx; const it = this.items[idx]; it.on && it.on() }
    return true
  }
  draw(g: G) {
    const n = Math.min(this.rows, this.items.length - this.top)
    for (let i = 0; i < n; i++) {
      const idx = this.top + i
      const it = this.items[idx]
      const yy = this.y + i * this.rowH
      const on = idx === this.sel
      if (on) { rect(g, this.x, yy + 2, this.w, this.rowH - 4, C.sel); rect(g, this.x, yy + 2, 5, this.rowH - 4, C.accent) }
      const col = it.disabled ? C.faint : it.color || (on ? C.accent2 : C.text)
      text(g, (on ? '▶ ' : '  ') + it.label, this.x + 12, yy + this.rowH * 0.72, this.size, col)
      if (it.right) text(g, it.right, this.x + this.w - 12, yy + this.rowH * 0.72, this.size, it.disabled ? C.faint : C.dim, 'right')
    }
    if (this.top > 0) text(g, '▲', this.x + this.w - 12, this.y + 4, 18, C.dim, 'right', 'top')
    if (this.top + this.rows < this.items.length) text(g, '▼', this.x + this.w - 12, this.y + this.h - 2, 18, C.dim, 'right', 'bottom')
  }
  current() { return this.items[this.sel] }
}

export function bgFill(g: G) { rect(g, 0, 0, W, H, C.bg) }

export function footer(g: G, s = 'Turn dial to choose  •  Press dial to select  •  Back to return') {
  text(g, s, W / 2, H - 10, 20, C.faint, 'center')
}

// Generic message box ---------------------------------------------------
export class MessageScreen implements Screen {
  overlay = true
  pages: string[][] = []
  page = 0
  constructor(public title: string, public body: string, public onDone?: () => void, public tone: 'good' | 'bad' | 'info' = 'info', public art?: (g: G, t: number) => void) {}
  hints(): Hints { return ['', '', '', ''] }
  input(e: Inp) {
    if (e === 'select' || e === 'back' || e === 'b4') this.next()
    else if (e === 'right') this.next()
    else if (e === 'left' && this.page > 0) this.page--
  }
  next() {
    if (this.page < this.pages.length - 1) { this.page++; return }
    app.pop(); this.onDone && this.onDone()
  }
  draw(g: G, t: number) {
    const bx = 60, by = this.art ? 250 : 90, bw = W - 120
    if (!this.pages.length) {
      const lines = wrap(g, this.body, bw - 60, 28)
      const per = this.art ? 4 : 7
      for (let i = 0; i < lines.length; i += per) this.pages.push(lines.slice(i, i + per))
    }
    if (this.art) this.art(g, t)
    else { g.fillStyle = 'rgba(10,6,3,0.6)'; g.fillRect(0, 32, W, H - 32) }
    const lines = this.pages[this.page] || []
    const bh = 80 + lines.length * 30 + 20
    const top = this.art ? H - bh - 10 : Math.max(by, (H - bh) / 2 + 10)
    frame(g, bx, top, bw, bh, C.panel, this.tone === 'bad' ? C.red : this.tone === 'good' ? C.green : C.line)
    text(g, this.title, bx + 30, top + 44, 34, this.tone === 'bad' ? C.red : this.tone === 'good' ? C.green : C.accent2)
    lines.forEach((l, i) => text(g, l, bx + 30, top + 82 + i * 30, 28, C.text))
    const more = this.page < this.pages.length - 1
    text(g, more ? 'Press dial ▶ more' : 'Press dial to continue', bx + bw - 24, top + bh - 14, 20, C.dim, 'right')
  }
}

export function say(title: string, body: string, onDone?: () => void, tone: 'good' | 'bad' | 'info' = 'info', art?: (g: G, t: number) => void) {
  app.push(new MessageScreen(title, body, onDone, tone, art))
}
export function sayAll(msgs: { title: string; text: string; tone?: 'good' | 'bad' | 'info' }[], onDone?: () => void) {
  const q = msgs.slice()
  const next = () => { const m = q.shift(); if (!m) { onDone && onDone(); return } say(m.title, m.text, next, m.tone || 'info') }
  next()
}

// Choice dialog -------------------------------------------------------
export class ChoiceScreen implements Screen {
  overlay = true
  menu: Menu
  constructor(public title: string, public prompt: string, items: MenuItem[], public onBack?: () => void) {
    this.menu = new Menu(items, 80, 0, W - 160, Math.min(items.length, 6) * 40, 40, 28)
  }
  hints(): Hints { return ['', '', '', ''] }
  input(e: Inp) {
    if (e === 'back') { if (this.onBack) { app.pop(); this.onBack() } return }
    this.menu.input(e)
  }
  tap(x: number, y: number) { return this.menu.tap(x, y) }
  draw(g: G) {
    g.fillStyle = 'rgba(10,6,3,0.7)'; g.fillRect(0, 32, W, H - 32)
    const lines = wrap(g, this.prompt, W - 160, 26)
    const mh = this.menu.h
    const bh = 70 + lines.length * 28 + mh + 20
    const top = Math.max(40, (H - bh) / 2 + 12)
    frame(g, 60, top, W - 120, bh)
    text(g, this.title, 80, top + 42, 32, C.accent2)
    lines.forEach((l, i) => text(g, l, 80, top + 76 + i * 28, 26, C.text))
    this.menu.y = top + 70 + lines.length * 28
    this.menu.draw(g)
    const d = this.menu.current() && this.menu.current().desc
    if (d) para(g, d, 80, top + bh + 26, W - 160, 22, C.dim)
  }
}
export function choose(title: string, prompt: string, items: MenuItem[], onBack?: () => void) {
  // wrap so selecting pops the dialog first
  const wrapped = items.map((it) => ({ ...it, on: () => { app.pop(); it.on && it.on() } }))
  app.push(new ChoiceScreen(title, prompt, wrapped, onBack))
}

// Number picker ---------------------------------------------------------
export class NumberScreen implements Screen {
  overlay = true
  constructor(public title: string, public prompt: string, public value: number, public min: number, public max: number, public fmt: (n: number) => string, public onOk: (n: number) => void, public step = 1) {}
  hints(): Hints { return ['-10', '+10', 'Min', 'Max'] }
  input(e: Inp) {
    if (e === 'left') this.value = Math.max(this.min, this.value - this.step)
    else if (e === 'right') this.value = Math.min(this.max, this.value + this.step)
    else if (e === 'b1') this.value = Math.max(this.min, this.value - this.step * 10)
    else if (e === 'b2') this.value = Math.min(this.max, this.value + this.step * 10)
    else if (e === 'b3') this.value = this.min
    else if (e === 'b4') this.value = this.max
    else if (e === 'select') { app.pop(); this.onOk(this.value) }
    else if (e === 'back') app.pop()
  }
  draw(g: G) {
    g.fillStyle = 'rgba(10,6,3,0.7)'; g.fillRect(0, 32, W, H - 32)
    frame(g, 120, 110, W - 240, 280)
    text(g, this.title, W / 2, 160, 34, C.accent2, 'center')
    para(g, this.prompt, 150, 198, W - 300, 24, C.dim)
    text(g, '◀', 230, 315, 40, C.faint, 'center'); text(g, '▶', W - 230, 315, 40, C.faint, 'center')
    text(g, this.fmt(this.value), W / 2, 320, 56, C.text, 'center')
    text(g, 'Turn dial to adjust • Press to confirm', W / 2, 372, 20, C.faint, 'center')
  }
}
