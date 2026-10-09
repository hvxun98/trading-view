# Hệ thống cảnh báo giá vàng & BTC

Chạy 24/24 trên **Cloudflare Workers (gói Free)**. Mỗi phút Worker kiểm tra xem có nến mới đóng không; nếu có, nó lấy
giá, chấm điểm theo các quy tắc trong `src/config.ts` rồi gửi **gợi ý vào lệnh** (entry, SL, TP, các điều kiện đạt /
chưa đạt) qua **Telegram** (và **ntfy** nếu muốn). Nút "📈 Mở chart" trong tin nhắn mở app trading-view ở đúng mã /
khung, có vị thế Long / Short vẽ sẵn.

> Chỉ là gợi ý theo quy tắc của bạn, không tự đặt lệnh. Hãy backtest và theo dõi bằng tài khoản demo trước.

## Cách hoạt động

```
cron mỗi phút ─► có nến mới đóng? ─► lấy nến (Binance / OANDA / Dukascopy) ─► chấm điểm từng chiến lược
                                                                              │
         D1 lưu "đã xét nến này", lịch sử cảnh báo, cooldown ◄────────────────┤
                                                                              ▼
                                                   Telegram / ntfy: 🟢 GỢI Ý BUY · XAUUSD · H1 · 6/7 điểm
```

- **Chấm điểm:** mỗi điều kiện có trọng số. Tỉ lệ điểm ≥ `watchAt` → báo **👀 theo dõi**, ≥ `entryAt` →
  **🟢/🔴 gợi ý vào lệnh**. Điều kiện `required: true` không đạt thì chiều đó bị loại.
- **Chỉ xét nến đã đóng**, nên tín hiệu không "vẽ lại".
- **Chống báo trùng:** cùng chiến lược + mã + chiều không báo lại trong `cooldownMinutes`, trừ khi nâng từ theo dõi
  lên vào lệnh.
- **Vàng / bạc:** OANDA nếu có `OANDA_TOKEN` → Dukascopy → Binance XAUUSDT perpetual (đã bỏ giờ đóng cửa). Cuối tuần
  không xét.
- **Nguồn dữ liệu lỗi** quá 5 phút: bỏ qua nến đó và nhắn bạn (tối đa 1 lần / 6 giờ / mã).
- **Giờ yên lặng** (`QUIET_HOURS`, vd. `23-7`): ban đêm chỉ gửi tín hiệu vào lệnh, tín hiệu theo dõi vẫn được lưu.

## Cài đặt (miễn phí, ~15 phút)

Cần: Node.js 20+ và tài khoản Cloudflare (miễn phí, không cần thẻ). Trên Windows PowerShell, nếu `npm` báo lỗi
script thì dùng `npm.cmd`.

### 1. Tạo bot Telegram
1. Mở Telegram, chat với **@BotFather** → `/newbot` → đặt tên → nhận **token** dạng `123456:ABC...`.
2. Nhắn một tin bất kỳ cho bot vừa tạo.
3. Mở `https://api.telegram.org/bot<TOKEN>/getUpdates` trên trình duyệt, tìm `"chat":{"id": ...}` → đó là **chat id**.
   (Muốn nhận trong nhóm: thêm bot vào nhóm, nhắn trong nhóm, chat id của nhóm là số âm.)

### 2. Deploy Worker
```bash
cd alerts
npm install
npx wrangler login                       # mở trình duyệt đăng nhập Cloudflare
npx wrangler d1 create trading-alerts    # in ra database_id -> dán vào wrangler.toml
npm run db:init                          # tạo bảng trong D1
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put API_KEY          # chuỗi ngẫu nhiên bất kỳ, dùng cho /test /run /alerts
npm run deploy                           # in ra địa chỉ https://trading-alerts.<tên>.workers.dev
```
Tuỳ chọn:
- `npx wrangler secret put OANDA_TOKEN`: giá vàng từ OANDA demo, khớp chart OANDA:XAUUSD trên TradingView.
- `npx wrangler secret put NTFY_TOPIC`: thêm kênh ntfy. Cài app ntfy và subscribe topic này; đặt tên khó đoán.
- Sửa `[vars]` trong `wrangler.toml`: `QUIET_HOURS`, `TIMEZONE`, `GOLD_SOURCE`, `APP_URL`.

### 3. Kiểm tra
```bash
curl -X POST "https://trading-alerts.<tên>.workers.dev/test?key=<API_KEY>"   # nhận tin "Hệ thống cảnh báo đã kết nối"
curl "https://trading-alerts.<tên>.workers.dev/health"                       # chiến lược, kênh, lần chạy gần nhất
curl -X POST "https://trading-alerts.<tên>.workers.dev/run?force=1&key=<API_KEY>"  # chấm ngay nến vừa đóng
curl "https://trading-alerts.<tên>.workers.dev/alerts?key=<API_KEY>"         # cảnh báo đã gửi
```
Log realtime: `npx wrangler tail`.

## Viết quy tắc của bạn (`src/config.ts`)

```ts
{
  id: 'trend-pullback-h1',
  name: 'Hồi về EMA theo xu hướng H4',
  symbols: ['XAUUSD', 'BTCUSDT'],
  timeframe: '1h',                 // 5m | 15m | 30m | 1h | 4h | 1d
  sessions: ['london', 'newyork'], // tuỳ chọn: chỉ báo trong các phiên này
  rules: [
    { type: 'trend', tf: '4h', ma: 'ema', period: 200, weight: 2, required: true },
    { type: 'pullback', ma: 'ema', period: 50, toleranceAtr: 0.5, weight: 2 },
    { type: 'rsi', period: 14, longBelow: 45, shortAbove: 55, weight: 1 },
    { type: 'pattern', patterns: ['engulfing', 'pin_bar'], weight: 2 },
  ],
  alert: { watchAt: 0.6, entryAt: 0.85, cooldownMinutes: 240 },
  risk: { sl: { type: 'swing', lookback: 10, bufferAtr: 0.3 }, rr: [1.5, 3] },
}
```

| `type` | Buy khi | Sell khi | Tham số |
|---|---|---|---|
| `trend` | giá đóng trên MA | dưới MA | `ma` (ema/sma), `period`, `tf` |
| `ma_cross` | MA nhanh cắt lên MA chậm trong `within` nến | cắt xuống | `fast`, `slow`, `within` |
| `pullback` | giá hồi chạm MA (± `toleranceAtr` × ATR) rồi đóng trên MA | chạm rồi đóng dưới | `period`, `toleranceAtr` |
| `rsi` | RSI ≤ `longBelow` | RSI ≥ `shortAbove` | `period` |
| `breakout` | đóng trên đỉnh `lookback` nến trước | dưới đáy | `lookback` |
| `pattern` | engulfing / pin bar / inside bar breakout tăng | giảm | `patterns` |
| `volume_spike` | volume ≥ `mult` × TB `period` nến, nến xanh | nến đỏ | `period`, `mult` |
| `macd` | MACD trên signal, histogram tăng | dưới, giảm | `fast`, `slow`, `signal` |
| `level` | chạm vùng hỗ trợ | chạm vùng kháng cự | `levels: { XAUUSD: [{ from, to, kind, label }] }`, `toleranceAtr` |

Mọi điều kiện đều nhận `weight`, `required`, `tf` (xét ở khung khác, vd. xu hướng H4). SL: `atr` (`mult` × ATR) hoặc
`swing` (đỉnh / đáy `lookback` nến ± `bufferAtr` × ATR); TP theo `rr` (bội số rủi ro). Sửa xong: `npm run deploy`.

## Backtest

```bash
npm run backtest -- --days 60                                   # mọi chiến lược × mã
npm run backtest -- --strategy breakout-m15 --symbol XAUUSD --days 90 --levels entry,watch --json ket-qua.json
```
Dùng đúng bộ chấm điểm của Worker, mỗi bước chỉ thấy nến đã đóng (kể cả khung lớn), có áp cooldown. Một lệnh **thắng**
nếu chạm TP1 trước SL (cùng nến thì tính thua), kết quả theo R. In ra tỉ lệ thắng, R trung bình, tỉ lệ chạm TP cuối,
chuỗi thua dài nhất và 10 lệnh gần nhất. Vàng dùng `OANDA_TOKEN` trong biến môi trường nếu có, không thì Dukascopy.

## Phát triển

```bash
npm test             # unit test: chỉ báo, mẫu nến, quy tắc, chấm điểm, nguồn dữ liệu, cooldown, tin nhắn, backtest
npm run typecheck
npm run db:init:local && npm run dev    # chạy Worker trên máy; kích cron: curl "http://localhost:8787/__scheduled"
```
Biến cho `npm run dev` đặt trong `.dev.vars` (không commit), có thể trỏ `BINANCE_HOSTS`, `TELEGRAM_API`… tới server
giả lập để thử.

## Giới hạn gói Free (tham khảo)

Workers: 100.000 request / ngày, 10 ms CPU mỗi lần chạy (thời gian chờ mạng không tính). D1: 5 GB, 100.000 lần ghi /
ngày. Hệ thống này chạy 1.440 lần / ngày; mỗi lần chỉ lấy dữ liệu khi có nến mới đóng, ghi vài trăm dòng / ngày.
