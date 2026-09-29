import type { DataFeed, Ticker } from '../types'
import { binanceFeed, fetchTickers, subscribeTickers } from './binance'
import { getSymbolInfo } from './catalog'
import { makeDukascopyFeed, subscribeDukascopyTickers } from './dukascopy'
import { mockFeed } from './mock'
import { makeMt5Feed, subscribeMt5Tickers, type Mt5Config } from './mt5'
import { makeOandaFeed, subscribeOandaTickers, type OandaConfig } from './oanda'

/** Nguồn tuỳ chọn do người dùng cấu hình (hộp thoại Nguồn dữ liệu) */
export interface DataSources {
  oanda: OandaConfig | null
  mt5: Mt5Config | null
}

/** Chuỗi đại diện cấu hình nguồn — đổi thì tải lại dữ liệu */
export function sourcesKey({ oanda, mt5 }: DataSources): string {
  return [oanda ? `${oanda.env}:${oanda.token}` : '', mt5?.url ?? ''].join('|')
}

/**
 * Các nguồn dữ liệu cho một mã, theo thứ tự ưu tiên; mockFeed luôn là phương án cuối.
 * Forex / kim loại (XAUUSD…): MT5 nếu bật bridge -> OANDA nếu có token -> Dukascopy (miễn phí, giá spot ECN).
 */
export function feedsFor(symbol: string, { oanda, mt5 }: DataSources): DataFeed[] {
  const info = getSymbolInfo(symbol)
  if (info.provider === 'binance') return [binanceFeed, mockFeed]
  const feeds: DataFeed[] = []
  if (mt5) feeds.push(makeMt5Feed(mt5))
  if (oanda?.token) feeds.push(makeOandaFeed(oanda, info.providerSymbol))
  if (info.dukascopySymbol) feeds.push(makeDukascopyFeed(info.dukascopySymbol))
  feeds.push(mockFeed)
  return feeds
}

/** Giá realtime cho Watchlist: mã Binance qua 1 WebSocket, forex / kim loại hỏi định kỳ */
export function subscribeWatchlist(
  symbols: string[],
  { oanda, mt5 }: DataSources,
  onTicker: (t: Ticker) => void,
): () => void {
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
  if (fx.length && mt5) {
    unsubs.push(
      subscribeMt5Tickers(
        mt5,
        fx.map((i) => i.symbol),
        onTicker,
      ),
    )
  } else if (fx.length && oanda?.token) {
    unsubs.push(
      subscribeOandaTickers(
        oanda,
        fx.map((i) => ({ symbol: i.symbol, instrument: i.providerSymbol })),
        onTicker,
      ),
    )
  } else if (fx.length) {
    const items = fx.filter((i) => i.dukascopySymbol).map((i) => ({ symbol: i.symbol, instrument: i.dukascopySymbol! }))
    unsubs.push(subscribeDukascopyTickers(items, onTicker))
  }

  return () => unsubs.forEach((u) => u())
}
