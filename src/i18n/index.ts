import { useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { Lang } from '../types'
import { en } from './en'
import { vi } from './vi'

export type TKey = keyof typeof en
export type TParams = Record<string, string | number>
export type TFunction = (key: TKey, params?: TParams) => string

const DICTS: Record<Lang, Record<TKey, string>> = { en, vi }

export function translate(lang: Lang, key: TKey, params?: TParams): string {
  const text = DICTS[lang][key] ?? en[key]
  return params ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : text
}

/** Hook dịch cho component: tự render lại khi đổi ngôn ngữ */
export function useT(): TFunction {
  const lang = useAppStore((s) => s.language)
  return useCallback((key, params) => translate(lang, key, params), [lang])
}
