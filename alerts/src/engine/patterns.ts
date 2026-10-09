import type { Bar, Pattern, Side } from '../types'

/** Mẫu nến tại nến cuối `bars[i]` theo chiều `side`; trả về tên mẫu tìm thấy hoặc null */
export function findPattern(bars: Bar[], i: number, side: Side, patterns: Pattern[]): string | null {
  for (const p of patterns) {
    if (p === 'engulfing' && engulfing(bars, i, side))
      return side === 'long' ? 'Bullish engulfing' : 'Bearish engulfing'
    if (p === 'pin_bar' && pinBar(bars[i], side))
      return side === 'long' ? 'Pin bar (hammer)' : 'Pin bar (shooting star)'
    if (p === 'inside_bar_break' && insideBarBreak(bars, i, side)) return 'Inside bar breakout'
  }
  return null
}

/** Thân nến hiện tại bao trọn thân nến trước, ngược màu */
export function engulfing(bars: Bar[], i: number, side: Side): boolean {
  const cur = bars[i]
  const prev = bars[i - 1]
  if (!cur || !prev) return false
  if (side === 'long') {
    return prev.close < prev.open && cur.close > cur.open && cur.close >= prev.open && cur.open <= prev.close
  }
  return prev.close > prev.open && cur.close < cur.open && cur.close <= prev.close && cur.open >= prev.open
}

/** Râu dài theo hướng bị từ chối (≥ 2 lần thân và ≥ 60% cả nến), giá đóng ở 1/3 phía còn lại */
export function pinBar(b: Bar, side: Side): boolean {
  const range = b.high - b.low
  if (range <= 0) return false
  const body = Math.abs(b.close - b.open)
  const lowerWick = Math.min(b.open, b.close) - b.low
  const upperWick = b.high - Math.max(b.open, b.close)
  if (side === 'long') return lowerWick >= 2 * body && lowerWick >= 0.6 * range && b.close >= b.low + (2 / 3) * range
  return upperWick >= 2 * body && upperWick >= 0.6 * range && b.close <= b.low + range / 3
}

/** Nến trước nằm trọn trong nến trước nữa (inside bar), nến hiện tại đóng cửa vượt ra */
export function insideBarBreak(bars: Bar[], i: number, side: Side): boolean {
  const mother = bars[i - 2]
  const inside = bars[i - 1]
  const cur = bars[i]
  if (!mother || !inside || !cur) return false
  if (!(inside.high <= mother.high && inside.low >= mother.low)) return false
  return side === 'long' ? cur.close > inside.high : cur.close < inside.low
}
