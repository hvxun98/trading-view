import type { UTCTimestamp } from 'lightweight-charts'
import type { Candle, DataFeed, Interval, Ticker } from '../types'

/**
 * Binance có nhiều máy chủ cho dữ liệu công khai; api.binance.com đôi khi lỗi / bị chặn (nhà mạng, extension,
 * giới hạn tốc độ) nên thử lần lượt và nhớ máy chủ vừa dùng được.
 * data-api.binance.vision: máy chủ chỉ phục vụ dữ liệu thị trường mà Binance khuyên dùng.
 */
const REST_HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision', 'https://api-gcp.binance.com']
const WS_HOSTS = ['wss://stream.binance.com:9443', 'wss://data-stream.binance.vision']
const TIMEOUT = 8000
let restHost = 0

/** Lỗi HTTP từ nguồn dữ liệu; 400 / 404 (vd. mã không tồn tại) thì thử lại cũng vô ích */
export class HttpError extends Error {
  status: number
  constructor(source: string, status: number) {
    super(`${source} ${status}`)
    this.status = status
  }
}

export const isPermanentError = (e: unknown) => e instanceof HttpError && (e.status === 400 || e.status === 404)

/** GET JSON từ REST API của Binance (path dạng "/api/v3/klines?..."), tự chuyển máy chủ khi lỗi */
export async function binanceGet<T>(path: string): Promise<T> {
  let error: unknown
  for (let i = 0; i < REST_HOSTS.length; i++) {
    const host = (restHost + i) % REST_HOSTS.length
    try {
      const res = await fetch(REST_HOSTS[host] + path, { signal: AbortSignal.timeout(TIMEOUT) })
      if (!res.ok) throw new HttpError('Binance', res.status)
      const body = (await res.json()) as T
      restHost = host
      return body
    } catch (e) {
      if (isPermanentError(e)) throw e
      error = e
    }
  }
  throw error
}

export type RawKline = [number, string, string, string, string, string, ...unknown[]]

export function toCandle(k: RawKline): Candle {
  return {
    time: Math.floor(k[0] / 1000) as UTCTimestamp,
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4],
    volume: +k[5],
  }
}

/** Mở WebSocket tự kết nối lại khi rớt mạng (lần lượt thử các máy chủ `hosts`). Trả về hàm huỷ. */
export function openStream(path: string, onMessage: (data: unknown) => void, hosts = WS_HOSTS): () => void {
  let ws: WebSocket | null = null
  let disposed = false
  let retry = 0
  let host = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const connect = () => {
    let opened = false
    ws = new WebSocket(`${hosts[host]}${path}`)
    ws.onopen = () => {
      opened = true
      retry = 0
    }
    ws.onmessage = (e) => onMessage(JSON.parse(e.data))
    ws.onclose = () => {
      if (disposed) return
      // Không kết nối được máy chủ này -> lần sau thử máy chủ dự phòng
      if (!opened) host = (host + 1) % hosts.length
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
    return (await binanceGet<RawKline[]>(`/api/v3/klines?${params}`)).map(toCandle)
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
  const rows = await binanceGet<{ symbol: string; lastPrice: string; openPrice: string }[]>(
    `/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`,
  )
  return rows.map((r) => ({ symbol: r.symbol, last: +r.lastPrice, open: +r.openPrice }))
}

export function subscribeTickers(symbols: string[], onTicker: (t: Ticker) => void): () => void {
  const streams = symbols.map((s) => `${s.toLowerCase()}@miniTicker`).join('/')
  return openStream(`/stream?streams=${streams}`, (msg) => {
    const d = (msg as { data: { s: string; c: string; o: string } }).data
    onTicker({ symbol: d.s, last: +d.c, open: +d.o })
  })
}
