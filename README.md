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
- Khung thời gian 1m → 1W, tìm/đổi symbol, watchlist realtime
- Kéo sang trái để tải thêm lịch sử
- Bar Replay: chọn nến bắt đầu, Play/Pause/Step, tốc độ 0.5x–10x
- Tự chuyển sang dữ liệu Demo nếu không kết nối được Binance
