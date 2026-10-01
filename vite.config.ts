import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

/**
 * OANDA v20 REST không bật CORS cho trình duyệt -> chuyển tiếp qua server Vite.
 * Trình duyệt gọi /api/oanda/practice/v3/... ; token nằm trong header Authorization của request.
 */
const oanda = (target: string, prefix: string): ProxyOptions => ({
  target,
  changeOrigin: true,
  rewrite: (path) => path.replace(prefix, ''),
})

/**
 * Dukascopy (forex / kim loại miễn phí): endpoint JSONP của widget chart yêu cầu Referer của trang chart
 * -> proxy gắn header và chuyển /api/dukascopy?... thành freeserv.dukascopy.com/2.0/index.php?...
 */
const dukascopy: ProxyOptions = {
  target: 'https://freeserv.dukascopy.com',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api\/dukascopy/, '/2.0/index.php'),
  headers: {
    Referer:
      'https://freeserv.dukascopy.com/2.0/?path=chart/index&showUI=true&showTabs=true&instrument=XAU/USD&period=60&offerSide=BID&timezone=0&live=true&lang=en',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  },
}

/** Swissquote (giá spot realtime): /api/swissquote/XAU/USD -> forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD */
const swissquote: ProxyOptions = {
  target: 'https://forex-data-feed.swissquote.com',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api\/swissquote/, '/public-quotes/bboquotes/instrument'),
}

const proxy = {
  '/api/dukascopy': dukascopy,
  '/api/swissquote': swissquote,
  '/api/oanda/practice': oanda('https://api-fxpractice.oanda.com', '/api/oanda/practice'),
  '/api/oanda/live': oanda('https://api-fxtrade.oanda.com', '/api/oanda/live'),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
})
