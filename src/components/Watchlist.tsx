import { useEffect, useState } from 'react'
import { fetchTickers, subscribeTickers } from '../data/binance'
import { formatPrice } from '../lib/intervals'
import { WATCHLIST } from '../lib/symbols'
import { theme } from '../lib/theme'
import { useChartStore } from '../store/useChartStore'
import type { Ticker } from '../types'

export function Watchlist() {
  const { symbol, setSymbol } = useChartStore()
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
        <span>Symbol</span>
        <span>Last</span>
        <span>Chg%</span>
      </div>
      {WATCHLIST.map((s) => {
        const t = tickers[s]
        const pct = t ? ((t.last - t.open) / t.open) * 100 : null
        const color = pct === null ? theme.textDim : pct >= 0 ? theme.up : theme.down
        return (
          <div key={s} className={`watchlist-row ${s === symbol ? 'active' : ''}`} onClick={() => setSymbol(s)}>
            <span>{s}</span>
            <span>{t ? formatPrice(t.last) : '—'}</span>
            <span style={{ color }}>{pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}</span>
          </div>
        )
      })}
    </div>
  )
}
