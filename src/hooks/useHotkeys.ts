import { useEffect } from 'react'
import { useChartStore } from '../store/useChartStore'
import type { DrawingTool } from '../types'

const TOOL_KEYS: Record<string, DrawingTool> = {
  KeyT: 'trendline',
  KeyH: 'hline',
  KeyV: 'vline',
  KeyF: 'fib',
}

/** Phím tắt giống TradingView */
export function useHotkeys() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, select, textarea')) return
      const store = useChartStore.getState()

      if (e.altKey && e.code === 'KeyR') {
        e.preventDefault()
        store.resetView()
      } else if (e.altKey && e.code === 'KeyI') {
        e.preventDefault()
        store.toggleInvertScale()
      } else if (e.altKey && TOOL_KEYS[e.code]) {
        e.preventDefault()
        store.setTool(TOOL_KEYS[e.code])
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedDrawingId) {
        e.preventDefault()
        store.removeSelectedDrawing()
      } else if (e.shiftKey && e.key === 'ArrowRight' && store.replayMode === 'active') {
        e.preventDefault()
        store.stepForward()
      } else if (e.shiftKey && e.key === 'ArrowDown' && store.replayMode === 'active') {
        e.preventDefault()
        store.togglePlay()
      } else if (e.key === 'Escape') {
        // Huỷ lần lượt: chọn điểm replay -> công cụ vẽ -> hình đang chọn
        if (store.replayMode === 'selecting') store.exitReplay()
        else if (store.activeTool !== 'cursor') store.setTool('cursor')
        else store.selectDrawing(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
