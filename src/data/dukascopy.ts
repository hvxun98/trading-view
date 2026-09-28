import type { UTCTimestamp } from 'lightweight-charts'
import { intervalSeconds } from '../lib/intervals'
import type { Candle, DataFeed, Interval, Ticker } from '../types'
import { toThreeDay } from './aggregate'

/**
 * Dukascopy Bank (Thuỵ Sĩ, sàn ECN): dữ liệu nến forex / kim loại miễn phí, không cần token.
 * Endpoint JSONP của widget chart freeserv.dukascopy.com; đi qua proxy của Vite (/api/dukascopy)
 * để gắn header Referer mà server yêu cầu và tránh CORS.
 *   ?path=chart/json3&instrument=XAU/USD&interval=1HOUR&offer_side=B&time_direction=N&last_update=<ms>&limit=<n>
 * Trả về: cb([[timestamp_ms, open, high, low, close, volume], ...]) — tối đa 30.000 nến / lần.
 */
const BASE = '/api/dukascopy'
const MAX_LIMIT = 30000

const INTERVAL: Record<Interval, string> = {
  '1m': '1MIN',
  '5m': '5MIN',
  '15m': '15MIN',
  '1h': '1HOUR',
  '4h': '4HOUR',
  '1d': '1DAY',
  '3d': '1DAY',
  '1w': '1WEEK',
  '1M': '1MONTH',
}

/** Lấy nến từ mốc `fromMs` trở đi (time_direction = N), giá BID như chart OANDA trên TradingView */
async function fetchFrom(instrument: string, interval: Interval, fromMs: number, limit: number): Promise<Candle[]> {
  const cb = `_callbacks____${Math.random().toString(36).slice(2, 11)}`
  const query = new URLSearchParams({
    path: 'chart/json3',
    splits: 'true',
    stocks: 'true',
    time_direction: 'N',
    jsonp: cb,
    last_update: String(Math.floor(fromMs)),
    offer_side: 'B',
    instrument,
    interval: INTERVAL[interval],
    limit: String(Math.min(MAX_LIMIT, Math.ceil(limit))),
  })
  const res = await fetch(`${BASE}?${query}`)
  if (!res.ok) throw new Error(`Dukascopy ${res.status}`)
  const text = (await res.text()).trim()
  const start = text.indexOf('(')
  const end = text.lastIndexOf(')')
  if (start < 0 || end < start) throw new Error('Dukascopy: unexpected response')
  const rows = JSON.parse(text.slice(start + 1, end)) as number[][]
  const candles = rows.map(([t, o, h, l, c, v]) => ({
    time: Math.floor(t / 1000) as UTCTimestamp,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v,
  }))
  return interval === '3d' ? toThreeDay(candles) : candles
}

/** Bước thời gian của dữ liệu gốc (3D lấy nến ngày rồi gộp) */
const rawStep = (interval: Interval) => (interval === '3d' ? 86400 : intervalSeconds(interval))

export function makeDukascopyFeed(instrument: string): DataFeed {
  return {
    name: 'Dukascopy',

    async getHistory(_symbol, interval, endTime, limit = 1000) {
      const endMs = endTime ?? Date.now()
      const count = interval === '3d' ? limit * 3 : limit
      // Forex nghỉ cuối tuần -> lấy khoảng thời gian dài hơn ~1.5 lần để đủ số nến
      const fromMs = endMs - count * 1.5 * rawStep(interval) * 1000
      const candles = await fetchFrom(instrument, interval, fromMs, count * 1.5)
      return candles.filter((c) => c.time * 1000 <= endMs).slice(-limit)
    },

    // Không có WebSocket công khai: hỏi lại các nến từ nến cuối cùng trở đi mỗi 2 giây
    subscribeBars(_symbol, interval, onBar) {
      let stopped = false
      let lastTime = 0
      const poll = async () => {
        try {
          const step = rawStep(interval)
          // 3D: lấy lại cả nhóm 3 ngày hiện tại để gộp đúng
          const fromMs = interval === '3d' ? (lastTime || Date.now() / 1000 - 3 * step) * 1000 : lastTime * 1000
          const bars = await fetchFrom(instrument, interval, fromMs || Date.now() - 2 * step * 1000, 10)
          if (stopped) return
          for (const bar of bars) {
            if (bar.time < lastTime) continue
            lastTime = bar.time
            onBar(bar)
          }
        } catch {
          // mạng chập chờn: thử lại lần sau
        }
      }
      const id = setInterval(poll, 2000)
      return () => {
        stopped = true
        clearInterval(id)
      }
    },
  }
}

/** Giá cuối & giá mở cửa ngày cho Watchlist (hỏi lại mỗi 5 giây) */
export function subscribeDukascopyTickers(
  items: { symbol: string; instrument: string }[],
  onTicker: (t: Ticker) => void,
): () => void {
  let stopped = false
  const poll = () =>
    items.forEach(async ({ symbol, instrument }) => {
      try {
        const day = (await fetchFrom(instrument, '1d', Date.now() - 4 * 86400 * 1000, 10)).at(-1)
        if (!stopped && day) onTicker({ symbol, last: day.close, open: day.open })
      } catch {
        // bỏ qua, thử lại lần sau
      }
    })
  poll()
  const id = setInterval(poll, 5000)
  return () => {
    stopped = true
    clearInterval(id)
  }
}
