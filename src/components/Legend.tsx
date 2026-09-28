import { formatPrice, formatVolume, intervalLabel, pricePrecision } from '../lib/intervals'
import { theme } from '../lib/theme'
import { useChartStore } from '../store/useChartStore'
import type { Candle } from '../types'

interface Props {
  candle: Candle | null
  prevClose: number | null
}

export function Legend({ candle, prevClose }: Props) {
  const { symbol, interval, feedName } = useChartStore()

  const precision = pricePrecision(candle?.close ?? 1)
  const fmt = (v: number) => formatPrice(v, precision)
  const color = candle && candle.close >= candle.open ? theme.up : theme.down
  const change = candle && prevClose ? candle.close - prevClose : null
  const changePct = change !== null && prevClose ? (change / prevClose) * 100 : null

  return (
    <div className="legend">
      <div className="legend-title">
        <span className="legend-symbol">{symbol}</span>
        <span className="legend-dot">·</span>
        <span>{intervalLabel(interval)}</span>
        <span className="legend-dot">·</span>
        <span>{feedName}</span>
      </div>
      {candle && (
        <div className="legend-ohlc" style={{ color }}>
          <span><i>O</i>{fmt(candle.open)}</span>
          <span><i>H</i>{fmt(candle.high)}</span>
          <span><i>L</i>{fmt(candle.low)}</span>
          <span><i>C</i>{fmt(candle.close)}</span>
          {change !== null && changePct !== null && (
            <span>
              {change >= 0 ? '+' : ''}
              {fmt(change)} ({change >= 0 ? '+' : ''}
              {changePct.toFixed(2)}%)
            </span>
          )}
        </div>
      )}
      {candle && (
        <div className="legend-vol">
          <i>Vol</i> <span style={{ color }}>{formatVolume(candle.volume)}</span>
        </div>
      )}
    </div>
  )
}
