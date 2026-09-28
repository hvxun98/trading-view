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

export type Lang = 'en' | 'vi'

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

export type DrawingTool =
  | 'trendline'
  | 'ray'
  | 'hline'
  | 'vline'
  | 'rect'
  | 'fib'
  | 'long'
  | 'short'
  | 'text'
  | 'note'
  | 'callout'
  | 'comment'
/** 'measure' là thước đo tạm thời, không lưu thành hình vẽ */
export type Tool = 'cursor' | 'measure' | DrawingTool

/** Điểm neo của hình vẽ: thời gian (giây, có thể là phần lẻ / tương lai) + giá */
export interface AnchorPoint {
  time: number
  price: number
}

export type LineStyleName = 'solid' | 'dashed' | 'dotted'

export interface DrawingStyle {
  color: string
  lineWidth: number
  lineStyle: LineStyleName
  fontSize: number
}

/** Tham số của Long/Short Position (hộp thoại Settings như TradingView) */
export interface PositionSettings {
  accountSize: number
  lotSize: number
  risk: number
  riskUnit: 'percent' | 'currency'
  /** Đòn bẩy (1 = không đòn bẩy): giới hạn số lượng theo vốn */
  leverage: number
  /** Luôn hiện nhãn thống kê (mặc định chỉ hiện khi rê chuột / đang chọn) */
  alwaysShowStats: boolean
}

export interface Drawing {
  id: string
  type: DrawingTool
  /**
   * hline/vline/text/note: 1 điểm; long/short: [entry, target, stop] (target/stop mang thời gian
   * mép phải); callout: [điểm được chỉ, vị trí hộp chữ]; còn lại: 2 điểm
   */
  points: AnchorPoint[]
  /** Nội dung cho text / note / callout / comment */
  text?: string
  /** Chỉ cho long / short */
  position?: Partial<PositionSettings>
  /** Chỉ lưu phần khác mặc định; hình cũ không có style vẫn hiển thị đúng */
  style?: Partial<DrawingStyle>
  locked?: boolean
  hidden?: boolean
}
