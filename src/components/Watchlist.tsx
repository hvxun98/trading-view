import { useEffect, useState } from 'react'
import { fetchTickers, subscribeTickers } from '../data/binance'
import { formatPrice } from '../lib/intervals'
import { WATCHLIST } from '../lib/symbols'
import { theme } from '../lib/theme'
import { useT } from '../i18n'
import { useChartStore } from '../store/useChartStore'
import type { Ticker } from '../types'

export function Watchlist() {
  const { symbol, setSymbol } = useChartStore()
  const t = useT()
  const [tickers, setTickers] = useState<Record<string, Ticker>>({})

  useEffect(() => {
    const merge = (t: Ticker) => setTickers((prev) => ({ ...prev, [t.symbol]: t }))
    fetchTickers(WATCHLIST)
      .then((list) => list.forEach(merge))
      .catch(() => {})
    return subscribeTickers(WATCHLIST, merge)
  }, [])

  return (
    <div className="watchlist">
      <div className="watchlist-row watchlist-cols">
        <span>{t('watch.symbol')}</span>
        <span>{t('watch.last')}</span>
        <span>{t('watch.change')}</span>
      </div>
      {WATCHLIST.map((s) => {
        const ticker = tickers[s]
        const pct = ticker ? ((ticker.last - ticker.open) / ticker.open) * 100 : null
        const color = pct === null ? theme.textDim : pct >= 0 ? theme.up : theme.down
        return (
          <div key={s} className={`watchlist-row ${s === symbol ? 'active' : ''}`} onClick={() => setSymbol(s)}>
            <span>{s}</span>
            <span>{ticker ? formatPrice(ticker.last) : '—'}</span>
            <span style={{ color }}>{pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}</span>
          </div>
        )
      })}
    </div>
  )
}
