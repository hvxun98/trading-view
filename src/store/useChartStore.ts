import { create } from 'zustand'
import type { Interval, ReplayMode } from '../types'

interface ChartState {
  symbol: string
  interval: Interval
  feedName: string

  replayMode: ReplayMode
  replayPlaying: boolean
  replaySpeed: number
  /** Tăng mỗi lần bấm "Step forward" để Chart phản ứng */
  replayStep: number

  setSymbol: (symbol: string) => void
  setInterval: (interval: Interval) => void
  setFeedName: (name: string) => void
  startReplaySelect: () => void
  activateReplay: () => void
  exitReplay: () => void
  togglePlay: () => void
  setPlaying: (playing: boolean) => void
  stepForward: () => void
  setReplaySpeed: (speed: number) => void
}

export const useChartStore = create<ChartState>((set) => ({
  symbol: 'BTCUSDT',
  interval: '1h',
  feedName: 'Binance',

  replayMode: 'off',
  replayPlaying: false,
  replaySpeed: 1,
  replayStep: 0,

  setSymbol: (symbol) => set({ symbol, replayMode: 'off', replayPlaying: false }),
  setInterval: (interval) => set({ interval, replayMode: 'off', replayPlaying: false }),
  setFeedName: (feedName) => set({ feedName }),
  startReplaySelect: () => set({ replayMode: 'selecting', replayPlaying: false }),
  activateReplay: () => set({ replayMode: 'active' }),
  exitReplay: () => set({ replayMode: 'off', replayPlaying: false }),
  togglePlay: () => set((s) => ({ replayPlaying: !s.replayPlaying })),
  setPlaying: (replayPlaying) => set({ replayPlaying }),
  stepForward: () => set((s) => ({ replayStep: s.replayStep + 1, replayPlaying: false })),
  setReplaySpeed: (replaySpeed) => set({ replaySpeed }),
}))
