# Bridge MetaTrader 5

MetaTrader 5 không có API web; nến và giá chỉ đọc được từ **terminal MT5 đang chạy** qua gói Python chính thức
[`MetaTrader5`](https://pypi.org/project/MetaTrader5/) (chỉ có trên **Windows**). `mt5_bridge.py` đọc dữ liệu từ terminal
rồi trả JSON cho app qua `http://127.0.0.1:8765`.

## Chạy

1. Mở MetaTrader 5 và đăng nhập tài khoản (demo hay thật đều được) ở broker của bạn.
2. Cài Python 3.8+ cho Windows, rồi:

   ```bash
   cd bridge
   pip install -r requirements.txt
   python mt5_bridge.py
   ```

   Thấy dòng `MT5 bridge: http://127.0.0.1:8765  (<broker> · <server>)` là xong.
3. Trong app: ⚙ **Nguồn dữ liệu** → tick **Dùng bridge MetaTrader 5** → *Kiểm tra kết nối* → *Lưu*.
   XAUUSD, XAGUSD và các cặp forex sẽ lấy từ MT5 (legend ghi `MT5`); crypto vẫn từ Binance.

## Tuỳ chọn

| Tham số | Ý nghĩa |
| --- | --- |
| `--map XAUUSD=XAUUSDm` | Tên mã ở broker khác tên trong app. Không cần nếu tên bắt đầu bằng `XAUUSD` (`XAUUSDm`, `XAUUSD.r`…) hoặc là `GOLD` / `SILVER` — bridge tự tìm |
| `--utc-offset 3` | Giờ server của broker (vd. GMT+3). Mặc định tự nhận ra từ tick mới nhất khi thị trường đang mở |
| `--allow-origin https://your-app.vercel.app` | Chỉ cho trang này đọc dữ liệu (mặc định `*`) |
| `--port 8765` | Cổng HTTP |
| `--path`, `--login`, `--password`, `--server` | Chọn terminal / tài khoản khi khởi động (mặc định dùng terminal đang mở) |

## Ghi chú

- Nến lấy theo giá **BID** như chart của MT5. Nến trong ngày được đổi sang UTC; nến ngày / tuần / tháng giữ ngày theo giờ server
  của broker (giống chart MT5 và TradingView khi xem mã của broker).
- 3D được app gộp từ nến ngày.
- Bridge chỉ nghe trên `127.0.0.1` và chỉ đọc dữ liệu thị trường, không đặt lệnh.
- Dùng với bản deploy (vd. Vercel): trang `https://…` vẫn gọi được `http://127.0.0.1:8765` trên Chrome / Edge; trình duyệt có thể
  hỏi quyền truy cập mạng cục bộ — chọn *Cho phép*. Safari chặn kiểu gọi này, hãy dùng Chrome / Edge.
