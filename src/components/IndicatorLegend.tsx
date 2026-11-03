import { useState, type MouseEvent } from 'react'
import { useT } from '../i18n'
import { formatIndicatorValue, indicatorDef, indicatorLabel, plotStyle, visibleOn } from '../lib/indicators'
import { useChartStore } from '../store/useChartStore'
import type { Indicator } from '../types'
import { EyeIcon, EyeOffIcon, SettingsIcon } from './icons'

interface Props {
  indicator: Indicator
  /** Giá trị các plot tại nến đang rê chuột (hoặc nến cuối) */
  values: number[]
  /** Giá trị ở nến trước đó (màu cột histogram tăng / giảm) */
  prevValues: number[]
  pricePrecision: number
  onSettings: () => void
}

/**
 * Một dòng legend của chỉ báo như TradingView: tên + tham số, giá trị từng đường; rê chuột hiện nút
 * ẩn / cài đặt / xoá / thêm (nhân bản, xoá tất cả). Chỉ báo bị ẩn trên khung thời gian này (tab Visibility) thì mờ đi.
 */
export function IndicatorLegendRow({ indicator, values, prevValues, pricePrecision, onSettings }: Props) {
  const t = useT()
  const { removeIndicator, toggleIndicatorHidden, duplicateIndicator, removeAllIndicators, interval } = useChartStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const def = indicatorDef(indicator.type)
  const off = indicator.hidden || !visibleOn(indicator, interval)
  const menuAction = (action: () => void) => (e: MouseEvent) => {
    e.preventDefault()
    setMenuOpen(false)
    action()
  }

  return (
    <div
      className={`indicator-legend ${off ? 'is-hidden' : ''} ${menuOpen ? 'menu-open' : ''}`}
      data-indicator-id={indicator.id}
      data-indicator={indicator.type}
    >
      <span className="legend-name" onDoubleClick={onSettings}>
        {indicatorLabel(indicator, t)}
      </span>
      {!off &&
        indicator.showValues !== false &&
        def.plots.map((plot, i) => {
          const style = plotStyle(indicator, plot)
          // Cột theo mức khối lượng (VSA, Volume): chỉ hiện cột có giá trị ở nến này
          if (!style.visible || (plot.sparse && !Number.isFinite(values[i]))) return null
          // Histogram tự tô màu (MACD, AO): giá trị mang màu của cột
          const prev = Number.isFinite(prevValues[i]) ? prevValues[i] : 0
          const color = plot.barColor && Number.isFinite(values[i]) ? plot.barColor(values[i], prev) : style.color
          return (
            <span key={plot.key} className="legend-value" data-plot={plot.key} style={{ color }}>
              {formatIndicatorValue(indicator, values[i], pricePrecision)}
            </span>
          )
        })}
      <span className="legend-actions">
        <button
          className="legend-btn"
          data-action="toggle"
          title={indicator.hidden ? t('indicator.show') : t('indicator.hide')}
          onClick={() => toggleIndicatorHidden(indicator.id)}
        >
          {indicator.hidden ? <EyeOffIcon /> : <EyeIcon />}
        </button>
        <button className="legend-btn" data-action="settings" title={t('indicator.settings')} onClick={onSettings}>
          <SettingsIcon />
        </button>
        <button
          className="legend-btn"
          data-action="remove"
          title={t('indicator.remove')}
          onClick={() => removeIndicator(indicator.id)}
        >
          ×
        </button>
        <span className="menu-anchor">
          <button
            className="legend-btn"
            data-action="more"
            title={t('indicator.more')}
            onClick={() => setMenuOpen((v) => !v)}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
          >
            ⋯
          </button>
          {menuOpen && (
            <ul className="symbol-dropdown legend-menu">
              <li data-action="duplicate" onMouseDown={menuAction(() => duplicateIndicator(indicator.id))}>
                {t('indicator.duplicate')}
              </li>
              <li data-action="settings" onMouseDown={menuAction(onSettings)}>
                {t('indicator.settings')}…
              </li>
              <li data-action="remove-all" onMouseDown={menuAction(removeAllIndicators)}>
                {t('indicator.removeAll')}
              </li>
            </ul>
          )}
        </span>
      </span>
    </div>
  )
}
