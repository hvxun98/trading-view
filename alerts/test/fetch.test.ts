import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { fetchBars, metalSources } from '../src/data/fetch.ts'
import { isMetalsMarketOpen } from '../../src/lib/marketHours.ts'

const realFetch = globalThis.fetch
type Call = { url: string; headers: Record<string, string> }
function mockFetch(handler: (url: URL, call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const call = { url: String(input), headers: Object.fromEntries(new Headers(init?.headers).entries()) }
    calls.push(call)
    return handler(new URL(String(input)), call)
  }) as typeof fetch
  return calls
}
afterEach(() => {
  globalThis.fetch = realFetch
})

const H = 3600
const NOW = 1_790_000_000 - (1_790_000_000 % H) + 600 // 10 phút sau khi mở nến H1 hiện tại
const klines = (count: number, step: number, lastOpen: number) =>
  Array.from({ length: count }, (_, i) => {
    const t = lastOpen - (count - 1 - i) * step
    return [t * 1000, '1', '2', '0.5', String(i), '10', 0, '0', 0, '0', '0', '0']
  })

describe('crypto (Binance)', () => {
  it('drops the candle still in progress and tries the next host on error', async () => {
    const lastOpen = NOW - (NOW % H) // nến đang chạy
    const calls = mockFetch((u) =>
      u.host === 'a.test' ? new Response('down', { status: 503 }) : Response.json(klines(301, H, lastOpen)),
    )
    const r = await fetchBars('BTCUSDT', '1h', 300, { BINANCE_HOSTS: 'https://a.test,https://b.test' }, NOW)
    assert.equal(r.source, 'Binance')
    assert.equal(r.bars.length, 300)
    assert.equal(r.bars.at(-1)!.time, lastOpen - H, 'last closed bar only')
    assert.match(calls[1].url, /^https:\/\/b\.test\/api\/v3\/klines\?symbol=BTCUSDT&interval=1h&limit=301$/)
  })
})

describe('metals', () => {
  it('source order', () => {
    assert.deepEqual(metalSources({}), ['dukascopy', 'binance-futures'])
    assert.deepEqual(metalSources({ OANDA_TOKEN: 'x' }), ['oanda', 'dukascopy', 'binance-futures'])
    assert.deepEqual(metalSources({ GOLD_SOURCE: 'binance-futures', OANDA_TOKEN: 'x' }), [
      'binance-futures',
      'oanda',
      'dukascopy',
    ])
  })

  it('OANDA: token header, complete candles only', async () => {
    const calls = mockFetch(() =>
      Response.json({
        candles: [
          { time: String(NOW - 2 * H - 600), complete: true, volume: 5, mid: { o: '1', h: '2', l: '0.5', c: '1.5' } },
          { time: String(NOW - 600), complete: false, volume: 1, mid: { o: '1.5', h: '2', l: '1', c: '1.8' } },
        ],
      }),
    )
    const r = await fetchBars('XAUUSD', '1h', 300, { OANDA_TOKEN: 'tok', OANDA_URL: 'https://o.test' }, NOW)
    assert.equal(r.source, 'OANDA')
    assert.equal(r.bars.length, 1)
    assert.equal(r.bars[0].close, 1.5)
    assert.match(calls[0].url, /^https:\/\/o\.test\/v3\/instruments\/XAU_USD\/candles\?granularity=H1&count=301/)
    assert.equal(calls[0].headers.authorization, 'Bearer tok')
  })

  it('Dukascopy: Referer header, JSONP, BID, closed only; used when OANDA fails', async () => {
    const lastOpen = NOW - (NOW % H)
    const rows = Array.from({ length: 5 }, (_, i) => [(lastOpen - (4 - i) * H) * 1000, 1, 2, 0.5, 1 + i, 3])
    const calls = mockFetch((u) =>
      u.host === 'o.test'
        ? new Response('', { status: 401 })
        : new Response(`_callbacks____alerts(${JSON.stringify(rows)});`),
    )
    const r = await fetchBars(
      'XAUUSD',
      '1h',
      300,
      { OANDA_TOKEN: 'bad', OANDA_URL: 'https://o.test', DUKASCOPY_URL: 'https://d.test/x' },
      NOW,
    )
    assert.equal(r.source, 'Dukascopy')
    assert.equal(r.bars.length, 4)
    assert.equal(r.bars.at(-1)!.time, lastOpen - H)
    const u = new URL(calls[1].url)
    assert.equal(u.searchParams.get('instrument'), 'XAU/USD')
    assert.equal(u.searchParams.get('interval'), '1HOUR')
    assert.equal(u.searchParams.get('offer_side'), 'B')
    assert.match(calls[1].headers.referer, /^https:\/\/freeserv\.dukascopy\.com/)
  })

  it('Binance perpetual: drops candles while the metals market is closed', async () => {
    const lastOpen = NOW - (NOW % H)
    mockFetch(() => Response.json(klines(400, H, lastOpen)))
    const r = await fetchBars(
      'XAUUSD',
      '1h',
      300,
      { GOLD_SOURCE: 'binance-futures', BINANCE_FUTURES_URL: 'https://f.test' },
      NOW,
    )
    assert.equal(r.source, 'Binance Futures')
    assert.ok(r.bars.length > 0 && r.bars.every((b) => isMetalsMarketOpen(b.time)))
    assert.ok(r.bars.length < 400)
  })

  it('all sources fail -> throws', async () => {
    mockFetch(() => new Response('', { status: 500 }))
    await assert.rejects(
      fetchBars('XAUUSD', '1h', 10, { DUKASCOPY_URL: 'https://d.test', BINANCE_FUTURES_URL: 'https://f.test' }, NOW),
    )
  })
})
