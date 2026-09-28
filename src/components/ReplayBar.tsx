import { useState } from 'react'
import { useT } from '../i18n'
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
  const t = useT()

  if (replayMode === 'off') return null

  const active = replayMode === 'active'
  const jump = () => {
    const time = parseUtc(date)
    if (time !== null) jumpReplayTo(time)
  }

  return (
    <div className="replay-bar">
      <button
        className={`tb-btn ${replayMode === 'selecting' ? 'active' : ''}`}
        onClick={startReplaySelect}
        title={t('replay.selectBarTitle')}
      >
        ✂ {t('replay.selectBar')}
      </button>

      <div className="replay-date">
        <input
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && jump()}
          title={t('replay.dateTitle')}
        />
        <button className="tb-btn" disabled={!date} onClick={jump} title={t('replay.goTitle')}>
          {t('replay.go')}
        </button>
      </div>

      <div className="divider" />

      <button
        className="tb-btn replay-play"
        disabled={!active}
        onClick={togglePlay}
        title={replayPlaying ? t('replay.pause') : t('replay.play')}
      >
        {replayPlaying ? '❚❚' : '▶'}
      </button>
      <button className="tb-btn" disabled={!active} onClick={stepForward} title={t('replay.forward')}>
        ▶|
      </button>
      <select value={replaySpeed} onChange={(e) => setReplaySpeed(+e.target.value)} title={t('replay.speed')}>
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}x
          </option>
        ))}
      </select>

      {active && replayTime !== null && <span className="replay-time">{formatUtc(replayTime)} UTC</span>}

      <div className="divider" />

      <button className="tb-btn" onClick={exitReplay} title={t('replay.exit')}>
        ✕
      </button>
    </div>
  )
}
