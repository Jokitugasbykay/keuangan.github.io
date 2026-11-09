'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Coins,
  Wallet,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  Edit2,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  ArrowUpRight,
  PieChart as PieChartIcon,
  AlertTriangle,
  X,
  Search,
  Filter,
  DollarSign
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend
} from 'recharts';

import {
  getCryptoWallets,
  saveCryptoWallet,
  deleteCryptoWallet,
  updateWalletBalance,
  calculateCryptoPortfolio,
  fetchCryptoPrices,
  validateCryptoAddress,
  detectSensitiveCryptoKey,
  DEFAULT_CRYPTO_PRICES_USD,
  STABLECOIN_SYMBOLS
} from '@/lib/crypto-tracker';
import { loadDatabase } from '@/lib/client-data';
import CustomSelect from '@/components/CustomSelect';

/**
 * Palet warna wajib untuk alokasi aset kripto.
 * Emerald Green, Violet, Amber, Cyan, Blue.
 */
const COLOR_MAP = {
  BTC: '#059669',
  ETH: '#8b5cf6',
  SOL: '#f59e0b',
  TRX: '#06b6d4',
  USDT: '#3b82f6',
  USDC: '#3b82f6',
  Stablecoins: '#3b82f6',
  Others: '#64748b',
};

const DEFAULT_PALETTE = ['#059669', '#8b5cf6', '#f59e0b', '#06b6d4', '#3b82f6', '#ec4899', '#64748b'];

const CHAIN_OPTIONS = [
  { value: 'BTC', label: 'Bitcoin (BTC)', defaultSymbol: 'BTC', placeholder: '1A1zP... atau bc1q...' },
  { value: 'ETH', label: 'Ethereum & EVM (ETH, Polygon, BSC)', defaultSymbol: 'ETH', placeholder: '0x71C...894' },
  { value: 'SOL', label: 'Solana (SOL)', defaultSymbol: 'SOL', placeholder: '7xKX...Base58' },
  { value: 'TRX', label: 'Tron (TRX)', defaultSymbol: 'TRX', placeholder: 'TYD...34 karakter' },
];

/**
 * Format mata uang IDR
 * @param {number} amount
 * @returns {string}
 */
function formatIDR(amount) {
  const val = Number(amount) || 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(val);
}

/**
 * Format mata uang USD
 * @param {number} amount
 * @returns {string}
 */
function formatUSD(amount) {
  const val = Number(amount) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

/**
 * Potong alamat publik untuk tampilan ringkas
 * @param {string} addr
 * @returns {string}
 */
function truncateAddress(addr) {
  if (!addr || typeof addr !== 'string') return '';
  const clean = addr.trim();
  if (clean.length <= 16) return clean;
  return `${clean.slice(0, 6)}...${clean.slice(-6)}`;
}

/**
 * Format timestamp pembaruan harga
 * @param {Date | null} date
 * @returns {string}
 */
function formatTimestamp(date) {
  if (!date) return 'Belum diperbarui';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export default function CryptoPortfolioPage() {
  const [mounted, setMounted] = useState(false);
  const [wallets, setWallets] = useState([]);
  const [prices, setPrices] = useState(DEFAULT_CRYPTO_PRICES_USD);
  const [usdRate, setUsdRate] = useState(16000);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChainFilter, setSelectedChainFilter] = useState('ALL');

  const chainFilterOptions = useMemo(() => [
    { value: 'ALL', label: 'Semua Jaringan' },
    { value: 'BTC', label: 'Bitcoin (BTC)', badge: 'BTC' },
    { value: 'ETH', label: 'Ethereum (ETH)', badge: 'ETH' },
    { value: 'SOL', label: 'Solana (SOL)', badge: 'SOL' },
    { value: 'TRX', label: 'Tron (TRX)', badge: 'TRX' },
    { value: 'STABLE', label: 'Stablecoins', badge: 'USD' },
  ], []);

  const addWalletChainOptions = useMemo(() => CHAIN_OPTIONS.map((c) => ({
    value: c.value,
    label: c.label,
    badge: c.defaultSymbol,
  })), []);
  const [copiedId, setCopiedId] = useState(null);

  // Modal Tambah Dompet
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newChain, setNewChain] = useState('ETH');
  const [newAddress, setNewAddress] = useState('');
  const [newSymbol, setNewSymbol] = useState('ETH');
  const [newBalance, setNewBalance] = useState('');
  const [newCostBasis, setNewCostBasis] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [addError, setAddError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal Edit Saldo
  const [editingWallet, setEditingWallet] = useState(null);
  const [editBalanceInput, setEditBalanceInput] = useState('');
  const [editError, setEditError] = useState('');

  // Modal Hapus Dompet
  const [deletingWallet, setDeletingWallet] = useState(null);

  // Inisialisasi data
  useEffect(() => {
    setMounted(true);
    loadAllData();

    const handleUpdate = () => {
      loadAllData();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('kayla_db_updated', handleUpdate);
      window.addEventListener('kayla_crypto_updated', handleUpdate);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('kayla_db_updated', handleUpdate);
        window.removeEventListener('kayla_crypto_updated', handleUpdate);
      }
    };
  }, []);

  const loadAllData = async () => {
    try {
      const [walletList, db, fetchedPrices] = await Promise.all([
        getCryptoWallets(),
        loadDatabase(),
        fetchCryptoPrices({ timeoutMs: 3500 }),
      ]);

      setWallets(walletList || []);
      if (db?.settings?.usd_to_idr_rate) {
        setUsdRate(Number(db.settings.usd_to_idr_rate) || 16000);
      }
      if (fetchedPrices) {
        setPrices(fetchedPrices);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.warn('Gagal memuat data kripto:', err);
    }
  };

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const freshPrices = await fetchCryptoPrices({ forceRefresh: true, timeoutMs: 4000 });
      if (freshPrices) {
        setPrices(freshPrices);
      }
      const updatedWallets = await getCryptoWallets();
      setWallets(updatedWallets || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.warn('Penyegaran harga gagal:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Salin alamat publik ke clipboard
  const handleCopyAddress = (wallet) => {
    if (!wallet?.address || typeof navigator === 'undefined') return;
    navigator.clipboard.writeText(wallet.address);
    setCopiedId(wallet.id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  // Evaluasi validasi real-time alamat publik
  const addressValidation = useMemo(() => {
    if (!newAddress.trim()) {
      return { checked: false, valid: false, error: null, isSecret: false };
    }

    // Deteksi kunci privat atau seed phrase
    const secretCheck = detectSensitiveCryptoKey(newAddress.trim());
    if (secretCheck.detected) {
      return {
        checked: true,
        valid: false,
        isSecret: true,
        error: `PERINGATAN KRITIS: Terdeteksi ${secretCheck.secretType}. Dilarang keras memasukkan Private Key atau Secret Recovery Phrase!`,
      };
    }

    // Validasi format alamat
    const valRes = validateCryptoAddress(newAddress.trim(), newChain);
    return {
      checked: true,
      valid: valRes.valid,
      isSecret: false,
      error: valRes.valid ? null : (valRes.error || 'Format alamat tidak valid untuk jaringan ini.'),
      chain: valRes.chain,
      format: valRes.format,
    };
  }, [newAddress, newChain]);

  // Kalkulasi ringkasan portofolio dan alokasi
  const portfolio = useMemo(() => {
    return calculateCryptoPortfolio(wallets, prices, usdRate);
  }, [wallets, prices, usdRate]);

  // Siapkan data untuk grafik Donut Recharts
  const chartData = useMemo(() => {
    if (!portfolio || !Array.isArray(portfolio.allocation_by_category)) return [];
    return portfolio.allocation_by_category
      .filter((cat) => cat.value_usd > 0)
      .map((cat, idx) => ({
        name: cat.category,
        value: Number(cat.value_usd.toFixed(2)),
        valueIdr: cat.value_idr,
        percentage: Number(cat.percentage.toFixed(1)),
        color: COLOR_MAP[cat.category] || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length],
      }));
  }, [portfolio]);

  // Filter daftar dompet
  const filteredWallets = useMemo(() => {
    if (!portfolio || !Array.isArray(portfolio.wallets)) return [];
    return portfolio.wallets.filter((w) => {
      const matchSearch =
        searchQuery === '' ||
        (w.label && w.label.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (w.address && w.address.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (w.asset_symbol && w.asset_symbol.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchChain =
        selectedChainFilter === 'ALL' ||
        (w.chain && w.chain.toUpperCase() === selectedChainFilter.toUpperCase()) ||
        (selectedChainFilter === 'STABLE' && STABLECOIN_SYMBOLS.includes(w.asset_symbol));

      return matchSearch && matchChain;
    });
  }, [portfolio, searchQuery, selectedChainFilter]);

  // Handler Submit Tambah Dompet
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setAddError('');

    if (!newLabel.trim()) {
      setAddError('Label dompet wajib diisi.');
      return;
    }
    if (!newAddress.trim()) {
      setAddError('Alamat publik wajib diisi.');
      return;
    }
    if (!addressValidation.valid) {
      setAddError(addressValidation.error || 'Format alamat publik tidak valid.');
      return;
    }

    const balanceNum = parseFloat(newBalance);
    if (isNaN(balanceNum) || balanceNum < 0) {
      setAddError('Saldo koin harus berupa angka nol atau positif.');
      return;
    }

    let costBasisNum = null;
    if (newCostBasis.trim()) {
      costBasisNum = parseFloat(newCostBasis);
      if (isNaN(costBasisNum) || costBasisNum < 0) {
        setAddError('Cost basis harus berupa angka positif.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await saveCryptoWallet({
        label: newLabel.trim(),
        chain: newChain,
        address: newAddress.trim(),
        asset_symbol: newSymbol.trim().toUpperCase() || newChain,
        balance: balanceNum,
        cost_basis: costBasisNum,
        notes: newNotes.trim(),
      });

      if (!res.success) {
        setAddError(res.error || 'Gagal menyimpan dompet.');
        setIsSubmitting(false);
        return;
      }

      // Reset form dan tutup modal
      setNewLabel('');
      setNewAddress('');
      setNewBalance('');
      setNewCostBasis('');
      setNewNotes('');
      setIsAddModalOpen(false);
      await loadAllData();
    } catch (err) {
      setAddError('Terjadi kesalahan sistem: ' + String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler Update Saldo
  const handleEditBalanceSubmit = async (e) => {
    e.preventDefault();
    setEditError('');

    if (!editingWallet) return;
    const balanceNum = parseFloat(editBalanceInput);
    if (isNaN(balanceNum) || balanceNum < 0) {
      setEditError('Saldo baru harus berupa angka nol atau positif.');
      return;
    }

    try {
      const res = await updateWalletBalance(editingWallet.id, balanceNum);
      if (!res.success) {
        setEditError(res.error || 'Gagal memperbarui saldo.');
        return;
      }
      setEditingWallet(null);
      await loadAllData();
    } catch (err) {
      setEditError('Terjadi kesalahan: ' + String(err));
    }
  };

  // Handler Hapus Dompet
  const handleDeleteConfirm = async () => {
    if (!deletingWallet) return;
    try {
      const res = await deleteCryptoWallet(deletingWallet.id);
      if (res.success) {
        setDeletingWallet(null);
        await loadAllData();
      }
    } catch (err) {
      console.warn('Gagal menghapus dompet:', err);
    }
  };

  // Tambahkan dompet contoh jika kosong untuk demo
  const handleSeedDemoWallets = async () => {
    try {
      await saveCryptoWallet({
        label: 'Cold Storage Ledger',
        chain: 'BTC',
        address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
        asset_symbol: 'BTC',
        balance: 1.25,
        cost_basis: 62000,
        notes: 'Simpanan jangka panjang Bitcoin',
      });
      await saveCryptoWallet({
        label: 'EVM Main Vault',
        chain: 'ETH',
        address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        asset_symbol: 'ETH',
        balance: 8.5,
        cost_basis: 2350,
        notes: 'Staking dan DeFi Ethereum',
      });
      await saveCryptoWallet({
        label: 'Phantom Solana Kayla',
        chain: 'SOL',
        address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        asset_symbol: 'SOL',
        balance: 45.0,
        cost_basis: 140,
        notes: 'Aset ekosistem Solana',
      });
      await saveCryptoWallet({
        label: 'Kas Stablecoin TRC-20',
        chain: 'TRX',
        address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        asset_symbol: 'USDT',
        balance: 15000,
        cost_basis: 1.0,
        notes: 'Cadangan likuiditas USDT',
      });
      await loadAllData();
    } catch (err) {
      console.warn('Gagal memuat contoh dompet:', err);
    }
  };

  if (!mounted) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="h-20 bg-white rounded-xl border border-slate-200 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-32 bg-white rounded-xl border border-slate-200 animate-pulse" />
          <div className="h-32 bg-white rounded-xl border border-slate-200 animate-pulse" />
          <div className="h-32 bg-white rounded-xl border border-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. HEADER HALAMAN & AKSI CEPAT */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div className="min-w-0">
          <div className="flex items-center min-w-0 gap-2">
            <span className="shrink-0 p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Coins className="w-5 h-5" />
            </span>
            <h1 className="min-w-0 text-lg sm:text-2xl leading-tight font-extrabold text-slate-900 tracking-tight break-words">
              Portofolio Aset Kripto Terpadu
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Pelacakan non-kustodian Watch-Only multi-chain dengan valuasi USD dan IDR real-time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-xs active:scale-[0.98] transition-all disabled:opacity-50"
            title="Perbarui harga pasar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
            <span>{isRefreshing ? 'Memperbarui...' : 'Perbarui Harga'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAddError('');
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="sm:hidden">Tambah Dompet</span>
            <span className="hidden sm:inline">Tambah Dompet (Watch-Only)</span>
          </button>
        </div>
      </div>

      {/* 2. KARTU RINGKASAN PORTOFOLIO TERPADU */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Kartu 1: Total Nilai Portofolio */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
            <span>Total Nilai Portofolio Kripto</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
              IDR & USD
            </span>
          </div>

          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {formatIDR(portfolio.total_idr)}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-slate-500 mt-1 flex items-center gap-1.5">
              <span>≈ {formatUSD(portfolio.total_usd)}</span>
              <span className="text-slate-300">|</span>
              <span className="text-[11px] text-slate-400">Kurs Rp {usdRate.toLocaleString('id-ID')}/USD</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Unrealized PnL:</span>
            <span
              className={`font-bold flex items-center gap-0.5 ${
                portfolio.total_unrealized_pnl_usd >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {portfolio.total_unrealized_pnl_usd >= 0 ? '+' : ''}
              {formatUSD(portfolio.total_unrealized_pnl_usd)} ({portfolio.total_unrealized_pnl_percentage.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* Kartu 2: Alokasi Dominan & Statistik Dompet */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
            <span>Aset Terbesar & Jumlah Dompet</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
              Statistik
            </span>
          </div>

          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {portfolio.allocation_by_asset[0] ? (
                <span className="flex items-center gap-2">
                  <span className="text-emerald-700">{portfolio.allocation_by_asset[0].symbol}</span>
                  <span className="text-slate-400 text-sm font-normal">
                    ({portfolio.allocation_by_asset[0].percentage.toFixed(1)}% porsi)
                  </span>
                </span>
              ) : (
                <span className="text-slate-400 text-base font-normal">Belum ada aset</span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Tersebar di {wallets.length} dompet pengawasan aktif
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>Metode Pelacakan:</span>
            <span className="font-semibold text-slate-700 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Watch-Only Non-Kustodian
            </span>
          </div>
        </div>

        {/* Kartu 3: Status Pembaruan Harga & Keamanan */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
            <span>Status Data Pasar</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Harga Aktif
            </span>
          </div>

          <div className="mt-2">
            <div className="text-xs text-slate-400">Pembaruan Terakhir:</div>
            <div className="text-sm sm:text-base font-bold text-slate-800 mt-0.5">
              {formatTimestamp(lastUpdated)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Sumber: Endpoint publik dengan fallback offline hardened
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Privasi Kunci:</span>
            <span className="font-bold text-emerald-700">100% Bebas Private Key</span>
          </div>
        </div>
      </div>

      {/* 3. VISUALISASI ALOKASI ASET (DONUT CHART) & BREAKDOWN PORTOFOLIO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Kolom Kiri: Donut Chart Recharts */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Proporsi Kepemilikan Aset (Donut Chart)
                </h3>
              </div>
              <span className="text-[11px] font-medium text-slate-400">
                Kategori Utama
              </span>
            </div>

            {chartData.length > 0 ? (
              <div className="h-64 sm:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={4}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name, item) => [
                        `${formatUSD(value)} (${item.payload.percentage}%) ≈ ${formatIDR(item.payload.valueIdr)}`,
                        name,
                      ]}
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '12px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value, entry) => (
                        <span className="text-xs font-medium text-slate-700 mr-2">
                          {value} ({entry.payload.percentage}%)
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center p-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                  <PieChartIcon className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold text-slate-600">Belum ada alokasi aset</p>
                <p className="text-[11px] text-slate-400 max-w-xs mt-0.5">
                  Tambahkan dompet watch-only untuk melihat visualisasi donat komposisi portofolio kripto Anda.
                </p>
                <button
                  type="button"
                  onClick={handleSeedDemoWallets}
                  className="mt-3 text-xs font-semibold text-emerald-600 hover:text-emerald-700 underline"
                >
                  Muat Contoh Dompet Demo
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {['BTC', 'ETH', 'SOL', 'Stablecoins'].map((cat) => {
              const item = chartData.find((c) => c.name === cat);
              const color = COLOR_MAP[cat] || '#64748b';
              return (
                <div key={cat} className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-700">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span>{cat}</span>
                  </div>
                  <div className="text-xs font-extrabold text-slate-900 mt-1">
                    {item ? `${item.percentage}%` : '0%'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Kolom Kanan: Rincian Alokasi Per Koin (Table Breakdown) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Rincian Kepemilikan Per Koin
              </h3>
              <span className="text-[11px] text-slate-400">
                {portfolio.allocation_by_asset.length} Simbol Aset
              </span>
            </div>

            <div className="space-y-2.5 max-h-[290px] overflow-y-auto pr-1">
              {portfolio.allocation_by_asset.length > 0 ? (
                portfolio.allocation_by_asset.map((asset) => {
                  const assetColor = COLOR_MAP[asset.symbol] || '#64748b';
                  return (
                    <div
                      key={asset.symbol}
                      className="p-3 rounded-lg border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white"
                          style={{ backgroundColor: assetColor }}
                        >
                          {asset.symbol.slice(0, 3)}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{asset.symbol}</span>
                            <span className="text-[10px] font-semibold text-slate-400">
                              {asset.percentage.toFixed(1)}%
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {asset.total_balance.toLocaleString('en-US', { maximumFractionDigits: 6 })} {asset.symbol}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-900">
                          {formatUSD(asset.value_usd)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {formatIDR(asset.value_idr)}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-xs text-slate-400">
                  Belum ada aset terdaftar
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>Total Nilai Valuasi:</span>
            <span className="text-emerald-700 font-bold">{formatIDR(portfolio.total_idr)}</span>
          </div>
        </div>
      </div>

      {/* 4. DAFTAR / TABEL DOMPET & ASET TERPERINCI */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Bar Filter & Pencarian */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Daftar Dompet Watch-Only ({filteredWallets.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Input Cari */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari dompet atau alamat..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 w-44 sm:w-56"
              />
            </div>

            {/* Filter Chain (Custom FigCraft Select) */}
            <div className="w-36 sm:w-44">
              <CustomSelect
                value={selectedChainFilter}
                onChange={setSelectedChainFilter}
                options={chainFilterOptions}
                size="sm"
              />
            </div>
          </div>
        </div>

        {/* Tabel Interaktif */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Nama / Label Dompet</th>
                <th className="py-3 px-4">Aset & Jaringan</th>
                <th className="py-3 px-4">Alamat Publik (Watch-Only)</th>
                <th className="py-3 px-4 text-right">Saldo Koin</th>
                <th className="py-3 px-4 text-right">Valuasi USD</th>
                <th className="py-3 px-4 text-right">Valuasi IDR</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredWallets.length > 0 ? (
                filteredWallets.map((wallet) => {
                  const assetColor = COLOR_MAP[wallet.asset_symbol] || COLOR_MAP[wallet.chain] || '#64748b';
                  const isCopied = copiedId === wallet.id;

                  return (
                    <tr key={wallet.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Label Dompet */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{wallet.label}</div>
                        {wallet.notes && (
                          <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1 max-w-[180px]">
                            {wallet.notes}
                          </div>
                        )}
                      </td>

                      {/* Simbol & Chain */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: assetColor }}
                          />
                          <div>
                            <span className="font-bold text-slate-900">{wallet.asset_symbol}</span>
                            <span className="text-[10px] text-slate-400 block font-mono">
                              {wallet.chain}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Alamat Publik Terpotong & Tombol Salin */}
                      <td className="py-3.5 px-4 font-mono">
                        <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded text-[11px] text-slate-700">
                          <span>{truncateAddress(wallet.address)}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyAddress(wallet)}
                            className="text-slate-400 hover:text-emerald-600 transition-colors"
                            title="Salin alamat publik"
                          >
                            {isCopied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        {isCopied && (
                          <span className="ml-1.5 text-[10px] font-semibold text-emerald-600">
                            Tersalin!
                          </span>
                        )}
                      </td>

                      {/* Saldo Koin */}
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900">
                        {Number(wallet.balance).toLocaleString('en-US', { maximumFractionDigits: 8 })}
                      </td>

                      {/* Valuasi USD */}
                      <td className="py-3.5 px-4 text-right font-semibold text-slate-900">
                        {formatUSD(wallet.value_usd)}
                      </td>

                      {/* Valuasi IDR */}
                      <td className="py-3.5 px-4 text-right font-bold text-emerald-800">
                        {formatIDR(wallet.value_idr)}
                      </td>

                      {/* Tombol Aksi */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingWallet(wallet);
                              setEditBalanceInput(String(wallet.balance));
                              setEditError('');
                            }}
                            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-emerald-700 transition-colors"
                            title="Edit Saldo Koin"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeletingWallet(wallet)}
                            className="p-1.5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Hapus Dompet"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Wallet className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">Tidak ada dompet ditemukan</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {searchQuery || selectedChainFilter !== 'ALL'
                        ? 'Coba ganti filter atau kata kunci pencarian.'
                        : 'Belum ada dompet kripto watch-only yang disimpan.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. MODAL TAMBAH DOMPET WATCH-ONLY */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                  <Coins className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  Tambah Dompet Watch-Only Baru
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              {/* BANNER PERINGATAN KEAMANAN TEBAL */}
              <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <span className="font-extrabold uppercase tracking-wide block mb-0.5 text-amber-950">
                    Peringatan Keamanan Non-Kustodian:
                  </span>
                  Hanya masukkan alamat publik (Watch-Only). Dilarang keras memasukkan Private Key atau Secret Recovery Phrase.
                </div>
              </div>

              {/* Alert Error */}
              {addError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>{addError}</span>
                </div>
              )}

              {/* Input Label Dompet */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama / Label Dompet <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Misal: Cold Storage Ledger, Phantom Solana Kayla"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Pilihan Jaringan (Chain) & Simbol Koin */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jaringan (Blockchain) <span className="text-rose-500">*</span>
                  </label>
                  <CustomSelect
                    value={newChain}
                    onChange={(selected) => {
                      setNewChain(selected);
                      const option = CHAIN_OPTIONS.find((c) => c.value === selected);
                      if (option) {
                        setNewSymbol(option.defaultSymbol);
                      }
                    }}
                    options={addWalletChainOptions}
                    placeholder="Pilih Jaringan..."
                    size="md"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Simbol Koin <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                    placeholder="BTC, ETH, SOL, TRX, USDT"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* Input Alamat Publik dengan Validasi Real-Time */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alamat Publik (Public Address) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder={CHAIN_OPTIONS.find((c) => c.value === newChain)?.placeholder || '0x...'}
                  className={`w-full px-3 py-2 text-xs rounded-lg font-mono focus:outline-hidden transition-colors ${
                    !addressValidation.checked
                      ? 'border border-slate-200'
                      : addressValidation.isSecret
                      ? 'border-2 border-rose-600 bg-rose-50 text-rose-900'
                      : addressValidation.valid
                      ? 'border border-emerald-500 bg-emerald-50/40 text-emerald-900'
                      : 'border border-rose-400 bg-rose-50/40 text-rose-900'
                  }`}
                />

                {/* Feedback Visual Validasi Alamat */}
                {addressValidation.checked && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                    {addressValidation.isSecret ? (
                      <span className="text-rose-700 font-bold flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        {addressValidation.error}
                      </span>
                    ) : addressValidation.valid ? (
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        Format alamat publik valid ({addressValidation.format || 'Watch-Only terverifikasi'})
                      </span>
                    ) : (
                      <span className="text-rose-600 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        {addressValidation.error}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Saldo Koin & Cost Basis */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Saldo Koin Saat Ini <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={newBalance}
                    onChange={(e) => setNewBalance(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cost Basis Satuan (USD, Opsional)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={newCostBasis}
                    onChange={(e) => setNewCostBasis(e.target.value)}
                    placeholder="Contoh: 62000"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* Catatan / Keterangan */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Dompet (Opsional)
                </label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Contoh: Staking liquid, simpanan cold storage"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Modal Footer Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || addressValidation.isSecret || !addressValidation.valid}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Dompet Watch-Only'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL EDIT SALDO KOIN */}
      {editingWallet && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Perbarui Saldo Dompet
              </h3>
              <button
                type="button"
                onClick={() => setEditingWallet(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditBalanceSubmit} className="p-5 space-y-3">
              <div>
                <div className="text-xs font-bold text-slate-800">{editingWallet.label}</div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {editingWallet.asset_symbol} ({truncateAddress(editingWallet.address)})
                </div>
              </div>

              {editError && (
                <div className="p-2 rounded bg-rose-50 text-rose-700 text-xs">
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Saldo Baru ({editingWallet.asset_symbol})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={editBalanceInput}
                  onChange={(e) => setEditBalanceInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 font-mono"
                  autoFocus
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingWallet(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
                >
                  Simpan Saldo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL KONFIRMASI HAPUS */}
      {deletingWallet && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="text-center">
              <h4 className="text-sm font-bold text-slate-900">
                Hapus Dompet Watch-Only?
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Dompet <span className="font-semibold text-slate-800">{deletingWallet.label}</span> akan dihapus dari daftar pengawasan.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingWallet(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs"
              >
                Ya, Hapus Dompet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
