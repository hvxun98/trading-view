import { useEffect, useRef, useState } from 'react'
import { COLOR_PALETTE, DRAWING_LABELS, LINE_STYLES, LINE_WIDTHS, lineDash, styleOf } from '../lib/drawings'
import { useChartStore } from '../store/useChartStore'
import type { Drawing, LineStyleName } from '../types'
import { CloneIcon, LineSample, LockIcon, TrashIcon, UnlockIcon } from './icons'

const STYLE_LABELS: Record<LineStyleName, string> = { solid: 'Line', dashed: 'Dashed line', dotted: 'Dotted line' }

type Popover = 'color' | 'width' | 'style' | null

interface Props {
  drawing: Drawing
  onClone: () => void
}

/** Thanh công cụ nổi của hình đang chọn: màu, độ dày, kiểu nét, khoá, nhân bản, xoá (như TradingView) */
export function DrawingFloatToolbar({ drawing, onClone }: Props) {
  const { setDrawingStyle, toggleDrawingLock, removeDrawing } = useChartStore()
  const [popover, setPopover] = useState<Popover>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const style = styleOf(drawing)

  // Đóng menu con khi click ra ngoài
  useEffect(() => {
    if (!popover) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPopover(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [popover])

  const toggle = (p: Popover) => setPopover((cur) => (cur === p ? null : p))
  const apply = (patch: Parameters<typeof setDrawingStyle>[1]) => {
    setDrawingStyle(drawing.id, patch)
    setPopover(null)
  }

  return (
    <div className="float-toolbar" ref={rootRef} onMouseDown={(e) => e.stopPropagation()}>
      <span className="float-toolbar-name">{DRAWING_LABELS[drawing.type]}</span>

      <div className="ft-group">
        <button
          className={`tb-btn ft-btn ${popover === 'color' ? 'active' : ''}`}
          title="Màu"
          onClick={() => toggle('color')}
        >
          <span className="ft-swatch" style={{ background: style.color }} />
        </button>
        {popover === 'color' && (
          <div className="ft-popover ft-palette">
            {COLOR_PALETTE.map((row, i) => (
              <div key={i} className="ft-palette-row">
                {row.map((c) => (
                  <button
                    key={c}
                    className={`ft-color ${c === style.color ? 'active' : ''}`}
                    style={{ background: c }}
                    title={c}
                    onClick={() => apply({ color: c })}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ft-group">
        <button
          className={`tb-btn ft-btn ${popover === 'width' ? 'active' : ''}`}
          title="Độ dày nét"
          onClick={() => toggle('width')}
        >
          <LineSample width={style.lineWidth} dash={[]} />
          <span className="ft-label">{style.lineWidth}px</span>
        </button>
        {popover === 'width' && (
          <ul className="ft-popover ft-list">
            {LINE_WIDTHS.map((w) => (
              <li key={w} className={w === style.lineWidth ? 'active' : ''} onClick={() => apply({ lineWidth: w })}>
                <LineSample width={w} dash={[]} />
                <span>{w}px</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ft-group">
        <button
          className={`tb-btn ft-btn ${popover === 'style' ? 'active' : ''}`}
          title="Kiểu nét"
          onClick={() => toggle('style')}
        >
          <LineSample width={2} dash={lineDash(style.lineStyle, 2)} />
        </button>
        {popover === 'style' && (
          <ul className="ft-popover ft-list">
            {LINE_STYLES.map((ls) => (
              <li
                key={ls}
                className={ls === style.lineStyle ? 'active' : ''}
                onClick={() => apply({ lineStyle: ls })}
              >
                <LineSample width={2} dash={lineDash(ls, 2)} />
                <span>{STYLE_LABELS[ls]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="divider" />

      <button
        className={`tb-btn ft-btn ${drawing.locked ? 'active' : ''}`}
        title={drawing.locked ? 'Mở khoá' : 'Khoá'}
        onClick={() => toggleDrawingLock(drawing.id)}
      >
        {drawing.locked ? <LockIcon /> : <UnlockIcon />}
      </button>
      <button className="tb-btn ft-btn" title="Clone" onClick={onClone}>
        <CloneIcon />
      </button>
      <button className="tb-btn ft-btn" title="Remove (Delete)" onClick={() => removeDrawing(drawing.id)}>
        <TrashIcon />
      </button>
    </div>
  )
}
