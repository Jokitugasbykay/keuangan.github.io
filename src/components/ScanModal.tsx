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
import { Account, Category, TransactionType, ScanResult } from '@/lib/types';
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

  const [step, setStep] = useState<Step>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [scanStage, setScanStage] = useState<number>(1);
  const [ocrEngineName, setOcrEngineName] = useState<string>('RapidOCR ONNX Lokal');
  const [scanError, setScanError] = useState<string | null>(null);
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
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

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

  useEffect(() => {
    return () => {
      stopLiveCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl, stopLiveCamera]);

  const startLiveCamera = useCallback(async (mode: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    setIsCameraLoading(true);
    setStep('camera');

    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      setIsCameraLoading(false);
      if (cameraInputRef.current) cameraInputRef.current.click();
      else setCameraError('Akses kamera WebRTC tidak tersedia di browser ini. Silakan gunakan pemilih berkas.');
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setHasMultipleCameras(devices.filter((d) => d.kind === 'videoinput').length > 1);
    } catch {
      setHasMultipleCameras(false);
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
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

  const switchCamera = useCallback(async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    stopLiveCamera();
    await startLiveCamera(nextMode);
  }, [facingMode, startLiveCamera, stopLiveCamera]);

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
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        setIsZoomed(false);
        setStep('upload');
      },
      'image/jpeg',
      0.92
    );
  }, [previewUrl, stopLiveCamera]);

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
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setScanError(null);
    setSelectedFile(file);
    setIsZoomed(false);
    setPreviewUrl(URL.createObjectURL(file));
    e.target.value = '';
  }, [previewUrl]);

  const triggerCameraInput = useCallback(() => {
    cameraInputRef.current?.click();
  }, []);

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleScan = useCallback(async () => {
    if (!selectedFile) return;
    setScanError(null);
    setStep('scanning');
    setScanStage(1);
    const stageTimer1 = setTimeout(() => setScanStage(2), 350);
    const stageTimer2 = setTimeout(() => setScanStage(3), 850);
    try {
      const base64Promise = toBase64(selectedFile);
      const minDisplayPromise = sleep(1400);
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
      if (json.ocrEngine) setOcrEngineName(json.ocrEngine);
      setScanStage(4);
      await sleep(300);
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
          (a) => a.name.toLowerCase().includes(hint) || (a.provider ?? '').toLowerCase().includes(hint)
        );
        if (matched) setAccountId(matched.id);
      }
      let dupMsg: string | null = null;
      if (d.reference_number) {
        const refMatch = existingTransactions.find((t) => t.external_transaction_id === d.reference_number);
        if (refMatch) {
          dupMsg = `Nomor referensi "${d.reference_number}" sudah tercatat sebelumnya. Mohon periksa kembali agar tidak terjadi pencatatan ganda.`;
        }
      }
      if (!dupMsg && d.amount !== null && d.date) {
        const dateStr = formatDate(d.date);
        const amountMatch = existingTransactions.find(
          (t) => t.amount === d.amount && t.transaction_date.slice(0, 10) === dateStr
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
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:rounded-2xl shadow-2xl flex flex-col animate-bottom-sheet sm:animate-modal overflow-hidden">
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

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {step === 'upload' && (
            <div className="space-y-4">
              {scanError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{scanError}</span>
                </div>
              )}
              {previewUrl ? (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Pratinjau bukti"
                      className={`w-full object-contain transition-transform ${isZoomed ? 'scale-150' : 'scale-100'} max-h-64`}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setIsZoomed(!isZoomed)} className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50">
                      {isZoomed ? 'Perkecil' : 'Perbesar'}
                    </button>
                    <button type="button" onClick={() => { setSelectedFile(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50">
                      Ganti Foto
                    </button>
                    <button type="button" onClick={handleScan} className="ml-auto px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">
                      Mulai Scan OCR
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button type="button" onClick={() => startLiveCamera()} className="flex flex-col items-center gap-2 p-6 border border-dashed border-slate-300 rounded-xl hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors">
                    <Camera className="w-8 h-8 text-emerald-600" />
                    <span className="text-xs font-semibold text-slate-800">Buka Kamera</span>
                  </button>
                  <button type="button" onClick={triggerFileInput} className="flex flex-col items-center gap-2 p-6 border border-dashed border-slate-300 rounded-xl hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors">
                    <Upload className="w-8 h-8 text-emerald-600" />
                    <span className="text-xs font-semibold text-slate-800">Pilih dari Galeri</span>
                  </button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
            </div>
          )}

          {step === 'camera' && (
            <div className="space-y-3">
              {cameraError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{cameraError}</span>
                </div>
              )}
              <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                {isCameraLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-center gap-3">
                {hasMultipleCameras && (
                  <button type="button" onClick={switchCamera} className="p-3 rounded-full border border-slate-300 hover:bg-slate-50">
                    <RefreshCw className="w-5 h-5 text-slate-700" />
                  </button>
                )}
                <button type="button" onClick={takeSnapshot} disabled={!isCameraActive} className="px-6 py-3 text-sm font-semibold text-white bg-emerald-600 rounded-full hover:bg-emerald-700 disabled:opacity-50">
                  Ambil Foto
                </button>
              </div>
            </div>
          )}

          {step === 'scanning' && (
            <div className="py-12 flex flex-col items-center gap-4 text-center">
              <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Memindai bukti transaksi...</p>
                <p className="text-xs text-slate-500 mt-1">Tahap {scanStage}/4 · {ocrEngineName}</p>
              </div>
            </div>
          )}

          {(step === 'review' || step === 'saving') && (
            <div className="space-y-4">
              {duplicateWarning && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{duplicateWarning}</span>
                </div>
              )}
              {saveError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{saveError}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setTxType('expense')} className={`py-2 rounded-lg text-xs font-semibold border ${txType === 'expense' ? 'bg-rose-50 border-rose-300 text-rose-700' : 'border-slate-200 text-slate-600'}`}>Pengeluaran</button>
                <button type="button" onClick={() => setTxType('income')} className={`py-2 rounded-lg text-xs font-semibold border ${txType === 'income' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'border-slate-200 text-slate-600'}`}>Pemasukan</button>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Deskripsi</label>
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-emerald-600" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Nominal</label>
                  <input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-emerald-600" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Tanggal</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-emerald-600" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Akun</label>
                <CustomSelect
                  value={accountId}
                  onChange={setAccountId}
                  options={accounts.map((a) => ({ value: a.id, label: a.name, badge: a.currency }))}
                  placeholder="Pilih akun"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Catatan</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-emerald-600" />
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="w-full py-2.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {isSaving ? 'Menyimpan...' : 'Simpan Transaksi'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
