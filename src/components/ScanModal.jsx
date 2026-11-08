'use client';

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  X,
  ScanLine,
  Upload,
  Camera,
  Loader2,
  AlertTriangle,
  CheckCircle,
  RotateCcw,
  Sparkles,
  FileText,
  ZoomIn,
  ZoomOut,
  ShieldCheck,
  ChevronLeft,
  Smartphone,
  Monitor,
  Tablet,
  Video,
  Plus,
  Trash2,
  Store,
  Calendar,
  Receipt,
  CreditCard,
  DollarSign,
  ArrowRight,
  Info,
} from 'lucide-react';
import { saveTransactionClient } from '@/lib/client-data';
import CustomSelect from './CustomSelect';
import { performReceiptOcr } from '@/lib/receipt-ocr';
import {
  parseReceiptText,
  checkReceiptDuplicate,
  cleanCurrencyAmount,
} from '@/lib/receipt-parser';

/**
 * Format angka nominal ke mata uang Rupiah Indonesia.
 * @param {number} val
 * @returns {string}
 */
function formatRupiah(val) {
  const n = Number(val) || 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Format ukuran file ke representasi ramah pengguna.
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Deteksi perangkat seluler (mobile).
 * @returns {boolean}
 */
function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * Komponen Modal Pemindai Struk Belanja Modern FigCraft (13-Step Workflow).
 * Menghubungkan kamera/unggah berkas, OCR lokal/browser, tabel item CRUD,
 * rekonsiliasi nominal, preview saldo, dan penyimpanan ke brankas terenkripsi.
 */
export default function ScanModal({
  accounts = [],
  categories = [],
  existingTransactions = [],
  defaultType = 'expense',
  onClose,
  onSaved,
}) {
  // Step workflow: 'upload' | 'camera' | 'scanning' | 'review' | 'saving'
  const [step, setStep] = useState('upload');

  // Input referensi
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const isSavingRef = useRef(false);

  // Status Media & Citra
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isVideo, setIsVideo] = useState(false);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [showReviewMedia, setShowReviewMedia] = useState(false);

  // Status OCR & Progres Real-time (0% - 100%)
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStatus, setProgressStatus] = useState('Menyiapkan pemindaian struk...');
  const [ocrEngineName, setOcrEngineName] = useState('RapidOCR ONNX Lokal');
  const [scanError, setScanError] = useState(null);

  // Live Camera WebRTC
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  // Form Field Struk & Rekonsiliasi (13-Step State)
  const [merchant, setMerchant] = useState('');
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiptNumber, setReceiptNumber] = useState('');
  const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [manualGrandTotal, setManualGrandTotal] = useState(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const [confidence, setConfidence] = useState('medium');
  const [fingerprint, setFingerprint] = useState('');

  // Status Duplikasi Cerdas
  const [duplicateWarning, setDuplicateWarning] = useState(null);

  // Status Penyimpanan
  const [saveError, setSaveError] = useState(null);

  // Subtotal dihitung secara otomatis dari rincian item belanja
  const calculatedSubtotal = useMemo(() => {
    return items.reduce((acc, curr) => acc + (Number(curr.subtotal) || 0), 0);
  }, [items]);

  // Grand Total rekonsiliasi
  const computedGrandTotal = useMemo(() => {
    if (manualGrandTotal !== null && manualGrandTotal !== undefined) {
      return manualGrandTotal;
    }
    const val = calculatedSubtotal - (Number(discount) || 0) + (Number(tax) || 0);
    return Math.max(0, val);
  }, [calculatedSubtotal, discount, tax, manualGrandTotal]);

  // Akun terpilih dan Pratinjau Saldo Real-time (Step 10)
  const selectedAccount = useMemo(() => {
    return accounts.find((a) => a.id === accountId) || accounts[0] || null;
  }, [accounts, accountId]);

  const balanceBefore = selectedAccount?.current_balance ?? 0;
  const balanceAfter = balanceBefore - computedGrandTotal;
  const isBalanceSufficient = balanceAfter >= 0;

  // Hentikan kamera WebRTC
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

  // Bersihkan URL objek dan kamera saat unmount
  useEffect(() => {
    return () => {
      stopLiveCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [previewUrl, videoPreviewUrl, stopLiveCamera]);

  // Buka kamera WebRTC langsung
  const startLiveCamera = useCallback(async () => {
    setCameraError(null);
    setIsCameraLoading(true);
    setStep('camera');

    if (typeof window === 'undefined' || typeof navigator?.mediaDevices?.getUserMedia !== 'function') {
      setIsCameraLoading(false);
      setStep('upload');
      if (isMobileDevice() && cameraInputRef.current) {
        cameraInputRef.current.click();
      } else {
        setCameraError('Kamera tidak didukung pada peramban ini. Silakan gunakan tombol Pilih Berkas.');
      }
      return;
    }

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (e) {
          console.warn('Video play interrupted:', e);
        }
      }
      setIsCameraActive(true);
      setIsCameraLoading(false);
    } catch (err) {
      console.error('Kamera gagal dimulai:', err);
      setIsCameraLoading(false);
      setIsCameraActive(false);
      setStep('upload');
      if (isMobileDevice() && cameraInputRef.current) {
        cameraInputRef.current.click();
      } else {
        setCameraError('Tidak dapat mengakses kamera. Silakan periksa izin kamera atau gunakan tombol Pilih Berkas.');
      }
    }
  }, []);

  // Eksekusi Pemindaian OCR & Integrasi Parser (Step 3 & 4)
  const executeScan = useCallback(async (targetFile) => {
    if (!targetFile) return;

    setScanError(null);
    setSaveError(null);
    setStep('scanning');
    setProgressPercent(5);
    setProgressStatus('Menyiapkan pemindaian struk...');

    try {
      // Panggil performReceiptOcr dari receipt-ocr.js
      const ocrResult = await performReceiptOcr(targetFile, {
        onProgress: (pct, msg) => {
          const numericPct = typeof pct === 'number'
            ? pct
            : (typeof pct === 'object' && pct !== null && typeof pct.progress === 'number'
              ? pct.progress
              : Number(pct) || 0);
          const statusText = typeof msg === 'string' && msg.trim()
            ? msg
            : (typeof pct === 'object' && pct !== null && typeof pct.message === 'string'
              ? pct.message
              : 'Memproses OCR...');

          setProgressPercent(Math.max(0, Math.min(100, Math.round(numericPct))));
          setProgressStatus(statusText);
        },
        defaultType: 'expense',
      });

      setOcrEngineName(ocrResult.engine);

      // Ambil teks hasil pembacaan OCR secara tangguh (dukung rawText, text, atau string langsung)
      const rawTextToParse = ocrResult?.rawText || ocrResult?.text || ocrResult?.data?.text || (typeof ocrResult === 'string' ? ocrResult : '');

      // Panggil parseReceiptText dari receipt-parser.js
      const parsed = parseReceiptText(rawTextToParse, {
        serverData: ocrResult.serverData,
        defaultType: 'expense',
      });

      // Terapkan hasil parser ke state form dengan fallback ke ocrResult.data jika relevan
      const merchantName = parsed.merchant && parsed.merchant !== 'Toko / Merchant'
        ? parsed.merchant
        : (ocrResult.data?.merchant || parsed.merchant || '');
      const grandTotalVal = parsed.grand_total > 0
        ? parsed.grand_total
        : (ocrResult.data?.amount > 0 ? ocrResult.data.amount : null);

      setMerchant(merchantName);
      setReceiptDate(parsed.date || ocrResult.data?.date || new Date().toISOString().slice(0, 10));
      setReceiptNumber(parsed.receipt_number || ocrResult.data?.reference_number || '');
      setItems(parsed.items || []);
      setDiscount(parsed.discount || 0);
      setTax(parsed.tax || 0);
      setManualGrandTotal(grandTotalVal);
      setConfidence(parsed.confidence || 'medium');
      setFingerprint(parsed.fingerprint || '');

      // Terapkan kategori otomatis jika belum ada yang terpilih
      if (parsed.suggested_category_id) {
        const matchedCategory = categories.find((c) => c.id === parsed.suggested_category_id);
        if (matchedCategory) {
          setCategoryId(matchedCategory.id);
        } else {
          // Cari kategori expense yang relevan
          const fallbackCat = categories.find((c) => c.category_type === 'expense');
          if (fallbackCat) setCategoryId(fallbackCat.id);
        }
      }

      // Terapkan akun pembayaran yang disarankan jika cocok
      if (parsed.suggested_account) {
        const hint = parsed.suggested_account.toLowerCase();
        const matchedAcc = accounts.find((a) =>
          a.name.toLowerCase().includes(hint) ||
          (a.provider || '').toLowerCase().includes(hint)
        );
        if (matchedAcc) {
          setAccountId(matchedAcc.id);
        }
      }

      // Deteksi Duplikasi Cerdas (Step 6)
      const dupCheck = checkReceiptDuplicate(parsed.fingerprint, parsed, existingTransactions);
      if (dupCheck && dupCheck.isDuplicate) {
        setDuplicateWarning(dupCheck.reason);
      } else {
        setDuplicateWarning(null);
      }

      setStep('review');
    } catch (err) {
      console.error('Scan modal execution error:', err);
      setScanError(err instanceof Error ? err.message : 'Gagal memproses pemindaian struk.');
      setStep('upload');
    }
  }, [categories, accounts, existingTransactions]);

  // Tangkap foto snapshot dari live camera
  const takeSnapshot = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `struk-${Date.now()}.jpg`, { type: 'image/jpeg' });
      stopLiveCamera();

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);

      setIsVideo(false);
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setIsZoomed(false);

      await executeScan(file);
    }, 'image/jpeg', 0.95);
  }, [previewUrl, videoPreviewUrl, stopLiveCamera, executeScan]);

  // Proses berkas yang dipilih pengguna
  const handleSelectFile = useCallback((file) => {
    if (!file) return;

    const isVideoFile = file.type?.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv|3gp|m4v)$/i.test(file.name || '');
    const isImageFile = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(file.name || '');

    if (!isVideoFile && !isImageFile) {
      setScanError('Format berkas tidak didukung. Harap pilih foto struk (JPG, PNG, WebP) atau video rekaman (MP4, MOV).');
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      setScanError('Ukuran berkas melebihi batas 30 MB. Silakan gunakan berkas dengan ukuran lebih ringkas.');
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);

    setScanError(null);
    setSelectedFile(file);
    setIsVideo(isVideoFile);

    if (isVideoFile) {
      setVideoPreviewUrl(URL.createObjectURL(file));
      setPreviewUrl(null);
    } else {
      setPreviewUrl(URL.createObjectURL(file));
      setVideoPreviewUrl(null);
    }

    // Eksekusi pemindaian langsung
    executeScan(file);
  }, [previewUrl, videoPreviewUrl, executeScan]);

  // CRUD Item Belanja (Step 7)
  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      const target = { ...next[index] };

      if (field === 'name') {
        target.name = value;
      } else if (field === 'qty') {
        const q = Math.max(1, parseInt(value, 10) || 1);
        target.qty = q;
        target.subtotal = q * (Number(target.unit_price) || 0);
      } else if (field === 'unit_price') {
        const up = cleanCurrencyAmount(value) || 0;
        target.unit_price = up;
        target.subtotal = (Number(target.qty) || 1) * up;
      } else if (field === 'subtotal') {
        target.subtotal = cleanCurrencyAmount(value) || 0;
      }

      next[index] = target;
      return next;
    });
    // Reset manual grand total jika item disunting agar sinkron
    setManualGrandTotal(null);
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${prev.length + 1}`,
        name: '',
        qty: 1,
        unit_price: 0,
        subtotal: 0,
      },
    ]);
    setManualGrandTotal(null);
  };

  const handleDeleteItem = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
    setManualGrandTotal(null);
  };

  // Simpan Transaksi Lengkap ke Brankas / Database (Step 12 & 13)
  const handleSaveTransaction = async () => {
    if (isSavingRef.current) return;

    if (!accountId) {
      setSaveError('Akun rekening sumber wajib dipilih.');
      return;
    }

    if (computedGrandTotal <= 0) {
      setSaveError('Total belanja harus lebih besar dari 0 Rupiah.');
      return;
    }

    isSavingRef.current = true;
    setSaveError(null);
    setStep('saving');

    try {
      const summaryDescription = merchant
        ? `${merchant} - Belanja Struk`
        : `Belanja Struk (${items.length} item)`;

      const receiptItemsPayload = items.map((item) => ({
        name: item.name.trim() || 'Barang Belanja',
        qty: Number(item.qty) || 1,
        unit_price: Number(item.unit_price) || 0,
        subtotal: Number(item.subtotal) || 0,
      }));

      const notesArr = [];
      if (receiptNumber) notesArr.push(`No. Struk: ${receiptNumber}`);
      if (discount > 0) notesArr.push(`Diskon: ${formatRupiah(discount)}`);
      if (tax > 0) notesArr.push(`Pajak: ${formatRupiah(tax)}`);
      if (notes.trim()) notesArr.push(notes.trim());

      const result = await saveTransactionClient({
        account_id: accountId,
        transaction_type: 'expense',
        amount: computedGrandTotal,
        description: summaryDescription,
        category_id: categoryId || undefined,
        transaction_date: receiptDate ? new Date(receiptDate).toISOString() : new Date().toISOString(),
        source: 'scan',
        external_transaction_id: receiptNumber || undefined,
        receipt_items: receiptItemsPayload,
        notes: notesArr.join(' | '),
      });

      if (result.success) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('kayla_db_updated'));
        }
        onSaved();
      } else {
        setSaveError(result.error || 'Gagal menyimpan transaksi pengeluaran.');
        setStep('review');
      }
    } catch (err) {
      console.error('Save receipt transaction error:', err);
      setSaveError('Terjadi kendala saat menyimpan transaksi ke brankas terenkripsi.');
      setStep('review');
    } finally {
      isSavingRef.current = false;
    }
  };

  const isScanning = step === 'scanning';
  const isSaving = step === 'saving';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4">
      {/* Container Dialog Modal */}
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-100">
        {/* Header Modal */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-100 shrink-0 bg-white">
          <div className="flex items-center gap-3">
            {step === 'review' || step === 'camera' ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 'camera') stopLiveCamera();
                  setStep('upload');
                }}
                className="p-1.5 -ml-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                title="Kembali ke Unggah Berkas"
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
                  ? 'Verifikasi & Rekonsiliasi Struk'
                  : step === 'camera'
                  ? 'Kamera Pemindai Bukti'
                  : 'Pindai Struk Belanja'}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span className="text-[10px] text-emerald-700 font-medium">
                  Kayla Finance Smart Receipt OCR
                </span>
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

        {/* Scrollable Body */}
        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4 space-y-4">
          {/* ========================================================= */}
          {/* STEP 1: PEMILIHAN SUMBER & PRATINJAU AWAL                 */}
          {/* ========================================================= */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Drop / Click Viewport */}
              {!previewUrl && !videoPreviewUrl ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="relative overflow-hidden border-2 border-dashed border-slate-200 rounded-2xl p-6 sm:p-10 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/20 transition-all duration-200 group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3.5 group-hover:scale-105 transition-transform duration-200 shadow-xs">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-800">
                    Pilih Foto, Video, atau Ambil Struk
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                    Struk belanja Indomaret, Alfamart, Super Indo, cafe, restoran, SPBU, atau rekaman video mutasi
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-950/5 flex items-center justify-center min-h-[220px] max-h-[320px]">
                    {isVideo && videoPreviewUrl ? (
                      <video src={videoPreviewUrl} controls playsInline className="w-full max-h-[320px] object-contain bg-black" />
                    ) : previewUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={previewUrl}
                        alt="Pratinjau Struk Belanja"
                        className={`w-full max-h-[320px] object-contain transition-transform duration-200 ${
                          isZoomed ? 'scale-150 cursor-zoom-out' : 'scale-100 cursor-zoom-in'
                        }`}
                        onClick={() => setIsZoomed(!isZoomed)}
                      />
                    ) : null}

                    {/* Tombol Zoom */}
                    {!isVideo && previewUrl && (
                      <button
                        type="button"
                        onClick={() => setIsZoomed(!isZoomed)}
                        className="absolute bottom-2.5 right-2.5 bg-white/90 backdrop-blur-xs border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-white shadow-xs flex items-center gap-1 z-10"
                      >
                        {isZoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                        <span>{isZoomed ? 'Perkecil' : 'Perbesar'}</span>
                      </button>
                    )}

                    {/* Tombol Ganti Foto Sebelum Proses */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                        setVideoPreviewUrl(null);
                        setIsVideo(false);
                        setScanError(null);
                        setIsZoomed(false);
                      }}
                      className="absolute top-2.5 right-2.5 bg-white/90 backdrop-blur-xs border border-slate-200 rounded-full p-2 text-slate-600 hover:text-rose-600 shadow-xs z-10"
                      title="Ganti Foto Struk"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

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

              {/* Action Buttons: Kamera & Pilih Berkas */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (isMobileDevice() && cameraInputRef.current) {
                      cameraInputRef.current.click();
                    } else {
                      startLiveCamera();
                    }
                  }}
                  className="flex items-center justify-center gap-2.5 py-3 px-4 text-xs sm:text-sm font-bold text-slate-800 bg-white border-2 border-slate-200 hover:border-emerald-500 rounded-xl hover:bg-emerald-50/20 active:scale-[0.98] transition-all shadow-xs"
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Camera className="w-4 h-4" />
                  </div>
                  <span>Buka Kamera</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2.5 py-3 px-4 text-xs sm:text-sm font-bold text-slate-800 bg-white border-2 border-slate-200 hover:border-slate-400 rounded-xl hover:bg-slate-50 active:scale-[0.98] transition-all shadow-xs"
                >
                  <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                    <Upload className="w-4 h-4" />
                  </div>
                  <span>Pilih Berkas</span>
                </button>
              </div>

              {/* Hidden Inputs */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleSelectFile(f);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/heic,video/mp4,video/webm,video/quicktime,video/3gpp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleSelectFile(f);
                  e.target.value = '';
                }}
                className="hidden"
              />

              {/* Kompatibilitas */}
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700">Kompatibilitas:</span>
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

              {/* Pesan Kesalahan */}
              {(scanError || cameraError) && (
                <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="leading-relaxed">{scanError || cameraError}</span>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* STEP 1.B: LIVE WEBRTC CAMERA                              */}
          {/* ========================================================= */}
          {step === 'camera' && (
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500 bg-slate-950 flex items-center justify-center min-h-[280px] sm:min-h-[360px] max-h-[440px] shadow-lg">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transition-opacity duration-300 ${
                    isCameraActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />

                {isCameraLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-white gap-2 z-10">
                    <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                    <p className="text-xs font-semibold">Mengaktifkan kamera peranti...</p>
                  </div>
                )}

                {isCameraActive && (
                  <div className="absolute inset-5 sm:inset-8 border border-white/40 rounded-xl pointer-events-none flex flex-col justify-between p-3">
                    <div className="flex justify-between items-start">
                      <div className="w-6 h-6 border-t-2 border-l-2 border-emerald-400 -mt-0.5 -ml-0.5 rounded-tl" />
                      <div className="w-6 h-6 border-t-2 border-r-2 border-emerald-400 -mt-0.5 -mr-0.5 rounded-tr" />
                    </div>
                    <div className="text-center">
                      <span className="text-[11px] font-medium text-white/90 bg-slate-900/70 backdrop-blur-xs py-1 px-3 rounded-full shadow-xs inline-block">
                        Arahkan struk belanja ke dalam bingkai
                      </span>
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="w-6 h-6 border-b-2 border-l-2 border-emerald-400 -mb-0.5 -ml-0.5 rounded-bl" />
                      <div className="w-6 h-6 border-b-2 border-r-2 border-emerald-400 -mb-0.5 -mr-0.5 rounded-br" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    stopLiveCamera();
                    setStep('upload');
                  }}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Batal
                </button>

                <button
                  type="button"
                  onClick={takeSnapshot}
                  disabled={!isCameraActive || isCameraLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-6 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md transition-all"
                >
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white bg-emerald-300" />
                  <span>Ambil Foto Struk</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STEP 3: INDIKATOR PROGRES OCR (0% - 100%)                 */}
          {/* ========================================================= */}
          {step === 'scanning' && (
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500/50 bg-slate-900/10 flex items-center justify-center h-60 sm:h-72 w-full shadow-md">
                {previewUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={previewUrl}
                    alt="Sedang memproses OCR"
                    className="w-full h-full object-contain opacity-85 filter contrast-105"
                  />
                ) : videoPreviewUrl ? (
                  <video src={videoPreviewUrl} muted autoPlay loop playsInline className="w-full h-full object-contain opacity-85 bg-black" />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                    <span className="text-xs font-semibold">Menyiapkan berkas struk...</span>
                  </div>
                )}

                {/* Laser Scanning Effect */}
                <div className="absolute inset-x-0 h-1 bg-emerald-400 shadow-[0_0_20px_4px_#10B981] animate-scan-laser pointer-events-none z-10" />
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/15 via-transparent to-emerald-500/15 pointer-events-none" />
              </div>

              {/* Progress Card Real-time */}
              <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 animate-spin" />
                    <span>Pemrosesan OCR Berjalan ({progressPercent}%)</span>
                  </span>
                  <span className="text-[11px] font-mono text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                    {ocrEngineName}
                  </span>
                </div>

                {/* Bilah Progres 0% - 100% */}
                <div className="w-full bg-emerald-200/60 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <div className="text-[11px] text-emerald-900 font-medium flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700 shrink-0" />
                  <span>{typeof progressStatus === 'string' ? progressStatus : (progressStatus?.message || 'Memproses OCR...')}</span>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STEP 5 - 13: FORM REVIEW, TABEL ITEM, REKONSILIASI        */}
          {/* ========================================================= */}
          {(step === 'review' || step === 'saving') && (
            <div className="space-y-4">
              {/* Notifikasi Hasil Ekstraksi */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-900">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <div className="font-bold">Struk belanja berhasil diproses</div>
                  <div className="text-[11px] text-emerald-700 leading-relaxed">
                    Data diekstrak via {ocrEngineName}. Kayla dapat memeriksa, menyunting item, dan memastikan saldo sebelum menyimpan.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReviewMedia(!showReviewMedia)}
                  className="text-[11px] font-bold text-emerald-700 hover:underline shrink-0"
                >
                  {showReviewMedia ? 'Tutup Bukti' : 'Lihat Bukti'}
                </button>
              </div>

              {/* Pratinjau Citra Dropdown */}
              {showReviewMedia && (previewUrl || videoPreviewUrl) && (
                <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900/5 p-2 flex items-center justify-center max-h-48">
                  {isVideo && videoPreviewUrl ? (
                    <video src={videoPreviewUrl} controls playsInline className="max-h-44 w-full object-contain bg-black" />
                  ) : previewUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={previewUrl} alt="Bukti Struk" className="max-h-44 w-full object-contain" />
                  ) : null}
                </div>
              )}

              {/* STEP 6: DETEKSI DUPLIKASI CERDAS */}
              {duplicateWarning && (
                <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <div className="space-y-1">
                    <span className="font-bold block">Peringatan Duplikasi Terdeteksi:</span>
                    <span className="leading-relaxed block">{duplicateWarning}</span>
                  </div>
                </div>
              )}

              {/* STEP 5: KARTU RINGKASAN MERCHANT, TANGGAL & NO STRUK */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  <Store className="w-4 h-4 text-emerald-600" />
                  <span>Ringkasan Merchant & Waktu Transaksi</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Nama Merchant / Toko
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Indomaret, Super Indo"
                      value={merchant}
                      onChange={(e) => setMerchant(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Tanggal Struk
                    </label>
                    <input
                      type="date"
                      value={receiptDate}
                      onChange={(e) => setReceiptDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      No. Struk / Ref
                    </label>
                    <input
                      type="text"
                      placeholder="Nomor struk"
                      value={receiptNumber}
                      onChange={(e) => setReceiptNumber(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              </div>

              {/* STEP 7: TABEL RINCIAN BELANJA INTERAKTIF (CRUD ITEM) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="bg-slate-50 px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    <span>Rincian Item Belanja ({items.length} item)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-2.5 py-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Item</span>
                  </button>
                </div>

                <div className="p-2 sm:p-3 space-y-2">
                  {items.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      Belum ada rincian item belanja. Klik &quot;Tambah Item&quot; untuk menambahkan barang.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {items.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="bg-slate-50/70 border border-slate-200 rounded-lg p-2.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                        >
                          {/* Nama Produk */}
                          <div className="flex-1">
                            <input
                              type="text"
                              placeholder="Nama barang / produk"
                              value={item.name}
                              onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-emerald-600"
                            />
                          </div>

                          {/* Qty, Harga Satuan, Subtotal & Tombol Hapus */}
                          <div className="flex items-center gap-2">
                            <div className="w-16">
                              <input
                                type="number"
                                min="1"
                                placeholder="Qty"
                                value={item.qty}
                                onChange={(e) => handleItemChange(idx, 'qty', e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 text-center font-mono focus:outline-none focus:border-emerald-600"
                                title="Kuantitas"
                              />
                            </div>

                            <div className="w-24 sm:w-28">
                              <input
                                type="number"
                                step="any"
                                placeholder="Harga"
                                value={item.unit_price || ''}
                                onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 text-right font-mono focus:outline-none focus:border-emerald-600"
                                title="Harga Satuan"
                              />
                            </div>

                            <div className="w-24 sm:w-28 text-right font-mono text-xs font-bold text-slate-800 pr-1">
                              {formatRupiah(item.subtotal)}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteItem(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Hapus baris item ini"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* STEP 8: REKONSILIASI NOMINAL BELANJA */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                <div className="text-xs font-bold text-slate-800 flex items-center justify-between border-b border-slate-200 pb-2">
                  <span>Kalkulasi Rekonsiliasi Nominal</span>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                    Sinkron dengan Item
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Subtotal Rincian Item:</span>
                    <span className="font-mono font-bold text-slate-800">{formatRupiah(calculatedSubtotal)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Diskon / Potongan (Rp)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={discount || ''}
                        onChange={(e) => {
                          setDiscount(cleanCurrencyAmount(e.target.value) || 0);
                          setManualGrandTotal(null);
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-600"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Pajak / PPN (Rp)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={tax || ''}
                        onChange={(e) => {
                          setTax(cleanCurrencyAmount(e.target.value) || 0);
                          setManualGrandTotal(null);
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-600"
                      />
                    </div>
                  </div>

                  {/* Grand Total */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <span className="font-bold text-slate-900 text-sm">Grand Total Belanja:</span>
                    <span className="font-mono font-extrabold text-emerald-700 text-base">
                      {formatRupiah(computedGrandTotal)}
                    </span>
                  </div>
                </div>
              </div>

              {/* STEP 9 & STEP 10: PEMILIHAN AKUN PEMBAYARAN & BALANCE PREVIEW REAL-TIME */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  <span>Akun Sumber Pembayaran & Pratinjau Saldo</span>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Pilih Rekening / Dompet Pembayar
                  </label>
                  <CustomSelect
                    value={accountId}
                    onChange={setAccountId}
                    options={accounts.map((a) => ({
                      value: a.id,
                      label: a.name,
                      subLabel: `(${a.provider || a.account_type})`,
                      badge: formatRupiah(a.current_balance),
                    }))}
                    placeholder="Pilih Akun Sumber"
                    direction="auto"
                    size="md"
                  />
                </div>

                {/* Real-time Balance Preview */}
                {selectedAccount && (
                  <div className="bg-white border border-slate-200 rounded-lg p-2.5 grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Saldo Saat Ini</span>
                      <span className="font-mono font-bold text-slate-800 text-xs">
                        {formatRupiah(balanceBefore)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 block">Potongan</span>
                      <span className="font-mono font-bold text-rose-600 text-xs">
                        - {formatRupiah(computedGrandTotal)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 block">Estimasi Saldo</span>
                      <span
                        className={`font-mono font-bold text-xs ${
                          isBalanceSufficient ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {formatRupiah(balanceAfter)}
                      </span>
                    </div>
                  </div>
                )}

                {!isBalanceSufficient && (
                  <div className="flex items-center gap-1.5 text-[11px] text-rose-600 font-medium">
                    <Info className="w-3.5 h-3.5" />
                    <span>Peringatan: Estimasi saldo akun ini akan menjadi minus setelah transaksi dicatat.</span>
                  </div>
                )}
              </div>

              {/* STEP 11: PEMILIHAN KATEGORI UTAMA */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Kategori Pengeluaran
                </label>
                <CustomSelect
                  value={categoryId}
                  onChange={setCategoryId}
                  options={[
                    { value: '', label: 'Tanpa Kategori' },
                    ...categories
                      .filter((c) => c.category_type === 'expense')
                      .map((c) => ({
                        value: c.id,
                        label: c.name,
                      })),
                  ]}
                  placeholder="Pilih Kategori Belanja"
                  direction="auto"
                  size="md"
                />
              </div>

              {/* Catatan Tambahan */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Catatan belanja jika ada..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              {/* Pesan Kesalahan Simpan */}
              {saveError && (
                <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="leading-relaxed">{saveError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-100 shrink-0 flex items-center justify-between gap-3 bg-white">
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
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 py-1.5 px-1 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ganti Berkas Struk</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isScanning || isSaving}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 rounded-xl transition-colors"
            >
              Batal
            </button>

            {step === 'upload' && !selectedFile && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-xs"
              >
                <Upload className="w-4 h-4" />
                <span>Pilih Foto / Video</span>
              </button>
            )}

            {step === 'upload' && selectedFile && (
              <button
                type="button"
                onClick={() => executeScan(selectedFile)}
                disabled={isScanning}
                className="flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-40 transition-colors shadow-xs"
              >
                <ScanLine className="w-4 h-4" />
                <span>Pindai Struk Sekarang</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 'scanning' && (
              <button
                disabled
                className="flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-bold text-white bg-emerald-600 rounded-xl opacity-85"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memindai ({progressPercent}%)...</span>
              </button>
            )}

            {/* STEP 12 & 13: PROTEKSI DOUBLE-SUBMISSION & SIMPAN TRANSAKSI LENGKAP */}
            {(step === 'review' || step === 'saving') && (
              <button
                type="button"
                onClick={handleSaveTransaction}
                disabled={isSaving || computedGrandTotal <= 0 || !accountId}
                className="flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-40 transition-colors shadow-xs"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan ke Brankas...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Simpan Pengeluaran</span>
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
