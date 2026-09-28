import { useState } from 'react'
import { INTERVALS } from '../lib/intervals'
import { useChartStore } from '../store/useChartStore'
import { WATCHLIST } from '../lib/symbols'

export function TopToolbar() {
  const { symbol, interval, replayMode, setSymbol, setInterval, startReplaySelect, exitReplay } = useChartStore()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

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

      <button
        className={`tb-btn ${replayMode !== 'off' ? 'active' : ''}`}
        onClick={() => (replayMode === 'off' ? startReplaySelect() : exitReplay())}
        title="Bar Replay"
      >
        ⏪ Replay
      </button>
    </header>
  )
}
