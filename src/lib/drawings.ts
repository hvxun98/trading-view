import type { AnchorPoint, Candle, Drawing, DrawingStyle, DrawingTool, LineStyleName } from '../types'
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

const DEFAULT_STYLES: Record<DrawingTool, DrawingStyle> = {
  trendline: { color: '#2962ff', lineWidth: 2, lineStyle: 'solid' },
  ray: { color: '#2962ff', lineWidth: 2, lineStyle: 'solid' },
  hline: { color: '#2962ff', lineWidth: 1, lineStyle: 'solid' },
  vline: { color: '#2962ff', lineWidth: 1, lineStyle: 'solid' },
  rect: { color: '#9c27b0', lineWidth: 1, lineStyle: 'solid' },
  // Fibonacci: style áp dụng cho đường chéo nối 2 điểm neo, các mức giữ màu riêng
  fib: { color: '#787b86', lineWidth: 1, lineStyle: 'dashed' },
}

export function styleOf(d: Drawing): DrawingStyle {
  return { ...DEFAULT_STYLES[d.type], ...d.style }
}

export function lineDash(style: LineStyleName, width: number): number[] {
  if (style === 'dashed') return [4 + width * 2, 4 + width]
  if (style === 'dotted') return [width, width * 2 + 1]
  return []
}

/** Bảng màu giống TradingView: hàng xám + các sắc độ của 10 màu chính */
export const COLOR_PALETTE: string[][] = [
  ['#ffffff', '#d1d4dc', '#b2b5be', '#9598a1', '#787b86', '#5d606b', '#434651', '#2a2e39', '#131722', '#000000'],
  ['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63'],
  ['#faa1a4', '#ffcc80', '#fff59d', '#a5d6a7', '#70ccbd', '#80deea', '#90bff9', '#b39ddb', '#ce93d8', '#f48fb1'],
  ['#f7525f', '#ffb74d', '#fff176', '#81c784', '#42bda8', '#4dd0e1', '#5b9cf6', '#9575cd', '#ba68c8', '#f06292'],
  ['#b22833', '#f57c00', '#fbc02d', '#388e3c', '#056656', '#0097a7', '#1848cc', '#512da8', '#7b1fa2', '#c2185b'],
  ['#801922', '#e65100', '#f57f17', '#1b5e20', '#00332a', '#006064', '#0c3299', '#311b92', '#4a148c', '#880e4f'],
]

export const LINE_WIDTHS = [1, 2, 3, 4]
export const LINE_STYLES: LineStyleName[] = ['solid', 'dashed', 'dotted']

/*
 * Hình chữ nhật có 8 điểm neo như TradingView. Mỗi điểm neo cho biết toạ độ x/y lấy từ
 * điểm 0 ('a'), điểm 1 ('b') hay ở giữa ('m'); kéo điểm neo chỉ sửa đúng các toạ độ đó.
 */
export type RectHandleSource = 'a' | 'b' | 'm'
export const RECT_HANDLES: [RectHandleSource, RectHandleSource][] = [
  ['a', 'a'],
  ['b', 'b'],
  ['a', 'b'],
  ['b', 'a'],
  ['m', 'a'],
  ['m', 'b'],
  ['a', 'm'],
  ['b', 'm'],
]

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
  if (d.type === 'rect') {
    const [xs, ys] = RECT_HANDLES[index]
    const pts = d.points.map((p) => ({ ...p }))
    if (xs !== 'm') pts[xs === 'a' ? 0 : 1].time = to.time
    if (ys !== 'm') pts[ys === 'a' ? 0 : 1].price = to.price
    return pts
  }
  return d.points.map((p, i) => {
    if (i !== index) return p
    return {
      time: d.type === 'hline' ? p.time : to.time,
      price: d.type === 'vline' ? p.price : to.price,
    }
  })
}
