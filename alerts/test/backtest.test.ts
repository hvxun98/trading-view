import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { backtest } from '../src/backtest.ts'
import type { Bar, Strategy } from '../src/types.ts'

const H = 3600
const T0 = 1_790_000_000 - (1_790_000_000 % (4 * H))

/** Đi ngang quanh 100, nến `at` phá đỉnh rồi giá đi theo `after` (mảng giá đóng cửa) */
function scenario(breakouts: { at: number; after: number[] }[], length = 400): Bar[] {
  const closes = Array.from({ length }, (_, i) => 100 + (i % 2) * 0.2)
  for (const b of breakouts) {
    closes[b.at] = 103
    b.after.forEach((c, k) => (closes[b.at + 1 + k] = c))
  }
  return closes.map((c, i) => {
    const o = i ? closes[i - 1] : c
    return { time: T0 + i * H, open: o, high: Math.max(o, c) + 0.1, low: Math.min(o, c) - 0.1, close: c, volume: 10 }
  })
}

const strategy: Strategy = {
  id: 'bo',
  name: 'Breakout',
  symbols: ['BTCUSDT'],
  timeframe: '1h',
  sides: ['long'],
  rules: [{ type: 'breakout', lookback: 10, weight: 1, required: true }],
  alert: { watchAt: 0.5, entryAt: 1, cooldownMinutes: 12 * 60 },
  risk: { sl: { type: 'swing', lookback: 3, bufferAtr: 0 }, rr: [1, 2] },
}

describe('backtest', () => {
  it('counts TP1 wins, SL losses and R', () => {
    // Lệnh 1: tăng mạnh -> chạm TP1 và TP cuối. Lệnh 2: rơi về dưới SL.
    const bars = scenario([
      { at: 100, after: [105, 108, 112] },
      { at: 200, after: [101, 98, 95] },
    ])
    const r = backtest(strategy, 'BTCUSDT', { '1h': bars })
    assert.equal(r.stats.signals, 2)
    assert.equal(r.trades[0].signal.barTime, bars[100].time)
    assert.equal(r.trades[0].outcome, 'tp')
    assert.equal(r.trades[0].r, 1)
    assert.ok(r.trades[0].hitFinalTp)
    assert.equal(r.trades[1].outcome, 'sl')
    assert.equal(r.trades[1].r, -1)
    assert.equal(r.stats.winRate, 0.5)
    assert.equal(r.stats.totalR, 0)
    assert.equal(r.stats.maxLosingStreak, 1)
  })

  it('never looks ahead: signal uses only closed bars, trade starts on the next bar', () => {
    const bars = scenario([{ at: 150, after: [104, 106] }])
    const r = backtest(strategy, 'BTCUSDT', { '1h': bars })
    const t = r.trades[0]
    assert.equal(t.signal.entry, 103)
    assert.ok(t.exitTime > t.signal.barTime)
  })

  it('cooldown between signals (bar time)', () => {
    const bars = scenario([
      { at: 100, after: [103.5, 104, 104.5, 105] },
      { at: 106, after: [107, 109] },
    ])
    const noCooldown = backtest({ ...strategy, alert: { ...strategy.alert, cooldownMinutes: 0 } }, 'BTCUSDT', {
      '1h': bars,
    })
    const cooldown = backtest({ ...strategy, alert: { ...strategy.alert, cooldownMinutes: 24 * 60 } }, 'BTCUSDT', {
      '1h': bars,
    })
    assert.ok(noCooldown.stats.signals > cooldown.stats.signals)
    assert.equal(cooldown.stats.signals, 1)
  })

  it('higher timeframe only sees candles closed before the decision', () => {
    // H4: giảm dần, riêng nến H4 cuối (chưa đóng tại thời điểm xét) tăng vọt -> không được dùng
    const bars = scenario([{ at: 300, after: [106, 110] }])
    const h4 = Array.from({ length: 120 }, (_, i) => {
      const c = i === 74 ? 1000 : 300 - i
      return { time: T0 + i * 4 * H, open: c, high: c + 1, low: c - 1, close: c, volume: 1 }
    })
    const withTrend: Strategy = {
      ...strategy,
      rules: [...strategy.rules, { type: 'trend', tf: '4h', ma: 'ema', period: 20, weight: 1, required: true }],
    }
    // Nến H1 thứ 300 đóng lúc T0 + 301h; nến H4 thứ 74 mở lúc T0 + 296h, đóng T0 + 300h -> đã đóng: giá 1000 > EMA
    assert.equal(backtest(withTrend, 'BTCUSDT', { '1h': bars, '4h': h4 }).stats.signals, 1)
    // Nến H4 tăng vọt là nến 75 (mở T0 + 300h, đóng T0 + 304h) -> chưa đóng -> xu hướng vẫn giảm -> không có lệnh
    const h4Late = h4.map((b, i) =>
      i === 74 ? { ...b, close: 300 - i, open: 300 - i } : i === 75 ? { ...b, close: 1000 } : b,
    )
    assert.equal(backtest(withTrend, 'BTCUSDT', { '1h': bars, '4h': h4Late }).stats.signals, 0)
  })
})
