/** Kiểu tối giản cho Cloudflare D1 (tránh phụ thuộc @cloudflare/workers-types) */
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
      run(): Promise<unknown>
    }
  }
}

/** Biến môi trường / secret của Worker (wrangler.toml + `wrangler secret put`) */
export interface Env {
  DB?: D1Like
  /** Telegram: token bot từ @BotFather và chat id nhận tin */
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_CHAT_ID?: string
  /** ntfy.sh: tên topic (đặt khó đoán), dự phòng / thêm kênh */
  NTFY_TOPIC?: string
  /** Token OANDA demo (khuyên dùng cho vàng, khớp chart OANDA trên TradingView) */
  OANDA_TOKEN?: string
  OANDA_ENV?: 'practice' | 'live'
  /** Nguồn giá vàng / bạc: auto (OANDA nếu có token -> Dukascopy -> Binance perpetual) */
  GOLD_SOURCE?: 'auto' | 'oanda' | 'dukascopy' | 'binance-futures'
  /** Địa chỉ app chart (link "Mở chart" trong tin nhắn) */
  APP_URL?: string
  /** Khoá bảo vệ các endpoint /alerts, /test, /run */
  API_KEY?: string
  /** Giờ yên lặng theo TIMEZONE, vd. "23-7": chỉ gửi tín hiệu "vào lệnh", bỏ tin "theo dõi" */
  QUIET_HOURS?: string
  TIMEZONE?: string

  // Ghi đè địa chỉ API (chỉ dùng khi test)
  BINANCE_HOSTS?: string
  BINANCE_FUTURES_URL?: string
  OANDA_URL?: string
  DUKASCOPY_URL?: string
  TELEGRAM_API?: string
  NTFY_URL?: string
}
