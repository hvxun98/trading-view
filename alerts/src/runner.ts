import { isMetalsMarketOpen } from '../../src/lib/marketHours'
import { STRATEGIES, SYMBOLS } from './config'
import { fetchBars, type FetchResult } from './data/fetch'
import { evaluateStrategy, requiredTimeframes } from './engine/evaluate'
import { lastClosedOpen, TF_LABEL, TF_SECONDS } from './engine/timeframes'
import type { Env } from './env'
import { send, signalMessage, type Message } from './notify/send'
import type { Store } from './store'
import type { Bar, Signal, Strategy, SymbolId, Timeframe } from './types'

/** Số nến lấy cho mỗi khung (đủ cho EMA200 hội tụ) */
const HISTORY = 300
/** Dữ liệu nến mới chưa có: thử lại mỗi phút trong tối đa chừng này giây sau khi nến đóng */
const DATA_GRACE = 5 * 60
/** Báo lỗi nguồn dữ liệu tối đa 1 lần / 6 giờ cho mỗi mã */
const WARN_EVERY = 6 * 3600

export type Outcome =
  | 'signal'
  | 'no-signal'
  | 'cooldown'
  | 'quiet'
  | 'market-closed'
  | 'waiting-data'
  | 'stale-data'
  | 'error'

export interface RunItem {
  strategy: string
  symbol: SymbolId
  barTime: number
  outcome: Outcome
  detail?: string
  signal?: Signal
}

export interface RunReport {
  now: number
  items: RunItem[]
  sent: number
  errors: string[]
}

/** Giờ yên lặng "23-7" theo TIMEZONE */
export function inQuietHours(now: number, env: Env): boolean {
  const m = env.QUIET_HOURS?.match(/^(\d{1,2})-(\d{1,2})$/)
  if (!m) return false
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: env.TIMEZONE || 'Asia/Ho_Chi_Minh',
      hour: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(now * 1000))
      .find((p) => p.type === 'hour')?.value,
  )
  const [from, to] = [Number(m[1]), Number(m[2])]
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to
}

/** Thị trường kim loại có mở lúc nào đó trong nến [open, open + tf) không */
function metalsOpenDuring(open: number, tf: Timeframe) {
  const len = TF_SECONDS[tf]
  return [0, len / 4, len / 2, (3 * len) / 4, len - 60].some((d) => isMetalsMarketOpen(open + d))
}

/**
 * Một vòng kiểm tra (cron mỗi phút): với mỗi chiến lược × mã, nếu có nến mới đóng của khung chính thì
 * lấy dữ liệu, chấm điểm, áp cooldown / giờ yên lặng, gửi thông báo và lưu lại.
 * `force`: chấm lại nến đã đóng gần nhất kể cả khi đã xét (dùng cho /run).
 */
export async function runAlerts(
  env: Env,
  store: Store,
  now = Math.floor(Date.now() / 1000),
  strategies: Strategy[] = STRATEGIES,
  force = false,
): Promise<RunReport> {
  const report: RunReport = { now, items: [], sent: 0, errors: [] }
  const cache = new Map<string, Promise<FetchResult>>()
  const bars = (symbol: SymbolId, tf: Timeframe) => {
    const key = `${symbol}:${tf}`
    if (!cache.has(key)) cache.set(key, fetchBars(symbol, tf, HISTORY, env, now))
    return cache.get(key)!
  }

  for (const strategy of strategies.filter((s) => s.enabled !== false)) {
    const tf = strategy.timeframe
    const target = lastClosedOpen(now, tf)
    const close = target + TF_SECONDS[tf]

    for (const symbol of strategy.symbols) {
      const stateKey = `last:${strategy.id}:${symbol}`
      const item: RunItem = { strategy: strategy.id, symbol, barTime: target, outcome: 'no-signal' }
      const done = () => store.setState(stateKey, String(target), now)
      try {
        if (!force && Number((await store.getState(stateKey)) ?? 0) >= target) continue
        report.items.push(item)

        if (SYMBOLS[symbol].kind === 'metal' && !metalsOpenDuring(target, tf)) {
          item.outcome = 'market-closed'
          await done()
          continue
        }

        const frames = await Promise.all(requiredTimeframes(strategy).map((t) => bars(symbol, t)))
        const byTf: Partial<Record<Timeframe, Bar[]>> = {}
        requiredTimeframes(strategy).forEach((t, i) => (byTf[t] = frames[i].bars))
        const main = byTf[tf] ?? []
        // Nguồn chưa có nến vừa đóng: thử lại phút sau, quá hạn thì bỏ qua nến này
        if ((main.at(-1)?.time ?? 0) < target) {
          item.outcome = now - close < DATA_GRACE ? 'waiting-data' : 'stale-data'
          if (item.outcome === 'stale-data') await done()
          continue
        }
        // Chỉ xét đến đúng nến vừa đóng
        byTf[tf] = main.filter((b) => b.time <= target)

        const signal = evaluateStrategy(strategy, symbol, byTf, SYMBOLS[symbol].precision, frames[0].source)
        if (signal) {
          item.signal = signal
          item.outcome = await deliver(signal, strategy, env, store, now, report)
        }
        await done()
      } catch (e) {
        item.outcome = 'error'
        item.detail = (e as Error).message
        report.errors.push(`${strategy.id}/${symbol}: ${item.detail}`)
        // Lỗi kéo dài quá hạn: bỏ nến này để không hỏi lại mãi; báo người dùng (giới hạn tần suất)
        if (now - close >= DATA_GRACE) {
          await done()
          await warn(symbol, `${strategy.name} · ${TF_LABEL[tf]}: ${item.detail}`, env, store, now)
        }
      }
    }
  }
  if (report.items.length) {
    await store.setState(
      'health:lastRun',
      JSON.stringify({ now, items: report.items.length, errors: report.errors }),
      now,
    )
  }
  return report
}

async function deliver(
  signal: Signal,
  strategy: Strategy,
  env: Env,
  store: Store,
  now: number,
  report: RunReport,
): Promise<Outcome> {
  const prev = await store.lastAlert(signal.strategyId, signal.symbol, signal.side)
  const upgrade = prev?.level === 'watch' && signal.level === 'entry'
  if (prev && now - prev.created_at < strategy.alert.cooldownMinutes * 60 && !upgrade) return 'cooldown'
  // Giờ yên lặng: vẫn lưu tín hiệu "theo dõi" nhưng không gửi
  if (signal.level === 'watch' && inQuietHours(now, env)) {
    await store.saveAlert(signal, [], now)
    return 'quiet'
  }
  const { sent, errors } = await send(signalMessage(signal, env), env)
  report.sent += sent.length
  report.errors.push(...errors)
  await store.saveAlert(signal, sent, now)
  return 'signal'
}

async function warn(symbol: SymbolId, text: string, env: Env, store: Store, now: number) {
  const key = `warn:${symbol}`
  if (now - Number((await store.getState(key)) ?? 0) < WARN_EVERY) return
  await store.setState(key, String(now), now)
  const msg: Message = {
    title: `⚠️ Lỗi nguồn dữ liệu ${symbol}`,
    html: `⚠️ <b>Lỗi nguồn dữ liệu ${symbol}</b>\n${text.replace(/</g, '&lt;')}\nHệ thống sẽ tự thử lại ở nến sau.`,
    text: `${text}\nHệ thống sẽ tự thử lại ở nến sau.`,
    priority: 'low',
  }
  await send(msg, env)
}
