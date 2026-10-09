import { isMetalsMarketOpen } from '../../../src/lib/marketHours'
import { SYMBOLS } from '../config'
import { TF_SECONDS } from '../engine/timeframes'
import type { Env } from '../env'
import type { Bar, SymbolId, Timeframe } from '../types'
import { metalSources } from './fetch'

/** Lịch sử dài cho backtest: [from, to) theo giây, phân trang theo giới hạn từng sàn */

type RawKline = [number, string, string, string, string, string, ...unknown[]]
const fromKline = (k: RawKline): Bar => ({
  time: Math.floor(k[0] / 1000),
  open: +k[1],
  high: +k[2],
  low: +k[3],
  close: +k[4],
  volume: +k[5],
})

async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`)
  return (await res.json()) as T
}

async function pagedKlines(base: string, path: string, symbol: string, tf: Timeframe, from: number, to: number) {
  const out: Bar[] = []
  let start = from
  while (start < to) {
    const rows = await getJson<RawKline[]>(
      `${base}${path}?symbol=${symbol}&interval=${tf}&startTime=${start * 1000}&endTime=${to * 1000 - 1}&limit=1000`,
    )
    if (!rows.length) break
    out.push(...rows.map(fromKline))
    start = out.at(-1)!.time + TF_SECONDS[tf]
    if (rows.length < 1000) break
  }
  return out
}

export async function fetchHistory(
  symbol: SymbolId,
  tf: Timeframe,
  from: number,
  to: number,
  env: Env,
): Promise<{ bars: Bar[]; source: string }> {
  const closed = (bars: Bar[]) => bars.filter((b) => b.time >= from && b.time + TF_SECONDS[tf] <= to)
  if (SYMBOLS[symbol].kind === 'crypto') {
    const base = env.BINANCE_HOSTS?.split(',')[0] ?? 'https://data-api.binance.vision'
    return { bars: closed(await pagedKlines(base, '/api/v3/klines', symbol, tf, from, to)), source: 'Binance' }
  }
  let error: unknown
  for (const source of metalSources(env)) {
    try {
      if (source === 'binance-futures') {
        const base = env.BINANCE_FUTURES_URL ?? 'https://fapi.binance.com'
        const bars = await pagedKlines(base, '/fapi/v1/klines', `${symbol}T`, tf, from, to)
        return { bars: closed(bars.filter((b) => isMetalsMarketOpen(b.time))), source: 'Binance Futures' }
      }
      if (source === 'dukascopy') {
        const { fetchBars } = await import('./fetch')
        // Dukascopy trả tối đa 30.000 nến mỗi lần, bắt đầu từ `from`
        const count = Math.min(30000, Math.ceil((to - from) / TF_SECONDS[tf]))
        const { bars } = await fetchBars(
          symbol,
          tf,
          count,
          { ...env, GOLD_SOURCE: 'dukascopy', OANDA_TOKEN: undefined },
          to,
        )
        return { bars: closed(bars), source: 'Dukascopy' }
      }
      // OANDA: tối đa 5000 nến mỗi lần
      const base =
        env.OANDA_URL ??
        (env.OANDA_ENV === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com')
      const out: Bar[] = []
      let start = from
      const granularity = { '5m': 'M5', '15m': 'M15', '30m': 'M30', '1h': 'H1', '4h': 'H4', '1d': 'D' }[tf]
      while (start < to) {
        const params = new URLSearchParams({
          granularity,
          from: String(start),
          count: '5000',
          price: 'M',
          dailyAlignment: '0',
          alignmentTimezone: 'UTC',
        })
        const body = await getJson<{
          candles: { time: string; complete: boolean; volume: number; mid: Record<string, string> }[]
        }>(`${base}/v3/instruments/${symbol.slice(0, 3)}_${symbol.slice(3)}/candles?${params}`, {
          headers: { Authorization: `Bearer ${env.OANDA_TOKEN}`, 'Accept-Datetime-Format': 'UNIX' },
        })
        const rows = body.candles
          .filter((c) => c.complete)
          .map((c) => ({
            time: Math.floor(+c.time),
            open: +c.mid.o,
            high: +c.mid.h,
            low: +c.mid.l,
            close: +c.mid.c,
            volume: c.volume,
          }))
        if (!rows.length) break
        out.push(...rows)
        start = rows.at(-1)!.time + TF_SECONDS[tf]
        if (body.candles.length < 5000) break
      }
      return { bars: closed(out), source: 'OANDA' }
    } catch (e) {
      error = e
    }
  }
  throw error
}
