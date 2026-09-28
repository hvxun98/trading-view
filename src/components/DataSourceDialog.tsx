import { useState } from 'react'
import { testOanda, type OandaConfig } from '../data/oanda'
import { useT } from '../i18n'
import { useChartStore } from '../store/useChartStore'

interface Props {
  onClose: () => void
}

/** Cấu hình nguồn dữ liệu: token OANDA cho forex & kim loại (XAUUSD…) */
export function DataSourceDialog({ onClose }: Props) {
  const t = useT()
  const { oanda, setOanda } = useChartStore()
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

  const save = () => {
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
            <button className="btn" disabled={!token.trim() || testing} onClick={test}>
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
