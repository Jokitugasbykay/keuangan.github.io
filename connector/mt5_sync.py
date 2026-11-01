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

def mask_login(login):
    s = str(login)
    if len(s) <= 3:
        return "***"
    return s[:3] + "****"

def sync_with_mock_data():
    print("[INFO] Menjalankan sinkronisasi dengan data simulasi MT5...")
    # Do not hardcode real account numbers in source control
    payload = {
        "broker": "Exness (SC) Ltd",
        "login": "108****",
        "server": "Exness-Real20",
        "currency": "USD",
        "leverage": 500,
        "balance": 2450.00,
        "equity": 2580.50,
        "floating_profit": 130.50,
        "margin": 45.00,
        "free_margin": 2535.50,
        "margin_level": 5734.4,
        "positions": [
            {
                "id": "pos-live-1",
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
                "id": "pos-live-2",
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
                "id": "deal-live-1",
                "trading_account_id": "ta-001",
                "external_deal_id": "98471203",
                "symbol": "XAUUSD",
                "deal_type": "buy",
                "volume": 0.05,
                "price": 2722.50,
                "profit": 110.00,
                "commission": -1.75,
                "swap": 0,
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

    positions = mt5.positions_get()
    parsed_positions = []
    if positions:
        for pos in positions:
            parsed_positions.append({
                "id": f"pos-{pos.ticket}",
                "symbol": pos.symbol,
                "type": "BUY" if pos.type == 0 else "SELL",
                "volume": float(pos.volume),
                "open_price": float(pos.price_open),
                "current_price": float(pos.price_current),
                "sl": float(pos.sl),
                "tp": float(pos.tp),
                "profit": float(pos.profit),
                "open_time": datetime.fromtimestamp(pos.time).isoformat()
            })

    from_date = datetime.now().timestamp() - (30 * 86400)
    deals = mt5.history_deals_get(from_date, datetime.now().timestamp())
    parsed_deals = []
    if deals:
        for deal in deals[-30:]:
            parsed_deals.append({
                "id": f"deal-{deal.ticket}",
                "trading_account_id": "ta-001",
                "external_deal_id": str(deal.ticket),
                "symbol": deal.symbol,
                "deal_type": "buy" if deal.type == 0 else "sell",
                "volume": float(deal.volume),
                "price": float(deal.price),
                "profit": float(deal.profit),
                "commission": float(deal.commission),
                "swap": float(deal.swap),
                "deal_time": datetime.fromtimestamp(deal.time).isoformat()
            })

    payload = {
        "broker": account_info.company,
        "login": mask_login(account_info.login),
        "server": account_info.server,
        "currency": account_info.currency,
        "leverage": account_info.leverage,
        "balance": float(account_info.balance),
        "equity": float(account_info.equity),
        "floating_profit": float(account_info.profit),
        "margin": float(account_info.margin),
        "free_margin": float(account_info.margin_free),
        "margin_level": float(account_info.margin_level) if account_info.margin > 0 else 0,
        "positions": parsed_positions,
        "deals": parsed_deals
    }

    mt5.shutdown()
    return send_payload(payload)

def send_payload(payload):
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(ENDPOINT, data=data, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode())
            print(f"[SUCCESS] Sinkronisasi berhasil terkirim ke Kayla Finance: {result}")
            return True
    except urllib.error.URLError as e:
        print(f"[ERROR] Gagal menghubungi backend ({ENDPOINT}): {e}")
        return False

if __name__ == "__main__":
    print("==================================================")
    print("Kayla Finance - MetaTrader 5 Connector")
    print("==================================================")
    if len(sys.argv) > 1 and sys.argv[1] == "--mock":
        sync_with_mock_data()
    else:
        sync_from_mt5()
