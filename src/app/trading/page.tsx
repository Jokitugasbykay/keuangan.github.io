'use client';

import React, { useEffect, useState } from 'react';
import Header from '@/components/Header';
import { DatabaseSchema } from '@/lib/types';
import { 
  CandlestickChart, 
  Activity, 
  Terminal, 
  RefreshCw 
} from 'lucide-react';

function formatUSD(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(amount);
}

export default function TradingPage() {
  const [data, setData] = useState<DatabaseSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/data');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSimulatedSync = async () => {
    try {
      setIsSyncing(true);
      const current = data?.trading_accounts[0];
      if (!current) return;

      const randomDelta = (Math.random() - 0.45) * 15;
      const newFloating = current.floating_profit + randomDelta;
      const newEquity = current.balance + newFloating;

      const res = await fetch('/api/trading/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker: current.broker,
          login: current.mt5_login,
          server: current.server,
          currency: 'USD',
          leverage: current.leverage,
          balance: current.balance,
          equity: Number(newEquity.toFixed(2)),
          floating_profit: Number(newFloating.toFixed(2)),
          margin: current.margin,
          free_margin: Number((newEquity - current.margin).toFixed(2)),
          margin_level: current.margin > 0 ? Number(((newEquity / current.margin) * 100).toFixed(1)) : 0,
          positions: current.positions.map(p => ({
            ...p,
            current_price: p.symbol === 'XAUUSD' ? Number((p.current_price + (Math.random() - 0.5) * 2).toFixed(2)) : p.current_price,
            profit: Number((p.profit + (Math.random() - 0.48) * 5).toFixed(2))
          })),
          deals: current.deals,
        })
      });

      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  const trading = data?.trading_accounts[0];
  const realizedPnL = trading?.deals.reduce((sum, d) => sum + d.profit + d.commission + d.swap, 0) || 0;

  return (
    <div className="flex-1 flex flex-col bg-slate-50 pb-12">
      <Header
        title="MetaTrader 5 (MT5) Dashboard"
        subtitle="Pemantauan posisi aktif, ekuitas, dan riwayat deal trading Kaystrade"
        onRefresh={fetchData}
        isRefreshing={loading}
      />

      <main className="p-4 sm:p-8 space-y-6 max-w-7xl">
        {/* Account Meta Bar (FigCraft 04_Trading_Desktop) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
              <CandlestickChart className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900">{trading?.broker || 'Exness Terminal'}</h3>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                  Read-Only MT5 API
                </span>
              </div>
              <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-1">
                <span>Login: {trading?.mt5_login || '108****'}</span>
                <span>•</span>
                <span>Server: {trading?.server || 'Exness-Real20'}</span>
                <span>•</span>
                <span>Leverage: 1:{trading?.leverage || 500}</span>
                <span>•</span>
                <span>Currency: USD</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSimulatedSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50 btn-interactive"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sinkron MT5 Sekarang</span>
            </button>
          </div>
        </div>

        {/* 6 Key Financial Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs card-interactive">
            <span className="text-[11px] text-slate-500 font-medium">Balance</span>
            <div className="text-base sm:text-lg font-bold text-slate-900 mt-1">
              {formatUSD(trading?.balance || 0)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs card-interactive">
            <span className="text-[11px] text-slate-500 font-medium">Equity</span>
            <div className="text-base sm:text-lg font-bold text-emerald-600 mt-1">
              {formatUSD(trading?.equity || 0)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs card-interactive">
            <span className="text-[11px] text-slate-500 font-medium">Floating P&L</span>
            <div className={`text-base sm:text-lg font-bold mt-1 ${
              (trading?.floating_profit || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}>
              {(trading?.floating_profit || 0) >= 0 ? '+' : ''}{formatUSD(trading?.floating_profit || 0)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs card-interactive">
            <span className="text-[11px] text-slate-500 font-medium">Margin Dipakai</span>
            <div className="text-base sm:text-lg font-bold text-slate-700 mt-1">
              {formatUSD(trading?.margin || 0)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs card-interactive">
            <span className="text-[11px] text-slate-500 font-medium">Free Margin</span>
            <div className="text-base sm:text-lg font-bold text-slate-900 mt-1">
              {formatUSD(trading?.free_margin || 0)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs card-interactive">
            <span className="text-[11px] text-slate-500 font-medium">Margin Level</span>
            <div className="text-base sm:text-lg font-bold text-emerald-700 mt-1">
              {trading?.margin_level ? `${trading.margin_level.toFixed(0)}%` : '0%'}
            </div>
          </div>
        </div>

        {/* Open Positions Section */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                Posisi Trading Aktif (Open Positions)
              </h3>
              <p className="text-xs text-slate-500">Total {trading?.positions.length || 0} posisi aktif di pasar</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                <tr>
                  <th className="py-3 px-4">Simbol</th>
                  <th className="py-3 px-4">Tipe</th>
                  <th className="py-3 px-4">Volume (Lot)</th>
                  <th className="py-3 px-4">Harga Entry</th>
                  <th className="py-3 px-4">Harga Terkini</th>
                  <th className="py-3 px-4">SL / TP</th>
                  <th className="py-3 px-4 text-right">Floating Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trading && trading.positions.length > 0 ? (
                  trading.positions.map((pos) => (
                    <tr key={pos.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">{pos.symbol}</td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          pos.type === 'BUY' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {pos.type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">{pos.volume}</td>
                      <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">{pos.open_price}</td>
                      <td className="py-3.5 px-4 text-slate-900 font-semibold whitespace-nowrap">{pos.current_price}</td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {pos.sl || '-'} / {pos.tp || '-'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold whitespace-nowrap">
                        <span className={pos.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          {pos.profit >= 0 ? '+' : ''}{formatUSD(pos.profit)}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                      Tidak ada posisi trading yang sedang terbuka.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* History Deals / Closed Trades */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Riwayat Deal Transaksi Selesai</h3>
              <p className="text-xs text-slate-500">
                Total Realized Net P&L: <span className={realizedPnL >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                  {realizedPnL >= 0 ? '+' : ''}{formatUSD(realizedPnL)}
                </span>
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                <tr>
                  <th className="py-3 px-4">Deal ID</th>
                  <th className="py-3 px-4">Waktu Selesai</th>
                  <th className="py-3 px-4">Simbol</th>
                  <th className="py-3 px-4">Tipe</th>
                  <th className="py-3 px-4">Volume</th>
                  <th className="py-3 px-4">Harga Close</th>
                  <th className="py-3 px-4">Komisi & Swap</th>
                  <th className="py-3 px-4 text-right">Net Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trading && trading.deals.length > 0 ? (
                  trading.deals.map((deal) => (
                    <tr key={deal.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 text-slate-500 font-mono">#{deal.external_deal_id}</td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(deal.deal_time).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">{deal.symbol}</td>
                      <td className="py-3.5 px-4 uppercase text-[10px] font-bold">
                        <span className={deal.deal_type === 'buy' ? 'text-emerald-700' : 'text-rose-700'}>
                          {deal.deal_type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">{deal.volume}</td>
                      <td className="py-3.5 px-4 text-slate-700">{deal.price}</td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {formatUSD(deal.commission + deal.swap)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold whitespace-nowrap">
                        <span className={deal.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          {deal.profit >= 0 ? '+' : ''}{formatUSD(deal.profit)}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                      Belum ada riwayat deal yang tercatat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Python Connector Helper Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Panduan Konektor Lokal MT5</h4>
              <p className="text-xs text-slate-500">Sinkronisasi otomatis langsung dari MetaTrader 5 terminal di PC ini</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-3 sm:p-4 border border-slate-200 space-y-2 text-xs font-mono text-slate-800">
            <p className="text-slate-600 font-sans">Jalankan perintah ini di terminal untuk sinkronisasi live:</p>
            <div className="p-2.5 bg-white rounded border border-slate-300 text-emerald-700 font-bold">
              python connector/mt5_sync.py
            </div>
            <p className="text-[11px] text-slate-500 font-sans mt-2">
              Konektor membaca balance, equity, posisi terbuka, dan riwayat deal melalui MetaTrader5 Python API lalu mengirimkannya ke endpoint lokal.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
