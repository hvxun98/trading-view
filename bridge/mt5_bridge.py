"""
Bridge MetaTrader 5 -> HTTP cho TradingView Clone.

MT5 không có API web: dữ liệu chỉ đọc được từ terminal MT5 đang chạy (Windows) qua gói Python chính thức
`MetaTrader5`. Script này đọc nến / giá từ terminal rồi trả JSON cho app qua http://127.0.0.1:8765.

    pip install MetaTrader5
    python mt5_bridge.py                          # terminal MT5 đang mở và đã đăng nhập
    python mt5_bridge.py --map XAUUSD=XAUUSDm     # tên mã khác ở broker của bạn
    python mt5_bridge.py --utc-offset 3           # giờ server broker (GMT+3) nếu không tự nhận ra

Endpoint (chỉ đọc, chỉ nghe trên 127.0.0.1):
    GET /health
    GET /history?symbol=XAUUSD&interval=1h&limit=1000[&end=<unix giây UTC>]
        -> {"symbol": "XAUUSD", "digits": 2, "candles": [[time, open, high, low, close, volume], ...]}
    GET /ticker?symbols=XAUUSD,EURUSD
        -> [{"symbol": "XAUUSD", "last": 2345.6, "open": 2330.1}, ...]
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import MetaTrader5 as mt5

TIMEFRAMES = {
    "1m": mt5.TIMEFRAME_M1,
    "5m": mt5.TIMEFRAME_M5,
    "15m": mt5.TIMEFRAME_M15,
    "1h": mt5.TIMEFRAME_H1,
    "4h": mt5.TIMEFRAME_H4,
    "1d": mt5.TIMEFRAME_D1,
    "1w": mt5.TIMEFRAME_W1,
    "1M": mt5.TIMEFRAME_MN1,
}
# Nến ngày / tuần / tháng giữ nguyên ngày theo giờ server (như chart của broker), không đổi sang UTC
DAILY_OR_MORE = {"1d", "1w", "1M"}
MAX_LIMIT = 10000

# Tên thường gặp ở các broker (vd. GOLD thay cho XAUUSD)
ALIASES = {"XAUUSD": ["GOLD"], "XAGUSD": ["SILVER"], "XPTUSD": ["PLATINUM"], "XPDUSD": ["PALLADIUM"]}

lock = threading.Lock()  # gói MetaTrader5 không an toàn khi gọi đồng thời từ nhiều thread
symbol_map: dict[str, str] = {}
resolved: dict[str, str] = {}
fixed_offset: int | None = None  # giây, từ --utc-offset
detected_offset: int | None = None


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def resolve_symbol(name: str) -> str:
    """Tên mã phía broker: --map > trùng tên > GOLD/SILVER… > mã bắt đầu bằng tên (XAUUSDm, XAUUSD.r…)"""
    if name in resolved:
        return resolved[name]
    candidates = [symbol_map[name]] if name in symbol_map else [name, *ALIASES.get(name, [])]
    real = next((c for c in candidates if mt5.symbol_info(c) is not None), None)
    if real is None:
        for base in candidates:
            found = [s for s in (mt5.symbols_get(group=f"*{base}*") or ()) if s.name.upper().startswith(base)]
            if found:
                found.sort(key=lambda s: (not s.visible, len(s.name)))
                real = found[0].name
                break
    if real is None:
        raise ApiError(404, f"symbol {name} not found in MetaTrader 5 (use --map {name}=<broker symbol>)")
    mt5.symbol_select(real, True)  # thêm vào Market Watch để có tick
    resolved[name] = real
    return real


def server_offset(symbol: str) -> int:
    """
    Độ lệch giờ server broker so với UTC (giây). Thời gian nến / tick của MT5 là giờ server.
    Tự nhận ra từ tick mới nhất khi thị trường đang mở (tick khớp một mốc 30 phút ±60 giây).
    """
    global detected_offset
    if fixed_offset is not None:
        return fixed_offset
    tick = mt5.symbol_info_tick(symbol)
    if tick is not None and tick.time:
        diff = tick.time - time.time()
        candidate = round(diff / 1800) * 1800
        if abs(diff - candidate) <= 60 and abs(candidate) <= 14 * 3600:
            detected_offset = int(candidate)
    return detected_offset or 0


def rate_row(rate, shift: int) -> list:
    return [
        int(rate["time"]) - shift,
        float(rate["open"]),
        float(rate["high"]),
        float(rate["low"]),
        float(rate["close"]),
        float(rate["tick_volume"]),
    ]


def history(params: dict[str, str]) -> dict:
    name = params.get("symbol", "").upper()
    interval = params.get("interval", "1h")
    if interval not in TIMEFRAMES:
        raise ApiError(400, f"unsupported interval {interval}")
    try:
        limit = max(1, min(MAX_LIMIT, int(params.get("limit", "1000"))))
        end = int(params["end"]) if params.get("end") else None
    except ValueError:
        raise ApiError(400, "limit / end must be integers")

    real = resolve_symbol(name)
    shift = 0 if interval in DAILY_OR_MORE else server_offset(real)
    tf = TIMEFRAMES[interval]
    if end is None:
        rates = mt5.copy_rates_from_pos(real, tf, 0, limit)
    else:
        rates = mt5.copy_rates_from(real, tf, end + shift, limit)
    if rates is None:
        code, message = mt5.last_error()
        raise ApiError(502, f"MetaTrader 5: {message} ({code})")

    candles = [rate_row(r, shift) for r in rates]
    if end is not None:
        candles = [c for c in candles if c[0] <= end]
    info = mt5.symbol_info(real)
    return {"symbol": name, "brokerSymbol": real, "digits": info.digits if info else None, "candles": candles}


def tickers(params: dict[str, str]) -> list:
    rows = []
    for name in filter(None, params.get("symbols", "").upper().split(",")):
        try:
            real = resolve_symbol(name)
        except ApiError:
            continue
        tick = mt5.symbol_info_tick(real)
        day = mt5.copy_rates_from_pos(real, mt5.TIMEFRAME_D1, 0, 1)
        if tick is None or day is None or len(day) == 0:
            continue
        rows.append({"symbol": name, "last": float(tick.bid), "open": float(day[0]["open"])})
    return rows


def health(_params: dict[str, str]) -> dict:
    account = mt5.account_info()
    terminal = mt5.terminal_info()
    return {
        "ok": True,
        "company": getattr(account, "company", None) or getattr(terminal, "company", None),
        "server": getattr(account, "server", None),
        "connected": bool(getattr(terminal, "connected", False)),
    }


ROUTES = {"/health": health, "/history": history, "/ticker": tickers}


class Handler(BaseHTTPRequestHandler):
    allow_origin = "*"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", self.allow_origin)
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        # Trang https (vd. Vercel) gọi vào 127.0.0.1: Chrome hỏi quyền Private / Local Network Access
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _send(self, status: int, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        route = ROUTES.get(url.path)
        if route is None:
            return self._send(404, {"error": "not found"})
        params = {k: v[0] for k, v in parse_qs(url.query).items()}
        try:
            with lock:
                body = route(params)
            self._send(200, body)
        except ApiError as e:
            self._send(e.status, {"error": str(e)})
        except Exception as e:  # noqa: BLE001 — trả lỗi cho app thay vì làm sập bridge
            self._send(500, {"error": repr(e)})

    def log_message(self, fmt, *args):
        if "--verbose" in sys.argv:
            super().log_message(fmt, *args)


def main(argv: list[str] | None = None):
    global fixed_offset
    parser = argparse.ArgumentParser(description="MetaTrader 5 -> HTTP bridge for TradingView Clone")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--allow-origin", default="*", help="CORS origin được phép, vd. https://your-app.vercel.app")
    parser.add_argument("--map", action="append", default=[], metavar="APP=BROKER", help="vd. XAUUSD=XAUUSDm")
    parser.add_argument("--utc-offset", type=float, help="giờ server broker so với UTC, vd. 2 hoặc 3")
    parser.add_argument("--path", help="đường dẫn terminal64.exe (nếu có nhiều bản MT5)")
    parser.add_argument("--login", type=int)
    parser.add_argument("--password")
    parser.add_argument("--server")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    for item in args.map:
        app, _, broker = item.partition("=")
        if not broker:
            parser.error(f"--map {item}: cần dạng APP=BROKER")
        symbol_map[app.upper()] = broker
    if args.utc_offset is not None:
        fixed_offset = int(args.utc_offset * 3600)

    init = {k: v for k, v in {"path": args.path, "login": args.login, "password": args.password,
                               "server": args.server}.items() if v is not None}
    if not mt5.initialize(**init):
        sys.exit(f"Không kết nối được MetaTrader 5: {mt5.last_error()}. Hãy mở terminal MT5 và đăng nhập.")

    Handler.allow_origin = args.allow_origin
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    info = health({})
    print(f"MT5 bridge: http://{args.host}:{args.port}  ({info['company']} · {info['server']})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
