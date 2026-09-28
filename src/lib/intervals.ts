import type { Interval } from '../types'

export const INTERVALS: { value: Interval; label: string; seconds: number }[] = [
  { value: '1m', label: '1m', seconds: 60 },
  { value: '5m', label: '5m', seconds: 300 },
  { value: '15m', label: '15m', seconds: 900 },
  { value: '1h', label: '1H', seconds: 3600 },
  { value: '4h', label: '4H', seconds: 14400 },
  { value: '1d', label: '1D', seconds: 86400 },
  { value: '1w', label: '1W', seconds: 604800 },
]

export function intervalSeconds(interval: Interval): number {
  return INTERVALS.find((i) => i.value === interval)!.seconds
}

export function intervalLabel(interval: Interval): string {
  return INTERVALS.find((i) => i.value === interval)!.label
}

/** Số chữ số thập phân hợp lý theo độ lớn giá (thay cho tickSize của sàn). */
export function pricePrecision(price: number): number {
  if (price >= 1000) return 2
  if (price >= 10) return 3
  if (price >= 1) return 4
  if (price >= 0.01) return 5
  return 8
}

export function formatPrice(price: number, precision = pricePrecision(price)): string {
  return price.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
    useGrouping: false,
  })
}

export function formatVolume(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K'
  return v.toFixed(2)
}
