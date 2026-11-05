'use client';
import React, { useEffect, useState, useRef } from 'react';
import { 
    loadDatabase, 
    getBasePath, 
    getBackupsListClient, 
    createBackupClient, 
    saveSettingsClient, 
    exportDatabaseToJson, 
    importDatabaseFromJson, 
    safeFetchJson,
    isStaticDemoMode 
} from '@/lib/client-data';
import { Database, Download, Upload, Clock, Tag, CheckCircle2, AlertCircle, ShieldCheck, RefreshCw, Sliders, Archive, RotateCcw } from 'lucide-react';
/**
 * @typedef {Object} LocalBackupItem
 * @property {string} filename
 * @property {number} size
 * @property {string} createdAt
 * @property {string} reason
 */

/**
 * Halaman Pengaturan Aplikasi Kayla Finance.
 * Menyediakan konfigurasi preferensi, backup otomatis/manual, dan manajemen kategori.
 * @returns {React.ReactElement}
 */
export default function SettingsPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [backups, setBackups] = useState([]);
    const [loadingBackups, setLoadingBackups] = useState(false);
    const [actionMessage, setActionMessage] = useState(null);
    // Form Pengaturan
    const [appName, setAppName] = useState('Kayla Finance');
    const [defaultCurrency, setDefaultCurrency] = useState('IDR');
    const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
    const [maxBackups, setMaxBackups] = useState(15);
    const [usdRate, setUsdRate] = useState(16250);
    const [savingSettings, setSavingSettings] = useState(false);
    const fileInputRef = useRef(null);
    const fetchData = async () => {
        try {
            setLoading(true);
            const json = await loadDatabase();
            if (json) {
                setData(json);
                if (json.settings) {
                    setAppName(json.settings.app_name || 'Kayla Finance');
                    setDefaultCurrency(json.settings.default_currency || 'IDR');
                    setAutoBackupEnabled(json.settings.auto_backup_enabled !== false);
                    setMaxBackups(json.settings.max_backups || 15);
                    setUsdRate(json.settings.usd_to_idr_rate || 16250);
                }
            }
        }
        catch (err) {
            console.error(err);
        }
        finally {
            setLoading(false);
        }
    };
    const fetchBackups = async () => {
        try {
            setLoadingBackups(true);
            const list = await getBackupsListClient();
            setBackups(list);
        }
        catch (err) {
            console.error('Gagal mengambil daftar cadangan:', err);
        }
        finally {
            setLoadingBackups(false);
        }
    };
    useEffect(() => {
        fetchData();
        fetchBackups();
        const handleUpdate = () => {
            fetchData();
            fetchBackups();
        };
        window.addEventListener('kayla_db_updated', handleUpdate);
        return () => {
            window.removeEventListener('kayla_db_updated', handleUpdate);
        };
    }, []);
    const handleCreateManualBackup = async () => {
        try {
            setActionMessage(null);
            const res = await createBackupClient();
            if (res.success) {
                setActionMessage({ 
                    type: 'success', 
                    text: isStaticDemoMode() 
                        ? 'Cadangan database demo berhasil diunduh sebagai berkas JSON.' 
                        : 'Cadangan data berhasil dibuat di folder data/backups/' 
                });
                fetchBackups();
                fetchData();
            }
            else {
                setActionMessage({ type: 'error', text: res.error || 'Gagal membuat cadangan data.' });
            }
        }
        catch (err) {
            setActionMessage({ type: 'error', text: 'Koneksi gagal: ' + String(err) });
        }
    };
    const handleDownloadActiveDb = () => {
        exportDatabaseToJson();
    };
    const handleDownloadBackupFile = (filename) => {
        if (isStaticDemoMode()) {
            exportDatabaseToJson();
            return;
        }
        const base = getBasePath();
        window.location.href = `${base}/api/backup?action=download&filename=${encodeURIComponent(filename)}`;
    };
    const handleRestoreFromFile = (e) => {
        const file = e.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target?.result;
            if (!content || typeof content !== 'string')
                return;
            const confirmRestore = window.confirm('Peringatan Penting: Memulihkan database akan menggantikan data keuangan saat ini dengan isi berkas cadangan ini. Apakah Anda yakin ingin melanjutkan?');
            if (!confirmRestore) {
                if (fileInputRef.current)
                    fileInputRef.current.value = '';
                return;
            }
            try {
                setActionMessage(null);
                const res = await importDatabaseFromJson(content);
                if (res.success) {
                    setActionMessage({
                        type: 'success',
                        text: res.message || 'Pemulihan data berhasil diselesaikan.',
                    });
                    fetchData();
                    fetchBackups();
                }
                else {
                    setActionMessage({
                        type: 'error',
                        text: 'Pemulihan ditolak: ' + (res.error || 'Berkas cadangan tidak valid.'),
                    });
                }
            }
            catch (err) {
                setActionMessage({ type: 'error', text: 'Gagal memulihkan cadangan: ' + String(err) });
            }
            finally {
                if (fileInputRef.current)
                    fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };
    const handleRestoreFromLocalList = async (filename) => {
        const confirmRestore = window.confirm(`Pulihkan basis data dari cadangan "${filename}"? Tindakan ini akan menggantikan data aktif saat ini. Cadangan pengaman otomatis akan dibuat terlebih dahulu.`);
        if (!confirmRestore)
            return;
        try {
            setActionMessage(null);
            const base = getBasePath();
            const res = await safeFetchJson(`${base}/api/backup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'restore', filename }),
            });
            if (res.ok && res.data?.success) {
                setActionMessage({
                    type: 'success',
                    text: res.data.message || 'Pemulihan dari cadangan lokal berhasil.',
                });
                fetchData();
                fetchBackups();
            }
            else {
                setActionMessage({
                    type: 'error',
                    text: 'Gagal memulihkan: ' + (res.error || res.data?.error || 'Berkas tidak dapat diproses.'),
                });
            }
        }
        catch (err) {
            setActionMessage({ type: 'error', text: 'Kesalahan sistem: ' + String(err) });
        }
    };
    const handleSaveSettings = async (e) => {
        e.preventDefault();
        try {
            setSavingSettings(true);
            setActionMessage(null);
            const res = await saveSettingsClient({
                app_name: appName,
                default_currency: defaultCurrency,
                auto_backup_enabled: autoBackupEnabled,
                max_backups: maxBackups,
                usd_to_idr_rate: usdRate,
            });
            if (res.success) {
                setActionMessage({ 
                    type: 'success', 
                    text: isStaticDemoMode() 
                        ? 'Pengaturan demo berhasil disimpan ke penyimpanan lokal peramban.' 
                        : 'Pengaturan aplikasi berhasil disimpan ke data/db.json.' 
                });
                fetchData();
            }
            else {
                setActionMessage({ type: 'error', text: res.error || 'Gagal menyimpan pengaturan.' });
            }
        }
        catch (err) {
            setActionMessage({ type: 'error', text: 'Koneksi gagal: ' + String(err) });
        }
        finally {
            setSavingSettings(false);
        }
    };
    const formatFileSize = (bytes) => {
        if (bytes < 1024)
            return bytes + ' B';
        if (bytes < 1024 * 1024)
            return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };
    return (<div className="flex-1 flex flex-col bg-slate-50 pb-12">
      <main className="p-4 sm:p-8 space-y-6 max-w-5xl">
        {/* Notifikasi Status Aksi */}
        {actionMessage && (<div className={`p-4 rounded-xl border flex items-start gap-3 transition-all animate-slide-up ${actionMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
            {actionMessage.type === 'success' ? (<CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600"/>) : (<AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600"/>)}
            <div className="text-xs font-semibold">{actionMessage.text}</div>
          </div>)}

        {/* Status Database Lokal */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Database className="w-5 h-5"/>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Database Utama Lokal (data/db.json)</h3>
                <p className="text-xs text-slate-500">
                  Semua transaksi, rekening, dan mutasi trading disimpan secara privat tanpa cloud
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold shrink-0">
              <ShieldCheck className="w-3.5 h-3.5"/>
              <span>Offline & Privat</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500">Jumlah Akun</span>
              <p className="text-base font-bold text-slate-900 mt-0.5">{data?.accounts.length || 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500">Total Transaksi</span>
              <p className="text-base font-bold text-slate-900 mt-0.5">{data?.transactions.length || 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500">Akun Trading MT5</span>
              <p className="text-base font-bold text-slate-900 mt-0.5">{data?.trading_accounts.length || 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500">Kategori Aktif</span>
              <p className="text-base font-bold text-slate-900 mt-0.5">{data?.categories.length || 0}</p>
            </div>
          </div>
        </div>

        {/* Card Cadangan & Pemulihan Data */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Archive className="w-5 h-5"/>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Cadangan & Pemulihan Data (Backup & Restore)</h3>
              <p className="text-xs text-slate-500">
                Pencadangan berkas otomatis sebelum perubahan penting serta ekspor dan impor manual
              </p>
            </div>
          </div>

          {/* Tombol Aksi Utama */}
          <div className="flex flex-wrap gap-3 pb-5 border-b border-slate-100">
            <button type="button" onClick={handleCreateManualBackup} className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs cursor-pointer">
              <RefreshCw className="w-4 h-4"/>
              <span>Buat Cadangan Baru Sekarang</span>
            </button>

            <button type="button" onClick={handleDownloadActiveDb} className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors shadow-xs cursor-pointer">
              <Download className="w-4 h-4 text-slate-500"/>
              <span>Ekspor Database JSON</span>
            </button>

            <label className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors shadow-xs cursor-pointer">
              <Upload className="w-4 h-4 text-slate-500"/>
              <span>Pulihkan dari Berkas JSON</span>
              <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleRestoreFromFile} className="hidden"/>
            </label>
          </div>

          {/* Riwayat Cadangan Tersimpan di data/backups/ */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-900">
                Berkas Cadangan Tersimpan di Komputer (data/backups/)
              </span>
              <span className="text-[11px] text-slate-500">
                {backups.length} berkas cadangan ditemukan
              </span>
            </div>

            {backups.length > 0 ? (<div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {backups.map((b) => (<div key={b.filename} className="p-3 bg-white hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                    <div>
                      <div className="font-semibold text-slate-800 break-all">{b.filename}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5" suppressHydrationWarning>
                        Dibuat: {new Date(b.createdAt).toLocaleString('id-ID')} • Ukuran: {formatFileSize(b.size)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => handleDownloadBackupFile(b.filename)} className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors">
                        Unduh
                      </button>
                      <button type="button" onClick={() => handleRestoreFromLocalList(b.filename)} className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors">
                        <RotateCcw className="w-3 h-3"/>
                        <span>Pulihkan</span>
                      </button>
                    </div>
                  </div>))}
              </div>) : (<p className="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 rounded-lg">
                Belum ada salinan cadangan otomatis di folder data/backups/. Klik tombol &quot;Buat Cadangan Baru&quot; di atas untuk mencadangkan data pertama.
              </p>)}
          </div>
        </div>

        {/* Konfigurasi Aplikasi */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Sliders className="w-5 h-5"/>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Pengaturan Aplikasi</h3>
              <p className="text-xs text-slate-500">Konfigurasi preferensi mata uang dan batas cadangan lokal</p>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Nama Aplikasi</label>
                <input type="text" value={appName} onChange={(e) => setAppName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-emerald-600" required/>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Mata Uang Default</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setDefaultCurrency('IDR')} className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${defaultCurrency === 'IDR'
            ? 'bg-emerald-50 border-emerald-600 text-emerald-700'
            : 'bg-white border-slate-200 text-slate-600'}`}>
                    IDR (Rupiah)
                  </button>
                  <button type="button" onClick={() => setDefaultCurrency('USD')} className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${defaultCurrency === 'USD'
            ? 'bg-emerald-50 border-emerald-600 text-emerald-700'
            : 'bg-white border-slate-200 text-slate-600'}`}>
                    USD (Dollar)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Maksimal Berkas Cadangan Disimpan
                </label>
                <input type="number" min="3" max="50" value={maxBackups} onChange={(e) => setMaxBackups(Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-emerald-600"/>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Sistem akan otomatis menghapus cadangan tertua jika melebihi batas.
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Kurs Konversi USD ke IDR</label>
                <input type="number" step="50" value={usdRate} onChange={(e) => setUsdRate(Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-emerald-600"/>
              </div>
            </div>

            <div className="pt-2">
              <button type="submit" disabled={savingSettings} className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors shadow-xs cursor-pointer">
                {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </div>
          </form>
        </div>

        {/* Log Sinkronisasi Terkini */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <Clock className="w-5 h-5"/>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Log Sinkronisasi Terkini</h3>
              <p className="text-xs text-slate-500">Riwayat sinkronisasi data MT5, Mayar, dan Impor CSV</p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {data?.sync_logs && data.sync_logs.length > 0 ? (data.sync_logs.map((log) => (<div key={log.id} className="py-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    {log.status === 'success' ? (<CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0"/>) : (<AlertCircle className="w-4 h-4 text-rose-600 shrink-0"/>)}
                    <div>
                      <span className="font-semibold text-slate-900">{log.source}</span>
                      <div className="text-[11px] text-slate-500" suppressHydrationWarning>
                        {log.records_synced} data diproses • {new Date(log.completed_at).toLocaleString('id-ID')}
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {log.status}
                  </span>
                </div>))) : (<p className="text-xs text-slate-400 py-4">Belum ada catatan log sinkronisasi.</p>)}
          </div>
        </div>

        {/* Daftar Kategori Transaksi */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Tag className="w-5 h-5"/>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Daftar Kategori Transaksi</h3>
              <p className="text-xs text-slate-500">Pos pengeluaran dan pos pemasukan yang tersimpan di basis data</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {data?.categories.map((cat) => (<span key={cat.id} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color || '#059669' }}></span>
                <span>{cat.name}</span>
                <span className="text-[10px] text-slate-400 uppercase">({cat.category_type})</span>
              </span>))}
          </div>
        </div>
      </main>
    </div>);
}
