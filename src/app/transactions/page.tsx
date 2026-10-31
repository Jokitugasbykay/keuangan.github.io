'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import Header from '@/components/Header';
import ScanModal from '@/components/ScanModal';
import CustomSelect, { SelectOption } from '@/components/CustomSelect';
import { DatabaseSchema, Transaction, TransactionType } from '@/lib/types';
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

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanDefaultType, setScanDefaultType] = useState<'income' | 'expense'>('expense');

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');

  // New Transaction Form State
  const [accountId, setAccountId] = useState('');
  const [txType, setTxType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [destAccountId, setDestAccountId] = useState('');
  const [notes, setNotes] = useState('');

  // CSV Import Form State
  const [importAccountId, setImportAccountId] = useState('');
  const [csvContent, setCsvContent] = useState('');
  const [importResult, setImportResult] = useState<{ count: number; skipped: number } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Custom Select Options
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
      const res = await fetch('/api/data');
      if (res.ok) {
        const json = await res.json();
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
      if (res.ok) {
        fetchData();
      }
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
        body: JSON.stringify({
          accountId: importAccountId,
          csvData: csvContent,
        })
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

      <main className="p-4 sm:p-8 space-y-6 max-w-7xl">
        {/* Action Bar (FigCraft 03_Transactions_Desktop) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1 max-w-lg">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari transaksi atau catatan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 shadow-xs"
              />
            </div>

            <div className="w-[130px]">
              <CustomSelect
                value={filterType}
                onChange={setFilterType}
                options={typeFilterOptions}
                size="sm"
              />
            </div>

            <div className="w-[160px]">
              <CustomSelect
                value={filterAccount}
                onChange={setFilterAccount}
                options={accountFilterOptions}
                size="sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setScanDefaultType('expense'); setShowScanModal(true); }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors shadow-xs btn-interactive"
            >
              <ScanLine className="w-4 h-4" />
              <span>Scan Bukti</span>
            </button>
            <button
              onClick={() => { setShowImportModal(true); setImportResult(null); }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs btn-interactive"
            >
              <UploadCloud className="w-4 h-4 text-slate-600" />
              <span>Impor Mutasi CSV</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-xs btn-interactive"
            >
              <Plus className="w-4 h-4" />
              <span>Catat Transaksi</span>
            </button>
          </div>
        </div>

        {/* Transactions Table (FigCraft 03_Transactions_Desktop) */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
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
                      <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          {new Date(tx.transaction_date).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{tx.description}</div>
                          {tx.notes && <div className="text-[11px] text-slate-500 mt-0.5">{tx.notes}</div>}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="text-slate-800 font-medium">{acc?.provider || acc?.name}</span>
                          {destAcc && (
                            <div className="text-[10px] text-emerald-700 font-medium flex items-center gap-1 mt-0.5">
                              <span>ke {destAcc.provider || destAcc.name}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-medium">
                            {cat?.name || (isTransfer ? 'Transfer Internal' : 'Umum')}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            {tx.source}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap font-bold">
                          <span className={
                            isIncome ? 'text-emerald-600' : isTransfer ? 'text-blue-600' : 'text-slate-900'
                          }>
                            {isIncome ? '+' : isTransfer ? '' : '-'}{formatCurrency(tx.amount, isUSD ? 'USD' : 'IDR')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => handleDelete(tx.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Hapus Transaksi"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                      Tidak ada transaksi yang cocok dengan kriteria pencarian.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Add Transaction Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-backdrop">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg p-5 sm:p-6 shadow-xl animate-bottom-sheet sm:animate-modal max-h-[92vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 mb-4">Catat Transaksi Baru</h3>
            <form onSubmit={handleAddTransaction} className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTxType('expense')}
                  className={`py-2 rounded-lg text-xs font-semibold border btn-interactive ${
                    txType === 'expense'
                      ? 'bg-rose-50 border-rose-300 text-rose-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Pengeluaran
                </button>
                <button
                  type="button"
                  onClick={() => setTxType('income')}
                  className={`py-2 rounded-lg text-xs font-semibold border btn-interactive ${
                    txType === 'income'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Pemasukan
                </button>
                <button
                  type="button"
                  onClick={() => setTxType('transfer')}
                  className={`py-2 rounded-lg text-xs font-semibold border btn-interactive ${
                    txType === 'transfer'
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Transfer
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Deskripsi / Keterangan</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Belanja Bulanan Supermarket"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Nominal</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="Contoh: 150000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Akun Sumber</label>
                  <CustomSelect
                    value={accountId}
                    onChange={setAccountId}
                    options={accountOptions}
                    placeholder="Pilih Akun Sumber"
                  />
                </div>
              </div>

              {txType === 'transfer' ? (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Akun Tujuan (Transfer)</label>
                  <CustomSelect
                    value={destAccountId}
                    onChange={setDestAccountId}
                    options={destAccountOptions}
                    placeholder="Pilih Akun Penerima"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Kategori</label>
                  <CustomSelect
                    value={categoryId}
                    onChange={setCategoryId}
                    options={categoryOptions}
                    placeholder="Tanpa Kategori"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Catatan Tambahan (Opsional)</label>
                <textarea
                  rows={2}
                  placeholder="Catatan kecil..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setDescription('');
                    setAmount('');
                    setNotes('');
                    setCategoryId('');
                    setDestAccountId('');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 btn-interactive"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-xs btn-interactive"
                >
                  Simpan Transaksi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Scan Bukti Transaksi Modal */}
      {showScanModal && data && (
        <ScanModal
          accounts={data.accounts}
          categories={data.categories}
          existingTransactions={data.transactions}
          defaultType={scanDefaultType}
          onClose={() => setShowScanModal(false)}
          onSaved={() => {
            setShowScanModal(false);
            fetchData();
          }}
        />
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-backdrop">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-xl p-5 sm:p-6 shadow-xl animate-bottom-sheet sm:animate-modal max-h-[92vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 mb-1">Impor Mutasi Rekening (CSV/Teks)</h3>
            <p className="text-xs text-slate-500 mb-4">
              Format standar: Tanggal, Deskripsi, Nominal, Tipe (CR/DB), RefID (Opsional). Duplikat akan otomatis diabaikan.
            </p>

            {importResult && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800 animate-slide-down">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>
                  Berhasil mengimpor {importResult.count} transaksi baru ({importResult.skipped} duplikat diabaikan).
                </span>
              </div>
            )}

            <form onSubmit={handleImportCSV} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Target Akun Rekening</label>
                <CustomSelect
                  value={importAccountId}
                  onChange={setImportAccountId}
                  options={importAccountOptions}
                  placeholder="Pilih Target Akun"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Tempel Data CSV / Mutasi</label>
                  <button
                    type="button"
                    onClick={() => {
                      setCsvContent(
`Date,Description,Amount,Type,RefNo
2026-10-25,Transfer Masuk Klien,3500000,CR,REF-001
2026-10-26,Pembayaran Merchant QRIS,125000,DB,REF-002
2026-10-27,Tarik Tunai ATM,500000,DB,REF-003`
                      );
                    }}
                    className="text-[11px] text-emerald-700 font-semibold hover:underline"
                  >
                    Gunakan Contoh Format
                  </button>
                </div>
                <textarea
                  rows={6}
                  required
                  placeholder="Date,Description,Amount,Type,RefNo&#10;2026-10-25,Transfer Masuk,2500000,CR,REF123"
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 btn-interactive"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  disabled={isImporting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-xs btn-interactive"
                >
                  {isImporting ? 'Memproses...' : 'Mulai Impor Mutasi'}
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
    <Suspense fallback={
      <div className="p-8 text-center text-slate-400 text-xs">Memuat halaman transaksi...</div>
    }>
      <TransactionsContent />
    </Suspense>
  );
}
