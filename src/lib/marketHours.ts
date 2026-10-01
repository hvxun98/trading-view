/**
 * Giờ giao dịch vàng / bạc như OANDA (giờ New York): Chủ nhật 18:00 -> thứ Sáu 17:00,
 * nghỉ 17:00–18:00 mỗi ngày. Dùng để bỏ nến cuối tuần của nguồn giao dịch 24/7 (Binance perpetual).
 */
const NY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  hour: 'numeric',
  hourCycle: 'h23',
})

/** Thị trường kim loại (theo giờ OANDA) có mở tại thời điểm `time` (giây, UTC) không */
export function isMetalsMarketOpen(time: number): boolean {
  let weekday = ''
  let hour = 0
  for (const part of NY.formatToParts(new Date(time * 1000))) {
    if (part.type === 'weekday') weekday = part.value
    else if (part.type === 'hour') hour = Number(part.value)
  }
  if (weekday === 'Sat') return false
  if (weekday === 'Sun') return hour >= 18
  if (weekday === 'Fri') return hour < 17
  return hour !== 17
}
