import type { DataFeed, Ticker } from '../types'
import { binanceFeed, fetchTickers, subscribeTickers } from './binance'
import { makeBinanceFuturesFeed, subscribeFuturesTickers } from './binanceFutures'
import { getSymbolInfo, type MetalsSource, type SymbolInfo } from './catalog'
import { makeDukascopyFeed, subscribeDukascopyTickers } from './dukascopy'
import { mockFeed } from './mock'
import { makeMt5Feed, subscribeMt5Tickers, type Mt5Config } from './mt5'
import { makeOandaFeed, subscribeOandaTickers, type OandaConfig } from './oanda'
import { fetchSpotQuote, withSpotTicks } from './swissquote'

/** Nguồn tuỳ chọn do người dùng cấu hình (hộp thoại Nguồn dữ liệu) */
export interface DataSources {
  oanda: OandaConfig | null
  mt5: Mt5Config | null
  metalsSource: MetalsSource
}

/** Chuỗi đại diện cấu hình nguồn — đổi thì tải lại dữ liệu */
export function sourcesKey({ oanda, mt5, metalsSource }: DataSources): string {
  return [oanda ? `${oanda.env}:${oanda.token}` : '', mt5?.url ?? '', metalsSource].join('|')
}

/** Vàng / bạc lấy từ Binance perpetual (người dùng chọn, không dùng MT5) */
const fromFutures = (info: SymbolInfo, { mt5, metalsSource }: DataSources) =>
  !mt5 && metalsSource === 'binanceFutures' && !!info.binanceFuturesSymbol

/**
 * Các nguồn dữ liệu cho một mã, theo thứ tự ưu tiên; mockFeed luôn là phương án cuối.
 * Forex / kim loại (XAUUSD…): MT5 nếu bật bridge -> Binance perpetual nếu chọn (vàng, bạc) -> OANDA nếu có token
 * -> Dukascopy (lịch sử) + Swissquote (giá realtime mỗi giây).
 */
export function feedsFor(symbol: string, sources: DataSources): DataFeed[] {
  const info = getSymbolInfo(symbol)
  if (info.provider === 'binance') return [binanceFeed, mockFeed]
  const feeds: DataFeed[] = []
  if (sources.mt5) feeds.push(makeMt5Feed(sources.mt5))
  if (fromFutures(info, sources)) feeds.push(makeBinanceFuturesFeed(info.binanceFuturesSymbol!))
  if (sources.oanda?.token) feeds.push(makeOandaFeed(sources.oanda, info.providerSymbol))
  if (info.dukascopySymbol) {
    const duka = makeDukascopyFeed(info.dukascopySymbol)
    feeds.push(info.spotSymbol ? withSpotTicks(duka, info.spotSymbol) : duka)
  }
  feeds.push(mockFeed)
  return feeds
}

/** Giá realtime cho Watchlist: mã Binance qua WebSocket, forex / kim loại theo nguồn đã chọn */
export function subscribeWatchlist(symbols: string[], sources: DataSources, onTicker: (t: Ticker) => void): () => void {
  const { oanda, mt5 } = sources
  const infos = symbols.map(getSymbolInfo)
  const unsubs: (() => void)[] = []

  const binance = infos.filter((i) => i.provider === 'binance').map((i) => i.symbol)
  if (binance.length) {
    fetchTickers(binance)
      .then((rows) => rows.forEach(onTicker))
      .catch(() => {})
    unsubs.push(subscribeTickers(binance, onTicker))
  }

  const fx = infos.filter((i) => i.provider === 'oanda')
  const futures = fx.filter((i) => fromFutures(i, sources))
  const rest = fx.filter((i) => !fromFutures(i, sources))
  if (futures.length) {
    const items = futures.map((i) => ({ symbol: i.symbol, futuresSymbol: i.binanceFuturesSymbol! }))
    unsubs.push(subscribeFuturesTickers(items, onTicker))
  }
  if (rest.length && mt5) {
    unsubs.push(
      subscribeMt5Tickers(
        mt5,
        rest.map((i) => i.symbol),
        onTicker,
      ),
    )
  } else if (rest.length && oanda?.token) {
    unsubs.push(
      subscribeOandaTickers(
        oanda,
        rest.map((i) => ({ symbol: i.symbol, instrument: i.providerSymbol })),
        onTicker,
      ),
    )
  } else if (rest.length) {
    unsubs.push(subscribeSpotTickers(rest, onTicker))
  }

  return () => unsubs.forEach((u) => u())
}

/** Giá mở cửa ngày từ Dukascopy, giá cuối từ Swissquote (mới hơn) */
function subscribeSpotTickers(infos: SymbolInfo[], onTicker: (t: Ticker) => void): () => void {
  const opens = new Map<string, number>()
  const lastSpot = new Map<string, number>()
  const items = infos
    .filter((i) => i.dukascopySymbol)
    .map((i) => ({ symbol: i.symbol, instrument: i.dukascopySymbol! }))
  const unsubscribe = subscribeDukascopyTickers(items, (t) => {
    opens.set(t.symbol, t.open)
    onTicker({ ...t, last: lastSpot.get(t.symbol) ?? t.last })
  })
  let stopped = false
  const poll = () =>
    infos.forEach(async (info) => {
      const open = opens.get(info.symbol)
      if (!info.spotSymbol || open === undefined) return
      try {
        const q = await fetchSpotQuote(info.spotSymbol)
        if (stopped || !q) return
        lastSpot.set(info.symbol, q.price)
        onTicker({ symbol: info.symbol, last: q.price, open })
      } catch {
        // thử lại lần sau
      }
    })
  const id = setInterval(poll, 3000)
  return () => {
    stopped = true
    clearInterval(id)
    unsubscribe()
  }
}
