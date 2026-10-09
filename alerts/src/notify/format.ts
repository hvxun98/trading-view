import { SYMBOLS } from '../config'
import { TF_LABEL, TF_SECONDS } from '../engine/timeframes'
import type { Env } from '../env'
import type { Signal } from '../types'

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Giờ đóng nến theo múi giờ người dùng, vd. "14:00 09/10 (UTC+7)" */
export function formatTime(time: number, env: Env): string {
  const tz = env.TIMEZONE || 'Asia/Ho_Chi_Minh'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date(time * 1000))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('hour')}:${get('minute')} ${get('day')}/${get('month')} (${get('timeZoneName').replace('GMT', 'UTC')})`
}

/** Link mở app chart ở đúng mã / khung, có vị thế Long/Short vẽ sẵn theo gợi ý */
export function chartLink(signal: Signal, env: Env): string | null {
  if (!env.APP_URL) return null
  const params = new URLSearchParams({
    symbol: signal.symbol,
    interval: signal.timeframe,
    side: signal.side,
    entry: String(signal.entry),
    sl: String(signal.sl),
    tp: String(signal.tp.at(-1) ?? signal.entry),
    t: String(signal.barTime),
  })
  return `${env.APP_URL.replace(/\/+$/, '')}/?${params}`
}

function headline(signal: Signal) {
  const pct = Math.round((signal.score / signal.total) * 100)
  const side = signal.side === 'long' ? 'BUY' : 'SELL'
  const icon = signal.level === 'entry' ? (signal.side === 'long' ? '🟢' : '🔴') : '👀'
  const kind = signal.level === 'entry' ? 'GỢI Ý' : 'THEO DÕI'
  return {
    icon,
    title: `${kind} ${side} · ${signal.symbol} · ${TF_LABEL[signal.timeframe]}`,
    score: `${signal.score}/${signal.total} điểm (${pct}%)`,
  }
}

function levelLines(signal: Signal) {
  const precision = SYMBOLS[signal.symbol].precision
  const price = (v: number) => v.toFixed(precision)
  const diff = (v: number) => {
    const d = v - signal.entry
    return `${d >= 0 ? '+' : '−'}${price(Math.abs(d))}`
  }
  const risk = Math.abs(signal.entry - signal.sl)
  const tps = signal.tp.map(
    (tp, i) => `TP${i + 1} ${price(tp)} (${risk ? (Math.abs(tp - signal.entry) / risk).toFixed(1) : '?'}R)`,
  )
  const ref = signal.level === 'watch' ? ' (tham khảo)' : ''
  return [`Entry ${price(signal.entry)}${ref} · SL ${price(signal.sl)} (${diff(signal.sl)})`, tps.join(' · ')]
}

/** Tin nhắn Telegram (HTML) */
export function telegramText(signal: Signal, env: Env): string {
  const h = headline(signal)
  const [entry, tps] = levelLines(signal)
  const checks = signal.checks.map(
    (c) => `${c.pass ? '✅' : '❌'} ${escapeHtml(c.label)}${c.required ? ' <i>(bắt buộc)</i>' : ''}`,
  )
  const close = signal.barTime + TF_SECONDS[signal.timeframe]
  return [
    `${h.icon} <b>${escapeHtml(h.title)}</b> · ${h.score}`,
    `<b>${escapeHtml(entry)}</b>`,
    escapeHtml(tps),
    '',
    ...checks,
    '',
    `📋 ${escapeHtml(signal.strategyName)}`,
    `⏱ Nến đóng ${formatTime(close, env)} · Nguồn: ${escapeHtml(signal.source)}`,
  ].join('\n')
}

/** Tiêu đề + nội dung thuần văn bản (ntfy) */
export function plainText(signal: Signal, env: Env): { title: string; body: string } {
  const h = headline(signal)
  const [entry, tps] = levelLines(signal)
  const close = signal.barTime + TF_SECONDS[signal.timeframe]
  return {
    title: `${h.icon} ${h.title} · ${h.score}`,
    body: [
      entry,
      tps,
      ...signal.checks.map((c) => `${c.pass ? '✅' : '❌'} ${c.label}`),
      `${signal.strategyName} · nến đóng ${formatTime(close, env)} · ${signal.source}`,
    ].join('\n'),
  }
}
