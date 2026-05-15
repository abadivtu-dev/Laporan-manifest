# PRD: Sistem Laporan WA Otomatis Manifest Jamaah Umroh

## 1. Ringkasan Produk

Sistem otomatis yang setiap hari pukul 21:00 mengambil data manifest jamaah umroh dari Google Sheets, membandingkannya dengan data hari sebelumnya untuk mendeteksi jamaah baru, lalu mengirimkan laporan ke satu grup WhatsApp dalam bentuk:
- **Gambar** (screenshot tabel manifest per paket)
- **Caption teks** (rangkuman: total jamaah, jamaah baru, nama jamaah baru, sisa seat)

Laporan dikirim urut dari bulan keberangkatan terdekat ke terjauh.

## 2. Sumber Data

### 2.1. Spreadsheet Manifest Bulanan
- Format penamaan: `{TAHUN}-{BULAN} ({SINGKATAN BULAN} - SBY)` contoh: `2026-06 (JUN - SBY)`
- Satu file Google Sheets per bulan, dikelola tim database
- Tab utama yang digunakan:
  | Tab | Kegunaan |
  |-----|----------|
  | **DATA JAMAAH** | Data jamaah per paket — sumber utama laporan |
  | **DATA REKAP PAKET** | Rekap ringkasan per paket |
  | **UPDATE JAMAAH** | Data jamaah yang baru di-update |
  | **DATA JAMAAH KOSONGAN** | Data seat kosong |

### 2.2. Struktur DATA JAMAAH
- Satu sheet berisi **beberapa grup paket** (masing-masing paket keberangkatan)
- Setiap grup paket memiliki:
  - **Header metadata**: kode paket, jumlah seat, sisa seat, tanggal keberangkatan, maskapai, rute, nama paket
  - **Tabel jamaah** dengan kolom: PROSES/CANCEL/PINDAH, KELUARGA/ROMBONGAN, NO JAMAAH, ID REGISTER, NIK, JENIS IDENTITAS, NAMA, STATUS PASPOR, KETERANGAN PASPOR, HOTEL MAKKAH, HOTEL MADINAH, KAMAR, TOTAL PEMBAYARAN, KURANG BAYAR, JENIS KELAMIN, TEMPAT LAHIR, TGL LAHIR, STATUS MENIKAH, NO TELP/HP, REQUEST WAITING LIST, PEKERJAAN, PENDIDIKAN TERAKHIR, NO PASPOR, NAMA PASPOR, TGL DIKELUARKAN, TGL HABIS, KOTA PASPOR, HUB, ALAMAT, NO MANIFEST, dll
  - **Baris ringkasan**: JUMLAH JAMAAH, JAMAAH PRIA, JAMAAH WANITA

### 2.3. Spreadsheet Invoice (Database Pemindahan)
- File terpisah: **BIG DATA INVOICE**
- Tab: **INDUK DATABASE**, **INDUK DB TERKINI**
- Kolom kunci untuk tracking perpindahan:
  - **UNIQUE JAMAAH**: identitas unik jamaah
  - **PAKET TERAKHIR**: paket yang sedang/bakal ditempati (jika pindah paket, kolom ini berbeda dari paket saat transaksi)

## 3. Business Logic

### 3.1. Deteksi Jamaah Baru
1. Sistem menyimpan snapshot data jamaah per paket setiap hari (cache harian)
2. Saat generate laporan: **bandingkan daftar jamaah hari ini vs snapshot kemarin**
3. Jamaah yang **ada hari ini tapi tidak ada kemarin** = **jamaah baru**
4. Jumlah jamaah baru = selisih jumlah total

### 3.2. Deteksi Pemindahan (Cross-check Invoice)
1. Cek kolom **PAKET TERAKHIR** di database invoice
2. Jika PAKET TERAKHIR berbeda dari paket transaksi saat ini → jamaah tersebut **pindah paket**
3. Jamaah pindahan TIDAK dihitung sebagai jamaah baru

### 3.3. Laporan Bulanan Terdekat ke Terjauh
- Sistem memproses semua spreadsheet bulan yang aktif
- Urutan pengiriman: dari bulan keberangkatan terdekat (misal: Juni 2026 dulu, baru Juli 2026, dst.)
- Setiap paket dalam satu bulan dikirim sebagai satu pesan (gambar + caption)

## 4. Format Output

### 4.1. Setiap Paket = 1 Pesan WA
- **Gambar**: Screenshot tabel manifest paket (kolom-kolom utama: NO, NAMA, STATUS PASPOR, KAMAR, TOTAL PEMBAYARAN, KURANG BAYAR, NO MANIFEST)
- **Caption**: format teks:

```
📦 [NAMA PAKET]
📅 Berangkat: [TANGGAL]
✈️ [MASKAPAI] | [RUTE]

👥 Total Jamaah: X/Y seat
🆕 Jamaah Baru Hari Ini: Z orang
  ❯ Nama 1
  ❯ Nama 2
  ❯ Nama 3

📊 Sisa Seat: N
```

### 4.2. Jika Tidak Ada Jamaah Baru
- Caption tetap dikirim, bagian "Jamaah Baru Hari Ini" diganti: `🆕 Jamaah Baru Hari Ini: - (tidak ada)`

### 4.3. Header Laporan (opsional, di awal)
```
📋 LAPORAN HARIAN MANIFEST UMROH
📆 Jumat, 15 Mei 2026
━━━━━━━━━━━━━━━━━━━━
```

## 5. Infrastruktur & Teknis

### 5.1. Stack Teknologi
| Komponen | Pilihan |
|----------|---------|
| Runtime | Node.js (whatsapp-web.js / Baileys) |
| Google Sheets API | Service Account + googleapis |
| Screenshot | Puppeteer / Playwright (render HTML → capture) |
| Scheduler | node-cron (setiap 21:00 WIB) |
| Deployment | Cloud (Railway / Render / VPS) |
| Database lokal | SQLite (simpan snapshot harian) |

### 5.2. WhatsApp Client
- Library: **whatsapp-web.js** (gratis, Puppeteer-based)
- Perlu QR scan satu kali di awal untuk autentikasi
- Session disimpan supaya tidak perlu scan ulang setiap restart
- Risiko: nomer bisa di-banned WhatsApp karena pakai unofficial API

### 5.3. Google Sheets Access
- Menggunakan Google Service Account
- File manifest bulanan dan file invoice harus di-share ke service account email

### 5.4. Penyimpanan Snapshot
- SQLite database lokal menyimpan:
  - `snapshots`: data jamaah per paket per tanggal (JSON)
  - `sent_reports`: log laporan yang sudah terkirim

## 6. Alur Kerja Harian

```
1. 21:00 WIB — Scheduler trigger
2. Ambil daftar spreadsheet bulan aktif dari konfigurasi
3. LOOP (urut bulan terdekat → terjauh):
   a. Fetch DATA JAMAAH dari Google Sheets API
   b. Fetch snapshot kemarin dari SQLite
   c. Untuk setiap paket di sheet:
      - Bandingkan daftar jamaah hari ini vs kemarin
      - Deteksi jamaah baru (nama + jumlah)
      - Cross-check ke database invoice (PAKET TERAKHIR ≠ paket saat ini → abaikan dari "baru")
      - Generate screenshot tabel
      - Generate caption
      - Kirim ke WA grup (gambar + caption)
      - Simpan log pengiriman
   d. Simpan snapshot hari ini ke SQLite
4. Selesai
```

## 7. Konfigurasi

File `.env` atau konfigurasi yang perlu di-set:

```
# Google Sheets
GOOGLE_SERVICE_ACCOUNT_JSON={...}
SPREADSHEET_MONTHLY_IDS=id_juni_2026,id_juli_2026,id_agustus_2026
INVOICE_SPREADSHEET_ID=179bhJ8t29IlR0ThZidJFz43cocBF2ODYFaO4GLaBX14

# WhatsApp
WA_GROUP_NAME=Nama Grup WA

# Schedule
REPORT_TIME=21:00
TIMEZONE=Asia/Jakarta
```

## 8. Batasan & Risiko

| Risiko | Mitigasi |
|--------|----------|
| Nomer WA di-banned | Gunakan nomer cadangan; batasi interval kirim antar pesan (delay 3-5 detik) |
| Spreadsheet berubah struktur | Validasi kolom sebelum proses; kirim notif error ke admin |
| Service account tidak punya akses | Pastikan semua spreadsheet di-share ke service account |
| Session WA expired | Notifikasi admin untuk scan QR ulang |
