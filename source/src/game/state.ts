import { ILLNESSES, Item, LANDMARKS, Landmark, MONTHS, Occupation, OCCUPATIONS, Region, SEG_START } from './data'

export interface Member { name: string; health: number; alive: boolean; illness: string | null; illnessDays: number; injury: string | null; injuryDays: number; cause?: string }

export type Supplies = Record<Item, number>

export interface Weather { temp: number; label: string; precip: 'none' | 'rain' | 'heavy rain' | 'snow' | 'heavy snow' }

export interface GameState {
  v: number
  occupation: Occupation
  money: number
  day: number // days since Jan 1 1848 (0-based)
  startDay: number
  miles: number // total miles traveled
  route: [string, number][] // landmark id, cumulative mile marker
  legIndex: number // index in route of the NEXT landmark to reach
  pace: 0 | 1 | 2
  rations: 0 | 1 | 2
  supplies: Supplies
  oxenHealth: number
  party: Member[]
  weather: Weather
  wetness: number
  broken: null | 'wheels' | 'axles' | 'tongues'
  stuckDays: number
  delay: number // days lost to events, consumed by travel loop
  delayReason: string
  visited: string[]
  forks: { sp?: 'A' | 'B'; bm?: 'A' | 'B'; end?: 'raft' | 'barlow' }
  log: string[]
  hunted: Record<string, number>
  daysTraveled: number
  arrived: boolean
  over: boolean
  overReason: string
  finalBonus: number
}

export function routeFromSegments(segs: [string, number][]): [string, number][] {
  const out: [string, number][] = []
  let m = 0
  for (const [id, d] of segs) { m += d; out.push([id, m]) }
  return out
}

export function appendRoute(s: GameState, segs: [string, number][]) {
  let m = s.route[s.route.length - 1][1]
  for (const [id, d] of segs) { m += d; s.route.push([id, m]) }
}

export function newGame(occupation: Occupation, names: string[], startMonth: number): GameState {
  const occ = OCCUPATIONS.find((o) => o.id === occupation)!
  const startDay = dayOfYear(startMonth, 1)
  return {
    v: 1, occupation, money: occ.money, day: startDay, startDay, miles: 0,
    route: routeFromSegments(SEG_START), legIndex: 1, pace: 0, rations: 0,
    supplies: { oxen: 0, food: 0, clothing: 0, bullets: 0, wheels: 0, axles: 0, tongues: 0 },
    oxenHealth: 100,
    party: names.map((name) => ({ name, health: 100, alive: true, illness: null, illnessDays: 0, injury: null, injuryDays: 0 })),
    weather: { temp: 60, label: 'warm', precip: 'none' }, wetness: 0.5,
    broken: null, stuckDays: 0, delay: 0, delayReason: '', visited: ['independence'], forks: {}, log: [], hunted: {},
    daysTraveled: 0, arrived: false, over: false, overReason: '', finalBonus: 0,
  }
}

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] // 1848 is a leap year
export function dayOfYear(month: number, date: number) { let d = 0; for (let i = 0; i < month; i++) d += MONTH_DAYS[i]; return d + date - 1 }
export function dateParts(day: number) {
  let year = 1848; let d = day
  for (;;) {
    const ylen = year % 4 === 0 ? 366 : 365
    if (d < ylen) break
    d -= ylen; year++
  }
  let m = 0
  for (;;) { const ml = m === 1 ? (year % 4 === 0 ? 29 : 28) : MONTH_DAYS[m]; if (d < ml) break; d -= ml; m++ }
  return { year, month: m, date: d + 1 }
}
export function fmtDate(day: number, short = false) {
  const p = dateParts(day)
  return short ? `${MONTHS[p.month].slice(0, 3)} ${p.date}` : `${MONTHS[p.month]} ${p.date}, ${p.year}`
}

export const living = (s: GameState) => s.party.filter((m) => m.alive)
export function nextLandmark(s: GameState): Landmark | null { const r = s.route[s.legIndex]; return r ? LANDMARKS[r[0]] : null }
export function milesToNext(s: GameState) { const r = s.route[s.legIndex]; return r ? Math.max(0, r[1] - s.miles) : 0 }
export function currentLandmark(s: GameState): Landmark { return LANDMARKS[s.route[Math.max(0, s.legIndex - 1)][0]] }
export function region(s: GameState): Region {
  const next = nextLandmark(s)
  return next ? next.region : currentLandmark(s).region
}
export function avgHealth(s: GameState) { const l = living(s); return l.length ? l.reduce((a, m) => a + m.health, 0) / l.length : 0 }
export function healthLabel(h: number) { return h >= 75 ? 'good' : h >= 50 ? 'fair' : h >= 25 ? 'poor' : 'very poor' }
export const PACES = ['steady', 'strenuous', 'grueling'] as const
export const RATIONS = ['filling', 'meager', 'bare bones'] as const
export const PACE_INFO = ['About 8 hours a day. Easy on people and oxen.', 'Dawn to dusk, with short breaks. Faster, but tiring.', 'Push until you drop. Fastest, and it wears everyone down.']
export const RATION_INFO = ['Full meals, 2 lbs per person each day.', 'Smaller meals, 1.5 lbs per person each day.', 'Barely enough, 1 lb per person each day.']

export function rand(a: number, b: number) { return a + Math.random() * (b - a) }
export function irand(a: number, b: number) { return Math.floor(rand(a, b + 1)) }
export function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
export function chance(p: number) { return Math.random() < p }
export function randomIllness() { return pick(ILLNESSES) }
