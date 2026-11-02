'use client';
import React, { useEffect, useState } from 'react';
import CustomSelect from '@/components/CustomSelect';
import { loadDatabase, apiUrl, getCachedDatabase } from '@/lib/client-data';
import { Building2, Smartphone, CandlestickChart, CreditCard, Plus, CheckCircle2, XCircle, Edit3, Trash2, AlertCircle, AlertTriangle } from 'lucide-react';
/**
 * Memformat nominal angka ke format mata uang (USD atau IDR).
 * @param {number} amount
 * @param {string} currency
 * @returns {string}
 */
function formatCurrency(amount, currency) {
    if (currency === 'USD') {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    }
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}
const TYPE_ICONS = {
    bank: Building2,
    ewallet: Smartphone,
    trading: CandlestickChart,
    payment_gateway: CreditCard,
};
const TYPE_LABELS = {
    bank: 'Rekening Bank',
    ewallet: 'E-Wallet',
    trading: 'Akun Trading (MT5)',
    payment_gateway: 'Payment Gateway (Mayar)',
};
/**
 * Halaman Manajemen Akun Keuangan (Bank, E-Wallet, MT5 Trading, Payment Gateway).
 * @returns {React.ReactElement}
 */
export default function AccountsPage() {
    const [data, setData] = useState(() => getCachedDatabase());
    const [loading, setLoading] = useState(() => !getCachedDatabase());
    const [showAddModal, setShowAddModal] = useState(false);
    const [editAccount, setEditAccount] = useState(null);
    const [deleteConfirmAccount, setDeleteConfirmAccount] = useState(null);
    const [actionMessage, setActionMessage] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    // New account form state
    const [name, setName] = useState('');
    const [provider, setProvider] = useState('');
    const [accountType, setAccountType] = useState('bank');
    const [currency, setCurrency] = useState('IDR');
    const [balance, setBalance] = useState('0');
    const [ledger, setLedger] = useState('personal');
    const fetchData = async () => {
        try {
            setLoading(true);
            const json = await loadDatabase();
            if (json) {
                setData(json);
            }
        }
        catch (err) {
            console.error(err);
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        fetchData();
        const handleUpdate = () => {
            fetchData();
        };
        window.addEventListener('kayla_db_updated', handleUpdate);
        return () => {
            window.removeEventListener('kayla_db_updated', handleUpdate);
        };
    }, []);
    const handleCreate = async (e) => {
        e.preventDefault();
        if (!name.trim())
            return;
        try {
            setActionMessage(null);
            const res = await fetch(apiUrl('/api/accounts'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    provider: provider || name,
                    account_type: accountType,
                    currency,
                    current_balance: parseFloat(balance) || 0,
                    ledger,
                })
            });
            const resJson = await res.json();
            if (res.ok && resJson.success) {
                setShowAddModal(false);
                setName('');
                setProvider('');
                setBalance('0');
                setLedger('personal');
                setActionMessage({ type: 'success', text: `Akun "${resJson.account.name}" berhasil ditambahkan.` });
                fetchData();
            }
            else {
                setActionMessage({ type: 'error', text: resJson.error || 'Gagal menambahkan akun.' });
            }
        }
        catch (err) {
            setActionMessage({ type: 'error', text: 'Terjadi kesalahan sistem: ' + String(err) });
        }
    };
    const handleUpdateBalance = async (e) => {
        e.preventDefault();
        if (!editAccount)
            return;
        try {
            setActionMessage(null);
            const res = await fetch(apiUrl('/api/accounts'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editAccount.id,
                    name: editAccount.name,
                    provider: editAccount.provider,
                    current_balance: editAccount.current_balance,
                    is_active: editAccount.is_active,
                    ledger: editAccount.ledger,
                })
            });
            const resJson = await res.json();
            if (res.ok && resJson.success) {
                setEditAccount(null);
                setActionMessage({ type: 'success', text: `Akun "${editAccount.name}" berhasil diperbarui.` });
                fetchData();
            }
            else {
                setActionMessage({ type: 'error', text: resJson.error || 'Gagal memperbarui akun.' });
            }
        }
        catch (err) {
            setActionMessage({ type: 'error', text: 'Terjadi kesalahan sistem: ' + String(err) });
        }
    };
    const handleDelete = async () => {
        if (!deleteConfirmAccount)
            return;
        try {
            setIsDeleting(true);
            setActionMessage(null);
            const res = await fetch(apiUrl(`/api/accounts?id=${deleteConfirmAccount.id}`), {
                method: 'DELETE',
            });
            const resJson = await res.json();
            if (res.ok && resJson.success) {
                setActionMessage({ type: 'success', text: `Akun "${deleteConfirmAccount.name}" berhasil dihapus.` });
                setDeleteConfirmAccount(null);
                fetchData();
            }
            else {
                setActionMessage({ type: 'error', text: resJson.error || 'Gagal menghapus akun.' });
                setDeleteConfirmAccount(null);
            }
        }
        catch (err) {
            setActionMessage({ type: 'error', text: 'Gagal menghubungi server: ' + String(err) });
            setDeleteConfirmAccount(null);
        }
        finally {
            setIsDeleting(false);
        }
    };
    const toggleStatus = async (account) => {
        try {
            setActionMessage(null);
            const res = await fetch(apiUrl('/api/accounts'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: account.id,
                    is_active: !account.is_active,
                })
            });
            const resJson = await res.json();
            if (res.ok && resJson.success) {
                setActionMessage({
                    type: 'success',
                    text: `Status akun "${account.name}" berhasil diubah menjadi ${!account.is_active ? 'Aktif' : 'Nonaktif'}.`
                });
                fetchData();
            }
        }
        catch (err) {
            console.error(err);
        }
    };
    return (<div className="flex-1 flex flex-col bg-slate-50 pb-12">
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl">
        {/* Banner Notifikasi Feedback */}
        {actionMessage && (<div className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${actionMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
            {actionMessage.type === 'success' ? (<CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600"/>) : (<AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600"/>)}
            <div className="text-xs font-semibold flex-1">{actionMessage.text}</div>
            <button onClick={() => setActionMessage(null)} className="text-xs font-bold opacity-60 hover:opacity-100">
              Tutup
            </button>
          </div>)}

        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">Daftar Akun Terdaftar</h3>
            <p className="text-xs text-slate-500">Total {data?.accounts.length || 0} akun aktif dan terintegrasi</p>
          </div>
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-xs btn-interactive">
            <Plus className="w-4 h-4"/>
            <span>Tambah Akun</span>
          </button>
        </div>

        {/* Grid of Accounts (FigCraft 02_Accounts_Desktop) */}
        {data && data.accounts.length > 0 ? (<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.accounts.map((acc) => {
                const Icon = TYPE_ICONS[acc.account_type] || Building2;
                return (<div key={acc.id} className={`bg-white border rounded-xl p-5 flex flex-col justify-between shadow-xs card-interactive ${acc.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50'}`}>
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                          <Icon className="w-5 h-5"/>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-sm font-semibold text-slate-900 leading-tight">{acc.name}</h4>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${acc.ledger === 'business' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600'}`}>
                              {acc.ledger === 'business' ? 'Bisnis' : 'Pribadi'}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500">{TYPE_LABELS[acc.account_type]} • {acc.provider}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => toggleStatus(acc)} title={acc.is_active ? 'Nonaktifkan Akun' : 'Aktifkan Akun'} className="p-1 text-slate-400 hover:text-slate-600">
                          {acc.is_active ? (<CheckCircle2 className="w-4 h-4 text-emerald-600"/>) : (<XCircle className="w-4 h-4 text-slate-400"/>)}
                        </button>
                        <button onClick={() => setDeleteConfirmAccount(acc)} title="Hapus Akun" className="p-1 text-slate-300 hover:text-rose-600">
                          <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                      </div>
                    </div>

                    <div className="mt-5">
                      <span className="text-[11px] text-slate-500 font-medium">Saldo Terkini</span>
                      <div className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">
                        {formatCurrency(acc.current_balance, acc.currency)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span className="text-[11px]">
                      Sinkron: {new Date(acc.last_synced_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                    </span>
                    <button onClick={() => setEditAccount(acc)} className="flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-semibold text-xs">
                      <Edit3 className="w-3.5 h-3.5"/>
                      <span>Edit & Saldo</span>
                    </button>
                  </div>
                </div>);
            })}
          </div>) : (<div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs">
            Belum ada akun keuangan terdaftar. Silakan tambahkan akun pertama Anda.
          </div>)}
      </main>

      {/* Add Account Modal */}
      {showAddModal && (<div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-backdrop">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-md p-5 sm:p-6 shadow-xl animate-bottom-sheet sm:animate-modal max-h-[92vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 mb-4">Tambah Akun Keuangan</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Nama Akun</label>
                <input type="text" required placeholder="Contoh: Tabungan Mandiri Utama" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"/>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Penyedia / Bank / Broker</label>
                <input type="text" placeholder="Contoh: Mandiri, BCA, Exness, Mayar" value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"/>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Jenis Akun</label>
                  <CustomSelect value={accountType} onChange={(val) => setAccountType(val)} options={[
                { value: 'bank', label: 'Bank', subLabel: 'BCA, Mandiri, dll' },
                { value: 'ewallet', label: 'E-Wallet', subLabel: 'GoPay, OVO, Dana' },
                { value: 'trading', label: 'Trading MT5', subLabel: 'Exness, dll' },
                { value: 'payment_gateway', label: 'Payment Gateway', subLabel: 'Mayar' },
            ]}/>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Mata Uang</label>
                  <CustomSelect value={currency} onChange={(val) => setCurrency(val)} options={[
                { value: 'IDR', label: 'IDR', subLabel: 'Rupiah' },
                { value: 'USD', label: 'USD', subLabel: 'Dollar' },
            ]}/>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Saldo Awal</label>
                  <input type="number" step="any" value={balance} onChange={(e) => setBalance(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-600"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Kategori Buku</label>
                  <CustomSelect value={ledger} onChange={(val) => setLedger(val)} options={[
                { value: 'personal', label: 'Pribadi' },
                { value: 'business', label: 'Bisnis' },
            ]}/>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 btn-interactive">
                  Batal
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-xs btn-interactive">
                  Simpan Akun
                </button>
              </div>
            </form>
          </div>
        </div>)}

      {/* Edit / Reconciliation Modal */}
      {editAccount && (<div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-backdrop">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 shadow-xl animate-modal">
            <h3 className="text-base font-bold text-slate-900 mb-1">Edit Akun & Rekonsiliasi Saldo</h3>
            <p className="text-xs text-slate-500 mb-4">{editAccount.name} ({editAccount.provider})</p>
            <form onSubmit={handleUpdateBalance} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Nama Akun</label>
                <input type="text" required value={editAccount.name} onChange={(e) => setEditAccount({ ...editAccount, name: e.target.value })} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-600"/>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Penyedia</label>
                <input type="text" value={editAccount.provider} onChange={(e) => setEditAccount({ ...editAccount, provider: e.target.value })} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-600"/>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Saldo ({editAccount.currency})
                  </label>
                  <input type="number" step="any" value={editAccount.current_balance} onChange={(e) => setEditAccount({ ...editAccount, current_balance: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-600"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Buku Transaksi</label>
                  <CustomSelect value={editAccount.ledger || 'personal'} onChange={(val) => setEditAccount({ ...editAccount, ledger: val })} options={[
                { value: 'personal', label: 'Pribadi' },
                { value: 'business', label: 'Bisnis' },
            ]}/>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setEditAccount(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 btn-interactive">
                  Batal
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-xs btn-interactive">
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>)}

      {/* Delete Confirmation Modal */}
      {deleteConfirmAccount && (<div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-backdrop">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-sm p-5 shadow-xl animate-modal">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5"/>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Hapus Akun Keuangan?</h4>
                <p className="text-xs text-slate-500">{deleteConfirmAccount.name}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              Akun yang memiliki catatan transaksi atau terhubung ke akun MT5 tidak dapat dihapus untuk menjaga keutuhan riwayat mutasi.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setDeleteConfirmAccount(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900">
                Batal
              </button>
              <button type="button" disabled={isDeleting} onClick={handleDelete} className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50">
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>)}
    </div>);
}
