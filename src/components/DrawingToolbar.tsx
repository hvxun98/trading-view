import type { ReactNode } from 'react'
import { useChartStore } from '../store/useChartStore'
import type { Tool } from '../types'
import { EyeIcon, EyeOffIcon, LockIcon, UnlockIcon } from './icons'

const icon = (children: ReactNode) => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.2">
    {children}
  </svg>
)

const handle = (cx: number, cy: number) => <circle cx={cx} cy={cy} r="2" fill="var(--bg)" />

const TOOLS: { tool: Tool; title: string; icon: ReactNode }[] = [
  {
    tool: 'cursor',
    title: 'Cross',
    icon: icon(
      <>
        <path d="M14 5v18M5 14h18" />
      </>,
    ),
  },
  {
    tool: 'trendline',
    title: 'Trend Line (Alt + T)',
    icon: icon(
      <>
        <path d="M7 21 21 7" />
        {handle(7, 21)}
        {handle(21, 7)}
      </>,
    ),
  },
  {
    tool: 'ray',
    title: 'Ray',
    icon: icon(
      <>
        <path d="M7 21 25 3" />
        {handle(7, 21)}
        {handle(14, 14)}
      </>,
    ),
  },
  {
    tool: 'hline',
    title: 'Horizontal Line (Alt + H)',
    icon: icon(
      <>
        <path d="M3 14h22" />
        {handle(14, 14)}
      </>,
    ),
  },
  {
    tool: 'vline',
    title: 'Vertical Line (Alt + V)',
    icon: icon(
      <>
        <path d="M14 3v22" />
        {handle(14, 14)}
      </>,
    ),
  },
  {
    tool: 'rect',
    title: 'Rectangle',
    icon: icon(
      <>
        <rect x="6" y="8" width="16" height="12" />
        {handle(6, 8)}
        {handle(22, 20)}
      </>,
    ),
  },
  {
    tool: 'fib',
    title: 'Fib Retracement (Alt + F)',
    icon: icon(
      <>
        <path d="M5 6h18M5 11h18M5 16h18M5 21h18" />
        <path d="M6 21 22 6" strokeDasharray="2 2" />
      </>,
    ),
  },
]

export function DrawingToolbar() {
  const {
    activeTool,
    setTool,
    clearDrawings,
    removeSelectedDrawing,
    selectedDrawingId,
    lockAll,
    hideAll,
    toggleLockAll,
    toggleHideAll,
  } = useChartStore()

  return (
    <nav className="drawing-toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          className={`dt-btn ${activeTool === t.tool ? 'active' : ''}`}
          title={t.title}
          onClick={() => setTool(activeTool === t.tool ? 'cursor' : t.tool)}
        >
          {t.icon}
        </button>
      ))}

      <div className="dt-divider" />

      <button
        className={`dt-btn ${lockAll ? 'active' : ''}`}
        title={lockAll ? 'Mở khoá tất cả hình vẽ' : 'Khoá tất cả hình vẽ'}
        onClick={toggleLockAll}
      >
        {lockAll ? <LockIcon /> : <UnlockIcon />}
      </button>
      <button
        className={`dt-btn ${hideAll ? 'active' : ''}`}
        title={hideAll ? 'Hiện tất cả hình vẽ' : 'Ẩn tất cả hình vẽ'}
        onClick={toggleHideAll}
      >
        {hideAll ? <EyeOffIcon /> : <EyeIcon />}
      </button>

      <button
        className="dt-btn"
        title="Xoá hình đang chọn (Delete)"
        disabled={!selectedDrawingId}
        onClick={removeSelectedDrawing}
      >
        {icon(
          <>
            <path d="M8 8l12 12M20 8 8 20" />
          </>,
        )}
      </button>
      <button className="dt-btn" title="Xoá tất cả hình vẽ" onClick={clearDrawings}>
        {icon(
          <>
            <path d="M7 9h14M11 9V6h6v3M9 9l1 13h8l1-13" />
          </>,
        )}
      </button>
    </nav>
  )
}
