import { useEffect, useRef, useState } from 'react'

export interface TextEditorProps {
  x: number
  y: number
  /** Đặt ô nhập phía trên điểm (x, y) — dùng cho Note (hộp nằm trên ghim) */
  above?: boolean
  initial: string
  fontSize: number
  color: string
  background: string
  onCommit: (text: string) => void
  onCancel: () => void
}

/** Ô nhập chữ nằm đè lên chart: Enter = xong, Shift+Enter = xuống dòng, Esc = huỷ */
export function TextEditor({ x, y, above, initial, fontSize, color, background, onCommit, onCancel }: TextEditorProps) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  // Enter rồi blur sẽ gọi 2 lần -> chỉ nhận lần đầu
  const doneRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const finish = (commit: boolean) => {
    if (doneRef.current) return
    doneRef.current = true
    if (commit) onCommit(value)
    else onCancel()
  }

  const lines = value.split('\n')
  return (
    <textarea
      ref={ref}
      className="text-editor"
      value={value}
      placeholder="Text"
      rows={Math.max(1, lines.length)}
      cols={Math.max(6, ...lines.map((l) => l.length + 1))}
      style={{
        left: x,
        top: y,
        transform: above ? 'translateY(-100%)' : undefined,
        fontSize,
        lineHeight: 1.3,
        color,
        background,
      }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          finish(true)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          finish(false)
        }
      }}
    />
  )
}
