import type { D1Like } from './env'
import type { Side, Signal, SignalLevel } from './types'

export interface AlertRow {
  id?: number
  strategy: string
  symbol: string
  timeframe: string
  side: Side
  level: SignalLevel
  score: number
  total: number
  bar_time: number
  entry: number
  sl: number
  tp: number[]
  checks: Signal['checks']
  source: string
  channels: string[]
  created_at: number
}

/** Lưu trạng thái (nến đã xét, cảnh báo đã gửi) — D1 khi chạy thật, bộ nhớ khi test */
export interface Store {
  getState(key: string): Promise<string | null>
  setState(key: string, value: string, now: number): Promise<void>
  lastAlert(strategy: string, symbol: string, side: Side): Promise<AlertRow | null>
  saveAlert(signal: Signal, channels: string[], now: number): Promise<void>
  recentAlerts(limit: number): Promise<AlertRow[]>
}

const toRow = (signal: Signal, channels: string[], now: number): AlertRow => ({
  strategy: signal.strategyId,
  symbol: signal.symbol,
  timeframe: signal.timeframe,
  side: signal.side,
  level: signal.level,
  score: signal.score,
  total: signal.total,
  bar_time: signal.barTime,
  entry: signal.entry,
  sl: signal.sl,
  tp: signal.tp,
  checks: signal.checks,
  source: signal.source,
  channels,
  created_at: now,
})

export class MemoryStore implements Store {
  state = new Map<string, string>()
  alerts: AlertRow[] = []

  async getState(key: string) {
    return this.state.get(key) ?? null
  }
  async setState(key: string, value: string) {
    this.state.set(key, value)
  }
  async lastAlert(strategy: string, symbol: string, side: Side) {
    return (
      [...this.alerts].reverse().find((a) => a.strategy === strategy && a.symbol === symbol && a.side === side) ?? null
    )
  }
  async saveAlert(signal: Signal, channels: string[], now: number) {
    this.alerts.push({ ...toRow(signal, channels, now), id: this.alerts.length + 1 })
  }
  async recentAlerts(limit: number) {
    return [...this.alerts].reverse().slice(0, limit)
  }
}

type RawAlert = Omit<AlertRow, 'tp' | 'checks' | 'channels'> & { tp: string; checks: string; channels: string }
const parseRow = (r: RawAlert): AlertRow => ({
  ...r,
  tp: JSON.parse(r.tp),
  checks: JSON.parse(r.checks),
  channels: JSON.parse(r.channels),
})

export class D1Store implements Store {
  private db: D1Like
  constructor(db: D1Like) {
    this.db = db
  }

  async getState(key: string) {
    const row = await this.db.prepare('SELECT value FROM state WHERE key = ?').bind(key).first<{ value: string }>()
    return row?.value ?? null
  }
  async setState(key: string, value: string, now: number) {
    await this.db
      .prepare(
        'INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      )
      .bind(key, value, now)
      .run()
  }
  async lastAlert(strategy: string, symbol: string, side: Side) {
    const row = await this.db
      .prepare('SELECT * FROM alerts WHERE strategy = ? AND symbol = ? AND side = ? ORDER BY created_at DESC LIMIT 1')
      .bind(strategy, symbol, side)
      .first<RawAlert>()
    return row ? parseRow(row) : null
  }
  async saveAlert(signal: Signal, channels: string[], now: number) {
    const r = toRow(signal, channels, now)
    await this.db
      .prepare(
        `INSERT INTO alerts (strategy, symbol, timeframe, side, level, score, total, bar_time, entry, sl, tp, checks, source, channels, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        r.strategy,
        r.symbol,
        r.timeframe,
        r.side,
        r.level,
        r.score,
        r.total,
        r.bar_time,
        r.entry,
        r.sl,
        JSON.stringify(r.tp),
        JSON.stringify(r.checks),
        r.source,
        JSON.stringify(r.channels),
        r.created_at,
      )
      .run()
  }
  async recentAlerts(limit: number) {
    const { results } = await this.db
      .prepare('SELECT * FROM alerts ORDER BY created_at DESC LIMIT ?')
      .bind(limit)
      .all<RawAlert>()
    return results.map(parseRow)
  }
}
