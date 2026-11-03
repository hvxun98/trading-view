import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { CATEGORIES, INDICATORS, type IndicatorCategory, type IndicatorDef } from '../lib/indicators'
import { useChartStore } from '../store/useChartStore'

type Tab = 'all' | IndicatorCategory

/**
 * Hộp thoại "Indicators" của TradingView: lọc theo nhóm, tìm theo tên, bấm để thêm vào biểu đồ (hộp thoại vẫn mở
 * để thêm tiếp; bấm lại cùng chỉ báo thì thêm một bản nữa).
 */
export function IndicatorsDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const addIndicator = useChartStore((s) => s.addIndicator)
  const indicators = useChartStore((s) => s.indicators)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [tab, setTab] = useState<Tab>('all')
  const listRef = useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()
  const rows = INDICATORS.filter(
    (d) =>
      (tab === 'all' || d.category === tab) &&
      (!q || `${d.short} ${t(d.name)} ${t(`category.${d.category}`)}`.toLowerCase().includes(q)),
  )
  const activeIndex = Math.min(active, rows.length - 1)
  const count = (d: IndicatorDef) => indicators.filter((i) => i.type === d.type).length

  // Dòng đang chọn bằng phím ↑ / ↓ luôn nằm trong vùng nhìn thấy
  useEffect(() => {
    listRef.current?.querySelector('.search-row.active')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal search-dialog indicators-dialog"
        role="dialog"
        aria-label={t('toolbar.indicators')}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') onClose()
          else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive(Math.min(activeIndex + 1, rows.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive(Math.max(activeIndex - 1, 0))
          } else if (e.key === 'Enter' && rows[activeIndex]) addIndicator(rows[activeIndex].type)
        }}
      >
        <div className="modal-header">
          <span>{t('toolbar.indicators')}</span>
          <button className="tb-btn" title={t('dlg.close')} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="search-input">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="7.5" cy="7.5" r="5.5" />
            <path d="m12 12 4 4" />
          </svg>
          <input
            autoFocus
            value={query}
            placeholder={t('indicator.search')}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
          />
          {query && (
            <button className="tb-btn" onClick={() => setQuery('')}>
              ×
            </button>
          )}
        </div>

        <div className="search-tabs">
          {(['all', ...CATEGORIES] as Tab[]).map((id) => (
            <button
              key={id}
              data-tab={id}
              className={`search-tab ${tab === id ? 'active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setTab(id)
                setActive(0)
              }}
            >
              {t(id === 'all' ? 'search.all' : `category.${id}`)}
            </button>
          ))}
        </div>

        <div className="search-list" ref={listRef}>
          {rows.length === 0 && <div className="search-empty">{t('indicator.empty')}</div>}
          {rows.map((d, i) => {
            const n = count(d)
            return (
              <div
                key={d.type}
                data-indicator={d.type}
                className={`search-row indicator-row ${i === activeIndex ? 'active' : ''}`}
                title={n ? t('indicator.added') : undefined}
                onMouseEnter={() => setActive(i)}
                // Giữ focus ở ô tìm kiếm để gõ tiếp / Esc vẫn đóng được hộp thoại
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addIndicator(d.type)}
              >
                <span className="indicator-full">{t(d.name)}</span>
                <span className="sym-type">{t(`category.${d.category}`)}</span>
                <span className="sym-type">{t(d.overlay ? 'indicator.onChart' : 'indicator.newPane')}</span>
                <span className={`indicator-count ${n ? '' : 'empty'}`}>{n ? `✓ ${n}` : ''}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
