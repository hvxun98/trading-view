import type { UTCTimestamp } from 'lightweight-charts'
import type { Candle, DataFeed } from '../types'
import { intervalSeconds } from '../lib/intervals'

// PRNG có seed để cùng symbol/thời điểm luôn sinh ra cùng một nến
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(s: string): number {
  let h = 0
  for (const ch of s) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0
  return h
}

function basePrice(symbol: string): number {
  return 10 + (Math.abs(hash(symbol)) % 50000)
}

/** Dữ liệu giả lập, dùng khi không truy cập được Binance (offline, bị chặn...). */
export const mockFeed: DataFeed = {
  name: 'Demo',

  async getHistory(symbol, interval, endTime, limit = 1000) {
    const step = intervalSeconds(interval)
    const end = Math.floor((endTime ?? Date.now()) / 1000 / step) * step
    const candles: Candle[] = []
    let price = basePrice(symbol)
    for (let i = limit - 1; i >= 0; i--) {
      const time = end - i * step
      const rnd = mulberry32(hash(symbol) ^ time)
      const open = price
      const close = Math.max(0.0001, open * (1 + (rnd() - 0.5) * 0.02))
      const high = Math.max(open, close) * (1 + rnd() * 0.006)
      const low = Math.min(open, close) * (1 - rnd() * 0.006)
      candles.push({ time: time as UTCTimestamp, open, high, low, close, volume: rnd() * 1000 })
      price = close
    }
    return candles
  },

  subscribeBars() {
    return () => {}
  },
}
