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
  /** Yêu cầu nhảy tới một mốc thời gian (giây, UTC) */
  replayJump: { time: number; nonce: number } | null
  /** Thời gian của nến cuối cùng đang hiển thị khi replay */
  replayTime: number | null
  /** Tăng mỗi lần yêu cầu đặt lại chế độ xem */
  resetViewNonce: number

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
  jumpReplayTo: (time: number) => void
  setReplayTime: (time: number | null) => void
  resetView: () => void
}

const replayOff = { replayMode: 'off' as const, replayPlaying: false, replayJump: null, replayTime: null }

export const useChartStore = create<ChartState>((set) => ({
  symbol: 'BTCUSDT',
  interval: '1h',
  feedName: 'Binance',

  replayMode: 'off',
  replayPlaying: false,
  replaySpeed: 1,
  replayStep: 0,
  replayJump: null,
  replayTime: null,
  resetViewNonce: 0,

  setSymbol: (symbol) => set({ symbol, ...replayOff }),
  setInterval: (interval) => set({ interval, ...replayOff }),
  setFeedName: (feedName) => set({ feedName }),
  startReplaySelect: () => set({ replayMode: 'selecting', replayPlaying: false }),
  activateReplay: () => set({ replayMode: 'active' }),
  exitReplay: () => set(replayOff),
  togglePlay: () => set((s) => ({ replayPlaying: s.replayMode === 'active' && !s.replayPlaying })),
  setPlaying: (replayPlaying) => set({ replayPlaying }),
  stepForward: () => set((s) => ({ replayStep: s.replayStep + 1, replayPlaying: false })),
  setReplaySpeed: (replaySpeed) => set({ replaySpeed }),
  jumpReplayTo: (time) =>
    set((s) => ({ replayJump: { time, nonce: (s.replayJump?.nonce ?? 0) + 1 }, replayPlaying: false })),
  setReplayTime: (replayTime) => set({ replayTime }),
  resetView: () => set((s) => ({ resetViewNonce: s.resetViewNonce + 1 })),
}))
