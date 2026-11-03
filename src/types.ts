import type { UTCTimestamp } from 'lightweight-charts'

export interface Candle {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type Interval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '3d' | '1w' | '1M'

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
  /** Đòn bẩy: nếu có, S.Lg bị giới hạn bởi vốn × đòn bẩy / giá; null = không giới hạn */
  leverage: number | null
  /** Luôn hiện nhãn thống kê (mặc định chỉ hiện khi rê chuột / đang chọn) */
  alwaysShowStats: boolean
}

export type IndicatorType =
  // Trung bình động
  | 'ma'
  | 'ema'
  | 'wma'
  | 'smma'
  | 'hma'
  | 'vwma'
  // Xu hướng / kênh giá (trên chart giá)
  | 'bb'
  | 'keltner'
  | 'donchian'
  | 'envelope'
  | 'ichimoku'
  | 'psar'
  | 'supertrend'
  | 'vwap'
  // Dao động (pane riêng)
  | 'rsi'
  | 'macd'
  | 'stoch'
  | 'stochrsi'
  | 'cci'
  | 'willr'
  | 'mom'
  | 'roc'
  | 'ao'
  | 'dmi'
  | 'aroon'
  | 'atr'
  | 'bbpct'
  | 'bbw'
  | 'obv'
  | 'mfi'
  | 'cmf'
  // Khối lượng
  | 'volume'
  | 'vsa'
  | 'ad'
  | 'vo'
  | 'pvt'
  | 'efi'
  | 'eom'
  | 'klinger'

/** Nguồn giá đầu vào của chỉ báo (như input "Source" của TradingView) */
export type PriceSource = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4'

export type InputValue = number | string | boolean

/** Kiểu vẽ một đường của chỉ báo (Style → Plot type) */
export type PlotType = 'line' | 'step' | 'histogram' | 'circles'

export interface PlotStyle {
  /** Màu CSS (hex hoặc rgba khi có độ trong suốt) */
  color: string
  lineWidth: number
  lineStyle: LineStyleName
  plotType: PlotType
  visible: boolean
}

/** Đường mức ngang (vd. RSI 70 / 50 / 30) */
export interface LevelStyle {
  price: number
  color: string
  lineStyle: LineStyleName
  visible: boolean
}

/** Màu nền giữa hai đường / hai mức; color2 cho phần "dưới" (vd. mây Ichimoku giảm) */
export interface FillStyle {
  color: string
  color2?: string
  visible: boolean
}

/** Nhóm khung thời gian của tab Visibility */
export type IntervalGroup = 'minutes' | 'hours' | 'days' | 'weeks' | 'months'

/** Cài đặt có thể lưu làm mặc định cho một loại chỉ báo */
export interface IndicatorSettings {
  /** Chỉ lưu phần khác mặc định */
  inputs?: Record<string, InputValue>
  /** Kiểu từng đường vẽ (theo key của plot), chỉ lưu phần khác mặc định */
  styles?: Record<string, Partial<PlotStyle>>
  /** Danh sách mức ngang (cả danh sách khi đã sửa) */
  levels?: LevelStyle[]
  fills?: Record<string, Partial<FillStyle>>
  /** Số lẻ; undefined = mặc định của chỉ báo */
  precision?: number
  /** Nhãn giá trị cuối trên trục giá (mặc định bật) */
  priceLabels?: boolean
  /** Giá trị trên legend (mặc định bật) */
  showValues?: boolean
  /** Tham số trên legend (mặc định bật) */
  showInputs?: boolean
  /** Hiện trên các nhóm khung thời gian (mặc định tất cả) */
  visibility?: Partial<Record<IntervalGroup, boolean>>
}

/** Một chỉ báo trên biểu đồ (có thể thêm nhiều chỉ báo cùng loại với tham số khác nhau) */
export interface Indicator extends IndicatorSettings {
  id: string
  type: IndicatorType
  hidden?: boolean
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
