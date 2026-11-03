import { en } from '../i18n/en'
import type { TFunction, TKey } from '../i18n'
import type {
  Candle,
  FillStyle,
  Indicator,
  IndicatorType,
  InputValue,
  Interval,
  IntervalGroup,
  LevelStyle,
  LineStyleName,
  PlotStyle,
  PlotType,
  PriceSource,
} from '../types'
import { formatVolume } from './intervals'
import * as ta from './ta'

export const PRICE_SOURCES: PriceSource[] = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4']

export type IndicatorCategory = 'ma' | 'trend' | 'oscillator' | 'volatility' | 'volume'
export const CATEGORIES: IndicatorCategory[] = ['ma', 'trend', 'oscillator', 'volatility', 'volume']

/** Nhãn: key i18n (vd. 'input.length') hoặc chữ giữ nguyên mọi ngôn ngữ (vd. 'SMA', '%K') */
export type Label = TKey | (string & {})

export const label = (t: TFunction, s: Label) => (s in en ? t(s as TKey) : s)

export interface InputDef {
  key: string
  label: Label
  kind: 'int' | 'float' | 'source' | 'select' | 'bool'
  default: InputValue
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: Label }[]
  /** false: không ghi trên legend (tham số phụ, như TradingView) */
  legend?: boolean
}

export interface PlotDef {
  key: string
  label: Label
  color: string
  lineWidth?: number
  type?: PlotType
  lineStyle?: LineStyleName
  /** Màu từng điểm theo giá trị hiện tại và trước đó (histogram MACD / AO); khi có thì không đổi màu được */
  barColor?: (value: number, prev: number) => string
  /** Tắt hẳn đường này theo tham số (vd. MA của RSI khi chọn MA Type = None) */
  disabled?: (inputs: Inputs) => boolean
  /** Chỉ có giá trị ở một số nến (vd. cột khối lượng theo từng mức của VSA): legend bỏ qua khi không có giá trị */
  sparse?: boolean
}

/** Ký hiệu tín hiệu vẽ trên pane của chỉ báo (vd. "ND", "SV" của VSA) */
export interface IndicatorMarker {
  index: number
  text: string
  bullish: boolean
}

/** Tô nền giữa hai plot hoặc hai mức ngang (theo chỉ số trong danh sách mức) */
export interface FillDef {
  key: string
  label: Label
  between: { plots: [string, string] } | { levels: [number, number] }
  color: string
  /** Màu khi đường thứ nhất nằm dưới đường thứ hai (mây Ichimoku) */
  color2?: string
}

export type Inputs = Record<string, InputValue>
/** Giá trị từng plot, cùng độ dài với dữ liệu nến (NaN = chưa đủ dữ liệu / không vẽ) */
export type PlotValues = Record<string, number[]>

export interface IndicatorDef {
  type: IndicatorType
  /** Tên ngắn trên legend (giống nhau mọi ngôn ngữ, như TradingView) */
  short: string
  name: TKey
  category: IndicatorCategory
  /** true: vẽ trên chart giá; false: pane riêng bên dưới */
  overlay: boolean
  inputs: InputDef[]
  plots: PlotDef[]
  /** Số lẻ của giá trị; 'price' = theo giá của mã; 'volume' = định dạng khối lượng (1.2M) */
  precision: 'price' | 'volume' | number
  levels?: LevelStyle[]
  fills?: FillDef[]
  /** Giá trị ở các nến cũ thay đổi khi có nến mới (vd. Chikou của Ichimoku) -> vẽ lại toàn bộ thay vì nến cuối */
  repaints?: boolean
  /** Tín hiệu vẽ thành ký hiệu phía trên giá trị `markers.anchor` (một khoá trong kết quả compute) */
  markers?: { anchor: string; list: (values: PlotValues, inputs: Inputs) => IndicatorMarker[] }
  /** Giải thích hiện trong tab Inputs của Settings */
  help?: TKey
  compute: (data: Candle[], inputs: Inputs) => PlotValues
}

// ---------- Tham số dùng chung ----------

const MA_OPTIONS = [
  { value: 'sma', label: 'SMA' },
  { value: 'ema', label: 'EMA' },
  { value: 'smma', label: 'SMMA (RMA)' },
  { value: 'wma', label: 'WMA' },
  { value: 'vwma', label: 'VWMA' },
]

const length = (def: number, key = 'length', lbl: Label = 'input.length'): InputDef => ({
  key,
  label: lbl,
  kind: 'int',
  default: def,
  min: 1,
  max: 2000,
})
const source = (def: PriceSource = 'close'): InputDef => ({ key: 'source', label: 'input.source', kind: 'source', default: def })
const offset: InputDef = { key: 'offset', label: 'input.offset', kind: 'int', default: 0, min: -500, max: 500, legend: false }
const mult = (def: number, lbl: Label = 'input.mult'): InputDef => ({
  key: 'mult',
  label: lbl,
  kind: 'float',
  default: def,
  min: 0.001,
  step: 0.1,
})
const maType = (key: string, lbl: Label, def: string, extra: { value: string; label: Label }[] = []): InputDef => ({
  key,
  label: lbl,
  kind: 'select',
  default: def,
  options: [...extra, ...MA_OPTIONS],
  legend: false,
})

const GRAY = '#787b86'
const level = (price: number, lineStyle: LineStyleName = 'dashed', color = GRAY): LevelStyle => ({
  price,
  color,
  lineStyle,
  visible: true,
})
/** Ba mức trên / giữa / dưới và nền giữa mức trên và dưới (RSI, Stoch, MFI…) */
const bandLevels = (high: number, mid: number, low: number) => [level(high), level(mid, 'dotted'), level(low)]
const bandFill = (color: string): FillDef => ({ key: 'background', label: 'fill.background', between: { levels: [0, 2] }, color })
const channelFill = (color = 'rgba(33, 150, 243, 0.05)'): FillDef => ({
  key: 'background',
  label: 'fill.background',
  between: { plots: ['upper', 'lower'] },
  color,
})

// Đọc tham số theo kiểu
const n = (inputs: Inputs, key: string) => inputs[key] as number
const s = (inputs: Inputs, key: string) => inputs[key] as string
const src = (data: Candle[], inputs: Inputs) => ta.source(data, s(inputs, 'source') as PriceSource)
const vol = (data: Candle[]) => data.map((c) => c.volume)
const highs = (data: Candle[]) => data.map((c) => c.high)
const lows = (data: Candle[]) => data.map((c) => c.low)
const closes = (data: Candle[]) => data.map((c) => c.close)

/** Trung bình động một đường (MA, EMA, WMA…) */
function movingAverageDef(
  type: IndicatorType,
  short: string,
  name: TKey,
  color: string,
  len: number,
  calc: (x: number[], length: number, data: Candle[]) => number[],
): IndicatorDef {
  return {
    type,
    short,
    name,
    category: 'ma',
    overlay: true,
    inputs: [length(len), source(), offset],
    plots: [{ key: 'ma', label: short, color }],
    precision: 'price',
    compute: (data, inputs) => ({ ma: calc(src(data, inputs), n(inputs, 'length'), data) }),
  }
}

// ---------- Danh sách chỉ báo ----------

export const INDICATORS: IndicatorDef[] = [
  movingAverageDef('ma', 'MA', 'ind.ma', '#2962ff', 9, ta.sma),
  movingAverageDef('ema', 'EMA', 'ind.ema', '#ff9800', 9, ta.ema),
  movingAverageDef('wma', 'WMA', 'ind.wma', '#e91e63', 9, ta.wma),
  movingAverageDef('smma', 'SMMA', 'ind.smma', '#673ab7', 7, ta.rma),
  movingAverageDef('hma', 'HMA', 'ind.hma', '#00bcd4', 9, ta.hma),
  movingAverageDef('vwma', 'VWMA', 'ind.vwma', '#4caf50', 20, (x, len, data) => ta.vwma(x, vol(data), len)),

  {
    type: 'bb',
    short: 'BB',
    name: 'ind.bb',
    category: 'volatility',
    overlay: true,
    inputs: [length(20), maType('maType', 'input.basisMaType', 'sma'), source(), mult(2, 'input.stdDev'), offset],
    plots: [
      { key: 'basis', label: 'plot.basis', color: '#ff6d00' },
      { key: 'upper', label: 'plot.upper', color: '#2962ff' },
      { key: 'lower', label: 'plot.lower', color: '#2962ff' },
    ],
    fills: [channelFill()],
    precision: 'price',
    compute: (data, inputs) => {
      const x = src(data, inputs)
      const len = n(inputs, 'length')
      const basis = ta.movingAverage(s(inputs, 'maType') as ta.MaType, x, len, vol(data))
      const dev = ta.stdev(x, len).map((d) => d * n(inputs, 'mult'))
      return { basis, upper: basis.map((b, i) => b + dev[i]), lower: basis.map((b, i) => b - dev[i]) }
    },
  },
  {
    type: 'keltner',
    short: 'KC',
    name: 'ind.keltner',
    category: 'volatility',
    overlay: true,
    inputs: [
      length(20),
      mult(2),
      source(),
      { key: 'useEma', label: 'input.useEma', kind: 'bool', default: true },
      {
        key: 'bandsStyle',
        label: 'input.bandsStyle',
        kind: 'select',
        default: 'atr',
        options: [
          { value: 'atr', label: 'input.bandsAtr' },
          { value: 'tr', label: 'input.bandsTr' },
          { value: 'range', label: 'input.bandsRange' },
        ],
        legend: false,
      },
      length(10, 'atrLength', 'input.atrLength'),
    ],
    plots: [
      { key: 'upper', label: 'plot.upper', color: '#2962ff' },
      { key: 'basis', label: 'plot.basis', color: '#2962ff' },
      { key: 'lower', label: 'plot.lower', color: '#2962ff' },
    ],
    fills: [channelFill()],
    precision: 'price',
    compute: (data, inputs) => {
      const x = src(data, inputs)
      const len = n(inputs, 'length')
      const basis = inputs.useEma ? ta.ema(x, len) : ta.sma(x, len)
      const style = s(inputs, 'bandsStyle')
      const range =
        style === 'tr'
          ? ta.trueRange(data)
          : style === 'range'
            ? ta.rma(
                data.map((c) => c.high - c.low),
                len,
              )
            : ta.rma(ta.trueRange(data), n(inputs, 'atrLength'))
      const m = n(inputs, 'mult')
      return {
        upper: basis.map((b, i) => b + range[i] * m),
        basis,
        lower: basis.map((b, i) => b - range[i] * m),
      }
    },
  },
  {
    type: 'donchian',
    short: 'DC',
    name: 'ind.donchian',
    category: 'volatility',
    overlay: true,
    inputs: [length(20), offset],
    plots: [
      { key: 'upper', label: 'plot.upper', color: '#2962ff' },
      { key: 'basis', label: 'plot.basis', color: '#ff6d00' },
      { key: 'lower', label: 'plot.lower', color: '#2962ff' },
    ],
    fills: [channelFill()],
    precision: 'price',
    compute: (data, inputs) => {
      const len = n(inputs, 'length')
      const upper = ta.highest(highs(data), len)
      const lower = ta.lowest(lows(data), len)
      return { upper, basis: upper.map((u, i) => (u + lower[i]) / 2), lower }
    },
  },
  {
    type: 'envelope',
    short: 'Env',
    name: 'ind.envelope',
    category: 'volatility',
    overlay: true,
    inputs: [
      length(20),
      { key: 'percent', label: 'input.percent', kind: 'float', default: 10, min: 0, step: 0.5 },
      source(),
      { key: 'exponential', label: 'input.exponential', kind: 'bool', default: false },
    ],
    plots: [
      { key: 'basis', label: 'plot.basis', color: '#ff6d00' },
      { key: 'upper', label: 'plot.upper', color: '#2962ff' },
      { key: 'lower', label: 'plot.lower', color: '#2962ff' },
    ],
    fills: [channelFill()],
    precision: 'price',
    compute: (data, inputs) => {
      const x = src(data, inputs)
      const len = n(inputs, 'length')
      const basis = inputs.exponential ? ta.ema(x, len) : ta.sma(x, len)
      const k = n(inputs, 'percent') / 100
      return { basis, upper: basis.map((b) => b * (1 + k)), lower: basis.map((b) => b * (1 - k)) }
    },
  },
  {
    type: 'ichimoku',
    short: 'Ichimoku',
    name: 'ind.ichimoku',
    category: 'trend',
    overlay: true,
    inputs: [
      length(9, 'conversion', 'input.conversion'),
      length(26, 'base', 'input.base'),
      length(52, 'spanB', 'input.spanB'),
      length(26, 'displacement', 'input.displacement'),
    ],
    plots: [
      { key: 'conversion', label: 'plot.conversion', color: '#2962ff' },
      { key: 'base', label: 'plot.baseLine', color: '#b71c1c' },
      { key: 'lagging', label: 'plot.lagging', color: '#43a047' },
      { key: 'leadA', label: 'plot.leadA', color: '#a5d6a7' },
      { key: 'leadB', label: 'plot.leadB', color: '#ef9a9a' },
    ],
    fills: [
      {
        key: 'cloud',
        label: 'fill.cloud',
        between: { plots: ['leadA', 'leadB'] },
        color: 'rgba(67, 160, 71, 0.1)',
        color2: 'rgba(244, 67, 54, 0.1)',
      },
    ],
    precision: 'price',
    repaints: true,
    compute: (data, inputs) => {
      const conversion = ta.donchianMid(data, n(inputs, 'conversion'))
      const base = ta.donchianMid(data, n(inputs, 'base'))
      const shiftBy = n(inputs, 'displacement') - 1
      // Mây vẽ lệch về sau displacement − 1 nến; Chikou (giá đóng) lệch về trước.
      // Phần mây vượt quá nến cuối (tương lai) không vẽ được vì trục thời gian chỉ có các nến đã có.
      return {
        conversion,
        base,
        lagging: ta.shift(closes(data), -shiftBy),
        leadA: ta.shift(
          conversion.map((c, i) => (c + base[i]) / 2),
          shiftBy,
        ),
        leadB: ta.shift(ta.donchianMid(data, n(inputs, 'spanB')), shiftBy),
      }
    },
  },
  {
    type: 'psar',
    short: 'SAR',
    name: 'ind.psar',
    category: 'trend',
    overlay: true,
    inputs: [
      { key: 'start', label: 'input.start', kind: 'float', default: 0.02, min: 0.001, step: 0.01 },
      { key: 'increment', label: 'input.increment', kind: 'float', default: 0.02, min: 0.001, step: 0.01 },
      { key: 'maximum', label: 'input.maximum', kind: 'float', default: 0.2, min: 0.001, step: 0.01 },
    ],
    plots: [{ key: 'sar', label: 'SAR', color: '#2962ff', type: 'circles' }],
    precision: 'price',
    compute: (data, inputs) => ({
      sar: ta.psar(data, n(inputs, 'start'), n(inputs, 'increment'), n(inputs, 'maximum')),
    }),
  },
  {
    type: 'supertrend',
    short: 'Supertrend',
    name: 'ind.supertrend',
    category: 'trend',
    overlay: true,
    inputs: [length(10, 'atrLength', 'input.atrLength'), mult(3, 'input.factor')],
    plots: [
      { key: 'up', label: 'plot.upTrend', color: '#089981', lineWidth: 2 },
      { key: 'down', label: 'plot.downTrend', color: '#f23645', lineWidth: 2 },
    ],
    precision: 'price',
    compute: (data, inputs) => {
      const { line, dir } = ta.supertrend(data, n(inputs, 'mult'), n(inputs, 'atrLength'))
      // Hai đường đứt đoạn khi đổi xu hướng (như plot style "linebr")
      return {
        up: line.map((v, i) => (dir[i] === -1 ? v : NaN)),
        down: line.map((v, i) => (dir[i] === 1 ? v : NaN)),
      }
    },
  },
  {
    type: 'vwap',
    short: 'VWAP',
    name: 'ind.vwap',
    category: 'volume',
    overlay: true,
    inputs: [
      {
        key: 'anchor',
        label: 'input.anchor',
        kind: 'select',
        default: 'session',
        options: [
          { value: 'session', label: 'anchor.session' },
          { value: 'week', label: 'anchor.week' },
          { value: 'month', label: 'anchor.month' },
        ],
      },
      source('hlc3'),
    ],
    plots: [{ key: 'vwap', label: 'VWAP', color: '#2962ff' }],
    precision: 'price',
    compute: (data, inputs) => ({ vwap: ta.vwap(data, src(data, inputs), s(inputs, 'anchor') as ta.VwapAnchor) }),
  },

  // ---------- Dao động ----------
  {
    type: 'rsi',
    short: 'RSI',
    name: 'ind.rsi',
    category: 'oscillator',
    overlay: false,
    inputs: [
      length(14),
      source(),
      maType('maType', 'input.maType', 'sma', [{ value: 'none', label: 'ma.none' }]),
      { ...length(14, 'maLength', 'input.maLength'), legend: false },
    ],
    plots: [
      { key: 'rsi', label: 'RSI', color: '#7e57c2' },
      { key: 'ma', label: 'plot.rsiMa', color: '#fdd835', disabled: (inputs) => inputs.maType === 'none' },
    ],
    levels: bandLevels(70, 50, 30),
    fills: [bandFill('rgba(126, 87, 194, 0.1)')],
    precision: 2,
    compute: (data, inputs) => {
      const rsi = ta.rsi(src(data, inputs), n(inputs, 'length'))
      const type = s(inputs, 'maType')
      const ma =
        type === 'none'
          ? rsi.map(() => NaN)
          : ta.movingAverage(type as ta.MaType, rsi, n(inputs, 'maLength'), vol(data))
      return { rsi, ma }
    },
  },
  {
    type: 'macd',
    short: 'MACD',
    name: 'ind.macd',
    category: 'oscillator',
    overlay: false,
    inputs: [
      length(12, 'fast', 'input.fast'),
      length(26, 'slow', 'input.slow'),
      source(),
      length(9, 'signal', 'input.signal'),
      {
        key: 'oscMa',
        label: 'input.oscMaType',
        kind: 'select',
        default: 'ema',
        options: MA_OPTIONS.slice(0, 2),
        legend: false,
      },
      {
        key: 'signalMa',
        label: 'input.signalMaType',
        kind: 'select',
        default: 'ema',
        options: MA_OPTIONS.slice(0, 2),
        legend: false,
      },
    ],
    plots: [
      {
        key: 'hist',
        label: 'plot.histogram',
        color: '#26a69a',
        type: 'histogram',
        // Màu histogram của TradingView: tăng / giảm, trên / dưới 0
        barColor: (v, prev) => (v >= 0 ? (v > prev ? '#26a69a' : '#b2dfdb') : v > prev ? '#ffcdd2' : '#ff5252'),
      },
      { key: 'macd', label: 'MACD', color: '#2962ff' },
      { key: 'signal', label: 'plot.signal', color: '#ff6d00' },
    ],
    levels: [level(0, 'solid', 'rgba(120, 123, 134, 0.5)')],
    precision: 'price',
    compute: (data, inputs) => {
      const x = src(data, inputs)
      const ma = (type: string, v: number[], len: number) => (type === 'sma' ? ta.sma(v, len) : ta.ema(v, len))
      const fast = ma(s(inputs, 'oscMa'), x, n(inputs, 'fast'))
      const slow = ma(s(inputs, 'oscMa'), x, n(inputs, 'slow'))
      const macd = fast.map((f, i) => f - slow[i])
      const signal = ma(s(inputs, 'signalMa'), macd, n(inputs, 'signal'))
      return { hist: macd.map((m, i) => m - signal[i]), macd, signal }
    },
  },
  {
    type: 'stoch',
    short: 'Stoch',
    name: 'ind.stoch',
    category: 'oscillator',
    overlay: false,
    inputs: [length(14, 'kLength', 'input.kLength'), length(1, 'kSmooth', 'input.kSmooth'), length(3, 'dSmooth', 'input.dSmooth')],
    plots: [
      { key: 'k', label: '%K', color: '#2962ff' },
      { key: 'd', label: '%D', color: '#ff6d00' },
    ],
    levels: bandLevels(80, 50, 20),
    fills: [bandFill('rgba(33, 150, 243, 0.1)')],
    precision: 2,
    compute: (data, inputs) => {
      const raw = ta.stochastic(closes(data), highs(data), lows(data), n(inputs, 'kLength'))
      const k = ta.sma(raw, n(inputs, 'kSmooth'))
      return { k, d: ta.sma(k, n(inputs, 'dSmooth')) }
    },
  },
  {
    type: 'stochrsi',
    short: 'Stoch RSI',
    name: 'ind.stochrsi',
    category: 'oscillator',
    overlay: false,
    inputs: [
      length(3, 'k', 'input.k'),
      length(3, 'd', 'input.d'),
      length(14, 'rsiLength', 'input.rsiLength'),
      length(14, 'stochLength', 'input.stochLength'),
      source(),
    ],
    plots: [
      { key: 'k', label: '%K', color: '#2962ff' },
      { key: 'd', label: '%D', color: '#ff6d00' },
    ],
    levels: bandLevels(80, 50, 20),
    fills: [bandFill('rgba(33, 150, 243, 0.1)')],
    precision: 2,
    compute: (data, inputs) => {
      const rsi = ta.rsi(src(data, inputs), n(inputs, 'rsiLength'))
      const k = ta.sma(ta.stochastic(rsi, rsi, rsi, n(inputs, 'stochLength')), n(inputs, 'k'))
      return { k, d: ta.sma(k, n(inputs, 'd')) }
    },
  },
  {
    type: 'cci',
    short: 'CCI',
    name: 'ind.cci',
    category: 'oscillator',
    overlay: false,
    inputs: [length(20), source('hlc3')],
    plots: [{ key: 'cci', label: 'CCI', color: '#2962ff' }],
    levels: bandLevels(100, 0, -100),
    fills: [bandFill('rgba(33, 150, 243, 0.1)')],
    precision: 2,
    compute: (data, inputs) => ({ cci: ta.cci(src(data, inputs), n(inputs, 'length')) }),
  },
  {
    type: 'willr',
    short: '%R',
    name: 'ind.willr',
    category: 'oscillator',
    overlay: false,
    inputs: [length(14), source()],
    plots: [{ key: 'r', label: '%R', color: '#7e57c2' }],
    levels: bandLevels(-20, -50, -80),
    fills: [bandFill('rgba(126, 87, 194, 0.1)')],
    precision: 2,
    compute: (data, inputs) => {
      const len = n(inputs, 'length')
      const hi = ta.highest(highs(data), len)
      const lo = ta.lowest(lows(data), len)
      const x = src(data, inputs)
      return { r: x.map((v, i) => (hi[i] === lo[i] ? -50 : (100 * (v - hi[i])) / (hi[i] - lo[i]))) }
    },
  },
  {
    type: 'mom',
    short: 'Mom',
    name: 'ind.mom',
    category: 'oscillator',
    overlay: false,
    inputs: [length(10), source()],
    plots: [{ key: 'mom', label: 'plot.mom', color: '#2962ff' }],
    precision: 'price',
    compute: (data, inputs) => {
      const x = src(data, inputs)
      const prev = ta.lag(x, n(inputs, 'length'))
      return { mom: x.map((v, i) => v - prev[i]) }
    },
  },
  {
    type: 'roc',
    short: 'ROC',
    name: 'ind.roc',
    category: 'oscillator',
    overlay: false,
    inputs: [length(9), source()],
    plots: [{ key: 'roc', label: 'ROC', color: '#2962ff' }],
    levels: [level(0, 'solid')],
    precision: 2,
    compute: (data, inputs) => {
      const x = src(data, inputs)
      const prev = ta.lag(x, n(inputs, 'length'))
      return { roc: x.map((v, i) => (100 * (v - prev[i])) / prev[i]) }
    },
  },
  {
    type: 'ao',
    short: 'AO',
    name: 'ind.ao',
    category: 'oscillator',
    overlay: false,
    inputs: [],
    plots: [
      {
        key: 'ao',
        label: 'AO',
        color: '#089981',
        type: 'histogram',
        barColor: (v, prev) => (v >= prev ? '#089981' : '#f23645'),
      },
    ],
    precision: 'price',
    compute: (data) => {
      const hl2 = ta.source(data, 'hl2')
      const fast = ta.sma(hl2, 5)
      const slow = ta.sma(hl2, 34)
      return { ao: fast.map((f, i) => f - slow[i]) }
    },
  },
  {
    type: 'dmi',
    short: 'DMI',
    name: 'ind.dmi',
    category: 'trend',
    overlay: false,
    inputs: [length(14, 'adxSmoothing', 'input.adxSmoothing'), length(14, 'diLength', 'input.diLength')],
    plots: [
      { key: 'adx', label: 'ADX', color: '#f50057' },
      { key: 'plus', label: '+DI', color: '#2962ff' },
      { key: 'minus', label: '−DI', color: '#ff6d00' },
    ],
    precision: 2,
    compute: (data, inputs) => ta.dmi(data, n(inputs, 'diLength'), n(inputs, 'adxSmoothing')),
  },
  {
    type: 'aroon',
    short: 'Aroon',
    name: 'ind.aroon',
    category: 'trend',
    overlay: false,
    inputs: [length(14)],
    plots: [
      { key: 'up', label: 'plot.aroonUp', color: '#fb8c00' },
      { key: 'down', label: 'plot.aroonDown', color: '#2196f3' },
    ],
    precision: 2,
    compute: (data, inputs) => ta.aroon(data, n(inputs, 'length')),
  },
  {
    type: 'atr',
    short: 'ATR',
    name: 'ind.atr',
    category: 'volatility',
    overlay: false,
    inputs: [
      length(14),
      {
        key: 'smoothing',
        label: 'input.smoothing',
        kind: 'select',
        default: 'smma',
        options: MA_OPTIONS.filter((o) => o.value !== 'vwma'),
      },
    ],
    plots: [{ key: 'atr', label: 'ATR', color: '#b71c1c' }],
    precision: 'price',
    compute: (data, inputs) => ({
      atr: ta.movingAverage(s(inputs, 'smoothing') as ta.MaType, ta.trueRange(data), n(inputs, 'length'), vol(data)),
    }),
  },
  {
    type: 'bbpct',
    short: 'BB %B',
    name: 'ind.bbpct',
    category: 'volatility',
    overlay: false,
    inputs: [length(20), source(), mult(2, 'input.stdDev')],
    plots: [{ key: 'b', label: '%B', color: '#26a69a' }],
    levels: [level(1), level(0.5, 'dotted'), level(0)],
    fills: [bandFill('rgba(38, 166, 154, 0.1)')],
    precision: 2,
    compute: (data, inputs) => {
      const x = src(data, inputs)
      const len = n(inputs, 'length')
      const basis = ta.sma(x, len)
      const dev = ta.stdev(x, len).map((d) => d * n(inputs, 'mult'))
      return { b: x.map((v, i) => (dev[i] ? (v - (basis[i] - dev[i])) / (2 * dev[i]) : 0.5)) }
    },
  },
  {
    type: 'bbw',
    short: 'BBW',
    name: 'ind.bbw',
    category: 'volatility',
    overlay: false,
    inputs: [length(20), source(), mult(2, 'input.stdDev')],
    plots: [{ key: 'bbw', label: 'BBW', color: '#2962ff' }],
    precision: 4,
    compute: (data, inputs) => {
      const x = src(data, inputs)
      const len = n(inputs, 'length')
      const basis = ta.sma(x, len)
      const dev = ta.stdev(x, len).map((d) => d * n(inputs, 'mult'))
      return { bbw: basis.map((b, i) => (2 * dev[i]) / b) }
    },
  },
  {
    type: 'obv',
    short: 'OBV',
    name: 'ind.obv',
    category: 'volume',
    overlay: false,
    inputs: [],
    plots: [{ key: 'obv', label: 'OBV', color: '#2962ff' }],
    precision: 'volume',
    compute: (data) => ({ obv: ta.obv(closes(data), vol(data)) }),
  },
  {
    type: 'mfi',
    short: 'MFI',
    name: 'ind.mfi',
    category: 'volume',
    overlay: false,
    inputs: [length(14)],
    plots: [{ key: 'mfi', label: 'MFI', color: '#7e57c2' }],
    levels: bandLevels(80, 50, 20),
    fills: [bandFill('rgba(126, 87, 194, 0.1)')],
    precision: 2,
    compute: (data, inputs) => ({ mfi: ta.mfi(ta.source(data, 'hlc3'), vol(data), n(inputs, 'length')) }),
  },
  {
    type: 'cmf',
    short: 'CMF',
    name: 'ind.cmf',
    category: 'volume',
    overlay: false,
    inputs: [length(20)],
    plots: [{ key: 'cmf', label: 'CMF', color: '#43a047' }],
    levels: [level(0, 'solid')],
    precision: 3,
    compute: (data, inputs) => ({ cmf: ta.cmf(data, n(inputs, 'length')) }),
  },
  {
    type: 'volume',
    short: 'Vol',
    name: 'ind.volume',
    category: 'volume',
    overlay: false,
    inputs: [{ ...length(20, 'maLength', 'input.maLength'), legend: false }],
    plots: [
      { key: 'up', label: 'plot.volUp', color: 'rgba(8, 153, 129, 0.5)', type: 'histogram', sparse: true },
      { key: 'down', label: 'plot.volDown', color: 'rgba(242, 54, 69, 0.5)', type: 'histogram', sparse: true },
      { key: 'ma', label: 'plot.volumeMa', color: '#2962ff' },
    ],
    precision: 'volume',
    compute: (data, inputs) => {
      const v = vol(data)
      return {
        up: data.map((c) => (c.close >= c.open ? c.volume : NaN)),
        down: data.map((c) => (c.close < c.open ? c.volume : NaN)),
        ma: ta.sma(v, n(inputs, 'maLength')),
      }
    },
  },
  {
    type: 'vsa',
    short: 'VSA',
    name: 'ind.vsa',
    category: 'volume',
    overlay: false,
    inputs: [
      length(20),
      { key: 'ultra', label: 'input.ultraMult', kind: 'float', default: 2, min: 0.1, step: 0.1, legend: false },
      { key: 'high', label: 'input.highMult', kind: 'float', default: 1.3, min: 0.1, step: 0.1, legend: false },
      { key: 'low', label: 'input.lowMult', kind: 'float', default: 0.7, min: 0, step: 0.1, legend: false },
      { key: 'wide', label: 'input.wideMult', kind: 'float', default: 1.3, min: 0.1, step: 0.1, legend: false },
      { key: 'narrow', label: 'input.narrowMult', kind: 'float', default: 0.7, min: 0, step: 0.1, legend: false },
      { key: 'bearish', label: 'input.showBearish', kind: 'bool', default: true },
      { key: 'bullish', label: 'input.showBullish', kind: 'bool', default: true },
    ],
    plots: [
      { key: 'ultra', label: 'plot.ultraVol', color: '#ab47bc', type: 'histogram', sparse: true },
      { key: 'highUp', label: 'plot.highUp', color: '#089981', type: 'histogram', sparse: true },
      { key: 'highDown', label: 'plot.highDown', color: '#f23645', type: 'histogram', sparse: true },
      { key: 'normalUp', label: 'plot.normalUp', color: 'rgba(8, 153, 129, 0.5)', type: 'histogram', sparse: true },
      { key: 'normalDown', label: 'plot.normalDown', color: 'rgba(242, 54, 69, 0.5)', type: 'histogram', sparse: true },
      { key: 'low', label: 'plot.lowVol', color: '#5d606b', type: 'histogram', sparse: true },
      { key: 'ma', label: 'plot.volumeMa', color: '#ff9800' },
    ],
    precision: 'volume',
    help: 'help.vsa',
    markers: {
      anchor: 'volume',
      list: (values, inputs) => {
        const out: IndicatorMarker[] = []
        values.signal.forEach((code, index) => {
          const signal = ta.VSA_SIGNALS[code]
          if (!signal) return
          const bullish = ta.VSA_BULLISH.includes(signal)
          if (bullish ? inputs.bullish : inputs.bearish) out.push({ index, text: signal, bullish })
        })
        return out
      },
    },
    compute: (data, inputs) => {
      const { levels, signals, avgVol } = ta.vsa(data, {
        length: n(inputs, 'length'),
        ultra: n(inputs, 'ultra'),
        high: n(inputs, 'high'),
        low: n(inputs, 'low'),
        wide: n(inputs, 'wide'),
        narrow: n(inputs, 'narrow'),
      })
      // Mỗi mức khối lượng là một đường riêng (đổi màu / ẩn được trong Style), chỉ có giá trị ở nến thuộc mức đó
      const only = (match: (level: ta.VsaLevel, up: boolean) => boolean) =>
        data.map((c, i) => (match(levels[i], c.close >= c.open) ? c.volume : NaN))
      return {
        ultra: only((l) => l === 'ultra'),
        highUp: only((l, up) => l === 'high' && up),
        highDown: only((l, up) => l === 'high' && !up),
        normalUp: only((l, up) => l === 'normal' && up),
        normalDown: only((l, up) => l === 'normal' && !up),
        low: only((l) => l === 'low'),
        ma: avgVol,
        volume: vol(data),
        signal: signals.map((sg) => (sg ? ta.VSA_SIGNALS.indexOf(sg) : NaN)),
      }
    },
  },
  {
    type: 'ad',
    short: 'Accum/Dist',
    name: 'ind.ad',
    category: 'volume',
    overlay: false,
    inputs: [],
    plots: [{ key: 'ad', label: 'A/D', color: '#999915' }],
    precision: 'volume',
    compute: (data) => ({ ad: ta.accDist(data) }),
  },
  {
    type: 'vo',
    short: 'Volume Osc',
    name: 'ind.vo',
    category: 'volume',
    overlay: false,
    inputs: [length(5, 'short', 'input.shortLength'), length(10, 'long', 'input.longLength')],
    plots: [{ key: 'vo', label: 'VO', color: '#2962ff' }],
    levels: [level(0, 'solid')],
    precision: 2,
    compute: (data, inputs) => {
      const short = ta.ema(vol(data), n(inputs, 'short'))
      const long = ta.ema(vol(data), n(inputs, 'long'))
      return { vo: short.map((s, i) => (long[i] ? (100 * (s - long[i])) / long[i] : 0)) }
    },
  },
  {
    type: 'pvt',
    short: 'PVT',
    name: 'ind.pvt',
    category: 'volume',
    overlay: false,
    inputs: [],
    plots: [{ key: 'pvt', label: 'PVT', color: '#2962ff' }],
    precision: 'volume',
    compute: (data) => ({
      pvt: ta.cum(data.map((c, i) => (i === 0 ? 0 : ((c.close - data[i - 1].close) / data[i - 1].close) * c.volume))),
    }),
  },
  {
    type: 'efi',
    short: 'EFI',
    name: 'ind.efi',
    category: 'volume',
    overlay: false,
    inputs: [length(13)],
    plots: [{ key: 'efi', label: 'EFI', color: '#f23645' }],
    levels: [level(0, 'solid')],
    precision: 'volume',
    compute: (data, inputs) => ({
      efi: ta.ema(
        ta.change(closes(data)).map((d, i) => d * data[i].volume),
        n(inputs, 'length'),
      ),
    }),
  },
  {
    type: 'eom',
    short: 'EOM',
    name: 'ind.eom',
    category: 'volume',
    overlay: false,
    inputs: [length(14), { key: 'divisor', label: 'input.divisor', kind: 'int', default: 10000, min: 1 }],
    plots: [{ key: 'eom', label: 'EOM', color: '#43a047' }],
    levels: [level(0, 'solid')],
    precision: 2,
    compute: (data, inputs) => {
      const hl2 = ta.change(ta.source(data, 'hl2'))
      const raw = data.map((c, i) => (c.volume ? (n(inputs, 'divisor') * hl2[i] * (c.high - c.low)) / c.volume : 0))
      return { eom: ta.sma(raw, n(inputs, 'length')) }
    },
  },
  {
    type: 'klinger',
    short: 'KVO',
    name: 'ind.klinger',
    category: 'volume',
    overlay: false,
    inputs: [length(34, 'fast', 'input.fast'), length(55, 'slow', 'input.slow'), length(13, 'signal', 'input.signal')],
    plots: [
      { key: 'kvo', label: 'KVO', color: '#2962ff' },
      { key: 'signal', label: 'plot.signal', color: '#43a047' },
    ],
    levels: [level(0, 'solid')],
    precision: 'volume',
    compute: (data, inputs) => {
      const tp = ta.change(ta.source(data, 'hlc3'))
      const sv = data.map((c, i) => (i === 0 ? NaN : tp[i] >= 0 ? c.volume : -c.volume))
      const fast = ta.ema(sv, n(inputs, 'fast'))
      const slow = ta.ema(sv, n(inputs, 'slow'))
      const kvo = fast.map((f, i) => f - slow[i])
      return { kvo, signal: ta.ema(kvo, n(inputs, 'signal')) }
    },
  },
]

export function indicatorDef(type: IndicatorType): IndicatorDef {
  return INDICATORS.find((d) => d.type === type)!
}

// ---------- Cài đặt đã áp dụng mặc định ----------

/** Tham số đầy đủ (mặc định + phần người dùng đã sửa) */
export function indicatorInputs(ind: Indicator): Inputs {
  const def = indicatorDef(ind.type)
  return Object.fromEntries(def.inputs.map((i) => [i.key, ind.inputs?.[i.key] ?? i.default]))
}

export function plotStyle(ind: Indicator, plot: PlotDef): PlotStyle {
  const style: PlotStyle = {
    color: plot.color,
    lineWidth: plot.lineWidth ?? 1,
    lineStyle: plot.lineStyle ?? 'solid',
    plotType: plot.type ?? 'line',
    visible: true,
    ...ind.styles?.[plot.key],
  }
  if (plot.disabled?.(indicatorInputs(ind))) style.visible = false
  return style
}

export function indicatorLevels(ind: Indicator): LevelStyle[] {
  return ind.levels ?? indicatorDef(ind.type).levels ?? []
}

export function fillStyle(ind: Indicator, fill: FillDef): FillStyle {
  return { color: fill.color, color2: fill.color2, visible: true, ...ind.fills?.[fill.key] }
}

export function intervalGroup(interval: Interval): IntervalGroup {
  if (interval.endsWith('m')) return 'minutes'
  if (interval.endsWith('h')) return 'hours'
  if (interval.endsWith('d')) return 'days'
  if (interval.endsWith('w')) return 'weeks'
  return 'months'
}

export const INTERVAL_GROUPS: IntervalGroup[] = ['minutes', 'hours', 'days', 'weeks', 'months']

/** Chỉ báo có được vẽ trên khung thời gian này không (tab Visibility) */
export function visibleOn(ind: Indicator, interval: Interval): boolean {
  return ind.visibility?.[intervalGroup(interval)] !== false
}

/** Nhãn trên legend như TradingView, vd. "MA 9 close", "MACD 12 26 close 9" */
export function indicatorLabel(ind: Indicator, t: TFunction): string {
  const def = indicatorDef(ind.type)
  if (ind.showInputs === false) return def.short
  const inputs = indicatorInputs(ind)
  const parts = def.inputs
    .filter((i) => i.kind !== 'bool' && i.legend !== false)
    .map((i) => {
      const v = inputs[i.key]
      if (i.kind === 'source') return t(`source.${v as PriceSource}`)
      if (i.kind === 'select') return label(t, i.options?.find((o) => o.value === v)?.label ?? String(v))
      return String(v)
    })
  return [def.short, ...parts].join(' ')
}

/** Số lẻ thực tế của chỉ báo (cài đặt Precision hoặc mặc định) */
export function indicatorPrecision(ind: Indicator, pricePrecision: number): number {
  const def = indicatorDef(ind.type)
  if (ind.precision !== undefined) return ind.precision
  return def.precision === 'price' ? pricePrecision : def.precision === 'volume' ? 0 : def.precision
}

export function formatIndicatorValue(ind: Indicator, value: number, pricePrecision: number): string {
  if (!Number.isFinite(value)) return '∅'
  if (indicatorDef(ind.type).precision === 'volume' && ind.precision === undefined) {
    return (value < 0 ? '−' : '') + formatVolume(Math.abs(value))
  }
  return value.toFixed(indicatorPrecision(ind, pricePrecision))
}
