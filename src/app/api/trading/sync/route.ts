import { NextResponse } from 'next/server';
import { getDatabase, saveDatabase } from '@/lib/db';
import { TradingAccount, TradingPosition, TradingDeal } from '@/lib/types';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const db = getDatabase();

    // Check if trading account exists
    let tradingAcc = db.trading_accounts[0];
    if (!tradingAcc) {
      tradingAcc = {
        id: 'ta-001',
        account_id: 'acc-mt5',
        broker: payload.broker || 'MetaQuotes MT5',
        mt5_login: payload.login ? String(payload.login).substring(0, 3) + '****' : '108****',
        server: payload.server || 'Real Server',
        currency: payload.currency || 'USD',
        leverage: payload.leverage || 500,
        balance: payload.balance || 0,
        equity: payload.equity || 0,
        floating_profit: payload.floating_profit || 0,
        margin: payload.margin || 0,
        free_margin: payload.free_margin || 0,
        margin_level: payload.margin_level || 0,
        last_synced_at: new Date().toISOString(),
        positions: payload.positions || [],
        deals: payload.deals || [],
      };
      db.trading_accounts.push(tradingAcc);
    } else {
      tradingAcc.balance = payload.balance !== undefined ? payload.balance : tradingAcc.balance;
      tradingAcc.equity = payload.equity !== undefined ? payload.equity : tradingAcc.equity;
      tradingAcc.floating_profit = payload.floating_profit !== undefined ? payload.floating_profit : tradingAcc.floating_profit;
      tradingAcc.margin = payload.margin !== undefined ? payload.margin : tradingAcc.margin;
      tradingAcc.free_margin = payload.free_margin !== undefined ? payload.free_margin : tradingAcc.free_margin;
      tradingAcc.margin_level = payload.margin_level !== undefined ? payload.margin_level : tradingAcc.margin_level;
      if (payload.broker) tradingAcc.broker = payload.broker;
      if (payload.server) tradingAcc.server = payload.server;
      if (payload.positions) tradingAcc.positions = payload.positions;
      if (payload.deals) tradingAcc.deals = payload.deals;
      tradingAcc.last_synced_at = new Date().toISOString();
    }

    // Also update parent account balance
    const acc = db.accounts.find(a => a.id === tradingAcc.account_id || a.account_type === 'trading');
    if (acc) {
      acc.current_balance = tradingAcc.balance;
      acc.last_synced_at = new Date().toISOString();
    }

    db.sync_logs.unshift({
      id: `log-${Date.now()}`,
      source: 'MT5 Connector (Local)',
      status: 'success',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      records_synced: (payload.positions?.length || 0) + (payload.deals?.length || 0),
    });

    saveDatabase(db);

    return NextResponse.json({ success: true, tradingAccount: tradingAcc });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
