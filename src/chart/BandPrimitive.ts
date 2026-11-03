import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'

export interface Band {
  low: number
  high: number
  color: string
}

/**
 * Tô nền giữa hai mức giá trên toàn chiều ngang pane (vd. vùng 30–70 của RSI).
 * `band()` đọc mức / màu hiện tại (người dùng sửa được trong Settings); null = không vẽ.
 */
export class BandPrimitive implements ISeriesPrimitive<Time> {
  private series: ISeriesApi<SeriesType, Time> | null = null
  private readonly views: IPrimitivePaneView[]

  constructor(band: () => Band | null) {
    const renderer: IPrimitivePaneRenderer = {
      draw: () => {},
      drawBackground: (target) => {
        const series = this.series
        const b = band()
        if (!series || !b) return
        const y1 = series.priceToCoordinate(b.high)
        const y2 = series.priceToCoordinate(b.low)
        if (y1 === null || y2 === null) return
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          context.fillStyle = b.color
          context.fillRect(0, Math.min(y1, y2), mediaSize.width, Math.abs(y2 - y1))
        })
      },
    }
    this.views = [{ zOrder: () => 'bottom', renderer: () => renderer }]
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this.series = param.series
  }

  detached() {
    this.series = null
  }

  paneViews() {
    return this.views
  }
}
