import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getDatabase, saveDatabase, withDbLock, sanitizeError } from '@/lib/db';
import { requireServerAuth, isStaticDemoEnvironment } from '@/lib/auth';

/**
 * @typedef {import('@/lib/types').TradingAccount} TradingAccount
 * @typedef {import('@/lib/types').TradingPosition} TradingPosition
 * @typedef {import('@/lib/types').TradingDeal} TradingDeal
 */

/** Kunci preshared default untuk sinkronisasi MT5 lokal saat pengujian */
const DEFAULT_MT5_SYNC_KEY = 'kayla-finance-mt5-dev-sync-key';

/**
 * Validasi otentikasi Machine-to-Machine (M2M) menggunakan perbandingan timing-safe.
 * @param {string} incomingKey
 * @param {string} configuredKey
 * @returns {boolean}
 */
function verifyM2MSyncKey(incomingKey, configuredKey) {
  if (!incomingKey || !configuredKey) return false;
  const a = Buffer.from(String(incomingKey).trim());
  const b = Buffer.from(String(configuredKey).trim());
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Menstandarkan dan memvalidasi skema posisi trading terbuka (open positions)
 * Format standar: { ticket, symbol, type, volume, open_price, current_price, sl, tp, profit }
 * @param {any[]} rawPositions
 * @returns {TradingPosition[]}
 */
function sanitizePositions(rawPositions) {
  if (!Array.isArray(rawPositions)) return [];
  return rawPositions
    .map((pos, idx) => {
      if (!pos || typeof pos !== 'object') return null;
      const rawTicket = pos.ticket ?? (pos.id ? String(pos.id).replace('pos-', '') : idx + 1);
      const ticket = typeof rawTicket === 'number' ? rawTicket : String(rawTicket);
      const id = pos.id || `pos-${ticket}`;
      const type = String(pos.type || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
      return {
        id: String(id),
        ticket,
        symbol: String(pos.symbol || 'UNKNOWN').toUpperCase(),
        type,
        volume: Number(pos.volume) || 0,
        open_price: Number(pos.open_price) || 0,
        current_price: Number(pos.current_price ?? pos.open_price) || 0,
        sl: Number(pos.sl) || 0,
        tp: Number(pos.tp) || 0,
        profit: Number(pos.profit) || 0,
        open_time: pos.open_time || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

/**
 * Menstandarkan dan memvalidasi skema deals riwayat trading (closed deals)
 * Format standar: { ticket, symbol, type, volume, open_price, current_price, sl, tp, profit }
 * @param {any[]} rawDeals
 * @returns {TradingDeal[]}
 */
function sanitizeDeals(rawDeals) {
  if (!Array.isArray(rawDeals)) return [];
  return rawDeals
    .map((deal, idx) => {
      if (!deal || typeof deal !== 'object') return null;
      const rawTicket = deal.ticket ?? deal.external_deal_id ?? (deal.id ? String(deal.id).replace('deal-', '') : idx + 1);
      const ticket = typeof rawTicket === 'number' ? rawTicket : String(rawTicket);
      const id = deal.id || `deal-${ticket}`;
      const rawType = String(deal.deal_type || deal.type || 'buy').toLowerCase();
      const type = rawType.includes('sell') ? 'sell' : 'buy';
      const openPrice = Number(deal.open_price ?? deal.price) || 0;
      const currentPrice = Number(deal.current_price ?? deal.price ?? openPrice) || 0;
      return {
        id: String(id),
        ticket,
        trading_account_id: String(deal.trading_account_id || 'ta-001'),
        external_deal_id: String(deal.external_deal_id || ticket),
        symbol: String(deal.symbol || 'UNKNOWN').toUpperCase(),
        deal_type: type,
        type,
        volume: Number(deal.volume) || 0,
        price: currentPrice,
        open_price: openPrice,
        current_price: currentPrice,
        sl: Number(deal.sl) || 0,
        tp: Number(deal.tp) || 0,
        profit: Number(deal.profit) || 0,
        commission: Number(deal.commission) || 0,
        swap: Number(deal.swap) || 0,
        deal_time: deal.deal_time || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

/**
 * Sinkronisasi data akun trading MT5 (saldo, equity, margin, posisi terbuka, dan riwayat deals).
 * Mendukung autentikasi Machine-to-Machine (header X-MT5-Sync-Key) dan sesi web peramban (cookie / Bearer).
 * @param {Request} req
 * @returns {Promise<NextResponse>}
 */
export async function POST(req) {
  // 1. Tangani mode demo statis agar tidak pernah melempar HTTP 500
  if (isStaticDemoEnvironment()) {
    let demoPayload = {};
    try {
      demoPayload = await req.json();
    } catch {
      demoPayload = {};
    }
    return NextResponse.json({
      success: true,
      demo: true,
      message: 'Mode demo statis aktif: sinkronisasi disimulasikan.',
      tradingAccount: {
        id: 'ta-001',
        account_id: 'acc-demo-6',
        broker: demoPayload.broker || 'MetaQuotes MT5 Demo',
        mt5_login: demoPayload.login ? String(demoPayload.login).substring(0, 3) + '****' : '108****',
        server: demoPayload.server || 'Demo-Server',
        currency: demoPayload.currency || 'USD',
        leverage: Number(demoPayload.leverage) || 500,
        balance: Number(demoPayload.balance) || 1500,
        equity: Number(demoPayload.equity) || 2580.5,
        floating_profit: Number(demoPayload.floating_profit) || 130.5,
        margin: Number(demoPayload.margin) || 45,
        free_margin: Number(demoPayload.free_margin) || 2535.5,
        margin_level: Number(demoPayload.margin_level) || 5734.4,
        last_synced_at: new Date().toISOString(),
        positions: sanitizePositions(demoPayload.positions),
        deals: sanitizeDeals(demoPayload.deals),
      },
    });
  }

  // 2. Evaluasi autentikasi: Prioritaskan M2M Preshared Key (X-MT5-Sync-Key), lalu fallback ke sesi web
  const m2mHeader = req.headers.get('x-mt5-sync-key');
  let isM2MAuthenticated = false;

  if (m2mHeader) {
    const configuredKey = process.env.MT5_SYNC_KEY || DEFAULT_MT5_SYNC_KEY;
    if (verifyM2MSyncKey(m2mHeader, configuredKey)) {
      isM2MAuthenticated = true;
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Akses ditolak: Kunci sinkronisasi MT5 (X-MT5-Sync-Key) tidak valid.',
          code: 'INVALID_SYNC_KEY',
        },
        { status: 401 }
      );
    }
  }

  // Jika tidak menggunakan M2M, wajib terautentikasi melalui sesi web peramban
  if (!isM2MAuthenticated) {
    const auth = requireServerAuth(req);
    if (!auth.authenticated) return auth.response;
  }

  // 3. Mutasi database dalam lock aman
  return withDbLock(async () => {
    try {
      let payload;
      try {
        payload = await req.json();
      } catch {
        return NextResponse.json(
          { success: false, error: 'Format permintaan bukan JSON yang valid.' },
          { status: 400 }
        );
      }

      if (!payload || typeof payload !== 'object') {
        return NextResponse.json(
          { success: false, error: 'Data payload trading tidak boleh kosong.' },
          { status: 400 }
        );
      }

      const db = getDatabase();
      if (!Array.isArray(db.trading_accounts)) {
        db.trading_accounts = [];
      }
      if (!Array.isArray(db.accounts)) {
        db.accounts = [];
      }
      if (!Array.isArray(db.sync_logs)) {
        db.sync_logs = [];
      }

      const sanitizedPositions = sanitizePositions(payload.positions);
      const sanitizedDeals = sanitizeDeals(payload.deals);

      let tradingAcc = db.trading_accounts[0];
      if (!tradingAcc) {
        /** @type {TradingAccount} */
        tradingAcc = {
          id: 'ta-001',
          account_id: 'acc-demo-6',
          broker: payload.broker || 'MetaQuotes MT5',
          mt5_login: payload.login ? String(payload.login).substring(0, 3) + '****' : '******',
          server: payload.server || 'Real Server',
          currency: payload.currency || 'USD',
          leverage: Number(payload.leverage) || 500,
          balance: Number(payload.balance) || 0,
          equity: Number(payload.equity) || 0,
          floating_profit: Number(payload.floating_profit) || 0,
          margin: Number(payload.margin) || 0,
          free_margin: Number(payload.free_margin) || 0,
          margin_level: Number(payload.margin_level) || 0,
          last_synced_at: new Date().toISOString(),
          positions: sanitizedPositions,
          deals: sanitizedDeals,
        };
        db.trading_accounts.push(tradingAcc);
      } else {
        tradingAcc.balance = payload.balance !== undefined ? Number(payload.balance) : tradingAcc.balance;
        tradingAcc.equity = payload.equity !== undefined ? Number(payload.equity) : tradingAcc.equity;
        tradingAcc.floating_profit = payload.floating_profit !== undefined ? Number(payload.floating_profit) : tradingAcc.floating_profit;
        tradingAcc.margin = payload.margin !== undefined ? Number(payload.margin) : tradingAcc.margin;
        tradingAcc.free_margin = payload.free_margin !== undefined ? Number(payload.free_margin) : tradingAcc.free_margin;
        tradingAcc.margin_level = payload.margin_level !== undefined ? Number(payload.margin_level) : tradingAcc.margin_level;
        if (payload.broker) tradingAcc.broker = String(payload.broker);
        if (payload.server) tradingAcc.server = String(payload.server);
        if (payload.login) tradingAcc.mt5_login = String(payload.login).substring(0, 3) + '****';
        if (payload.leverage) tradingAcc.leverage = Number(payload.leverage) || tradingAcc.leverage;
        if (payload.currency) tradingAcc.currency = String(payload.currency);

        if (payload.positions !== undefined) {
          tradingAcc.positions = sanitizedPositions;
        } else if (!Array.isArray(tradingAcc.positions)) {
          tradingAcc.positions = [];
        }

        if (payload.deals !== undefined) {
          tradingAcc.deals = sanitizedDeals;
        } else if (!Array.isArray(tradingAcc.deals)) {
          tradingAcc.deals = [];
        }

        tradingAcc.last_synced_at = new Date().toISOString();
      }

      // Perbarui juga saldo akun induk keuangan
      const acc = db.accounts.find((a) => a.id === tradingAcc.account_id || a.account_type === 'trading');
      if (acc) {
        acc.current_balance = tradingAcc.balance;
        acc.last_synced_at = new Date().toISOString();
      }

      db.sync_logs.unshift({
        id: `log-${Date.now()}`,
        source: isM2MAuthenticated ? 'MT5 Connector (Local M2M)' : 'MT5 Connector (Web UI)',
        status: 'success',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        records_synced: (tradingAcc.positions?.length || 0) + (tradingAcc.deals?.length || 0),
      });

      // Batasi riwayat sync log maksimal 50
      if (db.sync_logs.length > 50) {
        db.sync_logs = db.sync_logs.slice(0, 50);
      }

      const saved = saveDatabase(db);
      if (!saved) {
        return NextResponse.json({ success: false, error: 'Gagal memperbarui data trading lokal.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, tradingAccount: tradingAcc });
    } catch (error) {
      return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
    }
  });
}
