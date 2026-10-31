# Product Requirements Document (PRD)
## Personal Finance Dashboard

**Nama Proyek:** Kayla Finance
**Versi:** 1.0
**Status:** Approved / In Progress
**Pemilik Produk:** Kayla
**Platform:** Web Application
**Jenis Produk:** Personal Finance Management System

---

## 1. Ringkasan Produk

Kayla Finance adalah website pencatat dan pemantau keuangan pribadi yang mengintegrasikan berbagai sumber keuangan dalam satu dashboard terpadu.

Sistem dirancang untuk mengumpulkan data dari rekening bank, e-wallet, akun trading MetaTrader 5 (MT5), dan Mayar, sehingga pengguna dapat memantau saldo, transaksi, arus kas, aset, dan performa trading secara terpusat.

Tujuan utamanya adalah memberikan gambaran keuangan yang akurat, mengurangi pencatatan manual, dan membantu pengguna mengambil keputusan finansial berbasis data.

## 2. Tujuan Produk

- Menggabungkan seluruh akun keuangan dalam satu dashboard.
- Mempermudah pencatatan dan kategorisasi transaksi.
- Memantau saldo dan kekayaan bersih secara keseluruhan.
- Mengintegrasikan riwayat transaksi MT5 dan performa trading.
- Memisahkan keuangan pribadi dan keuangan bisnis.
- Menyediakan laporan keuangan berdasarkan periode.

## 3. Target Pengguna

Pengguna utama adalah pemilik akun Kayla Finance, yaitu Kayla sendiri.

Aplikasi bersifat privat dan tidak membutuhkan fitur multi-user pada versi MVP. Arsitektur tetap dirancang modular agar dapat dikembangkan menjadi produk SaaS di masa depan.

## 4. Sumber Data dan Integrasi

| Sumber | Data yang Dibutuhkan | Metode Awal |
|---|---|---|
| MT5 | Balance, equity, posisi terbuka, riwayat deal/order, profit/loss | Python MT5 connector |
| blu | Saldo, mutasi rekening | CSV/Excel import |
| Mandiri | Saldo, mutasi rekening | CSV/Excel import |
| BTN | Saldo, mutasi rekening | CSV/Excel import |
| Mayar | Transaksi, saldo, pembayaran masuk, biaya | API resmi / MCP Mayar / Impor |
| E-wallet | Saldo dan mutasi (GoPay, OVO, Dana, dll.) | CSV/Excel import |

### Prinsip Integrasi

1. Gunakan API resmi jika tersedia dan kredensial telah disiapkan.
2. Gunakan impor file sebagai fallback untuk sumber tanpa API langsung.
3. Sediakan pencatatan manual untuk transaksi yang belum tersinkronisasi.
4. Jangan menyimpan kredensial atau password internet banking di database.
5. Jangan mengasumsikan semua integrasi berjalan otomatis secara instan sejak MVP.

## 5. Fitur Utama

### 5.1 Dashboard
Menampilkan:
- Total aset dan kekayaan bersih (net worth).
- Total saldo seluruh rekening dan e-wallet.
- Total pemasukan dan pengeluaran bulan berjalan.
- Grafik arus kas (cash flow).
- Ringkasan profit/loss trading.
- Distribusi saldo berdasarkan akun.
- Daftar transaksi terbaru.

### 5.2 Account Management
Pengguna dapat:
- Menambahkan akun keuangan baru.
- Memilih jenis akun: bank, e-wallet, trading, atau payment gateway.
- Menentukan nama akun dan mata uang (default IDR, mendukung USD).
- Melihat saldo terakhir dan waktu sinkronisasi.
- Mengaktifkan atau menonaktifkan akun.
- Melakukan rekonsiliasi dan penyesuaian saldo manual.

### 5.3 Transaction Management
Setiap transaksi memiliki:
- Tanggal dan waktu transaksi.
- Deskripsi atau keterangan.
- Nominal transaksi.
- Jenis transaksi: pemasukan (income), pengeluaran (expense), transfer, atau trading.
- Akun sumber.
- Akun tujuan (khusus transfer).
- Kategori transaksi.
- Catatan tambahan.
- Sumber data dan ID transaksi eksternal.

Fitur pendukung:
- Tambah, edit, dan hapus transaksi secara manual.
- Pencarian dan filter transaksi (berdasarkan akun, kategori, tanggal).
- Kategorisasi otomatis dan manual.
- Impor data mutasi CSV/Excel dengan parser terstandar.
- Deteksi transaksi duplikat berdasarkan hash atau ID eksternal.
- Penanganan transfer antar-akun tanpa mencatatnya sebagai pemasukan atau pengeluaran ganda.

### 5.4 MT5 Integration
Data yang ditampilkan:
- Nama broker dan nomor akun (disamarkan untuk keamanan tampilan).
- Balance dan equity terkini.
- Floating profit/loss.
- Margin dan free margin.
- Posisi trading yang sedang terbuka (open positions).
- Riwayat order dan deal yang telah selesai.
- Realized dan unrealized P&L.

Implementasi:
- Python connector berjalan lokal pada perangkat yang menjalankan MetaTrader 5 terminal.
- Connector membaca data melalui library resmi Python MetaTrader5.
- Data dikirimkan ke backend melalui API endpoint aman (HTTPS) dengan autentikasi token.
- Sinkronisasi terjadwal secara periodik.
- Jika connector tidak aktif, dashboard menampilkan status offline dan stempel waktu pembaruan terakhir.
- Bersifat read-only tanpa eksekusi order pada versi MVP.

### 5.5 Mayar Integration
Data yang ditampilkan:
- Pembayaran masuk dan status invoice.
- Biaya transaksi payment gateway.
- Saldo akun dan histori pencairan dana.
- Riwayat transaksi terperinci per periode.
- Pemisahan kategori akun bisnis agar tidak tercampur dengan pos keuangan pribadi.

### 5.6 Financial Reports
Laporan meliputi:
- Pemasukan dan pengeluaran bulanan.
- Breakdown arus kas berdasarkan kategori.
- Perkembangan saldo per akun.
- Perubahan kekayaan bersih dari waktu ke waktu.
- Ringkasan performa dan profit/loss trading.
- Fitur ekspor laporan ke format CSV dan PDF.

## 6. Struktur Navigasi

- Dashboard
- Accounts
- Transactions
- Trading (MT5)
- Reports
- Settings

## 7. Arsitektur dan Teknologi

| Komponen | Pilihan Teknologi |
|---|---|
| Frontend | Next.js (App Router) + TypeScript |
| Styling & UI | Tailwind CSS + Lucide Icons / Shadcn UI |
| Backend & Database | Supabase (PostgreSQL) |
| Autentikasi | Supabase Auth |
| Keamanan Data | PostgreSQL Row Level Security (RLS) |
| MT5 Connector | Python 3.10+ (MetaTrader5 library) |
| State & Query | TanStack Query / Server Actions |
| Deployment | Vercel / Cloudflare Pages |

## 8. Skema Basis Data Awal

### accounts
- id (uuid, primary key)
- user_id (uuid, foreign key)
- name (varchar)
- provider (varchar)
- account_type (varchar: bank, ewallet, trading, payment_gateway)
- currency (varchar: IDR, USD)
- current_balance (numeric)
- is_active (boolean)
- last_synced_at (timestamptz)
- created_at (timestamptz)

### transactions
- id (uuid, primary key)
- user_id (uuid, foreign key)
- account_id (uuid, foreign key)
- external_transaction_id (varchar, nullable)
- transaction_date (timestamptz)
- description (text)
- amount (numeric)
- transaction_type (varchar: income, expense, transfer, trading)
- category_id (uuid, foreign key, nullable)
- transfer_group_id (uuid, nullable)
- source (varchar: manual, csv_import, mt5, mayar)
- notes (text, nullable)
- created_at (timestamptz)

### categories
- id (uuid, primary key)
- user_id (uuid, foreign key)
- name (varchar)
- category_type (varchar: income, expense)
- icon (varchar, nullable)
- color (varchar, nullable)

### trading_accounts
- id (uuid, primary key)
- user_id (uuid, foreign key)
- account_id (uuid, foreign key)
- broker (varchar)
- mt5_login (bigint)
- server (varchar)
- currency (varchar)
- leverage (integer)
- balance (numeric)
- equity (numeric)
- floating_profit (numeric)
- last_synced_at (timestamptz)

### trading_deals
- id (uuid, primary key)
- trading_account_id (uuid, foreign key)
- external_deal_id (bigint)
- symbol (varchar)
- deal_type (varchar: buy, sell)
- volume (numeric)
- price (numeric)
- profit (numeric)
- commission (numeric)
- swap (numeric)
- deal_time (timestamptz)

### sync_logs
- id (uuid, primary key)
- user_id (uuid, foreign key)
- source (varchar)
- status (varchar: success, failed, running)
- started_at (timestamptz)
- completed_at (timestamptz)
- records_synced (integer)
- error_message (text, nullable)

## 9. Persyaratan Keamanan

- Autentikasi ketat wajib diterapkan.
- Penerapan Row Level Security (RLS) pada seluruh tabel data pengguna.
- Tidak pernah menyimpan kredensial login perbankan pengguna.
- Kunci API dan rahasia integrasi disimpan secara aman di environment variables backend.
- Komunikasi jaringan wajib menggunakan HTTPS terenkripsi.
- Berkas log tidak boleh mencatat informasi keuangan yang bersifat rahasia.
- Tersedia opsi ekspor dan penghapusan data secara mandiri.

## 10. Ruang Lingkup MVP

### Termasuk dalam MVP (In Scope)
- Autentikasi pengguna tunggal (Kayla).
- Dashboard ringkasan finansial dan grafik arus kas.
- Manajemen akun keuangan (tambah, ubah, nonaktifkan).
- Manajemen transaksi manual (pencatatan, edit, hapus).
- Parser dan impor file CSV/Excel mutasi rekening (blu, Mandiri, BTN).
- Pencegahan transaksi duplikat saat impor mutasi.
- Manajemen kategori pemasukan dan pengeluaran.
- Integrasi read-only akun MT5 via Python connector.
- Integrasi akun Mayar untuk pencatatan transaksi masuk.
- Laporan keuangan dasar dan ekspor CSV.

### Di Luar Ruang Lingkup MVP (Out of Scope)
- Fitur transfer dana atau pembayaran langsung dari website.
- Eksekusi order trading MT5 dari aplikasi.
- Web scraping perbankan otomatis dengan menyimpan kredensial bank.
- Fitur multi-tenant / multi-user SaaS.
- Asisten AI pemberi rekomendasi finansial otomatis.

## 11. Kriteria Penerimaan (Acceptance Criteria)

MVP dinyatakan tuntas jika:
1. Pengguna dapat masuk ke aplikasi dengan aman.
2. Pengguna dapat mengelola daftar akun bank, e-wallet, trading, dan payment gateway.
3. Dashboard menampilkan akumulasi saldo dan net worth secara akurat.
4. Pencatatan transaksi manual berjalan lancar untuk income, expense, dan transfer.
5. Impor mutasi rekening berhasil membaca data dan mengabaikan mutasi yang telah ada.
6. Transfer internal antar-akun tidak menggelembungkan total pemasukan atau pengeluaran.
7. Data MT5 tersinkronisasi dan menampilkan balance, equity, serta open positions.
8. Data Mayar tampil terpisah sebagai catatan transaksi bisnis.
9. Laporan bulanan dapat dihasilkan dan diekspor ke format file CSV.
10. Dashboard menginformasikan status dan waktu sinkronisasi terakhir dari setiap sumber data.

## 12. Rencana Tahapan Eksekusi

### Fase 1: Fondasi Proyek
- Inisialisasi repository dan workspace.
- Setup proyek Next.js (App Router, TypeScript, Tailwind CSS, Shadcn UI).
- Konfigurasi Supabase project, client, dan skema database awal dengan RLS.
- Setup halaman otentikasi login.

### Fase 2: Manajemen Finansial Utama
- Implementasi modul Account Management.
- Implementasi modul Transaction Management beserta kategorisasi.
- Implementasi parser dan import CSV/Excel untuk mutasi bank.
- Implementasi Dashboard ringkasan metrik dan grafik.

### Fase 3: Integrasi Data
- Pembuatan script Python connector MT5 lokal untuk sinkronisasi balance, equity, dan deals.
- Pembuatan endpoint API penerima data MT5 di Next.js/Supabase.
- Integrasi data Mayar menggunakan API resmi atau sinkronisasi MCP.

### Fase 4: Laporan dan Penyempurnaan
- Modul laporan keuangan dan filter rentang waktu.
- Ekspor data laporan ke CSV.
- Polishing UI/UX, penanganan error, dan dokumentasi operasional.
