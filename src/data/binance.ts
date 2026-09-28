import type { UTCTimestamp } from 'lightweight-charts'
import type { Candle, DataFeed, Interval, Ticker } from '../types'

const REST = 'https://api.binance.com/api/v3'
const WS = 'wss://stream.binance.com:9443'

type RawKline = [number, string, string, string, string, string, ...unknown[]]

function toCandle(k: RawKline): Candle {
  return {
    time: Math.floor(k[0] / 1000) as UTCTimestamp,
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4],
    volume: +k[5],
  }
}

/** Mở WebSocket tự kết nối lại khi rớt mạng. Trả về hàm huỷ. */
function openStream(path: string, onMessage: (data: unknown) => void): () => void {
  let ws: WebSocket | null = null
  let disposed = false
  let retry = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const connect = () => {
    ws = new WebSocket(`${WS}${path}`)
    ws.onopen = () => (retry = 0)
    ws.onmessage = (e) => onMessage(JSON.parse(e.data))
    ws.onclose = () => {
      if (disposed) return
      timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 15000))
    }
  }
  connect()

  return () => {
    disposed = true
    clearTimeout(timer)
    ws?.close()
  }
}

export const binanceFeed: DataFeed = {
  name: 'Binance',

  async getHistory(symbol, interval, endTime, limit = 1000) {
    const params = new URLSearchParams({ symbol, interval, limit: String(limit) })
    if (endTime) params.set('endTime', String(endTime))
    const res = await fetch(`${REST}/klines?${params}`)
    if (!res.ok) throw new Error(`Binance ${res.status}`)
    return ((await res.json()) as RawKline[]).map(toCandle)
  },

  subscribeBars(symbol, interval: Interval, onBar) {
    return openStream(`/ws/${symbol.toLowerCase()}@kline_${interval}`, (msg) => {
      const k = (msg as { k: { t: number; o: string; h: string; l: string; c: string; v: string } }).k
      onBar({
        time: Math.floor(k.t / 1000) as UTCTimestamp,
        open: +k.o,
        high: +k.h,
        low: +k.l,
        close: +k.c,
        volume: +k.v,
      })
    })
  },
}

export async function fetchTickers(symbols: string[]): Promise<Ticker[]> {
  const res = await fetch(`${REST}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`)
  if (!res.ok) throw new Error(`Binance ${res.status}`)
  const rows = (await res.json()) as { symbol: string; lastPrice: string; openPrice: string }[]
  return rows.map((r) => ({ symbol: r.symbol, last: +r.lastPrice, open: +r.openPrice }))
}

export function subscribeTickers(symbols: string[], onTicker: (t: Ticker) => void): () => void {
  const streams = symbols.map((s) => `${s.toLowerCase()}@miniTicker`).join('/')
  return openStream(`/stream?streams=${streams}`, (msg) => {
    const d = (msg as { data: { s: string; c: string; o: string } }).data
    onTicker({ symbol: d.s, last: +d.c, open: +d.o })
  })
}
