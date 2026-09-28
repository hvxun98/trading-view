import { useState } from 'react'
import { DRAWING_LABELS } from '../lib/drawings'
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
  const [e0, t0, s0] = drawing.points
  const dir = drawing.type === 'long' ? 1 : -1
  const precision = pricePrecision(e0.price)
  const initial = positionSettings(drawing)
  const tick0 = tickSize(e0.price)

  const [accountSize, setAccountSize] = useState(String(initial.accountSize))
  const [lotSize, setLotSize] = useState(String(initial.lotSize))
  const [risk, setRisk] = useState(String(initial.risk))
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
        aria-label={`${DRAWING_LABELS[drawing.type]} settings`}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter') submit()
        }}
      >
        <div className="modal-header">
          <span>{DRAWING_LABELS[drawing.type]}</span>
          <button className="tb-btn" title="Đóng" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <label className="form-row">
            <span>Account size</span>
            <input name="accountSize" value={accountSize} onChange={(e) => setAccountSize(e.target.value)} />
          </label>
          <label className="form-row">
            <span>Lot size</span>
            <input name="lotSize" value={lotSize} onChange={(e) => setLotSize(e.target.value)} />
          </label>
          <div className="form-row">
            <span>Risk</span>
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
            <span>Entry price</span>
            <input name="entry" value={entry} onChange={(e) => onEntry(e.target.value)} />
          </label>

          <div className="form-section">Profit level</div>
          <div className="form-row">
            <span>Ticks / Price</span>
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

          <div className="form-section">Stop level</div>
          <div className="form-row">
            <span>Ticks / Price</span>
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
              <span>Qty</span>
              <b data-field="qty">{valid ? formatQty(preview.qty) : '—'}</b>
            </div>
            <div>
              <span>Risk amount</span>
              <b data-field="riskAmount">{valid ? formatMoney(preview.riskAmount) : '—'}</b>
            </div>
            <div>
              <span>Reward amount</span>
              <b data-field="rewardAmount">{valid ? formatMoney(preview.rewardAmount) : '—'}</b>
            </div>
            <div>
              <span>Risk/Reward Ratio</span>
              <b data-field="ratio">{valid ? preview.ratio.toFixed(2) : '—'}</b>
            </div>
          </div>

          <label className="form-check">
            <input type="checkbox" checked={alwaysShowStats} onChange={(e) => setAlwaysShowStats(e.target.checked)} />
            Always show stats
          </label>
          {!valid && (
            <div className="form-error">
              Giá trị không hợp lệ:{' '}
              {drawing.type === 'long' ? 'cần Target > Entry > Stop' : 'cần Stop > Entry > Target'}, các số phải lớn hơn
              0.
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={submit}>
            Ok
          </button>
        </div>
      </div>
    </div>
  )
}
