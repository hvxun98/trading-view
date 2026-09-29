import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useT } from '../i18n'
import { useAppStore } from '../store/useAppStore'
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
  const { replayBarPos, setReplayBarPos } = useAppStore()
  const barRef = useRef<HTMLDivElement>(null)
  /** Khoảng cách từ con trỏ tới góc trên-trái thanh khi đang kéo */
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const visible = replayMode !== 'off'

  /** Khoảng có thể đặt thanh trong vùng chart (toạ độ góc trên-trái) */
  const bounds = () => {
    const bar = barRef.current
    const parent = bar?.parentElement
    if (!bar || !parent) return null
    return {
      bar,
      parent,
      maxX: Math.max(0, parent.clientWidth - bar.offsetWidth),
      maxY: Math.max(0, parent.clientHeight - bar.offsetHeight),
    }
  }

  // Đặt thanh theo vị trí đã lưu (tỉ lệ) -> luôn nằm trong vùng chart khi đổi kích thước / bố cục
  const place = () => {
    const b = bounds()
    if (!b || dragRef.current) return
    const pos = useAppStore.getState().replayBarPos
    b.bar.classList.toggle('moved', !!pos)
    b.bar.style.left = pos ? `${pos.x * b.maxX}px` : ''
    b.bar.style.top = pos ? `${pos.y * b.maxY}px` : ''
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(place, [replayBarPos, visible])

  useEffect(() => {
    const b = bounds()
    if (!b) return
    // Thanh đổi độ rộng (vd. hiện giờ replay) hoặc vùng chart đổi kích thước
    const observer = new ResizeObserver(() => place())
    observer.observe(b.bar)
    observer.observe(b.parent)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const onGripDown = (e: PointerEvent<HTMLButtonElement>) => {
    const b = bounds()
    if (!b || e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = b.bar.getBoundingClientRect()
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    b.bar.classList.add('moved', 'dragging')
  }

  const onGripMove = (e: PointerEvent<HTMLButtonElement>) => {
    const b = bounds()
    if (!b || !dragRef.current) return
    const origin = b.parent.getBoundingClientRect()
    const left = Math.min(Math.max(e.clientX - origin.left - dragRef.current.dx, 0), b.maxX)
    const top = Math.min(Math.max(e.clientY - origin.top - dragRef.current.dy, 0), b.maxY)
    b.bar.style.left = `${left}px`
    b.bar.style.top = `${top}px`
  }

  const onGripUp = () => {
    const b = bounds()
    if (!b || !dragRef.current) return
    dragRef.current = null
    b.bar.classList.remove('dragging')
    setReplayBarPos({
      x: b.maxX ? b.bar.offsetLeft / b.maxX : 0,
      y: b.maxY ? b.bar.offsetTop / b.maxY : 0,
    })
  }

  // Phím mũi tên trên tay nắm: dịch 2% (Shift: 10%)
  const onGripKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    const b = bounds()
    if (!d || !b) return
    e.preventDefault()
    e.stopPropagation()
    const pos = replayBarPos ?? {
      x: b.maxX ? b.bar.offsetLeft / b.maxX : 0.5,
      y: b.maxY ? b.bar.offsetTop / b.maxY : 1,
    }
    const clamp = (v: number) => Math.min(Math.max(v, 0), 1)
    setReplayBarPos({ x: clamp(pos.x + d[0]), y: clamp(pos.y + d[1]) })
  }

  if (!visible) return null

  const active = replayMode === 'active'
  const jump = () => {
    const time = parseUtc(date)
    if (time !== null) jumpReplayTo(time)
  }

  return (
    <div className="replay-bar" ref={barRef}>
      <button
        className="replay-grip"
        title={t('replay.drag')}
        aria-label={t('replay.drag')}
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
        onDoubleClick={() => setReplayBarPos(null)}
        onKeyDown={onGripKey}
      >
        <svg width="8" height="16" viewBox="0 0 8 16" fill="currentColor">
          {[2, 6].flatMap((cx) => [4, 8, 12].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.3" />))}
        </svg>
      </button>
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
