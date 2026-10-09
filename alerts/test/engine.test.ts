import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeRsi } from '../../src/lib/rsi.ts'
import type { Candle } from '../../src/types.ts'
import { evaluateStrategy, riskLevels, scoreStrategy } from '../src/engine/evaluate.ts'
import { atr, ema, macd, rma, rsi, sma } from '../src/engine/indicators.ts'
import { engulfing, insideBarBreak, pinBar } from '../src/engine/patterns.ts'
import { evaluateRule } from '../src/engine/rules.ts'
import { inSessions, lastClosedOpen } from '../src/engine/timeframes.ts'
import type { Bar, Rule, Strategy } from '../src/types.ts'

const H = 3600
const bar = (time: number, o: number, h: number, l: number, c: number, v = 100): Bar => ({
  time,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: v,
})
/** Chuỗi nến từ danh sách giá đóng cửa (mở = đóng cửa trước) */
const series = (closes: number[], step = H, start = 1_700_000_000 - (1_700_000_000 % H)): Bar[] =>
  closes.map((c, i) => {
    const o = i ? closes[i - 1] : c
    return bar(start + i * step, o, Math.max(o, c) + 0.5, Math.min(o, c) - 0.5, c)
  })
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)

describe('indicators', () => {
  it('sma', () => {
    const r = sma([1, 2, 3, 4, 5], 3)
    assert.ok(Number.isNaN(r[1]))
    assert.deepEqual(r.slice(2), [2, 3, 4])
  })
  it('ema seeded with sma', () => {
    const r = ema([1, 2, 3, 4, 5], 3)
    close(r[2], 2)
    close(r[3], 0.5 * 4 + 0.5 * 2)
    close(r[4], 0.5 * 5 + 0.5 * 3)
  })
  it('rma (Wilder)', () => {
    const r = rma([2, 4, 6, 8], 2)
    close(r[1], 3)
    close(r[2], (3 + 6) / 2)
    close(r[3], (4.5 + 8) / 2)
  })
  it('atr uses true range', () => {
    const bars = [bar(0, 10, 11, 9, 10), bar(1, 10, 15, 10, 14), bar(2, 14, 14, 8, 9)]
    const r = atr(bars, 2)
    close(r[1], (2 + 5) / 2) // TR1 = max(5, |15-10|, |10-10|)
    close(r[2], (3.5 + 6) / 2) // TR2 = max(6, |14-14|, |8-14|)
  })
  it('rsi matches the chart implementation, aligned to bars', () => {
    const bars = series(Array.from({ length: 60 }, (_, i) => 100 + 10 * Math.sin(i / 4)))
    const r = rsi(bars, 14)
    const points = computeRsi(bars as unknown as Candle[], 14)
    assert.equal(r.length, 60)
    assert.ok(Number.isNaN(r[13]))
    close(r[59], points.at(-1)!.value)
  })
  it('macd histogram = line - signal', () => {
    const values = Array.from({ length: 80 }, (_, i) => 100 + i + 5 * Math.sin(i / 3))
    const m = macd(values, 12, 26, 9)
    close(m.histogram[79], m.line[79] - m.signal[79])
    assert.ok(Number.isNaN(m.signal[30]))
    assert.ok(!Number.isNaN(m.signal[33]))
  })
})

describe('patterns', () => {
  it('engulfing', () => {
    const bull = [bar(0, 10, 10.2, 8.8, 9), bar(1, 8.9, 10.6, 8.8, 10.5)]
    assert.ok(engulfing(bull, 1, 'long'))
    assert.ok(!engulfing(bull, 1, 'short'))
    const bear = [bar(0, 9, 10.2, 8.8, 10), bar(1, 10.1, 10.2, 8.5, 8.6)]
    assert.ok(engulfing(bear, 1, 'short'))
  })
  it('pin bar', () => {
    assert.ok(pinBar(bar(0, 10, 10.3, 7, 10.2), 'long'))
    assert.ok(!pinBar(bar(0, 10, 10.3, 7, 10.2), 'short'))
    assert.ok(pinBar(bar(0, 10, 13, 9.8, 9.9), 'short'))
    assert.ok(!pinBar(bar(0, 8, 10, 7.9, 9.9), 'long'))
  })
  it('inside bar breakout', () => {
    const bars = [bar(0, 10, 12, 8, 11), bar(1, 11, 11.5, 9, 10), bar(2, 10, 12.5, 10, 11.8)]
    assert.ok(insideBarBreak(bars, 2, 'long'))
    assert.ok(!insideBarBreak(bars, 2, 'short'))
  })
})

describe('rules', () => {
  const ctx = (bars: Bar[], extra: Partial<Record<'4h', Bar[]>> = {}) => ({
    symbol: 'XAUUSD' as const,
    timeframe: '1h' as const,
    bars: { '1h': bars, ...extra },
    precision: 2,
  })
  const up = series(Array.from({ length: 250 }, (_, i) => 100 + i))

  it('trend: price above EMA -> long only', () => {
    const r = evaluateRule({ type: 'trend', ma: 'ema', period: 50 }, ctx(up))
    assert.ok(r.long.pass && !r.short.pass)
    assert.match(r.long.label, /H1 EMA50: giá trên MA/)
  })
  it('trend on a higher timeframe reads that timeframe', () => {
    const down4h = series(
      Array.from({ length: 250 }, (_, i) => 500 - i),
      4 * H,
    )
    const r = evaluateRule({ type: 'trend', tf: '4h', ma: 'ema', period: 200 }, ctx(up, { '4h': down4h }))
    assert.ok(r.short.pass && !r.long.pass)
    assert.match(r.short.label, /^H4 EMA200/)
  })
  it('missing data -> both fail', () => {
    const r = evaluateRule({ type: 'trend', tf: '4h', ma: 'ema', period: 200 }, ctx(up))
    assert.ok(!r.long.pass && !r.short.pass)
    assert.match(r.long.label, /chưa đủ dữ liệu/)
  })
  it('breakout above the previous N highs', () => {
    const flat = series([...Array.from({ length: 30 }, () => 100), 103])
    const r = evaluateRule({ type: 'breakout', lookback: 20 }, ctx(flat))
    assert.ok(r.long.pass && !r.short.pass)
  })
  it('volume spike only on a candle in that direction', () => {
    const bars = series(Array.from({ length: 30 }, (_, i) => 100 + (i % 2)))
    bars[29] = { ...bars[29], open: 99, close: 102, high: 102.5, volume: 500 }
    const r = evaluateRule({ type: 'volume_spike', period: 20, mult: 2 }, ctx(bars))
    assert.ok(r.long.pass && !r.short.pass)
    assert.match(r.long.label, /x5\.0/)
  })
  it('rsi thresholds', () => {
    const falling = series(Array.from({ length: 40 }, (_, i) => 200 - i * 2))
    const r = evaluateRule({ type: 'rsi', period: 14, longBelow: 30, shortAbove: 70 }, ctx(falling))
    assert.ok(r.long.pass && !r.short.pass)
  })
  it('ma cross within N bars', () => {
    const closes = [
      ...Array.from({ length: 40 }, (_, i) => 200 - i),
      ...Array.from({ length: 6 }, (_, i) => 165 + i * 8),
    ]
    const r = evaluateRule({ type: 'ma_cross', ma: 'ema', fast: 3, slow: 10, within: 5 }, ctx(series(closes)))
    assert.ok(r.long.pass, r.long.label)
    assert.match(r.long.label, /cắt lên/)
  })
  it('pullback to the moving average', () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + i * 0.5)
    const bars = series(closes)
    const ma50 = ema(closes, 50)[79]
    bars[79] = { ...bars[79], low: ma50 - 0.1, open: ma50 + 1, close: ma50 + 2, high: ma50 + 2.5 }
    const r = evaluateRule({ type: 'pullback', ma: 'ema', period: 50, toleranceAtr: 0.5 }, ctx(bars))
    assert.ok(r.long.pass && !r.short.pass)
  })
  it('level: touching a support zone', () => {
    const bars = series(Array.from({ length: 30 }, () => 100))
    bars[29] = { ...bars[29], low: 95.2, high: 100.5 }
    const rule: Rule = {
      type: 'level',
      toleranceAtr: 0.2,
      levels: {
        XAUUSD: [
          { from: 94, to: 95, kind: 'support', label: 'Demand 95' },
          { price: 110, kind: 'resistance' },
        ],
      },
    }
    const r = evaluateRule(rule, ctx(bars))
    assert.ok(r.long.pass && !r.short.pass)
    assert.equal(r.long.label, 'Chạm vùng hỗ trợ Demand 95')
  })
})

describe('strategy scoring', () => {
  const strategy: Strategy = {
    id: 't',
    name: 'Test',
    symbols: ['XAUUSD'],
    timeframe: '1h',
    rules: [
      { type: 'trend', ma: 'ema', period: 20, weight: 2, required: true },
      { type: 'breakout', lookback: 10, weight: 2 },
      { type: 'rsi', period: 14, longBelow: 30, shortAbove: 70, weight: 1 },
    ],
    alert: { watchAt: 0.5, entryAt: 0.8, cooldownMinutes: 60 },
    risk: { sl: { type: 'atr', period: 14, mult: 1.5 }, rr: [1.5, 3] },
  }
  const up = series(Array.from({ length: 60 }, (_, i) => 100 + i))

  it('weights, required, ratio', () => {
    const [long, short] = scoreStrategy(strategy, {
      symbol: 'XAUUSD',
      timeframe: '1h',
      bars: { '1h': up },
      precision: 2,
    })
    assert.equal(long.score, 4)
    assert.equal(long.total, 5)
    close(long.ratio, 0.8)
    assert.ok(short.blocked)
    assert.equal(short.ratio, 0)
  })
  it('entry signal with SL / TP from ATR', () => {
    const s = evaluateStrategy(strategy, 'XAUUSD', { '1h': up }, 2, 'test')!
    assert.equal(s.side, 'long')
    assert.equal(s.level, 'entry')
    assert.equal(s.entry, 159)
    const a = atr(up, 14)[59]
    close(s.sl, Number((159 - 1.5 * a).toFixed(2)))
    close(s.tp[0], Number((159 + 1.5 * (159 - s.sl)).toFixed(2)), 0.02)
    assert.equal(s.checks.length, 3)
    assert.equal(s.barTime, up[59].time)
  })
  it('below watch threshold -> no signal; between -> watch', () => {
    assert.equal(
      evaluateStrategy(
        { ...strategy, alert: { ...strategy.alert, watchAt: 0.9, entryAt: 0.95 } },
        'XAUUSD',
        { '1h': up },
        2,
      ),
      null,
    )
    assert.equal(
      evaluateStrategy({ ...strategy, alert: { ...strategy.alert, entryAt: 0.9 } }, 'XAUUSD', { '1h': up }, 2)!.level,
      'watch',
    )
  })
  it('required rule failing blocks the side', () => {
    const down = series(Array.from({ length: 60 }, (_, i) => 200 - i))
    const s = evaluateStrategy({ ...strategy, sides: ['long'] }, 'XAUUSD', { '1h': down }, 2)
    assert.equal(s, null)
  })
  it('session filter', () => {
    const london = { ...strategy, sessions: ['london' as const] }
    const t = up[59].time + H // giờ đóng nến
    const s = evaluateStrategy(london, 'XAUUSD', { '1h': up }, 2)
    assert.equal(s !== null, inSessions(t, ['london']))
  })
  it('swing stop below recent low', () => {
    const swing: Strategy = { ...strategy, risk: { sl: { type: 'swing', lookback: 5, bufferAtr: 0 }, rr: [2] } }
    const r = riskLevels(swing, up, 'long', 2)
    assert.equal(r.sl, Math.min(...up.slice(55).map((b) => b.low)))
    close(r.tp[0], 159 + 2 * (159 - r.sl), 0.01)
  })
})

describe('timeframes', () => {
  it('last closed candle', () => {
    assert.equal(lastClosedOpen(7200 + 59, '1h'), 3600)
    assert.equal(lastClosedOpen(7200, '1h'), 3600)
    assert.equal(lastClosedOpen(900 * 5 + 1, '15m'), 900 * 4)
  })
})
