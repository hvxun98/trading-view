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

## Tính năng hiện có

- Nến + volume, crosshair, legend OHLC, dark theme giống TradingView
- Khung thời gian 1m, 5m, 15m, 1H, 4H, 1D, 3D, 1W, 1M; tìm/đổi symbol, watchlist realtime
- Thanh công cụ vẽ bên trái: trend line, ray, đường ngang/dọc, hình chữ nhật, Fibonacci
- Kéo thả hình vẽ: kéo thân để di chuyển, kéo điểm neo để sửa; thanh công cụ nổi (Clone / Xoá), menu chuột phải trên hình
- Object Tree (panel phải): danh sách hình vẽ, click để chọn, xoá từng hình hoặc xoá tất cả
- Indicator RSI (14) trong pane riêng, vùng 30–70 như TradingView
- Đảo ngược thang giá (Invert scale)
- Tự lưu symbol, khung thời gian, hình vẽ, indicator vào localStorage
- Kéo sang trái để tải thêm lịch sử, nút `»` cuộn về nến mới nhất
- Reset chart view: nút trên toolbar, chuột phải trên chart, hoặc `Alt + R`
- Bar Replay: click chọn nến (hoặc nhập ngày, tự tải lịch sử cũ), Play/Pause, Step, tốc độ 0.5x–10x
- Tự chuyển sang dữ liệu Demo nếu không kết nối được Binance

## Phím tắt

| Phím | Chức năng |
|---|---|
| `Alt + R` | Đặt lại chế độ xem biểu đồ |
| `Alt + I` | Đảo ngược thang giá |
| `Alt + T` / `Alt + H` / `Alt + V` / `Alt + F` | Trend line / đường ngang / đường dọc / Fibonacci |
| `Delete` | Xoá hình vẽ đang chọn |
| `Shift + ↓` | Replay: Play / Pause |
| `Shift + →` | Replay: tiến 1 nến |
| `Esc` | Huỷ: chọn điểm replay → công cụ vẽ → hình đang chọn |
