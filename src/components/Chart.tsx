import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Logical,
  type LogicalRange,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts'
import { BandPrimitive } from '../chart/BandPrimitive'
import { DrawingsPrimitive } from '../chart/DrawingsPrimitive'
import { binanceFeed } from '../data/binance'
import { mockFeed } from '../data/mock'
import { DRAWING_LABELS, moveAnchor, translateDrawing } from '../lib/drawings'
import { pricePrecision } from '../lib/intervals'
import { computeRsi } from '../lib/rsi'
import { theme } from '../lib/theme'
import { logicalToTime, timeToLogical } from '../lib/timeIndex'
import { useChartStore } from '../store/useChartStore'
import type { AnchorPoint, Candle, DataFeed, Drawing, DrawingTool } from '../types'
import { Legend } from './Legend'

const BAR_SPACING = 8
const RIGHT_OFFSET = 10
/** Giới hạn số trang lịch sử tải thêm khi nhảy tới một ngày cũ */
const MAX_JUMP_PAGES = 50
const RSI_PERIOD = 14
const RSI_COLOR = '#7e57c2'
/** Công cụ chỉ cần 1 click */
const ONE_CLICK_TOOLS: DrawingTool[] = ['hline', 'vline']
const NO_DRAWINGS: Drawing[] = []

const volumeBar = (c: Candle) => ({
  time: c.time,
  value: c.volume,
  color: c.close >= c.open ? theme.upVolume : theme.downVolume,
})

interface SelectOverlay {
  x: number
  right: number
  bottom: number
}

export function Chart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const rsiRef = useRef<ISeriesApi<'Line'> | null>(null)
  const drawingsRef = useRef<DrawingsPrimitive | null>(null)
  /** Điểm neo đầu tiên của hình vẽ 2 điểm đang vẽ dở */
  const pendingRef = useRef<AnchorPoint | null>(null)

  /** Toàn bộ dữ liệu đã tải (kể cả phần "tương lai" khi đang replay) */
  const dataRef = useRef<Candle[]>([])
  const feedRef = useRef<DataFeed>(binanceFeed)
  const loadingOlderRef = useRef<Promise<boolean> | null>(null)
  const noMoreHistoryRef = useRef(false)
  /** Index nến cuối cùng đang hiển thị khi replay */
  const replayIndexRef = useRef(-1)

  const [hovered, setHovered] = useState<Candle | null>(null)
  const [last, setLast] = useState<Candle | null>(null)
  const [prevClose, setPrevClose] = useState<number | null>(null)
  const [selectOverlay, setSelectOverlay] = useState<SelectOverlay | null>(null)
  const [scrolledBack, setScrolledBack] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; drawingId: string | null } | null>(null)
  const [rsiHovered, setRsiHovered] = useState<number | null>(null)
  const [rsiLast, setRsiLast] = useState<number | null>(null)
  const [rsiTop, setRsiTop] = useState<number | null>(null)

  const {
    symbol,
    interval,
    replayMode,
    replayPlaying,
    replaySpeed,
    replayStep,
    replayJump,
    resetViewNonce,
    invertScale,
    rsiEnabled,
    activeTool,
    selectedDrawingId,
  } = useChartStore()
  const drawings = useChartStore((s) => s.drawings[s.symbol]) ?? NO_DRAWINGS
  const {
    setFeedName,
    activateReplay,
    setPlaying,
    setReplayTime,
    resetView,
    toggleInvertScale,
    toggleRsi,
    clearDrawings,
    addDrawing,
    removeDrawing,
  } = useChartStore.getState()
  const replayModeRef = useRef(replayMode)
  replayModeRef.current = replayMode

  const visibleData = () =>
    replayModeRef.current === 'active' ? dataRef.current.slice(0, replayIndexRef.current + 1) : dataRef.current

  const render = (data: Candle[]) => {
    candleRef.current?.setData(data)
    volumeRef.current?.setData(data.map(volumeBar))
    setLast(data.at(-1) ?? null)
    if (rsiRef.current) {
      const rsi = computeRsi(data, RSI_PERIOD)
      rsiRef.current.setData(rsi)
      setRsiLast(rsi.at(-1)?.value ?? null)
    }
    drawingsRef.current?.refresh()
  }

  /** Cập nhật nến cuối (realtime hoặc replay). `data` là dữ liệu đang hiển thị, kết thúc bằng `bar`. */
  const pushBar = (bar: Candle, data: Candle[]) => {
    candleRef.current?.update(bar)
    volumeRef.current?.update(volumeBar(bar))
    setLast(bar)
    if (rsiRef.current) {
      const point = computeRsi(data, RSI_PERIOD).at(-1)
      if (point) {
        rsiRef.current.update(point)
        setRsiLast(point.value)
      }
    }
  }

  const measureRsiPane = () => {
    const pane = chartRef.current?.panes()[1]?.getHTMLElement()
    const container = containerRef.current
    setRsiTop(pane && container ? pane.getBoundingClientRect().top - container.getBoundingClientRect().top : null)
  }

  const startReplayAt = (idx: number) => {
    const data = dataRef.current
    if (!data.length) return
    // Giữ lại ít nhất 1 nến "tương lai" để có cái mà phát
    replayIndexRef.current = Math.min(Math.max(idx, 0), data.length - 2)
    setSelectOverlay(null)
    // Giữ nguyên khung nhìn như TradingView: phần bên phải điểm chọn trở thành vùng trống
    const timeScale = chartRef.current?.timeScale()
    const range = timeScale?.getVisibleLogicalRange()
    // Cắt tường minh: lúc này replayMode vẫn là 'selecting' nên không dùng visibleData() được
    render(data.slice(0, replayIndexRef.current + 1))
    if (range) timeScale?.setVisibleLogicalRange(range)
    setReplayTime(data[replayIndexRef.current]?.time ?? null)
    activateReplay()
  }

  /** Tải thêm 1 trang lịch sử cũ hơn. Trả về false nếu không còn dữ liệu. */
  const loadOlder = (): Promise<boolean> => {
    if (loadingOlderRef.current) return loadingOlderRef.current
    const first = dataRef.current[0]
    if (!first || noMoreHistoryRef.current) return Promise.resolve(false)

    const task = (async () => {
      try {
        const older = await feedRef.current.getHistory(symbol, interval, first.time * 1000 - 1, 1000)
        // Bỏ qua nếu symbol/interval đã đổi trong lúc chờ
        if (dataRef.current[0] !== first) return false
        const fresh = older.filter((c) => c.time < first.time)
        if (fresh.length === 0) {
          noMoreHistoryRef.current = true
          return false
        }
        dataRef.current = [...fresh, ...dataRef.current]
        if (replayIndexRef.current >= 0) replayIndexRef.current += fresh.length
        render(visibleData())
        return true
      } catch {
        return false
      } finally {
        loadingOlderRef.current = null
      }
    })()
    loadingOlderRef.current = task
    return task
  }

  // 1. Khởi tạo chart một lần
  useEffect(() => {
    const chart = createChart(containerRef.current!, {
      autoSize: true,
      localization: { locale: 'en-US' },
      layout: {
        background: { type: ColorType.Solid, color: theme.bg },
        textColor: theme.text,
        fontSize: 12,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: theme.crosshair, style: LineStyle.Dashed, labelBackgroundColor: '#363a45' },
        horzLine: { color: theme.crosshair, style: LineStyle.Dashed, labelBackgroundColor: '#363a45' },
      },
      rightPriceScale: { borderColor: theme.border, scaleMargins: { top: 0.1, bottom: 0.2 } },
      timeScale: {
        borderColor: theme.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: RIGHT_OFFSET,
        barSpacing: BAR_SPACING,
      },
    })

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: theme.up,
      downColor: theme.down,
      borderUpColor: theme.up,
      borderDownColor: theme.down,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
    })

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })

    chartRef.current = chart
    candleRef.current = candles
    volumeRef.current = volume

    // Lớp hình vẽ: toạ độ x tính từ thời gian để không lệch khi tải thêm lịch sử
    const drawingsPrimitive = new DrawingsPrimitive((time) => {
      const logical = timeToLogical(time, dataRef.current)
      return logical === null ? null : chart.timeScale().logicalToCoordinate(logical as Logical)
    })
    candles.attachPrimitive(drawingsPrimitive)
    drawingsRef.current = drawingsPrimitive

    /** Điểm neo tại toạ độ trong pane giá (x bắt dính vào nến gần nhất) */
    const anchorAt = (x: number, y: number): AnchorPoint | null => {
      const logical = chart.timeScale().coordinateToLogical(x)
      if (logical === null) return null
      const time = logicalToTime(Math.round(logical), dataRef.current)
      const price = candles.coordinateToPrice(y)
      return time === null || price === null ? null : { time, price }
    }

    // Crosshair: legend OHLC + vạch chọn điểm replay
    const onMove = (param: MouseEventParams<Time>) => {
      if (replayModeRef.current === 'selecting' && param.point && param.logical !== undefined) {
        const x = chart.timeScale().logicalToCoordinate(Math.round(param.logical) as Logical)
        setSelectOverlay(
          x === null
            ? null
            : { x, right: chart.priceScale('right').width(), bottom: chart.timeScale().height() },
        )
      } else {
        setSelectOverlay(null)
      }

      // Xem trước hình vẽ 2 điểm đang vẽ dở
      const tool = useChartStore.getState().activeTool
      if (tool !== 'cursor' && pendingRef.current && param.point && (param.paneIndex ?? 0) === 0) {
        const end = anchorAt(param.point.x, param.point.y)
        if (end) drawingsPrimitive.setPreview({ id: 'preview', type: tool, points: [pendingRef.current, end] })
      }

      const rsiSeries = rsiRef.current
      const rsiPoint = rsiSeries && param.time ? param.seriesData.get(rsiSeries) : undefined
      setRsiHovered(rsiPoint && 'value' in rsiPoint ? (rsiPoint.value as number) : null)
      if (rsiSeries) measureRsiPane()

      const bar = param.time ? param.seriesData.get(candles) : undefined
      if (!bar) {
        setHovered(null)
        return
      }
      const data = dataRef.current
      const idx = data.findIndex((c) => c.time === param.time)
      setHovered(idx >= 0 ? data[idx] : null)
      setPrevClose(idx > 0 ? data[idx - 1].close : null)
    }

    // Xử lý click bằng sự kiện DOM thay vì chart.subscribeClick, vì lightweight-charts bỏ qua
    // click thứ 2 nếu nó tới trong 500ms (khoảng double-click) ở vị trí khác click đầu
    // -> vẽ nhanh 2 điểm hoặc click chọn hình ngay sau khi vẽ sẽ bị mất.
    const container = containerRef.current!
    let downAt: { x: number; y: number } | null = null
    const onPointerDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY }
    }
    const onDomClick = (e: MouseEvent) => {
      // Bỏ qua nếu đây là thao tác kéo chart
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return
      const paneEl = chart.panes()[0]?.getHTMLElement()
      if (!paneEl) return
      const rect = paneEl.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (x < 0 || x > chart.timeScale().width()) return
      const store = useChartStore.getState()

      // Chọn điểm replay: click bất kỳ đâu (kể cả vùng trống, pane RSI) -> nến gần nhất
      if (replayModeRef.current === 'selecting') {
        const logical = chart.timeScale().coordinateToLogical(x)
        if (logical !== null) startReplayAt(Math.round(logical))
        return
      }

      const inPricePane = y >= 0 && y <= rect.height
      const tool = store.activeTool
      if (tool === 'cursor') {
        store.selectDrawing(inPricePane ? drawingsPrimitive.hit({ x, y }) : null)
        return
      }
      if (!inPricePane) return

      const point = anchorAt(x, y)
      if (!point) return
      const finish = (points: AnchorPoint[]) => {
        pendingRef.current = null
        drawingsPrimitive.setPreview(null)
        store.addDrawing({ id: crypto.randomUUID(), type: tool, points })
        store.setTool('cursor')
      }
      if (ONE_CLICK_TOOLS.includes(tool)) finish([point])
      else if (!pendingRef.current) {
        pendingRef.current = point
        drawingsPrimitive.setPreview({ id: 'preview', type: tool, points: [point, point] })
      } else finish([pendingRef.current, point])
    }
    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('click', onDomClick)

    // Kéo thả hình vẽ: kéo thân để di chuyển, kéo điểm neo để sửa.
    // Nghe mousedown ở capture phase và chặn lan truyền để lightweight-charts không kéo chart theo.
    let drag: {
      drawing: Drawing
      anchor: number | null
      startLogical: number
      startPrice: number
      points: AnchorPoint[] | null
    } | null = null

    const paneXY = (e: MouseEvent) => {
      const rect = chart.panes()[0]?.getHTMLElement()?.getBoundingClientRect()
      return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top, height: rect.height } : null
    }

    const onDragMove = (e: MouseEvent) => {
      const p = drag && paneXY(e)
      if (!drag || !p) return
      const logical = chart.timeScale().coordinateToLogical(p.x)
      const price = candles.coordinateToPrice(p.y)
      if (logical === null || price === null) return
      const data = dataRef.current
      if (drag.anchor === null) {
        // Di chuyển theo từng nến (giống TradingView), giá thì tự do
        drag.points = translateDrawing(drag.drawing, Math.round(logical - drag.startLogical), price - drag.startPrice, data)
      } else {
        const time = logicalToTime(Math.round(logical), data)
        if (time === null) return
        drag.points = moveAnchor(drag.drawing, drag.anchor, { time, price })
      }
      drawingsPrimitive.setDraft({ ...drag.drawing, points: drag.points })
    }

    const onDragEnd = () => {
      window.removeEventListener('mousemove', onDragMove)
      window.removeEventListener('mouseup', onDragEnd)
      container.classList.remove('dragging')
      if (drag?.points) useChartStore.getState().updateDrawing(drag.drawing.id, drag.points)
      else drawingsPrimitive.setDraft(null)
      drag = null
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const store = useChartStore.getState()
      if (store.activeTool !== 'cursor' || replayModeRef.current === 'selecting') return
      const p = paneXY(e)
      if (!p || p.x < 0 || p.y < 0 || p.y > p.height || p.x > chart.timeScale().width()) return
      const hit = drawingsPrimitive.hitDetail(p)
      const drawing = hit && (store.drawings[store.symbol] ?? []).find((d) => d.id === hit.id)
      const startLogical = chart.timeScale().coordinateToLogical(p.x)
      const startPrice = candles.coordinateToPrice(p.y)
      if (!hit || !drawing || startLogical === null || startPrice === null) return

      e.stopPropagation()
      e.preventDefault()
      store.selectDrawing(hit.id)
      drag = { drawing, anchor: hit.anchor, startLogical, startPrice, points: null }
      container.classList.add('dragging')
      window.addEventListener('mousemove', onDragMove)
      window.addEventListener('mouseup', onDragEnd)
    }
    container.addEventListener('mousedown', onMouseDown, true)

    chart.subscribeCrosshairMove(onMove)

    return () => {
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('click', onDomClick)
      container.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('mousemove', onDragMove)
      window.removeEventListener('mouseup', onDragEnd)
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volumeRef.current = null
      rsiRef.current = null
      drawingsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2. Tải lịch sử + stream realtime khi đổi symbol/khung thời gian
  useEffect(() => {
    let cancelled = false
    let unsubscribe = () => {}
    dataRef.current = []
    noMoreHistoryRef.current = false
    replayIndexRef.current = -1
    render([])

    const load = async () => {
      let feed: DataFeed = binanceFeed
      let data: Candle[]
      try {
        data = await feed.getHistory(symbol, interval)
      } catch {
        feed = mockFeed
        data = await feed.getHistory(symbol, interval)
      }
      if (cancelled) return
      feedRef.current = feed
      setFeedName(feed.name)

      const precision = pricePrecision(data.at(-1)?.close ?? 1)
      candleRef.current?.applyOptions({
        priceFormat: { type: 'price', precision, minMove: 1 / 10 ** precision },
      })

      dataRef.current = data
      render(data)
      chartRef.current?.timeScale().scrollToRealTime()

      unsubscribe = feed.subscribeBars(symbol, interval, (bar) => {
        const arr = dataRef.current
        const lastBar = arr.at(-1)
        if (lastBar && bar.time < lastBar.time) return
        if (lastBar && bar.time === lastBar.time) arr[arr.length - 1] = bar
        else arr.push(bar)
        // Khi đang replay chỉ lưu dữ liệu, không vẽ
        if (replayModeRef.current === 'active') return
        pushBar(bar, arr)
      })
    }
    load()

    return () => {
      cancelled = true
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval])

  // 3. Cuộn sang trái gần hết dữ liệu -> tải thêm lịch sử; theo dõi đã cuộn khỏi realtime chưa
  useEffect(() => {
    const timeScale = chartRef.current?.timeScale()
    if (!timeScale) return

    const onRangeChange = (range: LogicalRange | null) => {
      if (!range) return
      setScrolledBack(timeScale.scrollPosition() < 0)
      // Vẫn cho tải thêm khi đang chọn điểm replay để có thể kéo về mốc cũ
      if (range.from < 50 && replayModeRef.current !== 'active') loadOlder()
    }

    timeScale.subscribeVisibleLogicalRangeChange(onRangeChange)
    return () => timeScale.unsubscribeVisibleLogicalRangeChange(onRangeChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval])

  // 4. Bar Replay: vào/thoát chế độ
  useEffect(() => {
    if (replayMode === 'selecting') render(dataRef.current)
    if (replayMode === 'off') {
      replayIndexRef.current = -1
      setSelectOverlay(null)
      render(dataRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayMode])

  // 5. Bar Replay: phát tự động / từng bước
  const advance = () => {
    const next = replayIndexRef.current + 1
    const bar = dataRef.current[next]
    if (!bar) {
      setPlaying(false)
      return
    }
    replayIndexRef.current = next
    pushBar(bar, dataRef.current.slice(0, next + 1))
    setReplayTime(bar.time)
  }

  useEffect(() => {
    if (replayMode !== 'active' || !replayPlaying) return
    const id = setInterval(advance, 1000 / replaySpeed)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayMode, replayPlaying, replaySpeed])

  useEffect(() => {
    if (replayStep > 0 && replayModeRef.current === 'active') advance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayStep])

  // 6. Bar Replay: nhảy tới một ngày cụ thể (tự tải thêm lịch sử nếu cần)
  useEffect(() => {
    if (!replayJump) return
    let cancelled = false
    ;(async () => {
      for (let page = 0; page < MAX_JUMP_PAGES; page++) {
        const first = dataRef.current[0]
        if (!first || first.time <= replayJump.time) break
        if (!(await loadOlder()) || cancelled) break
      }
      if (cancelled) return
      const data = dataRef.current
      let idx = data.findIndex((c) => c.time > replayJump.time) - 1
      if (idx === -2) idx = data.length - 2 // mốc nằm sau nến cuối
      startReplayAt(idx)
      chartRef.current?.timeScale().scrollToRealTime()
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayJump])

  // 7. Đặt lại chế độ xem: zoom/cuộn mặc định + auto-scale trục giá
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || resetViewNonce === 0) return
    chart.timeScale().applyOptions({ barSpacing: BAR_SPACING, rightOffset: RIGHT_OFFSET })
    chart.timeScale().resetTimeScale()
    chart.priceScale('right').applyOptions({ autoScale: true })
    volumeRef.current?.priceScale().applyOptions({ autoScale: true })
  }, [resetViewNonce])

  // 8. Đảo ngược thang giá (Invert scale)
  useEffect(() => {
    chartRef.current?.priceScale('right').applyOptions({ invertScale })
  }, [invertScale])

  // 9. Indicator RSI trong pane riêng bên dưới
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !rsiEnabled) return

    const rsi = chart.addSeries(
      LineSeries,
      {
        color: RSI_COLOR,
        lineWidth: 1,
        priceLineVisible: false,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        // Luôn hiển thị đủ vùng 30–70
        autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
          const res = original()
          if (!res) return res
          return {
            ...res,
            priceRange: {
              minValue: Math.min(res.priceRange.minValue, 30),
              maxValue: Math.max(res.priceRange.maxValue, 70),
            },
          }
        },
      },
      1,
    )
    rsi.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } })
    rsi.attachPrimitive(new BandPrimitive(30, 70, 'rgba(126, 87, 194, 0.1)'))
    for (const [price, style] of [
      [70, LineStyle.Dashed],
      [50, LineStyle.Dotted],
      [30, LineStyle.Dashed],
    ] as const) {
      rsi.createPriceLine({ price, color: '#787b86', lineWidth: 1, lineStyle: style, axisLabelVisible: false })
    }
    chart.panes()[0]?.setStretchFactor(3)
    chart.panes()[1]?.setStretchFactor(1)

    rsiRef.current = rsi
    const data = computeRsi(visibleData(), RSI_PERIOD)
    rsi.setData(data)
    setRsiLast(data.at(-1)?.value ?? null)
    const raf = requestAnimationFrame(measureRsiPane)
    window.addEventListener('resize', measureRsiPane)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measureRsiPane)
      rsiRef.current = null
      setRsiTop(null)
      // Chart có thể đã bị huỷ trước (unmount)
      if (chartRef.current === chart) chart.removeSeries(rsi)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rsiEnabled])

  // 10. Hình vẽ: đồng bộ từ store vào lớp vẽ; đổi công cụ thì huỷ hình đang vẽ dở
  useEffect(() => {
    drawingsRef.current?.setState(drawings, selectedDrawingId)
  }, [drawings, selectedDrawingId])

  useEffect(() => {
    pendingRef.current = null
    drawingsRef.current?.setPreview(null)
  }, [activeTool, symbol])

  const selectedDrawing = drawings.find((d) => d.id === selectedDrawingId) ?? null

  /** Nhân bản hình: dịch sang phải 5 nến (đường ngang thì dịch xuống 20px) và chọn bản mới */
  const cloneDrawing = (id: string) => {
    const d = drawings.find((x) => x.id === id)
    const candles = candleRef.current
    if (!d || !candles) return
    let dPrice = 0
    if (d.type === 'hline') {
      const y = candles.priceToCoordinate(d.points[0].price)
      const shifted = y === null ? null : candles.coordinateToPrice(y + 20)
      dPrice = shifted === null ? 0 : shifted - d.points[0].price
    }
    addDrawing({ ...d, id: crypto.randomUUID(), points: translateDrawing(d, 5, dPrice, dataRef.current) })
  }

  /** Hình vẽ tại vị trí chuột (toạ độ client), dùng cho menu chuột phải */
  const drawingAtClient = (clientX: number, clientY: number): string | null => {
    const rect = chartRef.current?.panes()[0]?.getHTMLElement()?.getBoundingClientRect()
    if (!rect || !drawingsRef.current) return null
    return drawingsRef.current.hit({ x: clientX - rect.left, y: clientY - rect.top })
  }

  // Khi không hover, legend hiển thị nến cuối cùng
  const shown = hovered ?? last
  const data = visibleData()
  const shownPrev = hovered ? prevClose : (data.at(-2)?.close ?? null)

  return (
    <div
      className={`chart-wrap ${replayMode === 'selecting' ? 'selecting' : ''} ${activeTool !== 'cursor' ? 'drawing' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault()
        const rect = e.currentTarget.getBoundingClientRect()
        const drawingId = drawingAtClient(e.clientX, e.clientY)
        if (drawingId) useChartStore.getState().selectDrawing(drawingId)
        setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, drawingId })
      }}
      onMouseLeave={() => setSelectOverlay(null)}
    >
      <div ref={containerRef} className="chart" />
      <Legend candle={shown} prevClose={shownPrev} />

      {rsiEnabled && rsiTop !== null && (
        <div className="legend pane-legend" style={{ top: rsiTop + 6 }}>
          <div className="legend-ohlc">
            <span className="legend-name">RSI {RSI_PERIOD} close</span>
            <span style={{ color: RSI_COLOR }}>{(rsiHovered ?? rsiLast)?.toFixed(2) ?? '—'}</span>
            <button className="legend-remove" onClick={toggleRsi} title="Xoá RSI">
              ×
            </button>
          </div>
        </div>
      )}

      {replayMode === 'selecting' && selectOverlay && (
        <div
          className="replay-select-overlay"
          style={{ left: selectOverlay.x, right: selectOverlay.right, bottom: selectOverlay.bottom }}
        />
      )}
      {replayMode === 'selecting' && (
        <div className="chart-hint">Click vào chart để chọn điểm bắt đầu replay (kéo sang trái để về mốc cũ)</div>
      )}

      {selectedDrawing && replayMode !== 'selecting' && (
        <div className="float-toolbar" onMouseDown={(e) => e.stopPropagation()}>
          <span className="float-toolbar-name">{DRAWING_LABELS[selectedDrawing.type]}</span>
          <button className="tb-btn" title="Clone" onClick={() => cloneDrawing(selectedDrawing.id)}>
            ⧉
          </button>
          <button className="tb-btn" title="Remove (Delete)" onClick={() => removeDrawing(selectedDrawing.id)}>
            🗑
          </button>
        </div>
      )}

      {scrolledBack && (
        <button
          className="scroll-realtime"
          title="Cuộn tới nến mới nhất"
          onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
        >
          »
        </button>
      )}

      {menu && (
        <>
          <div className="context-backdrop" onMouseDown={() => setMenu(null)} />
          <ul className="context-menu" style={{ left: menu.x, top: menu.y }}>
            {menu.drawingId && (
              <>
                <li
                  onClick={() => {
                    cloneDrawing(menu.drawingId!)
                    setMenu(null)
                  }}
                >
                  <span>⧉ Clone</span>
                </li>
                <li
                  onClick={() => {
                    removeDrawing(menu.drawingId!)
                    setMenu(null)
                  }}
                >
                  <span>🗑 Remove</span>
                  <kbd>Del</kbd>
                </li>
                <li className="menu-divider" />
              </>
            )}
            <li
              onClick={() => {
                resetView()
                setMenu(null)
              }}
            >
              <span>⟲ Reset chart view</span>
              <kbd>Alt + R</kbd>
            </li>
            <li
              onClick={() => {
                toggleInvertScale()
                setMenu(null)
              }}
            >
              <span>{invertScale ? '✓' : '\u2003'} Invert scale</span>
              <kbd>Alt + I</kbd>
            </li>
            <li
              className={drawings.length ? '' : 'disabled'}
              onClick={() => {
                clearDrawings()
                setMenu(null)
              }}
            >
              <span>🗑 Remove drawings</span>
            </li>
          </ul>
        </>
      )}
    </div>
  )
}
