import type { Env } from '../env'
import type { Signal } from '../types'
import { chartLink, plainText, telegramText } from './format'

/** Một tin nhắn gửi đi: tín hiệu hoặc thông báo hệ thống (lỗi nguồn dữ liệu, tin thử) */
export interface Message {
  title: string
  /** HTML cho Telegram */
  html: string
  /** Văn bản thuần cho ntfy */
  text: string
  link?: string | null
  priority?: 'high' | 'default' | 'low'
}

export function signalMessage(signal: Signal, env: Env): Message {
  const plain = plainText(signal, env)
  return {
    title: plain.title,
    html: telegramText(signal, env),
    text: plain.body,
    link: chartLink(signal, env),
    priority: signal.level === 'entry' ? 'high' : 'default',
  }
}

/** Các kênh đã cấu hình */
export function channels(env: Env): string[] {
  const out: string[] = []
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) out.push('telegram')
  if (env.NTFY_TOPIC) out.push('ntfy')
  return out
}

async function telegram(msg: Message, env: Env) {
  const api = env.TELEGRAM_API ?? 'https://api.telegram.org'
  const res = await fetch(`${api}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: msg.html,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(msg.link ? { reply_markup: { inline_keyboard: [[{ text: '📈 Mở chart', url: msg.link }]] } } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

async function ntfy(msg: Message, env: Env) {
  // Gửi dạng JSON để tiêu đề tiếng Việt / emoji không bị lỗi mã hoá header
  const res = await fetch(env.NTFY_URL ?? 'https://ntfy.sh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: env.NTFY_TOPIC,
      title: msg.title,
      message: msg.text,
      priority: msg.priority === 'high' ? 4 : msg.priority === 'low' ? 2 : 3,
      tags: ['chart_with_upwards_trend'],
      ...(msg.link ? { click: msg.link } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`ntfy ${res.status}`)
}

/** Gửi tới mọi kênh đã cấu hình; trả về các kênh gửi thành công (lỗi từng kênh không làm hỏng kênh khác) */
export async function send(msg: Message, env: Env): Promise<{ sent: string[]; errors: string[] }> {
  const sent: string[] = []
  const errors: string[] = []
  await Promise.all(
    channels(env).map(async (ch) => {
      try {
        await (ch === 'telegram' ? telegram(msg, env) : ntfy(msg, env))
        sent.push(ch)
      } catch (e) {
        errors.push(`${ch}: ${(e as Error).message}`)
      }
    }),
  )
  return { sent, errors }
}
