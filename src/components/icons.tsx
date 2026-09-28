import type { ReactNode } from 'react'

function Icon({ size = 18, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export const LockIcon = () => (
  <Icon>
    <rect x="4" y="8" width="10" height="7" rx="1" />
    <path d="M6 8V6a3 3 0 0 1 6 0v2" />
  </Icon>
)

export const UnlockIcon = () => (
  <Icon>
    <rect x="4" y="8" width="10" height="7" rx="1" />
    <path d="M6 8V6a3 3 0 0 1 5.8-1" />
  </Icon>
)

export const EyeIcon = () => (
  <Icon>
    <path d="M1.5 9s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5Z" />
    <circle cx="9" cy="9" r="2.2" />
  </Icon>
)

export const EyeOffIcon = () => (
  <Icon>
    <path d="M1.5 9s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5Z" />
    <path d="M3 15 15 3" />
  </Icon>
)

export const TrashIcon = () => (
  <Icon>
    <path d="M3.5 5h11M7 5V3h4v2M5 5l.7 10h6.6L13 5" />
  </Icon>
)

export const CloneIcon = () => (
  <Icon>
    <rect x="6" y="6" width="9" height="9" rx="1" />
    <path d="M12 6V3.5a.5.5 0 0 0-.5-.5h-8a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5H6" />
  </Icon>
)

export const UndoIcon = () => (
  <Icon>
    <path d="M6 4 3 7l3 3" />
    <path d="M3 7h7.5a4 4 0 0 1 0 8H7" />
  </Icon>
)

export const RedoIcon = () => (
  <Icon>
    <path d="m12 4 3 3-3 3" />
    <path d="M15 7H7.5a4 4 0 0 0 0 8H11" />
  </Icon>
)

/** Mẫu nét vẽ (độ dày + kiểu nét) cho menu chọn */
export function LineSample({ width, dash }: { width: number; dash: number[] }) {
  return (
    <svg width="34" height="12" viewBox="0 0 34 12">
      <line
        x1="2"
        y1="6"
        x2="32"
        y2="6"
        stroke="currentColor"
        strokeWidth={width}
        strokeDasharray={dash.length ? dash.join(' ') : undefined}
      />
    </svg>
  )
}
