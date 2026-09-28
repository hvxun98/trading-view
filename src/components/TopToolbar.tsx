import { useState } from 'react'
import { useT } from '../i18n'
import { INTERVALS } from '../lib/intervals'
import { useChartStore } from '../store/useChartStore'
import { WATCHLIST } from '../lib/symbols'
import type { Lang } from '../types'
import { GlobeIcon, RedoIcon, UndoIcon } from './icons'

const LANGS: Lang[] = ['en', 'vi']

export function TopToolbar() {
  const {
    symbol,
    interval,
    replayMode,
    invertScale,
    rsiEnabled,
    setSymbol,
    setInterval,
    startReplaySelect,
    exitReplay,
    resetView,
    toggleInvertScale,
    toggleRsi,
    undo,
    redo,
    language,
    setLanguage,
  } = useChartStore()
  const t = useT()
  const [langOpen, setLangOpen] = useState(false)
  const canUndo = useChartStore((s) => s.undoStack.length > 0)
  const canRedo = useChartStore((s) => s.redoStack.length > 0)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [indicatorsOpen, setIndicatorsOpen] = useState(false)

  const q = query.trim().toUpperCase()
  const suggestions = WATCHLIST.filter((s) => s.includes(q))

  const choose = (s: string) => {
    setSymbol(s)
    setQuery('')
    setOpen(false)
  }

  return (
    <header className="toolbar">
      <div className="symbol-search">
        <input
          value={open ? query : symbol}
          placeholder={symbol}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q) choose(q)
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
          }}
        />
        {open && (
          <ul className="symbol-dropdown">
            {suggestions.map((s) => (
              <li key={s} onMouseDown={() => choose(s)}>
                {s}
              </li>
            ))}
            {q && !suggestions.includes(q) && <li onMouseDown={() => choose(q)}>{q} ↵</li>}
          </ul>
        )}
      </div>

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
