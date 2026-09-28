import type { DataFeed, Ticker } from '../types'
import { binanceFeed, fetchTickers, subscribeTickers } from './binance'
import { getSymbolInfo } from './catalog'
import { mockFeed } from './mock'
import { makeOandaFeed, subscribeOandaTickers, type OandaConfig } from './oanda'

/**
 * Vàng không có trên Binance Spot: khi chưa cấu hình OANDA, XAUUSD dùng PAXG/USDT
 * (token được bảo chứng 1:1 bằng 1 ounce vàng, bám sát giá vàng) làm nguồn thay thế.
 */
const PROXIES: Record<string, string> = { XAUUSD: 'PAXGUSDT' }

function proxyFeed(proxy: string): DataFeed {
  return {
    name: `Binance ${proxy.replace('USDT', '')} (proxy)`,
    getHistory: (_s, interval, endTime, limit) => binanceFeed.getHistory(proxy, interval, endTime, limit),
    subscribeBars: (_s, interval, onBar) => binanceFeed.subscribeBars(proxy, interval, onBar),
  }
}

/** Các nguồn dữ liệu cho một mã, theo thứ tự ưu tiên; mockFeed luôn là phương án cuối */
export function feedsFor(symbol: string, oanda: OandaConfig | null): DataFeed[] {
  const info = getSymbolInfo(symbol)
  if (info.provider === 'binance') return [binanceFeed, mockFeed]
  const feeds: DataFeed[] = []
  if (oanda?.token) feeds.push(makeOandaFeed(oanda, info.providerSymbol))
  if (PROXIES[symbol]) feeds.push(proxyFeed(PROXIES[symbol]))
  feeds.push(mockFeed)
  return feeds
}

/** Giá realtime cho Watchlist: gom mã Binance vào 1 WebSocket, mã OANDA hỏi định kỳ */
export function subscribeWatchlist(
  symbols: string[],
  oanda: OandaConfig | null,
  onTicker: (t: Ticker) => void,
): () => void {
  const infos = symbols.map(getSymbolInfo)
  const unsubs: (() => void)[] = []

  // Mã Binance + mã dùng proxy (nhận giá của proxy nhưng hiển thị dưới tên gốc)
  const binance = new Map<string, string>() // mã Binance -> mã hiển thị
  for (const info of infos) {
    if (info.provider === 'binance') binance.set(info.symbol, info.symbol)
    else if (!oanda?.token && PROXIES[info.symbol]) binance.set(PROXIES[info.symbol], info.symbol)
  }
  if (binance.size) {
    const relay = (t: Ticker) => {
      const shown = binance.get(t.symbol)
      if (shown) onTicker({ ...t, symbol: shown })
    }
    const list = [...binance.keys()]
    fetchTickers(list)
      .then((rows) => rows.forEach(relay))
      .catch(() => {})
    unsubs.push(subscribeTickers(list, relay))
  }

  const oandaItems = infos
    .filter((i) => i.provider === 'oanda' && oanda?.token)
    .map((i) => ({ symbol: i.symbol, instrument: i.providerSymbol }))
  if (oanda?.token && oandaItems.length) unsubs.push(subscribeOandaTickers(oanda, oandaItems, onTicker))

  return () => unsubs.forEach((u) => u())
}
