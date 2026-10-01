/**
 * Vercel Function thay cho proxy /api/swissquote của Vite khi deploy:
 * /api/swissquote/XAU/USD (vercel.json rewrite -> ?base=XAU&quote=USD)
 *   -> https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD
 * CDN giữ kết quả 1 giây để nhiều người xem cùng lúc không gọi Swissquote liên tục.
 */
const UPSTREAM = 'https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  // Dự phòng: nếu request.url vẫn là đường dẫn gốc /api/swissquote/<BASE>/<QUOTE>
  const [, baseFromPath = '', quoteFromPath = ''] = url.pathname.match(/^\/api\/swissquote\/([^/]+)\/([^/]+)$/) ?? []
  const base = (url.searchParams.get('base') ?? baseFromPath).toUpperCase()
  const quote = (url.searchParams.get('quote') ?? quoteFromPath).toUpperCase()
  if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(quote)) return new Response('Not found', { status: 404 })
  try {
    const upstream = await fetch(`${UPSTREAM}/${base}/${quote}`, { signal: AbortSignal.timeout(5000) })
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'public, max-age=0, s-maxage=1',
      },
    })
  } catch (e) {
    return new Response(`Swissquote upstream error: ${(e as Error).message}`, { status: 502 })
  }
}
