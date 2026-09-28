import { DRAWING_LABELS, describeDrawing } from '../lib/drawings'
import { useChartStore } from '../store/useChartStore'
import type { Drawing } from '../types'
import { EyeIcon, EyeOffIcon, LockIcon, TrashIcon, UnlockIcon } from './icons'

const NO_DRAWINGS: Drawing[] = []

/** Danh sách hình vẽ của symbol hiện tại: chọn / xoá từng hình (giống Object Tree của TradingView) */
export function ObjectTree() {
  const drawings = useChartStore((s) => s.drawings[s.symbol]) ?? NO_DRAWINGS
  const { selectedDrawingId, selectDrawing, removeDrawing, clearDrawings, toggleDrawingLock, toggleDrawingHidden } =
    useChartStore()

  if (drawings.length === 0) {
    return <div className="panel-empty">Chưa có hình vẽ nào. Chọn công cụ ở thanh bên trái để vẽ.</div>
  }

  return (
    <div className="object-tree">
      <div className="object-tree-actions">
        <span>{drawings.length} hình vẽ</span>
        <button className="tb-btn" onClick={clearDrawings}>
          Xoá tất cả
        </button>
      </div>
      {drawings.map((d) => (
        <div
          key={d.id}
          className={`object-row ${d.id === selectedDrawingId ? 'active' : ''} ${d.hidden ? 'is-hidden' : ''}`}
          // Hình đang ẩn thì không chọn được trên chart
          onClick={() => !d.hidden && selectDrawing(d.id === selectedDrawingId ? null : d.id)}
        >
          <span className="object-name">{DRAWING_LABELS[d.type]}</span>
          <span className="object-desc">{describeDrawing(d)}</span>
          <button
            className={`object-btn ${d.hidden ? 'on' : ''}`}
            title={d.hidden ? 'Hiện' : 'Ẩn'}
            onClick={(e) => {
              e.stopPropagation()
              toggleDrawingHidden(d.id)
            }}
          >
            {d.hidden ? <EyeOffIcon /> : <EyeIcon />}
          </button>
          <button
            className={`object-btn ${d.locked ? 'on' : ''}`}
            title={d.locked ? 'Mở khoá' : 'Khoá'}
            onClick={(e) => {
              e.stopPropagation()
              toggleDrawingLock(d.id)
            }}
          >
            {d.locked ? <LockIcon /> : <UnlockIcon />}
          </button>
          <button
            className="object-btn"
            title="Xoá hình này"
            onClick={(e) => {
              e.stopPropagation()
              removeDrawing(d.id)
            }}
          >
            <TrashIcon />
          </button>
        </div>
      ))}
    </div>
  )
}
