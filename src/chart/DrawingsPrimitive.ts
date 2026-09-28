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
import { COMMENT_TAIL, lineDash, POSITION_TYPES, RECT_HANDLES, styleOf } from '../lib/drawings'
import { formatPrice, pricePrecision } from '../lib/intervals'
import { theme } from '../lib/theme'
import type { AnchorPoint, Drawing } from '../types'

type Target = Parameters<IPrimitivePaneRenderer['draw']>[0]
type Ctx = CanvasRenderingContext2D

export interface XY {
  x: number
  y: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Shape {
  drawing: Drawing
  pts: XY[]
  preview: boolean
  /** Khung chữ (text/note/callout) hoặc toàn vùng (long/short), tính lúc vẽ để hit-test */
  box?: Box
}

/** Thước đo: 2 điểm + các dòng nhãn đã tính sẵn */
export interface MeasureState {
  points: [AnchorPoint, AnchorPoint]
  lines: string[]
}

const HANDLE_COLOR = theme.accent
const HIT_TOLERANCE = 6
const HANDLE_RADIUS = 5
const HANDLE_HIT_RADIUS = 8
const FONT = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif'
const TEXT_PAD = 6
const NOTE_PIN_RADIUS = 8

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

const PROFIT_FILL = 'rgba(8, 153, 129, 0.2)'
const LOSS_FILL = 'rgba(242, 54, 69, 0.2)'

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

function inBox(p: XY, b: Box | undefined, pad = 0): boolean {
  return !!b && p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad
}

/** Kéo dài đoạn a->b ra xa (canvas sẽ tự cắt) */
function extend(a: XY, b: XY): XY {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len === 0) return b
  const k = 20000 / len
  return { x: b.x + (b.x - a.x) * k, y: b.y + (b.y - a.y) * k }
}

function roundRect(ctx: Ctx, b: Box, r: number) {
  ctx.beginPath()
  ctx.roundRect(b.x, b.y, b.w, b.h, r)
}

/** Hộp nhãn nhiều dòng, căn giữa theo (cx, y); `above` = đặt phía trên y */
function labelBox(ctx: Ctx, lines: string[], cx: number, y: number, above: boolean, bg: string, fg = '#fff') {
  ctx.font = `12px ${FONT}`
  const lh = 16
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16
  const h = lines.length * lh + 8
  const box = { x: cx - w / 2, y: above ? y - h - 6 : y + 6, w, h }
  ctx.fillStyle = bg
  roundRect(ctx, box, 4)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.forEach((l, i) => ctx.fillText(l, cx, box.y + 4 + lh * i + lh / 2))
}

function arrowHead(ctx: Ctx, from: XY, to: XY) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const size = 7
  ctx.beginPath()
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(to.x - size * Math.cos(angle - 0.45), to.y - size * Math.sin(angle - 0.45))
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(to.x - size * Math.cos(angle + 0.45), to.y - size * Math.sin(angle + 0.45))
  ctx.stroke()
}

/**
 * Vẽ toàn bộ hình vẽ + thước đo lên pane chính, dùng Primitives API của lightweight-charts.
 */
export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  private series: ISeriesApi<SeriesType, Time> | null = null
  private requestUpdate: (() => void) | null = null
  private drawings: Drawing[] = []
  private preview: Drawing | null = null
  private selectedId: string | null = null
  private hoveredId: string | null = null
  /** Hình đang sửa chữ (ẩn chữ trên canvas vì ô nhập nằm đè lên) */
  private editingId: string | null = null
  private lockAll = false
  private hideAll = false
  /** Bản nháp của hình đang được kéo (chưa ghi vào store) */
  private draft: Drawing | null = null
  private measure: MeasureState | null = null
  private measurePts: XY[] | null = null
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

  setMeasure(measure: MeasureState | null) {
    this.measure = measure
    this.requestUpdate?.()
  }

  setEditing(id: string | null) {
    this.editingId = id
    this.requestUpdate?.()
  }

  /** Gọi khi dữ liệu nến thay đổi (toạ độ thời gian có thể dịch chuyển) */
  refresh() {
    this.requestUpdate?.()
  }

  private toXY(p: AnchorPoint): { x: number | null; y: number | null } {
    return { x: this.timeToX(p.time), y: this.series?.priceToCoordinate(p.price) ?? null }
  }

  updateAllViews() {
    if (!this.series) return
    const shapes: Shape[] = []
    const draft = this.draft
    const current = (draft ? this.drawings.map((d) => (d.id === draft.id ? draft : d)) : this.drawings).filter(
      (d) => !d.hidden && !this.hideAll,
    )
    const all = this.preview ? [...current, this.preview] : current
    for (const d of all) {
      const pts = d.points.map((p) => this.toXY(p))
      // hline không cần x, vline không cần y
      const ok = pts.every((p) => (d.type === 'hline' || p.x !== null) && (d.type === 'vline' || p.y !== null))
      if (!ok) continue
      const old = this.shapes.find((s) => s.drawing.id === d.id)
      shapes.push({
        drawing: d,
        pts: pts.map((p) => ({ x: p.x ?? 0, y: p.y ?? 0 })),
        preview: d === this.preview,
        box: old?.box,
      })
    }
    this.shapes = shapes

    const m = this.measure?.points.map((p) => this.toXY(p))
    this.measurePts = m && m.every((p) => p.x !== null && p.y !== null) ? (m as XY[]) : null

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
    const type = shape?.drawing.type
    if (type && POSITION_TYPES.includes(type)) return hit.anchor === 3 ? 'ew-resize' : 'ns-resize'
    if (type !== 'rect') return 'pointer'
    // Hình chữ nhật: mũi tên resize theo vị trí điểm neo, như TradingView
    const [xs, ys] = RECT_HANDLES[hit.anchor]
    if (xs === 'm') return 'ns-resize'
    if (ys === 'm') return 'ew-resize'
    const [a, b] = shape!.pts
    const dx = xs === 'a' ? a.x - b.x : b.x - a.x
    const dy = ys === 'a' ? a.y - b.y : b.y - a.y
    return dx * dy > 0 ? 'nwse-resize' : 'nesw-resize'
  }

  hit(p: XY): string | null {
    return this.hitDetail(p)?.id ?? null
  }

  /** Khung chữ đã vẽ (toạ độ pane) — dùng để đặt ô nhập khi sửa chữ */
  textBox(id: string): Box | null {
    return this.shapes.find((s) => s.drawing.id === id)?.box ?? null
  }

  /** Vị trí vẽ các điểm neo */
  private handlePoints({ drawing, pts }: Shape): XY[] {
    switch (drawing.type) {
      case 'hline':
        return [{ x: this.width / 2, y: pts[0].y }]
      case 'text':
      case 'note':
      case 'comment':
        // Text/Note/Comment: kéo thân để di chuyển, không có điểm neo riêng
        return []
      case 'long':
      case 'short': {
        const [entry, target, stop] = pts
        return [entry, { x: entry.x, y: target.y }, { x: entry.x, y: stop.y }, { x: target.x, y: entry.y }]
      }
      case 'rect': {
        const [a, b] = pts
        const pick = (src: string, va: number, vb: number) => (src === 'a' ? va : src === 'b' ? vb : (va + vb) / 2)
        return RECT_HANDLES.map(([xs, ys]) => ({ x: pick(xs, a.x, b.x), y: pick(ys, a.y, b.y) }))
      }
      default:
        return pts
    }
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
      const { drawing, pts, preview, box } = shape
      if (preview) continue
      const idx = this.handlePoints(shape).findIndex((h) => Math.hypot(h.x - p.x, h.y - p.y) <= HANDLE_HIT_RADIUS)
      if (idx >= 0) return { id: drawing.id, anchor: idx }

      const [a, b] = pts
      let hit = false
      switch (drawing.type) {
        case 'trendline':
          hit = distToSegment(p, a, b) <= HIT_TOLERANCE
          break
        case 'ray':
          hit = distToSegment(p, a, extend(a, b)) <= HIT_TOLERANCE
          break
        case 'hline':
          hit = Math.abs(p.y - a.y) <= HIT_TOLERANCE
          break
        case 'vline':
          hit = Math.abs(p.x - a.x) <= HIT_TOLERANCE
          break
        case 'rect':
        case 'fib':
          hit = inBox(p, {
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            w: Math.abs(b.x - a.x),
            h: Math.abs(b.y - a.y),
          })
          break
        case 'long':
        case 'short':
        case 'text':
          hit = inBox(p, box, 2)
          break
        case 'comment':
          // Bong bóng hoặc phần đuôi (từ điểm neo lên tới đáy bong bóng)
          hit = inBox(p, box) || (Math.abs(p.x - a.x - 6) <= 8 && p.y <= a.y + 2 && p.y >= a.y - COMMENT_TAIL - 2)
          break
        case 'note':
          hit = Math.hypot(p.x - a.x, p.y - (a.y - NOTE_PIN_RADIUS)) <= NOTE_PIN_RADIUS + 3 || inBox(p, box)
          break
        case 'callout':
          hit = inBox(p, box) || distToSegment(p, a, b) <= HIT_TOLERANCE
          break
      }
      if (hit) return { id: drawing.id, anchor: null }
    }
    return null
  }

  private draw(target: Target) {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      this.width = mediaSize.width
      for (const shape of this.shapes) {
        const id = shape.drawing.id
        const active = shape.preview || id === this.selectedId || id === this.hoveredId
        ctx.save()
        this.drawShape(ctx, shape, mediaSize.width, mediaSize.height, active)
        ctx.restore()
        if (active) {
          ctx.save()
          this.drawHandles(ctx, shape)
          ctx.restore()
        }
      }
      if (this.measure && this.measurePts) {
        ctx.save()
        this.drawMeasure(ctx, this.measurePts, this.measure.lines)
        ctx.restore()
      }
    })
  }

  private drawShape(ctx: Ctx, shape: Shape, width: number, height: number, active: boolean) {
    const { drawing, pts } = shape
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
      case 'long':
      case 'short':
        this.drawPosition(ctx, shape, active)
        break
      case 'text':
      case 'note':
      case 'callout':
      case 'comment':
        this.drawText(ctx, shape, style.color, style.fontSize, active)
        break
    }
  }

  /** Vị thế mua/bán: vùng chốt lời (xanh) + vùng cắt lỗ (đỏ) + nhãn như TradingView */
  private drawPosition(ctx: Ctx, shape: Shape, active: boolean) {
    const [entry, target, stop] = shape.pts
    const [pe, pt, ps] = shape.drawing.points
    const left = Math.min(entry.x, target.x)
    const right = Math.max(entry.x, target.x)
    const w = right - left

    ctx.setLineDash([])
    ctx.fillStyle = PROFIT_FILL
    ctx.fillRect(left, Math.min(entry.y, target.y), w, Math.abs(target.y - entry.y))
    ctx.fillStyle = LOSS_FILL
    ctx.fillRect(left, Math.min(entry.y, stop.y), w, Math.abs(stop.y - entry.y))
    ctx.strokeStyle = '#787b86'
    ctx.lineWidth = 1
    this.line(ctx, { x: left, y: entry.y }, { x: right, y: entry.y })

    const top = Math.min(target.y, stop.y)
    const bottom = Math.max(target.y, stop.y)
    shape.box = { x: left, y: top, w, h: bottom - top }
    if (!active) return

    const precision = pricePrecision(pe.price)
    const ticks = (d: number) => Math.round(Math.abs(d) * 10 ** precision)
    const pct = (d: number) => ((d / pe.price) * 100).toFixed(2)
    const reward = Math.abs(pt.price - pe.price)
    const risk = Math.abs(ps.price - pe.price)
    const cx = left + w / 2
    const targetAbove = target.y < stop.y
    labelBox(
      ctx,
      [`Target: ${formatPrice(pt.price, precision)} (${pct(pt.price - pe.price)}%) ${ticks(pt.price - pe.price)}`],
      cx,
      target.y,
      targetAbove,
      '#089981',
    )
    labelBox(
      ctx,
      [`Stop: ${formatPrice(ps.price, precision)} (${pct(ps.price - pe.price)}%) ${ticks(ps.price - pe.price)}`],
      cx,
      stop.y,
      !targetAbove,
      '#f23645',
    )
    const ratio = risk === 0 ? '∞' : (reward / risk).toFixed(2)
    labelBox(
      ctx,
      [`Entry: ${formatPrice(pe.price, precision)}`, `Risk/Reward Ratio: ${ratio}`],
      cx,
      entry.y,
      !targetAbove,
      '#5d606b',
    )
  }

  /** Text / Note / Callout */
  private drawText(ctx: Ctx, shape: Shape, color: string, fontSize: number, active: boolean) {
    const { drawing, pts } = shape
    const editing = drawing.id === this.editingId
    const lines = (drawing.text ?? '').split('\n')
    ctx.font = `${fontSize}px ${FONT}`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    const lh = Math.round(fontSize * 1.3)
    const textW = Math.max(8, ...lines.map((l) => ctx.measureText(l).width))
    const textH = lines.length * lh
    const [a, b] = pts

    if (drawing.type === 'text') {
      const box = { x: a.x, y: a.y, w: textW + TEXT_PAD * 2, h: textH + TEXT_PAD * 2 }
      shape.box = box
      if (!editing) {
        ctx.fillStyle = color
        lines.forEach((l, i) => ctx.fillText(l, box.x + TEXT_PAD, box.y + TEXT_PAD + i * lh))
      }
      if (active && !shape.preview) {
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = HANDLE_COLOR
        ctx.lineWidth = 1
        ctx.strokeRect(box.x, box.y, box.w, box.h)
      }
      return
    }

    if (drawing.type === 'note') {
      // Ghim; nội dung chỉ hiện khi rê chuột / đang chọn (như Note của TradingView)
      const pin = { x: a.x, y: a.y - NOTE_PIN_RADIUS }
      ctx.setLineDash([])
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(pin.x, pin.y, NOTE_PIN_RADIUS, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(pin.x - 4, pin.y + 5)
      ctx.lineTo(a.x, a.y + 4)
      ctx.lineTo(pin.x + 4, pin.y + 5)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(pin.x, pin.y, 3, 0, Math.PI * 2)
      ctx.fill()
      const box = {
        x: a.x - 12,
        y: pin.y - NOTE_PIN_RADIUS - 8 - textH - TEXT_PAD * 2,
        w: textW + TEXT_PAD * 2,
        h: textH + TEXT_PAD * 2,
      }
      if (active || editing) {
        shape.box = box
        if (!editing) {
          ctx.fillStyle = theme.panel
          ctx.strokeStyle = color
          ctx.lineWidth = 1
          roundRect(ctx, box, 4)
          ctx.fill()
          ctx.stroke()
          ctx.fillStyle = theme.text
          lines.forEach((l, i) => ctx.fillText(l, box.x + TEXT_PAD, box.y + TEXT_PAD + i * lh))
        }
      } else {
        shape.box = undefined
      }
      return
    }

    if (drawing.type === 'comment') {
      // Bong bóng hội thoại: đuôi chỉ vào điểm neo, bong bóng bo tròn nằm phía trên-phải
      const box = {
        x: a.x,
        y: a.y - COMMENT_TAIL - textH - TEXT_PAD * 2,
        w: textW + TEXT_PAD * 3,
        h: textH + TEXT_PAD * 2,
      }
      shape.box = box
      const r = Math.min(12, box.h / 2)
      const bottom = box.y + box.h
      ctx.setLineDash([])
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(box.x + r, box.y)
      ctx.arcTo(box.x + box.w, box.y, box.x + box.w, bottom, r)
      ctx.arcTo(box.x + box.w, bottom, box.x, bottom, r)
      ctx.lineTo(box.x + 14, bottom)
      ctx.lineTo(a.x, a.y)
      ctx.lineTo(box.x + 2, bottom - 2)
      ctx.arcTo(box.x, bottom, box.x, box.y, Math.min(r, 2))
      ctx.arcTo(box.x, box.y, box.x + box.w, box.y, r)
      ctx.closePath()
      ctx.fill()
      if (active && !shape.preview) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        ctx.stroke()
      }
      if (!editing) {
        ctx.fillStyle = '#fff'
        lines.forEach((l, i) => ctx.fillText(l, box.x + TEXT_PAD * 1.5, box.y + TEXT_PAD + i * lh))
      }
      return
    }

    // Callout: hộp nền màu tại điểm 2, đường chỉ tới điểm 1
    const box = { x: b.x, y: b.y, w: textW + TEXT_PAD * 2 + 4, h: textH + TEXT_PAD * 2 }
    shape.box = box
    ctx.setLineDash([])
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    this.line(ctx, a, { x: box.x + box.w / 2, y: box.y + box.h / 2 })
    ctx.fillStyle = color
    roundRect(ctx, box, 4)
    ctx.fill()
    if (!editing) {
      ctx.fillStyle = '#fff'
      lines.forEach((l, i) => ctx.fillText(l, box.x + TEXT_PAD + 2, box.y + TEXT_PAD + i * lh))
    }
  }

  /** Thước đo: vùng tô + mũi tên ngang/dọc + nhãn (xanh dương nếu tăng, đỏ nếu giảm) */
  private drawMeasure(ctx: Ctx, [a, b]: XY[], lines: string[]) {
    const up = b.y <= a.y
    const color = up ? '#2962ff' : '#f23645'
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const w = Math.abs(b.x - a.x)
    const h = Math.abs(b.y - a.y)
    ctx.fillStyle = withAlpha(color, 0.2)
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    const midX = x + w / 2
    const midY = y + h / 2
    this.line(ctx, { x: midX, y: a.y }, { x: midX, y: b.y })
    arrowHead(ctx, { x: midX, y: a.y }, { x: midX, y: b.y })
    this.line(ctx, { x: a.x, y: midY }, { x: b.x, y: midY })
    arrowHead(ctx, { x: a.x, y: midY }, { x: b.x, y: midY })
    labelBox(ctx, lines, midX, up ? y : y + h, up, color)
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
    ctx.font = `11px ${FONT}`
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
