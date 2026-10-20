import { ILLNESSES, ITEM_INFO, Item, ITEMS, LANDMARKS, OCCUPATIONS, River } from './data'
import { GameState, Member, Weather, avgHealth, chance, dateParts, irand, living, milesToNext, nextLandmark, pick, rand, region, healthLabel } from './state'

export interface Msg { title: string; text: string; tone?: 'good' | 'bad' | 'info' }

const BASE_TEMP = [25, 30, 42, 55, 65, 75, 82, 80, 70, 57, 42, 30]
const REGION_TEMP: Record<string, number> = { prairie: 0, plains: -3, rockies: -14, snake: 3, cascades: -8 }
const PRECIP = [0.18, 0.2, 0.28, 0.32, 0.3, 0.22, 0.14, 0.12, 0.15, 0.2, 0.22, 0.2]

export function genWeather(s: GameState): Weather {
  const m = dateParts(s.day).month
  const reg = region(s)
  const temp = Math.round(BASE_TEMP[m] + (REGION_TEMP[reg] || 0) + rand(-12, 12))
  let precip: Weather['precip'] = 'none'
  const pc = PRECIP[m] * (reg === 'snake' ? 0.5 : 1)
  if (chance(pc)) {
    const heavy = chance(0.3)
    precip = temp <= 32 ? (heavy ? 'heavy snow' : 'snow') : heavy ? 'heavy rain' : 'rain'
  }
  const label = temp >= 92 ? 'very hot' : temp >= 80 ? 'hot' : temp >= 60 ? 'warm' : temp >= 42 ? 'cool' : temp >= 20 ? 'cold' : 'very cold'
  return { temp, label, precip }
}

export function weatherText(w: Weather) { return w.precip === 'none' ? w.label : `${w.label}, ${w.precip}` }

export function isMountain(s: GameState) {
  const m = s.miles
  const next = nextLandmark(s)
  if (s.forks.end === 'barlow' && next && next.id === 'willamette') return true
  return (m > 900 && m < 1250) || (next != null && (next.id === 'blue_mountains' || (s.route[s.legIndex - 1] && s.route[s.legIndex - 1][0] === 'blue_mountains')))
}

export function milesPerDay(s: GameState) {
  const oxen = s.supplies.oxen
  if (oxen <= 0) return 0
  let mpd = [18, 23, 28][s.pace]
  mpd *= Math.min(1, 0.45 + oxen * 0.09)
  mpd *= 0.75 + 0.25 * (s.oxenHealth / 100)
  mpd *= isMountain(s) ? 0.72 : region(s) === 'prairie' ? 1 : 0.92
  const p = s.weather.precip
  if (p === 'heavy snow') mpd *= 0.4
  else if (p === 'snow') mpd *= 0.7
  else if (p === 'heavy rain') mpd *= 0.8
  if (s.weather.temp >= 92) mpd *= 0.9
  if (avgHealth(s) < 30) mpd *= 0.75
  return mpd
}

function bodyStress(s: GameState, m: Member, resting: boolean, fedOk: boolean) {
  let d = 0
  if (resting) d += 3.2
  else d += [-0.3, -1.2, -2.5][s.pace]
  if (fedOk) d += [0.8, -0.5, -1.8][s.rations]
  else d -= 5
  const w = s.weather
  if (w.temp >= 92) d -= 1
  if (w.temp < 35) d -= s.supplies.clothing >= living(s).length * 2 ? 0.3 : s.supplies.clothing >= living(s).length ? 1.2 : 2.4
  if (w.precip === 'heavy snow' || w.precip === 'snow') d -= 0.6
  if (w.precip === 'heavy rain') d -= 0.3
  if (m.illness) { const ill = ILLNESSES.find((i) => i.name === m.illness); d -= ill ? ill.drain : 3 }
  if (m.injury) d -= 1.5
  if (!m.illness && !m.injury && fedOk && s.rations === 0 && !resting && s.pace === 0) d += 0.5
  return d
}

export function dayTick(s: GameState, mode: 'travel' | 'rest' | 'wait' | 'hunt'): { msgs: Msg[]; arrived: boolean } {
  const msgs: Msg[] = []
  s.day++
  s.weather = genWeather(s)
  if (s.weather.precip.indexOf('rain') >= 0 || s.weather.precip.indexOf('snow') >= 0) s.wetness = Math.min(2, s.wetness + (s.weather.precip.indexOf('heavy') >= 0 ? 0.35 : 0.15))
  else s.wetness = Math.max(0, s.wetness - 0.04)
  let arrived = false
  const resting = mode === 'rest' || mode === 'wait'

  // Travel
  if (mode === 'travel') {
    if (s.broken) { msgs.push({ title: 'Wagon broken', text: `Your wagon can't move with a broken ${ITEM_INFO[s.broken].label.toLowerCase().replace('wagon ', '').replace(/s$/, '')}. Repair it, or trade for a spare.`, tone: 'bad' }); s.stuckDays++ }
    else if (s.supplies.oxen <= 0) { msgs.push({ title: 'No oxen', text: 'You have no oxen left to pull the wagon. You must trade for some or wait for help.', tone: 'bad' }); s.stuckDays++ }
    else {
      s.stuckDays = 0
      const mpd = milesPerDay(s)
      const left = milesToNext(s)
      const go = Math.min(left, Math.round(mpd))
      s.miles += go
      s.daysTraveled++
      if (milesToNext(s) <= 0) arrived = true
    }
  }

  // Food
  const alive = living(s)
  const need = [2, 1.5, 1][s.rations] * alive.length
  const fedOk = s.supplies.food >= need * 0.5
  s.supplies.food = Math.max(0, Math.round(s.supplies.food - need))
  if (!fedOk) msgs.push({ title: 'No food', text: 'Your party has run out of food and is starving.', tone: 'bad' })

  // Oxen condition
  const m = dateParts(s.day).month
  let ox = 0
  if (mode === 'travel') ox += [0.15, -0.4, -1.0][s.pace]
  else if (resting) ox += 2
  if (region(s) === 'snake' && (m >= 6 && m <= 8)) ox -= 0.6
  if (s.weather.temp >= 92) ox -= 0.4
  if (s.occupation === 'farmer') ox += 0.35
  s.oxenHealth = Math.max(0, Math.min(100, s.oxenHealth + ox))
  if (s.supplies.oxen > 0 && s.oxenHealth < 25 && chance(0.06)) { s.supplies.oxen--; s.oxenHealth += 15; msgs.push({ title: 'An ox has died', text: `One of your oxen collapsed in its traces and died. ${s.supplies.oxen} left.`, tone: 'bad' }) }

  // People
  for (const mem of alive) {
    mem.health = Math.max(0, Math.min(100, mem.health + bodyStress(s, mem, resting, fedOk)))
    if (mem.illness) {
      mem.illnessDays -= resting ? 2 : 1
      if (mem.illnessDays <= 0) { msgs.push({ title: 'Recovered', text: `${mem.name} has recovered from ${mem.illness}.`, tone: 'good' }); mem.illness = null }
    } else {
      let p = 0.0025 + (100 - mem.health) * 0.00022 + (s.pace === 2 ? 0.003 : 0) + (s.rations === 2 ? 0.003 : 0) + (s.weather.temp < 32 && s.supplies.clothing < alive.length * 2 ? 0.004 : 0)
      if (resting) p *= 0.5
      if (chance(p)) {
        const ill = pick(ILLNESSES)
        mem.illness = ill.name; mem.illnessDays = irand(ill.days[0], ill.days[1])
        msgs.push({ title: 'Illness', text: `${mem.name} has ${ill.name}.`, tone: 'bad' })
      }
    }
    if (mem.injury) { mem.injuryDays -= resting ? 2 : 1; if (mem.injuryDays <= 0) { msgs.push({ title: 'Healed', text: `${mem.name}'s ${mem.injury} has healed.`, tone: 'good' }); mem.injury = null } }
    let dies = mem.health <= 0
    if (!dies && (mem.illness || mem.injury) && mem.health < 22 && chance(0.05)) dies = true
    if (dies) {
      mem.alive = false; mem.health = 0
      mem.cause = mem.illness ? mem.illness : mem.injury ? `a ${mem.injury}` : !fedOk ? 'starvation' : s.weather.temp < 32 ? 'exposure' : 'exhaustion'
      msgs.push({ title: 'A death in the party', text: `${mem.name} has died of ${mem.cause}.`, tone: 'bad' })
    }
  }
  if (living(s).length === 0) { s.over = true; s.overReason = 'Everyone in your party has died.' }
  if (s.stuckDays >= 20) { s.over = true; s.overReason = 'Stranded on the trail for weeks, your party could go no farther.' }

  // Random events
  if (!s.over && !arrived && mode === 'travel' && !s.broken && chance(0.11)) { const e = randomEvent(s); if (e) msgs.push(e) }
  else if (!s.over && mode !== 'travel' && chance(0.03)) { const e = randomEvent(s, true); if (e) msgs.push(e) }
  return { msgs, arrived }
}

type EventFn = (s: GameState) => Msg | null
interface EventDef { w: (s: GameState) => number; run: EventFn }

function anyone(s: GameState) { return pick(living(s)) }
function lose(s: GameState, item: Item, frac: number) { const n = Math.floor(s.supplies[item] * frac); s.supplies[item] -= n; return n }

const EVENTS: EventDef[] = [
  { w: () => 6, run: (s) => {
    const part = pick(['wheels', 'axles', 'tongues'] as Item[])
    const nm = part === 'wheels' ? 'wheel' : part === 'axles' ? 'axle' : 'tongue'
    if (s.supplies[part] > 0) { s.supplies[part]--; s.delay += 1; s.delayReason = 'repairs'; return { title: 'Broken wagon ' + nm, text: `A wagon ${nm} broke. You replace it with your spare. It costs you a day.`, tone: 'bad' } }
    const pRepair = s.occupation === 'carpenter' ? 0.65 : 0.35
    if (chance(pRepair)) { s.delay += 1; s.delayReason = 'repairs'; return { title: 'Broken wagon ' + nm, text: `A wagon ${nm} broke, but you managed to repair it. You lose a day.`, tone: 'bad' } }
    s.broken = part as GameState['broken']
    return { title: 'Broken wagon ' + nm, text: `A wagon ${nm} broke and can't be fixed on the spot. You need a spare. Try repairing it again from the camp menu, or trade for one.`, tone: 'bad' }
  } },
  { w: (s) => (s.supplies.oxen > 0 ? 3 : 0), run: (s) => { s.oxenHealth = Math.max(0, s.oxenHealth - 25); return { title: 'Ox injured', text: 'One of the oxen went lame on the rocky ground. The team is slower now.', tone: 'bad' } } },
  { w: (s) => (s.supplies.oxen > 1 ? 1.5 : 0), run: (s) => { s.supplies.oxen--; return { title: 'Ox lost', text: `An ox wandered off in the night and couldn't be found. ${s.supplies.oxen} oxen left.`, tone: 'bad' } } },
  { w: () => 2.5, run: (s) => {
    const item = pick(['food', 'clothing', 'bullets'] as Item[])
    const n = lose(s, item, rand(0.1, 0.3))
    if (n <= 0) return null
    return { title: 'Thief in the night', text: `A thief crept into camp and stole ${n} ${ITEM_INFO[item].unit} of ${ITEM_INFO[item].label.toLowerCase()}.`, tone: 'bad' }
  } },
  { w: () => 3, run: (s) => { const d = irand(1, 4); s.delay += d; s.delayReason = 'lost'; return { title: 'Lost the trail', text: `The ruts vanished in a sea of grass. You lose ${d} day${d > 1 ? 's' : ''} finding the way.`, tone: 'bad' } } },
  { w: () => 1.5, run: (s) => { const d = irand(1, 3); s.delay += d; s.delayReason = 'wrong trail'; return { title: 'Wrong trail', text: `You followed a cattle path for miles before realizing your mistake. You lose ${d} day${d > 1 ? 's' : ''}.`, tone: 'bad' } } },
  { w: () => 2, run: (s) => { s.delay += 1; s.delayReason = 'fog'; return { title: 'Heavy fog', text: 'Fog so thick you can\'t see the lead oxen. You wait it out and lose a day.', tone: 'info' } } },
  { w: (s) => (s.weather.temp > 40 ? 2.5 : 0), run: (s) => { s.delay += 1; s.delayReason = 'storm'; const n = lose(s, 'food', rand(0.02, 0.08)); return { title: 'Hailstorm', text: `A violent hailstorm batters the wagon. You shelter for a day${n > 0 ? ` and ${n} lbs of food is ruined` : ''}.`, tone: 'bad' } } },
  { w: (s) => (s.weather.temp <= 30 ? 5 : 0), run: (s) => { const d = irand(1, 3); s.delay += d; s.delayReason = 'blizzard'; return { title: 'Blizzard', text: `A blizzard howls across the trail. You huddle in the wagon for ${d} day${d > 1 ? 's' : ''}.`, tone: 'bad' } } },
  { w: (s) => { const m = dateParts(s.day).month; return m >= 4 && m <= 8 ? 3 : 0 }, run: (s) => { const n = irand(15, 50); s.supplies.food += n; return { title: 'Wild fruit', text: `You find bushes heavy with wild berries and gather ${n} lbs of food.`, tone: 'good' } } },
  { w: () => 2, run: (s) => {
    const item = pick(['food', 'clothing', 'bullets', 'wheels', 'axles', 'tongues'] as Item[])
    const n = item === 'food' ? irand(20, 80) : item === 'bullets' ? irand(10, 40) : item === 'clothing' ? irand(1, 3) : 1
    s.supplies[item] += n
    return { title: 'Abandoned wagon', text: `You find an abandoned wagon beside the trail. Inside: ${n} ${n === 1 && ITEM_INFO[item].unit === 'spare' ? '' : ITEM_INFO[item].unit + ' of '}${ITEM_INFO[item].label.toLowerCase()}.`.replace('  ', ' '), tone: 'good' }
  } },
  { w: () => 2.5, run: (s) => { for (const m of living(s)) m.health = Math.max(1, m.health - 8); return { title: 'Bad water', text: 'The only water for miles is brackish and foul. Everyone feels sick.', tone: 'bad' } } },
  { w: (s) => { const m = dateParts(s.day).month; return m >= 6 && m <= 9 ? 3 : 0.5 }, run: (s) => { s.oxenHealth = Math.max(0, s.oxenHealth - 15); return { title: 'Poor grass', text: 'The grass here is grazed to the dirt. Your oxen go hungry.', tone: 'bad' } } },
  { w: (s) => (s.weather.temp > 60 ? 2 : 0), run: (s) => { const m = anyone(s); m.health = Math.max(1, m.health - 22); m.injury = 'snakebite'; m.injuryDays = irand(4, 8); return { title: 'Snakebite', text: `${m.name} was bitten by a rattlesnake.`, tone: 'bad' } } },
  { w: () => 1.6, run: (s) => { const m = anyone(s); const part = pick(['arm', 'leg']); m.health = Math.max(1, m.health - 18); m.injury = `broken ${part}`; m.injuryDays = irand(8, 14); return { title: 'Accident', text: `${m.name} fell from the wagon and has a broken ${part}.`, tone: 'bad' } } },
  { w: () => 0.8, run: (s) => { const f = lose(s, 'food', rand(0.1, 0.25)); const c = lose(s, 'clothing', rand(0.1, 0.3)); return { title: 'Fire in the wagon', text: `A lantern tipped over and started a fire. You lose ${f} lbs of food and ${c} sets of clothing.`, tone: 'bad' } } },
  { w: (s) => (living(s).length > 1 ? 1 : 0), run: (s) => { const m = anyone(s); const d = irand(1, 3); s.delay += d; s.delayReason = 'search'; return { title: 'Lost party member', text: `${m.name} wandered off gathering firewood. You spend ${d} day${d > 1 ? 's' : ''} searching before finding them, cold but safe.`, tone: 'bad' } } },
  { w: () => 1.5, run: (s) => { const n = irand(20, 60); s.supplies.food += n; return { title: 'Kind travelers', text: `A family camped nearby shares their supper and sends you off with ${n} lbs of food.`, tone: 'good' } } },
  { w: (s) => (s.miles > 300 ? 1.2 : 0), run: (s) => { const n = irand(25, 70); s.supplies.food += n; return { title: 'A helpful guide', text: `A local guide shows you where to find roots and game. You gather ${n} lbs of food.`, tone: 'good' } } },
  { w: (s) => (region(s) === 'plains' ? 1.5 : 0), run: (s) => { s.delay += 1; s.delayReason = 'buffalo'; return { title: 'Buffalo herd', text: 'A herd of buffalo miles long crosses the trail. You wait a full day for it to pass.', tone: 'info' } } },
]

export function randomEvent(s: GameState, camp = false): Msg | null {
  const pool = EVENTS.filter((_, i) => !camp || i === 3 || i === 9 || i === 17 || i === 16).map((e) => ({ e, w: e.w(s) })).filter((x) => x.w > 0)
  const total = pool.reduce((a, x) => a + x.w, 0)
  let r = Math.random() * total
  for (const x of pool) { r -= x.w; if (r <= 0) return x.e.run(s) }
  return null
}

export function tryRepair(s: GameState): Msg {
  if (!s.broken) return { title: 'Repair', text: 'Nothing needs repair.' }
  const nm = s.broken === 'wheels' ? 'wheel' : s.broken === 'axles' ? 'axle' : 'tongue'
  if (s.supplies[s.broken] > 0) { s.supplies[s.broken]--; s.broken = null; return { title: 'Repaired', text: `You fit the spare ${nm}. The wagon is ready to roll.`, tone: 'good' } }
  if (chance(s.occupation === 'carpenter' ? 0.45 : 0.25)) { s.broken = null; return { title: 'Repaired', text: `After a long day of work, you patch the ${nm} well enough to travel.`, tone: 'good' } }
  return { title: 'Repair failed', text: `You work all day but can't fix the ${nm}. Keep trying, or trade for a spare.`, tone: 'bad' }
}

// River crossing --------------------------------------------------------
export function riverNow(r: River, s: GameState) {
  const m = dateParts(s.day).month
  const seasonal = m <= 5 ? 1.12 : m >= 7 ? 0.82 : 1
  const depth = Math.max(0.8, r.depth * seasonal * (0.75 + s.wetness * 0.25) + rand(-0.2, 0.2))
  return { width: Math.round(r.width * (0.9 + s.wetness * 0.08)), depth: Math.round(depth * 10) / 10 }
}

export type CrossMethod = 'ford' | 'float' | 'ferry' | 'guide'
export function crossRiver(s: GameState, method: CrossMethod, depth: number, r: River): { ok: boolean; msgs: Msg[]; anim: 'ok' | 'tip' | 'stuck' } {
  const msgs: Msg[] = []
  let pTip = 0
  if (method === 'ford') pTip = depth < 2.5 ? 0.02 : depth < 3 ? 0.25 : depth < 4 ? 0.6 : 0.85
  else if (method === 'float') pTip = depth < 1.6 ? 0.25 : 0.12 + r.current * 0.12
  else if (method === 'ferry') pTip = 0.03
  else pTip = 0.04
  if (method === 'ford' && depth >= 2.5 && depth < 3 && !chance(0.4)) {
    const f = lose(s, 'food', rand(0.05, 0.12)); const c = lose(s, 'clothing', rand(0, 0.15))
    s.delay += 1; s.delayReason = 'drying'
    msgs.push({ title: 'Wet supplies', text: `Water poured into the wagon bed. ${f} lbs of food${c ? ` and ${c} sets of clothing` : ''} were ruined, and you lose a day drying out.`, tone: 'bad' })
    return { ok: true, msgs, anim: 'ok' }
  }
  if (method === 'float' && depth < 1.6 && chance(0.5)) { s.delay += 1; s.delayReason = 'stuck'; msgs.push({ title: 'Stuck in the mud', text: 'The river was too shallow to float. The wagon bogged down and it took a day to drag it out.', tone: 'bad' }); return { ok: true, msgs, anim: 'stuck' } }
  if (chance(pTip)) {
    const parts: string[] = []
    for (const it of ITEMS) {
      if (it === 'oxen') continue
      const n = lose(s, it, rand(0.15, 0.5))
      if (n > 0) parts.push(`${n} ${it === 'food' ? 'lbs of food' : it === 'bullets' ? 'bullets' : it === 'clothing' ? 'sets of clothing' : ITEM_INFO[it].label.toLowerCase()}`)
    }
    if (s.supplies.oxen > 0 && chance(0.35)) { s.supplies.oxen--; parts.push('1 ox') }
    msgs.push({ title: 'The wagon tipped over!', text: `The current rolled your wagon. You lost: ${parts.length ? parts.join(', ') : 'nothing of value, by luck'}.`, tone: 'bad' })
    if (chance(method === 'ford' ? 0.35 : 0.25)) {
      const v = anyone(s)
      if (v) { v.alive = false; v.health = 0; v.cause = 'drowning'; msgs.push({ title: 'Drowned', text: `${v.name} was swept away and drowned.`, tone: 'bad' }) }
      if (living(s).length === 0) { s.over = true; s.overReason = 'No one survived the river.' }
    }
    return { ok: true, msgs, anim: 'tip' }
  }
  msgs.push({ title: 'Safe crossing', text: method === 'ferry' ? 'The ferry carries you across without trouble.' : method === 'guide' ? 'The guide leads your wagon from island to island, and you reach the far bank safely.' : 'You make it across the river safely.', tone: 'good' })
  return { ok: true, msgs, anim: 'ok' }
}

// Prices ----------------------------------------------------------------
export function priceMult(s: GameState) {
  const forts = s.route.slice(0, s.legIndex).filter(([id]) => LANDMARKS[id].kind === 'fort').length
  return s.legIndex <= 1 ? 1 : 1 + forts * 0.25
}

// Trading ---------------------------------------------------------------
export interface Offer { give: Item; giveN: number; get: Item; getN: number; text: string }
export function makeOffer(s: GameState): Offer | null {
  const wants: Item[] = ['oxen', 'food', 'clothing', 'bullets', 'wheels', 'axles', 'tongues']
  for (let tries = 0; tries < 20; tries++) {
    let get = pick(wants)
    if (s.broken && chance(0.5)) get = s.broken
    const give = pick(wants.filter((w) => w !== get))
    const qty: Record<Item, () => number> = { oxen: () => 1, food: () => irand(4, 15) * 10, clothing: () => irand(1, 4), bullets: () => irand(2, 8) * 10, wheels: () => 1, axles: () => 1, tongues: () => 1 }
    const giveN = qty[give](); const getN = qty[get]()
    if (s.supplies[give] < giveN) continue
    const names = ['A trapper', 'A family from Kentucky', 'A returning settler', 'A Shoshone trader', 'A soldier on leave', 'A widow heading west', 'Two brothers from Iowa']
    return { give, giveN, get, getN, text: `${pick(names)} offers ${fmtQty(get, getN)} in exchange for ${fmtQty(give, giveN)}.` }
  }
  return null
}
export function fmtQty(it: Item, n: number) {
  switch (it) {
    case 'oxen': return `${n} ox${n === 1 ? '' : 'en'}`
    case 'food': return `${n} lbs of food`
    case 'clothing': return `${n} set${n === 1 ? '' : 's'} of clothing`
    case 'bullets': return `${n} bullets`
    case 'wheels': return `${n} wagon wheel${n === 1 ? '' : 's'}`
    case 'axles': return `${n} wagon axle${n === 1 ? '' : 's'}`
    case 'tongues': return `${n} wagon tongue${n === 1 ? '' : 's'}`
  }
}

// Score -----------------------------------------------------------------
export function scoreBreakdown(s: GameState) {
  const occ = OCCUPATIONS.find((o) => o.id === s.occupation)!
  const rows: [string, number][] = []
  for (const m of living(s)) { const lbl = healthLabel(m.health); rows.push([`${m.name} (${lbl})`, lbl === 'good' ? 500 : lbl === 'fair' ? 400 : lbl === 'poor' ? 300 : 200]) }
  rows.push(['Wagon', 50])
  rows.push([`${s.supplies.oxen} oxen`, s.supplies.oxen * 4])
  const spares = s.supplies.wheels + s.supplies.axles + s.supplies.tongues
  rows.push([`${spares} spare parts`, spares * 2])
  rows.push([`${s.supplies.clothing} sets of clothing`, s.supplies.clothing * 2])
  rows.push([`${s.supplies.bullets} bullets`, Math.floor(s.supplies.bullets / 50)])
  rows.push([`${s.supplies.food} lbs of food`, Math.floor(s.supplies.food / 25)])
  rows.push([`$${Math.floor(s.money)} cash`, Math.floor(s.money / 5)])
  const base = rows.reduce((a, r) => a + r[1], 0)
  return { rows, base, mult: occ.mult, total: base * occ.mult }
}
