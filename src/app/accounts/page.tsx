'use client';

import React, { useEffect, useState } from 'react';
import Header from '@/components/Header';
import CustomSelect, { SelectOption } from '@/components/CustomSelect';
import { DatabaseSchema, Account, AccountType } from '@/lib/types';
import { 
  Building2, 
  Smartphone, 
  CandlestickChart, 
  CreditCard, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Edit3 
} from 'lucide-react';

function formatCurrency(amount: number, currency: string) {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}

const TYPE_ICONS: Record<AccountType, any> = {
  bank: Building2,
  ewallet: Smartphone,
  trading: CandlestickChart,
  payment_gateway: CreditCard,
};

const TYPE_LABELS: Record<AccountType, string> = {
  bank: 'Rekening Bank',
  ewallet: 'E-Wallet',
  trading: 'Akun Trading (MT5)',
  payment_gateway: 'Payment Gateway (Mayar)',
};

export default function AccountsPage() {
  const [data, setData] = useState<DatabaseSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);

  // New account form state
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('bank');
  const [currency, setCurrency] = useState<'IDR' | 'USD'>('IDR');
  const [balance, setBalance] = useState('0');

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          provider: provider || name,
          account_type: accountType,
          currency,
          current_balance: parseFloat(balance) || 0,
        })
      });
      if (res.ok) {
        setShowAddModal(false);
        setName('');
        setProvider('');
        setBalance('0');
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAccount) return;

    try {
      const res = await fetch('/api/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editAccount.id,
          name: editAccount.name,
          current_balance: editAccount.current_balance,
          is_active: editAccount.is_active,
        })
      });
      if (res.ok) {
        setEditAccount(null);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleStatus = async (account: Account) => {
    try {
      await fetch('/api/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: account.id,
          is_active: !account.is_active,
        })
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 pb-12">
      <Header
        title="Manajemen Akun Keuangan"
        subtitle="Kelola rekening perbankan, e-wallet, pos bisnis Mayar, dan akun MT5"
        onRefresh={fetchData}
        isRefreshing={loading}
      />

      <main className="p-4 sm:p-8 space-y-6 max-w-7xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">Daftar Akun Terdaftar</h3>
            <p className="text-xs text-slate-500">Total {data?.accounts.length || 0} akun aktif dan terintegrasi</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-xs btn-interactive"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Akun</span>
          </button>
        </div>

        {/* Grid of Accounts (FigCraft 02_Accounts_Desktop) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {data?.accounts.map((acc) => {
            const Icon = TYPE_ICONS[acc.account_type] || Building2;
            return (
              <div
                key={acc.id}
                className={`bg-white border rounded-xl p-5 flex flex-col justify-between shadow-xs card-interactive ${
                  acc.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 leading-tight">{acc.name}</h4>
                        <span className="text-[11px] text-slate-500">{TYPE_LABELS[acc.account_type]} • {acc.provider}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleStatus(acc)}
                      title={acc.is_active ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      {acc.is_active ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
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
                  <button
                    onClick={() => setEditAccount(acc)}
                    className="flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-semibold text-xs"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Rekonsiliasi</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-backdrop">
          <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-md p-5 sm:p-6 shadow-xl animate-bottom-sheet sm:animate-modal max-h-[92vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 mb-4">Tambah Akun Keuangan</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Nama Akun</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Tabungan Mandiri Utama"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Penyedia / Bank / Broker</label>
                <input
                  type="text"
                  placeholder="Contoh: Mandiri, BCA, Exness, Mayar"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Jenis Akun</label>
                  <CustomSelect
                    value={accountType}
                    onChange={(val) => setAccountType(val as AccountType)}
                    options={[
                      { value: 'bank', label: 'Bank', subLabel: 'BCA, Mandiri, dll' },
                      { value: 'ewallet', label: 'E-Wallet', subLabel: 'GoPay, OVO, Dana' },
                      { value: 'trading', label: 'Trading MT5', subLabel: 'Exness, dll' },
                      { value: 'payment_gateway', label: 'Payment Gateway', subLabel: 'Mayar' },
                    ]}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Mata Uang</label>
                  <CustomSelect
                    value={currency}
                    onChange={(val) => setCurrency(val as 'IDR' | 'USD')}
                    options={[
                      { value: 'IDR', label: 'IDR', subLabel: 'Rupiah' },
                      { value: 'USD', label: 'USD', subLabel: 'Dollar' },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Saldo Awal</label>
                <input
                  type="number"
                  step="any"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 btn-interactive"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-xs btn-interactive"
                >
                  Simpan Akun
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Reconciliation Modal */}
      {editAccount && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-backdrop">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 shadow-xl animate-modal">
            <h3 className="text-base font-bold text-slate-900 mb-1">Penyesuaian Saldo / Rekonsiliasi</h3>
            <p className="text-xs text-slate-500 mb-4">{editAccount.name} ({editAccount.provider})</p>
            <form onSubmit={handleUpdateBalance} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Nama Akun</label>
                <input
                  type="text"
                  value={editAccount.name}
                  onChange={(e) => setEditAccount({ ...editAccount, name: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Saldo Nyata ({editAccount.currency})
                </label>
                <input
                  type="number"
                  step="any"
                  value={editAccount.current_balance}
                  onChange={(e) => setEditAccount({ ...editAccount, current_balance: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditAccount(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 btn-interactive"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-xs btn-interactive"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
