"""
MT5 Python Connector for Kayla Finance
Sesuai PRD Section 5.4 - Read-only MT5 sync
"""

import sys
import json
import time
from datetime import datetime
import urllib.request
import urllib.error
import os

ENDPOINT = os.environ.get("MT5_SYNC_ENDPOINT", "http://localhost:3000/api/trading/sync")
SYNC_KEY = os.environ.get("MT5_SYNC_KEY", "kayla-finance-mt5-dev-sync-key")

def mask_login(login):
    s = str(login)
    if len(s) <= 3:
        return "***"
    return s[:3] + "****"

def sync_with_mock_data():
    print("[INFO] Menjalankan sinkronisasi dengan data simulasi MT5...")
    # Standarisasi format open positions dan closed deals:
    # { ticket, symbol, type, volume, open_price, current_price, sl, tp, profit }
    payload = {
        "broker": "Exness (SC) Ltd",
        "login": "108****",
        "server": "Exness-Real20",
        "currency": "USD",
        "leverage": 500,
        "balance": 1500.00,
        "equity": 2580.50,
        "floating_profit": 130.50,
        "margin": 45.00,
        "free_margin": 2535.50,
        "margin_level": 5734.4,
        "positions": [
            {
                "id": "pos-101",
                "ticket": 101,
                "symbol": "XAUUSD",
                "type": "BUY",
                "volume": 0.05,
                "open_price": 2735.40,
                "current_price": 2752.40,
                "sl": 2728.00,
                "tp": 2765.00,
                "profit": 85.00,
                "open_time": datetime.now().isoformat()
            },
            {
                "id": "pos-102",
                "ticket": 102,
                "symbol": "EURUSD",
                "type": "SELL",
                "volume": 0.10,
                "open_price": 1.0825,
                "current_price": 1.0780,
                "sl": 1.0860,
                "tp": 1.0740,
                "profit": 45.50,
                "open_time": datetime.now().isoformat()
            }
        ],
        "deals": [
            {
                "id": "deal-98471203",
                "ticket": 98471203,
                "trading_account_id": "ta-001",
                "external_deal_id": "98471203",
                "symbol": "XAUUSD",
                "deal_type": "buy",
                "type": "buy",
                "volume": 0.05,
                "price": 2722.50,
                "open_price": 2722.50,
                "current_price": 2722.50,
                "sl": 0.0,
                "tp": 0.0,
                "profit": 110.00,
                "commission": -1.75,
                "swap": 0.0,
                "deal_time": datetime.now().isoformat()
            }
        ]
    }
    return send_payload(payload)

def sync_from_mt5():
    try:
        import MetaTrader5 as mt5
    except ImportError:
        print("[WARNING] Library MetaTrader5 belum terpasang. Jalankan: pip install MetaTrader5")
        print("[INFO] Mengalihkan ke mode simulasi (mock sync)...")
        return sync_with_mock_data()

    if not mt5.initialize():
        print(f"[ERROR] Gagal inisialisasi MT5 terminal: {mt5.last_error()}")
        print("[INFO] Pastikan aplikasi MetaTrader 5 sedang terbuka di komputer.")
        print("[INFO] Mengalihkan ke mode simulasi (mock sync)...")
        return sync_with_mock_data()

    account_info = mt5.account_info()
    if account_info is None:
        print("[ERROR] Gagal mengambil informasi akun MT5.")
        mt5.shutdown()
        return False

    # Null-safety untuk posisi terbuka
    positions = None
    try:
        positions = mt5.positions_get()
    except Exception as e:
        print(f"[WARNING] Gagal mengambil posisi terbuka MT5: {e}")

    parsed_positions = []
    if positions is not None and len(positions) > 0:
        for pos in positions:
            try:
                ticket = getattr(pos, 'ticket', 0)
                parsed_positions.append({
                    "id": f"pos-{ticket}",
                    "ticket": ticket,
                    "symbol": getattr(pos, 'symbol', ''),
                    "type": "BUY" if getattr(pos, 'type', 0) == 0 else "SELL",
                    "volume": float(getattr(pos, 'volume', 0.0)),
                    "open_price": float(getattr(pos, 'price_open', 0.0)),
                    "current_price": float(getattr(pos, 'price_current', 0.0)),
                    "sl": float(getattr(pos, 'sl', 0.0)),
                    "tp": float(getattr(pos, 'tp', 0.0)),
                    "profit": float(getattr(pos, 'profit', 0.0)),
                    "open_time": datetime.fromtimestamp(getattr(pos, 'time', 0)).isoformat() if getattr(pos, 'time', 0) else datetime.now().isoformat()
                })
            except Exception as e:
                print(f"[WARNING] Gagal memproses data posisi {getattr(pos, 'ticket', 'unknown')}: {e}")

    # Null-safety untuk riwayat deals
    from_date = datetime.now().timestamp() - (30 * 86400)
    deals = None
    try:
        deals = mt5.history_deals_get(from_date, datetime.now().timestamp())
    except Exception as e:
        print(f"[WARNING] Gagal mengambil riwayat deals MT5: {e}")

    parsed_deals = []
    if deals is not None and len(deals) > 0:
        for deal in deals[-30:]:
            try:
                ticket = getattr(deal, 'ticket', 0)
                deal_type = "buy" if getattr(deal, 'type', 0) == 0 else "sell"
                deal_price = float(getattr(deal, 'price', 0.0))
                parsed_deals.append({
                    "id": f"deal-{ticket}",
                    "ticket": ticket,
                    "trading_account_id": "ta-001",
                    "external_deal_id": str(ticket),
                    "symbol": getattr(deal, 'symbol', ''),
                    "deal_type": deal_type,
                    "type": deal_type,
                    "volume": float(getattr(deal, 'volume', 0.0)),
                    "price": deal_price,
                    "open_price": deal_price,
                    "current_price": deal_price,
                    "sl": 0.0,
                    "tp": 0.0,
                    "profit": float(getattr(deal, 'profit', 0.0)),
                    "commission": float(getattr(deal, 'commission', 0.0)),
                    "swap": float(getattr(deal, 'swap', 0.0)),
                    "deal_time": datetime.fromtimestamp(getattr(deal, 'time', 0)).isoformat() if getattr(deal, 'time', 0) else datetime.now().isoformat()
                })
            except Exception as e:
                print(f"[WARNING] Gagal memproses data deal {getattr(deal, 'ticket', 'unknown')}: {e}")

    margin_val = float(account_info.margin)
    payload = {
        "broker": account_info.company,
        "login": mask_login(account_info.login),
        "server": account_info.server,
        "currency": account_info.currency,
        "leverage": account_info.leverage,
        "balance": float(account_info.balance),
        "equity": float(account_info.equity),
        "floating_profit": float(account_info.profit),
        "margin": margin_val,
        "free_margin": float(account_info.margin_free),
        "margin_level": float(account_info.margin_level) if margin_val > 0 else 0,
        "positions": parsed_positions,
        "deals": parsed_deals
    }

    mt5.shutdown()
    return send_payload(payload)

def send_payload(payload):
    data = json.dumps(payload).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'X-MT5-Sync-Key': SYNC_KEY,
        'User-Agent': 'KaylaFinance-MT5Connector/1.0'
    }
    req = urllib.request.Request(ENDPOINT, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode())
            print(f"[SUCCESS] Sinkronisasi berhasil terkirim ke Kayla Finance: {result}")
            return True
    except urllib.error.HTTPError as e:
        error_body = ""
        try:
            error_body = e.read().decode()
        except Exception:
            pass
        print(f"[ERROR] HTTP Error {e.code} ({e.reason}) dari backend ({ENDPOINT}): {error_body}")
        return False
    except urllib.error.URLError as e:
        print(f"[ERROR] Gagal menghubungi backend ({ENDPOINT}): {e.reason}")
        return False

if __name__ == "__main__":
    print("==================================================")
    print("Kayla Finance - MetaTrader 5 Connector")
    print("==================================================")
    if len(sys.argv) > 1 and sys.argv[1] == "--mock":
        sync_with_mock_data()
    else:
        sync_from_mt5()
