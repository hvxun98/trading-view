import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Logical,
  type LogicalRange,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts'
import { binanceFeed } from '../data/binance'
import { mockFeed } from '../data/mock'
import { pricePrecision } from '../lib/intervals'
import { theme } from '../lib/theme'
import { useChartStore } from '../store/useChartStore'
import type { Candle, DataFeed } from '../types'
import { Legend } from './Legend'

const BAR_SPACING = 8
const RIGHT_OFFSET = 10
/** Giới hạn số trang lịch sử tải thêm khi nhảy tới một ngày cũ */
const MAX_JUMP_PAGES = 50

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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const { symbol, interval, replayMode, replayPlaying, replaySpeed, replayStep, replayJump, resetViewNonce } =
    useChartStore()
  const { setFeedName, activateReplay, setPlaying, setReplayTime, resetView } = useChartStore.getState()
  const replayModeRef = useRef(replayMode)
  replayModeRef.current = replayMode

  const visibleData = () =>
    replayModeRef.current === 'active' ? dataRef.current.slice(0, replayIndexRef.current + 1) : dataRef.current

  const render = (data: Candle[]) => {
    candleRef.current?.setData(data)
    volumeRef.current?.setData(data.map(volumeBar))
    setLast(data.at(-1) ?? null)
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

    // Click bất kỳ đâu trên chart (kể cả vùng trống) -> chọn nến gần nhất
    const onClick = (param: MouseEventParams<Time>) => {
      setMenu(null)
      if (replayModeRef.current !== 'selecting' || param.logical === undefined) return
      startReplayAt(Math.round(param.logical))
    }

    chart.subscribeCrosshairMove(onMove)
    chart.subscribeClick(onClick)

    return () => {
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volumeRef.current = null
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
        candleRef.current?.update(bar)
        volumeRef.current?.update(volumeBar(bar))
        setLast(bar)
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
    candleRef.current?.update(bar)
    volumeRef.current?.update(volumeBar(bar))
    setLast(bar)
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

  // Khi không hover, legend hiển thị nến cuối cùng
  const shown = hovered ?? last
  const data = visibleData()
  const shownPrev = hovered ? prevClose : (data.at(-2)?.close ?? null)

  return (
    <div
      className={`chart-wrap ${replayMode === 'selecting' ? 'selecting' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault()
        const rect = e.currentTarget.getBoundingClientRect()
        setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      }}
      onMouseLeave={() => setSelectOverlay(null)}
    >
      <div ref={containerRef} className="chart" />
      <Legend candle={shown} prevClose={shownPrev} />

      {replayMode === 'selecting' && selectOverlay && (
        <div
          className="replay-select-overlay"
          style={{ left: selectOverlay.x, right: selectOverlay.right, bottom: selectOverlay.bottom }}
        />
      )}
      {replayMode === 'selecting' && (
        <div className="chart-hint">Click vào chart để chọn điểm bắt đầu replay (kéo sang trái để về mốc cũ)</div>
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
            <li
              onClick={() => {
                resetView()
                setMenu(null)
              }}
            >
              <span>⟲ Reset chart view</span>
              <kbd>Alt + R</kbd>
            </li>
          </ul>
        </>
      )}
    </div>
  )
}
