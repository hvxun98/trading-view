import type { IChartApi } from 'lightweight-charts'
import { useAppStore } from '../store/useAppStore'
import { theme } from './theme'

/**
 * Chụp ảnh biểu đồ như "Take a snapshot" của TradingView: ảnh HD (tối thiểu gấp 2 độ phân giải CSS) gồm nến,
 * chỉ báo, hình vẽ và một dòng tiêu đề (mã, khung, nguồn, OHLC), rồi chép vào bộ nhớ tạm hoặc tải xuống.
 */

/** Thông tin vẽ lên dòng tiêu đề của ảnh */
export interface SnapshotInfo {
  title: string
  /** Các cặp nhãn / giá trị OHLC, vd. [['O', '2345.10'], ...] */
  ohlc: [string, string][]
  change: string | null
  up: boolean
  /** Nhãn chỉ báo trong pane phụ (vd. RSI) và vị trí y (CSS px, tính từ đỉnh chart) */
  panes: { y: number; text: string; color: string }[]
}

type TakeSnapshot = () => Promise<HTMLCanvasElement | null>

const takers = new Map<number, TakeSnapshot>()

/** Mỗi ô biểu đồ đăng ký hàm chụp của nó; trả về hàm huỷ đăng ký */
export function registerSnapshot(index: number, take: TakeSnapshot): () => void {
  takers.set(index, take)
  return () => {
    if (takers.get(index) === take) takers.delete(index)
  }
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif"
/** Độ phân giải tối thiểu của ảnh (lần độ phân giải CSS) */
const MIN_RATIO = 2

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/** Tỉ lệ pixel thật của canvas chart (bitmap / CSS) */
function canvasRatio(el: HTMLElement): number {
  const canvas = el.querySelector('canvas')
  const css = canvas ? parseFloat(canvas.style.width) : 0
  return canvas && css ? canvas.width / css : window.devicePixelRatio || 1
}

async function waitForRatio(el: HTMLElement, ratio: number) {
  for (let i = 0; i < 20 && Math.abs(canvasRatio(el) - ratio) > 0.02; i++) await frame()
  await frame()
}

/**
 * Ảnh chart ở độ phân giải ≥ MIN_RATIO. Màn hình thường (tỉ lệ 1x) cho ảnh mờ, nên tạm phóng to vùng vẽ bằng CSS zoom
 * (giữ nguyên kích thước CSS -> giữ nguyên vùng đang xem) để lightweight-charts vẽ lại ở mật độ điểm ảnh cao hơn.
 * Một ảnh tĩnh phủ lên trong lúc đó để không thấy chart nhảy.
 */
export async function captureChart(chart: IChartApi, el: HTMLElement): Promise<HTMLCanvasElement> {
  // Tỉ lệ thật của canvas (không dựa vào devicePixelRatio: có môi trường báo 2 nhưng chart vẫn vẽ 1x)
  const ratio = canvasRatio(el)
  const zoom = MIN_RATIO / ratio
  if (zoom <= 1.01) return chart.takeScreenshot(true)

  const wrap = el.parentElement!
  // Kích thước CSS chính xác (clientWidth làm tròn -> chart co lại vài phần pixel, lệch vùng đang xem)
  const rect = el.getBoundingClientRect()
  const cover = chart.takeScreenshot(true)
  cover.className = 'snapshot-cover'
  Object.assign(cover.style, { width: `${rect.width}px`, height: `${rect.height}px` })
  wrap.appendChild(cover)
  wrap.classList.add('capturing')
  const { width, height, zoom: oldZoom, right, bottom } = el.style
  try {
    Object.assign(el.style, {
      zoom: String(zoom),
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      right: 'auto',
      bottom: 'auto',
    })
    await waitForRatio(el, MIN_RATIO)
    return chart.takeScreenshot(true)
  } finally {
    Object.assign(el.style, { zoom: oldZoom, width, height, right, bottom })
    await waitForRatio(el, ratio)
    cover.remove()
    wrap.classList.remove('capturing')
  }
}

/** Ghép tiêu đề (mã, khung, nguồn, OHLC, thời gian chụp) lên trên ảnh chart; chart hẹp thì xuống 2 dòng */
export function composeSnapshot(shot: HTMLCanvasElement, cssWidth: number, info: SnapshotInfo): HTMLCanvasElement {
  const k = shot.width / cssWidth
  const ctx0 = document.createElement('canvas').getContext('2d')!
  const width = (value: string, weight = 400, size = 13) => {
    ctx0.font = `${weight} ${size * k}px ${FONT}`
    return ctx0.measureText(value).width
  }
  const time = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  const pad = 12 * k
  const ohlcWidth =
    info.ohlc.reduce((w, [label, value]) => w + width(`${label} `) + width(value) + 8 * k, 0) +
    (info.change ? width(info.change) : 0)
  const oneLine =
    pad + width(info.title, 600, 14) + 14 * k + ohlcWidth + 16 * k + width(time, 400, 12) + pad <= shot.width
  const line = 34 * k
  const header = Math.round(oneLine ? line : line * 1.6)

  const out = document.createElement('canvas')
  out.width = shot.width
  out.height = shot.height + header
  const ctx = out.getContext('2d')!
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(shot, 0, header)
  ctx.fillStyle = theme.border
  ctx.fillRect(0, header - Math.max(1, Math.round(k)), out.width, Math.max(1, Math.round(k)))

  ctx.textBaseline = 'middle'
  let x = pad
  let y = oneLine ? header / 2 : line * 0.5
  const text = (value: string, color: string, weight = 400, size = 13) => {
    ctx.font = `${weight} ${size * k}px ${FONT}`
    ctx.fillStyle = color
    ctx.fillText(value, x, y)
    x += ctx.measureText(value).width
  }
  text(info.title, theme.text, 600, 14)

  // Thời điểm chụp (UTC) ở góc phải dòng đầu
  ctx.font = `400 ${12 * k}px ${FONT}`
  ctx.fillStyle = theme.textDim
  ctx.textAlign = 'right'
  ctx.fillText(time, out.width - pad, y)
  ctx.textAlign = 'left'

  if (oneLine) x += 14 * k
  else {
    x = pad
    y = line * 1.15
  }
  const color = info.up ? theme.up : theme.down
  for (const [label, value] of info.ohlc) {
    text(`${label} `, theme.textDim)
    text(value, color)
    x += 8 * k
  }
  if (info.change) text(info.change, color)

  // Nhãn các pane chỉ báo (chữ legend là DOM nên không có trong ảnh chart)
  for (const pane of info.panes) {
    ctx.font = `400 ${12 * k}px ${FONT}`
    ctx.fillStyle = pane.color
    ctx.fillText(pane.text, pad, header + (pane.y + 14) * k)
  }
  return out
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  )

async function activeSnapshot(): Promise<{ blob: Blob; name: string }> {
  const take = takers.get(useAppStore.getState().activeChart)
  const canvas = take ? await take() : null
  if (!canvas) throw new Error('no chart')
  const name = `${canvas.dataset.name ?? 'chart'}_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`
  return { blob: await toBlob(canvas), name }
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Chép ảnh biểu đồ đang chọn vào bộ nhớ tạm (Ctrl + V để dán). Phải gọi ngay trong sự kiện người dùng (phím / click):
 * ClipboardItem nhận Promise nên vẫn giữ quyền ghi trong lúc chụp. Trình duyệt không cho phép -> tải ảnh xuống.
 */
export async function copySnapshot(): Promise<'copied' | 'downloaded' | 'failed'> {
  const snap = activeSnapshot()
  snap.catch(() => {})
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) throw new Error('clipboard unavailable')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': snap.then((s) => s.blob) })])
    return 'copied'
  } catch {
    try {
      const { blob, name } = await snap
      download(blob, name)
      return 'downloaded'
    } catch {
      return 'failed'
    }
  }
}

/** Tải ảnh biểu đồ đang chọn xuống máy (PNG) */
export async function downloadSnapshot(): Promise<boolean> {
  try {
    const { blob, name } = await activeSnapshot()
    download(blob, name)
    return true
  } catch {
    return false
  }
}
