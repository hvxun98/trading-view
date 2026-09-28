import { useState } from 'react'
import { useT } from '../i18n'
import { pricePrecision } from '../lib/intervals'
import { formatMoney, formatQty, positionSettings, positionStats, tickSize } from '../lib/position'
import { useChartStore } from '../store/useChartStore'
import type { Drawing, PositionSettings } from '../types'

interface Props {
  drawing: Drawing
  onClose: () => void
}

const num = (v: string) => (v.trim() === '' ? NaN : Number(v))

/**
 * Hộp thoại Settings của Long/Short Position như TradingView: vốn, lot, rủi ro (% hoặc tiền),
 * entry, mức chốt lời / cắt lỗ theo tick hoặc giá (2 ô tự đồng bộ), số lượng tự tính.
 */
export function PositionSettingsDialog({ drawing, onClose }: Props) {
  const updateDrawingProps = useChartStore((s) => s.updateDrawingProps)
  const t = useT()
  const [e0, t0, s0] = drawing.points
  const dir = drawing.type === 'long' ? 1 : -1
  const precision = pricePrecision(e0.price)
  const initial = positionSettings(drawing)
  const tick0 = tickSize(e0.price)

  const [accountSize, setAccountSize] = useState(String(initial.accountSize))
  const [lotSize, setLotSize] = useState(String(initial.lotSize))
  const [risk, setRisk] = useState(String(initial.risk))
  const [leverage, setLeverage] = useState(initial.leverage ? String(initial.leverage) : '')
  const [riskUnit, setRiskUnit] = useState<PositionSettings['riskUnit']>(initial.riskUnit)
  const [alwaysShowStats, setAlwaysShowStats] = useState(initial.alwaysShowStats)
  const [entry, setEntry] = useState(e0.price.toFixed(precision))
  const [profitTicks, setProfitTicks] = useState(String(Math.round(Math.abs(t0.price - e0.price) / tick0)))
  const [profitPrice, setProfitPrice] = useState(t0.price.toFixed(precision))
  const [stopTicks, setStopTicks] = useState(String(Math.round(Math.abs(e0.price - s0.price) / tick0)))
  const [stopPrice, setStopPrice] = useState(s0.price.toFixed(precision))

  const entryNum = num(entry)
  const tick = isFinite(entryNum) && entryNum > 0 ? tickSize(entryNum) : tick0
  const priceFromTicks = (ticks: number, side: 1 | -1) => (entryNum + side * dir * ticks * tick).toFixed(precision)
  const ticksFromPrice = (price: number) => String(Math.round(Math.abs(price - entryNum) / tick))

  const onEntry = (v: string) => {
    setEntry(v)
    const e = num(v)
    if (!isFinite(e)) return
    // Giữ nguyên số tick của các mức khi đổi entry
    setProfitPrice((e + dir * num(profitTicks) * tick).toFixed(precision))
    setStopPrice((e - dir * num(stopTicks) * tick).toFixed(precision))
  }

  const settings: PositionSettings = {
    accountSize: num(accountSize),
    lotSize: num(lotSize),
    risk: num(risk),
    riskUnit,
    leverage: leverage.trim() === '' ? null : num(leverage),
    alwaysShowStats,
  }
  const points = [
    { time: e0.time, price: entryNum },
    { time: t0.time, price: num(profitPrice) },
    { time: s0.time, price: num(stopPrice) },
  ]
  const valid =
    settings.accountSize > 0 &&
    settings.lotSize > 0 &&
    settings.risk > 0 &&
    (settings.leverage === null || settings.leverage > 0) &&
    points.every((p) => isFinite(p.price) && p.price > 0) &&
    // Long: target > entry > stop; Short: ngược lại
    (points[1].price - entryNum) * dir > 0 &&
    (entryNum - points[2].price) * dir > 0
  const preview = positionStats({ ...drawing, points, position: settings }, [])

  const submit = () => {
    if (!valid) return
    updateDrawingProps(drawing.id, { points, position: settings })
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal position-dialog"
        role="dialog"
        aria-label={t(`tool.${drawing.type}`)}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter') submit()
        }}
      >
        <div className="modal-header">
          <span>{t(`tool.${drawing.type}`)}</span>
          <button className="tb-btn" title={t('dlg.close')} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <label className="form-row">
            <span>{t('dlg.accountSize')}</span>
            <input name="accountSize" value={accountSize} onChange={(e) => setAccountSize(e.target.value)} />
          </label>
          <label className="form-row">
            <span>{t('dlg.lotSize')}</span>
            <input name="lotSize" value={lotSize} onChange={(e) => setLotSize(e.target.value)} />
          </label>
          <div className="form-row">
            <span>{t('dlg.risk')}</span>
            <div className="form-pair">
              <input name="risk" value={risk} onChange={(e) => setRisk(e.target.value)} />
              <select
                name="riskUnit"
                value={riskUnit}
                onChange={(e) => setRiskUnit(e.target.value as PositionSettings['riskUnit'])}
              >
                <option value="percent">%</option>
                <option value="currency">USD</option>
              </select>
            </div>
          </div>
          <label className="form-row">
            <span>{t('dlg.leverage')}</span>
            <input
              name="leverage"
              value={leverage}
              placeholder={t('dlg.noLimit')}
              onChange={(e) => setLeverage(e.target.value)}
            />
          </label>
          <label className="form-row">
            <span>{t('dlg.entry')}</span>
            <input name="entry" value={entry} onChange={(e) => onEntry(e.target.value)} />
          </label>

          <div className="form-section">{t('dlg.profitLevel')}</div>
          <div className="form-row">
            <span>{t('dlg.ticksPrice')}</span>
            <div className="form-pair">
              <input
                name="profitTicks"
                value={profitTicks}
                onChange={(e) => {
                  setProfitTicks(e.target.value)
                  if (isFinite(num(e.target.value))) setProfitPrice(priceFromTicks(num(e.target.value), 1))
                }}
              />
              <input
                name="profitPrice"
                value={profitPrice}
                onChange={(e) => {
                  setProfitPrice(e.target.value)
                  if (isFinite(num(e.target.value))) setProfitTicks(ticksFromPrice(num(e.target.value)))
                }}
              />
            </div>
          </div>

          <div className="form-section">{t('dlg.stopLevel')}</div>
          <div className="form-row">
            <span>{t('dlg.ticksPrice')}</span>
            <div className="form-pair">
              <input
                name="stopTicks"
                value={stopTicks}
                onChange={(e) => {
                  setStopTicks(e.target.value)
                  if (isFinite(num(e.target.value))) setStopPrice(priceFromTicks(num(e.target.value), -1))
                }}
              />
              <input
                name="stopPrice"
                value={stopPrice}
                onChange={(e) => {
                  setStopPrice(e.target.value)
                  if (isFinite(num(e.target.value))) setStopTicks(ticksFromPrice(num(e.target.value)))
                }}
              />
            </div>
          </div>

          <div className="form-summary">
            <div>
              <span>{t('dlg.qty')}</span>
              <b data-field="qty">{valid ? formatQty(preview.qty) : '—'}</b>
            </div>
            <div>
              <span>{t('dlg.rr')}</span>
              <b data-field="ratio">{valid ? preview.ratio.toFixed(2) : '—'}</b>
            </div>
            <div>
              <span>{t('dlg.targetAmount')}</span>
              <b data-field="targetAmount">{valid ? formatMoney(preview.targetAmount) : '—'}</b>
            </div>
            <div>
              <span>{t('dlg.stopAmount')}</span>
              <b data-field="stopAmount">{valid ? formatMoney(preview.stopAmount) : '—'}</b>
            </div>
          </div>
          {valid && preview.limitedByLeverage && (
            <div className="form-note" data-field="limited">
              {t('dlg.limited')}
            </div>
          )}

          <label className="form-check">
            <input type="checkbox" checked={alwaysShowStats} onChange={(e) => setAlwaysShowStats(e.target.checked)} />
            {t('dlg.alwaysShow')}
          </label>
          {!valid && (
            <div className="form-error">{drawing.type === 'long' ? t('dlg.errorLong') : t('dlg.errorShort')}</div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            {t('dlg.cancel')}
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={submit}>
            {t('dlg.ok')}
          </button>
        </div>
      </div>
    </div>
  )
}
