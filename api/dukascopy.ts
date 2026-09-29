/**
 * Vercel Function thay cho proxy /api/dukascopy của Vite khi deploy:
 * /api/dukascopy?... -> https://freeserv.dukascopy.com/2.0/index.php?... (kèm Referer mà server yêu cầu)
 */
const UPSTREAM = 'https://freeserv.dukascopy.com/2.0/index.php'
const HEADERS = {
  Referer:
    'https://freeserv.dukascopy.com/2.0/?path=chart/index&showUI=true&showTabs=true&instrument=XAU/USD&period=60&offerSide=BID&timezone=0&live=true&lang=en',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
}

export async function GET(request: Request): Promise<Response> {
  const { search } = new URL(request.url)
  try {
    const upstream = await fetch(UPSTREAM + search, { headers: HEADERS })
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'text/javascript',
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return new Response(`Dukascopy upstream error: ${(e as Error).message}`, { status: 502 })
  }
}
