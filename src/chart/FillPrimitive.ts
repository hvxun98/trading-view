import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  Logical,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'

export interface Fill {
  /** Hai mảng cùng chỉ số với dữ liệu nến (chỉ số = logical index trên trục thời gian) */
  a: number[]
  b: number[]
  /** Màu khi a ≥ b */
  color: string
  /** Màu khi a < b (mặc định = color) */
  color2?: string
}

type Point = [number, number]

/**
 * Tô nền giữa hai đường của chỉ báo (dải Bollinger, mây Ichimoku…). Khi hai đường cắt nhau, vùng được tách
 * đúng tại giao điểm để mỗi phần mang màu của nó. `fill()` trả về null = không vẽ.
 */
export class FillPrimitive implements ISeriesPrimitive<Time> {
  private series: ISeriesApi<SeriesType, Time> | null = null
  private chart: IChartApi | null = null
  private readonly views: IPrimitivePaneView[]

  constructor(fill: () => Fill | null) {
    const renderer: IPrimitivePaneRenderer = {
      draw: () => {},
      drawBackground: (target) => {
        const { series, chart } = this
        const f = fill()
        const range = chart?.timeScale().getVisibleLogicalRange()
        if (!series || !chart || !range || !f) return
        const { a, b } = f
        const from = Math.max(0, Math.floor(range.from) - 1)
        const to = Math.min(a.length - 1, Math.ceil(range.to) + 1)

        target.useMediaCoordinateSpace(({ context }) => {
          let top: Point[] = []
          let bottom: Point[] = []
          let above = true
          const flush = () => {
            if (top.length > 1) {
              context.fillStyle = above ? f.color : (f.color2 ?? f.color)
              context.beginPath()
              top.forEach(([x, y], i) => (i ? context.lineTo(x, y) : context.moveTo(x, y)))
              for (let i = bottom.length - 1; i >= 0; i--) context.lineTo(bottom[i][0], bottom[i][1])
              context.closePath()
              context.fill()
            }
            top = []
            bottom = []
          }

          let prev: { x: number; ya: number; yb: number; d: number } | null = null
          for (let i = from; i <= to; i++) {
            const x = chart.timeScale().logicalToCoordinate(i as Logical)
            const ya = Number.isFinite(a[i]) ? series.priceToCoordinate(a[i]) : null
            const yb = Number.isFinite(b[i]) ? series.priceToCoordinate(b[i]) : null
            if (x === null || ya === null || yb === null) {
              flush()
              prev = null
              continue
            }
            const d = a[i] - b[i]
            if (!prev) above = d >= 0
            else if (d >= 0 !== above) {
              // Cắt nhau giữa nến trước và nến này: kết thúc vùng cũ tại giao điểm, bắt đầu vùng mới từ đó
              const k = prev.d / (prev.d - d)
              const cross: Point = [prev.x + (x - prev.x) * k, prev.ya + (ya - prev.ya) * k]
              top.push(cross)
              bottom.push(cross)
              flush()
              above = d >= 0
              top.push(cross)
              bottom.push(cross)
            }
            top.push([x, ya])
            bottom.push([x, yb])
            prev = { x, ya, yb, d }
          }
          flush()
        })
      },
    }
    this.views = [{ zOrder: () => 'bottom', renderer: () => renderer }]
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this.series = param.series
    this.chart = param.chart
  }

  detached() {
    this.series = null
    this.chart = null
  }

  paneViews() {
    return this.views
  }
}
