import { useChartStore } from '../store/useChartStore'

const SPEEDS = [0.5, 1, 2, 3, 5, 10]

export function ReplayBar() {
  const { replayMode, replayPlaying, replaySpeed, togglePlay, stepForward, setReplaySpeed, startReplaySelect, exitReplay } =
    useChartStore()

  if (replayMode === 'off') return null

  const active = replayMode === 'active'

  return (
    <div className="replay-bar">
      <button className="tb-btn" onClick={startReplaySelect} title="Chọn lại điểm bắt đầu">
        ✂ Select bar
      </button>
      <button className="tb-btn" disabled={!active} onClick={togglePlay} title="Play / Pause">
        {replayPlaying ? '❚❚' : '▶'}
      </button>
      <button className="tb-btn" disabled={!active} onClick={stepForward} title="Forward">
        ▶|
      </button>
      <select value={replaySpeed} onChange={(e) => setReplaySpeed(+e.target.value)}>
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}x
          </option>
        ))}
      </select>
      <button className="tb-btn" onClick={exitReplay} title="Thoát replay">
        ✕
      </button>
    </div>
  )
}
