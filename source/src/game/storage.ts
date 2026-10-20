import type { GameState } from './state'

export interface Options { reverseDial: boolean; speed: 0 | 1 | 2 }
export interface ScoreRow { name: string; score: number; occupation: string; date: string; survivors: number }

function get<T>(k: string, def: T): T {
  try { const v = window.localStorage.getItem(k); return v ? (JSON.parse(v) as T) : def } catch { return def }
}
function set(k: string, v: unknown) { try { window.localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage unavailable */ } }
function del(k: string) { try { window.localStorage.removeItem(k) } catch { /* */ } }

export const store = {
  loadGame: (): GameState | null => { const g = get<GameState | null>('westward_save', null); return g && g.v === 1 && !g.over && !g.arrived ? g : null },
  saveGame: (s: GameState) => set('westward_save', s),
  clearGame: () => del('westward_save'),
  options: (): Options => ({ reverseDial: false, speed: 1, ...get<Partial<Options>>('westward_opts', {}) }),
  saveOptions: (o: Options) => set('westward_opts', o),
  scores: (): ScoreRow[] => get<ScoreRow[]>('westward_scores', defaultScores()),
  addScore: (r: ScoreRow) => { const s = store.scores(); s.push(r); s.sort((a, b) => b.score - a.score); set('westward_scores', s.slice(0, 10)); return s.slice(0, 10).indexOf(r) },
  resetScores: () => del('westward_scores'),
}

function defaultScores(): ScoreRow[] {
  const names = ['Hattie Bell', 'Joel Pruitt', 'Mae Carrow', 'Otis Fenn', 'Dora Kim', 'Lem Taggart', 'Iva Rusk', 'Cy Brandt', 'Nan Ollie', 'Bo Whitcomb']
  return names.map((name, i) => ({ name, score: 6000 - i * 550, occupation: ['farmer', 'carpenter', 'banker'][i % 3], date: '1847', survivors: 5 - (i % 3) }))
}
