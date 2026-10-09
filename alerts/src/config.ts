import type { Strategy, SymbolId } from './types'

/**
 * CẤU HÌNH CẢNH BÁO — sửa file này để thêm / đổi chiến lược của bạn rồi deploy lại (npm run deploy).
 * Mỗi điều kiện có trọng số (weight); tỉ lệ điểm ≥ watchAt -> báo "theo dõi", ≥ entryAt -> "gợi ý vào lệnh".
 * `required: true` = bắt buộc đạt (vd. lọc xu hướng khung lớn).
 */

export const SYMBOLS: Record<SymbolId, { kind: 'crypto' | 'metal'; precision: number; name: string }> = {
  BTCUSDT: { kind: 'crypto', precision: 2, name: 'Bitcoin' },
  ETHUSDT: { kind: 'crypto', precision: 2, name: 'Ethereum' },
  XAUUSD: { kind: 'metal', precision: 2, name: 'Gold' },
  XAGUSD: { kind: 'metal', precision: 3, name: 'Silver' },
}

export const STRATEGIES: Strategy[] = [
  {
    // Ví dụ 1: theo xu hướng H4, chờ giá hồi về EMA50 H1 rồi có nến xác nhận
    id: 'trend-pullback-h1',
    name: 'Hồi về EMA theo xu hướng H4',
    symbols: ['XAUUSD', 'BTCUSDT'],
    timeframe: '1h',
    rules: [
      { type: 'trend', tf: '4h', ma: 'ema', period: 200, weight: 2, required: true },
      { type: 'pullback', ma: 'ema', period: 50, toleranceAtr: 0.5, weight: 2 },
      { type: 'rsi', period: 14, longBelow: 45, shortAbove: 55, weight: 1 },
      { type: 'pattern', patterns: ['engulfing', 'pin_bar'], weight: 2 },
      { type: 'volume_spike', period: 20, mult: 1.5, weight: 1 },
    ],
    alert: { watchAt: 0.6, entryAt: 0.85, cooldownMinutes: 240 },
    risk: { sl: { type: 'swing', lookback: 10, bufferAtr: 0.3 }, rr: [1.5, 3] },
  },
  {
    // Ví dụ 2: phá đỉnh / đáy 20 nến M15 có volume, cùng chiều EMA50 H1
    id: 'breakout-m15',
    name: 'Phá vỡ 20 nến M15 có volume',
    symbols: ['XAUUSD', 'BTCUSDT'],
    timeframe: '15m',
    rules: [
      { type: 'breakout', lookback: 20, weight: 2, required: true },
      { type: 'volume_spike', period: 20, mult: 1.8, weight: 2 },
      { type: 'trend', tf: '1h', ma: 'ema', period: 50, weight: 1 },
      { type: 'macd', fast: 12, slow: 26, signal: 9, weight: 1 },
    ],
    alert: { watchAt: 0.66, entryAt: 1, cooldownMinutes: 120 },
    risk: { sl: { type: 'atr', period: 14, mult: 1.5 }, rr: [1.5, 3] },
  },
]
