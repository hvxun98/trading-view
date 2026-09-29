/** Loại mã: dùng cho các tab trong hộp thoại tìm mã (như TradingView) */
export type SymbolType = 'crypto' | 'forex' | 'commodity'

export interface SymbolInfo {
  /** Mã hiển thị & lưu trữ, vd. "BTCUSDT", "XAUUSD" */
  symbol: string
  description: string
  exchange: string
  type: SymbolType
  provider: 'binance' | 'oanda'
  /** Mã phía nhà cung cấp, vd. "XAU_USD" của OANDA */
  providerSymbol: string
  /** Mã tương ứng trên Dukascopy (nguồn forex / kim loại miễn phí), vd. "XAU/USD" */
  dukascopySymbol?: string
  /** Số chữ số thập phân khi hiển thị giá (theo sàn) */
  precision?: number
  /** Giá tham khảo cho dữ liệu Demo khi không kết nối được nguồn thật */
  mockPrice?: number
}

/** Forex & kim loại quý từ OANDA (mã giống TradingView: OANDA:XAUUSD, OANDA:EURUSD…) */
const OANDA: [string, string, SymbolType, number, number][] = [
  ['XAU_USD', 'Gold Spot / U.S. Dollar', 'commodity', 2, 3300],
  ['XAG_USD', 'Silver Spot / U.S. Dollar', 'commodity', 3, 33],
  ['XPT_USD', 'Platinum Spot / U.S. Dollar', 'commodity', 2, 1000],
  ['XPD_USD', 'Palladium Spot / U.S. Dollar', 'commodity', 2, 1000],
  ['EUR_USD', 'Euro / U.S. Dollar', 'forex', 5, 1.08],
  ['GBP_USD', 'British Pound / U.S. Dollar', 'forex', 5, 1.27],
  ['USD_JPY', 'U.S. Dollar / Japanese Yen', 'forex', 3, 150],
  ['AUD_USD', 'Australian Dollar / U.S. Dollar', 'forex', 5, 0.66],
  ['USD_CAD', 'U.S. Dollar / Canadian Dollar', 'forex', 5, 1.36],
  ['USD_CHF', 'U.S. Dollar / Swiss Franc', 'forex', 5, 0.88],
  ['NZD_USD', 'New Zealand Dollar / U.S. Dollar', 'forex', 5, 0.6],
  ['EUR_JPY', 'Euro / Japanese Yen', 'forex', 3, 162],
  ['GBP_JPY', 'British Pound / Japanese Yen', 'forex', 3, 190],
  ['EUR_GBP', 'Euro / British Pound', 'forex', 5, 0.85],
]

export const OANDA_SYMBOLS: SymbolInfo[] = OANDA.map(([id, description, type, precision, mockPrice]) => ({
  symbol: id.replace('_', ''),
  description,
  exchange: 'OANDA',
  type,
  provider: 'oanda',
  providerSymbol: id,
  precision,
  mockPrice,
  // Dukascopy đặt tên bạch kim / palladium là "XPT.CMD/USD", "XPD.CMD/USD"
  dukascopySymbol: id.startsWith('XPT') || id.startsWith('XPD') ? id.replace('_', '.CMD/') : id.replace('_', '/'),
}))

/** Đồng định giá phổ biến trên Binance — dùng để tách base/quote từ mã (BTCUSDT -> BTC / USDT) */
const QUOTES = ['FDUSD', 'USDT', 'USDC', 'TUSD', 'BUSD', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY', 'BRL', 'JPY', 'DAI']

export function cryptoInfo(symbol: string): SymbolInfo {
  const quote = QUOTES.find((q) => symbol.endsWith(q) && symbol.length > q.length)
  const base = quote ? symbol.slice(0, -quote.length) : symbol
  return {
    symbol,
    description: quote ? `${base} / ${quote}` : symbol,
    exchange: 'Binance',
    type: 'crypto',
    provider: 'binance',
    providerSymbol: symbol,
  }
}

/** Danh sách dự phòng khi không tải được danh mục đầy đủ từ Binance */
const CRYPTO_FALLBACK = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT',
  'DOTUSDT', 'TRXUSDT', 'TONUSDT', 'LTCUSDT', 'BCHUSDT', 'NEARUSDT', 'UNIUSDT', 'APTUSDT', 'ARBUSDT',
  'OPUSDT', 'SUIUSDT', 'PEPEUSDT', 'SHIBUSDT', 'ATOMUSDT', 'FILUSDT', 'ETCUSDT', 'PAXGUSDT', 'ETHBTC',
]

/** Danh sách phổ biến dựng sẵn — hiện ngay trong lúc chờ tải danh mục đầy đủ */
export function cryptoFallback(): SymbolInfo[] {
  return CRYPTO_FALLBACK.map(cryptoInfo)
}

/** Tên nguồn dữ liệu thực tế của mã (forex / kim loại: MT5 nếu bật bridge, OANDA nếu có token, không thì Dukascopy) */
export function sourceName(info: SymbolInfo, sources: { oanda: { token: string } | null; mt5: object | null }): string {
  if (info.provider === 'binance') return 'Binance'
  if (sources.mt5) return 'MT5'
  return sources.oanda?.token ? 'OANDA' : 'Dukascopy'
}

export function getSymbolInfo(symbol: string): SymbolInfo {
  return OANDA_SYMBOLS.find((s) => s.symbol === symbol) ?? cryptoInfo(symbol)
}

let cryptoCache: SymbolInfo[] | null = null

/**
 * Toàn bộ cặp đang giao dịch trên Binance (lấy từ /ticker/price: nhẹ hơn nhiều so với exchangeInfo).
 * Không tải được thì dùng danh sách dự phòng.
 */
export async function loadCryptoCatalog(): Promise<SymbolInfo[]> {
  if (cryptoCache) return cryptoCache
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price')
    if (!res.ok) throw new Error(`Binance ${res.status}`)
    const rows = (await res.json()) as { symbol: string }[]
    cryptoCache = rows.map((r) => cryptoInfo(r.symbol))
  } catch {
    cryptoCache = cryptoFallback()
  }
  return cryptoCache
}

export const DEFAULT_WATCHLIST = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'XAUUSD',
  'XAGUSD',
  'EURUSD',
]
