import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Drawing, Interval, ReplayMode, Tool } from '../types'

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

  /** Đảo ngược thang giá (Invert scale) */
  invertScale: boolean
  rsiEnabled: boolean

  activeTool: Tool
  /** Hình vẽ theo từng symbol (giữ nguyên khi đổi khung thời gian, như TradingView) */
  drawings: Record<string, Drawing[]>
  selectedDrawingId: string | null

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

  toggleInvertScale: () => void
  toggleRsi: () => void

  setTool: (tool: Tool) => void
  addDrawing: (drawing: Drawing) => void
  selectDrawing: (id: string | null) => void
  removeSelectedDrawing: () => void
  clearDrawings: () => void
}

const replayOff = { replayMode: 'off' as const, replayPlaying: false, replayJump: null, replayTime: null }

export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
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

      invertScale: false,
      rsiEnabled: false,

      activeTool: 'cursor',
      drawings: {},
      selectedDrawingId: null,

      setSymbol: (symbol) => set({ symbol, selectedDrawingId: null, ...replayOff }),
      setInterval: (interval) => set({ interval, ...replayOff }),
      setFeedName: (feedName) => set({ feedName }),
      startReplaySelect: () => set({ replayMode: 'selecting', replayPlaying: false, activeTool: 'cursor' }),
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

      toggleInvertScale: () => set((s) => ({ invertScale: !s.invertScale })),
      toggleRsi: () => set((s) => ({ rsiEnabled: !s.rsiEnabled })),

      setTool: (activeTool) =>
        set((s) => ({
          activeTool,
          selectedDrawingId: activeTool === 'cursor' ? s.selectedDrawingId : null,
          // Chọn công cụ vẽ thì thoát chế độ chọn điểm replay
          replayMode: s.replayMode === 'selecting' && activeTool !== 'cursor' ? 'off' : s.replayMode,
        })),
      addDrawing: (drawing) =>
        set((s) => ({
          drawings: { ...s.drawings, [s.symbol]: [...(s.drawings[s.symbol] ?? []), drawing] },
          selectedDrawingId: drawing.id,
        })),
      selectDrawing: (selectedDrawingId) => set({ selectedDrawingId }),
      removeSelectedDrawing: () =>
        set((s) => ({
          drawings: {
            ...s.drawings,
            [s.symbol]: (s.drawings[s.symbol] ?? []).filter((d) => d.id !== s.selectedDrawingId),
          },
          selectedDrawingId: null,
        })),
      clearDrawings: () => set((s) => ({ drawings: { ...s.drawings, [s.symbol]: [] }, selectedDrawingId: null })),
    }),
    {
      name: 'tv-clone',
      storage: createJSONStorage(() => localStorage),
      // Chỉ lưu cài đặt & hình vẽ, không lưu trạng thái replay
      partialize: (s) => ({
        symbol: s.symbol,
        interval: s.interval,
        invertScale: s.invertScale,
        rsiEnabled: s.rsiEnabled,
        drawings: s.drawings,
      }),
    },
  ),
)
