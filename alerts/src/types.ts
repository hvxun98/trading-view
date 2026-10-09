/** Nến đã đóng; `time` là thời điểm mở nến (giây, UTC) */
export interface Bar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type Side = 'long' | 'short'
export type Timeframe = '5m' | '15m' | '30m' | '1h' | '4h' | '1d'
export type SymbolId = 'BTCUSDT' | 'ETHUSDT' | 'XAUUSD' | 'XAGUSD'
export type Session = 'asia' | 'london' | 'newyork'
export type MovingAverage = 'ema' | 'sma'
export type Pattern = 'engulfing' | 'pin_bar' | 'inside_bar_break'

/** Vùng / mức giá (hỗ trợ, kháng cự) cho điều kiện `level` */
export interface PriceLevel {
  /** Một mức giá, hoặc một vùng [from, to] */
  price?: number
  from?: number
  to?: number
  /** support: tìm Buy khi chạm, resistance: tìm Sell, both: cả hai */
  kind: 'support' | 'resistance' | 'both'
  label?: string
}

interface RuleBase {
  /** Trọng số khi chấm điểm (mặc định 1) */
  weight?: number
  /** Bắt buộc: không đạt thì chiều đó bị loại dù điểm cao */
  required?: boolean
  /** Khung thời gian của điều kiện (mặc định: khung của chiến lược), vd. xét xu hướng ở H4 */
  tf?: Timeframe
}

export type Rule = RuleBase &
  (
    | { type: 'trend'; ma: MovingAverage; period: number }
    | { type: 'ma_cross'; ma: MovingAverage; fast: number; slow: number; within: number }
    | { type: 'pullback'; ma: MovingAverage; period: number; toleranceAtr: number }
    | { type: 'rsi'; period: number; longBelow?: number; shortAbove?: number }
    | { type: 'breakout'; lookback: number }
    | { type: 'pattern'; patterns: Pattern[] }
    | { type: 'volume_spike'; period: number; mult: number }
    | { type: 'macd'; fast: number; slow: number; signal: number }
    | { type: 'level'; levels: Partial<Record<SymbolId, PriceLevel[]>>; toleranceAtr: number }
  )

export interface Strategy {
  id: string
  name: string
  enabled?: boolean
  symbols: SymbolId[]
  timeframe: Timeframe
  /** Chỉ tìm một chiều (mặc định cả Buy và Sell) */
  sides?: Side[]
  /** Chỉ báo trong các phiên này (giờ UTC); bỏ trống = mọi lúc */
  sessions?: Session[]
  rules: Rule[]
  alert: {
    /** Tỉ lệ điểm tối thiểu để báo "theo dõi" (0..1) */
    watchAt: number
    /** Tỉ lệ điểm tối thiểu để báo "gợi ý vào lệnh" (0..1) */
    entryAt: number
    /** Không báo lại cùng mã + chiến lược + chiều trong khoảng này (phút), trừ khi nâng từ theo dõi lên vào lệnh */
    cooldownMinutes: number
  }
  risk: {
    sl: { type: 'atr'; period: number; mult: number } | { type: 'swing'; lookback: number; bufferAtr: number }
    /** Các mức chốt lời theo bội số rủi ro, vd. [1.5, 3] */
    rr: number[]
  }
}

export interface Check {
  label: string
  pass: boolean
  weight: number
  required: boolean
}

export type SignalLevel = 'watch' | 'entry'

export interface Signal {
  strategyId: string
  strategyName: string
  symbol: SymbolId
  timeframe: Timeframe
  side: Side
  level: SignalLevel
  /** Điểm đạt / tổng điểm */
  score: number
  total: number
  /** Thời điểm mở nến tín hiệu (giây, UTC) */
  barTime: number
  entry: number
  sl: number
  tp: number[]
  checks: Check[]
  source: string
}
