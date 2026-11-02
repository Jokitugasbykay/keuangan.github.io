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
import { saveTransactionClient } from '@/lib/client-data';
import CustomSelect from './CustomSelect';

// ----------------------------------------------------------------
// Types & Constants
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

const INDO_MONTHS: Record<string, number> = {
  januari: 1, jan: 1, februari: 2, feb: 2, maret: 3, mar: 3,
  april: 4, apr: 4, mei: 5, may: 5, juni: 6, jun: 6,
  juli: 7, jul: 7, agustus: 8, agu: 8, ags: 8, aug: 8,
  september: 9, sep: 9, oktober: 10, okt: 10, oct: 10,
  november: 11, nov: 11, desember: 12, des: 12, dec: 12,
};

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

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ekstraksi keyframe beresolusi tinggi dari rekaman video bukti transaksi di browser.
 * Mengambil frame pada titik 35% - 40% durasi video saat data konfirmasi transfer biasanya ditampilkan jelas.
 */
async function extractKeyframeFromVideo(videoFile: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(videoFile);
    video.src = url;

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error('Waktu ekstraksi frame video habis.'));
    }, 12000);

    video.onloadedmetadata = () => {
      const seekTime = video.duration > 2 ? Math.min(1.5, video.duration * 0.35) : 0.5;
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Canvas 2D context tidak tersedia.'));
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (!blob) {
              reject(new Error('Gagal mengekstrak frame dari rekaman video.'));
              return;
            }
            const frameFile = new File([blob], `frame-${Date.now()}.jpg`, {
              type: 'image/jpeg',
            });
            resolve(frameFile);
          },
          'image/jpeg',
          0.95
        );
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    video.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      reject(new Error('Format video tidak dapat diputar di browser ini.'));
    };
  });
}

/**
 * Parser bukti transaksi client-side berbasis pola teks struk / bukti transfer bank Indonesia.
 */
function parseClientReceiptText(rawText: string, defaultType: 'income' | 'expense' = 'expense'): ScanResult['data'] {
  const text = rawText || '';
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 1. Transaction Type
  let txType: 'income' | 'expense' = defaultType;
  if (/transfer\s*masuk|uang\s*masuk|terima|pemasukan|deposit|gaji|cashback|top\s*up\s*berhasil/i.test(text)) {
    txType = 'income';
  } else if (/transfer\s*keluar|uang\s*keluar|pembayaran|bayar|beli|pembelian|tagihan|debit|pengeluaran/i.test(text)) {
    txType = 'expense';
  }

  // 2. Amount Extraction
  let amount: number | null = null;
  const amountPatterns = [
    /(?:total\s*(?:transaksi|bayar|belanja)?|nominal|jumlah|rp\.?|idr)\s*[:=]?\s*(?:rp\.?)?\s*([\d.,]{3,15})/i,
    /(?:rp\.?|idr)\s*([\d.,]{3,15})/i,
    /\b(\d{1,3}(?:\.\d{3})+(?:,\d{2})?)\b/,
    /\b(\d{4,9})\b/,
  ];

  for (const p of amountPatterns) {
    const match = text.match(p);
    if (match && match[1]) {
      let raw = match[1].replace(/\s/g, '');
      if (raw.includes('.') && raw.includes(',')) {
        raw = raw.replace(/\./g, '').replace(',', '.');
      } else if (raw.includes('.') && !raw.includes(',')) {
        const parts = raw.split('.');
        if (parts[parts.length - 1].length === 3) {
          raw = raw.replace(/\./g, '');
        }
      } else if (raw.includes(',') && !raw.includes('.')) {
        const parts = raw.split(',');
        if (parts[parts.length - 1].length === 3) {
          raw = raw.replace(/,/g, '');
        } else if (parts[parts.length - 1].length === 2) {
          raw = raw.replace(',', '.');
        }
      }
      const val = parseFloat(raw);
      if (!isNaN(val) && val > 0) {
        amount = val;
        break;
      }
    }
  }

  // 3. Date Extraction
  let dateVal: string | null = null;
  const monthNames = Object.keys(INDO_MONTHS).join('|');
  const indDateRegex = new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})\\s+(\\d{4}|\\d{2})\\b`, 'i');
  const indMatch = text.match(indDateRegex);
  if (indMatch) {
    const d = parseInt(indMatch[1], 10);
    const m = INDO_MONTHS[indMatch[2].toLowerCase()] || 1;
    let y = parseInt(indMatch[3], 10);
    if (y < 100) y += 2000;
    dateVal = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
  } else {
    const numDateMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b/);
    if (numDateMatch) {
      let d = parseInt(numDateMatch[1], 10);
      let m = parseInt(numDateMatch[2], 10);
      let y = parseInt(numDateMatch[3], 10);
      if (y < 100) y += 2000;
      if (m > 12 && d <= 12) {
        const tmp = d; d = m; m = tmp;
      }
      dateVal = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    }
  }

  // 4. Reference Number
  let refNum: string | null = null;
  const refPatterns = [
    /(?:no\.?\s*referensi|nomor\s*referensi|ref\s*id|ref\s*no|reference\s*no|txid|id\s*transaksi)[:\s]*([A-Za-z0-9_-]{6,36})/i,
    /(?:order\s*id|no\s*resi|no\s*struk)[:\s]*([A-Za-z0-9_-]{5,30})/i,
  ];
  for (const rp of refPatterns) {
    const rm = text.match(rp);
    if (rm && rm[1]) {
      refNum = rm[1].trim();
      break;
    }
  }

  // 5. Merchant / Receiver
  let merchant = '';
  const merchantPatterns = [
    /(?:ke|penerima|tujuan|kepada|transfer\s*ke|bayar\s*ke)[:\s]*([^\n,]{3,40})/i,
    /(?:merchant|toko|nama\s*merchant)[:\s]*([^\n,]{3,40})/i,
    /(?:dari|pengirim|diterima\s*dari)[:\s]*([^\n,]{3,40})/i,
  ];
  for (const mp of merchantPatterns) {
    const mm = text.match(mp);
    if (mm && mm[1]) {
      const candidate = mm[1].trim();
      if (!/^(rp|total|berhasil|sukses|mandiri|bca|bri|bni|tanggal)/i.test(candidate)) {
        merchant = candidate;
        break;
      }
    }
  }
  if (!merchant && lines.length > 0) {
    for (const l of lines.slice(0, 4)) {
      if (l.length >= 4 && !/(struk|bukti|transfer|berhasil|sukses|transaksi|rp|tanggal|jam)/i.test(l)) {
        merchant = l;
        break;
      }
    }
  }

  const description = merchant ? `Transaksi ${merchant}` : lines[0] ? `Bukti Transaksi (${lines[0].slice(0, 30)})` : 'Scan Bukti Transaksi';

  let foundCount = 0;
  if (amount !== null) foundCount++;
  if (dateVal) foundCount++;
  if (merchant) foundCount++;
  if (refNum) foundCount++;

  const confidence = foundCount >= 3 ? 'high' : foundCount >= 2 ? 'medium' : 'low';

  return {
    transaction_type: txType,
    amount,
    currency: 'IDR',
    date: dateVal,
    description,
    merchant,
    reference_number: refNum,
    suggested_account: null,
    confidence,
    notes: refNum ? `Ref: ${refNum}` : '',
  };
}

// ----------------------------------------------------------------
// Client OCR Loader (Tesseract.js engine - sama seperti trader-journals)
// ----------------------------------------------------------------
let tesseractPromise: Promise<any> | null = null;

function loadTesseract(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window unavailable'));
  if ((window as any).Tesseract) return Promise.resolve((window as any).Tesseract);
  if (!tesseractPromise) {
    tesseractPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
      script.async = true;
      script.onload = () => resolve((window as any).Tesseract);
      script.onerror = () => reject(new Error('Gagal memuat engine OCR Tesseract di browser.'));
      document.head.appendChild(script);
    });
  }
  return tesseractPromise;
}

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

  // Media & Zoom state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [isExtractingVideo, setIsExtractingVideo] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [showReviewMedia, setShowReviewMedia] = useState(true);

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

  // Live WebRTC Camera state (Desktop webcam & Tablet)
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

  // Cleanup object URLs and camera stream on unmount
  useEffect(() => {
    return () => {
      stopLiveCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [previewUrl, videoPreviewUrl, stopLiveCamera]);

  // Start live camera (WebRTC)
  const startLiveCamera = useCallback(async (mode: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    setIsCameraLoading(true);
    setStep('camera');

    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      setIsCameraLoading(false);
      setStep('upload');
      cameraInputRef.current?.click();
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
      setStep('upload');
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setCameraError('Izin akses kamera ditolak. Silakan izinkan kamera di browser atau gunakan tombol Pilih Foto.');
      } else {
        cameraInputRef.current?.click();
      }
    }
  }, [facingMode]);

  // Tombol Kamera cerdas: di HP memicu kamera bawaan OS, di desktop/tablet membuka viewfinder WebRTC
  const openCamera = useCallback(() => {
    setScanError(null);
    setCameraError(null);
    if (isMobileDevice()) {
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      } else {
        setCameraError('Kamera perangkat tidak tersedia. Coba Pilih Foto.');
      }
      return;
    }
    void startLiveCamera();
  }, [startLiveCamera]);

  const switchCamera = useCallback(async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    stopLiveCamera();
    await startLiveCamera(nextMode);
  }, [facingMode, startLiveCamera, stopLiveCamera]);

  // ----------------------------------------------------------------
  // Dual-Engine OCR Execution (Local Python API + Client Tesseract.js Trader-Journals Engine)
  // ----------------------------------------------------------------
  const executeScan = useCallback(
    async (targetFile: File) => {
      if (!targetFile) return;

      setScanError(null);
      setStep('scanning');
      setScanStage(1);

      const stageTimer1 = setTimeout(() => setScanStage(2), 350);
      const stageTimer2 = setTimeout(() => setScanStage(3), 850);

      try {
        const base64Promise = toBase64(targetFile);
        const minDisplayPromise = sleep(1200);

        const base64 = await base64Promise;
        const fileMime =
          targetFile.type ||
          (targetFile.name.endsWith('.mp4')
            ? 'video/mp4'
            : targetFile.name.endsWith('.webm')
            ? 'video/webm'
            : targetFile.name.endsWith('.mov')
            ? 'video/quicktime'
            : 'image/jpeg');

        let scanData: ScanResult['data'] | undefined;
        let engineUsed = 'RapidOCR ONNX Lokal';

        // 1. Coba Server API /api/scan
        try {
          const res = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: base64,
              mimeType: fileMime,
              transactionType: defaultType,
            }),
          });
          if (res.ok) {
            const json: ScanResult = await res.json();
            if (json.success && json.data) {
              scanData = json.data;
              if (json.ocrEngine) engineUsed = json.ocrEngine;
            }
          }
        } catch {
          // Server API tidak aktif (misal di hosting statis GitHub Pages)
        }

        // 2. Fallback Client-side OCR via Tesseract.js (Engine seperti pada repo trader-journals)
        if (!scanData) {
          try {
            setOcrEngineName('Tesseract.js Engine (trader-journals)');
            const Tesseract = await loadTesseract();
            const worker = await Tesseract.createWorker('eng', 1, {
              logger: (m: any) => {
                if (m.status === 'recognizing text') {
                  const pct = Math.round((m.progress || 0) * 100);
                  if (pct > 50) setScanStage(3);
                }
              },
            });
            const tesseractRes = await worker.recognize(targetFile);
            await worker.terminate();

            const textFound = tesseractRes?.data?.text || '';
            scanData = parseClientReceiptText(textFound, defaultType);
            engineUsed = 'Tesseract.js Engine (trader-journals)';
          } catch (tessErr) {
            console.error('Client OCR fallback error:', tessErr);
          }
        }

        await minDisplayPromise;

        if (!scanData) {
          // Jika OCR tidak dapat membaca teks sama sekali, tetap buka form review dengan template
          scanData = {
            transaction_type: defaultType,
            amount: null,
            currency: 'IDR',
            date: new Date().toISOString().slice(0, 10),
            description: 'Transaksi dari scan bukti',
            merchant: '',
            reference_number: null,
            suggested_account: null,
            confidence: 'low',
            notes: 'Teks bukti belum terbaca otomatis. Silakan periksa atau lengkapi data manual.',
          };
          setScanError('Teks bukti tidak terbaca otomatis. Silakan lengkapi nominal dan keterangan.');
        }

        setOcrEngineName(engineUsed);
        setScanStage(4);
        await sleep(250);

        // Isi form review secara otomatis
        setTxType((scanData.transaction_type as TransactionType) ?? defaultType);
        setAmount(scanData.amount !== null && scanData.amount !== undefined ? String(scanData.amount) : '');
        setCurrency(scanData.currency ?? 'IDR');
        setDate(formatDate(scanData.date));
        setDescription(scanData.description ?? '');
        setMerchant(scanData.merchant ?? '');
        setReferenceNumber(scanData.reference_number ?? '');
        setNotes(scanData.notes ?? '');
        setConfidence(scanData.confidence ?? null);

        if (scanData.suggested_account) {
          const hint = scanData.suggested_account.toLowerCase();
          const matched = accounts.find(
            (a) => a.name.toLowerCase().includes(hint) || (a.provider ?? '').toLowerCase().includes(hint)
          );
          if (matched) setAccountId(matched.id);
        }

        // Cek duplikasi
        let dupMsg: string | null = null;
        if (scanData.reference_number) {
          const refMatch = existingTransactions.find(
            (t) => t.external_transaction_id === scanData!.reference_number
          );
          if (refMatch) {
            dupMsg = `Nomor referensi "${scanData.reference_number}" sudah tercatat sebelumnya. Mohon periksa kembali agar tidak terjadi pencatatan ganda.`;
          }
        }
        if (!dupMsg && scanData.amount !== null && scanData.date) {
          const dateStr = formatDate(scanData.date);
          const amountMatch = existingTransactions.find(
            (t) => t.amount === scanData!.amount && t.transaction_date.slice(0, 10) === dateStr
          );
          if (amountMatch) {
            dupMsg = `Ditemukan transaksi lain dengan nominal dan tanggal yang serupa di riwayat Anda.`;
          }
        }
        setDuplicateWarning(dupMsg);

        setStep('review');
      } catch (err) {
        console.error(err);
        setScanError('Terjadi kesalahan saat memproses bukti transaksi.');
        setStep('upload');
      } finally {
        clearTimeout(stageTimer1);
        clearTimeout(stageTimer2);
      }
    },
    [defaultType, accounts, existingTransactions]
  );

  // Capture snapshot dari live camera dengan auto-scan langsung
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
      async (blob) => {
        if (!blob) return;
        const file = new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
        stopLiveCamera();

        if (previewUrl) URL.revokeObjectURL(previewUrl);
        if (videoPreviewUrl) {
          URL.revokeObjectURL(videoPreviewUrl);
          setVideoPreviewUrl(null);
        }

        setIsVideo(false);
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        setIsZoomed(false);

        // Auto-scan langsung tanpa tertahan di holding pen
        await executeScan(file);
      },
      'image/jpeg',
      0.92
    );
  }, [previewUrl, videoPreviewUrl, stopLiveCamera, executeScan]);

  // File selection handler: mendukung foto dan video dengan ekstraksi frame & auto-scan
  const processSelectedFile = useCallback(
    async (file: File) => {
      if (!file) return;

      const isVideoFile =
        file.type.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv|3gp|m4v)$/i.test(file.name);
      const isImageFile =
        file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(file.name);

      if (!isVideoFile && !isImageFile) {
        setScanError(
          `Format berkas "${file.type || file.name}" tidak didukung. Harap gunakan foto bukti (JPG, PNG, WebP) atau rekaman video transfer (MP4, MOV, WebM).`
        );
        return;
      }

      if (file.size > 25 * 1024 * 1024) {
        setScanError('Ukuran berkas terlalu besar. Batas maksimal adalah 25 MB.');
        return;
      }

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
        setVideoPreviewUrl(null);
      }

      setScanError(null);

      if (isVideoFile) {
        setIsVideo(true);
        const videoUrl = URL.createObjectURL(file);
        setVideoPreviewUrl(videoUrl);
        setIsExtractingVideo(true);
        setStep('scanning');
        setScanStage(1);

        try {
          const extractedFrameFile = await extractKeyframeFromVideo(file);
          setIsExtractingVideo(false);
          setSelectedFile(extractedFrameFile);
          const frameUrl = URL.createObjectURL(extractedFrameFile);
          setPreviewUrl(frameUrl);
          // Langsung scan frame rekaman video secara otomatis
          await executeScan(extractedFrameFile);
        } catch (videoErr) {
          console.warn('Ekstraksi frame browser beralih ke scan langsung:', videoErr);
          setIsExtractingVideo(false);
          setSelectedFile(file);
          await executeScan(file);
        }
      } else {
        setIsVideo(false);
        setSelectedFile(file);
        const imgUrl = URL.createObjectURL(file);
        setPreviewUrl(imgUrl);
        // Langsung scan gambar secara otomatis
        await executeScan(file);
      }
    },
    [previewUrl, videoPreviewUrl, executeScan]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      processSelectedFile(file);
    },
    [processSelectedFile]
  );

  // ----------------------------------------------------------------
  // Simpan Transaksi (Bekerja di Server lokal maupun Hosting Statis)
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
      const result = await saveTransactionClient({
        account_id: accountId,
        transaction_type: txType,
        amount: numAmount,
        description: merchant ? `${merchant} - ${description}` : description,
        category_id: categoryId || undefined,
        notes: notes || undefined,
        source: 'scan',
        external_transaction_id: referenceNumber || undefined,
        transaction_date: date ? new Date(date).toISOString() : new Date().toISOString(),
      });

      if (result.success) {
        onSaved();
      } else {
        setSaveError(result.error ?? 'Gagal menyimpan transaksi.');
        setStep('review');
      }
    } catch (err) {
      console.error(err);
      setSaveError('Terjadi kesalahan saat menyimpan data transaksi.');
      setStep('review');
    }
  }, [amount, description, accountId, txType, merchant, categoryId, notes, referenceNumber, date, onSaved]);

  const isScanning = step === 'scanning';
  const isSaving = step === 'saving';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex sm:items-center sm:justify-center p-0 sm:p-4 animate-backdrop">
      {/* Modal Dialog Container */}
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:rounded-2xl shadow-2xl flex flex-col animate-bottom-sheet sm:animate-modal overflow-hidden">
        {/* Header */}
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
                <span className="text-[10px] text-emerald-700 font-medium">
                  Dual OCR Engine (Lokal + Trader-Journals Tesseract)
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

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4 space-y-4">
          {/* ---- STEP: UPLOAD & CAMERA ---- */}
          {step === 'upload' && (
            <div className="space-y-4 animate-slide-up">
              {/* Media Viewport / Drop Zone */}
              {!previewUrl && !videoPreviewUrl ? (
                <div className="relative overflow-hidden border-2 border-dashed border-slate-200 rounded-2xl p-6 sm:p-10 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/20 transition-all duration-200 group">
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    title="Pilih Berkas Bukti Transaksi (Foto atau Video)"
                  />
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3.5 group-hover:scale-105 transition-transform duration-200 shadow-xs pointer-events-none">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-800 pointer-events-none">
                    Pilih Foto, Video, atau Ambil Kamera
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed pointer-events-none">
                    Struk belanja, bukti transfer BCA, Mandiri, blu, QRIS, atau rekaman video bukti (MP4, MOV, WebM)
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-950/5 flex items-center justify-center min-h-[220px] max-h-[340px]">
                    {isVideo && videoPreviewUrl ? (
                      <video
                        src={videoPreviewUrl}
                        controls
                        playsInline
                        className="w-full max-h-[340px] object-contain bg-black"
                      />
                    ) : previewUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={previewUrl}
                        alt="Pratinjau Bukti Transaksi"
                        className={`w-full max-h-[340px] object-contain transition-transform duration-200 ${
                          isZoomed ? 'scale-150 cursor-zoom-out' : 'scale-100 cursor-zoom-in'
                        }`}
                        onClick={() => setIsZoomed(!isZoomed)}
                      />
                    ) : null}

                    {isVideo && (
                      <div className="absolute top-2.5 left-2.5 bg-emerald-600/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-xs flex items-center gap-1.5 backdrop-blur-xs z-10">
                        <Video className="w-3 h-3" />
                        <span>Rekaman Video Bukti</span>
                      </div>
                    )}

                    {!isVideo && previewUrl && (
                      <button
                        type="button"
                        onClick={() => setIsZoomed(!isZoomed)}
                        className="absolute bottom-2.5 right-2.5 bg-white/90 backdrop-blur-xs border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-white shadow-xs flex items-center gap-1 btn-interactive z-10"
                      >
                        {isZoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                        <span>{isZoomed ? 'Perkecil' : 'Perbesar'}</span>
                      </button>
                    )}

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
                      className="absolute top-2.5 right-2.5 bg-white/90 backdrop-blur-xs border border-slate-200 rounded-full p-2 text-slate-600 hover:text-rose-600 shadow-xs btn-interactive z-10"
                      title="Ganti Berkas"
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

              {/* Action Buttons: Buka Kamera & Pilih File */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={openCamera}
                  className="flex items-center justify-center gap-2.5 py-3.5 px-4 text-xs sm:text-sm font-bold text-slate-800 bg-white border-2 border-slate-200 hover:border-emerald-500 rounded-xl hover:bg-emerald-50/20 active:scale-[0.98] btn-interactive shadow-xs"
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Camera className="w-4 h-4" />
                  </div>
                  <span>Buka Kamera</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2.5 py-3.5 px-4 text-xs sm:text-sm font-bold text-slate-800 bg-white border-2 border-slate-200 hover:border-slate-400 rounded-xl hover:bg-slate-50 active:scale-[0.98] btn-interactive shadow-xs"
                >
                  <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                    <Upload className="w-4 h-4" />
                  </div>
                  <span>Pilih Foto / Video</span>
                </button>
              </div>

              {/* Hidden Inputs */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*,video/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
                title="Kamera HP"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/heic,video/mp4,video/webm,video/quicktime,video/x-m4v,video/3gpp"
                onChange={handleFileChange}
                className="hidden"
                title="Pilih Berkas"
              />

              {/* Compatibility Notice */}
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

              {/* Error Message */}
              {scanError && (
                <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 animate-slide-down">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="leading-relaxed">{scanError}</span>
                </div>
              )}
            </div>
          )}

          {/* ---- STEP: LIVE CAMERA (Desktop / Tablet) ---- */}
          {step === 'camera' && (
            <div className="space-y-4 animate-slide-up">
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

                {isCameraLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-white gap-2 z-10">
                    <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                    <p className="text-xs font-semibold">Mengaktifkan kamera...</p>
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
                        Arahkan bukti transfer / struk ke dalam bingkai
                      </span>
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="w-6 h-6 border-b-2 border-l-2 border-emerald-400 -mb-0.5 -ml-0.5 rounded-bl" />
                      <div className="w-6 h-6 border-b-2 border-r-2 border-emerald-400 -mb-0.5 -mr-0.5 rounded-br" />
                    </div>
                  </div>
                )}

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
              </div>

              {cameraError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2 animate-slide-down">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                    <span className="leading-relaxed">{cameraError}</span>
                  </div>
                </div>
              )}

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

                <button
                  type="button"
                  onClick={takeSnapshot}
                  disabled={!isCameraActive || isCameraLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-6 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md transition-all btn-interactive"
                >
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white bg-emerald-300" />
                  <span>Ambil Foto</span>
                </button>
              </div>
            </div>
          )}

          {/* ---- STEP: SCANNING ---- */}
          {step === 'scanning' && (
            <div className="space-y-4 animate-slide-up">
              <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500/50 bg-slate-900/10 flex items-center justify-center h-64 sm:h-72 w-full shadow-md">
                {previewUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={previewUrl}
                    alt="Sedang memproses OCR"
                    className="w-full h-full object-contain opacity-85 filter contrast-105"
                  />
                ) : videoPreviewUrl ? (
                  <video
                    src={videoPreviewUrl}
                    muted
                    autoPlay
                    loop
                    playsInline
                    className="w-full h-full object-contain opacity-85 bg-black"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                    <span className="text-xs font-semibold">Menyiapkan berkas pemindaian...</span>
                  </div>
                )}

                {isVideo && (
                  <div className="absolute top-3 left-3 bg-emerald-600/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-xs flex items-center gap-1.5 backdrop-blur-xs z-20">
                    <Video className="w-3 h-3" />
                    <span>Rekaman Video Bukti</span>
                  </div>
                )}

                {/* Laser line animation */}
                <div className="absolute inset-x-0 h-1 bg-emerald-400 shadow-[0_0_20px_4px_#10B981] animate-scan-laser pointer-events-none z-10" />
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/15 via-transparent to-emerald-500/15 pointer-events-none animate-scan-glow" />
                <div
                  className="absolute inset-0 pointer-events-none opacity-20"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, #10b981 1px, transparent 1px), linear-gradient(to bottom, #10b981 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                  }}
                />
              </div>

              {/* Progress Card */}
              <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 animate-spin" />
                    {isExtractingVideo ? 'Mengekstrak Frame Video Bukti' : 'Memproses Pemindaian OCR Otomatis'}
                  </span>
                  <span className="text-[11px] font-mono text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                    {ocrEngineName}
                  </span>
                </div>

                <div className="w-full bg-emerald-200/60 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full animate-shimmer transition-all duration-300"
                    style={{ width: `${scanStage * 25}%` }}
                  />
                </div>

                <div className="text-[11px] text-emerald-900 space-y-1.5 pt-0.5">
                  <div className="flex items-center gap-2">
                    {isExtractingVideo ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700 shrink-0" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    )}
                    <span>
                      {isVideo
                        ? 'Frame rekaman video berhasil diverifikasi'
                        : 'Resolusi dan format media terverifikasi'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 font-medium">
                    {scanStage >= 2 ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700 shrink-0" />
                    )}
                    <span>Engine OCR mendeteksi baris teks pada bukti transaksi</span>
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
            </div>
          )}

          {/* ---- STEP: REVIEW ---- */}
          {(step === 'review' || step === 'saving') && (
            <div className="space-y-4 animate-slide-up pb-8 sm:pb-0">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-900 animate-slide-down">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold">Data transaksi berhasil diproses</div>
                  <div className="text-[11px] text-emerald-700 leading-relaxed">
                    Diproses otomatis oleh {ocrEngineName}. Anda dapat memeriksa atau menyesuaikan data sebelum konfirmasi simpan.
                  </div>
                </div>
              </div>

              {/* Media Preview in Review */}
              {(previewUrl || videoPreviewUrl) && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Berkas Bukti yang Di-scan:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowReviewMedia(!showReviewMedia)}
                      className="text-[11px] font-bold text-emerald-700 hover:underline"
                    >
                      {showReviewMedia ? 'Sembunyikan' : 'Lihat Bukti'}
                    </button>
                  </div>

                  {showReviewMedia && (
                    <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-900/5 flex items-center justify-center max-h-48">
                      {isVideo && videoPreviewUrl ? (
                        <video
                          src={videoPreviewUrl}
                          controls
                          playsInline
                          className="max-h-48 w-full object-contain bg-black"
                        />
                      ) : previewUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={previewUrl}
                          alt="Bukti Transaksi"
                          className="max-h-48 w-full object-contain"
                        />
                      ) : null}
                      {isVideo && (
                        <div className="absolute top-2 left-2 bg-emerald-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 backdrop-blur-xs">
                          <Video className="w-3 h-3" />
                          <span>Video Bukti</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Confidence Badge */}
              {confidence && (
                <div
                  className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold border ${
                    confidence === 'high'
                      ? 'bg-slate-50 border-slate-200 text-slate-800'
                      : confidence === 'medium'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {confidence === 'high' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    Akurasi OCR:{' '}
                    {confidence === 'high'
                      ? 'Tinggi'
                      : confidence === 'medium'
                      ? 'Sedang'
                      : 'Perlu Koreksi Manual'}.
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
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Pihak Penerima / Pengirim / Toko
                </label>
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
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Nomor Referensi Transaksi (Opsional)
                </label>
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
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Kategori Pengeluaran / Pemasukan
                </label>
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

        {/* Bottom Actions */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-100 shrink-0 flex items-center justify-between gap-3 bg-white/95 backdrop-blur-xs">
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
                <span className="hidden sm:inline">Scan Ulang / Ganti Berkas</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isScanning || isSaving}
              className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 rounded-xl transition-colors btn-interactive"
            >
              Batal
            </button>

            {step === 'upload' && !selectedFile && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-xs btn-interactive"
              >
                <Upload className="w-4 h-4" />
                <span>Pilih Foto / Video</span>
              </button>
            )}

            {step === 'upload' && selectedFile && (
              <button
                type="button"
                onClick={() => processSelectedFile(selectedFile)}
                disabled={isScanning}
                className="flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-40 transition-colors shadow-xs btn-interactive"
              >
                <ScanLine className="w-4 h-4" />
                <span>Scan Ulang Berkas Ini</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 'scanning' && (
              <button
                disabled
                className="flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-600 rounded-xl opacity-85"
              >
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
