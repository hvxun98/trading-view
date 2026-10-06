import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { INTERVALS } from '../lib/intervals'
import { LAYOUTS, layoutInfo, type LayoutInfo } from '../lib/layouts'
import { useAppStore } from '../store/useAppStore'
import { useChartStore } from '../store/useChartStore'
import type { Lang } from '../types'
import { copyChartImage, downloadChartImage } from '../lib/snapshotActions'
import { DataSourceDialog } from './DataSourceDialog'
import { CameraIcon, GlobeIcon, RedoIcon, SettingsIcon, UndoIcon } from './icons'
import { SymbolSearchDialog } from './SymbolSearchDialog'

const LANGS: Lang[] = ['en', 'vi']

export function TopToolbar() {
  const {
    symbol,
    interval,
    replayMode,
    invertScale,
    rsiEnabled,
    setInterval,
    startReplaySelect,
    exitReplay,
    resetView,
    toggleInvertScale,
    toggleRsi,
    undo,
    redo,
  } = useChartStore()
  const { language, setLanguage, layout, setLayout } = useAppStore()
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [snapOpen, setSnapOpen] = useState(false)
  const t = useT()
  const [langOpen, setLangOpen] = useState(false)
  const canUndo = useChartStore((s) => s.undoStack.length > 0)
  const canRedo = useChartStore((s) => s.redoStack.length > 0)
  const [indicatorsOpen, setIndicatorsOpen] = useState(false)
  /** Hộp thoại tìm mã: null = đóng, chuỗi = mở với nội dung tìm kiếm ban đầu */
  const [search, setSearch] = useState<string | null>(null)
  const [dataOpen, setDataOpen] = useState(false)

  // Như TradingView: gõ chữ / số khi đang xem chart là mở ngay hộp thoại tìm mã
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || !/[a-z0-9]/i.test(e.key)) return
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [role="dialog"]')) return
      e.preventDefault()
      setSearch(e.key.toUpperCase())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="toolbar">
      <button className="tb-btn symbol-btn" title={t('toolbar.symbolSearch')} onClick={() => setSearch('')}>
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="7.5" cy="7.5" r="5.5" />
          <path d="m12 12 4 4" />
        </svg>
        {symbol}
      </button>
      {search !== null && <SymbolSearchDialog mode="change" initialQuery={search} onClose={() => setSearch(null)} />}

      <div className="divider" />

      {INTERVALS.map((i) => (
        <button
          key={i.value}
          className={`tb-btn ${interval === i.value ? 'active' : ''}`}
          onClick={() => setInterval(i.value)}
        >
          {i.label}
        </button>
      ))}

      <div className="divider" />

      <div className="menu-anchor">
        <button
          className={`tb-btn ${indicatorsOpen ? 'active' : ''}`}
          onClick={() => setIndicatorsOpen((v) => !v)}
          onBlur={() => setTimeout(() => setIndicatorsOpen(false), 150)}
          title={t('toolbar.indicators')}
        >
          <i className="fx">ƒx</i> {t('toolbar.indicators')}
        </button>
        {indicatorsOpen && (
          <ul className="symbol-dropdown">
            <li onMouseDown={toggleRsi}>
              {rsiEnabled ? '✓' : '\u2003'} {t('indicator.rsi')}
            </li>
          </ul>
        )}
      </div>

      <div className="divider" />

      <button
        className={`tb-btn ${replayMode !== 'off' ? 'active' : ''}`}
        onClick={() => (replayMode === 'off' ? startReplaySelect() : exitReplay())}
        title={t('toolbar.replayTitle')}
      >
        ⏪ {t('toolbar.replay')}
      </button>

      <button className="tb-btn" onClick={resetView} title={t('toolbar.resetViewTitle')}>
        ⟲ {t('toolbar.resetView')}
      </button>

      <button
        className={`tb-btn ${invertScale ? 'active' : ''}`}
        onClick={toggleInvertScale}
        title={t('toolbar.invertTitle')}
      >
        ⇅ {t('toolbar.invert')}
      </button>

      <div className="divider" />

      <button className="tb-btn tb-icon" onClick={undo} disabled={!canUndo} title={t('toolbar.undo')}>
        <UndoIcon />
      </button>
      <button className="tb-btn tb-icon" onClick={redo} disabled={!canRedo} title={t('toolbar.redo')}>
        <RedoIcon />
      </button>

      <div className="toolbar-spacer" />

      <div className="menu-anchor">
        <button
          className={`tb-btn tb-icon snapshot-btn ${snapOpen ? 'active' : ''}`}
          onClick={() => setSnapOpen((v) => !v)}
          onBlur={() => setTimeout(() => setSnapOpen(false), 150)}
          title={t('toolbar.snapshot')}
        >
          <CameraIcon />
        </button>
        {snapOpen && (
          <ul className="symbol-dropdown snapshot-menu">
            <li
              data-action="copy"
              onMouseDown={(e) => {
                e.preventDefault()
                setSnapOpen(false)
                copyChartImage()
              }}
            >
              {t('snapshot.copy')}
              <kbd>Ctrl+C</kbd>
            </li>
            <li
              data-action="download"
              onMouseDown={(e) => {
                e.preventDefault()
                setSnapOpen(false)
                downloadChartImage()
              }}
            >
              {t('snapshot.download')}
            </li>
          </ul>
        )}
      </div>

      <div className="menu-anchor">
        <button
          className={`tb-btn tb-icon layout-btn ${layoutOpen ? 'active' : ''}`}
          onClick={() => setLayoutOpen((v) => !v)}
          onBlur={() => setTimeout(() => setLayoutOpen(false), 150)}
          title={t('toolbar.layout')}
          data-layout={layout}
        >
          <LayoutIcon layout={layoutInfo(layout)} />
        </button>
        {layoutOpen && (
          <div className="symbol-dropdown layout-menu">
            <div className="layout-menu-title">{t('toolbar.layout')}</div>
            <div className="layout-grid">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  className={`tb-btn tb-icon ${l.id === layout ? 'active' : ''}`}
                  data-layout={l.id}
                  title={l.count === 1 ? t('layout.single') : t('layout.charts', { n: l.count })}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setLayout(l.id)
                    setLayoutOpen(false)
                  }}
                >
                  <LayoutIcon layout={l} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button className="tb-btn tb-icon" title={t('toolbar.dataSources')} onClick={() => setDataOpen(true)}>
        <SettingsIcon />
      </button>
      {dataOpen && <DataSourceDialog onClose={() => setDataOpen(false)} />}

      <div className="menu-anchor">
        <button
          className={`tb-btn tb-icon lang-btn ${langOpen ? 'active' : ''}`}
          onClick={() => setLangOpen((v) => !v)}
          onBlur={() => setTimeout(() => setLangOpen(false), 150)}
          title={t('toolbar.language')}
          data-lang={language}
        >
          <GlobeIcon /> {language.toUpperCase()}
        </button>
        {langOpen && (
          <ul className="symbol-dropdown lang-menu">
            {LANGS.map((l) => (
              <li
                key={l}
                data-lang={l}
                className={l === language ? 'active' : ''}
                onMouseDown={() => {
                  setLanguage(l)
                  setLangOpen(false)
                }}
              >
                {l === language ? '✓' : '\u2003'} {t(`lang.${l}`)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </header>
  )
}

/** Biểu tượng bố cục: các ô biểu đồ trong khung 18×18 */
function LayoutIcon({ layout }: { layout: LayoutInfo }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1">
      {layout.cells.map(([x, y, w, h], i) => (
        <rect key={i} x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} rx="1" />
      ))}
    </svg>
  )
}
