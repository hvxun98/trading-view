import { useT } from '../i18n'
import { describeDrawing } from '../lib/drawings'
import { useChartStore } from '../store/useChartStore'
import type { Drawing } from '../types'
import { EyeIcon, EyeOffIcon, LockIcon, TrashIcon, UnlockIcon } from './icons'

const NO_DRAWINGS: Drawing[] = []

/** Danh sách hình vẽ của symbol hiện tại: chọn / xoá từng hình (giống Object Tree của TradingView) */
export function ObjectTree() {
  const drawings = useChartStore((s) => s.drawings[s.symbol]) ?? NO_DRAWINGS
  const { selectedDrawingId, selectDrawing, removeDrawing, clearDrawings, toggleDrawingLock, toggleDrawingHidden } =
    useChartStore()
  const t = useT()

  if (drawings.length === 0) {
    return <div className="panel-empty">{t('tree.empty')}</div>
  }

  return (
    <div className="object-tree">
      <div className="object-tree-actions">
        <span>{t('tree.count', { n: drawings.length })}</span>
        <button className="tb-btn" onClick={clearDrawings}>
          {t('tree.removeAll')}
        </button>
      </div>
      {drawings.map((d) => (
        <div
          key={d.id}
          className={`object-row ${d.id === selectedDrawingId ? 'active' : ''} ${d.hidden ? 'is-hidden' : ''}`}
          // Hình đang ẩn thì không chọn được trên chart
          onClick={() => !d.hidden && selectDrawing(d.id === selectedDrawingId ? null : d.id)}
        >
          <span className="object-name">{t(`tool.${d.type}`)}</span>
          <span className="object-desc">{describeDrawing(d)}</span>
          <button
            className={`object-btn ${d.hidden ? 'on' : ''}`}
            title={d.hidden ? t('tree.show') : t('tree.hide')}
            onClick={(e) => {
              e.stopPropagation()
              toggleDrawingHidden(d.id)
            }}
          >
            {d.hidden ? <EyeOffIcon /> : <EyeIcon />}
          </button>
          <button
            className={`object-btn ${d.locked ? 'on' : ''}`}
            title={d.locked ? t('tree.unlock') : t('tree.lock')}
            onClick={(e) => {
              e.stopPropagation()
              toggleDrawingLock(d.id)
            }}
          >
            {d.locked ? <LockIcon /> : <UnlockIcon />}
          </button>
          <button
            className="object-btn"
            title={t('tree.remove')}
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
