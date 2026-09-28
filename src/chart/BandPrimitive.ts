import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'

/** Tô nền giữa hai mức giá trên toàn chiều ngang pane (vùng 30–70 của RSI) */
export class BandPrimitive implements ISeriesPrimitive<Time> {
  private series: ISeriesApi<SeriesType, Time> | null = null
  private readonly views: IPrimitivePaneView[]
  private readonly low: number
  private readonly high: number
  private readonly color: string

  constructor(low: number, high: number, color: string) {
    this.low = low
    this.high = high
    this.color = color
    const renderer: IPrimitivePaneRenderer = {
      draw: () => {},
      drawBackground: (target) => {
        const series = this.series
        if (!series) return
        const y1 = series.priceToCoordinate(this.high)
        const y2 = series.priceToCoordinate(this.low)
        if (y1 === null || y2 === null) return
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          context.fillStyle = this.color
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
