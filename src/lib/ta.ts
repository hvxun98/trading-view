import type { Candle, PriceSource } from '../types'

/**
 * Các hàm tính toán kỹ thuật theo đúng cách của Pine Script (`ta.*`) trên TradingView.
 * Mỗi hàm trả về mảng cùng độ dài với đầu vào; vị trí chưa đủ dữ liệu là NaN.
 */

export function source(data: Candle[], src: PriceSource): number[] {
  switch (src) {
    case 'open':
      return data.map((c) => c.open)
    case 'high':
      return data.map((c) => c.high)
    case 'low':
      return data.map((c) => c.low)
    case 'hl2':
      return data.map((c) => (c.high + c.low) / 2)
    case 'hlc3':
      return data.map((c) => (c.high + c.low + c.close) / 3)
    case 'ohlc4':
      return data.map((c) => (c.open + c.high + c.low + c.close) / 4)
    default:
      return data.map((c) => c.close)
  }
}

/** Vị trí đầu tiên không phải NaN (các chuỗi đầu vào chỉ có NaN ở phần đầu) */
const firstValid = (x: number[]) => {
  const i = x.findIndex((v) => !Number.isNaN(v))
  return i < 0 ? x.length : i
}

/** `ta.sma` */
export function sma(x: number[], length: number): number[] {
  const out = new Array<number>(x.length).fill(NaN)
  const start = firstValid(x)
  let sum = 0
  for (let i = start; i < x.length; i++) {
    sum += x[i]
    if (i - start >= length) sum -= x[i - length]
    if (i - start >= length - 1) out[i] = sum / length
  }
  return out
}

/** Trung bình trượt hàm mũ với hệ số `alpha`, khởi tạo bằng SMA của `length` giá trị đầu (như `ta.ema` / `ta.rma`) */
function smoothed(x: number[], length: number, alpha: number): number[] {
  const out = new Array<number>(x.length).fill(NaN)
  const seed = firstValid(x) + length - 1
  if (seed >= x.length) return out
  let prev = 0
  for (let i = seed - length + 1; i <= seed; i++) prev += x[i]
  prev /= length
  out[seed] = prev
  for (let i = seed + 1; i < x.length; i++) {
    prev = alpha * x[i] + (1 - alpha) * prev
    out[i] = prev
  }
  return out
}

/** `ta.ema` */
export const ema = (x: number[], length: number) => smoothed(x, length, 2 / (length + 1))

/** `ta.rma` — trung bình Wilder (RSI, ATR) */
export const rma = (x: number[], length: number) => smoothed(x, length, 1 / length)

/** `ta.stdev` (độ lệch chuẩn tổng thể, như mặc định của TradingView) */
export function stdev(x: number[], length: number): number[] {
  const mean = sma(x, length)
  return mean.map((m, i) => {
    if (Number.isNaN(m)) return NaN
    let sum = 0
    for (let j = i - length + 1; j <= i; j++) sum += (x[j] - m) ** 2
    return Math.sqrt(sum / length)
  })
}

export function highest(x: number[], length: number): number[] {
  return x.map((_, i) => (i < length - 1 ? NaN : Math.max(...x.slice(i - length + 1, i + 1))))
}

export function lowest(x: number[], length: number): number[] {
  return x.map((_, i) => (i < length - 1 ? NaN : Math.min(...x.slice(i - length + 1, i + 1))))
}

/** `ta.rsi`: RMA của mức tăng / giảm */
export function rsi(x: number[], length: number): number[] {
  const up = x.map((v, i) => (i === 0 ? NaN : Math.max(v - x[i - 1], 0)))
  const down = x.map((v, i) => (i === 0 ? NaN : Math.max(x[i - 1] - v, 0)))
  const avgUp = rma(up, length)
  const avgDown = rma(down, length)
  return avgUp.map((u, i) => {
    const d = avgDown[i]
    if (Number.isNaN(u) || Number.isNaN(d)) return NaN
    return d === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / d)
  })
}

/** `ta.tr(true)`: true range, nến đầu tiên dùng high − low */
export function trueRange(data: Candle[]): number[] {
  return data.map((c, i) => {
    if (i === 0) return c.high - c.low
    const prev = data[i - 1].close
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev))
  })
}

export type VwapAnchor = 'session' | 'week' | 'month'

/** Kỳ neo của VWAP theo thời gian UTC: ngày, tuần (bắt đầu thứ Hai) hoặc tháng */
function anchorPeriod(time: number, anchor: VwapAnchor): number {
  const day = Math.floor(time / 86400)
  if (anchor === 'week') return Math.floor((day + 3) / 7) // 1/1/1970 là thứ Năm
  if (anchor === 'month') {
    const d = new Date(time * 1000)
    return d.getUTCFullYear() * 12 + d.getUTCMonth()
  }
  return day
}

/** `ta.vwap` neo theo phiên (ngày UTC), tuần hoặc tháng: tích luỹ giá × khối lượng từ đầu kỳ */
export function vwap(data: Candle[], x: number[], anchor: VwapAnchor = 'session'): number[] {
  let period = NaN
  let pv = 0
  let vol = 0
  return data.map((c, i) => {
    const p = anchorPeriod(c.time, anchor)
    if (p !== period) {
      period = p
      pv = 0
      vol = 0
    }
    pv += x[i] * c.volume
    vol += c.volume
    // Nguồn không có khối lượng (vd. một số dữ liệu forex): dùng chính giá nguồn
    return vol > 0 ? pv / vol : x[i]
  })
}

/** `ta.wma`: trọng số tuyến tính 1..length (nến mới nhất nặng nhất) */
export function wma(x: number[], length: number): number[] {
  const out = new Array<number>(x.length).fill(NaN)
  const start = firstValid(x)
  const norm = (length * (length + 1)) / 2
  for (let i = start + length - 1; i < x.length; i++) {
    let sum = 0
    for (let j = 0; j < length; j++) sum += x[i - j] * (length - j)
    out[i] = sum / norm
  }
  return out
}

/** `ta.vwma`: trung bình có trọng số theo khối lượng */
export function vwma(x: number[], volume: number[], length: number): number[] {
  const pv = sma(
    x.map((v, i) => v * volume[i]),
    length,
  )
  const v = sma(volume, length)
  return pv.map((p, i) => (v[i] ? p / v[i] : x[i]))
}

/** `ta.hma`: Hull Moving Average */
export function hma(x: number[], length: number): number[] {
  const half = wma(x, Math.max(1, Math.floor(length / 2)))
  const full = wma(x, length)
  return wma(
    half.map((h, i) => 2 * h - full[i]),
    Math.max(1, Math.floor(Math.sqrt(length))),
  )
}

export type MaType = 'sma' | 'ema' | 'smma' | 'wma' | 'vwma'

/** Trung bình động theo loại (input "MA Type" của TradingView) */
export function movingAverage(type: MaType, x: number[], length: number, volume: number[]): number[] {
  switch (type) {
    case 'ema':
      return ema(x, length)
    case 'smma':
      return rma(x, length)
    case 'wma':
      return wma(x, length)
    case 'vwma':
      return vwma(x, volume, length)
    default:
      return sma(x, length)
  }
}

/** `ta.sum` trượt */
export function rollingSum(x: number[], length: number): number[] {
  return sma(x, length).map((v) => v * length)
}

/** Giá trị cách đây `length` nến (`x[length]` trong Pine) */
export const lag = (x: number[], length: number) => x.map((_, i) => (i >= length ? x[i - length] : NaN))

/** Dịch chuỗi sang phải `offset` nến (âm = sang trái), như tham số `offset` của plot() */
export function shift(x: number[], offset: number): number[] {
  if (!offset) return x
  return x.map((_, i) => {
    const j = i - offset
    return j >= 0 && j < x.length ? x[j] : NaN
  })
}

/** `ta.stoch` trên một chuỗi (cao / thấp / đóng cùng là `x`) hoặc theo nến */
export function stochastic(close: number[], high: number[], low: number[], length: number): number[] {
  const hi = highest(high, length)
  const lo = lowest(low, length)
  // Giá đứng yên trong cả khoảng (cao = thấp) thì lấy 50
  return close.map((c, i) => (hi[i] === lo[i] ? 50 : (100 * (c - lo[i])) / (hi[i] - lo[i])))
}

/** `ta.cci` */
export function cci(x: number[], length: number): number[] {
  const mean = sma(x, length)
  return mean.map((m, i) => {
    if (Number.isNaN(m)) return NaN
    let dev = 0
    for (let j = i - length + 1; j <= i; j++) dev += Math.abs(x[j] - m)
    dev /= length
    return dev === 0 ? 0 : (x[i] - m) / (0.015 * dev)
  })
}

/** `ta.mfi` */
export function mfi(x: number[], volume: number[], length: number): number[] {
  const up = x.map((v, i) => (i === 0 ? NaN : v > x[i - 1] ? v * volume[i] : 0))
  const down = x.map((v, i) => (i === 0 ? NaN : v < x[i - 1] ? v * volume[i] : 0))
  const upper = rollingSum(up, length)
  const lower = rollingSum(down, length)
  return upper.map((u, i) => {
    const l = lower[i]
    if (Number.isNaN(u) || Number.isNaN(l)) return NaN
    return l === 0 ? 100 : 100 - 100 / (1 + u / l)
  })
}

/** `ta.obv` */
export function obv(close: number[], volume: number[]): number[] {
  let sum = 0
  return close.map((c, i) => {
    if (i > 0) sum += c > close[i - 1] ? volume[i] : c < close[i - 1] ? -volume[i] : 0
    return sum
  })
}

/** Chaikin Money Flow */
export function cmf(data: Candle[], length: number): number[] {
  const ad = data.map((c) =>
    c.high === c.low ? 0 : ((2 * c.close - c.low - c.high) / (c.high - c.low)) * c.volume,
  )
  const mf = rollingSum(ad, length)
  const vol = rollingSum(
    data.map((c) => c.volume),
    length,
  )
  return mf.map((m, i) => (vol[i] ? m / vol[i] : 0))
}

/** `ta.dmi`: +DI, −DI và ADX */
export function dmi(data: Candle[], diLength: number, adxSmoothing: number) {
  const plusDM = data.map((c, i) => {
    if (i === 0) return NaN
    const up = c.high - data[i - 1].high
    const down = data[i - 1].low - c.low
    return up > down && up > 0 ? up : 0
  })
  const minusDM = data.map((c, i) => {
    if (i === 0) return NaN
    const up = c.high - data[i - 1].high
    const down = data[i - 1].low - c.low
    return down > up && down > 0 ? down : 0
  })
  const tr = rma(trueRange(data).map((v, i) => (i === 0 ? NaN : v)), diLength)
  const plus = rma(plusDM, diLength).map((v, i) => (tr[i] ? (100 * v) / tr[i] : 0))
  const minus = rma(minusDM, diLength).map((v, i) => (tr[i] ? (100 * v) / tr[i] : 0))
  const dx = plus.map((p, i) => {
    const sum = p + minus[i]
    return Number.isNaN(sum) ? NaN : Math.abs(p - minus[i]) / (sum === 0 ? 1 : sum)
  })
  const adx = rma(dx, adxSmoothing).map((v) => 100 * v)
  return { plus, minus, adx }
}

/** Aroon Up / Down */
export function aroon(data: Candle[], length: number) {
  const up: number[] = []
  const down: number[] = []
  data.forEach((_, i) => {
    if (i < length) {
      up.push(NaN)
      down.push(NaN)
      return
    }
    // Số nến kể từ đỉnh / đáy cao nhất trong length + 1 nến (`ta.highestbars`)
    let hi = i
    let lo = i
    for (let j = i - length; j <= i; j++) {
      if (data[j].high >= data[hi].high) hi = j
      if (data[j].low <= data[lo].low) lo = j
    }
    up.push((100 * (length - (i - hi))) / length)
    down.push((100 * (length - (i - lo))) / length)
  })
  return { up, down }
}

/** `ta.sar`: Parabolic SAR */
export function psar(data: Candle[], start: number, increment: number, maximum: number): number[] {
  const out = new Array<number>(data.length).fill(NaN)
  if (data.length < 2) return out
  let up = data[1].close >= data[0].close
  let sar = up ? data[0].low : data[0].high
  let ep = up ? data[1].high : data[1].low
  let af = start
  out[1] = sar
  for (let i = 2; i < data.length; i++) {
    const c = data[i]
    let next = sar + af * (ep - sar)
    if (up) {
      // SAR không được vượt qua đáy của 2 nến trước
      next = Math.min(next, data[i - 1].low, data[i - 2].low)
      if (c.low < next) {
        up = false
        next = ep
        ep = c.low
        af = start
      } else if (c.high > ep) {
        ep = c.high
        af = Math.min(af + increment, maximum)
      }
    } else {
      next = Math.max(next, data[i - 1].high, data[i - 2].high)
      if (c.high > next) {
        up = true
        next = ep
        ep = c.high
        af = start
      } else if (c.low < ep) {
        ep = c.low
        af = Math.min(af + increment, maximum)
      }
    }
    sar = next
    out[i] = sar
  }
  return out
}

/** `ta.supertrend`: đường xu hướng và hướng (−1 = tăng, 1 = giảm) */
export function supertrend(data: Candle[], factor: number, atrLength: number) {
  const atr = rma(trueRange(data), atrLength)
  const line = new Array<number>(data.length).fill(NaN)
  const dir = new Array<number>(data.length).fill(NaN)
  let prevUpper = NaN
  let prevLower = NaN
  for (let i = 0; i < data.length; i++) {
    if (Number.isNaN(atr[i])) continue
    const c = data[i]
    const mid = (c.high + c.low) / 2
    let upper = mid + factor * atr[i]
    let lower = mid - factor * atr[i]
    const prevClose = i > 0 ? data[i - 1].close : c.close
    if (!Number.isNaN(prevLower) && !(lower > prevLower || prevClose < prevLower)) lower = prevLower
    if (!Number.isNaN(prevUpper) && !(upper < prevUpper || prevClose > prevUpper)) upper = prevUpper
    let d: number
    if (Number.isNaN(line[i - 1] ?? NaN)) d = 1
    else if (line[i - 1] === prevUpper) d = c.close > upper ? -1 : 1
    else d = c.close < lower ? 1 : -1
    dir[i] = d
    line[i] = d === -1 ? lower : upper
    prevUpper = upper
    prevLower = lower
  }
  return { line, dir }
}

/** Trung bình của đỉnh cao nhất và đáy thấp nhất trong `length` nến (đường của Ichimoku / Donchian) */
export function donchianMid(data: Candle[], length: number): number[] {
  const hi = highest(
    data.map((c) => c.high),
    length,
  )
  const lo = lowest(
    data.map((c) => c.low),
    length,
  )
  return hi.map((h, i) => (h + lo[i]) / 2)
}

/** Thay đổi so với nến trước (`ta.change`), nến đầu = NaN */
export const change = (x: number[]) => x.map((v, i) => (i === 0 ? NaN : v - x[i - 1]))

/** Tổng tích luỹ (`ta.cum`), bỏ qua NaN */
export function cum(x: number[]): number[] {
  let sum = 0
  return x.map((v) => (sum += Number.isFinite(v) ? v : 0))
}

/** `ta.accdist`: Accumulation / Distribution */
export function accDist(data: Candle[]): number[] {
  return cum(
    data.map((c) => (c.high === c.low ? 0 : ((2 * c.close - c.low - c.high) / (c.high - c.low)) * c.volume)),
  )
}

/** Mức khối lượng của VSA so với trung bình */
export type VsaLevel = 'ultra' | 'high' | 'normal' | 'low'

/** Tín hiệu VSA (Tom Williams). Giảm giá: UT, BC, ND; tăng giá: SC, SV, T, NS */
export type VsaSignal = 'UT' | 'BC' | 'ND' | 'SC' | 'SV' | 'T' | 'NS'
export const VSA_SIGNALS: VsaSignal[] = ['UT', 'BC', 'ND', 'SC', 'SV', 'T', 'NS']
export const VSA_BULLISH: VsaSignal[] = ['SC', 'SV', 'T', 'NS']

export interface VsaOptions {
  /** Độ dài trung bình khối lượng / biên độ / xu hướng */
  length: number
  /** Khối lượng ≥ ultra × trung bình: cực cao; ≥ high ×: cao; ≤ low ×: thấp */
  ultra: number
  high: number
  low: number
  /** Biên độ nến ≥ wide × trung bình: rộng; ≤ narrow ×: hẹp */
  wide: number
  narrow: number
}

/**
 * Volume Spread Analysis: phân loại khối lượng từng nến và nhận diện tín hiệu theo khối lượng (so với trung bình
 * và 2 nến trước), biên độ (high − low), vị trí giá đóng trong nến và xu hướng (giá so với SMA).
 * Không có định nghĩa chuẩn duy nhất; đây là các quy tắc phổ biến của Tom Williams:
 * - SC (Selling Climax): xu hướng giảm, nến giảm biên độ rộng, khối lượng cực cao, đóng cửa không ở đáy
 * - BC (Buying Climax): xu hướng tăng, nến tăng biên độ rộng, khối lượng cực cao, đóng cửa không ở đỉnh
 * - UT (Upthrust): vượt đỉnh nến trước nhưng đóng cửa ở 30% dưới, khối lượng và biên độ trên trung bình
 * - SV (Stopping Volume): xu hướng giảm, nến giảm khối lượng cao, đóng cửa ở nửa trên
 * - T (Test): xuống thấp hơn đáy trước nhưng đóng cửa ở 30% trên, khối lượng thấp hơn trung bình và 2 nến trước
 * - ND (No Demand): nến tăng biên độ hẹp, khối lượng thấp hơn 2 nến trước
 * - NS (No Supply): nến giảm biên độ hẹp, khối lượng thấp hơn 2 nến trước
 */
export function vsa(data: Candle[], o: VsaOptions) {
  const vol = data.map((c) => c.volume)
  const spread = data.map((c) => c.high - c.low)
  const avgVol = sma(vol, o.length)
  const avgSpread = sma(spread, o.length)
  const trend = sma(
    data.map((c) => c.close),
    o.length,
  )
  const levels: VsaLevel[] = []
  const signals: (VsaSignal | null)[] = []
  data.forEach((c, i) => {
    const ratio = avgVol[i] > 0 ? vol[i] / avgVol[i] : NaN
    levels.push(ratio >= o.ultra ? 'ultra' : ratio >= o.high ? 'high' : ratio <= o.low ? 'low' : 'normal')
    if (i < 2 || !(ratio >= 0) || !(avgSpread[i] > 0) || Number.isNaN(trend[i - 1])) {
      signals.push(null)
      return
    }
    const prev = data[i - 1]
    const up = c.close > prev.close
    const down = c.close < prev.close
    const sr = spread[i] / avgSpread[i]
    const wide = sr >= o.wide
    const narrow = sr <= o.narrow
    // Vị trí giá đóng trong nến: 0 = đáy, 1 = đỉnh
    const cp = spread[i] ? (c.close - c.low) / spread[i] : 0.5
    const upTrend = prev.close > trend[i - 1]
    const downTrend = prev.close < trend[i - 1]
    const lowerThan2 = vol[i] < vol[i - 1] && vol[i] < vol[i - 2]
    let s: VsaSignal | null = null
    if (down && downTrend && ratio >= o.ultra && wide && cp >= 0.3) s = 'SC'
    else if (up && upTrend && ratio >= o.ultra && wide && cp <= 0.7) s = 'BC'
    else if (c.high > prev.high && cp <= 0.3 && ratio >= 1 && sr >= 1) s = 'UT'
    else if (down && downTrend && ratio >= o.high && cp >= 0.5) s = 'SV'
    else if (c.low < prev.low && cp >= 0.7 && ratio < 1 && lowerThan2) s = 'T'
    else if (up && narrow && lowerThan2) s = 'ND'
    else if (down && narrow && lowerThan2) s = 'NS'
    signals.push(s)
  })
  return { levels, signals, avgVol }
}
