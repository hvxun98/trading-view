import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_WATCHLIST, type MetalsSource } from '../data/catalog'
import type { Mt5Config } from '../data/mt5'
import type { OandaConfig } from '../data/oanda'
import { detectLanguage } from '../i18n/detect'
import { layoutInfo, type LayoutId } from '../lib/layouts'
import type { Lang } from '../types'

/** Trạng thái dùng chung toàn app; trạng thái riêng từng biểu đồ nằm trong useChartStore */
interface AppState {
  /** Ngôn ngữ giao diện (áp dụng cho mọi thành phần, kể cả nhãn vẽ trên chart) */
  language: Lang
  /** Danh sách theo dõi (thêm / xoá như TradingView) */
  watchlist: string[]
  /** Token OANDA (lưu trong trình duyệt) — null = chưa cấu hình */
  oanda: OandaConfig | null
  /** Bridge MetaTrader 5 (bridge/mt5_bridge.py) — null = không dùng */
  mt5: Mt5Config | null
  /** Nguồn realtime cho XAUUSD / XAGUSD khi không dùng MT5 */
  metalsSource: MetalsSource
  /** Bố cục nhiều biểu đồ */
  layout: LayoutId
  /** Biểu đồ đang chọn: toolbar, công cụ vẽ, Object Tree, Watchlist, phím tắt áp dụng cho biểu đồ này */
  activeChart: number
  /**
   * Vị trí thanh replay do người dùng kéo tới, theo tỉ lệ 0..1 của khoảng trống trong vùng chart
   * (giữ đúng chỗ khi đổi kích thước); null = mặc định giữa, sát đáy
   */
  replayBarPos: { x: number; y: number } | null

  setLanguage: (language: Lang) => void
  addToWatchlist: (symbol: string) => void
  removeFromWatchlist: (symbol: string) => void
  setOanda: (oanda: OandaConfig | null) => void
  setMt5: (mt5: Mt5Config | null) => void
  setMetalsSource: (source: MetalsSource) => void
  setLayout: (layout: LayoutId) => void
  setActiveChart: (index: number) => void
  setReplayBarPos: (pos: { x: number; y: number } | null) => void
}

export const APP_KEY = 'tv-clone'
export const chartKey = (index: number) => `tv-clone-chart-${index}`

/**
 * Bản cũ (1 biểu đồ) lưu mã, khung thời gian, hình vẽ… chung trong 'tv-clone'.
 * Chuyển sang biểu đồ đầu tiên trước khi store app ghi đè key này.
 */
function migrateSingleChart() {
  try {
    const saved = JSON.parse(localStorage.getItem(APP_KEY) ?? 'null')
    const state = saved?.state
    if (!state || !('symbol' in state)) return
    const { symbol, interval, invertScale, rsiEnabled, drawings, lockAll, hideAll, ...app } = state
    if (!localStorage.getItem(chartKey(0))) {
      localStorage.setItem(
        chartKey(0),
        JSON.stringify({
          state: { symbol, interval, invertScale, rsiEnabled, drawings, lockAll, hideAll },
          version: 0,
        }),
      )
    }
    localStorage.setItem(APP_KEY, JSON.stringify({ ...saved, state: app }))
  } catch {
    // localStorage bị chặn / dữ liệu hỏng: bỏ qua
  }
}
migrateSingleChart()

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      language: detectLanguage(),
      watchlist: DEFAULT_WATCHLIST,
      oanda: null,
      mt5: null,
      metalsSource: 'spot',
      layout: '1',
      activeChart: 0,
      replayBarPos: null,

      setLanguage: (language) => set({ language }),
      addToWatchlist: (symbol) =>
        set((s) => (s.watchlist.includes(symbol) ? {} : { watchlist: [...s.watchlist, symbol] })),
      removeFromWatchlist: (symbol) => set((s) => ({ watchlist: s.watchlist.filter((x) => x !== symbol) })),
      setOanda: (oanda) => set({ oanda }),
      setMt5: (mt5) => set({ mt5 }),
      setMetalsSource: (metalsSource) => set({ metalsSource }),
      // Bớt biểu đồ: nếu biểu đồ đang chọn bị ẩn thì chọn biểu đồ cuối còn lại
      setLayout: (layout) =>
        set((s) => ({ layout, activeChart: Math.min(s.activeChart, layoutInfo(layout).count - 1) })),
      setReplayBarPos: (replayBarPos) => set({ replayBarPos }),
      setActiveChart: (activeChart) => set((s) => (s.activeChart === activeChart ? {} : { activeChart })),
    }),
    {
      name: APP_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        language: s.language,
        watchlist: s.watchlist,
        oanda: s.oanda,
        mt5: s.mt5,
        metalsSource: s.metalsSource,
        layout: s.layout,
        activeChart: s.activeChart,
        replayBarPos: s.replayBarPos,
      }),
    },
  ),
)
