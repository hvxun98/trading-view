# TradingView Clone

Web app xem biểu đồ nến giống TradingView, xây trên
[lightweight-charts](https://github.com/tradingview/lightweight-charts) (thư viện mã nguồn mở của TradingView),
React, TypeScript và Vite. Dữ liệu realtime từ Binance public API.

Xem ý tưởng, kiến trúc và lộ trình tại [docs/PLAN.md](docs/PLAN.md).

## Chạy dự án

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + build production
npm run lint     # oxlint
```

## Deploy lên Vercel

Có sẵn `vercel.json` (preset Vite, output `dist`). Trên Vercel không có proxy của Vite, nên hai Vercel Function làm thay:

- `api/dukascopy.ts`: `/api/dukascopy?...` → `freeserv.dukascopy.com/2.0/index.php?...` (gắn `Referer`)
- `api/oanda.ts`: `/api/oanda/{practice,live}/v3/...` → OANDA v20 (chỉ chuyển tiếp header `Authorization`, không lưu token)

Cách 1: trên vercel.com → *Add New… → Project* → import repo GitHub, nhánh production `main` (mỗi lần push `main` tự deploy).
Cách 2: CLI

```bash
npx vercel deploy --prod --token <VERCEL_TOKEN>
```

## Dữ liệu forex & kim loại (XAUUSD…)

Mặc định lấy từ **Dukascopy Bank** (ngân hàng Thuỵ Sĩ, sàn ECN): nến spot BID cho XAU/USD, XAG/USD, XPT, XPD và các cặp forex chính,
không cần đăng ký. Endpoint là JSONP của widget chart `freeserv.dukascopy.com/2.0/index.php?path=chart/json3`, yêu cầu header `Referer`
nên đi qua proxy `/api/dukascopy` trong `vite.config.ts`. Nến cuối cập nhật mỗi 2 giây.

### Tuỳ chọn: MetaTrader 5

Lấy nến XAUUSD / forex từ terminal MT5 của broker bạn đang dùng, qua bridge Python chạy trên máy Windows có MT5
(`bridge/mt5_bridge.py`, gói `MetaTrader5` chính thức). Xem hướng dẫn tại [bridge/README.md](bridge/README.md).
Khi bật, MT5 được ưu tiên trước OANDA và Dukascopy.

### Tuỳ chọn: OANDA

1. Tạo tài khoản demo miễn phí (fxTrade Practice) tại oanda.com, vào *Manage API Access* để tạo **API token**.
2. Trong app: nút ⚙ **Nguồn dữ liệu** (góc phải toolbar) → chọn *Demo (practice)* → dán token → *Kiểm tra kết nối* → *Lưu*.
3. OANDA không cho gọi API trực tiếp từ trình duyệt (CORS), nên request đi qua proxy của Vite
   (`/api/oanda/practice` → `api-fxpractice.oanda.com`, `/api/oanda/live` → `api-fxtrade.oanda.com`, cấu hình trong `vite.config.ts`).
   Proxy có sẵn khi chạy `npm run dev` hoặc `npm run preview`; trên Vercel do Vercel Functions trong `api/` đảm nhận.

Token chỉ được lưu trong localStorage của trình duyệt.

## Tính năng hiện có

- **Nhiều biểu đồ** (nút bố cục ở góc phải toolbar): 1, 2 cột, 2 hàng, 3 cột, 1 lớn + 2 nhỏ, 2×2. Mỗi biểu đồ có
  mã, khung thời gian, hình vẽ, công cụ vẽ, khoá / ẩn, undo / redo, RSI, đảo thang, replay và nguồn dữ liệu **riêng**.
  Bấm vào biểu đồ để chọn (viền xanh): toolbar, thanh công cụ vẽ, Object Tree, Watchlist và phím tắt áp dụng cho biểu đồ đó.
  Bố cục và trạng thái từng biểu đồ được lưu trong trình duyệt
- Nến + volume, crosshair, legend OHLC, dark theme giống TradingView
- Khung thời gian 1m, 5m, 15m, 1H, 4H, 1D, 3D, 1W, 1M
- Tìm mã như TradingView (bấm tên mã hoặc gõ chữ bất kỳ trên chart): tab Tất cả / Crypto / Forex / Hàng hoá, toàn bộ cặp Binance + forex & kim loại OANDA
- Watchlist: nút **+** thêm mã, **×** xoá mã, giá realtime (Binance WebSocket, OANDA hỏi định kỳ), lưu trong trình duyệt
- **XAUUSD, XAGUSD, EURUSD…** (giá spot, BID) từ **Dukascopy Bank** — miễn phí, không cần key; có token OANDA v20 thì ưu tiên OANDA
- Đổi khung / symbol như TradingView: giữ nguyên độ zoom và vị trí đang xem, không trượt, không nháy trống
- Thanh công cụ vẽ bên trái chia nhóm có menu con (như TradingView): trend line, ray, đường ngang/dọc, hình chữ nhật, Fibonacci
- Thước đo (Measure / `Shift + click`): chênh lệch giá, %, tick, số nến, thời gian, volume
- Vị thế mua / bán (Long / Short Position): vùng chốt lời / cắt lỗ, kéo 4 điểm neo, giá theo tick
  - Settings (⚙ hoặc double-click): vốn, lot, rủi ro (% / USD), đòn bẩy, entry, mức chốt lời / cắt lỗ theo tick hoặc giá, Always show stats
  - S.Lg (Qty) = Rủi ro / |Entry − Stop| / Lot (nếu đặt đòn bẩy: tối đa Vốn × Đòn bẩy / Entry / Lot); Giá trị (Amount) = số dư tài khoản sau khi chạm Target / Stop
  - Nhãn trên công cụ hiện khoảng cách tới entry như TradingView (`Mục tiêu: 287.46 (0.991%) 28,746, Giá trị: 1500`); giá Target / Entry / Stop được đối chiếu sang thanh giá
- Hình đang chọn / rê chuột: nhãn giá & thời gian của các điểm neo trên 2 trục kèm dải tô phạm vi
  - Nhãn Target / Stop (kèm Amount), Open / Closed P&L theo giá thực tế (chạm entry → mở, chạm target/stop → đóng), Qty, Risk/Reward
- Văn bản & ghi chú: Text, Note (ghim, rê chuột để xem), Callout, Comment (bong bóng chú thích); double-click để sửa, đổi màu & cỡ chữ
- Kéo thả hình vẽ: kéo thân để di chuyển, kéo điểm neo để sửa (hình chữ nhật có 8 điểm neo)
- Thanh công cụ nổi: màu (bảng màu TradingView), độ dày 1–4px, kiểu nét liền/gạch/chấm, khoá, clone, xoá; menu chuột phải trên hình
- Khoá / ẩn từng hình hoặc tất cả hình vẽ; Undo / Redo
- Object Tree (panel phải): danh sách hình vẽ, click để chọn, ẩn / khoá / xoá từng hình hoặc xoá tất cả
- Indicator RSI (14) trong pane riêng, vùng 30–70 như TradingView
- Đảo ngược thang giá (Invert scale) — áp dụng cho cả pane RSI
- Giá realtime trên tiêu đề tab trình duyệt: `XAUUSD 2345.67 ▲ +0.45%`
- Song ngữ **English / Tiếng Việt** (nút 🌐 góc phải toolbar): áp dụng cho toàn bộ giao diện, kể cả nhãn vẽ trên chart (vị thế, thước đo) và ngày tháng trên trục thời gian; mặc định theo ngôn ngữ trình duyệt
- Tự lưu symbol, khung thời gian, hình vẽ, indicator vào localStorage
- Kéo sang trái để tải thêm lịch sử, nút `»` cuộn về nến mới nhất
- Reset chart view: nút trên toolbar, chuột phải trên chart, hoặc `Alt + R`
- Bar Replay: click chọn nến (hoặc nhập ngày, tự tải lịch sử cũ), Play/Pause, Step, tốc độ 0.5x–10x
- Mất kết nối: Binance tự chuyển sang máy chủ dự phòng (`data-api.binance.vision`, `api-gcp.binance.com`); nếu vẫn lỗi thì tạm hiện Demo (legend ghi *Demo · đang kết nối lại…*) và tự thử lại, có dữ liệu thật là thay vào ngay

## Phím tắt

Áp dụng cho biểu đồ đang chọn.

| Phím | Chức năng |
|---|---|
| `Alt + R` | Đặt lại chế độ xem biểu đồ |
| `Alt + I` | Đảo ngược thang giá |
| `Alt + T` / `Alt + H` / `Alt + V` / `Alt + F` | Trend line / đường ngang / đường dọc / Fibonacci |
| `Shift + click` | Bắt đầu thước đo (click lần nữa để chốt, click tiếp / `Esc` để xoá) |
| `Delete` | Xoá hình vẽ đang chọn |
| `Ctrl + Z` / `Ctrl + Y` (`Ctrl + Shift + Z`) | Undo / Redo hình vẽ |
| `Shift + ↓` | Replay: Play / Pause |
| `Shift + →` | Replay: tiến 1 nến |
| `Esc` | Huỷ: chọn điểm replay → công cụ vẽ → hình đang chọn |
