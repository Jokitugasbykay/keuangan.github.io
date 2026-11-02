# Kayla Finance - Personal Finance & Trading Management System

Aplikasi manajemen dan pencatatan keuangan pribadi mandiri (*offline-first*) yang mengintegrasikan mutasi perbankan, e-wallet, payment gateway Mayar, dan performa akun trading MetaTrader 5 (MT5).

---

## 1. Prinsip Utama & Arsitektur Sistem

- **100% Penyimpanan Lokal Mandiri**: Seluruh basis data disimpan di berkas lokal `data/db.json`. Tidak bergantung pada layanan cloud berbayar (tanpa Supabase, Firebase, atau basis data cloud pihak ketiga).
- **Integritas Transaksi Atomik**: Penulisan basis data menggunakan antrean mutex (*in-process lock*) dan berkas temporer atomik dengan sinkronisasi disk (`fsync`) untuk mencegah *race condition* dan data korup saat penulisan simultan.
- **Pencadangan Terproteksi**: Sistem secara otomatis membuat cadangan sebelum operasi penting (seperti pemulihan cadangan atau impor CSV). Rotasi cadangan secara ketat melindungi berkas bertanda proteksi dari penghapusan otomatis.
- **Privasi Keuangan**: Berkas basis data `data/db.json` dan folder `data/backups/` dikecualikan secara permanen dalam `.gitignore` sehingga data keuangan pribadi tidak akan terunggah ke repositori Git publik.
- **Pemindai Struk OCR Lokal**: Pemindai bukti transaksi menggunakan RapidOCR offline (ONNX) dengan cadangan Tesseract.js di peramban, tanpa memerlukan API key eksternal.

---

## 2. Cara Menjalankan Aplikasi Secara Lokal

### Prasyarat
- **Node.js** (versi 18 ke atas)
- **Python 3.10+** (opsional untuk OCR lokal resolusi tinggi dan konektor MT5)

### Langkah Menjalankan
1. Pasang dependensi Node.js:
   ```bash
   npm install
   ```

2. Jika berkas `data/db.json` belum ada, sistem akan membuatnya secara otomatis dengan skema awal yang valid, atau Anda dapat menyalin dari templat:
   ```bash
   cp data/db.json.example data/db.json
   ```

3. Jalankan server pengembang:
   ```bash
   npm run dev
   ```

4. Buka aplikasi di peramban pada alamat:
   ```
   http://localhost:3000
   ```

5. Untuk menjalankan production build:
   ```bash
   npm run build
   npm run start
   ```

---

## 3. Fitur Utama Aplikasi

### A. Dashboard Terpadu
- **Kekayaan Bersih (Net Worth)**: Perhitungan gabungan seluruh saldo rekening bank, e-wallet, payment gateway Mayar, serta ekuitas trading MT5 yang dikonversi dinamis menggunakan kurs USD ke IDR.
- **Grafik Arus Kas Dinamis**: Menghitung secara otomatis perputaran pemasukan dan pengeluaran 6 bulan terakhir langsung dari riwayat transaksi nyata.
- **Distribusi Saldo Aset**: Diagram lingkaran alokasi dana per rekening.
- **Snapshot Posisi MT5**: Pemantauan langsung order terbuka dan floating profit/loss.

### B. Riwayat & Pencatatan Transaksi
- **Pencatatan Lengkap**: Pemasukan, pengeluaran, dan transfer antar-rekening dengan validasi konsistensi saldo.
- **Edit & Rekalkulasi Saldo**: Pengguna dapat mengoreksi nominal, kategori, tanggal, maupun akun pada transaksi yang telah tercatat; saldo akun akan disesuaikan secara otomatis dan aman.
- **Hapus dengan Rollback Otomatis**: Menghapus transaksi akan membatalkan mutasi dan mengembalikan saldo rekening ke posisi semula.
- **Filter Multi-Kriteria**: Filter berdasarkan kata kunci pencarian, jenis transaksi, rekening sumber, kategori, dan rentang tanggal (Hari ini, 7 hari terakhir, bulan ini, tahun berjalan).
- **Impor & Ekspor**: Mendukung impor mutasi CSV perbankan dengan deteksi duplikasi otomatis, serta ekspor laporan CSV dan JSON.

### C. Pemindai Struk (Scan Bukti)
- **Dukungan Multi-Perangkat**: Dapat diakses melalui kamera ponsel (kamera belakang/depan), webcam desktop, tablet, maupun unggah berkas gambar galeri.
- **Dukungan Video Transaksi**: Ekstraksi otomatis keyframe beresolusi tinggi saat pengguna mengunggah rekaman layar konfirmasi transfer.
- **Review & Koreksi Sebelum Simpan**: Hasil pembacaan OCR (nominal, merchant, tanggal, nomor referensi) dapat diperiksa dan diedit terlebih dahulu oleh pengguna sebelum disimpan ke database.

### D. Manajemen Rekening
- Pengelolaan rekening bank, e-wallet, pos bisnis Mayar, dan akun trading MT5.
- Penyesuaian saldo riil (*reconciliation*) dan pemisahan buku transaksi pribadi (*personal*) dan bisnis (*business*).
- Proteksi penghapusan: Akun yang memiliki riwayat transaksi atau terhubung ke MT5 dilindungi agar riwayat keuangan tidak rusak.

### E. Integrasi MetaTrader 5 (MT5)
- Pemantauan balance, equity, margin, free margin, dan margin level.
- Daftar posisi terbuka live dan riwayat deal transaksi yang telah ditutup (*realized P&L*).
- Script konektor lokal Python pada folder `connector/mt5_sync.py` untuk sinkronisasi otomatis dari terminal MT5 di PC.

---

## 4. Keamanan & Manajemen Cadangan Data

- **Pencadangan Manual & Otomatis**: Melalui menu **Pengaturan**, pengguna dapat membuat snapshot data kapan saja, mengunduh salinan berkas cadangan, atau memulihkan data dari berkas cadangan lokal maupun file JSON eksternal.
- **Validasi Integritas Cadangan**: Setiap pemulihan berkas cadangan divalidasi skemanya terlebih dahulu. Jika berkas rusak, pemulihan ditolak dan data aktif dijamin tidak berubah.
- **Sanitasi Pesan Galat**: Pesan galat dari API backend tidak pernah membocorkan path direktori lokal server ke sisi klien.
