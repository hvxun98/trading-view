import type { UTCTimestamp } from 'lightweight-charts'
import type { Candle, DataFeed, Interval, Ticker } from '../types'
import { toThreeDay } from './aggregate'

export interface OandaConfig {
  token: string
  env: 'practice' | 'live'
}

/**
 * OANDA v20 không cho gọi trực tiếp từ trình duyệt (CORS), nên đi qua proxy của Vite
 * (/api/oanda/practice -> api-fxpractice.oanda.com, /api/oanda/live -> api-fxtrade.oanda.com).
 */
const base = (cfg: OandaConfig) => `/api/oanda/${cfg.env}/v3`

/** Khung thời gian -> granularity của OANDA ('3d' ghép từ 3 nến ngày) */
const GRANULARITY: Record<Interval, string> = {
  '1m': 'M1',
  '5m': 'M5',
  '15m': 'M15',
  '30m': 'M30',
  '1h': 'H1',
  '4h': 'H4',
  '1d': 'D',
  '3d': 'D',
  '1w': 'W',
  '1M': 'M',
}

interface RawCandle {
  time: string
  volume: number
  mid: { o: string; h: string; l: string; c: string }
}

function toCandle(c: RawCandle): Candle {
  return {
    time: Math.floor(Number(c.time)) as UTCTimestamp,
    open: +c.mid.o,
    high: +c.mid.h,
    low: +c.mid.l,
    close: +c.mid.c,
    volume: c.volume,
  }
}

async function fetchCandles(
  cfg: OandaConfig,
  instrument: string,
  interval: Interval,
  params: Record<string, string>,
): Promise<Candle[]> {
  const query = new URLSearchParams({
    granularity: GRANULARITY[interval],
    price: 'M',
    // Nến ngày/tuần căn theo UTC như các sàn crypto
    dailyAlignment: '0',
    alignmentTimezone: 'UTC',
    weeklyAlignment: 'Monday',
    ...params,
  })
  const res = await fetch(`${base(cfg)}/instruments/${instrument}/candles?${query}`, {
    headers: { Authorization: `Bearer ${cfg.token}`, 'Accept-Datetime-Format': 'UNIX' },
  })
  if (!res.ok) throw new Error(`OANDA ${res.status}`)
  const body = (await res.json()) as { candles: RawCandle[] }
  const candles = body.candles.map(toCandle)
  return interval === '3d' ? toThreeDay(candles) : candles
}

/** Kiểm tra token (dùng trong hộp thoại Nguồn dữ liệu) */
export async function testOanda(cfg: OandaConfig): Promise<number> {
  const candles = await fetchCandles(cfg, 'XAU_USD', '1h', { count: '1' })
  return candles.at(-1)?.close ?? NaN
}

export function makeOandaFeed(cfg: OandaConfig, instrument: string): DataFeed {
  return {
    name: 'OANDA',

    async getHistory(_symbol, interval, endTime, limit = 1000) {
      const count = String(Math.min(5000, interval === '3d' ? limit * 3 : limit))
      const params: Record<string, string> = { count }
      if (endTime) params.to = String(endTime / 1000)
      return fetchCandles(cfg, instrument, interval, params)
    },

    // OANDA không có WebSocket công khai: hỏi lại 2 nến mới nhất mỗi 2 giây
    subscribeBars(_symbol, interval, onBar) {
      let stopped = false
      const poll = async () => {
        try {
          const count = interval === '3d' ? '6' : '2'
          const bars = await fetchCandles(cfg, instrument, interval, { count })
          if (!stopped) bars.forEach(onBar)
        } catch {
          // mạng chập chờn: thử lại ở lần sau
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
export function subscribeOandaTickers(
  cfg: OandaConfig,
  items: { symbol: string; instrument: string }[],
  onTicker: (t: Ticker) => void,
): () => void {
  let stopped = false
  const poll = () =>
    items.forEach(async ({ symbol, instrument }) => {
      try {
        const [day] = (await fetchCandles(cfg, instrument, '1d', { count: '1' })).slice(-1)
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
