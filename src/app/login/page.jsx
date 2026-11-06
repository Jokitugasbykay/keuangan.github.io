'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Logo, { LogoIcon } from '@/components/Logo';
import { apiUrl, isStaticDemoMode } from '@/lib/client-data';
import { 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Loader2,
  Sparkles,
  Info
} from 'lucide-react';

const ADMIN_EMAIL = 'kaylafisika24@gmail.com';

/**
 * Komponen Form Login Kayla Finance hasil implementasi desain FigCraft.
 * Mendukung seluruh kondisi UI: default, focused, invalid, password visible, loading, error, success transition, session expired.
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');

  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [emailError, setEmailError] = useState('');
  const [successTransition, setSuccessTransition] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    setIsDemo(isStaticDemoMode());
  }, []);

  // Validasi format email secara realtime jika ada input
  const handleEmailChange = (e) => {
    const val = e.target.value;
    setEmail(val);
    if (emailError) setEmailError('');
    if (errorMessage) setErrorMessage('');
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    if (errorMessage) setErrorMessage('');
  };

  const validateForm = () => {
    let isValid = true;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      setEmailError('Format email tidak valid.');
      isValid = false;
    }
    if (!password) {
      setErrorMessage('Password wajib diisi.');
      isValid = false;
    }
    return isValid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm() || loading) return;

    setLoading(true);
    setErrorMessage('');

    // Skenario 1: Pada Static Demo Hosting (GitHub Pages)
    // Server runtime Node.js tidak tersedia pada static export murni.
    if (isDemo) {
      setTimeout(() => {
        setLoading(false);
        setErrorMessage(
          'Runtime server autentikasi tidak aktif di GitHub Pages (Static Hosting). Silakan gunakan tombol "Buka Mode Demo Publik" di bawah untuk melihat dashboard atau jalankan secara lokal (npm run dev) untuk autentikasi server privat.'
        );
      }, 700);
      return;
    }

    // Skenario 2: Pada Server Runtime Lokal (Node.js backend aktif)
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setErrorMessage(data?.error || 'Email atau password salah. Silakan coba kembali.');
        setLoading(false);
        return;
      }

      // Autentikasi Berhasil: Transisi visual halus sebelum redirect
      setSuccessTransition(true);
      setTimeout(() => {
        router.push('/');
      }, 900);
    } catch {
      setErrorMessage('Gagal terhubung ke server autentikasi. Pastikan koneksi atau server lokal aktif.');
      setLoading(false);
    }
  };

  const handleBypassDemo = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between items-center px-4 py-8 sm:py-12 select-none overflow-x-hidden">
      {/* Decorative Top Accent Mesh */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600" />

      {/* Main Card Container */}
      <div className="w-full max-w-[440px] my-auto">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs mb-3 flex items-center justify-center">
            <LogoIcon size={36} />
          </div>
          <div className="flex items-center text-xl font-bold tracking-tight">
            <span className="text-slate-900">Kayla</span>
            <span className="text-emerald-600 ml-1">Finance</span>
          </div>
          <p className="text-xs text-slate-400 font-medium mt-0.5 tracking-tight">
            Personal &amp; Trading Finance System
          </p>
        </div>

        {/* Card Body */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 relative overflow-hidden transition-all duration-200">
          {/* Success Transition Overlay (State 8 FigCraft) */}
          {successTransition ? (
            <div className="py-8 flex flex-col items-center text-center space-y-3 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Autentikasi Berhasil</h3>
              <p className="text-xs text-emerald-700 font-medium">
                Kredensial terverifikasi. Mengalihkan ke Dashboard...
              </p>
              <div className="w-32 h-1 bg-slate-100 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-emerald-500 rounded-full animate-pulse w-full" />
              </div>
            </div>
          ) : (
            <>
              {/* Card Title */}
              <div className="mb-6">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  Selamat Datang Kembali
                </h1>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Masuk ke sistem manajemen keuangan pribadi &amp; trading MT5.
                </p>
              </div>

              {/* Session Expired Banner (State 9 FigCraft) */}
              {reason === 'expired' && !errorMessage && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Sesi Berakhir</span>
                    Sesi Anda telah kedaluwarsa. Silakan masuk kembali dengan password Anda.
                  </div>
                </div>
              )}

              {/* Generic Error Banner (State 6 & 7 FigCraft) */}
              {errorMessage && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in duration-150">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-semibold block">Gagal Masuk</span>
                    <span className="leading-relaxed">{errorMessage}</span>
                  </div>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email Field */}
                <div>
                  <label 
                    htmlFor="email" 
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Email Administrator
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={handleEmailChange}
                      autoComplete="email"
                      required
                      placeholder="kaylafisika24@gmail.com"
                      className={`w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border bg-white text-slate-900 transition-all duration-150 focus:outline-none focus:ring-2 ${
                        emailError 
                          ? 'border-rose-300 focus:ring-rose-400 bg-rose-50/30' 
                          : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                      }`}
                    />
                  </div>
                  {emailError && (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {emailError}
                    </p>
                  )}
                </div>

                {/* Password Field */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label 
                      htmlFor="password" 
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Password
                    </label>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={handlePasswordChange}
                      autoComplete="current-password"
                      required
                      placeholder="Masukkan password Anda"
                      className="w-full pl-9 pr-20 py-2.5 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 transition-all duration-150 focus:outline-none focus:ring-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                          <EyeOff className="w-3.5 h-3.5" />
                          Sembunyi
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px]">
                          <Eye className="w-3.5 h-3.5" />
                          Lihat
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Security Indicator Pill */}
                <div className="p-2.5 bg-emerald-50/70 border border-emerald-100 rounded-xl flex items-center gap-2 text-[11px] text-emerald-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-medium">
                    {isDemo ? 'Lingkungan Demo Publik Statis' : 'Proteksi Sesi Terenkripsi & Verifikasi Server'}
                  </span>
                </div>

                {/* Submit Button (State 5 FigCraft) */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white text-xs font-semibold rounded-xl transition-all duration-150 flex items-center justify-center gap-2 shadow-xs disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Memverifikasi Kredensial...</span>
                    </>
                  ) : (
                    <>
                      <span>Masuk ke Dashboard</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>

              {/* Demo Mode Button for GitHub Pages Reviewers */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleBypassDemo}
                  className="w-full py-2.5 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium rounded-xl transition-all duration-150 flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Buka Mode Demo Publik (Data Sintetis)</span>
                </button>
                <p className="text-[11px] text-slate-400 text-center mt-2">
                  Mode demo menggunakan basis data tiruan yang aman.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Informative Security Context Note */}
        <div className="mt-4 text-center">
          <p className="text-[11px] text-slate-400">
            Akses Terbatas • Hanya Administrator Kayla Finance yang Terdaftar
          </p>
        </div>
      </div>

      {/* Minimalist Footer */}
      <footer className="mt-8 text-center text-[11px] text-slate-400 space-y-1">
        <p>Kayla Finance &bull; Personal &amp; Trading Finance System</p>
        <p className="text-[10px] text-slate-300">Hak Cipta Dilindungi &bull; 2026</p>
      </footer>
    </div>
  );
}

/**
 * Halaman Login Utama dengan Suspense boundary untuk useSearchParams.
 * @returns {React.ReactElement}
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
