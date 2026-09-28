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
import { lineDash, RECT_HANDLES, styleOf } from '../lib/drawings'
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

const HANDLE_COLOR = theme.accent
const HIT_TOLERANCE = 6
const HANDLE_RADIUS = 5
const HANDLE_HIT_RADIUS = 8

/** Kết quả hit-test: hình nào, và điểm neo nào (null = thân hình) */
export interface DrawingHit {
  id: string
  anchor: number | null
}

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
  private hoveredId: string | null = null
  private lockAll = false
  private hideAll = false
  /** Bản nháp của hình đang được kéo (chưa ghi vào store) */
  private draft: Drawing | null = null
  private width = 0
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

  setState(drawings: Drawing[], selectedId: string | null, opts: { lockAll: boolean; hideAll: boolean }) {
    this.lockAll = opts.lockAll
    this.hideAll = opts.hideAll
    // Store đã nhận vị trí mới sau khi kéo -> bỏ bản nháp (không bỏ sớm hơn để tránh nháy hình)
    if (drawings !== this.drawings) this.draft = null
    this.drawings = drawings
    this.selectedId = selectedId
    this.requestUpdate?.()
  }

  setDraft(draft: Drawing | null) {
    this.draft = draft
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
    const draft = this.draft
    const current = (draft ? this.drawings.map((d) => (d.id === draft.id ? draft : d)) : this.drawings).filter(
      (d) => !d.hidden && !this.hideAll,
    )
    const all = this.preview ? [...current, this.preview] : current
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
          backColor: () => styleOf(s.drawing).color,
        }
      })
  }

  paneViews() {
    return this.views
  }

  priceAxisViews() {
    return this.axisViews
  }

  /** lightweight-charts gọi khi rê chuột: đổi con trỏ & hiện điểm neo khi hover (giống TradingView) */
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const hit = this.hitDetail({ x, y })
    const hoveredId = hit?.id ?? null
    if (hoveredId !== this.hoveredId) {
      this.hoveredId = hoveredId
      this.requestUpdate?.()
    }
    if (!hit) return null
    return { externalId: hit.id, zOrder: 'top', cursorStyle: this.cursorFor(hit) }
  }

  isLocked(id: string): boolean {
    return this.lockAll || !!this.drawings.find((d) => d.id === id)?.locked
  }

  private cursorFor(hit: DrawingHit): string {
    if (this.isLocked(hit.id)) return 'pointer'
    if (hit.anchor === null) return 'move'
    const shape = this.shapes.find((s) => s.drawing.id === hit.id)
    if (shape?.drawing.type !== 'rect') return 'pointer'
    // Hình chữ nhật: mũi tên resize theo vị trí điểm neo, như TradingView
    const [xs, ys] = RECT_HANDLES[hit.anchor]
    if (xs === 'm') return 'ns-resize'
    if (ys === 'm') return 'ew-resize'
    const [a, b] = shape.pts
    const dx = xs === 'a' ? a.x - b.x : b.x - a.x
    const dy = ys === 'a' ? a.y - b.y : b.y - a.y
    return dx * dy > 0 ? 'nwse-resize' : 'nesw-resize'
  }

  hit(p: XY): string | null {
    return this.hitDetail(p)?.id ?? null
  }

  /** Vị trí vẽ các điểm neo (đường ngang có 1 điểm neo ở giữa màn hình) */
  private handlePoints({ drawing, pts }: Shape): XY[] {
    if (drawing.type === 'hline') return [{ x: this.width / 2, y: pts[0].y }]
    if (drawing.type === 'rect') {
      const [a, b] = pts
      const pick = (src: string, va: number, vb: number) => (src === 'a' ? va : src === 'b' ? vb : (va + vb) / 2)
      return RECT_HANDLES.map(([xs, ys]) => ({ x: pick(xs, a.x, b.x), y: pick(ys, a.y, b.y) }))
    }
    return pts
  }

  hitDetail(p: XY): DrawingHit | null {
    // Ưu tiên điểm neo của hình đang chọn, sau đó duyệt ngược (hình vẽ sau nằm trên)
    const selected = this.shapes.find((s) => !s.preview && s.drawing.id === this.selectedId)
    if (selected) {
      const idx = this.handlePoints(selected).findIndex((h) => Math.hypot(h.x - p.x, h.y - p.y) <= HANDLE_HIT_RADIUS)
      if (idx >= 0) return { id: selected.drawing.id, anchor: idx }
    }

    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const shape = this.shapes[i]
      const { drawing, pts, preview } = shape
      if (preview) continue
      const idx = this.handlePoints(shape).findIndex((h) => Math.hypot(h.x - p.x, h.y - p.y) <= HANDLE_HIT_RADIUS)
      if (idx >= 0) return { id: drawing.id, anchor: idx }

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
      if (d <= HIT_TOLERANCE) return { id: drawing.id, anchor: null }
    }
    return null
  }

  /** Khung bao (toạ độ pane) của một hình, để đặt thanh công cụ nổi */
  bounds(id: string): { left: number; right: number; top: number; bottom: number } | null {
    const shape = this.shapes.find((s) => s.drawing.id === id)
    if (!shape) return null
    const pts = this.handlePoints(shape)
    return {
      left: Math.min(...pts.map((p) => p.x)),
      right: Math.max(...pts.map((p) => p.x)),
      top: Math.min(...pts.map((p) => p.y)),
      bottom: Math.max(...pts.map((p) => p.y)),
    }
  }

  private draw(target: Target) {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      this.width = mediaSize.width
      for (const shape of this.shapes) {
        const id = shape.drawing.id
        ctx.save()
        this.drawShape(ctx, shape, mediaSize.width, mediaSize.height)
        if (shape.preview || id === this.selectedId || id === this.hoveredId) this.drawHandles(ctx, shape)
        ctx.restore()
      }
    })
  }

  private drawShape(ctx: Ctx, { drawing, pts }: Shape, width: number, height: number) {
    const [a, b] = pts
    const style = styleOf(drawing)
    ctx.lineWidth = style.lineWidth
    ctx.strokeStyle = style.color
    ctx.setLineDash(lineDash(style.lineStyle, style.lineWidth))

    switch (drawing.type) {
      case 'trendline':
        this.line(ctx, a, b)
        break
      case 'ray':
        this.line(ctx, a, extend(a, b))
        break
      case 'hline':
        this.line(ctx, { x: 0, y: a.y }, { x: width, y: a.y })
        break
      case 'vline':
        this.line(ctx, { x: a.x, y: 0 }, { x: a.x, y: height })
        break
      case 'rect': {
        const x = Math.min(a.x, b.x)
        const y = Math.min(a.y, b.y)
        const w = Math.abs(b.x - a.x)
        const h = Math.abs(b.y - a.y)
        // Nền cùng màu viền với độ trong suốt 20% (mặc định của TradingView)
        ctx.fillStyle = withAlpha(style.color, 0.2)
        ctx.fillRect(x, y, w, h)
        ctx.strokeRect(x, y, w, h)
        break
      }
      case 'fib':
        this.drawFib(ctx, drawing, a, b)
        break
    }
  }

  /** Các mức Fibonacci giữ màu riêng; style của hình áp dụng cho đường chéo */
  private drawFib(ctx: Ctx, drawing: Drawing, a: XY, b: XY) {
    const diagonal = { color: ctx.strokeStyle, width: ctx.lineWidth, dash: ctx.getLineDash() }
    ctx.setLineDash([])
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

    // Đường chéo nối 2 điểm neo
    ctx.setLineDash(diagonal.dash)
    ctx.strokeStyle = diagonal.color
    ctx.lineWidth = diagonal.width
    this.line(ctx, a, b)
  }

  private drawHandles(ctx: Ctx, shape: Shape) {
    ctx.setLineDash([])
    ctx.lineWidth = 2
    // Hình bị khoá: điểm neo màu xám (không kéo được)
    ctx.strokeStyle = this.isLocked(shape.drawing.id) ? theme.textDim : HANDLE_COLOR
    ctx.fillStyle = theme.bg
    for (const p of this.handlePoints(shape)) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2)
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
