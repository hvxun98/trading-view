import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { chartLink, telegramText } from '../src/notify/format.ts'
import { inQuietHours, runAlerts } from '../src/runner.ts'
import { MemoryStore } from '../src/store.ts'
import type { Env } from '../src/env.ts'
import type { Strategy } from '../src/types.ts'

const H = 3600
const realFetch = globalThis.fetch
// Thứ Tư 2026-10-07 14:00:30 UTC (thị trường kim loại mở)
const WED_14 = Date.UTC(2026, 9, 7, 14, 0, 30) / 1000

/** Thị trường giả: nến H1 phẳng, nến đóng gần nhất phá đỉnh kèm volume nếu `breakout` */
const market = { breakout: true, side: 'long' as 'long' | 'short', lastAvailable: Infinity, fail: false }
let telegram: { url: string; body: Record<string, unknown> }[] = []
let ntfy: Record<string, unknown>[] = []

function klines(url: URL, now: number) {
  const step = url.searchParams.get('interval') === '4h' ? 4 * H : H
  const limit = Number(url.searchParams.get('limit'))
  const current = Math.floor(now / step) * step // nến đang chạy
  return Array.from({ length: limit }, (_, i) => {
    const t = current - (limit - 1 - i) * step
    let [o, h, l, c, v] = [100, 100.5, 99.5, 100, 10]
    if (step === H && t === current - H && market.breakout) {
      ;[o, c, v] = market.side === 'long' ? [100, 103, 50] : [100, 97, 50]
      ;[h, l] = [Math.max(o, c) + 0.2, Math.min(o, c) - 0.2]
    }
    return [t * 1000, String(o), String(h), String(l), String(c), String(v), 0, '0', 0, '0', '0', '0']
  }).filter((k) => (k[0] as number) / 1000 <= market.lastAvailable)
}

function install(now: number) {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    if (url.host === 'b.test') {
      if (market.fail) return new Response('down', { status: 503 })
      return Response.json(klines(url, now))
    }
    if (url.host === 'tg.test') {
      telegram.push({ url: String(input), body: JSON.parse(String(init?.body)) })
      return Response.json({ ok: true })
    }
    if (url.host === 'ntfy.test') {
      ntfy.push(JSON.parse(String(init?.body)))
      return Response.json({ id: 'x' })
    }
    return new Response('unexpected ' + url, { status: 500 })
  }) as typeof fetch
}

const env: Env = {
  BINANCE_HOSTS: 'https://b.test',
  TELEGRAM_BOT_TOKEN: 'TOKEN',
  TELEGRAM_CHAT_ID: '42',
  TELEGRAM_API: 'https://tg.test',
  NTFY_TOPIC: 'my-topic',
  NTFY_URL: 'https://ntfy.test',
  APP_URL: 'https://app.test/',
  TIMEZONE: 'Asia/Ho_Chi_Minh',
}

const strategy: Strategy = {
  id: 'bo',
  name: 'Breakout test',
  symbols: ['BTCUSDT'],
  timeframe: '1h',
  rules: [
    { type: 'breakout', lookback: 5, weight: 2, required: true },
    { type: 'volume_spike', period: 20, mult: 2, weight: 1 },
    { type: 'trend', tf: '4h', ma: 'ema', period: 20, weight: 1 },
  ],
  alert: { watchAt: 0.5, entryAt: 0.75, cooldownMinutes: 180 },
  risk: { sl: { type: 'atr', period: 14, mult: 1 }, rr: [1, 2] },
}

beforeEach(() => {
  Object.assign(market, { breakout: true, side: 'long', lastAvailable: Infinity, fail: false })
  telegram = []
  ntfy = []
})
afterEach(() => {
  globalThis.fetch = realFetch
})

describe('runAlerts', () => {
  it('evaluates a newly closed candle once, sends to Telegram + ntfy and stores the alert', async () => {
    const store = new MemoryStore()
    install(WED_14)
    const r = await runAlerts(env, store, WED_14, [strategy])
    assert.equal(r.items.length, 1)
    assert.equal(r.items[0].outcome, 'signal')
    assert.equal(r.items[0].barTime, WED_14 - 30 - H)
    assert.equal(r.sent, 2)
    assert.equal(telegram.length, 1)
    assert.match(telegram[0].url, /\/botTOKEN\/sendMessage$/)
    assert.equal(telegram[0].body.chat_id, '42')
    assert.equal(telegram[0].body.parse_mode, 'HTML')
    const text = String(telegram[0].body.text)
    assert.match(text, /^🟢 <b>GỢI Ý BUY · BTCUSDT · H1<\/b> · 3\/4 điểm \(75%\)/)
    assert.match(text, /Entry 103\.00 · SL/)
    assert.match(text, /✅ H1 phá đỉnh 5 nến/)
    assert.match(text, /❌ H4 EMA20/)
    assert.match(text, /Nến đóng 21:00 07\/10 \(UTC\+7\) · Nguồn: Binance/)
    const button = (telegram[0].body.reply_markup as { inline_keyboard: { url: string }[][] }).inline_keyboard[0][0]
    assert.match(button.url, /^https:\/\/app\.test\/\?symbol=BTCUSDT&interval=1h&side=long&entry=103&sl=/)
    assert.equal(ntfy[0].topic, 'my-topic')
    assert.equal(ntfy[0].priority, 4)
    assert.match(String(ntfy[0].title), /GỢI Ý BUY · BTCUSDT · H1/)
    assert.equal(store.alerts.length, 1)
    assert.deepEqual(store.alerts[0].channels.sort(), ['ntfy', 'telegram'])

    // Cùng nến, phút sau: không xét lại
    const again = await runAlerts(env, store, WED_14 + 60, [strategy])
    assert.equal(again.items.length, 0)
    assert.equal(telegram.length, 1)
  })

  it('cooldown blocks a repeat on the next candle; a different side is allowed', async () => {
    const store = new MemoryStore()
    install(WED_14)
    await runAlerts(env, store, WED_14, [strategy])
    install(WED_14 + H)
    const r = await runAlerts(env, store, WED_14 + H, [strategy])
    assert.equal(r.items[0].outcome, 'cooldown')
    assert.equal(telegram.length, 1)
    market.side = 'short'
    install(WED_14 + 2 * H)
    const s = await runAlerts(env, store, WED_14 + 2 * H, [strategy])
    assert.equal(s.items[0].outcome, 'signal')
    assert.equal(s.items[0].signal!.side, 'short')
  })

  it('watch -> entry upgrade passes the cooldown', async () => {
    const store = new MemoryStore()
    const watchOnly: Strategy = { ...strategy, alert: { ...strategy.alert, entryAt: 0.9 } }
    install(WED_14)
    const w = await runAlerts(env, store, WED_14, [watchOnly])
    assert.equal(w.items[0].signal!.level, 'watch')
    assert.match(String(telegram[0].body.text), /^👀 <b>THEO DÕI BUY/)
    install(WED_14 + H)
    const e = await runAlerts(env, store, WED_14 + H, [strategy])
    assert.equal(e.items[0].outcome, 'signal')
    assert.equal(e.items[0].signal!.level, 'entry')
  })

  it('quiet hours: watch alerts are stored but not sent', async () => {
    const store = new MemoryStore()
    const watchOnly: Strategy = { ...strategy, alert: { ...strategy.alert, entryAt: 0.9 } }
    install(WED_14)
    const r = await runAlerts({ ...env, QUIET_HOURS: '20-23' }, store, WED_14, [watchOnly]) // 21:00 giờ VN
    assert.equal(r.items[0].outcome, 'quiet')
    assert.equal(telegram.length, 0)
    assert.equal(store.alerts.length, 1)
  })

  it('no signal still marks the candle as evaluated', async () => {
    const store = new MemoryStore()
    market.breakout = false
    install(WED_14)
    const r = await runAlerts(env, store, WED_14, [strategy])
    assert.equal(r.items[0].outcome, 'no-signal')
    assert.equal(await store.getState('last:bo:BTCUSDT'), String(WED_14 - 30 - H))
  })

  it('waits for the exchange to publish the closed candle, then gives up after 5 minutes', async () => {
    const store = new MemoryStore()
    market.lastAvailable = WED_14 - 30 - 2 * H // nến vừa đóng chưa có
    install(WED_14)
    const r = await runAlerts(env, store, WED_14, [strategy])
    assert.equal(r.items[0].outcome, 'waiting-data')
    assert.equal(await store.getState('last:bo:BTCUSDT'), null)
    install(WED_14 + 6 * 60)
    const s = await runAlerts(env, store, WED_14 + 6 * 60, [strategy])
    assert.equal(s.items[0].outcome, 'stale-data')
    assert.ok(await store.getState('last:bo:BTCUSDT'))
  })

  it('gold candles during the weekend close are skipped without fetching', async () => {
    const store = new MemoryStore()
    const sat = Date.UTC(2026, 9, 10, 12, 0, 30) / 1000
    install(sat)
    const r = await runAlerts({ ...env, DUKASCOPY_URL: 'https://none.test' }, store, sat, [
      { ...strategy, symbols: ['XAUUSD'] },
    ])
    assert.equal(r.items[0].outcome, 'market-closed')
  })

  it('data errors: retried, then reported once per 6 hours', async () => {
    const store = new MemoryStore()
    market.fail = true
    install(WED_14)
    const r = await runAlerts(env, store, WED_14, [strategy])
    assert.equal(r.items[0].outcome, 'error')
    assert.equal(telegram.length, 0, 'no warning while still retrying')
    install(WED_14 + 6 * 60)
    await runAlerts(env, store, WED_14 + 6 * 60, [strategy])
    assert.equal(telegram.length, 1)
    assert.match(String(telegram[0].body.text), /Lỗi nguồn dữ liệu BTCUSDT/)
    install(WED_14 + H + 6 * 60)
    await runAlerts(env, store, WED_14 + H + 6 * 60, [strategy])
    assert.equal(telegram.length, 1, 'rate limited')
  })
})

describe('helpers', () => {
  it('quiet hours across midnight', () => {
    const at = (h: number) => Date.UTC(2026, 9, 7, h - 7, 0) / 1000 // giờ VN = UTC+7
    assert.ok(inQuietHours(at(23), { QUIET_HOURS: '23-7' }))
    assert.ok(inQuietHours(at(30), { QUIET_HOURS: '23-7' })) // 06:00 hôm sau
    assert.ok(!inQuietHours(at(14), { QUIET_HOURS: '23-7' }))
    assert.ok(!inQuietHours(at(14), {}))
  })
  it('chart link and HTML escaping', () => {
    const signal = {
      strategyId: 's',
      strategyName: 'A <b> & B',
      symbol: 'XAUUSD' as const,
      timeframe: '15m' as const,
      side: 'short' as const,
      level: 'entry' as const,
      score: 2,
      total: 2,
      barTime: 1_790_000_100,
      entry: 2345.5,
      sl: 2350,
      tp: [2338.75, 2332],
      checks: [{ label: 'x < y', pass: true, weight: 1, required: true }],
      source: 'OANDA',
    }
    assert.equal(chartLink(signal, {}), null)
    assert.equal(
      chartLink(signal, { APP_URL: 'https://a.b' }),
      'https://a.b/?symbol=XAUUSD&interval=15m&side=short&entry=2345.5&sl=2350&tp=2332&t=1790000100',
    )
    const text = telegramText(signal, {})
    assert.match(text, /^🔴 <b>GỢI Ý SELL · XAUUSD · M15<\/b>/)
    assert.match(text, /✅ x &lt; y <i>\(bắt buộc\)<\/i>/)
    assert.match(text, /📋 A &lt;b&gt; &amp; B/)
    assert.match(text, /Entry 2345\.50 · SL 2350\.00 \(\+4\.50\)/)
    assert.match(text, /TP1 2338\.75 \(1\.5R\) · TP2 2332\.00 \(3\.0R\)/)
  })
})
