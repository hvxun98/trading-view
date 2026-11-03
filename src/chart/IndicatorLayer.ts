import {
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  LineType,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineWidth,
  type PriceFormat,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import {
  fillStyle,
  indicatorDef,
  indicatorInputs,
  indicatorLevels,
  indicatorPrecision,
  plotStyle,
  visibleOn,
  type IndicatorDef,
  type PlotValues,
} from '../lib/indicators'
import { shift } from '../lib/ta'
import type { Candle, Indicator, Interval, LineStyleName } from '../types'
import { BandPrimitive } from './BandPrimitive'
import { FillPrimitive } from './FillPrimitive'

type PlotSeries = ISeriesApi<'Line'> | ISeriesApi<'Histogram'>

interface Handle {
  ind: Indicator
  def: IndicatorDef
  /** Một series cho mỗi plot, cùng thứ tự với def.plots */
  series: PlotSeries[]
  /** Loại series của từng plot ('l' / 'h') — đổi sang / từ histogram thì phải tạo lại series */
  structure: string
  values: PlotValues
  /** Tham số lúc tính `values` (JSON) — đổi thì tính lại */
  inputsKey: string
  priceLines: IPriceLine[]
  primitives: (BandPrimitive | FillPrimitive)[]
  /** Chỉ báo có tín hiệu (VSA): series ẩn mang giá trị neo + lớp ký hiệu gắn vào nó */
  markers: { anchor: ISeriesApi<'Line'>; api: ISeriesMarkersPluginApi<Time> } | null
}

const BULLISH = '#089981'
const BEARISH = '#f23645'

/** Pane chỉ báo mới chiếm 1 phần, pane giá 3 phần (như tỉ lệ mặc định của TradingView) */
const MAIN_STRETCH = 3

const LINE_STYLES: Record<LineStyleName, LineStyle> = {
  solid: LineStyle.Solid,
  dashed: LineStyle.Dashed,
  dotted: LineStyle.Dotted,
}

const structureOf = (ind: Indicator, def: IndicatorDef) =>
  def.plots.map((p) => (plotStyle(ind, p).plotType === 'histogram' ? 'h' : 'l')).join('')

/**
 * Các chỉ báo của một biểu đồ: tạo / xoá series (pane riêng cho chỉ báo dao động), tính lại khi đổi dữ liệu
 * hoặc tham số, áp dụng kiểu vẽ. Dữ liệu luôn là phần nến đang hiển thị (khi replay chỉ tới nến hiện tại).
 */
export class IndicatorLayer {
  private readonly chart: IChartApi
  private readonly handles = new Map<string, Handle>()
  private data: Candle[] = []
  private pricePrecision = 2
  private invertScale = false
  private interval: Interval = '1h'

  constructor(chart: IChartApi) {
    this.chart = chart
  }

  /** Đồng bộ với danh sách chỉ báo trong store và khung thời gian đang xem (tab Visibility) */
  sync(list: Indicator[], interval: Interval) {
    this.interval = interval
    for (const [id, h] of this.handles) {
      if (!list.some((i) => i.id === id)) this.destroy(h)
    }
    for (const ind of list) {
      const h = this.handles.get(ind.id)
      if (!h) {
        this.create(ind)
        continue
      }
      const prevStyles = h.ind.styles
      h.ind = ind
      if (structureOf(ind, h.def) !== h.structure) {
        // Đổi kiểu vẽ sang / từ histogram: tạo lại series trong chính pane cũ (giữ chiều cao pane)
        this.build(h, h.series[0].getPane().paneIndex())
        this.fill(h)
      } else if (JSON.stringify(indicatorInputs(ind)) !== h.inputsKey) this.fill(h)
      else if (JSON.stringify(ind.styles) !== JSON.stringify(prevStyles)) this.setSeriesData(h)
      this.applyStyle(h)
    }
  }

  /** Thay toàn bộ dữ liệu (tải mới, tải thêm lịch sử, replay) */
  setData(data: Candle[]) {
    this.data = data
    for (const h of this.handles.values()) this.fill(h)
  }

  /** Cập nhật nến cuối (realtime / replay từng nến); `data` kết thúc bằng nến đó */
  update(data: Candle[]) {
    this.data = data
    const i = data.length - 1
    const bar = data[i]
    if (!bar) return
    for (const h of this.handles.values()) {
      const inputs = indicatorInputs(h.ind)
      // Giá trị ở nến cũ cũng đổi (Chikou, offset âm): vẽ lại toàn bộ
      if (h.def.repaints || h.def.markers || Number(inputs.offset ?? 0) < 0) {
        this.fill(h)
        continue
      }
      h.values = this.compute(h)
      // Một đường vừa bắt đầu / kết thúc khoảng trống (vd. Supertrend đổi xu hướng): cần sửa màu điểm cũ
      const gapChanged = h.def.plots.some((p) => {
        const v = h.values[p.key]
        return i > 0 && Number.isFinite(v[i]) !== Number.isFinite(v[i - 1])
      })
      if (gapChanged) {
        this.setSeriesData(h)
        continue
      }
      h.def.plots.forEach((plot, p) => {
        const values = h.values[plot.key]
        h.series[p].update(point(bar.time, values[i], values[i - 1], plot.barColor))
      })
      this.applyPriceLabels(h)
    }
  }

  /**
   * Nhãn giá trị cuối trên trục giá. Đường thưa (cột khối lượng theo mức của VSA / Volume): chỉ đường có giá trị
   * ở nến cuối mới hiện nhãn, để trục giá không bị một chồng nhãn cũ.
   */
  private applyPriceLabels(h: Handle) {
    const last = this.data.length - 1
    h.def.plots.forEach((plot, p) => {
      const lastValueVisible =
        h.ind.priceLabels !== false && (!plot.sparse || Number.isFinite(h.values[plot.key]?.[last]))
      h.series[p].applyOptions({ lastValueVisible })
    })
  }

  setPricePrecision(precision: number) {
    this.pricePrecision = precision
    for (const h of this.handles.values()) this.applyStyle(h)
  }

  getPricePrecision() {
    return this.pricePrecision
  }

  setInvertScale(invert: boolean) {
    this.invertScale = invert
    for (const h of this.handles.values()) {
      if (!h.def.overlay) h.series[0].priceScale().applyOptions({ invertScale: invert })
    }
  }

  /** Giá trị các plot tại nến thứ `index` (null = nến cuối), lùi thêm `back` nến — cho legend */
  valuesAt(id: string, index: number | null, back = 0): number[] {
    const h = this.handles.get(id)
    if (!h) return []
    const n = this.data.length
    const i = (index === null || index >= n ? n - 1 : index) - back
    return h.def.plots.map((p) => h.values[p.key]?.[i] ?? NaN)
  }

  /** Pane chứa chỉ báo (0 = pane giá) */
  paneOf(id: string): HTMLElement | null {
    return this.handles.get(id)?.series[0].getPane().getHTMLElement() ?? null
  }

  private shown(h: Handle) {
    return !h.ind.hidden && visibleOn(h.ind, this.interval)
  }

  private create(ind: Indicator) {
    const def = indicatorDef(ind.type)
    const h: Handle = {
      ind,
      def,
      series: [],
      structure: '',
      values: {},
      inputsKey: '',
      priceLines: [],
      primitives: [],
      markers: null,
    }
    // Chỉ báo dao động: thêm pane mới ở dưới cùng; mọi plot của nó dùng chung pane này
    const paneIndex = def.overlay ? 0 : this.chart.panes().length
    this.build(h, paneIndex)
    if (!def.overlay) {
      const panes = this.chart.panes()
      if (panes.length === 2) panes[0].setStretchFactor(MAIN_STRETCH)
      panes[paneIndex]?.setStretchFactor(1)
    }
    this.handles.set(ind.id, h)
    this.fill(h)
    this.applyStyle(h)
  }

  /** Tạo series + lớp tô nền của chỉ báo trong pane `paneIndex`, thay cho series cũ (nếu có) */
  private build(h: Handle, paneIndex: number) {
    const { chart } = this
    const old = h.series
    h.structure = structureOf(h.ind, h.def)
    h.series = h.def.plots.map((_, p) =>
      h.structure[p] === 'h'
        ? chart.addSeries(HistogramSeries, { priceLineVisible: false }, paneIndex)
        : chart.addSeries(
            LineSeries,
            {
              priceLineVisible: false,
              crosshairMarkerRadius: 3,
              // Trục giá luôn chứa đủ các mức ngang (vd. RSI 30–70)
              autoscaleInfoProvider: p === 0 ? (original: () => AutoscaleResult) => this.autoscale(h, original) : undefined,
            },
            paneIndex,
          ),
    )
    const oldMarkers = h.markers
    h.markers = null
    if (h.def.markers) {
      const anchor = chart.addSeries(
        LineSeries,
        {
          lineVisible: false,
          pointMarkersVisible: false,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        },
        paneIndex,
      )
      h.markers = { anchor, api: createSeriesMarkers(anchor, []) }
    }
    const first = h.series[0]
    if (!h.def.overlay) {
      first.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 }, invertScale: this.invertScale })
    }

    h.priceLines = []
    h.primitives = []
    for (const fill of h.def.fills ?? []) {
      const between = fill.between
      const prim =
        'levels' in between
          ? new BandPrimitive(() => {
              const style = fillStyle(h.ind, fill)
              const levels = indicatorLevels(h.ind)
              const a = levels[between.levels[0]]
              const b = levels[between.levels[1]]
              if (!this.shown(h) || !style.visible || !a || !b) return null
              return { low: Math.min(a.price, b.price), high: Math.max(a.price, b.price), color: style.color }
            })
          : new FillPrimitive(() => {
              const style = fillStyle(h.ind, fill)
              if (!this.shown(h) || !style.visible) return null
              const [ka, kb] = between.plots
              return { a: h.values[ka] ?? [], b: h.values[kb] ?? [], color: style.color, color2: style.color2 }
            })
      first.attachPrimitive(prim)
      h.primitives.push(prim)
    }
    // Thêm series mới trước rồi mới xoá series cũ để pane không bị xoá giữa chừng
    for (const s of old) chart.removeSeries(s)
    if (oldMarkers) chart.removeSeries(oldMarkers.anchor)
  }

  private destroy(h: Handle) {
    this.handles.delete(h.ind.id)
    // Pane trống tự bị xoá (lightweight-charts), các pane bên dưới dồn lên
    for (const s of h.series) this.chart.removeSeries(s)
    if (h.markers) this.chart.removeSeries(h.markers.anchor)
  }

  private compute(h: Handle): PlotValues {
    const inputs = indicatorInputs(h.ind)
    h.inputsKey = JSON.stringify(inputs)
    const values = h.def.compute(this.data, inputs)
    const offset = Number(inputs.offset ?? 0)
    if (!offset) return values
    return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, shift(v, offset)]))
  }

  private fill(h: Handle) {
    h.values = this.compute(h)
    this.setSeriesData(h)
  }

  private setSeriesData(h: Handle) {
    h.def.plots.forEach((plot, p) => {
      const values = h.values[plot.key]
      // Nến chưa đủ dữ liệu vẫn có mặt (không có giá trị) để trục thời gian khớp với nến
      const points: { time: UTCTimestamp; value?: number; color?: string }[] = this.data.map((c, i) =>
        point(c.time, values[i], values[i - 1], plot.barColor),
      )
      // Đường bị ngắt quãng (Supertrend…): lightweight-charts nối thẳng qua các điểm trống, và đoạn nối mang màu
      // của điểm đầu đoạn -> cho điểm cuối trước mỗi khoảng trống trong suốt để tạo chỗ đứt như "linebr"
      if (h.structure[p] === 'l' && plotStyle(h.ind, plot).plotType !== 'circles') {
        let nextValid = false
        for (let i = values.length - 1; i >= 0; i--) {
          if (!Number.isFinite(values[i])) continue
          if (nextValid && !Number.isFinite(values[i + 1])) points[i].color = 'transparent'
          nextValid = true
        }
      }
      h.series[p].setData(points as never)
    })
    this.applyPriceLabels(h)
    if (h.markers && h.def.markers) {
      const { anchor, list } = h.def.markers
      const values = h.values[anchor] ?? []
      h.markers.anchor.setData(this.data.map((c, i) => point(c.time, values[i], NaN)))
      h.markers.api.setMarkers(
        list(h.values, indicatorInputs(h.ind))
          .filter((m) => this.data[m.index])
          .map((m) => ({
            time: this.data[m.index].time,
            position: 'aboveBar' as const,
            shape: m.bullish ? ('arrowUp' as const) : ('arrowDown' as const),
            color: m.bullish ? BULLISH : BEARISH,
            text: m.text,
            size: 0.6,
          })),
      )
    }
  }

  private applyStyle(h: Handle) {
    const { ind, def } = h
    const shown = this.shown(h)
    const precision = indicatorPrecision(ind, this.pricePrecision)
    const priceFormat: PriceFormat =
      def.precision === 'volume' && ind.precision === undefined
        ? { type: 'volume', precision: 0, minMove: 1 }
        : { type: 'price', precision, minMove: 1 / 10 ** precision }
    def.plots.forEach((plot, p) => {
      const style = plotStyle(ind, plot)
      const common = {
        visible: shown && style.visible,
        color: style.color,
        priceFormat,
      }
      const series = h.series[p]
      if (h.structure[p] === 'h') {
        series.applyOptions(common)
        return
      }
      const circles = style.plotType === 'circles'
      ;(series as ISeriesApi<'Line'>).applyOptions({
        ...common,
        lineWidth: style.lineWidth as LineWidth,
        lineStyle: LINE_STYLES[style.lineStyle],
        lineType: style.plotType === 'step' ? LineType.WithSteps : LineType.Simple,
        lineVisible: !circles,
        pointMarkersVisible: circles,
        pointMarkersRadius: circles ? style.lineWidth + 1 : undefined,
      })
    })

    h.markers?.anchor.applyOptions({ visible: shown, priceFormat })
    this.applyPriceLabels(h)

    const first = h.series[0]
    for (const line of h.priceLines) first.removePriceLine(line)
    h.priceLines = shown
      ? indicatorLevels(ind)
          .filter((l) => l.visible)
          .map((l) =>
            first.createPriceLine({
              price: l.price,
              color: l.color,
              lineWidth: 1,
              lineStyle: LINE_STYLES[l.lineStyle],
              axisLabelVisible: false,
            }),
          )
      : []
  }

  private autoscale(h: Handle, original: () => AutoscaleResult): AutoscaleResult {
    const res = original()
    if (!res || h.def.overlay) return res
    const levels = indicatorLevels(h.ind).filter((l) => l.visible)
    if (!levels.length) return res
    const prices = levels.map((l) => l.price)
    return {
      ...res,
      priceRange: {
        minValue: Math.min(res.priceRange.minValue, ...prices),
        maxValue: Math.max(res.priceRange.maxValue, ...prices),
      },
    }
  }
}

type AutoscaleResult = { priceRange: { minValue: number; maxValue: number } } | null

function point(time: UTCTimestamp, value: number, prev: number, barColor?: (v: number, prev: number) => string) {
  if (!Number.isFinite(value)) return { time }
  return barColor ? { time, value, color: barColor(value, Number.isFinite(prev) ? prev : 0) } : { time, value }
}
