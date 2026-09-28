# TradingView Clone — Ý tưởng & Công nghệ

## 1. Mục tiêu

Xây dựng một web app xem biểu đồ nến giống TradingView **~90–95%** về giao diện và trải nghiệm:
nến + volume, crosshair, legend OHLC, zoom/kéo mượt, đổi symbol/khung thời gian, dữ liệu realtime,
và **Bar Replay** (xem lại thị trường từng nến như chế độ Replay của TradingView).

## 2. Lựa chọn công nghệ

| Hạng mục | Công nghệ | Lý do |
|---|---|---|
| Chart engine | **[lightweight-charts](https://github.com/tradingview/lightweight-charts) v5** | Thư viện mã nguồn mở (Apache-2.0) **do chính TradingView phát triển** → render canvas, price/time scale, crosshair, zoom/pan giống hệt bản gốc. Đây là cách nhanh nhất để đạt 9x%. |
| Framework | **React 19 + TypeScript** | Hệ sinh thái lớn, dễ tách component (toolbar, watchlist, legend, panel). |
| Build tool | **Vite** | Dev server nhanh, HMR, cấu hình tối thiểu. |
| State | **Zustand** | Nhẹ, không boilerplate; chart đọc state mà không re-render cả cây. |
| Dữ liệu | **Binance public API** (REST `klines` + WebSocket `kline`/`miniTicker`) | Miễn phí, không cần API key, có realtime, lịch sử dài. Tự fallback sang dữ liệu Demo nếu bị chặn. |
| Lint | **oxlint** | Nhanh, đi kèm template Vite. |

### Vì sao không dùng TradingView "Charting Library" / "Advanced Charts"?
Bản đó giống 100% nhưng **không phải open source**, phải xin license từ TradingView. Lightweight Charts
là lựa chọn hợp pháp và miễn phí; phần còn thiếu (công cụ vẽ, indicator, multi-pane…) ta tự xây trên đó.

### Tuỳ chọn cho giai đoạn sau
- **Backend** (khi cần lưu layout, watchlist, alert, hoặc thêm nguồn dữ liệu chứng khoán VN):
  Node.js (Fastify/NestJS) hoặc Go + PostgreSQL/TimescaleDB + Redis; proxy dữ liệu qua một
  "Datafeed" thống nhất.
- **Chỉ báo kỹ thuật**: tự viết (MA/EMA/BB/RSI/MACD đơn giản) hoặc dùng `technicalindicators`.
- **Test**: Vitest (logic data/indicator) + Playwright (E2E, screenshot so sánh UI).

## 3. Kiến trúc

```
src/
├── types.ts               # Candle, Interval, DataFeed interface
├── data/
│   ├── binance.ts         # DataFeed Binance: REST lịch sử + WebSocket realtime (auto reconnect)
│   └── mock.ts            # DataFeed giả lập (offline / bị chặn mạng)
├── store/useChartStore.ts # symbol, interval, trạng thái replay
├── lib/                   # theme màu TradingView, intervals, format giá/volume
└── components/
    ├── Chart.tsx          # Khởi tạo chart, nạp dữ liệu, lazy-load lịch sử, replay
    ├── Legend.tsx         # Dòng OHLC / % thay đổi / Vol theo crosshair
    ├── TopToolbar.tsx     # Tìm symbol, chọn khung thời gian, nút Replay
    ├── ReplayBar.tsx      # Play/Pause, Step, tốc độ, thoát
    └── Watchlist.tsx      # Danh sách mã + giá realtime
```

**`DataFeed` interface** (`getHistory` + `subscribeBars`) mô phỏng Datafeed API của TradingView,
nên có thể thêm nguồn mới (sàn khác, chứng khoán VN, server riêng) mà không động vào chart.

## 4. Chức năng

### ✅ Giai đoạn 1 — MVP (đã có trong commit khởi tạo)
- Biểu đồ nến + volume, màu & dark theme giống TradingView
- Crosshair, legend OHLC + thay đổi so với nến trước + volume
- Khung thời gian: 1m, 5m, 15m, 1H, 4H, 1D, 1W
- Tìm/đổi symbol (bất kỳ cặp Binance nào, gõ + Enter)
- Realtime qua WebSocket, tự reconnect
- Kéo sang trái → tự tải thêm lịch sử (infinite scroll)
- **Bar Replay**: chọn nến bắt đầu (click hoặc nhập ngày) → Play/Pause, Step, tốc độ 0.5x–10x, phím tắt
- **Reset chart view** (toolbar, menu chuột phải, `Alt + R`) và nút `»` cuộn về realtime
- Khung 3D và 1M
- **Thanh công cụ vẽ** (Primitives API): trend line, ray, đường ngang/dọc, rectangle, Fibonacci retracement; chọn/xoá; lưu theo symbol
- **Kéo thả hình vẽ** (di chuyển theo nến, sửa điểm neo), thanh công cụ nổi, menu chuột phải, **Object Tree**
- **Style hình vẽ** (màu/độ dày/kiểu nét), **khoá/ẩn** từng hình & tất cả, **Undo/Redo**, rectangle 8 điểm neo
- **Measure**, **Long/Short Position**, **Text / Note / Callout / Comment**; thanh công cụ trái chia nhóm có menu con
- Settings vị thế (vốn, lot, rủi ro, đòn bẩy) + P&L theo giá thực tế
- Tìm mã / thêm mã vào Watchlist như TradingView; nguồn OANDA (XAUUSD, forex) + Binance
- **Song ngữ EN / VI** (i18n có kiểm tra kiểu: thiếu bản dịch là lỗi biên dịch)
- **RSI (14)** trong pane riêng (RMA như `ta.rsi` của TradingView), cập nhật cả khi realtime & replay
- **Invert scale** (`Alt + I`)
- Watchlist với giá & % thay đổi 24h realtime
- Fallback dữ liệu Demo khi không kết nối được Binance

### Giai đoạn 2 — Giống TradingView hơn
- Kiểu biểu đồ: Bars, Line, Area, Heikin Ashi, Hollow candles
- Indicator overlay (MA, EMA, Bollinger) và pane riêng (MACD, Stoch); tuỳ chỉnh tham số indicator
- Hình vẽ: magnet mode, nhớ style cuối cùng cho mỗi công cụ, thêm công cụ (Parallel Channel, Pitchfork, Brush, Date/Price Range)
- Vị thế: tab Style (màu vùng lời/lỗ), lưu settings làm mặc định cho vị thế mới
- Replay nâng cao: replay trên khung nhỏ hơn, lùi nến (step back)
- Thang log / %, auto-scale, nút "scroll to realtime", đổi timezone
- Light theme, lưu cài đặt vào localStorage

### Giai đoạn 3 — Sản phẩm hoàn chỉnh
- Đăng nhập, lưu layout / hình vẽ / watchlist lên server
- Multi-chart layout (2, 4 chart), đồng bộ crosshair
- Price alert, thông báo
- Nguồn dữ liệu chứng khoán Việt Nam qua backend proxy
- Paper trading (lệnh giả lập trên replay)

## 5. Mẹo để đạt "9x% giống"
- Luôn dùng đúng bảng màu: nền `#131722`, tăng `#089981`, giảm `#f23645`, lưới `#1f2330`, viền `#2a2e39`.
- Font chữ: `-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif`, size 12–13px.
- Toolbar cao 38px, ngăn cách bằng viền 4px `#2a2e39` như bản gốc.
- Dùng Playwright chụp screenshot song song với TradingView để so sánh từng chi tiết.
