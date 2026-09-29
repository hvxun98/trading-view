/** Bố cục nhiều biểu đồ (nút "Select layout" của TradingView) */
export type LayoutId = '1' | '2v' | '2h' | '3v' | '1-2' | '4'

export interface LayoutInfo {
  id: LayoutId
  /** Số biểu đồ */
  count: number
  /** Các ô trong biểu tượng 18×18: [x, y, w, h] */
  cells: [number, number, number, number][]
}

export const LAYOUTS: LayoutInfo[] = [
  { id: '1', count: 1, cells: [[1, 1, 16, 16]] },
  {
    id: '2v',
    count: 2,
    cells: [
      [1, 1, 7.5, 16],
      [9.5, 1, 7.5, 16],
    ],
  },
  {
    id: '2h',
    count: 2,
    cells: [
      [1, 1, 16, 7.5],
      [1, 9.5, 16, 7.5],
    ],
  },
  {
    id: '3v',
    count: 3,
    cells: [
      [1, 1, 4.6, 16],
      [6.7, 1, 4.6, 16],
      [12.4, 1, 4.6, 16],
    ],
  },
  {
    id: '1-2',
    count: 3,
    cells: [
      [1, 1, 7.5, 16],
      [9.5, 1, 7.5, 7.5],
      [9.5, 9.5, 7.5, 7.5],
    ],
  },
  {
    id: '4',
    count: 4,
    cells: [
      [1, 1, 7.5, 7.5],
      [9.5, 1, 7.5, 7.5],
      [1, 9.5, 7.5, 7.5],
      [9.5, 9.5, 7.5, 7.5],
    ],
  },
]

export const MAX_CHARTS = 4

export function layoutInfo(id: LayoutId): LayoutInfo {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0]
}
