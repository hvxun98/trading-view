import { useRef, useState } from 'react'
import { useT } from '../i18n'
import { LINE_STYLES, LINE_WIDTHS } from '../lib/drawings'
import {
  fillStyle,
  indicatorDef,
  indicatorInputs,
  indicatorLevels,
  INTERVAL_GROUPS,
  label,
  plotStyle,
  PRICE_SOURCES,
  type InputDef,
} from '../lib/indicators'
import { useAppStore } from '../store/useAppStore'
import { useChartStore } from '../store/useChartStore'
import type { FillStyle, Indicator, IndicatorSettings, InputValue, LevelStyle, PlotStyle, PlotType } from '../types'
import { ColorPicker } from './ColorPicker'

interface Props {
  indicator: Indicator
  onClose: () => void
}

type Tab = 'inputs' | 'style' | 'visibility'
const PLOT_TYPES: PlotType[] = ['line', 'step', 'histogram', 'circles']
const PRECISIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8]

/** Các trường cài đặt (không gồm id / loại / ẩn) — dùng cho Cancel, Reset và Save as default */
function settingsOf(ind: Indicator): IndicatorSettings {
  const { inputs, styles, levels, fills, precision, priceLabels, showValues, showInputs, visibility } = ind
  return structuredClone({ inputs, styles, levels, fills, precision, priceLabels, showValues, showInputs, visibility })
}

const EMPTY_SETTINGS: IndicatorSettings = {
  inputs: undefined,
  styles: undefined,
  levels: undefined,
  fills: undefined,
  precision: undefined,
  priceLabels: undefined,
  showValues: undefined,
  showInputs: undefined,
  visibility: undefined,
}

/** Chỉ giữ các tham số khác mặc định */
function diffInputs(def: InputDef[], values: Record<string, InputValue>) {
  const out: Record<string, InputValue> = {}
  for (const i of def) if (values[i.key] !== i.default) out[i.key] = values[i.key]
  return Object.keys(out).length ? out : undefined
}

function validNumber(input: Pick<InputDef, 'kind' | 'min' | 'max'>, text: string): number | null {
  const v = Number(text)
  if (text.trim() === '' || !Number.isFinite(v)) return null
  if (input.kind === 'int' && !Number.isInteger(v)) return null
  if (input.min !== undefined && v < input.min) return null
  if (input.max !== undefined && v > input.max) return null
  return v
}

const inputTexts = (ind: Indicator) =>
  Object.fromEntries(Object.entries(indicatorInputs(ind)).map(([k, v]) => [k, String(v)]))
const levelTexts = (ind: Indicator) => indicatorLevels(ind).map((l) => String(l.price))

/**
 * Hộp thoại Settings của chỉ báo như TradingView:
 * - Inputs: tham số (độ dài, nguồn, loại MA, offset…)
 * - Style: từng đường (ẩn / màu + độ đục / kiểu vẽ / độ dày / kiểu nét), mức ngang, màu nền, số lẻ,
 *   nhãn trên trục giá, giá trị & tham số trên legend
 * - Visibility: hiện trên những nhóm khung thời gian nào
 * Thay đổi áp dụng ngay lên biểu đồ để xem trước; Cancel trả lại như lúc mở. "Defaults" để đặt lại hoặc lưu làm mặc định.
 */
export function IndicatorSettingsDialog({ indicator, onClose }: Props) {
  const t = useT()
  const updateIndicator = useChartStore((s) => s.updateIndicator)
  const savedDefaults = useAppStore((s) => s.indicatorDefaults[indicator.type])
  const setIndicatorDefaults = useAppStore((s) => s.setIndicatorDefaults)
  const def = indicatorDef(indicator.type)
  const original = useRef(settingsOf(indicator)).current
  const [tab, setTab] = useState<Tab>(def.inputs.length ? 'inputs' : 'style')
  /** Nội dung ô nhập (giữ cả giá trị đang gõ dở / không hợp lệ) */
  const [texts, setTexts] = useState(() => inputTexts(indicator))
  const [levelText, setLevelText] = useState(() => levelTexts(indicator))
  const [defaultsOpen, setDefaultsOpen] = useState(false)

  const inputs = indicatorInputs(indicator)
  const levels = indicatorLevels(indicator)
  const invalid =
    def.inputs.some((i) => (i.kind === 'int' || i.kind === 'float') && validNumber(i, texts[i.key] ?? '') === null) ||
    levelText.some((text) => validNumber({ kind: 'float' }, text) === null)

  const update = (patch: Partial<IndicatorSettings>) => updateIndicator(indicator.id, patch)

  const setInput = (input: InputDef, value: InputValue) =>
    update({ inputs: diffInputs(def.inputs, { ...inputs, [input.key]: value }) })

  const setNumberInput = (input: InputDef, text: string) => {
    setTexts((s) => ({ ...s, [input.key]: text }))
    const value = validNumber(input, text)
    if (value !== null) setInput(input, value)
  }

  const setStyle = (key: string, patch: Partial<PlotStyle>) =>
    update({ styles: { ...indicator.styles, [key]: { ...indicator.styles?.[key], ...patch } } })

  const setLevel = (i: number, patch: Partial<LevelStyle>) =>
    update({ levels: levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) })

  const setFill = (key: string, patch: Partial<FillStyle>) =>
    update({ fills: { ...indicator.fills, [key]: { ...indicator.fills?.[key], ...patch } } })

  /** Áp dụng một bộ cài đặt (vd. mặc định) và nạp lại các ô nhập */
  const apply = (settings: IndicatorSettings) => {
    const next = { ...indicator, ...EMPTY_SETTINGS, ...structuredClone(settings) }
    update({ ...EMPTY_SETTINGS, ...structuredClone(settings) })
    setTexts(inputTexts(next))
    setLevelText(levelTexts(next))
  }

  const cancel = () => {
    update({ ...EMPTY_SETTINGS, ...original })
    onClose()
  }

  const section = (title: string) => <div className="form-section">{title}</div>

  return (
    <div className="modal-backdrop" onMouseDown={cancel}>
      <div
        className="modal indicator-dialog"
        role="dialog"
        aria-label={def.short}
        onMouseDown={(e) => {
          e.stopPropagation()
          setDefaultsOpen(false)
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') cancel()
          if (e.key === 'Enter' && !invalid && (e.target as HTMLElement).tagName !== 'BUTTON') onClose()
        }}
      >
        <div className="modal-header">
          <span>{def.short}</span>
          <button className="tb-btn" title={t('dlg.close')} onClick={cancel}>
            ×
          </button>
        </div>

        <div className="dialog-tabs">
          {(['inputs', 'style', 'visibility'] as const)
            .filter((id) => id !== 'inputs' || def.inputs.length > 0)
            .map((id) => (
              <button
                key={id}
                data-tab={id}
                className={`dialog-tab ${tab === id ? 'active' : ''}`}
                onClick={() => setTab(id)}
              >
                {t(`indicator.${id}`)}
              </button>
            ))}
        </div>

        <div className="modal-body indicator-body">
          {tab === 'inputs' &&
            def.inputs.map((input) => {
              if (input.kind === 'bool') {
                return (
                  <label key={input.key} className="form-check">
                    <input
                      type="checkbox"
                      name={input.key}
                      checked={inputs[input.key] as boolean}
                      onChange={(e) => setInput(input, e.target.checked)}
                    />
                    {label(t, input.label)}
                  </label>
                )
              }
              const text = texts[input.key] ?? ''
              const bad = (input.kind === 'int' || input.kind === 'float') && validNumber(input, text) === null
              return (
                <label key={input.key} className="form-row">
                  <span>{label(t, input.label)}</span>
                  {input.kind === 'source' || input.kind === 'select' ? (
                    <select
                      name={input.key}
                      value={String(inputs[input.key])}
                      onChange={(e) => setInput(input, e.target.value)}
                    >
                      {input.kind === 'source'
                        ? PRICE_SOURCES.map((s) => (
                            <option key={s} value={s}>
                              {t(`source.${s}`)}
                            </option>
                          ))
                        : input.options?.map((o) => (
                            <option key={o.value} value={o.value}>
                              {label(t, o.label)}
                            </option>
                          ))}
                    </select>
                  ) : (
                    <input
                      name={input.key}
                      type="number"
                      step={input.step ?? 1}
                      min={input.min}
                      max={input.max}
                      className={bad ? 'invalid' : ''}
                      title={bad ? t('indicator.invalid') : undefined}
                      value={text}
                      onChange={(e) => setNumberInput(input, e.target.value)}
                    />
                  )}
                </label>
              )
            })}

          {tab === 'inputs' && def.help && <div className="indicator-help">{t(def.help)}</div>}

          {tab === 'style' && (
            <>
              {def.plots.map((plot) => {
                const style = plotStyle(indicator, plot)
                const types = plot.barColor ? PLOT_TYPES.filter((p) => p === 'histogram' || p === 'line') : PLOT_TYPES
                return (
                  <div key={plot.key} className="style-row" data-plot={plot.key}>
                    <label className="form-check style-name">
                      <input
                        type="checkbox"
                        checked={style.visible}
                        disabled={plot.disabled?.(inputs)}
                        onChange={(e) => setStyle(plot.key, { visible: e.target.checked })}
                      />
                      {label(t, plot.label)}
                    </label>
                    {plot.barColor ? (
                      <span className="style-auto" title={t('indicator.autoColor')}>
                        {t('indicator.autoColor')}
                      </span>
                    ) : (
                      <ColorPicker value={style.color} onChange={(color) => setStyle(plot.key, { color })} />
                    )}
                    <select
                      name="plotType"
                      title={t('indicator.plotType')}
                      value={style.plotType}
                      onChange={(e) => setStyle(plot.key, { plotType: e.target.value as PlotType })}
                    >
                      {types.map((p) => (
                        <option key={p} value={p}>
                          {t(`plotType.${p}`)}
                        </option>
                      ))}
                    </select>
                    <select
                      name="lineWidth"
                      title={t('ft.width')}
                      disabled={style.plotType === 'histogram'}
                      value={style.lineWidth}
                      onChange={(e) => setStyle(plot.key, { lineWidth: Number(e.target.value) })}
                    >
                      {LINE_WIDTHS.map((w) => (
                        <option key={w} value={w}>
                          {w}px
                        </option>
                      ))}
                    </select>
                    <select
                      name="lineStyle"
                      title={t('ft.style')}
                      disabled={style.plotType === 'histogram' || style.plotType === 'circles'}
                      value={style.lineStyle}
                      onChange={(e) => setStyle(plot.key, { lineStyle: e.target.value as PlotStyle['lineStyle'] })}
                    >
                      {LINE_STYLES.map((s) => (
                        <option key={s} value={s}>
                          {t(`line.${s}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}

              {levels.length > 0 && section(t('indicator.levels'))}
              {levels.map((l, i) => {
                const bad = validNumber({ kind: 'float' }, levelText[i] ?? '') === null
                return (
                  <div key={i} className="style-row" data-level={i}>
                    <label className="form-check style-name">
                      <input
                        type="checkbox"
                        checked={l.visible}
                        onChange={(e) => setLevel(i, { visible: e.target.checked })}
                      />
                      {t('indicator.level')}
                    </label>
                    <ColorPicker value={l.color} onChange={(color) => setLevel(i, { color })} />
                    <input
                      name="levelPrice"
                      type="number"
                      className={`level-price ${bad ? 'invalid' : ''}`}
                      value={levelText[i] ?? ''}
                      onChange={(e) => {
                        const text = e.target.value
                        setLevelText((s) => s.map((x, j) => (j === i ? text : x)))
                        const v = validNumber({ kind: 'float' }, text)
                        if (v !== null) setLevel(i, { price: v })
                      }}
                    />
                    <select
                      name="levelStyle"
                      title={t('ft.style')}
                      value={l.lineStyle}
                      onChange={(e) => setLevel(i, { lineStyle: e.target.value as LevelStyle['lineStyle'] })}
                    >
                      {LINE_STYLES.map((s) => (
                        <option key={s} value={s}>
                          {t(`line.${s}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}

              {def.fills?.length ? section(t('indicator.fills')) : null}
              {def.fills?.map((fill) => {
                const style = fillStyle(indicator, fill)
                return (
                  <div key={fill.key} className="style-row" data-fill={fill.key}>
                    <label className="form-check style-name">
                      <input
                        type="checkbox"
                        checked={style.visible}
                        onChange={(e) => setFill(fill.key, { visible: e.target.checked })}
                      />
                      {label(t, fill.label)}
                    </label>
                    <ColorPicker value={style.color} onChange={(color) => setFill(fill.key, { color })} />
                    {style.color2 !== undefined && (
                      <ColorPicker value={style.color2} onChange={(color2) => setFill(fill.key, { color2 })} />
                    )}
                  </div>
                )
              })}

              {section(t('indicator.outputs'))}
              <label className="form-row">
                <span>{t('indicator.precision')}</span>
                <select
                  name="precision"
                  value={indicator.precision ?? 'default'}
                  onChange={(e) =>
                    update({ precision: e.target.value === 'default' ? undefined : Number(e.target.value) })
                  }
                >
                  <option value="default">{t('indicator.default')}</option>
                  {PRECISIONS.map((p) => (
                    <option key={p} value={p}>
                      {p === 0 ? '1' : `0.${'0'.repeat(p - 1)}1`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-check">
                <input
                  type="checkbox"
                  name="priceLabels"
                  checked={indicator.priceLabels !== false}
                  onChange={(e) => update({ priceLabels: e.target.checked ? undefined : false })}
                />
                {t('indicator.priceLabels')}
              </label>
              <label className="form-check">
                <input
                  type="checkbox"
                  name="showValues"
                  checked={indicator.showValues !== false}
                  onChange={(e) => update({ showValues: e.target.checked ? undefined : false })}
                />
                {t('indicator.showValues')}
              </label>
              <label className="form-check">
                <input
                  type="checkbox"
                  name="showInputs"
                  checked={indicator.showInputs !== false}
                  onChange={(e) => update({ showInputs: e.target.checked ? undefined : false })}
                />
                {t('indicator.showInputs')}
              </label>
            </>
          )}

          {tab === 'visibility' &&
            INTERVAL_GROUPS.map((g) => (
              <label key={g} className="form-check">
                <input
                  type="checkbox"
                  name={g}
                  checked={indicator.visibility?.[g] !== false}
                  onChange={(e) => {
                    const next = { ...indicator.visibility, [g]: e.target.checked }
                    if (e.target.checked) delete next[g]
                    update({ visibility: Object.keys(next).length ? next : undefined })
                  }}
                />
                {t(`visibility.${g}`)}
              </label>
            ))}
        </div>

        <div className="modal-footer">
          <div className="menu-anchor btn-left">
            <button
              className="btn"
              data-action="defaults"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setDefaultsOpen((v) => !v)}
            >
              {t('indicator.defaults')} ▾
            </button>
            {defaultsOpen && (
              <ul className="symbol-dropdown defaults-menu" onMouseDown={(e) => e.stopPropagation()}>
                <li
                  data-action="reset"
                  onClick={() => {
                    apply(savedDefaults ?? {})
                    setDefaultsOpen(false)
                  }}
                >
                  {t('indicator.reset')}
                </li>
                <li
                  data-action="save-default"
                  onClick={() => {
                    setIndicatorDefaults(indicator.type, settingsOf(indicator))
                    setDefaultsOpen(false)
                  }}
                >
                  {t('indicator.saveDefault')}
                </li>
                {savedDefaults && (
                  <li
                    data-action="factory"
                    onClick={() => {
                      setIndicatorDefaults(indicator.type, null)
                      apply({})
                      setDefaultsOpen(false)
                    }}
                  >
                    {t('indicator.factory')}
                  </li>
                )}
              </ul>
            )}
          </div>
          <button className="btn" onClick={cancel}>
            {t('dlg.cancel')}
          </button>
          <button className="btn btn-primary" disabled={invalid} onClick={onClose}>
            {t('dlg.ok')}
          </button>
        </div>
      </div>
    </div>
  )
}
