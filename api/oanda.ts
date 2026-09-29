/**
 * Vercel Function thay cho proxy /api/oanda/{practice,live}/... của Vite khi deploy.
 * vercel.json rewrite /api/oanda/:env/:path* -> /api/oanda (Vercel tự thêm ?env= * vercel.json rewrite /api/oanda/:env/:path* -> /api/oanda?env=:env&path=:path* (Vercel tự thêm tham số) (giữ nguyên query gốc).path=, giữ nguyên query gốc).
 * Token nằm trong header Authorization của trình duyệt, function chỉ chuyển tiếp, không lưu.
 */
const HOSTS: Record<string, string> = {
  practice: 'https://api-fxpractice.oanda.com',
  live: 'https://api-fxtrade.oanda.com',
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  // Dự phòng: nếu request.url vẫn là đường dẫn gốc /api/oanda/<env>/<path>
  const [, envFromPath = '', pathFromPath = ''] = url.pathname.match(/^\/api\/oanda\/([^/]+)\/(.+)$/) ?? []
  const host = HOSTS[url.searchParams.get('env') ?? envFromPath]
  const path = url.searchParams.get('path') ?? pathFromPath
  // Chỉ chuyển tiếp REST v20, không cho đi đường khác
  if (!host || !/^v3\/[\w./-]+$/.test(path) || path.includes('..')) {
    return new Response('Not found', { status: 404 })
  }
  url.searchParams.delete('env')
  url.searchParams.delete('path')

  const headers: Record<string, string> = {}
  for (const name of ['authorization', 'accept-datetime-format']) {
    const value = request.headers.get(name)
    if (value) headers[name] = value
  }
  try {
    const upstream = await fetch(`${host}/${path}${url.search}`, { headers })
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return new Response(`OANDA upstream error: ${(e as Error).message}`, { status: 502 })
  }
}
