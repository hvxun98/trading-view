import { isMetalsMarketOpen } from '../../../src/lib/marketHours'
import { SYMBOLS } from '../config'
import { TF_SECONDS } from '../engine/timeframes'
import type { Env } from '../env'
import type { Bar, SymbolId, Timeframe } from '../types'

/**
 * Lấy nến ĐÃ ĐÓNG cho bộ chấm điểm (phía máy chủ nên không bị CORS, gọi thẳng API của sàn).
 * Crypto: Binance (thử lần lượt nhiều máy chủ). Vàng / bạc: OANDA -> Dukascopy -> Binance perpetual (bỏ giờ đóng cửa).
 */

export interface FetchResult {
  bars: Bar[]
  source: string
}

const TIMEOUT = 8000
const DEFAULT_BINANCE = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api-gcp.binance.com']

async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`)
  return (await res.json()) as T
}

type RawKline = [number, string, string, string, string, string, ...unknown[]]
const fromKline = (k: RawKline): Bar => ({
  time: Math.floor(k[0] / 1000),
  open: +k[1],
  high: +k[2],
  low: +k[3],
  close: +k[4],
  volume: +k[5],
})

/** Chỉ giữ nến đã đóng tại `now` */
const closedOnly = (bars: Bar[], tf: Timeframe, now: number) => bars.filter((b) => b.time + TF_SECONDS[tf] <= now)

async function binanceSpot(symbol: string, tf: Timeframe, limit: number, env: Env): Promise<Bar[]> {
  const hosts = env.BINANCE_HOSTS ? env.BINANCE_HOSTS.split(',') : DEFAULT_BINANCE
  let error: unknown
  for (const host of hosts) {
    try {
      const rows = await getJson<RawKline[]>(`${host}/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=${limit + 1}`)
      return rows.map(fromKline)
    } catch (e) {
      error = e
    }
  }
  throw error
}

const OANDA_GRANULARITY: Record<Timeframe, string> = {
  '5m': 'M5',
  '15m': 'M15',
  '30m': 'M30',
  '1h': 'H1',
  '4h': 'H4',
  '1d': 'D',
}

async function oanda(symbol: SymbolId, tf: Timeframe, limit: number, env: Env): Promise<Bar[]> {
  if (!env.OANDA_TOKEN) throw new Error('no OANDA token')
  const base =
    env.OANDA_URL ?? (env.OANDA_ENV === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com')
  const instrument = `${symbol.slice(0, 3)}_${symbol.slice(3)}`
  const params = new URLSearchParams({
    granularity: OANDA_GRANULARITY[tf],
    count: String(limit + 1),
    price: 'M',
    dailyAlignment: '0',
    alignmentTimezone: 'UTC',
    weeklyAlignment: 'Monday',
  })
  const body = await getJson<{
    candles: { time: string; complete: boolean; volume: number; mid: Record<'o' | 'h' | 'l' | 'c', string> }[]
  }>(`${base}/v3/instruments/${instrument}/candles?${params}`, {
    headers: { Authorization: `Bearer ${env.OANDA_TOKEN}`, 'Accept-Datetime-Format': 'UNIX' },
  })
  return body.candles
    .filter((c) => c.complete)
    .map((c) => ({
      time: Math.floor(Number(c.time)),
      open: +c.mid.o,
      high: +c.mid.h,
      low: +c.mid.l,
      close: +c.mid.c,
      volume: c.volume,
    }))
}

const DUKASCOPY_INTERVAL: Record<Timeframe, string> = {
  '5m': '5MIN',
  '15m': '15MIN',
  '30m': '30MIN',
  '1h': '1HOUR',
  '4h': '4HOUR',
  '1d': '1DAY',
}
const DUKASCOPY_REFERER =
  'https://freeserv.dukascopy.com/2.0/?path=chart/index&showUI=true&showTabs=true&instrument=XAU/USD&period=60&offerSide=BID&timezone=0&live=true&lang=en'

async function dukascopy(symbol: SymbolId, tf: Timeframe, limit: number, env: Env, now: number): Promise<Bar[]> {
  // Cuối tuần không có nến -> lấy khoảng thời gian dài hơn ~1.6 lần
  const from = (now - Math.ceil(limit * 1.6) * TF_SECONDS[tf]) * 1000
  const params = new URLSearchParams({
    path: 'chart/json3',
    splits: 'true',
    stocks: 'true',
    time_direction: 'N',
    jsonp: '_callbacks____alerts',
    last_update: String(from),
    offer_side: 'B',
    instrument: `${symbol.slice(0, 3)}/${symbol.slice(3)}`,
    interval: DUKASCOPY_INTERVAL[tf],
    limit: String(Math.min(30000, Math.ceil(limit * 1.6))),
  })
  const res = await fetch(`${env.DUKASCOPY_URL ?? 'https://freeserv.dukascopy.com/2.0/index.php'}?${params}`, {
    headers: { Referer: DUKASCOPY_REFERER, 'User-Agent': 'Mozilla/5.0 (trading-view-alerts)' },
    signal: AbortSignal.timeout(TIMEOUT),
  })
  if (!res.ok) throw new Error(`Dukascopy ${res.status}`)
  const text = await res.text()
  const rows = JSON.parse(text.slice(text.indexOf('(') + 1, text.lastIndexOf(')'))) as number[][]
  return rows.map(([t, o, h, l, c, v]) => ({
    time: Math.floor(t / 1000),
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v,
  }))
}

async function binanceFutures(symbol: SymbolId, tf: Timeframe, limit: number, env: Env): Promise<Bar[]> {
  const base = env.BINANCE_FUTURES_URL ?? 'https://fapi.binance.com'
  // Giao dịch 24/7: lấy dư rồi bỏ nến trong giờ thị trường kim loại đóng cửa (như OANDA)
  const rows = await getJson<RawKline[]>(
    `${base}/fapi/v1/klines?symbol=${symbol}T&interval=${tf}&limit=${Math.min(1500, Math.ceil(limit * 1.5))}`,
  )
  return rows.map(fromKline).filter((b) => isMetalsMarketOpen(b.time))
}

type Source = 'oanda' | 'dukascopy' | 'binance-futures'
const SOURCE_NAME: Record<Source, string> = {
  oanda: 'OANDA',
  dukascopy: 'Dukascopy',
  'binance-futures': 'Binance Futures',
}

/** Thứ tự nguồn cho vàng / bạc */
export function metalSources(env: Env): Source[] {
  const auto: Source[] = env.OANDA_TOKEN ? ['oanda', 'dukascopy', 'binance-futures'] : ['dukascopy', 'binance-futures']
  const first = env.GOLD_SOURCE && env.GOLD_SOURCE !== 'auto' ? env.GOLD_SOURCE : null
  return first ? [first, ...auto.filter((s) => s !== first)] : auto
}

/** `limit` nến đã đóng gần nhất (có thể ít hơn nếu nguồn thiếu dữ liệu) */
export async function fetchBars(
  symbol: SymbolId,
  tf: Timeframe,
  limit: number,
  env: Env,
  now = Math.floor(Date.now() / 1000),
): Promise<FetchResult> {
  if (SYMBOLS[symbol].kind === 'crypto') {
    const bars = closedOnly(await binanceSpot(symbol, tf, limit, env), tf, now)
    return { bars: bars.slice(-limit), source: 'Binance' }
  }
  let error: unknown
  for (const source of metalSources(env)) {
    try {
      const raw =
        source === 'oanda'
          ? await oanda(symbol, tf, limit, env)
          : source === 'dukascopy'
            ? await dukascopy(symbol, tf, limit, env, now)
            : await binanceFutures(symbol, tf, limit, env)
      const bars = closedOnly(raw, tf, now)
      if (bars.length) return { bars: bars.slice(-limit), source: SOURCE_NAME[source] }
      error = new Error(`${SOURCE_NAME[source]}: no data`)
    } catch (e) {
      error = e
    }
  }
  throw error
}
