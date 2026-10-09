import type { Candle } from '../../../src/types'
import { computeRsi } from '../../../src/lib/rsi'
import type { Bar, MovingAverage } from '../types'

/*
 * Chỉ báo tính giống TradingView (ta.sma / ta.ema / ta.rma / ta.atr / ta.macd).
 * Mỗi hàm trả về mảng cùng độ dài với dữ liệu vào, phần chưa đủ dữ liệu là NaN.
 */

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/** EMA khởi tạo bằng SMA của `period` giá trị đầu (như ví dụ pine_ema của TradingView) */
export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN)
  if (values.length < period) return out
  const alpha = 2 / (period + 1)
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = alpha * values[i] + (1 - alpha) * prev
    out[i] = prev
  }
  return out
}

/** Trung bình Wilder (ta.rma), khởi tạo bằng SMA */
export function rma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN)
  if (values.length < period) return out
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period
    out[i] = prev
  }
  return out
}

export function movingAverage(kind: MovingAverage, values: number[], period: number): number[] {
  return kind === 'ema' ? ema(values, period) : sma(values, period)
}

export function atr(bars: Bar[], period: number): number[] {
  const tr = bars.map((b, i) =>
    i === 0
      ? b.high - b.low
      : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)),
  )
  return rma(tr, period)
}

/** RSI dùng chung với chart (src/lib/rsi.ts), căn lại theo chỉ số nến */
export function rsi(bars: Bar[], period: number): number[] {
  const out = new Array<number>(bars.length).fill(NaN)
  const points = computeRsi(bars as unknown as Candle[], period)
  const offset = bars.length - points.length
  points.forEach((p, i) => (out[offset + i] = p.value))
  return out
}

export function macd(values: number[], fast: number, slow: number, signal: number) {
  const f = ema(values, fast)
  const s = ema(values, slow)
  const line = values.map((_, i) => f[i] - s[i])
  const firstValid = line.findIndex((v) => !Number.isNaN(v))
  const sig = new Array<number>(values.length).fill(NaN)
  if (firstValid >= 0) ema(line.slice(firstValid), signal).forEach((v, i) => (sig[firstValid + i] = v))
  return { line, signal: sig, histogram: line.map((v, i) => v - sig[i]) }
}

export const closes = (bars: Bar[]) => bars.map((b) => b.close)
