import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useChartStore } from '../store/useChartStore'
import type { Tool } from '../types'
import { EyeIcon, EyeOffIcon, LockIcon, UnlockIcon } from './icons'

const icon = (children: ReactNode) => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.2">
    {children}
  </svg>
)

const handle = (cx: number, cy: number) => <circle cx={cx} cy={cy} r="2" fill="var(--bg)" />

const TOOL_LIST: { tool: Tool; title: string; icon: ReactNode }[] = [
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
  {
    tool: 'long',
    title: 'Long Position',
    icon: icon(
      <>
        <rect x="6" y="5" width="16" height="9" fill="rgba(8, 153, 129, 0.45)" stroke="none" />
        <rect x="6" y="14" width="16" height="8" fill="rgba(242, 54, 69, 0.45)" stroke="none" />
        <rect x="6" y="5" width="16" height="17" />
        <path d="M6 14h16" />
      </>,
    ),
  },
  {
    tool: 'short',
    title: 'Short Position',
    icon: icon(
      <>
        <rect x="6" y="5" width="16" height="8" fill="rgba(242, 54, 69, 0.45)" stroke="none" />
        <rect x="6" y="13" width="16" height="9" fill="rgba(8, 153, 129, 0.45)" stroke="none" />
        <rect x="6" y="5" width="16" height="17" />
        <path d="M6 13h16" />
      </>,
    ),
  },
  {
    tool: 'text',
    title: 'Text',
    icon: icon(<path d="M8 8h12M14 8v13M11 21h6" />),
  },
  {
    tool: 'note',
    title: 'Note',
    icon: icon(
      <>
        <path d="M7 6h14v11l-5 5H7z" />
        <path d="M16 22v-5h5M10 10h8M10 13h6" />
      </>,
    ),
  },
  {
    tool: 'callout',
    title: 'Callout',
    icon: icon(<path d="M5 7h18v10H13l-5 4v-4H5z" />),
  },
  {
    tool: 'measure',
    title: 'Measure (Shift + Click)',
    icon: icon(
      <>
        <path d="M5 19 19 5l4 4L9 23z" />
        <path d="M10 14l2 2M13 11l2 2M16 8l2 2" />
      </>,
    ),
  },
]

const TOOL_INFO = Object.fromEntries(TOOL_LIST.map((t) => [t.tool, t])) as Record<
  Tool,
  { tool: Tool; title: string; icon: ReactNode }
>

/** Nhóm công cụ như thanh bên trái của TradingView; nhóm nhiều công cụ có menu con */
const GROUPS: { id: string; label: string; tools: Tool[] }[] = [
  { id: 'cursor', label: 'Cursors', tools: ['cursor'] },
  { id: 'lines', label: 'Lines', tools: ['trendline', 'ray', 'hline', 'vline'] },
  { id: 'fib', label: 'Fibonacci', tools: ['fib'] },
  { id: 'shapes', label: 'Shapes', tools: ['rect'] },
  { id: 'text', label: 'Text & Notes', tools: ['text', 'note', 'callout'] },
  { id: 'forecast', label: 'Forecasting', tools: ['long', 'short'] },
  { id: 'measure', label: 'Measure', tools: ['measure'] },
]

const Caret = () => (
  <svg width="5" height="8" viewBox="0 0 5 8">
    <path d="M1 1l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.2" />
  </svg>
)

export function DrawingToolbar() {
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  /** Công cụ dùng gần nhất trong mỗi nhóm -> hiện trên nút chính (như TradingView) */
  const [lastUsed, setLastUsed] = useState<Record<string, Tool>>({})
  const navRef = useRef<HTMLElement>(null)
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

  // Ghi nhớ công cụ vừa chọn trong nhóm (kể cả chọn bằng phím tắt) — cập nhật ngay khi render
  const [prevTool, setPrevTool] = useState(activeTool)
  if (prevTool !== activeTool) {
    setPrevTool(activeTool)
    const group = GROUPS.find((g) => g.tools.includes(activeTool))
    if (group && group.tools.length > 1) setLastUsed((prev) => ({ ...prev, [group.id]: activeTool }))
  }

  // Đóng menu con khi click ra ngoài
  useEffect(() => {
    if (!openGroup) return
    const onDown = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpenGroup(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openGroup])

  const pick = (tool: Tool) => {
    setTool(activeTool === tool && tool !== 'cursor' ? 'cursor' : tool)
    setOpenGroup(null)
  }

  return (
    <nav className="drawing-toolbar" ref={navRef}>
      {GROUPS.map((g) => {
        const current = g.tools.includes(activeTool) ? activeTool : (lastUsed[g.id] ?? g.tools[0])
        const info = TOOL_INFO[current]
        return (
          <div key={g.id} className="dt-group">
            <button
              className={`dt-btn ${g.tools.includes(activeTool) ? 'active' : ''}`}
              title={info.title}
              data-tool={current}
              onClick={() => pick(current)}
            >
              {info.icon}
            </button>
            {g.tools.length > 1 && (
              <button
                className={`dt-arrow ${openGroup === g.id ? 'open' : ''}`}
                title={g.label}
                data-group={g.id}
                onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)}
              >
                <Caret />
              </button>
            )}
            {openGroup === g.id && (
              <div className="dt-flyout">
                <div className="dt-flyout-title">{g.label}</div>
                {g.tools.map((t) => (
                  <button
                    key={t}
                    className={`dt-flyout-item ${activeTool === t ? 'active' : ''}`}
                    data-tool={t}
                    onClick={() => pick(t)}
                  >
                    {TOOL_INFO[t].icon}
                    <span>{TOOL_INFO[t].title.replace(/ \(.*\)$/, '')}</span>
                    <kbd>{TOOL_INFO[t].title.match(/\((.*)\)$/)?.[1] ?? ''}</kbd>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}

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
