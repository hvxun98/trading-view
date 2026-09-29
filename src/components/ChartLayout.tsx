import { useT } from '../i18n'
import { layoutInfo } from '../lib/layouts'
import { useAppStore } from '../store/useAppStore'
import { ChartIndexContext } from '../store/useChartStore'
import { Chart } from './Chart'

/**
 * Bố cục nhiều biểu đồ như TradingView: mỗi ô có mã, khung thời gian, hình vẽ, công cụ, chỉ báo, replay riêng.
 * Bấm vào ô nào thì ô đó thành biểu đồ đang chọn (viền xanh) — toolbar, công cụ vẽ, Object Tree áp dụng cho ô đó.
 */
export function ChartLayout() {
  const { layout, activeChart, setActiveChart } = useAppStore()
  const t = useT()
  const { count } = layoutInfo(layout)

  return (
    <div className={`chart-grid layout-${layout}`}>
      {Array.from({ length: count }, (_, i) => (
        <ChartIndexContext.Provider key={i} value={i}>
          <div
            className={`chart-cell ${count > 1 && i === activeChart ? 'active' : ''}`}
            data-chart={i}
            aria-label={t('layout.chart', { n: i + 1 })}
            // Capture: chọn ô trước khi chart xử lý click (vẽ, kéo hình…) để công cụ áp dụng đúng ô
            onMouseDownCapture={() => setActiveChart(i)}
          >
            <Chart index={i} />
          </div>
        </ChartIndexContext.Provider>
      ))}
    </div>
  )
}
