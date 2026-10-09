import type { Bar, Check, Side, Signal, Strategy, SymbolId, Timeframe } from '../types'
import { atr } from './indicators'
import { evaluateRule, type RuleContext } from './rules'
import { inSessions, TF_SECONDS } from './timeframes'

export interface SideScore {
  side: Side
  score: number
  total: number
  /** Tỉ lệ điểm 0..1 (0 nếu trượt một điều kiện bắt buộc) */
  ratio: number
  /** Trượt điều kiện bắt buộc */
  blocked: boolean
  checks: Check[]
}

/** Các khung thời gian chiến lược cần (khung chính + khung của từng điều kiện) */
export function requiredTimeframes(strategy: Strategy): Timeframe[] {
  return [...new Set([strategy.timeframe, ...strategy.rules.map((r) => r.tf ?? strategy.timeframe)])]
}

/** Chấm điểm cả hai chiều cho nến cuối của khung chính */
export function scoreStrategy(strategy: Strategy, ctx: RuleContext): SideScore[] {
  const results = strategy.rules.map((rule) => evaluateRule(rule, ctx))
  const sides = strategy.sides ?? ['long', 'short']
  return sides.map((side) => {
    const checks = results.map((r) => r[side])
    const total = checks.reduce((sum, c) => sum + c.weight, 0)
    const score = checks.reduce((sum, c) => sum + (c.pass ? c.weight : 0), 0)
    const blocked = checks.some((c) => c.required && !c.pass)
    return { side, score, total, ratio: blocked || total === 0 ? 0 : score / total, blocked, checks }
  })
}

const round = (v: number, precision: number) => Number(v.toFixed(precision))

/** Entry = giá đóng cửa nến tín hiệu; SL theo ATR hoặc đỉnh/đáy gần nhất; TP theo bội số rủi ro */
export function riskLevels(strategy: Strategy, bars: Bar[], side: Side, precision: number) {
  const i = bars.length - 1
  const entry = bars[i].close
  const dir = side === 'long' ? 1 : -1
  const sl = strategy.risk.sl
  const range = atr(bars, sl.type === 'atr' ? sl.period : 14)[i]
  let stop: number
  if (sl.type === 'atr') stop = entry - dir * sl.mult * range
  else {
    const window = bars.slice(Math.max(0, i - sl.lookback + 1), i + 1)
    const extreme = side === 'long' ? Math.min(...window.map((b) => b.low)) : Math.max(...window.map((b) => b.high))
    stop = extreme - dir * sl.bufferAtr * range
  }
  // Đỉnh/đáy nằm sai phía (vd. nến tín hiệu là đáy) -> dùng tối thiểu 1 ATR
  if (!(dir * (entry - stop) > 0)) stop = entry - dir * range
  const risk = Math.abs(entry - stop)
  return {
    entry: round(entry, precision),
    sl: round(stop, precision),
    tp: strategy.risk.rr.map((r) => round(entry + dir * r * risk, precision)),
  }
}

/**
 * Tín hiệu của chiến lược tại nến đã đóng cuối cùng của khung chính, hoặc null nếu chưa đạt ngưỡng "theo dõi".
 * `ctx.bars` chỉ được chứa nến đã đóng (tránh nhìn trước tương lai khi backtest).
 */
export function evaluateStrategy(
  strategy: Strategy,
  symbol: SymbolId,
  bars: Partial<Record<Timeframe, Bar[]>>,
  precision: number,
  source = '',
): Signal | null {
  const main = bars[strategy.timeframe] ?? []
  const last = main.at(-1)
  if (!last || main.length < 30) return null
  if (!inSessions(last.time + TF_SECONDS[strategy.timeframe], strategy.sessions)) return null

  const scores = scoreStrategy(strategy, { symbol, timeframe: strategy.timeframe, bars, precision })
  const best = [...scores].sort((a, b) => b.ratio - a.ratio)[0]
  const other = scores.find((s) => s !== best)
  // Hai chiều cùng điểm: không rõ hướng -> không báo
  if (!best || best.ratio <= 0 || (other && other.ratio === best.ratio)) return null
  const level = best.ratio >= strategy.alert.entryAt ? 'entry' : best.ratio >= strategy.alert.watchAt ? 'watch' : null
  if (!level) return null

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    symbol,
    timeframe: strategy.timeframe,
    side: best.side,
    level,
    score: best.score,
    total: best.total,
    barTime: last.time,
    ...riskLevels(strategy, main, best.side, precision),
    checks: best.checks,
    source,
  }
}
