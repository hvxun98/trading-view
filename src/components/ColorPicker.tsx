import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import { parseColor, withAlpha } from '../lib/color'
import { COLOR_PALETTE } from '../lib/drawings'

interface Props {
  value: string
  onChange: (color: string) => void
  title?: string
}

const POPOVER_WIDTH = 248

/**
 * Ô màu + bảng màu như TradingView: chọn màu trong bảng và độ đục (Opacity). Bảng nổi gắn vào body
 * (position: fixed) để không bị khung hộp thoại có thanh cuộn cắt mất.
 */
export function ColorPicker({ value, onChange, title }: Props) {
  const t = useT()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const { hex, alpha } = parseColor(value)

  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    // Bấm ra ngoài / Esc chỉ đóng bảng màu, không đóng luôn hộp thoại cha (backdrop huỷ bằng mousedown)
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      e.stopPropagation()
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close()
    }
    // Cuộn thân hộp thoại: bảng màu (position: fixed) không còn nằm cạnh ô màu nữa
    const onScroll = (e: Event) => {
      if (!popoverRef.current?.contains(e.target as Node)) close()
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [pos])

  const toggle = () => {
    if (pos) return setPos(null)
    const r = buttonRef.current!.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8))
    const below = r.bottom + 6
    // Không đủ chỗ phía dưới thì mở lên trên
    setPos({ left, top: below + 220 > window.innerHeight ? Math.max(8, r.top - 226) : below })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="color-swatch"
        title={title ?? t('ft.color')}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={toggle}
      >
        <span style={{ background: value }} />
      </button>
      {pos &&
        createPortal(
          <div
            ref={popoverRef}
            className="color-popover"
            style={{ left: pos.left, top: pos.top, width: POPOVER_WIDTH }}
          >
            {COLOR_PALETTE.map((row, i) => (
              <div key={i} className="ft-palette-row">
                {row.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`ft-color ${c === hex ? 'active' : ''}`}
                    style={{ background: c }}
                    title={c}
                    onClick={() => onChange(withAlpha(c, alpha))}
                  />
                ))}
              </div>
            ))}
            <div className="color-opacity">
              <span>{t('color.opacity')}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(alpha * 100)}
                style={{ '--swatch': hex } as CSSProperties}
                onChange={(e) => onChange(withAlpha(hex, Number(e.target.value) / 100))}
              />
              <span className="color-opacity-value">{Math.round(alpha * 100)}%</span>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
