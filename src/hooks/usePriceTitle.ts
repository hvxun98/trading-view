import { useEffect, useRef } from 'react'
import { formatPrice, pricePrecision } from '../lib/intervals'
import type { Candle } from '../types'

const DEFAULT_TITLE = document.title

/**
 * Giá realtime trên tiêu đề tab như TradingView: "XAUUSD 2345.67 ▲ +0.45%".
 * % thay đổi so với giá đóng cửa nến trước (giống legend).
 */
export function usePriceTitle(symbol: string, last: Candle | null, prevClose: number | null) {
  // Vừa đổi mã: `last` vẫn là nến của mã cũ cho tới khi dữ liệu mới về -> chỉ hiện tên mã
  const staleRef = useRef<Candle | null>(null)
  useEffect(() => {
    staleRef.current = last
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  useEffect(() => {
    if (!last || last === staleRef.current) {
      document.title = last ? symbol : DEFAULT_TITLE
      return
    }
    const price = formatPrice(last.close, pricePrecision(last.close))
    let change = ''
    if (prevClose) {
      const pct = ((last.close - prevClose) / prevClose) * 100
      change = ` ${pct >= 0 ? '▲' : '▼'} ${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(2)}%`
    }
    document.title = `${symbol} ${price}${change}`
  }, [symbol, last, prevClose])

  useEffect(
    () => () => {
      document.title = DEFAULT_TITLE
    },
    [],
  )
}
