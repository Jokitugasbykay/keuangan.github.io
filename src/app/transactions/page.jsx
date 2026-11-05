'use client';
import React, { useEffect, useState, useMemo, useRef, Suspense } from 'react';
import ScanModal from '@/components/ScanModal';
import CustomSelect from '@/components/CustomSelect';
import { 
    loadDatabase, 
    saveTransactionClient, 
    updateTransactionClient, 
    deleteTransactionClient, 
    exportDatabaseToJson, 
    importDatabaseFromJson, 
    importCsvTransactionsClient,
    apiUrl, 
    getCachedDatabase 
} from '@/lib/client-data';
import { Plus, UploadCloud, Search, Trash2, Edit3, CheckCircle2, AlertCircle, AlertTriangle, ArrowDownLeft, ArrowUpRight, ScanLine, Download, FileJson, RotateCcw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
function formatCurrency(amount, currency = 'IDR') {
    if (currency === 'USD') {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    }
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}
/**
 * @typedef {Object} SwipeableTransactionCardProps
 * @property {import('@/lib/types').Transaction} tx
 * @property {import('@/lib/types').Account} [acc]
 * @property {import('@/lib/types').Account|null} [destAcc]
 * @property {import('@/lib/types').Category} [cat]
 * @property {boolean} isUSD
 * @property {boolean} isIncome
 * @property {boolean} isTransfer
 * @property {(tx: import('@/lib/types').Transaction) => void} onEdit
 * @property {(tx: import('@/lib/types').Transaction) => void} onDelete
 */

/**
 * Komponen kartu transaksi dengan swipe gesture natural untuk aksi Edit dan Hapus di mobile.
 * @param {SwipeableTransactionCardProps} props
 * @returns {React.ReactElement}
 */
function SwipeableTransactionCard({ tx, acc, destAcc, cat, isUSD, isIncome, isTransfer, onEdit, onDelete, }) {
    const [isOpen, setIsOpen] = useState(false);
    const cardRef = useRef(null);
    const currentOffsetRef = useRef(0);
    const touchStartRef = useRef(null);
    const resetCardPosition = (duration = 200) => {
        if (cardRef.current) {
            cardRef.current.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.9, 0.3, 1)`;
            cardRef.current.style.transform = 'translate3d(0, 0, 0)';
        }
        currentOffsetRef.current = 0;
        setIsOpen(false);
    };
    const openCardPosition = (duration = 200) => {
        if (cardRef.current) {
            cardRef.current.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.9, 0.3, 1)`;
            cardRef.current.style.transform = 'translate3d(-85px, 0, 0)';
        }
        currentOffsetRef.current = -85;
        setIsOpen(true);
    };
    const handleTouchStart = (e) => {
        const touch = e.touches[0];
        touchStartRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            startX: currentOffsetRef.current,
            isVertical: false,
            isHorizontal: false,
        };
        if (cardRef.current) {
            cardRef.current.style.transition = 'none';
        }
    };
    const handleTouchMove = (e) => {
        if (!touchStartRef.current)
            return;
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartRef.current.x;
        const dy = touch.clientY - touchStartRef.current.y;
        if (!touchStartRef.current.isVertical && !touchStartRef.current.isHorizontal) {
            if (Math.abs(dy) > 7 && Math.abs(dy) >= Math.abs(dx)) {
                touchStartRef.current.isVertical = true;
                return;
            }
            if (Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy)) {
                touchStartRef.current.isHorizontal = true;
            }
        }
        if (touchStartRef.current.isVertical)
            return;
        if (touchStartRef.current.isHorizontal) {
            if (isOpen || dx < 0) {
                e.stopPropagation();
                const base = touchStartRef.current.startX;
                let newOffset = base + dx;
                if (newOffset > 0) {
                    newOffset = newOffset * 0.2;
                }
                else if (newOffset < -85) {
                    newOffset = -85 + (newOffset - (-85)) * 0.3;
                }
                currentOffsetRef.current = newOffset;
                if (cardRef.current) {
                    cardRef.current.style.transform = `translate3d(${newOffset}px, 0, 0)`;
                }
            }
        }
    };
    const handleTouchEnd = (e) => {
        if (!touchStartRef.current || touchStartRef.current.isVertical) {
            touchStartRef.current = null;
            return;
        }
        if (touchStartRef.current.isHorizontal) {
            if (isOpen || currentOffsetRef.current < 0) {
                e.stopPropagation();
                const current = currentOffsetRef.current;
                if (current < -40) {
                    openCardPosition(200);
                }
                else {
                    resetCardPosition(200);
                }
            }
        }
        touchStartRef.current = null;
    };
    return (<div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-xs" data-swipe-ignore="true">
      {/* Tombol aksi yang tampil di latar belakang saat kartu digeser */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-end w-[85px] bg-slate-100 pr-1.5 gap-1.5">
        <button type="button" onClick={() => { resetCardPosition(0); onEdit(tx); }} className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs active:scale-95 transition-transform" title="Edit Transaksi">
          <Edit3 className="w-4 h-4"/>
        </button>
        <button type="button" onClick={() => { resetCardPosition(0); onDelete(tx); }} className="w-9 h-9 rounded-lg bg-rose-600 text-white flex items-center justify-center shadow-xs active:scale-95 transition-transform" title="Hapus Transaksi">
          <Trash2 className="w-4 h-4"/>
        </button>
      </div>

      {/* Kartu transaksi utama */}
      <div ref={cardRef} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onClick={() => { if (isOpen) {
        resetCardPosition(200);
    } }} style={{
            touchAction: 'pan-y',
        }} className="relative bg-white p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isIncome ? 'bg-emerald-50 text-emerald-600' : isTransfer ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
              {isIncome ? <ArrowDownLeft className="w-4 h-4"/> : <ArrowUpRight className="w-4 h-4"/>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-900 leading-snug break-words">{tx.description}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-1.5">
                <span suppressHydrationWarning>{new Date(tx.transaction_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
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
            <div className={`text-xs font-bold whitespace-nowrap ${isIncome ? 'text-emerald-600' : isTransfer ? 'text-blue-600' : 'text-slate-900'}`}>
              {isIncome ? '+' : isTransfer ? '' : '-'}{formatCurrency(tx.amount, isUSD ? 'USD' : 'IDR')}
            </div>
            <div className="flex items-center justify-end gap-1 mt-1">
              <button type="button" onClick={() => onEdit(tx)} className="p-1 text-slate-400 hover:text-emerald-600" title="Edit Transaksi">
                <Edit3 className="w-3.5 h-3.5"/>
              </button>
              <button type="button" onClick={() => onDelete(tx)} className="p-1 text-slate-400 hover:text-rose-600" title="Hapus Transaksi">
                <Trash2 className="w-3.5 h-3.5"/>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>);
}
function TransactionsContent() {
    const searchParams = useSearchParams();
    const [data, setData] = useState(() => getCachedDatabase());
    const [loading, setLoading] = useState(() => !getCachedDatabase());
    const [showAddModal, setShowAddModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isSubmittingRef = useRef(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showScanModal, setShowScanModal] = useState(false);
    const [scanDefaultType, setScanDefaultType] = useState('expense');
    // Feedback notifications
    const [feedbackMessage, setFeedbackMessage] = useState(null);
    // Edit Transaction State
    const [editTx, setEditTx] = useState(null);
    const [editDescription, setEditDescription] = useState('');
    const [editAmount, setEditAmount] = useState('');
    const [editTxType, setEditTxType] = useState('expense');
    const [editAccountId, setEditAccountId] = useState('');
    const [editDestAccountId, setEditDestAccountId] = useState('');
    const [editCategoryId, setEditCategoryId] = useState('');
    const [editDate, setEditDate] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const isEditingRef = useRef(false);
    // Delete Confirmation State
    const [deleteConfirmTx, setDeleteConfirmTx] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    // Filters State
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [filterAccount, setFilterAccount] = useState('all');
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterDateRange, setFilterDateRange] = useState('all');
    // New Transaction Form State
    const [accountId, setAccountId] = useState('');
    const [txType, setTxType] = useState('expense');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [destAccountId, setDestAccountId] = useState('');
    const [notes, setNotes] = useState('');
    // CSV Import State
    const [importAccountId, setImportAccountId] = useState('');
    const [csvContent, setCsvContent] = useState('');
    const [importResult, setImportResult] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const typeFilterOptions = useMemo(() => [
        { value: 'all', label: 'Semua Jenis' },
        { value: 'income', label: 'Pemasukan' },
        { value: 'expense', label: 'Pengeluaran' },
        { value: 'transfer', label: 'Transfer' },
        { value: 'trading', label: 'Trading' },
    ], []);
    const accountFilterOptions = useMemo(() => [
        { value: 'all', label: 'Semua Akun' },
        ...(data?.accounts.map((a) => ({
            value: a.id,
            label: a.name,
            badge: a.currency,
        })) || []),
    ], [data?.accounts]);
    const categoryFilterOptions = useMemo(() => [
        { value: 'all', label: 'Semua Kategori' },
        ...(data?.categories.map((c) => ({
            value: c.id,
            label: c.name,
            subLabel: c.category_type === 'income' ? 'Masuk' : 'Keluar',
        })) || []),
    ], [data?.categories]);
    const dateRangeFilterOptions = useMemo(() => [
        { value: 'all', label: 'Semua Waktu' },
        { value: 'today', label: 'Hari Ini' },
        { value: '7d', label: '7 Hari Terakhir' },
        { value: '30d', label: '30 Hari Terakhir' },
        { value: 'this_month', label: 'Bulan Ini' },
        { value: 'last_month', label: 'Bulan Lalu' },
        { value: 'this_year', label: `Tahun ${new Date().getFullYear()}` },
    ], []);
    const accountOptions = useMemo(() => (data?.accounts.map((a) => ({
        value: a.id,
        label: a.name,
        subLabel: `(${a.provider || a.account_type})`,
        badge: a.currency,
    })) || []), [data?.accounts]);
    const destAccountOptions = useMemo(() => (data?.accounts
        .filter((a) => a.id !== accountId)
        .map((a) => ({
        value: a.id,
        label: a.name,
        subLabel: `(${a.provider || a.account_type})`,
        badge: a.currency,
    })) || []), [data?.accounts, accountId]);
    const editDestAccountOptions = useMemo(() => (data?.accounts
        .filter((a) => a.id !== editAccountId)
        .map((a) => ({
        value: a.id,
        label: a.name,
        subLabel: `(${a.provider || a.account_type})`,
        badge: a.currency,
    })) || []), [data?.accounts, editAccountId]);
    const categoryOptions = useMemo(() => [
        { value: '', label: 'Tanpa Kategori' },
        ...(data?.categories
            .filter((c) => c.category_type === txType)
            .map((c) => ({
            value: c.id,
            label: c.name,
        })) || []),
    ], [data?.categories, txType]);
    const editCategoryOptions = useMemo(() => [
        { value: '', label: 'Tanpa Kategori' },
        ...(data?.categories
            .filter((c) => c.category_type === editTxType)
            .map((c) => ({
            value: c.id,
            label: c.name,
        })) || []),
    ], [data?.categories, editTxType]);
    const importAccountOptions = useMemo(() => (data?.accounts.map((a) => ({
        value: a.id,
        label: a.name,
        subLabel: `(${a.provider})`,
        badge: a.currency,
    })) || []), [data?.accounts]);
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
        if (searchParams.get('action') === 'new') {
            setShowAddModal(true);
        }
        const handleUpdate = () => {
            fetchData();
        };
        window.addEventListener('kayla_db_updated', handleUpdate);
        return () => {
            window.removeEventListener('kayla_db_updated', handleUpdate);
        };
    }, [searchParams]);
    const handleAddTransaction = async (e) => {
        e.preventDefault();
        if (isSubmittingRef.current)
            return;
        if (!description.trim() || !amount || !accountId)
            return;
        isSubmittingRef.current = true;
        setIsSubmitting(true);
        setFeedbackMessage(null);
        try {
            const result = await saveTransactionClient({
                account_id: accountId,
                transaction_type: txType,
                amount: parseFloat(amount),
                description,
                category_id: categoryId || undefined,
                destination_account_id: txType === 'transfer' ? destAccountId : undefined,
                notes,
                source: 'manual',
            });
            if (result.success) {
                setShowAddModal(false);
                setDescription('');
                setAmount('');
                setNotes('');
                setFeedbackMessage({ type: 'success', text: 'Transaksi berhasil dicatat dan saldo telah diperbarui.' });
                fetchData();
            }
            else {
                setFeedbackMessage({ type: 'error', text: result.error || 'Gagal menyimpan transaksi.' });
            }
        }
        catch (err) {
            setFeedbackMessage({ type: 'error', text: 'Terjadi kesalahan sistem saat menyimpan transaksi.' });
        }
        finally {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
        }
    };
    const openEditModal = (tx) => {
        setEditTx(tx);
        setEditDescription(tx.description);
        setEditAmount(String(tx.amount));
        setEditTxType(tx.transaction_type);
        setEditAccountId(tx.account_id);
        setEditDestAccountId(tx.destination_account_id || '');
        setEditCategoryId(tx.category_id || '');
        setEditDate(tx.transaction_date ? tx.transaction_date.slice(0, 10) : '');
        setEditNotes(tx.notes || '');
    };
    const handleSaveEdit = async (e) => {
        e.preventDefault();
        if (!editTx || isEditingRef.current)
            return;
        const numAmount = parseFloat(editAmount);
        if (isNaN(numAmount) || numAmount <= 0 || !editDescription.trim() || !editAccountId) {
            setFeedbackMessage({ type: 'error', text: 'Nominal harus lebih dari 0, deskripsi dan akun wajib diisi.' });
            return;
        }
        isEditingRef.current = true;
        setIsEditing(true);
        setFeedbackMessage(null);
        try {
            const result = await updateTransactionClient(editTx.id, {
                account_id: editAccountId,
                transaction_type: editTxType,
                amount: numAmount,
                description: editDescription.trim(),
                category_id: editCategoryId || undefined,
                destination_account_id: editTxType === 'transfer' ? editDestAccountId : undefined,
                transaction_date: editDate ? new Date(editDate).toISOString() : editTx.transaction_date,
                notes: editNotes,
            });
            if (result.success) {
                setEditTx(null);
                setFeedbackMessage({ type: 'success', text: 'Perubahan transaksi berhasil disimpan dan saldo telah direkalkulasi.' });
                fetchData();
            }
            else {
                setFeedbackMessage({ type: 'error', text: result.error || 'Gagal memperbarui transaksi.' });
            }
        }
        catch (err) {
            setFeedbackMessage({ type: 'error', text: 'Koneksi gagal saat memperbarui transaksi.' });
        }
        finally {
            isEditingRef.current = false;
            setIsEditing(false);
        }
    };
    const handleDeleteConfirmed = async () => {
        if (!deleteConfirmTx)
            return;
        try {
            setIsDeleting(true);
            setFeedbackMessage(null);
            const ok = await deleteTransactionClient(deleteConfirmTx.id);
            if (ok) {
                setFeedbackMessage({ type: 'success', text: 'Transaksi berhasil dihapus dan saldo akun telah dikembalikan.' });
                setDeleteConfirmTx(null);
                fetchData();
            }
            else {
                setFeedbackMessage({ type: 'error', text: 'Gagal menghapus transaksi dari database.' });
                setDeleteConfirmTx(null);
            }
        }
        catch (err) {
            setFeedbackMessage({ type: 'error', text: 'Terjadi kesalahan sistem saat menghapus transaksi.' });
            setDeleteConfirmTx(null);
        }
        finally {
            setIsDeleting(false);
        }
    };
    const handleImportCSV = async (e) => {
        e.preventDefault();
        if (!csvContent.trim() || !importAccountId)
            return;
        try {
            setIsImporting(true);
            const res = await importCsvTransactionsClient(importAccountId, csvContent);
            if (res.success) {
                setImportResult({ count: res.importedCount || 0, skipped: res.duplicatesSkipped || 0 });
                setCsvContent('');
                setFeedbackMessage({ type: 'success', text: `Impor selesai: ${res.importedCount || 0} transaksi berhasil ditambahkan.` });
                fetchData();
            }
            else {
                alert(res.error || 'Gagal memproses impor CSV');
            }
        }
        catch (err) {
            console.error(err);
            alert('Kesalahan saat memproses impor CSV: ' + String(err));
        }
        finally {
            setIsImporting(false);
        }
    };
    const resetFilters = () => {
        setSearchTerm('');
        setFilterType('all');
        setFilterAccount('all');
        setFilterCategory('all');
        setFilterDateRange('all');
    };
    const isAnyFilterActive = searchTerm !== '' || filterType !== 'all' || filterAccount !== 'all' || filterCategory !== 'all' || filterDateRange !== 'all';
    const filteredTransactions = useMemo(() => {
        if (!data?.transactions)
            return [];
        return data.transactions.filter(tx => {
            const matchSearch = tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                tx.notes?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchType = filterType === 'all' || tx.transaction_type === filterType;
            const matchAccount = filterAccount === 'all' || tx.account_id === filterAccount || tx.destination_account_id === filterAccount;
            const matchCategory = filterCategory === 'all' || tx.category_id === filterCategory;
            let matchDate = true;
            if (filterDateRange !== 'all') {
                const txDate = new Date(tx.transaction_date);
                const now = new Date();
                const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                const txTime = txDate.getTime();
                if (filterDateRange === 'today') {
                    matchDate = txTime >= startOfToday;
                }
                else if (filterDateRange === '7d') {
                    matchDate = txTime >= (startOfToday - 7 * 86400000);
                }
                else if (filterDateRange === '30d') {
                    matchDate = txTime >= (startOfToday - 30 * 86400000);
                }
                else if (filterDateRange === 'this_month') {
                    matchDate = txDate.getFullYear() === now.getFullYear() && txDate.getMonth() === now.getMonth();
                }
                else if (filterDateRange === 'last_month') {
                    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    matchDate = txDate.getFullYear() === lastMonth.getFullYear() && txDate.getMonth() === lastMonth.getMonth();
                }
                else if (filterDateRange === 'this_year') {
                    matchDate = txDate.getFullYear() === now.getFullYear();
                }
            }
            return matchSearch && matchType && matchAccount && matchCategory && matchDate;
        });
    }, [data?.transactions, searchTerm, filterType, filterAccount, filterCategory, filterDateRange]);
    return (<div className="flex-1 flex flex-col bg-slate-50 pb-12">
      <main className="p-4 sm:p-8 space-y-4 sm:space-y-6 max-w-7xl">
        {/* Banner Feedback / Notifikasi */}
        {feedbackMessage && (<div className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${feedbackMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
            {feedbackMessage.type === 'success' ? (<CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600"/>) : (<AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600"/>)}
            <div className="text-xs font-semibold flex-1">{feedbackMessage.text}</div>
            <button type="button" onClick={() => setFeedbackMessage(null)} className="text-xs font-bold opacity-60 hover:opacity-100">
              Tutup
            </button>
          </div>)}

        <div className="flex flex-col gap-3">
          {/* Baris Filter Lengkap: Cari, Jenis, Akun, Kategori, Rentang Waktu */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[140px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/>
              <input type="text" placeholder="Cari transaksi..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 shadow-xs"/>
            </div>
            <div className="w-[120px] sm:w-[130px]">
              <CustomSelect value={filterType} onChange={setFilterType} options={typeFilterOptions} size="sm"/>
            </div>
            <div className="w-[130px] sm:w-[150px]">
              <CustomSelect value={filterAccount} onChange={setFilterAccount} options={accountFilterOptions} size="sm"/>
            </div>
            <div className="w-[130px] sm:w-[150px]">
              <CustomSelect value={filterCategory} onChange={setFilterCategory} options={categoryFilterOptions} size="sm"/>
            </div>
            <div className="w-[120px] sm:w-[140px]">
              <CustomSelect value={filterDateRange} onChange={setFilterDateRange} options={dateRangeFilterOptions} size="sm"/>
            </div>
            {isAnyFilterActive && (<button type="button" onClick={resetFilters} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-lg" title="Reset semua filter">
                <RotateCcw className="w-3.5 h-3.5"/>
                <span className="hidden sm:inline">Reset</span>
              </button>)}
          </div>

          {/* Baris Aksi: Scan, Impor, Ekspor, Catat */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button type="button" onClick={() => { setScanDefaultType('expense'); setShowScanModal(true); }} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg shrink-0 hover:bg-emerald-100 transition-colors">
              <ScanLine className="w-4 h-4"/>
              <span>Scan Bukti</span>
            </button>
            <button type="button" onClick={() => { setShowImportModal(true); setImportResult(null); }} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg shrink-0 hover:bg-slate-50">
              <UploadCloud className="w-4 h-4 text-slate-600"/>
              <span>Impor CSV</span>
            </button>
            <button type="button" onClick={() => exportDatabaseToJson()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shrink-0" title="Unduh cadangan data dalam format JSON">
              <Download className="w-4 h-4 text-slate-600"/>
              <span>Ekspor JSON</span>
            </button>
            <label className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shrink-0 cursor-pointer" title="Unggah berkas database JSON">
              <FileJson className="w-4 h-4 text-slate-600"/>
              <span>Impor JSON</span>
              <input type="file" accept=".json,application/json" className="hidden" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file)
                return;
            const text = await file.text();
            const res = await importDatabaseFromJson(text);
            if (res.success) {
                setFeedbackMessage({ type: 'success', text: `Berhasil memuat ${res.count ?? 0} data transaksi dari JSON.` });
                fetchData();
            }
            else {
                setFeedbackMessage({ type: 'error', text: res.error || 'Gagal memproses berkas JSON.' });
            }
            e.target.value = '';
        }}/>
            </label>
            <button type="button" onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg shrink-0 hover:bg-emerald-700 transition-colors shadow-xs">
              <Plus className="w-4 h-4"/>
              <span>Catat Transaksi</span>
            </button>
          </div>
        </div>

        {/* Mobile cards view dengan gestur swipe Android */}
        <div className="md:hidden space-y-3">
          {filteredTransactions.length > 0 ? (filteredTransactions.map((tx) => {
            const acc = data?.accounts.find(a => a.id === tx.account_id);
            const destAcc = tx.destination_account_id ? data?.accounts.find(a => a.id === tx.destination_account_id) : null;
            const cat = data?.categories.find(c => c.id === tx.category_id);
            const isUSD = acc?.currency === 'USD';
            const isIncome = tx.transaction_type === 'income' || tx.transaction_type === 'trading';
            const isTransfer = tx.transaction_type === 'transfer';
            return (<SwipeableTransactionCard key={tx.id} tx={tx} acc={acc} destAcc={destAcc} cat={cat} isUSD={isUSD} isIncome={isIncome} isTransfer={isTransfer} onEdit={openEditModal} onDelete={setDeleteConfirmTx}/>);
        })) : (<div className="bg-white border border-slate-200 rounded-xl py-12 px-4 text-center text-slate-400 text-xs flex flex-col items-center">
              <p className="mb-2">Tidak ada transaksi yang cocok dengan kriteria pencarian.</p>
              {isAnyFilterActive && (<button type="button" onClick={resetFilters} className="text-emerald-700 font-semibold underline text-xs">
                  Reset Semua Filter
                </button>)}
            </div>)}
        </div>

        {/* Desktop table view */}
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
                {filteredTransactions.length > 0 ? (filteredTransactions.map((tx) => {
            const acc = data?.accounts.find(a => a.id === tx.account_id);
            const destAcc = tx.destination_account_id ? data?.accounts.find(a => a.id === tx.destination_account_id) : null;
            const cat = data?.categories.find(c => c.id === tx.category_id);
            const isUSD = acc?.currency === 'USD';
            const isIncome = tx.transaction_type === 'income' || tx.transaction_type === 'trading';
            const isTransfer = tx.transaction_type === 'transfer';
            return (<tr key={tx.id} className="hover:bg-slate-50/80">
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
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button type="button" onClick={() => openEditModal(tx)} className="p-1 text-slate-400 hover:text-emerald-600" title="Edit Transaksi">
                              <Edit3 className="w-3.5 h-3.5"/>
                            </button>
                            <button type="button" onClick={() => setDeleteConfirmTx(tx)} className="p-1 text-slate-400 hover:text-rose-600" title="Hapus Transaksi">
                              <Trash2 className="w-3.5 h-3.5"/>
                            </button>
                          </div>
                        </td>
                      </tr>);
        })) : (<tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                      <p className="mb-2">Tidak ada transaksi yang cocok dengan kriteria pencarian.</p>
                      {isAnyFilterActive && (<button type="button" onClick={resetFilters} className="text-emerald-700 font-semibold underline text-xs">
                          Reset Semua Filter
                        </button>)}
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Scan Modal */}
      {showScanModal && data && (<ScanModal accounts={data.accounts} categories={data.categories} existingTransactions={data.transactions} defaultType={scanDefaultType} onClose={() => setShowScanModal(false)} onSaved={() => {
                setShowScanModal(false);
                setFeedbackMessage({ type: 'success', text: 'Transaksi hasil scan berhasil dicatat ke database.' });
                fetchData();
            }}/>)}

      {/* Add Transaction Modal */}
      {showAddModal && (<div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-backdrop">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg p-5 sm:p-6 shadow-xl max-h-[92vh] overflow-y-auto animate-bottom-sheet sm:animate-modal">
            <h3 className="text-base font-bold text-slate-900 mb-4">Catat Transaksi Baru</h3>
            <form onSubmit={handleAddTransaction} className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {['expense', 'income', 'transfer'].map((t) => (<button key={t} type="button" onClick={() => setTxType(t)} className={`py-2 rounded-lg text-xs font-semibold border ${txType === t
                    ? t === 'expense' ? 'bg-rose-50 border-rose-300 text-rose-700'
                        : t === 'income' ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'border-slate-200 text-slate-600'}`}>
                    {t === 'expense' ? 'Pengeluaran' : t === 'income' ? 'Pemasukan' : 'Transfer'}
                  </button>))}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Deskripsi</label>
                <input type="text" required value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-emerald-600"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Nominal</label>
                  <input type="number" step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-emerald-600"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Akun Sumber</label>
                  <CustomSelect value={accountId} onChange={setAccountId} options={accountOptions} placeholder="Pilih akun"/>
                </div>
              </div>
              {txType === 'transfer' && (<div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Akun Tujuan</label>
                  <CustomSelect value={destAccountId} onChange={setDestAccountId} options={destAccountOptions} placeholder="Pilih tujuan"/>
                </div>)}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Kategori</label>
                <CustomSelect value={categoryId} onChange={setCategoryId} options={categoryOptions}/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Catatan Tambahan (Opsional)</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contoh: No struk, keperluan bisnis, dll" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-600"/>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-xs font-semibold text-slate-600">Batal</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg disabled:opacity-50">{isSubmitting ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>)}

      {/* Edit Transaction Modal */}
      {editTx && (<div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-backdrop">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg p-5 sm:p-6 shadow-xl max-h-[92vh] overflow-y-auto animate-bottom-sheet sm:animate-modal">
            <h3 className="text-base font-bold text-slate-900 mb-1">Edit & Koreksi Transaksi</h3>
            <p className="text-xs text-slate-500 mb-4">Perubahan nominal atau akun akan secara otomatis menyesuaikan saldo.</p>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {['expense', 'income', 'transfer'].map((t) => (<button key={t} type="button" onClick={() => setEditTxType(t)} className={`py-2 rounded-lg text-xs font-semibold border ${editTxType === t
                    ? t === 'expense' ? 'bg-rose-50 border-rose-300 text-rose-700'
                        : t === 'income' ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'border-slate-200 text-slate-600'}`}>
                    {t === 'expense' ? 'Pengeluaran' : t === 'income' ? 'Pemasukan' : 'Transfer'}
                  </button>))}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Deskripsi</label>
                <input type="text" required value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-emerald-600"/>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Nominal</label>
                  <input type="number" step="any" required value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-emerald-600"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Tanggal Transaksi</label>
                  <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-emerald-600"/>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Akun Sumber</label>
                  <CustomSelect value={editAccountId} onChange={setEditAccountId} options={accountOptions} placeholder="Pilih akun"/>
                </div>
                {editTxType === 'transfer' ? (<div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Akun Tujuan</label>
                    <CustomSelect value={editDestAccountId} onChange={setEditDestAccountId} options={editDestAccountOptions} placeholder="Pilih tujuan"/>
                  </div>) : (<div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Kategori</label>
                    <CustomSelect value={editCategoryId} onChange={setEditCategoryId} options={editCategoryOptions}/>
                  </div>)}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Catatan</label>
                <input type="text" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-600"/>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditTx(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900">
                  Batal
                </button>
                <button type="submit" disabled={isEditing} className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg disabled:opacity-50 hover:bg-emerald-700">
                  {isEditing ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>)}

      {/* Delete Confirmation Modal */}
      {deleteConfirmTx && (<div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-backdrop">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-sm p-5 shadow-xl animate-modal">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5"/>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Hapus Transaksi?</h4>
                <p className="text-xs text-slate-500 line-clamp-1">{deleteConfirmTx.description}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              Saldo akun sebesar <span className="font-bold text-slate-900">{formatCurrency(deleteConfirmTx.amount)}</span> akan secara otomatis dikembalikan ke posisi semula. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setDeleteConfirmTx(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900">
                Batal
              </button>
              <button type="button" disabled={isDeleting} onClick={handleDeleteConfirmed} className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50">
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>)}

      {/* CSV Import Modal */}
      {showImportModal && (<div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-lg p-5 sm:p-6 shadow-xl max-h-[92vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 mb-4">Impor Mutasi CSV</h3>
            <form onSubmit={handleImportCSV} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Akun Tujuan Impor</label>
                <CustomSelect value={importAccountId} onChange={setImportAccountId} options={importAccountOptions}/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Isi CSV</label>
                <textarea value={csvContent} onChange={(e) => setCsvContent(e.target.value)} rows={8} placeholder="Date, Description, Amount, Type, RefNo" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-600"/>
              </div>
              {importResult && (<div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  Berhasil impor {importResult.count} baris. Duplikat dilewati: {importResult.skipped}.
                </div>)}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowImportModal(false)} className="px-4 py-2 text-xs font-semibold text-slate-600">Tutup</button>
                <button type="submit" disabled={isImporting} className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg disabled:opacity-50">
                  {isImporting ? 'Memproses...' : 'Mulai Impor'}
                </button>
              </div>
            </form>
          </div>
        </div>)}
    </div>);
}
/**
 * Halaman Transaksi dengan Suspense boundary untuk Next.js useSearchParams.
 * @returns {React.ReactElement}
 */
export default function TransactionsPage() {
    return (<Suspense fallback={<div className="p-8 text-center text-slate-400 text-xs">Memuat halaman transaksi...</div>}>
      <TransactionsContent />
    </Suspense>);
}
