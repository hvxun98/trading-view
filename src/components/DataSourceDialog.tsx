import { useState } from 'react'
import { DEFAULT_MT5_URL, testMt5 } from '../data/mt5'
import { testOanda, type OandaConfig } from '../data/oanda'
import { useT } from '../i18n'
import { useAppStore } from '../store/useAppStore'

interface Props {
  onClose: () => void
}

/** Cấu hình nguồn dữ liệu cho forex & kim loại (XAUUSD…): bridge MetaTrader 5, token OANDA */
export function DataSourceDialog({ onClose }: Props) {
  const t = useT()
  const { oanda, setOanda, mt5, setMt5, metalsSource, setMetalsSource } = useAppStore()
  const [metals, setMetals] = useState(metalsSource)
  const [mt5Enabled, setMt5Enabled] = useState(!!mt5)
  const [mt5Url, setMt5Url] = useState(mt5?.url ?? DEFAULT_MT5_URL)
  const [mt5Status, setMt5Status] = useState<{ ok: boolean; text: string } | null>(null)
  const [mt5Testing, setMt5Testing] = useState(false)
  const [token, setToken] = useState(oanda?.token ?? '')
  const [env, setEnv] = useState<OandaConfig['env']>(oanda?.env ?? 'practice')
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const test = async () => {
    setTesting(true)
    setStatus(null)
    try {
      const price = await testOanda({ token: token.trim(), env })
      setStatus({ ok: true, text: t('data.ok', { price: price.toFixed(2) }) })
    } catch (e) {
      setStatus({ ok: false, text: t('data.fail', { error: (e as Error).message }) })
    } finally {
      setTesting(false)
    }
  }

  const testBridge = async () => {
    setMt5Testing(true)
    setMt5Status(null)
    try {
      const { company, price } = await testMt5({ url: mt5Url.trim() })
      setMt5Status({ ok: true, text: t('data.mt5Ok', { company, price: price?.toFixed(2) ?? '—' }) })
    } catch (e) {
      setMt5Status({ ok: false, text: t('data.fail', { error: (e as Error).message }) })
    } finally {
      setMt5Testing(false)
    }
  }

  const save = () => {
    setMt5(mt5Enabled && mt5Url.trim() ? { url: mt5Url.trim() } : null)
    setMetalsSource(metals)
    setOanda(token.trim() ? { token: token.trim(), env } : null)
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal data-dialog"
        role="dialog"
        aria-label={t('data.title')}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="modal-header">
          <span>{t('data.title')}</span>
          <button className="tb-btn" title={t('dlg.close')} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-section">{t('data.binance')}</div>
          <div className="form-section">{t('data.dukascopy')}</div>

          <div className="form-section">{t('data.metals')}</div>
          <label className="form-check">
            <input
              type="radio"
              name="metals"
              value="spot"
              checked={metals === 'spot'}
              onChange={() => setMetals('spot')}
            />
            {t('data.metalsSpot')}
          </label>
          <label className="form-check">
            <input
              type="radio"
              name="metals"
              value="binanceFutures"
              checked={metals === 'binanceFutures'}
              onChange={() => setMetals('binanceFutures')}
            />
            {t('data.metalsFutures')}
          </label>
          <p className="form-help">{t('data.metalsHelp')}</p>

          <div className="form-section">{t('data.mt5')}</div>
          <label className="form-check">
            <input name="mt5" type="checkbox" checked={mt5Enabled} onChange={(e) => setMt5Enabled(e.target.checked)} />
            {t('data.mt5Enable')}
          </label>
          <label className="form-row">
            <span>{t('data.mt5Url')}</span>
            <input
              name="mt5Url"
              autoComplete="off"
              disabled={!mt5Enabled}
              value={mt5Url}
              onChange={(e) => setMt5Url(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button
              className="btn mt5-test"
              disabled={!mt5Enabled || !mt5Url.trim() || mt5Testing}
              onClick={testBridge}
            >
              {mt5Testing ? t('data.testing') : t('data.test')}
            </button>
          </div>
          {mt5Status && <div className={mt5Status.ok ? 'form-ok' : 'form-error'}>{mt5Status.text}</div>}
          <p className="form-help">{t('data.mt5Help')}</p>

          <div className="form-section">{t('data.oanda')}</div>
          <label className="form-row">
            <span>{t('data.env')}</span>
            <select name="env" value={env} onChange={(e) => setEnv(e.target.value as OandaConfig['env'])}>
              <option value="practice">{t('data.practice')}</option>
              <option value="live">{t('data.live')}</option>
            </select>
          </label>
          <label className="form-row">
            <span>{t('data.token')}</span>
            <input
              name="token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button className="btn oanda-test" disabled={!token.trim() || testing} onClick={test}>
              {testing ? t('data.testing') : t('data.test')}
            </button>
            {oanda && (
              <button
                className="btn"
                onClick={() => {
                  setToken('')
                  setStatus(null)
                }}
              >
                {t('data.clear')}
              </button>
            )}
          </div>
          {status && <div className={status.ok ? 'form-ok' : 'form-error'}>{status.text}</div>}
          <p className="form-help">{t('data.help')}</p>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            {t('dlg.cancel')}
          </button>
          <button className="btn btn-primary" onClick={save}>
            {t('data.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
