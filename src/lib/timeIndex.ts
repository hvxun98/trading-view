import type { Candle } from '../types'

/*
 * Hình vẽ lưu theo thời gian (không theo index) để vẫn đúng khi tải thêm lịch sử
 * hoặc đổi khung thời gian. Hai hàm dưới chuyển qua lại thời gian <-> logical index
 * của lightweight-charts, nội suy giữa các nến và ngoại suy ra ngoài vùng dữ liệu.
 */

function edgeStep(data: Candle[], atEnd: boolean): number {
  const n = data.length
  if (n < 2) return 60
  return atEnd ? data[n - 1].time - data[n - 2].time : data[1].time - data[0].time
}

export function timeToLogical(time: number, data: Candle[]): number | null {
  const n = data.length
  if (n === 0) return null
  const first = data[0].time
  const last = data[n - 1].time
  if (time >= last) return n - 1 + (time - last) / edgeStep(data, true)
  if (time <= first) return (time - first) / edgeStep(data, false)

  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (data[mid].time <= time) lo = mid
    else hi = mid
  }
  return lo + (time - data[lo].time) / (data[hi].time - data[lo].time)
}

export function logicalToTime(logical: number, data: Candle[]): number | null {
  const n = data.length
  if (n === 0) return null
  if (logical >= n - 1) return data[n - 1].time + (logical - (n - 1)) * edgeStep(data, true)
  if (logical <= 0) return data[0].time + logical * edgeStep(data, false)
  const i = Math.floor(logical)
  return data[i].time + (logical - i) * (data[i + 1].time - data[i].time)
}
