import { useState } from 'react'
import { INTERVALS } from '../lib/intervals'
import { useChartStore } from '../store/useChartStore'
import { WATCHLIST } from '../lib/symbols'
import { RedoIcon, UndoIcon } from './icons'

export function TopToolbar() {
  const {
    symbol,
    interval,
    replayMode,
    invertScale,
    rsiEnabled,
    setSymbol,
    setInterval,
    startReplaySelect,
    exitReplay,
    resetView,
    toggleInvertScale,
    toggleRsi,
    undo,
    redo,
  } = useChartStore()
  const canUndo = useChartStore((s) => s.undoStack.length > 0)
  const canRedo = useChartStore((s) => s.redoStack.length > 0)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [indicatorsOpen, setIndicatorsOpen] = useState(false)

  const q = query.trim().toUpperCase()
  const suggestions = WATCHLIST.filter((s) => s.includes(q))

  const choose = (s: string) => {
    setSymbol(s)
    setQuery('')
    setOpen(false)
  }

  return (
    <header className="toolbar">
      <div className="symbol-search">
        <input
          value={open ? query : symbol}
          placeholder={symbol}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q) choose(q)
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
          }}
        />
        {open && (
          <ul className="symbol-dropdown">
            {suggestions.map((s) => (
              <li key={s} onMouseDown={() => choose(s)}>
                {s}
              </li>
            ))}
            {q && !suggestions.includes(q) && <li onMouseDown={() => choose(q)}>{q} ↵</li>}
          </ul>
        )}
      </div>

      <div className="divider" />

      {INTERVALS.map((i) => (
        <button
          key={i.value}
          className={`tb-btn ${interval === i.value ? 'active' : ''}`}
          onClick={() => setInterval(i.value)}
        >
          {i.label}
        </button>
      ))}

      <div className="divider" />

      <div className="menu-anchor">
        <button
          className={`tb-btn ${indicatorsOpen ? 'active' : ''}`}
          onClick={() => setIndicatorsOpen((v) => !v)}
          onBlur={() => setTimeout(() => setIndicatorsOpen(false), 150)}
          title="Indicators"
        >
          <i className="fx">ƒx</i> Indicators
        </button>
        {indicatorsOpen && (
          <ul className="symbol-dropdown">
            <li onMouseDown={toggleRsi}>
              {rsiEnabled ? '✓' : '\u2003'} Relative Strength Index (RSI)
            </li>
          </ul>
        )}
      </div>

      <div className="divider" />

      <button
        className={`tb-btn ${replayMode !== 'off' ? 'active' : ''}`}
        onClick={() => (replayMode === 'off' ? startReplaySelect() : exitReplay())}
        title="Bar Replay"
      >
        ⏪ Replay
      </button>

      <button className="tb-btn" onClick={resetView} title="Đặt lại chế độ xem biểu đồ (Alt + R)">
        ⟲ Reset view
      </button>

      <button
        className={`tb-btn ${invertScale ? 'active' : ''}`}
        onClick={toggleInvertScale}
        title="Đảo ngược thang giá (Alt + I)"
      >
        ⇅ Invert scale
      </button>

      <div className="divider" />

      <button className="tb-btn tb-icon" onClick={undo} disabled={!canUndo} title="Undo (Ctrl + Z)">
        <UndoIcon />
      </button>
      <button className="tb-btn tb-icon" onClick={redo} disabled={!canRedo} title="Redo (Ctrl + Y)">
        <RedoIcon />
      </button>
    </header>
  )
}
