import type { Bar, Check, PriceLevel, Rule, Side, SymbolId, Timeframe } from '../types'
import { atr, closes, macd, movingAverage, rsi, sma } from './indicators'
import { findPattern } from './patterns'
import { TF_LABEL } from './timeframes'

/** Dữ liệu cho một lần chấm điểm: nến đã đóng theo từng khung (chỉ gồm nến đóng trước thời điểm xét) */
export interface RuleContext {
  symbol: SymbolId
  timeframe: Timeframe
  bars: Partial<Record<Timeframe, Bar[]>>
  /** Số chữ số thập phân khi ghi giá vào nhãn */
  precision: number
}

export type RuleResult = Record<Side, Check>

const fmt = (v: number, precision: number) => v.toFixed(precision)
const maName = (ma: string, period: number) => `${ma.toUpperCase()}${period}`
const isNum = (v: number | undefined): v is number => v !== undefined && !Number.isNaN(v)

function both(rule: Rule, label: string, long: boolean, short: boolean, shortLabel = label): RuleResult {
  const weight = rule.weight ?? 1
  const required = rule.required ?? false
  return {
    long: { label, pass: long, weight, required },
    short: { label: shortLabel, pass: short, weight, required },
  }
}

/** Chấm một điều kiện cho cả hai chiều Buy / Sell */
export function evaluateRule(rule: Rule, ctx: RuleContext): RuleResult {
  const tf = rule.tf ?? ctx.timeframe
  const bars = ctx.bars[tf] ?? []
  const tfLabel = TF_LABEL[tf]
  const i = bars.length - 1
  const last = bars[i]
  const p = ctx.precision
  const noData = () => both(rule, `${tfLabel}: chưa đủ dữ liệu (${rule.type})`, false, false)
  if (!last) return noData()

  switch (rule.type) {
    case 'trend': {
      const ma = movingAverage(rule.ma, closes(bars), rule.period)[i]
      if (!isNum(ma)) return noData()
      const name = `${tfLabel} ${maName(rule.ma, rule.period)}`
      return both(
        rule,
        `${name}: giá trên MA (giá ${fmt(last.close, p)}, MA ${fmt(ma, p)})`,
        last.close > ma,
        last.close < ma,
        `${name}: giá dưới MA (giá ${fmt(last.close, p)}, MA ${fmt(ma, p)})`,
      )
    }

    case 'ma_cross': {
      const c = closes(bars)
      const fast = movingAverage(rule.ma, c, rule.fast)
      const slow = movingAverage(rule.ma, c, rule.slow)
      if (!isNum(slow[i]) || !isNum(slow[i - 1])) return noData()
      let up = -1
      let down = -1
      for (let j = i; j > i - rule.within && j > 0; j--) {
        if (up < 0 && fast[j - 1] <= slow[j - 1] && fast[j] > slow[j]) up = i - j
        if (down < 0 && fast[j - 1] >= slow[j - 1] && fast[j] < slow[j]) down = i - j
      }
      const pair = `${maName(rule.ma, rule.fast)}/${maName(rule.ma, rule.slow)}`
      const ago = (n: number) => (n === 0 ? 'ở nến này' : `${n} nến trước`)
      return both(
        rule,
        up >= 0 ? `${tfLabel} ${pair} cắt lên ${ago(up)}` : `${tfLabel} ${pair} chưa cắt lên`,
        up >= 0 && fast[i] > slow[i],
        down >= 0 && fast[i] < slow[i],
        down >= 0 ? `${tfLabel} ${pair} cắt xuống ${ago(down)}` : `${tfLabel} ${pair} chưa cắt xuống`,
      )
    }

    case 'pullback': {
      const ma = movingAverage(rule.ma, closes(bars), rule.period)[i]
      const range = atr(bars, 14)[i]
      if (!isNum(ma) || !isNum(range)) return noData()
      const tol = rule.toleranceAtr * range
      const name = `${tfLabel} ${maName(rule.ma, rule.period)} (${fmt(ma, p)})`
      return both(
        rule,
        `Hồi về ${name}`,
        last.low <= ma + tol && last.close > ma,
        last.high >= ma - tol && last.close < ma,
      )
    }

    case 'rsi': {
      const value = rsi(bars, rule.period)[i]
      if (!isNum(value)) return noData()
      const v = value.toFixed(1)
      return both(
        rule,
        rule.longBelow !== undefined ? `${tfLabel} RSI ${v} (Buy khi ≤ ${rule.longBelow})` : `${tfLabel} RSI ${v}`,
        rule.longBelow !== undefined && value <= rule.longBelow,
        rule.shortAbove !== undefined && value >= rule.shortAbove,
        rule.shortAbove !== undefined ? `${tfLabel} RSI ${v} (Sell khi ≥ ${rule.shortAbove})` : `${tfLabel} RSI ${v}`,
      )
    }

    case 'breakout': {
      const prev = bars.slice(Math.max(0, i - rule.lookback), i)
      if (prev.length < rule.lookback) return noData()
      const high = Math.max(...prev.map((b) => b.high))
      const low = Math.min(...prev.map((b) => b.low))
      return both(
        rule,
        `${tfLabel} phá đỉnh ${rule.lookback} nến (${fmt(high, p)})`,
        last.close > high,
        last.close < low,
        `${tfLabel} phá đáy ${rule.lookback} nến (${fmt(low, p)})`,
      )
    }

    case 'pattern': {
      const long = findPattern(bars, i, 'long', rule.patterns)
      const short = findPattern(bars, i, 'short', rule.patterns)
      return both(
        rule,
        long ?? `${tfLabel}: chưa có mẫu nến Buy`,
        !!long,
        !!short,
        short ?? `${tfLabel}: chưa có mẫu nến Sell`,
      )
    }

    case 'volume_spike': {
      const avg = sma(
        bars.map((b) => b.volume),
        rule.period,
      )[i - 1]
      if (!isNum(avg) || avg <= 0) return noData()
      const ratio = last.volume / avg
      const spike = ratio >= rule.mult
      const label = `${tfLabel} volume x${ratio.toFixed(1)} TB${rule.period} (cần ≥ x${rule.mult})`
      return both(rule, label, spike && last.close > last.open, spike && last.close < last.open)
    }

    case 'macd': {
      const m = macd(closes(bars), rule.fast, rule.slow, rule.signal)
      if (!isNum(m.histogram[i]) || !isNum(m.histogram[i - 1])) return noData()
      const rising = m.histogram[i] > m.histogram[i - 1]
      return both(
        rule,
        `${tfLabel} MACD trên signal, histogram tăng`,
        m.line[i] > m.signal[i] && rising,
        m.line[i] < m.signal[i] && !rising,
        `${tfLabel} MACD dưới signal, histogram giảm`,
      )
    }

    case 'level': {
      const levels: PriceLevel[] = rule.levels[ctx.symbol] ?? []
      const range = atr(bars, 14)[i]
      if (!isNum(range)) return noData()
      const tol = rule.toleranceAtr * range
      const touched = (l: PriceLevel) => {
        const lo = l.from ?? l.price ?? NaN
        const hi = l.to ?? l.price ?? NaN
        return last.low <= Math.max(lo, hi) + tol && last.high >= Math.min(lo, hi) - tol
      }
      const name = (l: PriceLevel) => l.label ?? fmt(l.price ?? l.from ?? 0, p)
      const support = levels.find((l) => l.kind !== 'resistance' && touched(l))
      const resistance = levels.find((l) => l.kind !== 'support' && touched(l))
      return both(
        rule,
        support ? `Chạm vùng hỗ trợ ${name(support)}` : 'Chưa chạm vùng hỗ trợ',
        !!support,
        !!resistance,
        resistance ? `Chạm vùng kháng cự ${name(resistance)}` : 'Chưa chạm vùng kháng cự',
      )
    }
  }
}
