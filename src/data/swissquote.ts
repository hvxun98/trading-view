import type { UTCTimestamp } from 'lightweight-charts'
import { intervalSeconds } from '../lib/intervals'
import type { Candle, DataFeed, Interval } from '../types'

/**
 * Giá giao ngay (BID) gần như realtime từ Swissquote Bank — endpoint công khai của trang báo giá:
 *   https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD
 *   -> [{ ts, spreadProfilePrices: [{ spreadProfile, bid, ask }, ...] }, ...]
 * Không có tài liệu chính thức; gọi qua proxy /api/swissquote/<BASE>/<QUOTE> (Vite khi dev, Vercel Function khi deploy).
 */
interface RawQuote {
  ts?: number
  spreadProfilePrices?: { spreadProfile?: string; bid?: number; ask?: number }[]
}

export interface SpotQuote {
  /** Giá BID (giống nến Dukascopy) */
  price: number
  /** Thời điểm báo giá (giây, UTC) */
  time: number
}

/** Báo giá mới nhất của một cặp, vd. "XAU/USD"; null nếu không đọc được */
export async function fetchSpotQuote(instrument: string): Promise<SpotQuote | null> {
  const res = await fetch(`/api/swissquote/${instrument}`, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`Swissquote ${res.status}`)
  const rows = (await res.json()) as RawQuote[]
  let best: SpotQuote | null = null
  for (const row of Array.isArray(rows) ? rows : []) {
    const prices = row.spreadProfilePrices ?? []
    // Ưu tiên hồ sơ spread "prime" (hẹp nhất), không có thì lấy hồ sơ đầu tiên
    const pick = prices.find((p) => p.spreadProfile?.toLowerCase() === 'prime') ?? prices[0]
    if (typeof row.ts !== 'number' || typeof pick?.bid !== 'number' || !(pick.bid > 0)) continue
    if (!best || row.ts / 1000 > best.time) best = { price: pick.bid, time: row.ts / 1000 }
  }
  return best
}

/** Độ dài tối đa của một nến (giây) để biết báo giá còn thuộc nến cuối hay không */
const maxPeriod = (interval: Interval) =>
  interval === '1M' ? 31 * 86400 : interval === '3d' ? 3 * 86400 : intervalSeconds(interval)

/**
 * Lịch sử nến từ `feed` (Dukascopy), nến cuối cập nhật theo báo giá Swissquote mỗi giây
 * — nhanh hơn nhiều so với chỉ hỏi lại nến Dukascopy.
 */
export function withSpotTicks(feed: DataFeed, instrument: string): DataFeed {
  return {
    name: `${feed.name} + Swissquote`,
    getHistory: (...args) => feed.getHistory(...args),

    subscribeBars(symbol, interval, onBar) {
      let stopped = false
      let busy = false
      /** Nến cuối đã gửi cho chart */
      let bar: Candle | null = null
      let tick: SpotQuote | null = null
      const intraday = intervalSeconds(interval) < 86400
      const step = intervalSeconds(interval)
      const emit = (b: Candle) => {
        bar = b
        onBar(b)
      }
      // Báo giá có thuộc nến `b` không
      const inBar = (b: Candle, q: SpotQuote) => q.time >= b.time && q.time < b.time + maxPeriod(interval)

      // Nến từ nguồn gốc (thường trễ hơn): giữ giá mới nhất & cao/thấp đã thấy từ báo giá
      const unsubscribe = feed.subscribeBars(symbol, interval, (b) => {
        if (bar && b.time < bar.time) return
        if (bar && b.time === bar.time) {
          const live = tick && inBar(b, tick) ? tick.price : null
          emit({
            ...b,
            high: Math.max(b.high, bar.high),
            low: Math.min(b.low, bar.low),
            close: live ?? b.close,
          })
        } else emit(b)
      })

      const poll = async () => {
        if (busy || stopped) return
        busy = true
        try {
          const q = await fetchSpotQuote(instrument)
          if (stopped || !q || !bar) return
          tick = q
          if (inBar(bar, q)) {
            emit({ ...bar, high: Math.max(bar.high, q.price), low: Math.min(bar.low, q.price), close: q.price })
          } else if (intraday && q.time >= bar.time + step) {
            // Sang nến mới (nến ngày trở lên chờ nguồn gốc mở nến, vì căn mốc theo sàn)
            const time = (Math.floor(q.time / step) * step) as UTCTimestamp
            emit({ time, open: q.price, high: q.price, low: q.price, close: q.price, volume: 0 })
          }
          // Báo giá cũ (cuối tuần Swissquote trả lại giá chiều thứ Sáu): bỏ qua
        } catch {
          // mạng chập chờn: thử lại lần sau
        } finally {
          busy = false
        }
      }
      const id = setInterval(poll, 1000)
      return () => {
        stopped = true
        clearInterval(id)
        unsubscribe()
      }
    },
  }
}
