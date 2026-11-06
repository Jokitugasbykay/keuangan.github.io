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
import { 
    encryptBackup, 
    decryptBackup, 
    createDataSummary 
} from '@/lib/vault-crypto';
import { 
    hasEncryptedVault, 
    isVaultUnlocked, 
    unlockVault, 
    lockVault, 
    restoreVaultFromBackup, 
    hasPreRestoreSnapshot, 
    rollbackPreRestoreSnapshot 
} from '@/lib/vault-storage';
import { 
    Database, 
    Download, 
    Upload, 
    Clock, 
    Tag, 
    CheckCircle2, 
    AlertCircle, 
    ShieldCheck, 
    RefreshCw, 
    Sliders, 
    Archive, 
    RotateCcw,
    KeyRound,
    Lock,
    Unlock,
    FileKey,
    FileCheck,
    Eye,
    EyeOff,
    FolderGit2,
    Shield
} from 'lucide-react';

/**
 * @typedef {Object} LocalBackupItem
 * @property {string} filename
 * @property {number} size
 * @property {string} createdAt
 * @property {string} reason
 */

/**
 * Halaman Pengaturan Aplikasi Kayla Finance.
 * Menyediakan konfigurasi preferensi, backup otomatis/manual, brankas lokal terenkripsi,
 * serta panduan penyimpanan cadangan ke GitHub Private.
 * @returns {React.ReactElement}
 */
export default function SettingsPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [backups, setBackups] = useState([]);
    const [loadingBackups, setLoadingBackups] = useState(false);
    const [actionMessage, setActionMessage] = useState(null);

    // Status Brankas Terenkripsi Lokal
    const [vaultUnlocked, setVaultUnlocked] = useState(false);
    const [hasVault, setHasVault] = useState(false);
    const [hasSnapshot, setHasSnapshot] = useState(false);

    // Form Buat Cadangan Terenkripsi (.kfin.enc)
    const [backupPassphrase, setBackupPassphrase] = useState('');
    const [backupPassphraseConfirm, setBackupPassphraseConfirm] = useState('');
    const [showBackupPassphrase, setShowBackupPassphrase] = useState(false);
    const [isEncrypting, setIsEncrypting] = useState(false);

    // Form Pulihkan Cadangan Terenkripsi (.kfin.enc)
    const [restoreFile, setRestoreFile] = useState(null);
    const [restoreFileContent, setRestoreFileContent] = useState('');
    const [restorePassphrase, setRestorePassphrase] = useState('');
    const [showRestorePassphrase, setShowRestorePassphrase] = useState(false);
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [restorePreviewData, setRestorePreviewData] = useState(null);
    const [isApplyingRestore, setIsApplyingRestore] = useState(false);

    // Form Buka Kunci Brankas (jika terkunci)
    const [unlockPassphrase, setUnlockPassphrase] = useState('');
    const [isUnlocking, setIsUnlocking] = useState(false);

    // Form Pengaturan Aplikasi Umum
    const [appName, setAppName] = useState('Kayla Finance');
    const [defaultCurrency, setDefaultCurrency] = useState('IDR');
    const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
    const [maxBackups, setMaxBackups] = useState(15);
    const [usdRate, setUsdRate] = useState(16250);
    const [savingSettings, setSavingSettings] = useState(false);

    const fileInputRef = useRef(null);
    const encryptedFileInputRef = useRef(null);

    const syncVaultState = () => {
        setVaultUnlocked(isVaultUnlocked());
        setHasVault(hasEncryptedVault());
        setHasSnapshot(hasPreRestoreSnapshot());
    };

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
            syncVaultState();
        } catch (err) {
            console.error('Gagal memuat database:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchBackups = async () => {
        try {
            setLoadingBackups(true);
            const list = await getBackupsListClient();
            setBackups(list);
        } catch (err) {
            console.error('Gagal mengambil daftar cadangan:', err);
        } finally {
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

        const handleVaultChange = () => {
            syncVaultState();
            fetchData();
        };

        window.addEventListener('kayla_db_updated', handleUpdate);
        window.addEventListener('kayla_vault_state_changed', handleVaultChange);
        window.addEventListener('kayla_vault_data_updated', handleVaultChange);

        return () => {
            window.removeEventListener('kayla_db_updated', handleUpdate);
            window.removeEventListener('kayla_vault_state_changed', handleVaultChange);
            window.removeEventListener('kayla_vault_data_updated', handleVaultChange);
        };
    }, []);

    // Evaluasi Kekuatan Passphrase
    const getPassphraseStrength = (pass) => {
        if (!pass) return { score: 0, text: 'Belum diisi', color: 'text-slate-400' };
        if (pass.length < 6) return { score: 1, text: 'Terlalu pendek (min 6 karakter)', color: 'text-rose-500' };
        if (pass.length < 8) return { score: 2, text: 'Cukup', color: 'text-amber-500' };
        const hasNumber = /\d/.test(pass);
        const hasSpecial = /[^A-Za-z0-9]/.test(pass);
        if (pass.length >= 12 && hasNumber && hasSpecial) {
            return { score: 4, text: 'Sangat Kuat (Kriptografi Optimal)', color: 'text-emerald-600' };
        }
        if (pass.length >= 8 && (hasNumber || hasSpecial)) {
            return { score: 3, text: 'Kuat', color: 'text-emerald-500' };
        }
        return { score: 2, text: 'Cukup', color: 'text-amber-500' };
    };

    // Handler: Buat Cadangan Terenkripsi (.kfin.enc)
    const handleCreateEncryptedBackup = async (e) => {
        e.preventDefault();
        if (!data) {
            setActionMessage({ type: 'error', text: 'Data keuangan belum termuat.' });
            return;
        }
        if (backupPassphrase.length < 6) {
            setActionMessage({ type: 'error', text: 'Passphrase minimal 6 karakter demi keamanan kriptografi.' });
            return;
        }
        if (backupPassphrase !== backupPassphraseConfirm) {
            setActionMessage({ type: 'error', text: 'Konfirmasi passphrase tidak cocok dengan passphrase yang dimasukkan.' });
            return;
        }

        try {
            setIsEncrypting(true);
            setActionMessage(null);
            const { jsonString, filename, envelope } = await encryptBackup(data, backupPassphrase);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            const summary = envelope.summary;
            const idrFormatted = (summary.balances?.IDR || 0).toLocaleString('id-ID');
            const usdFormatted = (summary.balances?.USD || 0).toLocaleString('en-US');

            setActionMessage({
                type: 'success',
                text: `Cadangan terenkripsi AES-256-GCM berhasil diunduh (${filename}). Berisi ${summary.accounts_count} akun, ${summary.transactions_count} transaksi, total saldo IDR Rp ${idrFormatted} dan USD $ ${usdFormatted}. Berkas siap diunggah ke repository GitHub Private Anda.`
            });
            setBackupPassphrase('');
            setBackupPassphraseConfirm('');
        } catch (err) {
            setActionMessage({
                type: 'error',
                text: 'Gagal membuat cadangan terenkripsi: ' + (err.message || String(err))
            });
        } finally {
            setIsEncrypting(false);
        }
    };

    // Handler: Pilih Berkas Cadangan Terenkripsi
    const handleEncryptedFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setRestoreFile(file);
        setRestorePreviewData(null);
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result;
            if (typeof content === 'string') {
                setRestoreFileContent(content);
            }
        };
        reader.readAsText(file);
    };

    // Handler: Pratinjau Cadangan Terenkripsi (Restore Preview)
    const handlePreviewEncryptedBackup = async () => {
        if (!restoreFileContent) {
            setActionMessage({ type: 'error', text: 'Pilih berkas cadangan .kfin.enc terlebih dahulu.' });
            return;
        }
        if (!restorePassphrase) {
            setActionMessage({ type: 'error', text: 'Masukkan passphrase untuk membuka cadangan terenkripsi ini.' });
            return;
        }

        try {
            setIsDecrypting(true);
            setActionMessage(null);
            const result = await decryptBackup(restoreFileContent, restorePassphrase);
            setRestorePreviewData({
                database: result.database,
                summary: result.summary,
                timestamp: result.timestamp,
                filename: restoreFile?.name || 'kayla-finance-backup.kfin.enc'
            });
            setActionMessage({
                type: 'success',
                text: 'Dekripsi berhasil diverifikasi: Integritas autentikasi AES-256-GCM valid. Silakan tinjau data pratinjau di bawah sebelum menerapkan pemulihan.'
            });
        } catch (err) {
            setRestorePreviewData(null);
            setActionMessage({
                type: 'error',
                text: 'Gagal mendekripsi: ' + (err.message || 'Passphrase salah atau berkas telah dimodifikasi/rusak.')
            });
        } finally {
            setIsDecrypting(false);
        }
    };

    // Handler: Terapkan Pemulihan dari Pratinjau
    const handleApplyEncryptedRestore = async () => {
        if (!restorePreviewData || !restoreFileContent || !restorePassphrase) return;

        const confirmApply = window.confirm(
            'Konfirmasi Pemulihan: Tindakan ini akan menggantikan seluruh data aktif dengan isi berkas cadangan ini. Snapshot data aktif saat ini akan dibuat secara otomatis. Lanjutkan pemulihan?'
        );
        if (!confirmApply) return;

        try {
            setIsApplyingRestore(true);
            setActionMessage(null);

            const res = await restoreVaultFromBackup(restoreFileContent, restorePassphrase);
            if (!res.success) {
                throw new Error(res.error);
            }

            setData(res.database);
            setVaultUnlocked(true);
            setHasVault(true);
            setHasSnapshot(true);
            setRestorePreviewData(null);
            setRestorePassphrase('');
            setRestoreFile(null);
            setRestoreFileContent('');
            if (encryptedFileInputRef.current) {
                encryptedFileInputRef.current.value = '';
            }

            setActionMessage({
                type: 'success',
                text: 'Pemulihan data berhasil diterapkan ke Brankas Lokal. Seluruh saldo dan transaksi telah diperbarui.'
            });

            window.dispatchEvent(new Event('kayla_db_updated'));
        } catch (err) {
            setActionMessage({
                type: 'error',
                text: 'Gagal menerapkan pemulihan data: ' + (err.message || String(err))
            });
        } finally {
            setIsApplyingRestore(false);
        }
    };

    // Handler: Batalkan Pemulihan Terakhir (Rollback Snapshot)
    const handleRollbackSnapshot = () => {
        const confirmRollback = window.confirm(
            'Apakah Anda yakin ingin membatalkan pemulihan terakhir dan mengembalikan kondisi brankas ke snapshot sebelumnya?'
        );
        if (!confirmRollback) return;

        const success = rollbackPreRestoreSnapshot();
        if (success) {
            setActionMessage({
                type: 'success',
                text: 'Kondisi brankas sebelum pemulihan berhasil dikembalikan. Brankas sekarang dalam status terkunci demi keamanan.'
            });
            setVaultUnlocked(false);
            setHasSnapshot(false);
            fetchData();
        } else {
            setActionMessage({
                type: 'error',
                text: 'Tidak ada snapshot pemulihan sebelumnya yang dapat dikembalikan.'
            });
        }
    };

    // Handler: Buka Kunci Brankas
    const handleUnlockVaultNow = async (e) => {
        e.preventDefault();
        if (!unlockPassphrase) return;
        try {
            setIsUnlocking(true);
            setActionMessage(null);
            const res = await unlockVault(unlockPassphrase);
            if (res.success) {
                setVaultUnlocked(true);
                setUnlockPassphrase('');
                setActionMessage({
                    type: 'success',
                    text: 'Brankas lokal berhasil dibuka. Data keuangan pribadi Anda kini aktif di sesi ini.'
                });
                fetchData();
            } else {
                setActionMessage({
                    type: 'error',
                    text: res.error || 'Passphrase brankas salah.'
                });
            }
        } finally {
            setIsUnlocking(false);
        }
    };

    // Handler: Kunci Brankas
    const handleLockVaultNow = () => {
        lockVault();
        setVaultUnlocked(false);
        setActionMessage({
            type: 'success',
            text: 'Brankas lokal telah dikunci. Kredensial dan data dekripsi di memori telah dihapus bersih.'
        });
        fetchData();
    };

    // Handler Cadangan Manual Standar
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
            } else {
                setActionMessage({ type: 'error', text: res.error || 'Gagal membuat cadangan data.' });
            }
        } catch (err) {
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
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target?.result;
            if (!content || typeof content !== 'string') return;
            const confirmRestore = window.confirm('Peringatan: Memulihkan database akan menggantikan data keuangan aktif saat ini dengan isi berkas ini. Lanjutkan?');
            if (!confirmRestore) {
                if (fileInputRef.current) fileInputRef.current.value = '';
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
                } else {
                    setActionMessage({
                        type: 'error',
                        text: 'Pemulihan ditolak: ' + (res.error || 'Berkas cadangan tidak valid.'),
                    });
                }
            } catch (err) {
                setActionMessage({ type: 'error', text: 'Gagal memulihkan cadangan: ' + String(err) });
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleRestoreFromLocalList = async (filename) => {
        const confirmRestore = window.confirm(`Pulihkan basis data dari cadangan "${filename}"? Tindakan ini akan menggantikan data aktif saat ini.`);
        if (!confirmRestore) return;
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
            } else {
                setActionMessage({
                    type: 'error',
                    text: 'Gagal memulihkan: ' + (res.error || res.data?.error || 'Berkas tidak dapat diproses.'),
                });
            }
        } catch (err) {
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
            } else {
                setActionMessage({ type: 'error', text: res.error || 'Gagal menyimpan pengaturan.' });
            }
        } catch (err) {
            setActionMessage({ type: 'error', text: 'Koneksi gagal: ' + String(err) });
        } finally {
            setSavingSettings(false);
        }
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const currentSummary = data ? createDataSummary(data) : null;

    return (
        <div className="flex-1 flex flex-col bg-slate-50 pb-16">
            <main className="p-4 sm:p-8 space-y-6 max-w-5xl">
                {/* Notifikasi Status Aksi */}
                {actionMessage && (
                    <div className={`p-4 rounded-xl border flex items-start gap-3 transition-all animate-slide-up ${
                        actionMessage.type === 'success'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}>
                        {actionMessage.type === 'success' ? (
                            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600"/>
                        ) : (
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600"/>
                        )}
                        <div className="text-xs font-semibold leading-relaxed">{actionMessage.text}</div>
                    </div>
                )}

                {/* Status Brankas Terenkripsi Kriptografis (AES-256-GCM) */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                vaultUnlocked ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'
                            }`}>
                                {vaultUnlocked ? <Unlock className="w-5 h-5"/> : <Lock className="w-5 h-5"/>}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-bold text-slate-900">
                                        Brankas Terenkripsi Lokal (Private Local Vault)
                                    </h3>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                        vaultUnlocked 
                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                            : hasVault 
                                                ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                                    }`}>
                                        {vaultUnlocked ? 'Terbuka (Unlocked)' : hasVault ? 'Terkunci (Locked)' : 'Belum Dibuat'}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Enkripsi AES-256-GCM terotentikasi di sisi klien dengan turunan kunci PBKDF2-SHA256 (600.000 iterasi).
                                </p>
                            </div>
                        </div>

                        {vaultUnlocked && (
                            <button
                                type="button"
                                onClick={handleLockVaultNow}
                                className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer shrink-0"
                            >
                                <Lock className="w-3.5 h-3.5 text-slate-600"/>
                                <span>Kunci Brankas Sekarang</span>
                            </button>
                        )}
                    </div>

                    {!vaultUnlocked && hasVault && (
                        <form onSubmit={handleUnlockVaultNow} className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
                            <div className="relative flex-1">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <KeyRound className="w-4 h-4" />
                                </div>
                                <input
                                    type="password"
                                    value={unlockPassphrase}
                                    onChange={(e) => setUnlockPassphrase(e.target.value)}
                                    placeholder="Masukkan passphrase brankas untuk membuka data..."
                                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-emerald-600"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isUnlocking}
                                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center gap-2"
                            >
                                <Unlock className="w-3.5 h-3.5"/>
                                <span>{isUnlocking ? 'Membuka...' : 'Buka Kunci Brankas'}</span>
                            </button>
                        </form>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                            <span className="text-[11px] font-medium text-slate-500">Jumlah Akun</span>
                            <p className="text-base font-bold text-slate-900 mt-0.5">{data?.accounts?.length || 0}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                            <span className="text-[11px] font-medium text-slate-500">Total Transaksi</span>
                            <p className="text-base font-bold text-slate-900 mt-0.5">{data?.transactions?.length || 0}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                            <span className="text-[11px] font-medium text-slate-500">Saldo IDR</span>
                            <p className="text-sm font-bold text-slate-900 mt-0.5">
                                Rp {(currentSummary?.balances?.IDR || 0).toLocaleString('id-ID')}
                            </p>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                            <span className="text-[11px] font-medium text-slate-500">Saldo USD</span>
                            <p className="text-sm font-bold text-slate-900 mt-0.5">
                                $ {(currentSummary?.balances?.USD || 0).toLocaleString('en-US')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Bagian Cadangan Terenkripsi (.kfin.enc) & Pemulihan Aman */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Kartu Buat Cadangan Terenkripsi */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <FileKey className="w-5 h-5"/>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900">Buat Cadangan Terenkripsi (.kfin.enc)</h4>
                                    <p className="text-xs text-slate-500">Enkripsi AES-256-GCM siap simpan di GitHub Private</p>
                                </div>
                            </div>

                            <form onSubmit={handleCreateEncryptedBackup} className="space-y-3.5 mt-4">
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-xs font-semibold text-slate-700">Passphrase Cadangan</label>
                                        <span className={`text-[11px] font-semibold ${getPassphraseStrength(backupPassphrase).color}`}>
                                            {getPassphraseStrength(backupPassphrase).text}
                                        </span>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type={showBackupPassphrase ? 'text' : 'password'}
                                            value={backupPassphrase}
                                            onChange={(e) => setBackupPassphrase(e.target.value)}
                                            placeholder="Tentukan passphrase rahasia (min 6 karakter)..."
                                            className="w-full pl-3 pr-16 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-emerald-600"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowBackupPassphrase(!showBackupPassphrase)}
                                            className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[11px] text-slate-400 hover:text-slate-600"
                                        >
                                            {showBackupPassphrase ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-semibold text-slate-700 block mb-1">Konfirmasi Passphrase</label>
                                    <input
                                        type={showBackupPassphrase ? 'text' : 'password'}
                                        value={backupPassphraseConfirm}
                                        onChange={(e) => setBackupPassphraseConfirm(e.target.value)}
                                        placeholder="Ketik ulang passphrase di atas..."
                                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-emerald-600"
                                        required
                                    />
                                    {backupPassphrase && backupPassphraseConfirm && backupPassphrase !== backupPassphraseConfirm && (
                                        <p className="text-[11px] text-rose-600 mt-1">Konfirmasi passphrase tidak cocok.</p>
                                    )}
                                </div>

                                <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-100 text-[11px] text-emerald-800 space-y-1">
                                    <div className="font-semibold flex items-center gap-1.5">
                                        <Shield className="w-3.5 h-3.5 text-emerald-600"/>
                                        <span>Jaminan Keamanan Kriptografis:</span>
                                    </div>
                                    <p className="text-slate-600 leading-relaxed">
                                        Berkas `.kfin.enc` menggunakan salt 16-byte acak dan IV 12-byte acak setiap kali dibuat. Passphrase Anda tidak pernah disimpan ke berkas maupun disk.
                                    </p>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isEncrypting || !backupPassphrase || backupPassphrase !== backupPassphraseConfirm}
                                    className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                                >
                                    <Download className="w-4 h-4"/>
                                    <span>{isEncrypting ? 'Mengenkripsi Data...' : 'Enkripsi & Unduh Cadangan (.kfin.enc)'}</span>
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Kartu Pulihkan Cadangan Terenkripsi */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <FileCheck className="w-5 h-5"/>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900">Pulihkan dari Cadangan Terenkripsi (.kfin.enc)</h4>
                                    <p className="text-xs text-slate-500">Verifikasi dekripsi mandiri dan tinjau pratinjau data</p>
                                </div>
                            </div>

                            <div className="space-y-3.5 mt-4">
                                <div>
                                    <label className="text-xs font-semibold text-slate-700 block mb-1">Pilih Berkas Cadangan (.kfin.enc)</label>
                                    <input
                                        ref={encryptedFileInputRef}
                                        type="file"
                                        accept=".enc,.kfin.enc,.json"
                                        onChange={handleEncryptedFileSelect}
                                        className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer border border-slate-300 rounded-lg p-1"
                                    />
                                    {restoreFile && (
                                        <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                                            Berkas terpilih: {restoreFile.name} ({formatFileSize(restoreFile.size)})
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="text-xs font-semibold text-slate-700 block mb-1">Passphrase Pemulihan</label>
                                    <div className="relative">
                                        <input
                                            type={showRestorePassphrase ? 'text' : 'password'}
                                            value={restorePassphrase}
                                            onChange={(e) => setRestorePassphrase(e.target.value)}
                                            placeholder="Masukkan passphrase yang digunakan saat mencadangkan..."
                                            className="w-full pl-3 pr-16 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-emerald-600"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowRestorePassphrase(!showRestorePassphrase)}
                                            className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[11px] text-slate-400 hover:text-slate-600"
                                        >
                                            {showRestorePassphrase ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handlePreviewEncryptedBackup}
                                    disabled={isDecrypting || !restoreFileContent || !restorePassphrase}
                                    className="w-full py-2.5 px-4 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-50 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <FileCheck className="w-4 h-4 text-emerald-600"/>
                                    <span>{isDecrypting ? 'Mendekripsi...' : 'Periksa & Buka Pratinjau Cadangan (Restore Preview)'}</span>
                                </button>
                            </div>
                        </div>

                        {hasSnapshot && (
                            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-[11px] text-slate-500">Tersedia snapshot sebelum restore terakhir</span>
                                <button
                                    type="button"
                                    onClick={handleRollbackSnapshot}
                                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors"
                                >
                                    <RotateCcw className="w-3 h-3"/>
                                    <span>Batalkan Restore (Rollback)</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Dialog / Kartu Pratinjau Pemulihan (Restore Preview) */}
                {restorePreviewData && (
                    <div className="bg-white border-2 border-emerald-500 rounded-xl p-5 sm:p-6 shadow-md animate-slide-up space-y-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <ShieldCheck className="w-5 h-5 text-emerald-600"/>
                                    <h4 className="text-sm font-bold text-slate-900">
                                        Pratinjau Pemulihan Data (Restore Preview)
                                    </h4>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        AES-256-GCM Terverifikasi
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    Berkas: {restorePreviewData.filename} • Waktu Cadangan: {new Date(restorePreviewData.timestamp).toLocaleString('id-ID')}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setRestorePreviewData(null)}
                                className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
                            >
                                Tutup
                            </button>
                        </div>

                        {/* Tabel Perbandingan Cadangan vs Data Aktif Saat Ini */}
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                                    <tr>
                                        <th className="p-3">Indikator Data</th>
                                        <th className="p-3">Isi Berkas Cadangan</th>
                                        <th className="p-3">Data Aktif Saat Ini</th>
                                        <th className="p-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    <tr>
                                        <td className="p-3 font-semibold text-slate-800">Jumlah Akun Rekening</td>
                                        <td className="p-3 text-emerald-700 font-bold">{restorePreviewData.summary.accounts_count} akun</td>
                                        <td className="p-3 text-slate-600">{currentSummary?.accounts_count || 0} akun</td>
                                        <td className="p-3 text-slate-500">Akan digantikan</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 font-semibold text-slate-800">Total Transaksi</td>
                                        <td className="p-3 text-emerald-700 font-bold">{restorePreviewData.summary.transactions_count} transaksi</td>
                                        <td className="p-3 text-slate-600">{currentSummary?.transactions_count || 0} transaksi</td>
                                        <td className="p-3 text-slate-500">Akan digantikan</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 font-semibold text-slate-800">Total Saldo IDR</td>
                                        <td className="p-3 text-emerald-700 font-bold">
                                            Rp {(restorePreviewData.summary.balances?.IDR || 0).toLocaleString('id-ID')}
                                        </td>
                                        <td className="p-3 text-slate-600">
                                            Rp {(currentSummary?.balances?.IDR || 0).toLocaleString('id-ID')}
                                        </td>
                                        <td className="p-3 text-slate-500">Akan digantikan</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 font-semibold text-slate-800">Total Saldo USD</td>
                                        <td className="p-3 text-emerald-700 font-bold">
                                            $ {(restorePreviewData.summary.balances?.USD || 0).toLocaleString('en-US')}
                                        </td>
                                        <td className="p-3 text-slate-600">
                                            $ {(currentSummary?.balances?.USD || 0).toLocaleString('en-US')}
                                        </td>
                                        <td className="p-3 text-slate-500">Akan digantikan</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 font-semibold text-slate-800">Kategori Transaksi</td>
                                        <td className="p-3 text-emerald-700 font-bold">{restorePreviewData.summary.categories_count} kategori</td>
                                        <td className="p-3 text-slate-600">{currentSummary?.categories_count || 0} kategori</td>
                                        <td className="p-3 text-slate-500">Akan digantikan</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"/>
                            <div>
                                <span className="font-bold block">Peringatan Keamanan Pemulihan:</span>
                                Menerapkan pemulihan ini akan menimpa data aktif saat ini dengan data dari cadangan terenkripsi. Snapshot pengaman data sebelum pemulihan akan dibuat otomatis sehingga dapat dibatalkan jika diperlukan.
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setRestorePreviewData(null)}
                                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-lg transition-colors cursor-pointer"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleApplyEncryptedRestore}
                                disabled={isApplyingRestore}
                                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer flex items-center gap-2 shadow-xs"
                            >
                                <CheckCircle2 className="w-4 h-4"/>
                                <span>{isApplyingRestore ? 'Menerapkan Data...' : 'Terapkan Pemulihan Sekarang'}</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Panduan Penyimpanan Aman di GitHub Private Repository */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                            <FolderGit2 className="w-5 h-5"/>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-slate-900">
                                Panduan Alur Penyimpanan Aman di GitHub Private
                            </h3>
                            <p className="text-xs text-slate-500">
                                Cara menyimpan berkas cadangan terenkripsi (.kfin.enc) ke repository pribadi tanpa risiko kebocoran
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center">
                                1
                            </div>
                            <h5 className="text-xs font-bold text-slate-900">Buat Repository Private</h5>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                                Buat repository baru di GitHub bernama `kayla-finance-private-backups`. Pastikan memilih opsi **Private**, bukan Public.
                            </p>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center">
                                2
                            </div>
                            <h5 className="text-xs font-bold text-slate-900">Unduh Berkas .kfin.enc</h5>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                                Gunakan formulir di atas untuk mengunduh cadangan terenkripsi. Seluruh saldo dan transaksi terenkripsi kuat dengan AES-256-GCM.
                            </p>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center">
                                3
                            </div>
                            <h5 className="text-xs font-bold text-slate-900">Unggah ke Repository</h5>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                                Unggah berkas `.kfin.enc` secara manual ke repository private melalui web GitHub (Add file &gt; Upload files) atau Git CLI.
                            </p>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center">
                                4
                            </div>
                            <h5 className="text-xs font-bold text-slate-900">Pulihkan Kapan Saja</h5>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                                Di perangkat laptop atau ponsel lain, unduh berkas dari GitHub Private Anda, lalu gunakan formulir "Pulihkan" di halaman ini.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Cadangan File Standar Komputer (data/backups/ & Ekspor JSON) */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <Archive className="w-5 h-5"/>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-slate-900">Cadangan Berkas Komputer Lokal</h3>
                            <p className="text-xs text-slate-500">
                                Pencadangan berkas otomatis sebelum mutasi serta ekspor dan impor manual format JSON
                            </p>
                        </div>
                    </div>

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

                    <div className="mt-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold text-slate-900">
                                Berkas Cadangan Tersimpan di Komputer (data/backups/)
                            </span>
                            <span className="text-[11px] text-slate-500">
                                {backups.length} berkas cadangan ditemukan
                            </span>
                        </div>

                        {backups.length > 0 ? (
                            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                                {backups.map((b) => (
                                    <div key={b.filename} className="p-3 bg-white hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
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
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 rounded-lg">
                                Belum ada salinan cadangan otomatis di folder data/backups/.
                            </p>
                        )}
                    </div>
                </div>

                {/* Konfigurasi Aplikasi Umum */}
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
                                    <button type="button" onClick={() => setDefaultCurrency('IDR')} className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${
                                        defaultCurrency === 'IDR'
                                            ? 'bg-emerald-50 border-emerald-600 text-emerald-700'
                                            : 'bg-white border-slate-200 text-slate-600'
                                    }`}>
                                        IDR (Rupiah)
                                    </button>
                                    <button type="button" onClick={() => setDefaultCurrency('USD')} className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${
                                        defaultCurrency === 'USD'
                                            ? 'bg-emerald-50 border-emerald-600 text-emerald-700'
                                            : 'bg-white border-slate-200 text-slate-600'
                                    }`}>
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
                        {data?.sync_logs && data.sync_logs.length > 0 ? (
                            data.sync_logs.map((log) => (
                                <div key={log.id} className="py-3 flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-3">
                                        {log.status === 'success' ? (
                                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0"/>
                                        ) : (
                                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0"/>
                                        )}
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
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-slate-400 py-4">Belum ada catatan log sinkronisasi.</p>
                        )}
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
                        {data?.categories?.map((cat) => (
                            <span key={cat.id} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-700 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color || '#059669' }}></span>
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