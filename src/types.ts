import type { UTCTimestamp } from 'lightweight-charts'

export interface Candle {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '3d' | '1w' | '1M'

export type ReplayMode = 'off' | 'selecting' | 'active'

export interface Ticker {
  symbol: string
  last: number
  open: number
}

/**
 * Nguồn dữ liệu có thể thay thế (Binance, server riêng, mock...).
 * Tương tự ý tưởng "Datafeed API" của TradingView Charting Library.
 */
export interface DataFeed {
  name: string
  getHistory(symbol: string, interval: Interval, endTime?: number, limit?: number): Promise<Candle[]>
  subscribeBars(symbol: string, interval: Interval, onBar: (bar: Candle) => void): () => void
}

export type DrawingTool = 'trendline' | 'ray' | 'hline' | 'vline' | 'rect' | 'fib'
export type Tool = 'cursor' | DrawingTool

/** Điểm neo của hình vẽ: thời gian (giây, có thể là phần lẻ / tương lai) + giá */
export interface AnchorPoint {
  time: number
  price: number
}

export interface Drawing {
  id: string
  type: DrawingTool
  /** 1 điểm cho hline/vline, 2 điểm cho các loại còn lại */
  points: AnchorPoint[]
}
