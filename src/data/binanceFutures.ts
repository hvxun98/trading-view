import { isMetalsMarketOpen } from '../lib/marketHours'
import type { Candle, DataFeed, Interval, Ticker } from '../types'
import { toThreeDay } from './aggregate'
import { HttpError, openStream, toCandle, type RawKline } from './binance'

/**
 * Hợp đồng vĩnh cửu vàng / bạc trên Binance Futures (XAUUSDT, XAGUSDT): WebSocket thật, miễn phí, không cần key.
 * Sàn giao dịch 24/7 nên bỏ các nến rơi vào giờ thị trường kim loại đóng cửa (cuối tuần, nghỉ 17:00–18:00 New York)
 * để chart giống OANDA. Nến tuần / tháng không lọc được (một nến chứa cả cuối tuần).
 */
const REST = 'https://fapi.binance.com'
const WS = ['wss://fstream.binance.com']
const MAX_LIMIT = 1500

async function futuresGet<T>(path: string): Promise<T> {
  const res = await fetch(REST + path, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new HttpError('Binance Futures', res.status)
  return (await res.json()) as T
}

/** Khung có lọc giờ đóng cửa (tuần / tháng giữ nguyên) */
const filtered = (interval: Interval) => interval !== '1w' && interval !== '1M'

/** Khung lấy từ sàn: 3D gộp từ nến ngày đã lọc */
const rawInterval = (interval: Interval) => (interval === '3d' ? '1d' : interval)

/** `want` nến (đã lọc) kết thúc trước `endMs`, tải thêm trang cũ hơn nếu một trang toàn nến cuối tuần */
async function fetchKlines(symbol: string, interval: Interval, want: number, endMs?: number): Promise<Candle[]> {
  const filter = filtered(interval)
  const limit = Math.min(MAX_LIMIT, Math.ceil(filter ? want * 1.5 : want))
  const out: Candle[] = []
  let end = endMs
  for (let page = 0; page < 6 && out.length < want; page++) {
    const params = new URLSearchParams({ symbol, interval: rawInterval(interval), limit: String(limit) })
    if (end !== undefined) params.set('endTime', String(end))
    const rows = (await futuresGet<RawKline[]>(`/fapi/v1/klines?${params}`)).map(toCandle)
    if (!rows.length) break
    out.unshift(...(filter ? rows.filter((c) => isMetalsMarketOpen(c.time)) : rows))
    end = rows[0].time * 1000 - 1
    if (rows.length < limit) break
  }
  return out.slice(-want)
}

export function makeBinanceFuturesFeed(futuresSymbol: string): DataFeed {
  return {
    name: 'Binance Futures',

    async getHistory(_symbol, interval, endTime, limit = 1000) {
      if (interval !== '3d') return fetchKlines(futuresSymbol, interval, limit, endTime)
      return toThreeDay(await fetchKlines(futuresSymbol, interval, limit * 3, endTime)).slice(-limit)
    },

    subscribeBars(_symbol, interval, onBar) {
      // 3D: hỏi lại vài nến ngày gần nhất rồi gộp (WebSocket không có nến 3 ngày đã lọc cuối tuần)
      if (interval === '3d') {
        let stopped = false
        const poll = async () => {
          try {
            const bars = toThreeDay(await fetchKlines(futuresSymbol, interval, 6))
            if (!stopped) bars.slice(-2).forEach(onBar)
          } catch {
            // thử lại lần sau
          }
        }
        const id = setInterval(poll, 3000)
        return () => {
          stopped = true
          clearInterval(id)
        }
      }
      const filter = filtered(interval)
      return openStream(
        `/ws/${futuresSymbol.toLowerCase()}@kline_${interval}`,
        (msg) => {
          const k = (msg as { k?: { t: number; o: string; h: string; l: string; c: string; v: string } }).k
          if (!k) return
          const bar = toCandle([k.t, k.o, k.h, k.l, k.c, k.v])
          // Giờ đóng cửa (cuối tuần): bỏ, chart giữ nguyên như OANDA
          if (!filter || isMetalsMarketOpen(bar.time)) onBar(bar)
        },
        WS,
      )
    },
  }
}

/** Giá cuối & giá mở cửa 24h cho Watchlist (mã app <-> mã hợp đồng, vd. XAUUSD <-> XAUUSDT) */
export function subscribeFuturesTickers(
  items: { symbol: string; futuresSymbol: string }[],
  onTicker: (t: Ticker) => void,
): () => void {
  const bySymbol = new Map(items.map((i) => [i.futuresSymbol, i.symbol]))
  for (const { symbol, futuresSymbol } of items) {
    futuresGet<{ lastPrice: string; openPrice: string }>(`/fapi/v1/ticker/24hr?symbol=${futuresSymbol}`)
      .then((r) => onTicker({ symbol, last: +r.lastPrice, open: +r.openPrice }))
      .catch(() => {})
  }
  const streams = items.map((i) => `${i.futuresSymbol.toLowerCase()}@miniTicker`).join('/')
  return openStream(
    `/stream?streams=${streams}`,
    (msg) => {
      const d = (msg as { data?: { s: string; c: string; o: string } }).data
      const symbol = d && bySymbol.get(d.s)
      if (symbol) onTicker({ symbol, last: +d.c, open: +d.o })
    },
    WS,
  )
}
