import type { UTCTimestamp } from 'lightweight-charts'
import type { Candle } from '../types'

export interface RsiPoint {
  time: UTCTimestamp
  value: number
}

/**
 * RSI theo cách của TradingView (`ta.rsi`): trung bình Wilder (RMA),
 * khởi tạo bằng SMA của `period` biến động đầu tiên.
 */
export function computeRsi(data: Candle[], period = 14): RsiPoint[] {
  const out: RsiPoint[] = []
  if (data.length <= period) return out

  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close
    if (change > 0) avgGain += change
    else avgLoss -= change
  }
  avgGain /= period
  avgLoss /= period

  const rsi = () => (avgLoss === 0 ? 100 : avgGain === 0 ? 0 : 100 - 100 / (1 + avgGain / avgLoss))
  out.push({ time: data[period].time, value: rsi() })

  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period
    out.push({ time: data[i].time, value: rsi() })
  }
  return out
}
