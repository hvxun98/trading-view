import { useEffect } from 'react'
import { intervalSeconds, INTERVALS } from '../lib/intervals'
import { activeChartStore } from '../store/useChartStore'
import type { Interval } from '../types'

/** Số nến bề ngang của vị thế vẽ từ link (như khi tự vẽ trên chart) */
const POSITION_BARS = 20

/**
 * Mở app từ link cảnh báo (nút "Mở chart" trong Telegram):
 *   /?symbol=XAUUSD&interval=1h&side=long&entry=2345.2&sl=2338.1&tp=2366.5&t=<giây, mở nến tín hiệu>
 * -> biểu đồ đang chọn chuyển sang mã / khung đó, vẽ vị thế Long / Short theo gợi ý và cuộn tới nến tín hiệu.
 * Trả về true nếu link hợp lệ.
 */
export function applyDeepLink(search: string): boolean {
  const p = new URLSearchParams(search)
  const symbol = p.get('symbol')?.toUpperCase()
  if (!symbol || !/^[A-Z0-9]{3,20}$/.test(symbol)) return false
  const store = activeChartStore()
  const interval = p.get('interval') as Interval | null
  if (store.getState().symbol !== symbol) store.getState().setSymbol(symbol)
  if (interval && INTERVALS.some((i) => i.value === interval) && store.getState().interval !== interval) {
    store.getState().setInterval(interval)
  }

  const side = p.get('side')
  const [entry, sl, tp, t] = ['entry', 'sl', 'tp', 't'].map((k) => Number(p.get(k)))
  const valid = (side === 'long' && tp > entry && entry > sl) || (side === 'short' && tp < entry && entry < sl)
  if (valid && t > 0) {
    const s = store.getState()
    const end = t + POSITION_BARS * intervalSeconds(s.interval)
    // id cố định theo tín hiệu: mở lại cùng link không vẽ trùng
    const id = `alert-${symbol}-${s.interval}-${t}-${side}`
    if (!(s.drawings[symbol] ?? []).some((d) => d.id === id)) {
      s.addDrawing({
        id,
        type: side,
        points: [
          { time: t, price: entry },
          { time: end, price: tp },
          { time: end, price: sl },
        ],
        position: { alwaysShowStats: true },
      })
    } else s.selectDrawing(id)
  }
  if (t > 0) store.getState().focusOn(t)
  return true
}

/** Đọc link khi mở app rồi xoá tham số khỏi thanh địa chỉ (tải lại trang không vẽ lại) */
export function useDeepLink() {
  useEffect(() => {
    if (!window.location.search) return
    if (applyDeepLink(window.location.search)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    }
  }, [])
}
