import type { UTCTimestamp } from 'lightweight-charts'
import type { Candle } from '../types'

/** Gộp nến ngày thành nến 3 ngày (căn theo số ngày kể từ 1970, như Binance) */
export function toThreeDay(daily: Candle[]): Candle[] {
  const out: Candle[] = []
  for (const c of daily) {
    const bucket = (Math.floor(c.time / 86400 / 3) * 3 * 86400) as UTCTimestamp
    const last = out.at(-1)
    if (last && last.time === bucket) {
      last.high = Math.max(last.high, c.high)
      last.low = Math.min(last.low, c.low)
      last.close = c.close
      last.volume += c.volume
    } else {
      out.push({ ...c, time: bucket })
    }
  }
  return out
}
