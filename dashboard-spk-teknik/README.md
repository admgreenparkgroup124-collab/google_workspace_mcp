# Dashboard Monitoring SPK & PO — Green Park Group

Dashboard untuk memantau SPK, Home With AI, dan Purchasing Departemen
Teknik GPG, dibangun sesuai `PRD_Dashboard_SPK_Teknik_GPG.md` (v1.3,
final). Pada dasarnya read-only, kecuali satu fitur tulis-balik yang
disengaja: PIC terkait bisa mengisi **Target Hari SLA** per baris
langsung dari halaman Master Data SLA. Backend berupa Google Apps Script
**container-bound** (dibuat langsung dari dalam Google Sheets sumber
data), disajikan sebagai Web App.

Spreadsheet sumber:
https://docs.google.com/spreadsheets/d/1KyKiyRguYrFdCS2jQqKfrNhR4nvtbPVrV6abr0pR-48/edit

Folder ini murni source code + panduan. **Tidak ada langkah di bawah yang
otomatis** — semuanya perlu Anda jalankan manual satu kali di Google Sheets
& Apps Script (editor bawaan browser, tanpa command line).

---

## 1. Struktur file

```
apps-script/
  appsscript.json    Manifest Web App (timezone, mode akses)
  Config.gs           Nama tab & definisi kolom (nama tab/kolom kalau berubah, edit di sini)
  Utils.gs             Helper murni: normalisasi key, hitung tanggal, format Rupiah
  Auth.gs               Cek email login terhadap tab "Akses"
  DataService.gs         Baca 6 tab, gabungkan jadi JSON untuk dashboard
  Code.gs                  Entry point Web App (doGet) + endpoint data
  Index.html                Kerangka halaman dashboard
  Styles.html                 Tampilan (navy/abu-abu/putih + aksen status)
  JavaScript.html               Logic client: filter, grafik, tabel, detail per unit
```

---

## 2. Setup Google Sheets (sekali di awal)

Buka spreadsheet-nya, lalu:

### 2a. Tambah tab **"Home With AI"**

Baris header (baris 1), persis urutan ini:

```
Grup Proyek | Nama Proyek | Blok/No. Unit | Status | Nama Vendor | Satuan | Harga Satuan (Rp) | Harga Total (Rp) | Tanggal Order/Mulai | Tanggal Terpasang | Tanggal Selesai | Lampiran | Keterangan | Target Hari (SLA)
```

- Kolom **Status** hanya boleh salah satu dari: `Belum Order`, `On Proses`,
  `Terpasang` (disarankan pasang Data Validation di kolom ini supaya Naufal
  tidak salah ketik — salah ketik akan membuat baris tsb tidak masuk hitungan
  kartu ringkasan status).
- **Harga Satuan (Rp)** / **Harga Total (Rp)**: sama pola dengan SPK (Harga
  per satuan vs nilai total paket). Kalau cuma ada satu angka lump-sum,
  isi di **Harga Total (Rp)** saja, **Harga Satuan (Rp)** & **Satuan** boleh
  dikosongkan.
- **Tanggal Order/Mulai**: tanggal mulai proses (titik awal hitung SLA —
  lihat Bagian 2c). Kalau kosong, unit tsb tidak akan muncul di halaman
  Master Data SLA sampai diisi.
- **Target Hari (SLA)**: kolom baru, **boleh dikosongkan** — diisi
  otomatis oleh dashboard saat Naufal (atau PIC terkait) menginput Target
  Hari langsung di halaman Master Data SLA (lihat Bagian 2c). Tidak perlu
  diisi manual di spreadsheet, tapi kalau mau isi manual di sini juga
  boleh, dashboard membacanya sama saja.
- **Tanggal Terpasang**: tanggal instalasi (kosongkan kalau belum).
- **Tanggal Selesai**: milestone terpisah dari Tanggal Terpasang — dipakai
  dashboard untuk tahu proses ini sudah benar-benar selesai (SLA berhenti
  dihitung). Kalau proses Anda tidak membedakan "terpasang" dan "selesai",
  cukup isi salah satu saja (status `Terpasang` sudah cukup dianggap selesai
  walau Tanggal Selesai kosong).
- **Lampiran**: link/nama file bukti (foto, invoice, dll), teks bebas.

### 2b. Tambah tab **"Purchasing"**

Baris header:

```
Grup Proyek | Nama Proyek | Blok/No. Unit | Jenis Pengadaan | Nama Barang/Item | Nama Vendor | Satuan | Harga Satuan (Rp) | Harga Total (Rp) | Status Pekerjaan | Tanggal Order/Mulai | Tanggal | Lampiran | Keterangan | Target Hari (SLA)
```

- **Jenis Pengadaan**: `Promo Unit` / `Material PSU` / `Material Unit Bangunan` (Data Validation disarankan).
- **Blok/No. Unit**: isi untuk Promo Unit & Material Unit Bangunan; **kosongkan** untuk Material PSU.
- **Harga Satuan (Rp)** / **Harga Total (Rp)**: sama seperti Home With AI di atas — kalau cuma ada satu angka lump-sum, isi **Harga Total (Rp)** saja.
- **Status Pekerjaan**: untuk Material → `Belum Order`/`On Proses`/`Sudah Order`; untuk Promo Unit → `Belum Terpasang`/`On Proses`/`Terpasang`.
- **Tanggal Order/Mulai**: tanggal mulai proses, titik awal hitung SLA
  (Bagian 2c) — **beda** dari kolom **Tanggal** yang sudah ada (yang tetap
  berarti tanggal transaksi/terakhir seperti sebelumnya).
- **Lampiran**: link/nama file bukti, teks bebas.
- **Target Hari (SLA)**: kolom baru, **boleh dikosongkan** — diisi otomatis
  dashboard saat Kahfi menginput Target Hari di halaman Master Data SLA
  (Bagian 2c).

> Catatan kompatibilitas: kalau tab Purchasing/Home With AI sudah pernah
> dibuat dengan header lama "Nilai (Rp)" (bukan "Harga Total (Rp)"), tidak
> perlu buru-buru di-rename — dashboard tetap membaca kolom "Nilai (Rp)"
> dengan benar. Rename ke "Harga Total (Rp)" kapan saja Anda sempat, biar
> konsisten dengan label yang tampil di dashboard.

### 2c. Kolom **"Target Hari (SLA)"** di tab GP1–GP4, dan cara kerja Master Data SLA

Berbeda dari rencana awal (tab "SLA Config" terpisah, target per
kategori): **Target Hari SLA diinput manual per baris/proses, langsung
dari dashboard** (halaman Master Data SLA) oleh PIC yang berwenang untuk
proses itu — bukan lookup dari kategori. Yang perlu Anda siapkan di
spreadsheet cuma kolomnya; isinya nanti diisi lewat dashboard.

**Tambahkan kolom "Target Hari (SLA)" di ujung kanan tiap tab GP1, GP2,
GP3, GP4** (tab Home With AI & Purchasing sudah otomatis mengikutkan
kolom ini kalau Anda pakai header di Bagian 2a/2b di atas). Kolom ini
**boleh dikosongkan** — dashboard akan mengisinya otomatis saat PIC
menyimpan Target Hari lewat halaman Master Data SLA. Angka yang sudah
tersimpan tetap bisa Anda lihat/ubah manual di sini juga kalau perlu,
dashboard membacanya sama saja.

**Cara kerja di dashboard:** di halaman **Master Data SLA**, tiap baris
proses (SPK/Purchasing/Home With AI yang sudah punya Tanggal
Terbit/Tanggal Order-Mulai) menampilkan kolom "Target (Hari)". PIC yang
berwenang untuk baris itu (lihat kolom Role di Bagian 2d di bawah) melihat
kolom ini sebagai kotak input angka — isi jumlah hari targetnya, tekan
Tab/Enter atau klik keluar dari kotaknya, otomatis tersimpan ke sel yang
bersangkutan di spreadsheet. Pengguna lain (yang bukan PIC proses itu)
melihat kolom yang sama sebagai angka biasa, baca-saja. Dashboard lalu
membandingkan Target Hari itu terhadap jumlah hari sejak Tanggal Mulai
baris tsb untuk menandai status **Overdue**/**On Track**/**Selesai**.

Khusus **SPK Jenis UNIT RUMAH**: kalau Target Hari belum diisi sama
sekali, dashboard memakai fallback 150 hari (konsisten dengan alert
overdue yang sudah ada di menu Dashboard, Bagian 5) — begitu PIC mengisi
Target Hari manual untuk baris itu, nilai manual itu yang dipakai.

### 2d. Tambah tab **"Akses"** (+ kolom **Role** untuk siapa boleh isi Target Hari SLA)

Tab baru, ini yang menentukan siapa saja yang boleh membuka dashboard —
dan sekarang juga siapa saja yang boleh mengisi Target Hari SLA lewat
dashboard. Baris header:

```
Email | Nama | Role
```

> **Penting:** akses dashboard murni berdasarkan daftar di tab ini — tidak
> ada pengecualian otomatis untuk siapapun, termasuk pemilik file
> (`admgreenparkgroup124@gmail.com`). **Tambahkan juga akun yang akan Anda
> pakai untuk membuka/menguji dashboard** ke tab ini, kalau tidak, Anda
> sendiri akan melihat halaman "Akses Ditolak" saat mencoba Web App-nya
> setelah deploy.

Kolom **Role** menentukan scope tulis-balik Target Hari SLA milik tiap
orang (pisahkan dengan koma kalau lebih dari satu) — **kosongkan** untuk
orang yang hanya boleh melihat dashboard (viewer), termasuk CEO/Dirops/
Kadep Teknik. Isi satu baris per orang, misalnya:

```
Email          | Nama                          | Role
haris@...      | Haris                         | SPK:GP1,SPK:GP2,SPK:GP4
ajis@...       | Ajis                          | SPK:GP3
kahfi@...      | Kahfi                         | Purchasing
naufal@...     | Naufal                        | HomeWithAi
ceo@...        | CEO                           |
dirops@...     | Dirops (Faiz Muhammad Alfatih)|
yudi@...       | Yudi (Kadep Teknik)           |
```

- `SPK:GP1` / `SPK:GP2` / `SPK:GP3` / `SPK:GP4` — boleh isi Target Hari
  SLA untuk baris SPK di GP yang bersangkutan saja.
- `Purchasing` — boleh isi Target Hari SLA untuk semua baris Purchasing.
- `HomeWithAi` — boleh isi Target Hari SLA untuk semua baris Home With AI.
- Penulisan harus persis (huruf besar/kecil bebas, tapi kata & tanda `:`
  harus sama) — kalau salah ketik, orang tsb dianggap tidak punya scope
  itu (aman, gagal-tertutup: bukan malah jadi bisa edit segalanya).

> Baris Akses lama yang belum punya kolom Role tetap valid — otomatis
> diperlakukan sebagai viewer (tidak bisa isi Target Hari apapun), jadi
> menambah kolom Role tidak merusak akses siapapun yang sudah ada.
> Tambahkan/hapus baris di tab ini kapan saja tanpa perlu deploy ulang
> script — perubahan langsung berlaku di request berikutnya.

### 2e. Penulisan Grup Proyek — penting

Saat mengecek data riil, kami temukan tab GP1 menulis `GP1` sedangkan tab
GP2 menulis `GP 2` (pakai spasi). Dashboard **sudah menormalisasi** ini
secara otomatis (spasi & huruf besar/kecil diabaikan saat mencocokkan
data), jadi tidak akan merusak penggabungan data. Tapi untuk tampilan yang
rapi di dashboard maupun konsistensi jangka panjang, sebaiknya seragamkan
penulisan ke depannya (mis. selalu `GP1`, `GP2`, `GP3`, `GP4` tanpa spasi)
di semua tab termasuk Home With AI & Purchasing.

### 2f. Share & Protect sheet

1. **Share** file ke 7 akun Google di atas (minimal akses **Viewer**;
   Haris/Ajis/Kahfi/Naufal butuh **Editor** supaya bisa isi tab masing-masing).
2. **Protect sheet** per tab (klik kanan tab → Protect sheet):
   - Tab GP1, GP2, GP4 → hanya Haris yang boleh edit.
   - Tab GP3 → hanya Ajis yang boleh edit.
   - Tab Purchasing → hanya Kahfi.
   - Tab Home With AI → hanya Naufal.
   - Tab Akses → hanya Anda (admin/pemilik) — tab ini mengatur siapa boleh
     akses dashboard sekaligus scope tulis-balik Target Hari SLA (kolom
     Role, Bagian 2d), sebaiknya tidak semua orang bisa ubah langsung di
     spreadsheet.

> Catatan penting: karena Web App di-deploy dengan **Execute as: User
> accessing the web app** (Bagian 3), tulisan ke kolom **Target Hari
> (SLA)** dari dashboard benar-benar berjalan atas nama akun PIC yang
> sedang login — tunduk pada Protect sheet yang sama seperti kalau dia
> mengetik langsung di spreadsheet. Ini pas dengan setup Protect sheet di
> atas (Haris editor GP1/GP2/GP4, Ajis editor GP3, Kahfi editor
> Purchasing, Naufal editor Home With AI), jadi tidak perlu pengaturan
> tambahan. Kalau nanti ada PIC yang di kolom Role tab Akses (Bagian 2d)
> diberi scope untuk suatu tab tapi belum diberi akses **Editor** ke tab
> itu di Bagian 2f, input Target Hari-nya akan gagal tersimpan (muncul
> pesan error di dashboard) — pastikan scope Role dan hak edit Protect
> sheet selalu sinkron untuk orang yang sama.

---

## 3. Deploy Apps Script (sekali di awal)

1. Di spreadsheet, buka menu **Extensions → Apps Script**. Ini membuka
   editor kode bawaan Google, terikat ke spreadsheet ini (container-bound)
   — tidak perlu install apapun.
2. Akan ada file default `Code.gs` — hapus isinya, lalu buat file-file
   berikut lewat tombol **+ → Script** (untuk `.gs`) atau **+ → HTML**
   (untuk `.html`), beri nama **persis sama** (tanpa ekstensi saat diberi
   nama di Apps Script), lalu copy-paste isinya dari folder `apps-script/`
   di repo ini:
   - `Config.gs`
   - `Utils.gs`
   - `Auth.gs`
   - `DataService.gs`
   - `Code.gs`
   - `Index.html`
   - `Styles.html`
   - `JavaScript.html`
3. Buka file manifest: klik ikon gerigi (Project Settings) → centang
   **"Show appsscript.json manifest file in editor"**. File `appsscript.json`
   akan muncul di daftar file — ganti isinya dengan isi
   `apps-script/appsscript.json` dari repo ini.
4. Simpan semua file (Ctrl+S / ikon disket).
5. Klik **Deploy → New deployment**.
   - Klik ikon gerigi di samping "Select type" → pilih **Web app**.
   - Description: bebas, mis. "Dashboard SPK Teknik v1".
   - **Execute as**: **User accessing the web app**.
   - **Who has access**: **Anyone with a Google account**.
   - Klik **Deploy**.
6. Saat pertama kali deploy, Google akan minta **otorisasi** — ikuti
   prompt (pilih akun `admgreenparkgroup124@gmail.com`, klik "Advanced" →
   "Go to (nama project) (unsafe)" kalau muncul peringatan "app belum
   diverifikasi" — ini normal untuk script yang Anda buat sendiri, bukan
   pihak ketiga).
7. Setelah deploy sukses, akan muncul **Web app URL** — inilah link
   dashboard yang dibagikan ke 7 akun di atas.

### Update kode setelah deploy pertama

Kalau ke depannya ada perbaikan kode (dari saya via repo ini, atau Anda
sendiri), cara update:
1. Copy-paste ulang isi file yang berubah ke editor Apps Script, simpan.
2. **Deploy → Manage deployments** → pilih deployment yang aktif → ikon
   pensil (Edit) → pada "Version" pilih **New version** → **Deploy**.
   (Kalau cuma simpan file tanpa membuat "New version", perubahan tidak
   akan terlihat di URL Web App yang sudah dibagikan — ini perilaku
   standar Apps Script.)

---

## 4. Cara pakai dashboard

- Buka Web App URL, login dengan akun Google yang ada di tab **Akses**.
- Kalau muncul halaman "Akses Ditolak", cek: (a) email yang dipakai login
  benar-benar ada di tab Akses (tanpa spasi/typo), (b) file spreadsheet
  sudah di-share ke email tsb.
- Ada 5 menu di bagian atas (di bawah header), masing-masing punya filter
  GP/Proyek sendiri (menyesuaikan GP yang dipilih) selain filter yang
  disebut di bawah:
  - **Dashboard** — ringkasan: filter Tahun/Bulan/GP/Proyek/Kategori +
    kotak pencarian, kartu ringkasan, alert overdue, 5 grafik, dan tabel
    per kategori (SPK/Home With AI/Purchasing) yang mengikuti filter aktif.
  - **Master Data SPK** — seluruh kolom SPK apa adanya (persis tab GP1–GP4
    di spreadsheet), sub-tab GP1–GP4, + filter Proyek & Jenis SPK.
  - **Master Data Purchasing** — seluruh kolom tab Purchasing apa adanya
    (termasuk Nama Vendor, Satuan, Harga Satuan, Harga Total, Lampiran) +
    filter GP/Proyek/Jenis Pengadaan.
  - **Master Data Home With AI** — seluruh kolom tab Home With AI apa
    adanya (termasuk Nama Vendor, Satuan, Harga Satuan, Harga Total, Tgl
    Mulai, Tgl Selesai, Lampiran) + filter GP/Proyek/Status.
  - **Master Data SLA** — gabungan proses SPK/Purchasing/Home With AI yang
    sudah punya Tanggal Terbit/Tanggal Order-Mulai, dengan kolom Target
    Hari (**diisi manual langsung di kolom ini** oleh PIC terkait — lihat
    Bagian 2c), Elapsed Hari, dan Status SLA, plus alert otomatis kalau ada
    yang **Overdue** (lewat target). Filter GP/Proyek/Kategori/Status SLA.
  Keempat menu Master Data ini punya kotak pencari sendiri dan **tidak**
  ikut filter Tahun/Bulan/Kategori di menu Dashboard — sengaja dibuat
  sebagai tampilan "apa adanya" dari data mentah per tab/proses.
- Klik satu baris di tabel manapun (Dashboard maupun Master Data) yang
  punya nilai Unit (Blok/No. Unit terisi) untuk membuka **Detail per
  Unit** — riwayat SPK (dengan Jenis SPK & Item SPK-nya), Home With AI,
  dan Purchasing unit tsb digabung dalam satu panel, terlepas dari
  filter/menu yang sedang aktif.
- Tombol **⟳ Refresh** di kanan atas menarik data terbaru dari spreadsheet
  kapan saja. Auto-refresh berjalan sendiri di latar belakang — intervalnya
  bisa diatur lewat dropdown **Auto-refresh** di sebelah tombol Refresh
  (pilihan: 1/5/10/20/30 menit, default 5 menit). Pilihan interval
  tersimpan per browser (lewat localStorage), jadi tidak perlu diatur
  ulang tiap kali dibuka.

---

## 5. Batasan v1 / hal yang perlu diketahui

- **Dashboard ini read-only, kecuali satu pengecualian yang disengaja**:
  kolom **Target Hari (SLA)** di halaman Master Data SLA, yang boleh
  diisi langsung dari dashboard oleh PIC terkait (Bagian 2c/2d). Semua
  data lain tetap diinput langsung di Google Sheets oleh Haris/Ajis (SPK),
  Kahfi (Purchasing), Naufal (Home With AI) — sesuai PRD Bagian 5.
- **Overdue** (kartu & alert di menu Dashboard) hanya dihitung untuk SPK
  Jenis **UNIT RUMAH** (target otomatis Tanggal Terbit + 5 bulan) — ini
  tidak berubah walau ada fitur SLA baru. **Master Data SLA** adalah
  lapisan tambahan terpisah yang bisa melacak keterlambatan di jenis
  proses lain juga (SPK PSU, Purchasing, Home With AI), berdasar Target
  Hari yang diinput manual per baris (Bagian 2c) — dua sistem alert ini
  sengaja dipisah supaya perilaku overdue yang sudah ada tidak berubah
  tanpa diminta.
- Baris SPK/Purchasing/Home With AI yang belum diisi kolom **Tanggal
  Terbit**/**Tanggal Order/Mulai** tidak akan muncul di Master Data SLA
  sama sekali (dashboard tidak punya titik mulai untuk menghitung SLA-nya).
  Isi kolom itu dulu supaya baris tsb muncul dan PIC bisa mengisi Target
  Harinya.
- Kalau tab "Home With AI" atau "Purchasing" belum dibuat sama sekali,
  dashboard tetap jalan normal untuk data SPK — bagian Home With AI/
  Purchasing akan tampil kosong (0), bukan error.
- Baris di tab manapun yang GP/Nama Proyek/Kolom pentingnya kosong total
  akan dilewati otomatis (dianggap baris kosong), supaya tidak muncul
  sebagai data "hantu" di dashboard.

---

## 6. Kalau ada error

Buka **Extensions → Apps Script → Executions** (ikon jam di sidebar kiri)
untuk lihat log error terakhir. Salin pesan errornya dan sampaikan ke saya
(Claude Code) untuk diperbaiki di source code repo ini — lalu ulangi
langkah "Update kode setelah deploy pertama" di atas.
