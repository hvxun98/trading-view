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

const proxy = {
  '/api/oanda/practice': oanda('https://api-fxpractice.oanda.com', '/api/oanda/practice'),
  '/api/oanda/live': oanda('https://api-fxtrade.oanda.com', '/api/oanda/live'),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
})
