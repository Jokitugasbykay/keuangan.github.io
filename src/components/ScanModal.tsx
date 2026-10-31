'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  X,
  ScanLine,
  Upload,
  Camera,
  Loader2,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  RotateCcw,
  Sparkles,
  FileText,
  ZoomIn,
  ZoomOut,
  ShieldCheck,
  ChevronLeft,
  Smartphone,
  RefreshCw,
  Monitor,
  Tablet,
  Video,
} from 'lucide-react';
import { Account, Category, TransactionType } from '@/lib/types';
import type { ScanResult } from '@/app/api/scan/route';
import CustomSelect, { SelectOption } from './CustomSelect';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
interface ExistingTransaction {
  id: string;
  external_transaction_id?: string;
  amount: number;
  transaction_date: string;
}

interface ScanModalProps {
  accounts: Account[];
  categories: Category[];
  existingTransactions: ExistingTransaction[];
  defaultType?: 'income' | 'expense';
  onClose: () => void;
  onSaved: () => void;
}

type Step = 'upload' | 'camera' | 'scanning' | 'review' | 'saving';

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ----------------------------------------------------------------
// Component
// ----------------------------------------------------------------
export default function ScanModal({
  accounts,
  categories,
  existingTransactions,
  defaultType = 'expense',
  onClose,
  onSaved,
}: ScanModalProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step state
  const [step, setStep] = useState<Step>('upload');

  // Image & Zoom
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  // Scanning lifecycle state
  const [scanStage, setScanStage] = useState<number>(1);
  const [ocrEngineName, setOcrEngineName] = useState<string>('RapidOCR ONNX Lokal');
  const [scanError, setScanError] = useState<string | null>(null);

  // Review form fields
  const [txType, setTxType] = useState<TransactionType>(defaultType);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('IDR');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [merchant, setMerchant] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const [confidence, setConfidence] = useState<'low' | 'medium' | 'high' | null>(null);

  // Duplicate detection
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Save state
  const [saveError, setSaveError] = useState<string | null>(null);

  // Live WebRTC Camera state (Desktop webcam, Tablet, and HP)
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // Stop live camera tracks
  const stopLiveCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsCameraLoading(false);
  }, []);

  // Cleanup object URL and camera stream on unmount
  useEffect(() => {
    return () => {
      stopLiveCamera();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl, stopLiveCamera]);

  // Start live camera (supports HP, Desktop webcam, and Tablet)
  const startLiveCamera = useCallback(async (mode: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    setIsCameraLoading(true);
    setStep('camera');

    // Check if WebRTC getUserMedia is supported in current browser environment
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      setIsCameraLoading(false);
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      } else {
        setCameraError('Akses kamera WebRTC tidak tersedia di browser ini. Silakan gunakan pemilih berkas.');
      }
      return;
    }

    // Check for multiple cameras (e.g. front & back on tablet / smartphone)
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      setHasMultipleCameras(videoDevices.length > 1);
    } catch {
      setHasMultipleCameras(false);
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch {
        // Fallback for desktop PC webcams that don't support facingMode constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
      setIsCameraLoading(false);
    } catch (err: any) {
      console.error('Kamera gagal dimulai:', err);
      setIsCameraLoading(false);
      setIsCameraActive(false);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Izin akses kamera ditolak oleh browser. Silakan izinkan akses kamera di pengaturan browser atau gunakan tombol Kamera HP.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('Kamera tidak terdeteksi pada perangkat ini. Silakan pilih foto dari galeri.');
      } else {
        setCameraError('Kamera tidak dapat diakses saat ini. Anda dapat menggunakan kamera bawaan perangkat atau pemilih file.');
      }
    }
  }, [facingMode]);

  // Switch camera between front and rear (Tablet / Phone)
  const switchCamera = useCallback(async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    stopLiveCamera();
    await startLiveCamera(nextMode);
  }, [facingMode, startLiveCamera, stopLiveCamera]);

  // Capture high-resolution snapshot from live video stream
  const takeSnapshot = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
        stopLiveCamera();

        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        setIsZoomed(false);
        setStep('upload');
      },
      'image/jpeg',
      0.92
    );
  }, [previewUrl, stopLiveCamera]);

  // ----------------------------------------------------------------
  // File selection handler
  // ----------------------------------------------------------------
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!SUPPORTED_TYPES.includes(file.type)) {
      setScanError(`Format berkas "${file.type}" tidak didukung. Harap gunakan format gambar JPG, PNG, atau WebP.`);
      e.target.value = '';
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setScanError('Ukuran berkas terlalu besar. Batas maksimal adalah 15 MB.');
      e.target.value = '';
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setScanError(null);
    setSelectedFile(file);
    setIsZoomed(false);
    setPreviewUrl(URL.createObjectURL(file));
    e.target.value = '';
  }, [previewUrl]);

  // ----------------------------------------------------------------
  // Trigger Handlers
  // ----------------------------------------------------------------
  const triggerCameraInput = useCallback(() => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  }, []);

  const triggerFileInput = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  // ----------------------------------------------------------------
  // Scan process with guaranteed visual animation & progress stages
  // ----------------------------------------------------------------
  const handleScan = useCallback(async () => {
    if (!selectedFile) return;

    setScanError(null);
    setStep('scanning');
    setScanStage(1);

    // Timeline staged progression for visual feedback
    const stageTimer1 = setTimeout(() => setScanStage(2), 350);
    const stageTimer2 = setTimeout(() => setScanStage(3), 850);

    try {
      const base64Promise = toBase64(selectedFile);
      const minDisplayPromise = sleep(1400); // Pastikan animasi pemindaian terlihat jelas minimal 1.4 detik

      const base64 = await base64Promise;

      const fetchPromise = fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: selectedFile.type,
          transactionType: defaultType,
        }),
      }).then(async (res) => {
        const json: ScanResult = await res.json();
        return { ok: res.ok, json };
      });

      const [, fetchResult] = await Promise.all([minDisplayPromise, fetchPromise]);
      const { ok, json } = fetchResult;

      if (!ok || !json.success || !json.data) {
        setScanError(json.error ?? 'Gagal memproses gambar dengan OCR lokal. Pastikan teks terlihat jelas.');
        setStep('upload');
        return;
      }

      const d = json.data;
      if (json.ocrEngine) {
        setOcrEngineName(json.ocrEngine);
      }

      setScanStage(4);
      await sleep(300); // Transisi halus saat ekstraksi selesai

      // Populate form
      setTxType((d.transaction_type as TransactionType) ?? defaultType);
      setAmount(d.amount !== null && d.amount !== undefined ? String(d.amount) : '');
      setCurrency(d.currency ?? 'IDR');
      setDate(formatDate(d.date));
      setDescription(d.description ?? '');
      setMerchant(d.merchant ?? '');
      setReferenceNumber(d.reference_number ?? '');
      setNotes(d.notes ?? '');
      setConfidence(d.confidence ?? null);

      if (d.suggested_account) {
        const hint = d.suggested_account.toLowerCase();
        const matched = accounts.find(
          (a) =>
            a.name.toLowerCase().includes(hint) ||
            (a.provider ?? '').toLowerCase().includes(hint)
        );
        if (matched) setAccountId(matched.id);
      }

      // Cek duplikasi
      let dupMsg: string | null = null;
      if (d.reference_number) {
        const refMatch = existingTransactions.find(
          (t) => t.external_transaction_id === d.reference_number
        );
        if (refMatch) {
          dupMsg = `Nomor referensi "${d.reference_number}" sudah tercatat sebelumnya. Mohon periksa kembali agar tidak terjadi pencatatan ganda.`;
        }
      }
      if (!dupMsg && d.amount !== null && d.date) {
        const dateStr = formatDate(d.date);
        const amountMatch = existingTransactions.find(
          (t) =>
            t.amount === d.amount &&
            t.transaction_date.slice(0, 10) === dateStr
        );
        if (amountMatch) {
          dupMsg = `Ditemukan transaksi lain dengan nominal dan tanggal yang serupa di riwayat Anda.`;
        }
      }
      setDuplicateWarning(dupMsg);

      setStep('review');
    } catch (err) {
      console.error(err);
      setScanError('Koneksi terputus ke modul OCR lokal. Silakan coba kembali.');
      setStep('upload');
    } finally {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
    }
  }, [selectedFile, defaultType, accounts, existingTransactions]);

  // ----------------------------------------------------------------
  // Save transaction handler
  // ----------------------------------------------------------------
  const handleSave = useCallback(async () => {
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0 || !description || !accountId) {
      setSaveError('Kolom nominal harus berupa angka lebih besar dari 0, deskripsi dan akun wajib diisi.');
      return;
    }
    setSaveError(null);
    setStep('saving');

    try {
      const payload = {
        account_id: accountId,
        transaction_type: txType,
        amount: parseFloat(amount),
        description: merchant ? `${merchant} - ${description}` : description,
        category_id: categoryId || undefined,
        notes: notes || undefined,
        source: 'scan',
        external_transaction_id: referenceNumber || undefined,
        transaction_date: date ? new Date(date).toISOString() : new Date().toISOString(),
      };

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onSaved();
      } else {
        const j = await res.json();
        setSaveError(j.error ?? 'Gagal menyimpan transaksi.');
        setStep('review');
      }
    } catch (err) {
      console.error(err);
      setSaveError('Terjadi kesalahan jaringan saat menyimpan data.');
      setStep('review');
    }
  }, [amount, description, accountId, txType, merchant, categoryId, notes, referenceNumber, date, onSaved]);

  const isScanning = step === 'scanning';
  const isSaving = step === 'saving';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex sm:items-center sm:justify-center p-0 sm:p-4 animate-backdrop">
      {/* Modal Dialog Container: Fullscreen on mobile, centered dialog on desktop */}
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:rounded-2xl shadow-2xl flex flex-col animate-bottom-sheet sm:animate-modal overflow-hidden">

        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-100 shrink-0 bg-white">
          <div className="flex items-center gap-2.5">
            {step === 'review' || step === 'camera' ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 'camera') stopLiveCamera();
                  setStep('upload');
                }}
                className="p-1 -ml-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                title="Kembali ke Pratinjau Foto"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <ScanLine className="w-4 h-4" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                {step === 'review'
                  ? 'Tinjau Hasil Ekstraksi'
                  : step === 'camera'
                  ? 'Kamera Pemindai Bukti'
                  : 'Scan Bukti Transaksi'}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span className="text-[10px] text-emerald-700 font-medium">OCR Lokal Mandiri (Tanpa API Key)</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopLiveCamera();
              onClose();
            }}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            disabled={isScanning || isSaving}
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4 space-y-4">

          {/* ---- STEP: UPLOAD & CAMERA CAPTURE ---- */}
          {step === 'upload' && (
            <div className="space-y-4 animate-slide-up">
              {/* Image Viewport / Drop Zone */}
              {!previewUrl ? (
                <div
                  className="relative overflow-hidden border-2 border-dashed border-slate-200 rounded-2xl p-6 sm:p-10 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/20 transition-all duration-200 group"
                >
                  {/* Direct Native Touch Overlay */}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    title="Pilih Berkas Bukti Transaksi"
                  />
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3.5 group-hover:scale-105 transition-transform duration-200 shadow-xs pointer-events-none">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-800 pointer-events-none">
                    Pilih Berkas atau Ambil Foto
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed pointer-events-none">
                    Struk belanja, bukti transfer bank (BCA, Mandiri, blu, dsb), atau pembayaran QRIS
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Image Viewport with Zoom Toggle */}
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-950/5 flex items-center justify-center min-h-[220px] max-h-[340px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Pratinjau Bukti Transaksi"
                      className={`w-full max-h-[340px] object-contain transition-transform duration-200 ${
                        isZoomed ? 'scale-150 cursor-zoom-out' : 'scale-100 cursor-zoom-in'
                      }`}
                      onClick={() => setIsZoomed(!isZoomed)}
                    />

                    {/* Zoom Toggle Button */}
                    <button
                      type="button"
                      onClick={() => setIsZoomed(!isZoomed)}
                      className="absolute bottom-2.5 right-2.5 bg-white/90 backdrop-blur-xs border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-white shadow-xs flex items-center gap-1 btn-interactive"
                    >
                      {isZoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                      <span>{isZoomed ? 'Perkecil' : 'Perbesar'}</span>
                    </button>

                    {/* Reset Image Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                        setScanError(null);
                        setIsZoomed(false);
                      }}
                      className="absolute top-2.5 right-2.5 bg-white/90 backdrop-blur-xs border border-slate-200 rounded-full p-2 text-slate-600 hover:text-rose-600 shadow-xs btn-interactive"
                      title="Ganti Foto"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Selected File Details */}
                  {selectedFile && (
                    <div className="flex items-center justify-between px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 shrink-0 text-emerald-600" />
                        <span className="truncate font-semibold">{selectedFile.name}</span>
                        <span className="text-[10px] text-emerald-600 font-mono">
                          ({formatFileSize(selectedFile.size)})
                        </span>
                      </div>
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full shrink-0">
                        Siap Scan
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Device Compatibility Indicator */}
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700">Kamera Kompatibel:</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 font-medium text-slate-700">
                    <Smartphone className="w-3.5 h-3.5 text-emerald-600" /> HP
                  </span>
                  <span className="flex items-center gap-1 font-medium text-slate-700">
                    <Tablet className="w-3.5 h-3.5 text-emerald-600" /> Tablet
                  </span>
                  <span className="flex items-center gap-1 font-medium text-slate-700">
                    <Monitor className="w-3.5 h-3.5 text-emerald-600" /> Desktop
                  </span>
                </div>
              </div>

              {/* Action Buttons: Buka Kamera & Pilih File */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {/* Button 1: Dedicated Camera Button (WebRTC for Desktop, Tablet & HP) */}
                <button
                  type="button"
                  onClick={() => startLiveCamera()}
                  className="flex items-center justify-center gap-2.5 py-3.5 px-4 text-xs sm:text-sm font-bold text-slate-800 bg-white border-2 border-slate-200 hover:border-emerald-500 rounded-xl hover:bg-emerald-50/20 active:scale-[0.98] btn-interactive shadow-xs"
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Camera className="w-4 h-4" />
                  </div>
                  <span>Buka Kamera</span>
                </button>

                {/* Button 2: Dedicated File Picker (Gallery / File Upload) */}
                <button
                  type="button"
                  onClick={triggerFileInput}
                  className="flex items-center justify-center gap-2.5 py-3.5 px-4 text-xs sm:text-sm font-bold text-slate-800 bg-white border-2 border-slate-200 hover:border-slate-400 rounded-xl hover:bg-slate-50 active:scale-[0.98] btn-interactive shadow-xs"
                >
                  <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                    <Upload className="w-4 h-4" />
                  </div>
                  <span>Pilih File</span>
                </button>
              </div>

              {/* Hidden Native File Inputs for direct access and fallback */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
                title="Kamera Bawaan HP"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileChange}
                className="hidden"
                title="Pilih Berkas dari Galeri"
              />

              {/* Alternative direct phone camera button */}
              <div className="flex items-center justify-center pt-0.5">
                <button
                  type="button"
                  onClick={triggerCameraInput}
                  className="text-[11px] text-slate-500 hover:text-emerald-700 underline font-medium transition-colors"
                >
                  Atau buka langsung aplikasi kamera bawaan HP
                </button>
              </div>

              {/* Mobile Local Network Access Helper */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5 text-[11px] text-slate-600">
                <Smartphone className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold text-slate-800">Uji langsung di HP Anda:</span> Buka browser ponsel dan akses{' '}
                  <span className="font-mono text-emerald-700 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    http://10.203.152.249:3000
                  </span>{' '}
                  (koneksi Wi-Fi yang sama).
                </div>
              </div>

              {/* Error Message */}
              {scanError && (
                <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 animate-slide-down">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="leading-relaxed">{scanError}</span>
                </div>
              )}
            </div>
          )}

          {/* ---- STEP: LIVE CAMERA (HP, Desktop & Tablet) ---- */}
          {step === 'camera' && (
            <div className="space-y-4 animate-slide-up">
              {/* Live Video Viewport */}
              <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500 bg-slate-950 flex items-center justify-center min-h-[300px] sm:min-h-[360px] max-h-[460px] shadow-lg">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transition-opacity duration-300 ${
                    isCameraActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />

                {/* Loading Spinner */}
                {isCameraLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-white gap-2 z-10">
                    <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                    <p className="text-xs font-semibold">Mengaktifkan kamera...</p>
                    <p className="text-[10px] text-slate-400">Desktop webcam, Tablet, atau HP</p>
                  </div>
                )}

                {/* Viewfinder Target Framing Guides */}
                {isCameraActive && (
                  <div className="absolute inset-5 sm:inset-8 border border-white/40 rounded-xl pointer-events-none flex flex-col justify-between p-3">
                    <div className="flex justify-between items-start">
                      <div className="w-6 h-6 border-t-2 border-l-2 border-emerald-400 -mt-0.5 -ml-0.5 rounded-tl" />
                      <div className="w-6 h-6 border-t-2 border-r-2 border-emerald-400 -mt-0.5 -mr-0.5 rounded-tr" />
                    </div>
                    <div className="text-center">
                      <span className="text-[11px] font-medium text-white/90 bg-slate-900/70 backdrop-blur-xs py-1 px-3 rounded-full shadow-xs inline-block">
                        Arahkan bukti transfer / struk ke dalam bingkai
                      </span>
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="w-6 h-6 border-b-2 border-l-2 border-emerald-400 -mb-0.5 -ml-0.5 rounded-bl" />
                      <div className="w-6 h-6 border-b-2 border-r-2 border-emerald-400 -mb-0.5 -mr-0.5 rounded-br" />
                    </div>
                  </div>
                )}

                {/* Switch Camera Button (Front/Back) */}
                {isCameraActive && hasMultipleCameras && (
                  <button
                    type="button"
                    onClick={switchCamera}
                    className="absolute top-3 right-3 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full p-2.5 shadow-md backdrop-blur-xs transition-colors z-20"
                    title="Ganti Kamera Depan / Belakang"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}

                {/* Camera Mode Badge */}
                <div className="absolute top-3 left-3 bg-emerald-600/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-xs flex items-center gap-1.5 backdrop-blur-xs z-20">
                  <Video className="w-3 h-3" />
                  <span>Kamera Aktif</span>
                </div>
              </div>

              {/* Camera Error Alert */}
              {cameraError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2 animate-slide-down">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                    <span className="leading-relaxed">{cameraError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      stopLiveCamera();
                      setStep('upload');
                      if (cameraInputRef.current) cameraInputRef.current.click();
                    }}
                    className="text-xs font-semibold text-rose-700 underline hover:text-rose-900 block"
                  >
                    Gunakan pemilih kamera bawaan perangkat
                  </button>
                </div>
              )}

              {/* Action Controls */}
              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    stopLiveCamera();
                    setStep('upload');
                  }}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors btn-interactive"
                >
                  Batal
                </button>

                {/* Shutter Button */}
                <button
                  type="button"
                  onClick={takeSnapshot}
                  disabled={!isCameraActive || isCameraLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-6 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md transition-all btn-interactive"
                >
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white bg-emerald-300" />
                  <span>Ambil Foto</span>
                </button>

                {/* Device native camera fallback */}
                <button
                  type="button"
                  onClick={() => {
                    stopLiveCamera();
                    setStep('upload');
                    if (cameraInputRef.current) cameraInputRef.current.click();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors btn-interactive"
                  title="Gunakan Kamera Bawaan HP"
                >
                  <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden sm:inline">Kamera HP</span>
                </button>
              </div>
            </div>
          )}

          {/* ---- STEP: SCANNING (Animated Laser & Multi-Stage Progress) ---- */}
          {step === 'scanning' && (
            <div className="space-y-4 animate-slide-up">
              {/* Image Viewport with Guaranteed Laser Scanner Animation */}
              <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500/50 bg-slate-900/10 flex items-center justify-center h-64 sm:h-72 w-full shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Sedang memproses OCR"
                    className="w-full h-full object-contain opacity-80 filter contrast-105"
                  />
                )}

                {/* Glowing Emerald Scanning Laser Line (Hardware-accelerated) */}
                <div className="absolute inset-x-0 h-1 bg-emerald-400 shadow-[0_0_20px_4px_#10B981] animate-scan-laser pointer-events-none z-10" />

                {/* Light Sweep Gradient Veil */}
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/15 via-transparent to-emerald-500/15 pointer-events-none animate-scan-glow" />

                {/* Scanner Grid Overlay */}
                <div
                  className="absolute inset-0 pointer-events-none opacity-20"
                  style={{
                    backgroundImage: 'linear-gradient(to right, #10b981 1px, transparent 1px), linear-gradient(to bottom, #10b981 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                  }}
                />
              </div>

              {/* Progress Card with Multi-Stage Feedback */}
              <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 animate-spin" />
                    Memproses Pemindaian OCR
                  </span>
                  <span className="text-[11px] font-mono text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                    {ocrEngineName}
                  </span>
                </div>

                {/* Shimmering Progress Bar */}
                <div className="w-full bg-emerald-200/60 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full animate-shimmer transition-all duration-300"
                    style={{ width: `${scanStage * 25}%` }}
                  />
                </div>

                {/* Multi-Step Indicator */}
                <div className="text-[11px] text-emerald-900 space-y-1.5 pt-0.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Resolusi dan format gambar terverifikasi</span>
                  </div>

                  <div className="flex items-center gap-2 font-medium">
                    {scanStage >= 2 ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700 shrink-0" />
                    )}
                    <span>RapidOCR lokal mendeteksi baris teks pada bukti transaksi</span>
                  </div>

                  <div className="flex items-center gap-2 font-medium">
                    {scanStage >= 3 ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700 shrink-0" />
                    )}
                    <span>Mengekstrak nominal rupiah, tanggal, penerima, dan ID referensi</span>
                  </div>
                </div>
              </div>

              {/* Skeletons Placeholder */}
              <div className="space-y-2.5 pt-1">
                <div className="h-9 rounded-lg animate-shimmer" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-9 rounded-lg animate-shimmer" />
                  <div className="h-9 rounded-lg animate-shimmer" />
                </div>
              </div>
            </div>
          )}

          {/* ---- STEP: REVIEW (Editable Form) ---- */}
          {(step === 'review' || step === 'saving') && (
            <div className="space-y-4 animate-slide-up pb-8 sm:pb-0">
              {/* Success Banner */}
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-900 animate-slide-down">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold">Data transaksi berhasil diekstrak</div>
                  <div className="text-[11px] text-emerald-700 leading-relaxed">
                    Diproses oleh {ocrEngineName}. Silakan periksa atau ubah data di bawah sebelum menyimpan.
                  </div>
                </div>
              </div>

              {/* Confidence Badge */}
              {confidence && (
                <div className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold border ${
                  confidence === 'high'
                    ? 'bg-slate-50 border-slate-200 text-slate-800'
                    : confidence === 'medium'
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  {confidence === 'high' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    Akurasi OCR:{' '}
                    {confidence === 'high' ? 'Tinggi' : confidence === 'medium' ? 'Sedang' : 'Perlu Koreksi Manual'}.
                  </span>
                </div>
              )}

              {/* Duplicate Warning */}
              {duplicateWarning && (
                <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 animate-slide-down">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span className="leading-relaxed">{duplicateWarning}</span>
                </div>
              )}

              {/* Transaction Type Toggle */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Jenis Transaksi</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['income', 'expense'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setTxType(type);
                        setCategoryId('');
                      }}
                      className={`py-2.5 rounded-xl text-xs font-bold border btn-interactive ${
                        txType === type
                          ? type === 'income'
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs'
                            : 'bg-rose-50 border-rose-300 text-rose-700 shadow-xs'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {type === 'income' ? 'Pemasukan' : 'Pengeluaran'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount + Currency */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Nominal <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    placeholder="Contoh: 150000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Mata Uang</label>
                  <CustomSelect
                    value={currency}
                    onChange={setCurrency}
                    options={[
                      { value: 'IDR', label: 'IDR', subLabel: 'Rupiah' },
                      { value: 'USD', label: 'USD', subLabel: 'Dollar' },
                    ]}
                    size="md"
                  />
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Tanggal Transaksi</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"
                />
              </div>

              {/* Merchant / Party */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Pihak Penerima / Pengirim / Merchant</label>
                <input
                  type="text"
                  placeholder="Contoh: Tokopedia, Indomaret, Budi Santoso"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Deskripsi Transaksi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ringkasan keterangan transaksi"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors font-medium"
                  required
                />
              </div>

              {/* Reference Number */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Nomor Referensi Transaksi (Opsional)</label>
                <input
                  type="text"
                  placeholder="ID Transaksi / Nomor Referensi m-Banking"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors font-mono"
                />
              </div>

              {/* Financial Account */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Tujuan Akun Rekening</label>
                <CustomSelect
                  value={accountId}
                  onChange={setAccountId}
                  options={accounts.map((a) => ({
                    value: a.id,
                    label: a.name,
                    subLabel: `(${a.provider || a.account_type})`,
                    badge: a.currency,
                  }))}
                  placeholder="Pilih Akun Rekening"
                  direction="auto"
                  size="md"
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Kategori Pengeluaran / Pemasukan</label>
                <CustomSelect
                  value={categoryId}
                  onChange={setCategoryId}
                  options={[
                    { value: '', label: 'Tanpa Kategori' },
                    ...categories
                      .filter((c) => c.category_type === txType)
                      .map((c) => ({
                        value: c.id,
                        label: c.name,
                      })),
                  ]}
                  placeholder="Tanpa Kategori"
                  direction="auto"
                  size="md"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Catatan Tambahan (Opsional)</label>
                <textarea
                  rows={2}
                  placeholder="Catatan tambahan bila diperlukan..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"
                />
              </div>

              {/* Save Error */}
              {saveError && (
                <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 animate-slide-down">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="leading-relaxed">{saveError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Bottom Sticky Actions */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-100 shrink-0 flex items-center justify-between gap-3 bg-white/95 backdrop-blur-xs">
          {/* Left Action */}
          <div>
            {step === 'review' && (
              <button
                type="button"
                onClick={() => {
                  setStep('upload');
                  setScanError(null);
                  setDuplicateWarning(null);
                  setSaveError(null);
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 py-2 px-1 btn-interactive"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Scan Ulang</span>
              </button>
            )}
          </div>

          {/* Right Action */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isScanning || isSaving}
              className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 rounded-xl transition-colors btn-interactive"
            >
              Batal
            </button>

            {step === 'upload' && (
              <button
                type="button"
                onClick={handleScan}
                disabled={!selectedFile || isScanning}
                className="flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-40 transition-colors shadow-xs btn-interactive"
              >
                <ScanLine className="w-4 h-4" />
                <span>Mulai Scan Bukti</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 'scanning' && (
              <button disabled className="flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-600 rounded-xl opacity-85">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menganalisis...</span>
              </button>
            )}

            {(step === 'review' || step === 'saving') && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !amount || !description}
                className="flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-40 transition-colors shadow-xs btn-interactive"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Konfirmasi Simpan</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
