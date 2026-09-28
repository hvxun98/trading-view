import { useEffect } from 'react'
import { useChartStore } from '../store/useChartStore'

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
      } else if (e.shiftKey && e.key === 'ArrowRight' && store.replayMode === 'active') {
        e.preventDefault()
        store.stepForward()
      } else if (e.shiftKey && e.key === 'ArrowDown' && store.replayMode === 'active') {
        e.preventDefault()
        store.togglePlay()
      } else if (e.key === 'Escape' && store.replayMode === 'selecting') {
        store.exitReplay()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
