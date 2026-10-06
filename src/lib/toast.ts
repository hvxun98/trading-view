/** Thông báo ngắn ở cuối màn hình (vd. "Đã sao chép ảnh"); <Toaster /> hiển thị */
export type Toast = { id: number; text: string; kind: 'ok' | 'error' }

const listeners = new Set<(t: Toast) => void>()
let nextId = 1

export function showToast(text: string, kind: Toast['kind'] = 'ok') {
  const toast = { id: nextId++, text, kind }
  listeners.forEach((l) => l(toast))
}

export function onToast(listener: (t: Toast) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
