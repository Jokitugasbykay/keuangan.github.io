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
  ShieldCheck,
  ChevronLeft,
  RefreshCw,
} from 'lucide-react';
import { Account, Category, TransactionType, ScanResult } from '@/lib/types';
import CustomSelect from './CustomSelect';

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

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [step, setStep] = useState<Step>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanStage, setScanStage] = useState(1);
  const [ocrEngineName, setOcrEngineName] = useState('RapidOCR ONNX Lokal');
  const [scanError, setScanError] = useState<string | null>(null);
  const [txType, setTxType] = useState<TransactionType>(defaultType);
  const [amount, setAmount] = useState('');
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
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const stopLiveCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraActive(false);
    setIsCameraLoading(false);
  }, []);

  useEffect(() => {
    return () => {
      stopLiveCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl, stopLiveCamera]);

  /** Prefer native camera on mobile; WebRTC live preview on desktop */
  const openCamera = useCallback(() => {
    setScanError(null);
    setCameraError(null);
    if (isMobileDevice()) {
      // Native OS camera via file input + capture — works on iOS/Android browsers
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      } else {
        setCameraError('Kamera perangkat tidak tersedia. Coba Pilih dari Galeri.');
      }
      return;
    }
    // Desktop: live getUserMedia
    void startLiveCamera();
  }, []);

  const startLiveCamera = useCallback(async (mode: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    setIsCameraLoading(true);
    setStep('camera');

    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      setIsCameraLoading(false);
      if (cameraInputRef.current) cameraInputRef.current.click();
      else setCameraError('Kamera tidak tersedia di browser ini. Gunakan Pilih dari Galeri.');
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
          video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
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
      console.error(err);
      setIsCameraLoading(false);
      setIsCameraActive(false);
      setStep('upload');
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setCameraError('Izin kamera ditolak. Izinkan kamera di pengaturan browser, atau pakai Pilih dari Galeri.');
      } else {
        setCameraError('Kamera tidak bisa dibuka. Coba Pilih dari Galeri.');
      }
    }
  }, [facingMode]);

  // Fix openCamera dependency after startLiveCamera defined
  // (openCamera already uses startLiveCamera via closure on re-render)

  const switchCamera = useCallback(async () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    stopLiveCamera();
    await startLiveCamera(next);
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
        setStep('upload');
      },
      'image/jpeg',
      0.92
    );
  }, [previewUrl, stopLiveCamera]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!SUPPORTED_TYPES.includes(file.type) && !file.type.startsWith('image/')) {
        setScanError('Format gambar tidak didukung. Gunakan JPG atau PNG.');
        e.target.value = '';
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        setScanError('Ukuran file maksimal 15 MB.');
        e.target.value = '';
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setScanError(null);
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setStep('upload');
      e.target.value = '';
    },
    [previewUrl]
  );

  const handleScan = useCallback(async () => {
    if (!selectedFile) return;
    setScanError(null);
    setStep('scanning');
    setScanStage(1);
    const t1 = setTimeout(() => setScanStage(2), 350);
    const t2 = setTimeout(() => setScanStage(3), 850);
    try {
      const base64 = await toBase64(selectedFile);
      await sleep(800);
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: selectedFile.type || 'image/jpeg',
          transactionType: defaultType,
        }),
      });
      const json: ScanResult = await res.json();
      if (!res.ok || !json.success || !json.data) {
        // On static Pages, OCR API is offline — still let user fill form manually
        setScanError(json.error ?? 'OCR tidak tersedia di mode online. Isi form manual dari foto.');
        setDescription('Transaksi dari scan bukti');
        setTxType(defaultType);
        setDate(new Date().toISOString().slice(0, 10));
        setStep('review');
        return;
      }
      const d = json.data;
      if (json.ocrEngine) setOcrEngineName(json.ocrEngine);
      setScanStage(4);
      await sleep(200);
      setTxType((d.transaction_type as TransactionType) ?? defaultType);
      setAmount(d.amount != null ? String(d.amount) : '');
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
      let dup: string | null = null;
      if (d.reference_number) {
        if (existingTransactions.some((t) => t.external_transaction_id === d.reference_number)) {
          dup = `Referensi "${d.reference_number}" sudah ada. Cek agar tidak dobel.`;
        }
      }
      setDuplicateWarning(dup);
      setStep('review');
    } catch (err) {
      console.error(err);
      // Offline / static host: open manual review with photo
      setScanError('OCR offline. Lanjutkan isi manual dari foto yang sudah diambil.');
      setDescription('Transaksi dari scan bukti');
      setTxType(defaultType);
      setDate(new Date().toISOString().slice(0, 10));
      setStep('review');
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
    }
  }, [selectedFile, defaultType, accounts, existingTransactions]);

  const handleSave = useCallback(async () => {
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0 || !description || !accountId) {
      setSaveError('Nominal, deskripsi, dan akun wajib diisi.');
      return;
    }
    setSaveError(null);
    setStep('saving');
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: accountId,
          transaction_type: txType,
          amount: num,
          description: merchant ? `${merchant} - ${description}` : description,
          category_id: categoryId || undefined,
          notes: notes || undefined,
          source: 'scan',
          external_transaction_id: referenceNumber || undefined,
          transaction_date: date ? new Date(date).toISOString() : new Date().toISOString(),
        }),
      });
      if (res.ok) {
        onSaved();
      } else {
        const j = await res.json().catch(() => ({}));
        setSaveError((j as any).error ?? 'Gagal menyimpan (API offline di GitHub Pages). Gunakan mode lokal untuk simpan.');
        setStep('review');
      }
    } catch {
      setSaveError('Tidak bisa menyimpan di hosting statis. Jalankan app lokal (npm run dev) untuk simpan transaksi.');
      setStep('review');
    }
  }, [amount, description, accountId, txType, merchant, categoryId, notes, referenceNumber, date, onSaved]);

  const isScanning = step === 'scanning';
  const isSaving = step === 'saving';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex sm:items-center sm:justify-center p-0 sm:p-4">
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            {(step === 'review' || step === 'camera') && (
              <button
                type="button"
                onClick={() => {
                  if (step === 'camera') stopLiveCamera();
                  setStep('upload');
                }}
                className="p-1 -ml-1 text-slate-500"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {step === 'review' ? 'Tinjau Hasil' : step === 'camera' ? 'Kamera' : 'Scan Bukti Transaksi'}
              </h3>
              <div className="flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span className="text-[10px] text-emerald-700 font-medium">OCR Lokal</span>
              </div>
            </div>
          </div>
          <button type="button" onClick={() => { stopLiveCamera(); onClose(); }} disabled={isScanning || isSaving} className="p-2 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {step === 'upload' && (
            <div className="space-y-4">
              {(scanError || cameraError) && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{scanError || cameraError}</span>
                </div>
              )}
              {previewUrl ? (
                <div className="space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Pratinjau" className="w-full max-h-64 object-contain rounded-xl border border-slate-200 bg-slate-50" />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setSelectedFile(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg">
                      Ganti Foto
                    </button>
                    <button type="button" onClick={handleScan} className="ml-auto px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg">
                      Lanjut / Scan OCR
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  <button type="button" onClick={openCamera} className="flex flex-col items-center gap-2 p-6 border border-dashed border-emerald-300 rounded-xl bg-emerald-50/40 active:bg-emerald-50">
                    <Camera className="w-9 h-9 text-emerald-600" />
                    <span className="text-sm font-semibold text-slate-900">Buka Kamera</span>
                    <span className="text-[11px] text-slate-500 text-center">Ambil foto struk / bukti transfer</span>
                  </button>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-2 p-5 border border-dashed border-slate-300 rounded-xl active:bg-slate-50">
                    <Upload className="w-7 h-7 text-slate-600" />
                    <span className="text-xs font-semibold text-slate-800">Pilih dari Galeri</span>
                  </button>
                </div>
              )}
              {/* Native camera (mobile) */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
          )}

          {step === 'camera' && (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-black aspect-[3/4] sm:aspect-[4/3]">
                <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
                {isCameraLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-center gap-4">
                {hasMultipleCameras && (
                  <button type="button" onClick={switchCamera} className="p-3 rounded-full border border-slate-300">
                    <RefreshCw className="w-5 h-5" />
                  </button>
                )}
                <button type="button" onClick={takeSnapshot} disabled={!isCameraActive} className="px-8 py-3 text-sm font-semibold text-white bg-emerald-600 rounded-full disabled:opacity-50">
                  Ambil Foto
                </button>
              </div>
            </div>
          )}

          {step === 'scanning' && (
            <div className="py-12 flex flex-col items-center gap-4">
              <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
              <p className="text-sm font-semibold text-slate-900">Memproses...</p>
              <p className="text-xs text-slate-500">Tahap {scanStage}/4 · {ocrEngineName}</p>
            </div>
          )}

          {(step === 'review' || step === 'saving') && (
            <div className="space-y-4">
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Bukti" className="w-full max-h-32 object-contain rounded-lg border border-slate-200" />
              )}
              {duplicateWarning && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">{duplicateWarning}</div>
              )}
              {saveError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">{saveError}</div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setTxType('expense')} className={`py-2 rounded-lg text-xs font-semibold border ${txType === 'expense' ? 'bg-rose-50 border-rose-300 text-rose-700' : 'border-slate-200'}`}>Pengeluaran</button>
                <button type="button" onClick={() => setTxType('income')} className={`py-2 rounded-lg text-xs font-semibold border ${txType === 'income' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'border-slate-200'}`}>Pemasukan</button>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Deskripsi</label>
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-600" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Nominal</label>
                  <input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-600" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Tanggal</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-600" />
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
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-600" />
              </div>
              <button type="button" onClick={handleSave} disabled={isSaving} className="w-full py-3 text-sm font-semibold text-white bg-emerald-600 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
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
