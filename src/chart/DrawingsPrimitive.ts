import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  PrimitiveHoveredItem,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'
import { formatPrice, pricePrecision } from '../lib/intervals'
import { theme } from '../lib/theme'
import type { Drawing } from '../types'

type Target = Parameters<IPrimitivePaneRenderer['draw']>[0]
type Ctx = CanvasRenderingContext2D

interface XY {
  x: number
  y: number
}

interface Shape {
  drawing: Drawing
  pts: XY[]
  preview: boolean
}

const LINE_COLOR = theme.accent
const RECT_COLOR = 'rgb(156, 39, 176)'
const RECT_FILL = 'rgba(156, 39, 176, 0.2)'
const HIT_TOLERANCE = 6

// Các mức Fibonacci mặc định của TradingView
export const FIB_LEVELS = [
  { level: 0, color: '#787b86' },
  { level: 0.236, color: '#f23645' },
  { level: 0.382, color: '#ff9800' },
  { level: 0.5, color: '#4caf50' },
  { level: 0.618, color: '#089981' },
  { level: 0.786, color: '#00bcd4' },
  { level: 1, color: '#787b86' },
]

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Kéo dài đoạn a->b ra xa (canvas sẽ tự cắt) */
function extend(a: XY, b: XY): XY {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len === 0) return b
  const k = 20000 / len
  return { x: b.x + (b.x - a.x) * k, y: b.y + (b.y - a.y) * k }
}

/**
 * Vẽ toàn bộ hình vẽ (trend line, ray, đường ngang/dọc, hình chữ nhật, Fibonacci)
 * lên pane chính, dùng Primitives API của lightweight-charts.
 */
export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  private series: ISeriesApi<SeriesType, Time> | null = null
  private requestUpdate: (() => void) | null = null
  private drawings: Drawing[] = []
  private preview: Drawing | null = null
  private selectedId: string | null = null
  private shapes: Shape[] = []
  private axisViews: ISeriesPrimitiveAxisView[] = []
  private readonly views: IPrimitivePaneView[]
  private readonly timeToX: (time: number) => number | null

  constructor(timeToX: (time: number) => number | null) {
    this.timeToX = timeToX
    const renderer: IPrimitivePaneRenderer = { draw: (target) => this.draw(target) }
    this.views = [{ zOrder: () => 'top', renderer: () => renderer }]
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this.series = param.series
    this.requestUpdate = param.requestUpdate
  }

  detached() {
    this.series = null
    this.requestUpdate = null
  }

  setState(drawings: Drawing[], selectedId: string | null) {
    this.drawings = drawings
    this.selectedId = selectedId
    this.requestUpdate?.()
  }

  setPreview(preview: Drawing | null) {
    this.preview = preview
    this.requestUpdate?.()
  }

  /** Gọi khi dữ liệu nến thay đổi (toạ độ thời gian có thể dịch chuyển) */
  refresh() {
    this.requestUpdate?.()
  }

  updateAllViews() {
    const series = this.series
    if (!series) return
    const toXY = (d: Drawing) =>
      d.points.map((p) => ({ x: this.timeToX(p.time), y: series.priceToCoordinate(p.price) }))

    const shapes: Shape[] = []
    const all = this.preview ? [...this.drawings, this.preview] : this.drawings
    for (const d of all) {
      const pts = toXY(d)
      // hline không cần x, vline không cần y
      const ok = pts.every((p) => (d.type === 'hline' || p.x !== null) && (d.type === 'vline' || p.y !== null))
      if (!ok) continue
      shapes.push({ drawing: d, pts: pts.map((p) => ({ x: p.x ?? 0, y: p.y ?? 0 })), preview: d === this.preview })
    }
    this.shapes = shapes

    // Nhãn giá trên trục cho đường ngang (giống TradingView)
    this.axisViews = shapes
      .filter((s) => s.drawing.type === 'hline')
      .map((s) => {
        const price = s.drawing.points[0].price
        return {
          coordinate: () => s.pts[0].y,
          text: () => formatPrice(price, pricePrecision(price)),
          textColor: () => '#fff',
          backColor: () => LINE_COLOR,
        }
      })
  }

  paneViews() {
    return this.views
  }

  priceAxisViews() {
    return this.axisViews
  }

  /** Cho biết con trỏ đang nằm trên hình vẽ nào (dùng cho con trỏ chuột & click chọn) */
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const id = this.hit({ x, y })
    return id ? { externalId: id, zOrder: 'top', cursorStyle: 'pointer' } : null
  }

  hit(p: XY): string | null {
    // Duyệt ngược: hình vẽ sau nằm trên
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const { drawing, pts, preview } = this.shapes[i]
      if (preview) continue
      const [a, b] = pts
      let d = Infinity
      switch (drawing.type) {
        case 'trendline':
          d = distToSegment(p, a, b)
          break
        case 'ray':
          d = distToSegment(p, a, extend(a, b))
          break
        case 'hline':
          d = Math.abs(p.y - a.y)
          break
        case 'vline':
          d = Math.abs(p.x - a.x)
          break
        case 'rect':
        case 'fib': {
          const inX = p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)
          const inY = p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
          if (inX && inY) d = 0
          break
        }
      }
      if (d <= HIT_TOLERANCE) return drawing.id
    }
    return null
  }

  private draw(target: Target) {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      for (const shape of this.shapes) {
        ctx.save()
        this.drawShape(ctx, shape, mediaSize.width, mediaSize.height)
        if (shape.preview || shape.drawing.id === this.selectedId) this.drawHandles(ctx, shape, mediaSize.width)
        ctx.restore()
      }
    })
  }

  private drawShape(ctx: Ctx, { drawing, pts }: Shape, width: number, height: number) {
    const [a, b] = pts
    ctx.lineWidth = 2
    ctx.strokeStyle = LINE_COLOR

    switch (drawing.type) {
      case 'trendline':
        this.line(ctx, a, b)
        break
      case 'ray':
        this.line(ctx, a, extend(a, b))
        break
      case 'hline':
        ctx.lineWidth = 1
        this.line(ctx, { x: 0, y: a.y }, { x: width, y: a.y })
        break
      case 'vline':
        ctx.lineWidth = 1
        this.line(ctx, { x: a.x, y: 0 }, { x: a.x, y: height })
        break
      case 'rect': {
        const x = Math.min(a.x, b.x)
        const y = Math.min(a.y, b.y)
        const w = Math.abs(b.x - a.x)
        const h = Math.abs(b.y - a.y)
        ctx.fillStyle = RECT_FILL
        ctx.fillRect(x, y, w, h)
        ctx.lineWidth = 1
        ctx.strokeStyle = RECT_COLOR
        ctx.strokeRect(x, y, w, h)
        break
      }
      case 'fib':
        this.drawFib(ctx, drawing, a, b)
        break
    }
  }

  private drawFib(ctx: Ctx, drawing: Drawing, a: XY, b: XY) {
    const series = this.series!
    const [p1, p2] = drawing.points
    const left = Math.min(a.x, b.x)
    const right = Math.max(a.x, b.x)
    // Mức 0 ở điểm cuối, mức 1 ở điểm đầu (như TradingView)
    const levels = FIB_LEVELS.map((l) => {
      const price = p2.price + (p1.price - p2.price) * l.level
      return { ...l, price, y: series.priceToCoordinate(price) ?? 0 }
    })

    for (let i = 0; i < levels.length - 1; i++) {
      ctx.fillStyle = withAlpha(levels[i + 1].color, 0.15)
      ctx.fillRect(left, levels[i].y, right - left, levels[i + 1].y - levels[i].y)
    }

    ctx.lineWidth = 1
    ctx.font = '11px -apple-system, BlinkMacSystemFont, Roboto, sans-serif'
    ctx.textBaseline = 'bottom'
    ctx.textAlign = 'right'
    for (const l of levels) {
      ctx.strokeStyle = l.color
      this.line(ctx, { x: left, y: l.y }, { x: right, y: l.y })
      ctx.fillStyle = l.color
      ctx.fillText(`${l.level} (${formatPrice(l.price)})`, left - 4, l.y + 6)
    }

    // Đường chéo nét đứt nối 2 điểm neo
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = '#787b86'
    this.line(ctx, a, b)
  }

  private drawHandles(ctx: Ctx, { drawing, pts }: Shape, width: number) {
    ctx.setLineDash([])
    ctx.lineWidth = 2
    ctx.strokeStyle = LINE_COLOR
    ctx.fillStyle = theme.bg
    const handles = drawing.type === 'hline' ? [{ x: width / 2, y: pts[0].y }] : pts
    for (const p of handles) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  private line(ctx: Ctx, a: XY, b: XY) {
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
}
