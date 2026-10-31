'use client';

import React, { useEffect, useState } from 'react';
import Header from '@/components/Header';
import { DatabaseSchema } from '@/lib/types';
import { 
  Database, 
  Download, 
  Clock, 
  Tag, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';

export default function SettingsPage() {
  const [data, setData] = useState<DatabaseSchema | null>(null);
  const [loading, setLoading] = useState(true);

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

  const downloadDbBackup = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kayla-finance-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 pb-12">
      <Header
        title="Pengaturan & Konfigurasi Sistem"
        subtitle="Cadangan data lokal JSON, preferensi mata uang, dan pemantauan sinkronisasi"
        onRefresh={fetchData}
        isRefreshing={loading}
      />

      <main className="p-4 sm:p-8 space-y-6 max-w-5xl">
        {/* Data Persistence Card (FigCraft 06_Settings_Desktop) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Penyimpanan Berkas Lokal (data/db.json)</h3>
              <p className="text-xs text-slate-500">Seluruh data tersimpan secara lokal dan privat tanpa pihak ketiga</p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-slate-900">Cadangan Berkas JSON</span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Unduh salinan cadangan lengkap dari semua akun, mutasi, transaksi, dan riwayat deal MT5.
              </p>
            </div>
            <button
              onClick={downloadDbBackup}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shrink-0 shadow-xs btn-interactive"
            >
              <Download className="w-4 h-4" />
              <span>Unduh Salinan JSON</span>
            </button>
          </div>
        </div>

        {/* Sync Logs Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Log Sinkronisasi Terkini</h3>
              <p className="text-xs text-slate-500">Riwayat sinkronisasi data MT5, Mayar, dan Impor CSV</p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {data?.sync_logs && data.sync_logs.length > 0 ? (
              data.sync_logs.map(log => (
                <div key={log.id} className="py-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    {log.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <div>
                      <span className="font-semibold text-slate-900">{log.source}</span>
                      <div className="text-[11px] text-slate-500">
                        {log.records_synced} data diproses • {new Date(log.completed_at).toLocaleString('id-ID')}
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {log.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 py-4">Belum ada catatan log sinkronisasi.</p>
            )}
          </div>
        </div>

        {/* Categories Manager */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Daftar Kategori Transaksi</h3>
              <p className="text-xs text-slate-500">Pos pengeluaran dan pos pemasukan</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {data?.categories.map(cat => (
              <span
                key={cat.id}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-700 flex items-center gap-2"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: cat.color || '#059669' }}
                ></span>
                <span>{cat.name}</span>
                <span className="text-[10px] text-slate-400 uppercase">({cat.category_type})</span>
              </span>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
