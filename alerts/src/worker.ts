import { STRATEGIES } from './config'
import type { Env } from './env'
import { channels, send } from './notify/send'
import { runAlerts } from './runner'
import { D1Store, MemoryStore, type Store } from './store'

/**
 * Cloudflare Worker: cron mỗi phút chạy bộ kiểm tra cảnh báo; vài endpoint HTTP để kiểm tra / thử.
 *   GET  /health                 trạng thái (công khai, không lộ bí mật)
 *   GET  /alerts?limit=50        cảnh báo gần đây (cần API_KEY)
 *   POST /test                   gửi tin thử tới các kênh (cần API_KEY)
 *   POST /run?force=1            chạy ngay một vòng (cần API_KEY)
 */

interface ScheduledEvent {
  scheduledTime: number
}
interface Ctx {
  waitUntil(promise: Promise<unknown>): void
}

/** Không có D1 (chưa cấu hình): dùng bộ nhớ — mất trạng thái giữa các lần chạy, chỉ hợp để thử */
const memory = new MemoryStore()
const storeFor = (env: Env): Store => (env.DB ? new D1Store(env.DB) : memory)

function authorized(req: Request, env: Env): boolean {
  if (!env.API_KEY) return false
  const url = new URL(req.url)
  const header = req.headers.get('Authorization')
  return header === `Bearer ${env.API_KEY}` || url.searchParams.get('key') === env.API_KEY
}

function json(body: unknown, env: Env, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': env.APP_URL || '*',
      'Access-Control-Allow-Headers': 'Authorization',
      'Cache-Control': 'no-store',
    },
  })
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: Ctx) {
    const now = Math.floor(event.scheduledTime / 1000)
    ctx.waitUntil(
      runAlerts(env, storeFor(env), now).then((report) => {
        if (report.items.length) console.log(JSON.stringify(report.items.map(({ signal: _s, ...i }) => i)))
        if (report.errors.length) console.error(report.errors.join('\n'))
      }),
    )
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (req.method === 'OPTIONS') return json(null, env, 204)

    if (url.pathname === '/' || url.pathname === '/health') {
      const store = storeFor(env)
      return json(
        {
          ok: true,
          database: !!env.DB,
          channels: channels(env),
          strategies: STRATEGIES.filter((s) => s.enabled !== false).map((s) => ({
            id: s.id,
            name: s.name,
            timeframe: s.timeframe,
            symbols: s.symbols,
          })),
          lastRun: JSON.parse((await store.getState('health:lastRun')) ?? 'null'),
        },
        env,
      )
    }

    if (!authorized(req, env)) return json({ error: 'unauthorized' }, env, 401)

    if (url.pathname === '/alerts' && req.method === 'GET') {
      const limit = Math.min(200, Number(url.searchParams.get('limit') ?? 50) || 50)
      return json(await storeFor(env).recentAlerts(limit), env)
    }

    if (url.pathname === '/test' && req.method === 'POST') {
      const result = await send(
        {
          title: '✅ Hệ thống cảnh báo đã kết nối',
          html: '✅ <b>Hệ thống cảnh báo đã kết nối</b>\nBạn sẽ nhận gợi ý vào lệnh tại đây.',
          text: 'Bạn sẽ nhận gợi ý vào lệnh tại đây.',
        },
        env,
      )
      return json(result, env, result.sent.length ? 200 : 502)
    }

    if (url.pathname === '/run' && req.method === 'POST') {
      const report = await runAlerts(env, storeFor(env), undefined, undefined, url.searchParams.get('force') === '1')
      return json(report, env)
    }

    return json({ error: 'not found' }, env, 404)
  },
}
