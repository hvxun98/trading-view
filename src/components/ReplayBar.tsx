import { useState } from 'react'
import { useChartStore } from '../store/useChartStore'

const SPEEDS = [0.5, 1, 2, 3, 5, 10]

/** "2024-05-01T13:00" (hiểu là UTC, cùng múi giờ với trục thời gian) -> giây */
function parseUtc(value: string): number | null {
  const ms = Date.parse(value + 'Z')
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000)
}

function formatUtc(time: number): string {
  return new Date(time * 1000).toISOString().slice(0, 16).replace('T', ' ')
}

export function ReplayBar() {
  const {
    replayMode,
    replayPlaying,
    replaySpeed,
    replayTime,
    togglePlay,
    stepForward,
    setReplaySpeed,
    startReplaySelect,
    exitReplay,
    jumpReplayTo,
  } = useChartStore()
  const [date, setDate] = useState('')

  if (replayMode === 'off') return null

  const active = replayMode === 'active'
  const jump = () => {
    const t = parseUtc(date)
    if (t !== null) jumpReplayTo(t)
  }

  return (
    <div className="replay-bar">
      <button
        className={`tb-btn ${replayMode === 'selecting' ? 'active' : ''}`}
        onClick={startReplaySelect}
        title="Chọn nến bắt đầu"
      >
        ✂ Select bar
      </button>

      <div className="replay-date">
        <input
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && jump()}
          title="Mốc thời gian (UTC)"
        />
        <button className="tb-btn" disabled={!date} onClick={jump} title="Nhảy tới mốc thời gian">
          Go
        </button>
      </div>

      <div className="divider" />

      <button
        className="tb-btn replay-play"
        disabled={!active}
        onClick={togglePlay}
        title={replayPlaying ? 'Pause (Shift + ↓)' : 'Play (Shift + ↓)'}
      >
        {replayPlaying ? '❚❚' : '▶'}
      </button>
      <button className="tb-btn" disabled={!active} onClick={stepForward} title="Forward (Shift + →)">
        ▶|
      </button>
      <select value={replaySpeed} onChange={(e) => setReplaySpeed(+e.target.value)} title="Tốc độ">
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}x
          </option>
        ))}
      </select>

      {active && replayTime !== null && <span className="replay-time">{formatUtc(replayTime)} UTC</span>}

      <div className="divider" />

      <button className="tb-btn" onClick={exitReplay} title="Thoát replay, về realtime">
        ✕
      </button>
    </div>
  )
}
