import { useEffect, useState } from 'react'
import { onToast, type Toast } from '../lib/toast'

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(
    () =>
      onToast((t) => {
        setToasts((list) => [...list.slice(-2), t])
        setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), 3000)
      }),
    [],
  )

  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
