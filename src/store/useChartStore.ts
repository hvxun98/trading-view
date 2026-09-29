import { createContext, useContext } from 'react'
import { create, useStore, type StoreApi, type UseBoundStore } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AnchorPoint, Drawing, DrawingStyle, Interval, ReplayMode, Tool } from '../types'
import { chartKey, useAppStore } from './useAppStore'

/**
 * Trạng thái RIÊNG của từng biểu đồ trong bố cục nhiều biểu đồ: mã, khung thời gian, hình vẽ, công cụ vẽ,
 * undo/redo, RSI, đảo thang, replay… Mỗi biểu đồ một store, lưu ở localStorage 'tv-clone-chart-<i>'.
 */
export interface ChartState {
  symbol: string
  interval: Interval
  feedName: string
  /** Đang hiện dữ liệu Demo tạm thời và thử kết nối lại nguồn thật */
  feedReconnecting: boolean

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
  /** Khoá / ẩn toàn bộ hình vẽ (nút ở thanh công cụ trái) */
  lockAll: boolean
  hideAll: boolean
  /** Lịch sử undo/redo: các phiên bản danh sách hình vẽ của symbol hiện tại */
  undoStack: Drawing[][]
  redoStack: Drawing[][]

  setSymbol: (symbol: string) => void
  setInterval: (interval: Interval) => void
  setFeedName: (name: string, reconnecting?: boolean) => void
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
  removeDrawing: (id: string) => void
  updateDrawing: (id: string, points: AnchorPoint[]) => void
  setDrawingStyle: (id: string, style: Partial<DrawingStyle>) => void
  updateDrawingText: (id: string, text: string) => void
  /** Sửa nhiều thuộc tính một lần (1 bước undo), vd. điểm neo + settings của vị thế */
  updateDrawingProps: (id: string, patch: Partial<Omit<Drawing, 'id' | 'type'>>) => void
  toggleDrawingLock: (id: string) => void
  toggleDrawingHidden: (id: string) => void
  clearDrawings: () => void
  toggleLockAll: () => void
  toggleHideAll: () => void
  undo: () => void
  redo: () => void
}

const MAX_HISTORY = 100

/** Thay danh sách hình vẽ của symbol hiện tại và ghi một bước vào lịch sử undo */
function commit(s: ChartState, list: Drawing[], extra: Partial<ChartState> = {}): Partial<ChartState> {
  return {
    drawings: { ...s.drawings, [s.symbol]: list },
    undoStack: [...s.undoStack, s.drawings[s.symbol] ?? []].slice(-MAX_HISTORY),
    redoStack: [],
    ...extra,
  }
}

function current(s: ChartState): Drawing[] {
  return s.drawings[s.symbol] ?? []
}

/** Sửa một hình theo id (có ghi lịch sử) */
function edit(s: ChartState, id: string, fn: (d: Drawing) => Drawing, extra?: Partial<ChartState>) {
  return commit(
    s,
    current(s).map((d) => (d.id === id ? fn(d) : d)),
    extra,
  )
}

/** Khôi phục một phiên bản từ lịch sử; bỏ chọn nếu hình đang chọn không còn */
function restore(s: ChartState, list: Drawing[]): Partial<ChartState> {
  return {
    drawings: { ...s.drawings, [s.symbol]: list },
    selectedDrawingId: list.some((d) => d.id === s.selectedDrawingId) ? s.selectedDrawingId : null,
  }
}

const replayOff = { replayMode: 'off' as const, replayPlaying: false, replayJump: null, replayTime: null }

/** Mã mặc định của từng ô khi mới mở bố cục nhiều biểu đồ */
const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XAUUSD', 'EURUSD']

export type ChartStore = UseBoundStore<StoreApi<ChartState>>

const createChartStore = (index: number): ChartStore =>
  create<ChartState>()(
    persist(
      (set) => ({
        symbol: DEFAULT_SYMBOLS[index] ?? DEFAULT_SYMBOLS[0],
        interval: '1h',
        feedName: 'Binance',
        feedReconnecting: false,

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
        lockAll: false,
        hideAll: false,
        undoStack: [],
        redoStack: [],

        // Lịch sử undo gắn với symbol đang xem, nên đổi symbol thì xoá lịch sử
        setSymbol: (symbol) => set({ symbol, selectedDrawingId: null, undoStack: [], redoStack: [], ...replayOff }),
        setInterval: (interval) => set({ interval, ...replayOff }),
        setFeedName: (feedName, reconnecting = false) => set({ feedName, feedReconnecting: reconnecting }),
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
        addDrawing: (drawing) => set((s) => commit(s, [...current(s), drawing], { selectedDrawingId: drawing.id })),
        selectDrawing: (selectedDrawingId) => set({ selectedDrawingId }),
        removeSelectedDrawing: () =>
          set((s) =>
            s.selectedDrawingId
              ? commit(
                  s,
                  current(s).filter((d) => d.id !== s.selectedDrawingId),
                  { selectedDrawingId: null },
                )
              : {},
          ),
        removeDrawing: (id) =>
          set((s) =>
            commit(
              s,
              current(s).filter((d) => d.id !== id),
              { selectedDrawingId: s.selectedDrawingId === id ? null : s.selectedDrawingId },
            ),
          ),
        updateDrawing: (id, points) => set((s) => edit(s, id, (d) => ({ ...d, points }))),
        setDrawingStyle: (id, style) => set((s) => edit(s, id, (d) => ({ ...d, style: { ...d.style, ...style } }))),
        updateDrawingText: (id, text) => set((s) => edit(s, id, (d) => ({ ...d, text }))),
        updateDrawingProps: (id, patch) => set((s) => edit(s, id, (d) => ({ ...d, ...patch }))),
        toggleDrawingLock: (id) => set((s) => edit(s, id, (d) => ({ ...d, locked: !d.locked }))),
        toggleDrawingHidden: (id) =>
          set((s) => {
            const hiding = !current(s).find((d) => d.id === id)?.hidden
            return edit(s, id, (d) => ({ ...d, hidden: hiding }), {
              selectedDrawingId: hiding && s.selectedDrawingId === id ? null : s.selectedDrawingId,
            })
          }),
        clearDrawings: () => set((s) => (current(s).length ? commit(s, [], { selectedDrawingId: null }) : {})),
        toggleLockAll: () => set((s) => ({ lockAll: !s.lockAll })),
        toggleHideAll: () => set((s) => ({ hideAll: !s.hideAll, selectedDrawingId: null })),
        undo: () =>
          set((s) => {
            const prev = s.undoStack.at(-1)
            if (!prev) return {}
            return {
              ...restore(s, prev),
              undoStack: s.undoStack.slice(0, -1),
              redoStack: [...s.redoStack, current(s)],
            }
          }),
        redo: () =>
          set((s) => {
            const next = s.redoStack.at(-1)
            if (!next) return {}
            return {
              ...restore(s, next),
              redoStack: s.redoStack.slice(0, -1),
              undoStack: [...s.undoStack, current(s)],
            }
          }),
      }),
      {
        name: chartKey(index),
        storage: createJSONStorage(() => localStorage),
        // Chỉ lưu cài đặt & hình vẽ, không lưu trạng thái replay
        partialize: (s) => ({
          symbol: s.symbol,
          interval: s.interval,
          invertScale: s.invertScale,
          rsiEnabled: s.rsiEnabled,
          drawings: s.drawings,
          lockAll: s.lockAll,
          hideAll: s.hideAll,
        }),
      },
    ),
  )

const stores: ChartStore[] = []

/** Store của biểu đồ thứ `index` (tạo khi cần, dùng lại cho các lần sau) */
export function getChartStore(index: number): ChartStore {
  return (stores[index] ??= createChartStore(index))
}

/** Store của biểu đồ đang chọn (dùng ngoài React, vd. phím tắt) */
export function activeChartStore(): ChartStore {
  return getChartStore(useAppStore.getState().activeChart)
}

/** Chỉ số biểu đồ của cây component; null = ngoài ô biểu đồ -> dùng biểu đồ đang chọn */
export const ChartIndexContext = createContext<number | null>(null)

/** Store của biểu đồ chứa component (trong ô biểu đồ) hoặc biểu đồ đang chọn (toolbar, panel…) */
export function useChartStoreApi(): ChartStore {
  const index = useContext(ChartIndexContext)
  const active = useAppStore((s) => s.activeChart)
  return getChartStore(index ?? active)
}

const selectAll = (s: ChartState) => s

export function useChartStore(): ChartState
export function useChartStore<T>(selector: (s: ChartState) => T): T
export function useChartStore<T>(selector?: (s: ChartState) => T) {
  return useStore(useChartStoreApi(), (selector ?? selectAll) as (s: ChartState) => T)
}
