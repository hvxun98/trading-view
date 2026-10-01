import { useEffect, useMemo, useRef, useState } from 'react'
import {
  cryptoFallback,
  cryptoInfo,
  loadCryptoCatalog,
  OANDA_SYMBOLS,
  sourceName,
  type SymbolInfo,
  type SymbolType,
} from '../data/catalog'
import { useT } from '../i18n'
import { useAppStore } from '../store/useAppStore'
import { useChartStore } from '../store/useChartStore'

type Tab = 'all' | SymbolType
const TABS: Tab[] = ['all', 'crypto', 'forex', 'commodity']
const MAX_RESULTS = 100

interface Props {
  /** change: chọn mã để mở trên chart; add: thêm / bỏ mã khỏi Watchlist (hộp thoại vẫn mở) */
  mode: 'change' | 'add'
  /** Nội dung tìm kiếm ban đầu (vd. chữ cái vừa gõ trên chart) */
  initialQuery?: string
  onClose: () => void
}

/** Chuẩn hoá chuỗi tìm kiếm: "xau/usd", "BTC-USDT" -> "XAUUSD", "BTCUSDT" */
const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Tô đậm phần khớp trong mã, như TradingView */
function Highlight({ text, query }: { text: string; query: string }) {
  const i = query ? text.indexOf(query) : -1
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  )
}

/** Hộp thoại "Symbol Search" / "Add symbol" của TradingView */
export function SymbolSearchDialog({ mode, initialQuery = '', onClose }: Props) {
  const t = useT()
  const setSymbol = useChartStore((s) => s.setSymbol)
  const { watchlist, addToWatchlist, removeFromWatchlist, oanda, mt5, metalsSource } = useAppStore()
  const [query, setQuery] = useState(initialQuery)
  const [tab, setTab] = useState<Tab>('all')
  const [active, setActive] = useState(0)
  const [crypto, setCrypto] = useState<SymbolInfo[]>(cryptoFallback)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    loadCryptoCatalog().then((list) => alive && setCrypto(list))
    return () => {
      alive = false
    }
  }, [])

  const q = normalize(query)
  const results = useMemo(() => {
    const all = [...OANDA_SYMBOLS, ...crypto].filter((s) => tab === 'all' || s.type === tab)
    if (!q) return all.slice(0, MAX_RESULTS)
    const rank = (s: SymbolInfo) => {
      const sym = s.symbol
      if (sym === q) return 0
      if (sym.startsWith(q)) return 1
      if (sym.includes(q)) return 2
      return normalize(s.description).includes(q) ? 3 : 9
    }
    return all
      .map((s) => ({ s, r: rank(s) }))
      .filter((x) => x.r < 9)
      .sort((a, b) => a.r - b.r || a.s.symbol.length - b.s.symbol.length)
      .slice(0, MAX_RESULTS)
      .map((x) => x.s)
  }, [crypto, tab, q])

  // Gõ mã chưa có trong danh mục (vd. danh mục Binance chưa tải được) -> vẫn cho mở như cặp Binance
  const custom = q.length >= 5 && tab !== 'forex' && tab !== 'commodity' && !results.some((s) => s.symbol === q)
  const rows = custom ? [...results, cryptoInfo(q)] : results
  const activeIndex = Math.min(active, Math.max(0, rows.length - 1))

  useEffect(() => {
    listRef.current?.querySelector('.search-row.active')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const choose = (s: SymbolInfo) => {
    if (mode === 'change') {
      setSymbol(s.symbol)
      onClose()
    } else if (watchlist.includes(s.symbol)) removeFromWatchlist(s.symbol)
    else addToWatchlist(s.symbol)
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal search-dialog"
        role="dialog"
        aria-label={t(mode === 'add' ? 'search.addTitle' : 'search.title')}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') onClose()
          else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive(Math.min(activeIndex + 1, rows.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive(Math.max(activeIndex - 1, 0))
          } else if (e.key === 'Enter' && rows[activeIndex]) choose(rows[activeIndex])
        }}
      >
        <div className="modal-header">
          <span>{t(mode === 'add' ? 'search.addTitle' : 'search.title')}</span>
          <button className="tb-btn" title={t('dlg.close')} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="search-input">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="7.5" cy="7.5" r="5.5" />
            <path d="m12 12 4 4" />
          </svg>
          <input
            autoFocus
            value={query}
            placeholder={t('search.placeholder')}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
          />
          {query && (
            <button className="tb-btn" onClick={() => setQuery('')}>
              ×
            </button>
          )}
        </div>

        <div className="search-tabs">
          {TABS.map((id) => (
            <button
              key={id}
              data-tab={id}
              className={`search-tab ${tab === id ? 'active' : ''}`}
              onClick={() => {
                setTab(id)
                setActive(0)
              }}
            >
              {t(`search.${id}`)}
            </button>
          ))}
        </div>

        <div className="search-list" ref={listRef}>
          {rows.length === 0 && <div className="search-empty">{t('search.empty')}</div>}
          {rows.map((s, i) => {
            const inList = watchlist.includes(s.symbol)
            const isCustom = custom && i === rows.length - 1
            return (
              <div
                key={s.symbol + s.exchange}
                data-symbol={s.symbol}
                className={`search-row ${i === activeIndex ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(s)}
              >
                <span className={`sym-badge sym-${s.type}`}>{s.symbol.slice(0, 1)}</span>
                <span className="sym-name">
                  <Highlight text={s.symbol} query={q} />
                </span>
                <span className="sym-desc">{isCustom ? t('search.custom', { symbol: s.symbol }) : s.description}</span>
                <span className="sym-type">{t(`search.${s.type}`)}</span>
                <span className="sym-exchange">{sourceName(s, { oanda, mt5, metalsSource })}</span>
                {mode === 'add' && (
                  <span
                    className={`sym-add ${inList ? 'added' : ''}`}
                    title={inList ? t('search.added') : t('search.add')}
                  >
                    {inList ? '✓' : '+'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
