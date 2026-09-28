import type { DataFeed, Ticker } from '../types'
import { binanceFeed, fetchTickers, subscribeTickers } from './binance'
import { getSymbolInfo } from './catalog'
import { makeDukascopyFeed, subscribeDukascopyTickers } from './dukascopy'
import { mockFeed } from './mock'
import { makeOandaFeed, subscribeOandaTickers, type OandaConfig } from './oanda'

/**
 * Các nguồn dữ liệu cho một mã, theo thứ tự ưu tiên; mockFeed luôn là phương án cuối.
 * Forex / kim loại (XAUUSD…): OANDA nếu có token, không thì Dukascopy (miễn phí, giá spot ECN).
 */
export function feedsFor(symbol: string, oanda: OandaConfig | null): DataFeed[] {
  const info = getSymbolInfo(symbol)
  if (info.provider === 'binance') return [binanceFeed, mockFeed]
  const feeds: DataFeed[] = []
  if (oanda?.token) feeds.push(makeOandaFeed(oanda, info.providerSymbol))
  if (info.dukascopySymbol) feeds.push(makeDukascopyFeed(info.dukascopySymbol))
  feeds.push(mockFeed)
  return feeds
}

/** Giá realtime cho Watchlist: mã Binance qua 1 WebSocket, forex / kim loại hỏi định kỳ */
export function subscribeWatchlist(
  symbols: string[],
  oanda: OandaConfig | null,
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
  if (fx.length && oanda?.token) {
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
