'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import Header from '@/components/Header';
import ScanModal from '@/components/ScanModal';
import CustomSelect, { SelectOption } from '@/components/CustomSelect';
import { DatabaseSchema, Transaction, TransactionType } from '@/lib/types';
import { loadDatabase } from '@/lib/client-data';
import { 
  Plus, 
  UploadCloud, 
  Search, 
  Trash2, 
  CheckCircle, 
  ArrowDownLeft, 
  ArrowUpRight,
  ScanLine,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';

function formatCurrency(amount: number, currency: string = 'IDR') {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}

function TransactionsContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<DatabaseSchema | null>(null);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanDefaultType, setScanDefaultType] = useState<'income' | 'expense'>('expense');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');

  const [accountId, setAccountId] = useState('');
  const [txType, setTxType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [destAccountId, setDestAccountId] = useState('');
  const [notes, setNotes] = useState('');

  const [importAccountId, setImportAccountId] = useState('');
  const [csvContent, setCsvContent] = useState('');
  const [importResult, setImportResult] = useState<{ count: number; skipped: number } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const typeFilterOptions: SelectOption[] = useMemo(() => [
    { value: 'all', label: 'Semua Jenis' },
    { value: 'income', label: 'Pemasukan' },
    { value: 'expense', label: 'Pengeluaran' },
    { value: 'transfer', label: 'Transfer' },
    { value: 'trading', label: 'Trading' },
  ], []);

  const accountFilterOptions: SelectOption[] = useMemo(() => [
    { value: 'all', label: 'Semua Akun' },
    ...(data?.accounts.map((a) => ({
      value: a.id,
      label: a.name,
      badge: a.currency,
    })) || []),
  ], [data?.accounts]);

  const accountOptions: SelectOption[] = useMemo(() => (
    data?.accounts.map((a) => ({
      value: a.id,
      label: a.name,
      subLabel: `(${a.provider || a.account_type})`,
      badge: a.currency,
    })) || []
  ), [data?.accounts]);

  const destAccountOptions: SelectOption[] = useMemo(() => (
    data?.accounts
      .filter((a) => a.id !== accountId)
      .map((a) => ({
        value: a.id,
        label: a.name,
        subLabel: `(${a.provider || a.account_type})`,
        badge: a.currency,
      })) || []
  ), [data?.accounts, accountId]);

  const categoryOptions: SelectOption[] = useMemo(() => [
    { value: '', label: 'Tanpa Kategori' },
    ...(data?.categories
      .filter((c) => c.category_type === txType)
      .map((c) => ({
        value: c.id,
        label: c.name,
      })) || []),
  ], [data?.categories, txType]);

  const importAccountOptions: SelectOption[] = useMemo(() => (
    data?.accounts.map((a) => ({
      value: a.id,
      label: a.name,
      subLabel: `(${a.provider})`,
      badge: a.currency,
    })) || []
  ), [data?.accounts]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const json = await loadDatabase();
      if (json) {
        setData(json);
        if (json.accounts.length > 0 && !accountId) {
          setAccountId(json.accounts[0].id);
          setImportAccountId(json.accounts[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    if (searchParams.get('action') === 'new') {
      setShowAddModal(true);
    }
  }, [searchParams]);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !amount || !accountId) return;
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: accountId,
          transaction_type: txType,
          amount: parseFloat(amount),
          description,
          category_id: categoryId || undefined,
          destination_account_id: txType === 'transfer' ? destAccountId : undefined,
          notes,
          source: 'manual',
        })
      });
      if (res.ok) {
        setShowAddModal(false);
        setDescription('');
        setAmount('');
        setNotes('');
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Yakin ingin menghapus transaksi ini? Saldo akun akan dikembalikan secara otomatis.')) return;
    try {
      const res = await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleImportCSV = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvContent.trim() || !importAccountId) return;
    try {
      setIsImporting(true);
      const res = await fetch('/api/transactions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: importAccountId, csvData: csvContent })
      });
      const resJson = await res.json();
      if (res.ok) {
        setImportResult({ count: resJson.importedCount, skipped: resJson.duplicatesSkipped });
        setCsvContent('');
        fetchData();
      } else {
        alert(resJson.error || 'Gagal memproses impor CSV');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsImporting(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];
    return data.transactions.filter(tx => {
      const matchSearch = tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          tx.notes?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchType = filterType === 'all' || tx.transaction_type === filterType;
      const matchAccount = filterAccount === 'all' || tx.account_id === filterAccount;
      return matchSearch && matchType && matchAccount;
    });
  }, [data?.transactions, searchTerm, filterType, filterAccount]);

  return (
    <div className="flex-1 flex flex-col bg-slate-50 pb-12">
      <Header
        title="Riwayat & Pencatatan Transaksi"
        subtitle="Pencatatan manual, filter multi-akun, dan parser mutasi CSV/Excel"
        onRefresh={fetchData}
        isRefreshing={loading}
      />

      <main className="p-4 sm:p-8 space-y-4 sm:space-y-6 max-w-7xl">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[140px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari transaksi..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 shadow-xs"
              />
            </div>
            <div className="w-[120px] sm:w-[130px]">
              <CustomSelect value={filterType} onChange={setFilterType} options={typeFilterOptions} size="sm" />
            </div>
            <div className="w-[140px] sm:w-[160px]">
              <CustomSelect value={filterAccount} onChange={setFilterAccount} options={accountFilterOptions} size="sm" />
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => { setScanDefaultType('expense'); setShowScanModal(true); }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg shrink-0"
            >
              <ScanLine className="w-4 h-4" />
              <span>Scan Bukti</span>
            </button>
            <button
              onClick={() => { setShowImportModal(true); setImportResult(null); }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg shrink-0"
            >
              <UploadCloud className="w-4 h-4 text-slate-600" />
              <span>Impor CSV</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Catat</span>
            </button>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {filteredTransactions.length > 0 ? (
            filteredTransactions.map((tx) => {
              const acc = data?.accounts.find(a => a.id === tx.account_id);
              const destAcc = tx.destination_account_id ? data?.accounts.find(a => a.id === tx.destination_account_id) : null;
              const cat = data?.categories.find(c => c.id === tx.category_id);
              const isUSD = acc?.currency === 'USD';
              const isIncome = tx.transaction_type === 'income' || tx.transaction_type === 'trading';
              const isTransfer = tx.transaction_type === 'transfer';
              return (
                <div key={tx.id} className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isIncome ? 'bg-emerald-50 text-emerald-600' : isTransfer ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {isIncome ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-900 leading-snug break-words">{tx.description}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-1.5">
                          <span>{new Date(tx.transaction_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                          <span>•</span>
                          <span className="truncate">{acc?.provider || acc?.name || 'Akun'}</span>
                          {destAcc && <span className="text-emerald-700">→ {destAcc.provider || destAcc.name}</span>}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-medium">
                            {cat?.name || (isTransfer ? 'Transfer' : 'Umum')}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold text-slate-500 bg-slate-50">{tx.source}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-xs font-bold whitespace-nowrap ${
                        isIncome ? 'text-emerald-600' : isTransfer ? 'text-blue-600' : 'text-slate-900'
                      }`}>
                        {isIncome ? '+' : isTransfer ? '' : '-'}{formatCurrency(tx.amount, isUSD ? 'USD' : 'IDR')}
                      </div>
                      <button onClick={() => handleDelete(tx.id)} className="mt-1 p-1 text-slate-400 hover:text-rose-600" title="Hapus">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl py-12 text-center text-slate-400 text-xs">
              Tidak ada transaksi yang cocok dengan kriteria pencarian.
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Deskripsi</th>
                  <th className="py-3 px-4">Akun Sumber</th>
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4">Sumber</th>
                  <th className="py-3 px-4 text-right">Nominal</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.length > 0 ? (
                  filteredTransactions.map((tx) => {
                    const acc = data?.accounts.find(a => a.id === tx.account_id);
                    const destAcc = tx.destination_account_id ? data?.accounts.find(a => a.id === tx.destination_account_id) : null;
                    const cat = data?.categories.find(c => c.id === tx.category_id);
                    const isUSD = acc?.currency === 'USD';
                    const isIncome = tx.transaction_type === 'income' || tx.transaction_type === 'trading';
                    const isTransfer = tx.transaction_type === 'transfer';
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          {new Date(tx.transaction_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{tx.description}</div>
                          {tx.notes && <div className="text-[11px] text-slate-500 mt-0.5">{tx.notes}</div>}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="text-slate-800 font-medium">{acc?.provider || acc?.name}</span>
                          {destAcc && <div className="text-[10px] text-emerald-700 font-medium mt-0.5">ke {destAcc.provider || destAcc.name}</div>}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-medium">
                            {cat?.name || (isTransfer ? 'Transfer Internal' : 'Umum')}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{tx.source}</span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap font-bold">
                          <span className={isIncome ? 'text-emerald-600' : isTransfer ? 'text-blue-600' : 'text-slate-900'}>
                            {isIncome ? '+' : isTransfer ? '' : '-'}{formatCurrency(tx.amount, isUSD ? 'USD' : 'IDR')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button onClick={() => handleDelete(tx.id)} className="p-1 text-slate-400 hover:text-rose-600" title="Hapus">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">Tidak ada transaksi yang cocok dengan kriteria pencarian.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {showScanModal && data && (
        <ScanModal
          accounts={data.accounts}
          categories={data.categories}
          existingTransactions={data.transactions}
          defaultType={scanDefaultType}
          onClose={() => setShowScanModal(false)}
          onSaved={() => { setShowScanModal(false); fetchData(); }}
        />
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg p-5 sm:p-6 shadow-xl max-h-[92vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 mb-4">Catat Transaksi Baru</h3>
            <form onSubmit={handleAddTransaction} className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {(['expense', 'income', 'transfer'] as TransactionType[]).map((t) => (
                  <button key={t} type="button" onClick={() => setTxType(t)} className={`py-2 rounded-lg text-xs font-semibold border ${
                    txType === t
                      ? t === 'expense' ? 'bg-rose-50 border-rose-300 text-rose-700'
                        : t === 'income' ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'border-slate-200 text-slate-600'
                  }`}>
                    {t === 'expense' ? 'Pengeluaran' : t === 'income' ? 'Pemasukan' : 'Transfer'}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Deskripsi</label>
                <input type="text" required value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-emerald-600" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Nominal</label>
                  <input type="number" step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-emerald-600" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Akun Sumber</label>
                  <CustomSelect value={accountId} onChange={setAccountId} options={accountOptions} placeholder="Pilih akun" />
                </div>
              </div>
              {txType === 'transfer' && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Akun Tujuan</label>
                  <CustomSelect value={destAccountId} onChange={setDestAccountId} options={destAccountOptions} placeholder="Pilih tujuan" />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Kategori</label>
                <CustomSelect value={categoryId} onChange={setCategoryId} options={categoryOptions} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-xs font-semibold text-slate-600">Batal</button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg p-5 sm:p-6 shadow-xl max-h-[92vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 mb-4">Impor Mutasi CSV</h3>
            <form onSubmit={handleImportCSV} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Akun Tujuan Impor</label>
                <CustomSelect value={importAccountId} onChange={setImportAccountId} options={importAccountOptions} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Isi CSV</label>
                <textarea value={csvContent} onChange={(e) => setCsvContent(e.target.value)} rows={8} placeholder="Date, Description, Amount, Type, RefNo" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-600" />
              </div>
              {importResult && (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  Berhasil impor {importResult.count} baris. Duplikat dilewati: {importResult.skipped}.
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowImportModal(false)} className="px-4 py-2 text-xs font-semibold text-slate-600">Tutup</button>
                <button type="submit" disabled={isImporting} className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg disabled:opacity-50">
                  {isImporting ? 'Memproses...' : 'Mulai Impor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 text-xs">Memuat halaman transaksi...</div>}>
      <TransactionsContent />
    </Suspense>
  );
}
