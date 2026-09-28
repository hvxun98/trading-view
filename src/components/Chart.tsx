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

const volumeBar = (c: Candle) => ({
  time: c.time,
  value: c.volume,
  color: c.close >= c.open ? theme.upVolume : theme.downVolume,
})

export function Chart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  /** Toàn bộ dữ liệu đã tải (kể cả phần "tương lai" khi đang replay) */
  const dataRef = useRef<Candle[]>([])
  const feedRef = useRef<DataFeed>(binanceFeed)
  const loadingOlderRef = useRef(false)
  const noMoreHistoryRef = useRef(false)
  /** Index nến cuối cùng đang hiển thị khi replay */
  const replayIndexRef = useRef(-1)

  const [hovered, setHovered] = useState<Candle | null>(null)
  const [last, setLast] = useState<Candle | null>(null)
  const [prevClose, setPrevClose] = useState<number | null>(null)

  const { symbol, interval, replayMode, replayPlaying, replaySpeed, replayStep } = useChartStore()
  const { setFeedName, activateReplay, setPlaying } = useChartStore.getState()
  const replayModeRef = useRef(replayMode)
  replayModeRef.current = replayMode

  const visibleData = () =>
    replayModeRef.current === 'active' ? dataRef.current.slice(0, replayIndexRef.current + 1) : dataRef.current

  const render = (data: Candle[]) => {
    candleRef.current?.setData(data)
    volumeRef.current?.setData(data.map(volumeBar))
    setLast(data.at(-1) ?? null)
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
        rightOffset: 10,
        barSpacing: 8,
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

    // Legend OHLC theo crosshair
    const onMove = (param: MouseEventParams<Time>) => {
      const bar = param.time ? (param.seriesData.get(candles) as Candle | undefined) : undefined
      if (!bar) {
        setHovered(null)
        return
      }
      const data = dataRef.current
      const idx = data.findIndex((c) => c.time === param.time)
      setHovered(idx >= 0 ? data[idx] : null)
      setPrevClose(idx > 0 ? data[idx - 1].close : null)
    }
    chart.subscribeCrosshairMove(onMove)

    // Click để chọn điểm bắt đầu Bar Replay
    const onClick = (param: MouseEventParams<Time>) => {
      if (replayModeRef.current !== 'selecting' || !param.time) return
      const idx = dataRef.current.findIndex((c) => c.time === param.time)
      if (idx < 0) return
      replayIndexRef.current = idx
      activateReplay()
    }
    chart.subscribeClick(onClick)

    return () => {
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volumeRef.current = null
    }
  }, [activateReplay])

  // 2. Tải lịch sử + stream realtime khi đổi symbol/khung thời gian
  useEffect(() => {
    let cancelled = false
    let unsubscribe = () => {}
    dataRef.current = []
    noMoreHistoryRef.current = false
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

  // 3. Cuộn sang trái gần hết dữ liệu -> tải thêm lịch sử cũ
  useEffect(() => {
    const timeScale = chartRef.current?.timeScale()
    if (!timeScale) return

    const onRangeChange = async (range: { from: number; to: number } | null) => {
      if (!range || range.from > 50) return
      if (loadingOlderRef.current || noMoreHistoryRef.current || replayModeRef.current !== 'off') return
      const first = dataRef.current[0]
      if (!first) return

      loadingOlderRef.current = true
      try {
        const older = await feedRef.current.getHistory(symbol, interval, first.time * 1000 - 1, 1000)
        // Bỏ qua nếu symbol/interval đã đổi trong lúc chờ
        if (dataRef.current[0] !== first) return
        if (older.length === 0) {
          noMoreHistoryRef.current = true
          return
        }
        dataRef.current = [...older.filter((c) => c.time < first.time), ...dataRef.current]
        render(dataRef.current)
      } catch {
        // thử lại ở lần cuộn sau
      } finally {
        loadingOlderRef.current = false
      }
    }

    timeScale.subscribeVisibleLogicalRangeChange(onRangeChange)
    return () => timeScale.unsubscribeVisibleLogicalRangeChange(onRangeChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval])

  // 4. Bar Replay: vào/thoát chế độ
  useEffect(() => {
    if (replayMode === 'active') render(visibleData())
    if (replayMode === 'off') {
      replayIndexRef.current = -1
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

  // Khi không hover, legend hiển thị nến cuối cùng
  const shown = hovered ?? last
  const data = visibleData()
  const shownPrev = hovered ? prevClose : (data.at(-2)?.close ?? null)

  return (
    <div className={`chart-wrap ${replayMode === 'selecting' ? 'selecting' : ''}`}>
      <div ref={containerRef} className="chart" />
      <Legend candle={shown} prevClose={shownPrev} />
      {replayMode === 'selecting' && <div className="chart-hint">Click vào nến để chọn điểm bắt đầu replay</div>}
    </div>
  )
}
