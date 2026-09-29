import { useEffect, useState } from 'react'
import { getSymbolInfo, sourceName } from '../data/catalog'
import { sourcesKey, subscribeWatchlist } from '../data/feeds'
import { useT } from '../i18n'
import { formatPrice, guessPrecision } from '../lib/intervals'
import { theme } from '../lib/theme'
import { useChartStore } from '../store/useChartStore'
import type { Ticker } from '../types'
import { SymbolSearchDialog } from './SymbolSearchDialog'

export function Watchlist() {
  const { symbol, setSymbol, watchlist, removeFromWatchlist, oanda, mt5 } = useChartStore()
  const t = useT()
  const [tickers, setTickers] = useState<Record<string, Ticker>>({})
  const [adding, setAdding] = useState(false)

  // Đăng ký lại khi danh sách / cấu hình nguồn đổi (key dạng chuỗi để tránh đăng ký thừa)
  const listKey = watchlist.join(',')
  const sources = { oanda, mt5 }
  const sourcesKeyValue = sourcesKey(sources)
  useEffect(() => {
    const merge = (tk: Ticker) => setTickers((prev) => ({ ...prev, [tk.symbol]: tk }))
    return subscribeWatchlist(listKey ? listKey.split(',') : [], sources, merge)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, sourcesKeyValue])

  return (
    <div className="watchlist">
      <div className="watchlist-toolbar">
        <span>{t('panel.watchlist')}</span>
        <button className="tb-btn watch-add" title={t('watch.add')} onClick={() => setAdding(true)}>
          <svg width="18" height="18" viewBox="0 0 18 18" stroke="currentColor" strokeWidth="1.4">
            <path d="M9 3v12M3 9h12" />
          </svg>
        </button>
      </div>
      <div className="watchlist-row watchlist-cols">
        <span>{t('watch.symbol')}</span>
        <span>{t('watch.last')}</span>
        <span>{t('watch.change')}</span>
      </div>
      {watchlist.map((s) => {
        const info = getSymbolInfo(s)
        const ticker = tickers[s]
        const pct = ticker ? ((ticker.last - ticker.open) / ticker.open) * 100 : null
        const color = pct === null ? theme.textDim : pct >= 0 ? theme.up : theme.down
        return (
          <div
            key={s}
            data-symbol={s}
            className={`watchlist-row ${s === symbol ? 'active' : ''}`}
            title={`${sourceName(info, sources)}:${s} — ${info.description}`}
            onClick={() => setSymbol(s)}
          >
            <span className="watch-sym">
              <span className={`sym-dot sym-${info.type}`} />
              {s}
            </span>
            <span>{ticker ? formatPrice(ticker.last, info.precision ?? guessPrecision(ticker.last)) : '—'}</span>
            <span style={{ color }}>{pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}</span>
            <button
              className="watch-remove"
              title={t('watch.remove')}
              onClick={(e) => {
                e.stopPropagation()
                removeFromWatchlist(s)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
      {adding && <SymbolSearchDialog mode="add" onClose={() => setAdding(false)} />}
    </div>
  )
}
