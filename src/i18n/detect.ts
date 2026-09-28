import type { Lang } from '../types'

/** Ngôn ngữ mặc định theo trình duyệt (tách riêng để store import không bị vòng lặp) */
export function detectLanguage(): Lang {
  try {
    return navigator.language?.toLowerCase().startsWith('vi') ? 'vi' : 'en'
  } catch {
    return 'en'
  }
}
