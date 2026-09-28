import type { AnchorPoint, Candle, Drawing, DrawingTool } from '../types'
import { formatPrice } from './intervals'
import { logicalToTime, timeToLogical } from './timeIndex'

export const DRAWING_LABELS: Record<DrawingTool, string> = {
  trendline: 'Trend Line',
  ray: 'Ray',
  hline: 'Horizontal Line',
  vline: 'Vertical Line',
  rect: 'Rectangle',
  fib: 'Fib Retracement',
}

/** Mô tả ngắn cho Object Tree */
export function describeDrawing(d: Drawing): string {
  const [a, b] = d.points
  const time = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ')
  switch (d.type) {
    case 'hline':
      return formatPrice(a.price)
    case 'vline':
      return time(a.time)
    default:
      return `${formatPrice(a.price)} → ${formatPrice(b.price)}`
  }
}

/** Dịch thời gian đi `bars` nến (có thể là số lẻ / ra ngoài vùng dữ liệu) */
function shiftTime(time: number, bars: number, data: Candle[]): number {
  if (bars === 0) return time
  const logical = timeToLogical(time, data)
  return logical === null ? time : (logicalToTime(logical + bars, data) ?? time)
}

/** Di chuyển cả hình: `bars` nến theo chiều ngang, `dPrice` theo chiều dọc */
export function translateDrawing(d: Drawing, bars: number, dPrice: number, data: Candle[]): AnchorPoint[] {
  return d.points.map((p) => ({
    time: d.type === 'hline' ? p.time : shiftTime(p.time, bars, data),
    price: d.type === 'vline' ? p.price : p.price + dPrice,
  }))
}

/** Đặt lại một điểm neo; đường ngang chỉ đổi giá, đường dọc chỉ đổi thời gian */
export function moveAnchor(d: Drawing, index: number, to: AnchorPoint): AnchorPoint[] {
  return d.points.map((p, i) => {
    if (i !== index) return p
    return {
      time: d.type === 'hline' ? p.time : to.time,
      price: d.type === 'vline' ? p.price : to.price,
    }
  })
}
