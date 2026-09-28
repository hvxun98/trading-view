import type { AnchorPoint, Candle, Drawing, PositionSettings } from '../types'
import { pricePrecision } from './intervals'

export const DEFAULT_POSITION: PositionSettings = {
  accountSize: 1000,
  lotSize: 1,
  risk: 25,
  riskUnit: 'percent',
  alwaysShowStats: false,
}

export function positionSettings(d: Drawing): PositionSettings {
  return { ...DEFAULT_POSITION, ...d.position }
}

/** Bước giá (tick) theo độ chính xác hiển thị của giá entry */
export function tickSize(price: number): number {
  return 1 / 10 ** pricePrecision(price)
}

/** Làm tròn giá entry / target / stop theo tick (như TradingView) */
export function snapPositionPoints(points: AnchorPoint[]): AnchorPoint[] {
  const tick = tickSize(points[0].price)
  const snap = (v: number) => Number((Math.round(v / tick) * tick).toFixed(pricePrecision(points[0].price)))
  return points.map((p) => ({ ...p, price: snap(p.price) }))
}

export type PositionStatus = 'waiting' | 'open' | 'target' | 'stop'

export interface PositionStats {
  dir: 1 | -1
  precision: number
  qty: number
  riskAmount: number
  rewardAmount: number
  ratio: number
  status: PositionStatus
  /** Nến giá chạm entry (vị thế được mở) */
  openedAt: { time: number; price: number } | null
  /** Điểm đóng (chạm target/stop) hoặc giá hiện tại nếu còn mở */
  lastPoint: { time: number; price: number } | null
  pnl: number
}

/**
 * Tính số lượng, số tiền rủi ro/lợi nhuận và P&L như Long/Short Position của TradingView.
 * P&L: duyệt các nến từ thời điểm bắt đầu tới mép phải của vị thế — giá chạm entry thì mở,
 * sau đó chạm stop (kiểm tra trước, thận trọng) hoặc target thì đóng; còn mở thì tính theo giá đóng cửa mới nhất.
 */
export function positionStats(d: Drawing, bars: Candle[]): PositionStats {
  const [entry, target, stop] = d.points
  const s = positionSettings(d)
  const dir = d.type === 'long' ? 1 : -1
  const riskPerUnit = Math.abs(entry.price - stop.price) * s.lotSize
  const riskAmount = s.riskUnit === 'percent' ? (s.accountSize * s.risk) / 100 : s.risk
  const qty = riskPerUnit > 0 ? riskAmount / riskPerUnit : 0
  const rewardAmount = qty * s.lotSize * Math.abs(target.price - entry.price)
  const ratio = riskPerUnit > 0 ? Math.abs(target.price - entry.price) / Math.abs(entry.price - stop.price) : Infinity

  let status: PositionStatus = 'waiting'
  let openedAt: PositionStats['openedAt'] = null
  let lastPoint: PositionStats['lastPoint'] = null
  const endTime = Math.max(entry.time, target.time)
  for (const bar of bars) {
    if (bar.time < entry.time) continue
    if (bar.time > endTime) break
    if (status === 'waiting') {
      if (bar.low > entry.price || bar.high < entry.price) continue
      status = 'open'
      openedAt = { time: bar.time, price: entry.price }
    }
    const hitStop = dir === 1 ? bar.low <= stop.price : bar.high >= stop.price
    const hitTarget = dir === 1 ? bar.high >= target.price : bar.low <= target.price
    if (hitStop || hitTarget) {
      status = hitStop ? 'stop' : 'target'
      lastPoint = { time: bar.time, price: hitStop ? stop.price : target.price }
      break
    }
    lastPoint = { time: bar.time, price: bar.close }
  }

  const pnl = status === 'waiting' || !lastPoint ? 0 : (lastPoint.price - entry.price) * dir * qty * s.lotSize
  return {
    dir,
    precision: pricePrecision(entry.price),
    qty,
    riskAmount,
    rewardAmount,
    ratio,
    status,
    openedAt,
    lastPoint: status === 'waiting' ? null : lastPoint,
    pnl,
  }
}

export function formatQty(qty: number): string {
  if (!isFinite(qty)) return '—'
  const digits = qty >= 1000 ? 0 : qty >= 1 ? 3 : 4
  return qty.toFixed(digits).replace(/\.?0+$/, '') || '0'
}

export function formatMoney(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
