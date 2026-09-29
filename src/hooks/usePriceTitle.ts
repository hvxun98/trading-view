import { useEffect, useRef } from 'react'
import { symbolPrecision } from '../data/catalog'
import { formatPrice, pricePrecision } from '../lib/intervals'
import type { Candle } from '../types'

const DEFAULT_TITLE = document.title

/**
 * Giá realtime trên tiêu đề tab như TradingView: "XAUUSD 2345.67 ▲ +0.45%".
 * % thay đổi so với giá đóng cửa nến trước (giống legend). Nhiều biểu đồ: chỉ biểu đồ đang chọn (`enabled`) đặt tiêu đề.
 */
export function usePriceTitle(symbol: string, last: Candle | null, prevClose: number | null, enabled = true) {
  // Vừa đổi mã: `last` vẫn là nến của mã cũ cho tới khi dữ liệu mới về -> chỉ hiện tên mã
  const staleRef = useRef<Candle | null>(null)
  useEffect(() => {
    staleRef.current = last
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  const enabledRef = useRef(enabled)
  useEffect(() => {
    enabledRef.current = enabled
    if (!enabled) return
    if (!last || last === staleRef.current) {
      document.title = last ? symbol : DEFAULT_TITLE
      return
    }
    const price = formatPrice(last.close, pricePrecision(last.close, symbolPrecision(symbol)))
    let change = ''
    if (prevClose) {
      const pct = ((last.close - prevClose) / prevClose) * 100
      change = ` ${pct >= 0 ? '▲' : '▼'} ${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(2)}%`
    }
    document.title = `${symbol} ${price}${change}`
  }, [symbol, last, prevClose, enabled])

  useEffect(
    () => () => {
      if (enabledRef.current) document.title = DEFAULT_TITLE
    },
    [],
  )
}
