import { evaluateStrategy, requiredTimeframes } from './engine/evaluate'
import { TF_SECONDS } from './engine/timeframes'
import type { Bar, Signal, SignalLevel, Strategy, SymbolId, Timeframe } from './types'

/**
 * Backtest: chạy chiến lược trên lịch sử bằng đúng bộ chấm điểm của Worker, mỗi bước chỉ thấy nến đã đóng
 * (khung lớn hơn cũng chỉ lấy nến đóng trước thời điểm xét), áp cooldown như khi chạy thật.
 * Kết quả mỗi lệnh: chạm SL trước (−1R, nếu cùng nến với TP thì tính SL — thận trọng) hoặc chạm TP1 (+rr[0]R);
 * hết `maxHoldBars` mà chưa chạm thì tính theo giá đóng cửa.
 */

export interface Trade {
  signal: Signal
  outcome: 'tp' | 'sl' | 'open'
  /** Lời / lỗ theo bội số rủi ro (R) */
  r: number
  /** Đạt TP cuối (vd. 3R) trước khi chạm SL */
  hitFinalTp: boolean
  /** Thời điểm đóng lệnh (giây) */
  exitTime: number
}

export interface BacktestResult {
  trades: Trade[]
  stats: {
    signals: number
    wins: number
    losses: number
    open: number
    winRate: number
    avgR: number
    totalR: number
    finalTpRate: number
    maxLosingStreak: number
  }
}

export interface BacktestOptions {
  /** Số nến dùng cho mỗi lần chấm (như Worker) */
  window?: number
  /** Giữ lệnh tối đa bao nhiêu nến */
  maxHoldBars?: number
  /** Mức tín hiệu được tính là lệnh (mặc định chỉ "entry") */
  levels?: SignalLevel[]
  precision?: number
}

/** Chỉ số nến cuối cùng đã đóng tại `time` (mảng tăng dần theo time), -1 nếu chưa có */
function lastClosedIndex(bars: Bar[], tf: Timeframe, time: number): number {
  let lo = 0
  let hi = bars.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (bars[mid].time + TF_SECONDS[tf] <= time) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

function simulate(signal: Signal, future: Bar[], maxHold: number): Omit<Trade, 'signal'> {
  const dir = signal.side === 'long' ? 1 : -1
  const risk = Math.abs(signal.entry - signal.sl)
  const tp1 = signal.tp[0]
  const finalTp = signal.tp.at(-1)!
  let hitFinalTp = false
  for (const b of future.slice(0, maxHold)) {
    const hitSl = dir === 1 ? b.low <= signal.sl : b.high >= signal.sl
    const hitTp = dir === 1 ? b.high >= tp1 : b.low <= tp1
    if (hitSl) return { outcome: 'sl', r: -1, hitFinalTp, exitTime: b.time }
    if (dir === 1 ? b.high >= finalTp : b.low <= finalTp) hitFinalTp = true
    if (hitTp) {
      // Sau TP1 vẫn theo dõi xem có chạm TP cuối trước SL không (thống kê thêm)
      for (const n of future.slice(future.indexOf(b) + 1, maxHold)) {
        if (hitFinalTp) break
        if (dir === 1 ? n.low <= signal.sl : n.high >= signal.sl) break
        if (dir === 1 ? n.high >= finalTp : n.low <= finalTp) hitFinalTp = true
      }
      return { outcome: 'tp', r: Math.abs(tp1 - signal.entry) / risk, hitFinalTp, exitTime: b.time }
    }
  }
  const last = future[Math.min(maxHold, future.length) - 1]
  return {
    outcome: 'open',
    r: last ? ((last.close - signal.entry) * dir) / risk : 0,
    hitFinalTp,
    exitTime: last?.time ?? signal.barTime,
  }
}

export function backtest(
  strategy: Strategy,
  symbol: SymbolId,
  history: Partial<Record<Timeframe, Bar[]>>,
  options: BacktestOptions = {},
): BacktestResult {
  const window = options.window ?? 300
  const maxHold = options.maxHoldBars ?? 100
  const levels = options.levels ?? ['entry']
  const tf = strategy.timeframe
  const main = history[tf] ?? []
  const frames = requiredTimeframes(strategy)
  const trades: Trade[] = []
  const lastAt: Record<string, number> = {}

  for (let i = 50; i < main.length - 1; i++) {
    const close = main[i].time + TF_SECONDS[tf]
    const bars: Partial<Record<Timeframe, Bar[]>> = {}
    for (const t of frames) {
      const all = history[t] ?? []
      const end = t === tf ? i : lastClosedIndex(all, t, close)
      bars[t] = all.slice(Math.max(0, end - window + 1), end + 1)
    }
    const signal = evaluateStrategy(strategy, symbol, bars, options.precision ?? 2, 'backtest')
    if (!signal || !levels.includes(signal.level)) continue
    // Cooldown như Worker (theo thời gian nến)
    if (close - (lastAt[signal.side] ?? -Infinity) < strategy.alert.cooldownMinutes * 60) continue
    lastAt[signal.side] = close
    trades.push({ signal, ...simulate(signal, main.slice(i + 1), maxHold) })
  }

  const wins = trades.filter((t) => t.outcome === 'tp').length
  const losses = trades.filter((t) => t.outcome === 'sl').length
  let streak = 0
  let maxLosingStreak = 0
  for (const t of trades) {
    streak = t.outcome === 'sl' ? streak + 1 : 0
    maxLosingStreak = Math.max(maxLosingStreak, streak)
  }
  const totalR = trades.reduce((s, t) => s + t.r, 0)
  return {
    trades,
    stats: {
      signals: trades.length,
      wins,
      losses,
      open: trades.length - wins - losses,
      winRate: wins + losses ? wins / (wins + losses) : 0,
      avgR: trades.length ? totalR / trades.length : 0,
      totalR,
      finalTpRate: trades.length ? trades.filter((t) => t.hitFinalTp).length / trades.length : 0,
      maxLosingStreak,
    },
  }
}
