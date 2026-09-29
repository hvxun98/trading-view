import type { UTCTimestamp } from 'lightweight-charts'
import type { Candle, DataFeed, Interval, Ticker } from '../types'
import { toThreeDay } from './aggregate'

/**
 * MetaTrader 5 qua bridge Python chạy cạnh terminal (bridge/mt5_bridge.py, mặc định http://127.0.0.1:8765).
 * MT5 không có API web nên trình duyệt gọi thẳng bridge trên máy người dùng.
 */
export interface Mt5Config {
  url: string
}

export const DEFAULT_MT5_URL = 'http://127.0.0.1:8765'

const base = (cfg: Mt5Config) => cfg.url.replace(/\/+$/, '')

async function getJson<T>(cfg: Mt5Config, path: string, params: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${base(cfg)}${path}?${new URLSearchParams(params)}`)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `MT5 bridge ${res.status}`)
  return body as T
}

async function fetchCandles(
  cfg: Mt5Config,
  symbol: string,
  interval: Interval,
  limit: number,
  endMs?: number,
): Promise<Candle[]> {
  // 3D: lấy nến ngày rồi gộp như các nguồn khác
  const params: Record<string, string> = {
    symbol,
    interval: interval === '3d' ? '1d' : interval,
    limit: String(interval === '3d' ? limit * 3 : limit),
  }
  if (endMs !== undefined) params.end = String(Math.floor(endMs / 1000))
  const body = await getJson<{ candles: number[][] }>(cfg, '/history', params)
  const candles = body.candles.map(([t, o, h, l, c, v]) => ({
    time: t as UTCTimestamp,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v,
  }))
  return interval === '3d' ? toThreeDay(candles) : candles
}

/** Kiểm tra bridge (hộp thoại Nguồn dữ liệu): tên broker & giá XAUUSD */
export async function testMt5(cfg: Mt5Config): Promise<{ company: string; price: number | null }> {
  const health = await getJson<{ company: string | null; server: string | null }>(cfg, '/health')
  const [gold] = await getJson<Ticker[]>(cfg, '/ticker', { symbols: 'XAUUSD' })
  return { company: [health.company, health.server].filter(Boolean).join(' · '), price: gold?.last ?? null }
}

export function makeMt5Feed(cfg: Mt5Config): DataFeed {
  return {
    name: 'MT5',

    getHistory(symbol, interval, endTime, limit = 1000) {
      return fetchCandles(cfg, symbol, interval, limit, endTime)
    },

    // Bridge chạy trên máy người dùng nên hỏi mỗi giây (gần như realtime)
    subscribeBars(symbol, interval, onBar) {
      let stopped = false
      let busy = false
      const poll = async () => {
        if (busy) return
        busy = true
        try {
          const bars = await fetchCandles(cfg, symbol, interval, 2)
          if (!stopped) bars.forEach(onBar)
        } catch {
          // terminal mất kết nối: thử lại lần sau
        } finally {
          busy = false
        }
      }
      const id = setInterval(poll, 1000)
      return () => {
        stopped = true
        clearInterval(id)
      }
    },
  }
}

/** Giá cuối (BID) & giá mở cửa ngày cho Watchlist */
export function subscribeMt5Tickers(cfg: Mt5Config, symbols: string[], onTicker: (t: Ticker) => void): () => void {
  let stopped = false
  const poll = async () => {
    try {
      const rows = await getJson<Ticker[]>(cfg, '/ticker', { symbols: symbols.join(',') })
      if (!stopped) rows.forEach(onTicker)
    } catch {
      // bỏ qua, thử lại lần sau
    }
  }
  poll()
  const id = setInterval(poll, 2000)
  return () => {
    stopped = true
    clearInterval(id)
  }
}
