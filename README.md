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
- Đổi khung / symbol như TradingView: giữ nguyên độ zoom và vị trí đang xem, không trượt, không nháy trống
- Thanh công cụ vẽ bên trái chia nhóm có menu con (như TradingView): trend line, ray, đường ngang/dọc, hình chữ nhật, Fibonacci
- Thước đo (Measure / `Shift + click`): chênh lệch giá, %, tick, số nến, thời gian, volume
- Vị thế mua / bán (Long / Short Position): vùng chốt lời / cắt lỗ, kéo 4 điểm neo, giá theo tick
  - Settings (⚙ hoặc double-click): vốn, lot, rủi ro (% / USD), đòn bẩy, entry, mức chốt lời / cắt lỗ theo tick hoặc giá, Always show stats
  - Qty = min(Rủi ro / |Entry − Stop| / Lot, Vốn × Đòn bẩy / Entry / Lot); Amount = số dư tài khoản sau khi chạm Target / Stop (như TradingView)
  - Nhãn Target / Stop (kèm Amount), Open / Closed P&L theo giá thực tế (chạm entry → mở, chạm target/stop → đóng), Qty, Risk/Reward
- Văn bản & ghi chú: Text, Note (ghim, rê chuột để xem), Callout, Comment (bong bóng chú thích); double-click để sửa, đổi màu & cỡ chữ
- Kéo thả hình vẽ: kéo thân để di chuyển, kéo điểm neo để sửa (hình chữ nhật có 8 điểm neo)
- Thanh công cụ nổi: màu (bảng màu TradingView), độ dày 1–4px, kiểu nét liền/gạch/chấm, khoá, clone, xoá; menu chuột phải trên hình
- Khoá / ẩn từng hình hoặc tất cả hình vẽ; Undo / Redo
- Object Tree (panel phải): danh sách hình vẽ, click để chọn, ẩn / khoá / xoá từng hình hoặc xoá tất cả
- Indicator RSI (14) trong pane riêng, vùng 30–70 như TradingView
- Đảo ngược thang giá (Invert scale)
- Song ngữ **English / Tiếng Việt** (nút 🌐 góc phải toolbar): áp dụng cho toàn bộ giao diện, kể cả nhãn vẽ trên chart (vị thế, thước đo) và ngày tháng trên trục thời gian; mặc định theo ngôn ngữ trình duyệt
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
| `Shift + click` | Bắt đầu thước đo (click lần nữa để chốt, click tiếp / `Esc` để xoá) |
| `Delete` | Xoá hình vẽ đang chọn |
| `Ctrl + Z` / `Ctrl + Y` (`Ctrl + Shift + Z`) | Undo / Redo hình vẽ |
| `Shift + ↓` | Replay: Play / Pause |
| `Shift + →` | Replay: tiến 1 nến |
| `Esc` | Huỷ: chọn điểm replay → công cụ vẽ → hình đang chọn |
