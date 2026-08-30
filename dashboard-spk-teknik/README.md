# Dashboard Monitoring SPK & PO — Green Park Group

Dashboard untuk memantau SPK, Home With AI, dan Purchasing Departemen
Teknik GPG, dibangun sesuai `PRD_Dashboard_SPK_Teknik_GPG.md` (v1.3,
final). Pada dasarnya read-only, kecuali empat fitur tulis-balik yang
disengaja: PIC terkait bisa mengisi **Target Hari SLA** per baris
langsung dari halaman Master Data SLA, bisa **menambah data baru**
(SPK/Purchasing/Home With AI) langsung dari dashboard lewat tombol
"+ Tambah Data", dan **SPV Lapangan** bisa mengisi **Progres Konstruksi
Mingguan** (Kurva S Rencana vs Realisasi, lengkap dengan minimal 4 foto
lapangan) lewat halaman tersendiri **"Input Progres"** — keempatnya
tertulis langsung ke Google Sheets (foto ke Google Drive), tidak perlu
diketik/upload dua kali. Backend berupa Google Apps Script
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

### 2d. Tambah tab **"Akses"** (+ kolom **Role** untuk siapa boleh menulis balik ke Sheets)

Tab baru, ini yang menentukan siapa saja yang boleh membuka dashboard —
dan sekarang juga siapa saja yang boleh menulis balik ke Sheets lewat
dashboard: mengisi Target Hari SLA (Bagian 2c) **dan** menambah data baru
lewat tombol "+ Tambah Data" (Bagian 4) — dua fitur ini pakai scope Role
yang sama persis, tidak ada pengaturan terpisah. Baris header:

```
Email | Nama | Role
```

> **Penting:** akses dashboard murni berdasarkan daftar di tab ini — tidak
> ada pengecualian otomatis untuk siapapun, termasuk pemilik file
> (`admgreenparkgroup124@gmail.com`). **Tambahkan juga akun yang akan Anda
> pakai untuk membuka/menguji dashboard** ke tab ini, kalau tidak, Anda
> sendiri akan melihat halaman "Akses Ditolak" saat mencoba Web App-nya
> setelah deploy.

Kolom **Role** menentukan scope tulis-balik (Target Hari SLA, Tambah
Data, **dan** Input Progres Konstruksi — lihat Bagian 2g) milik tiap
orang (pisahkan dengan koma kalau lebih dari satu) — **kosongkan** untuk
orang yang hanya boleh melihat dashboard (viewer), termasuk CEO/Dirops/
Kadep Teknik. Isi satu baris per orang, misalnya:

```
Email          | Nama                          | Role
haris@...      | Haris                         | SPK:GP1,SPK:GP2,SPK:GP4
ajis@...       | Ajis                          | SPK:GP3
kahfi@...      | Kahfi                         | Purchasing
naufal@...     | Naufal                        | HomeWithAi
spv1@...       | SPV Lapangan GP1/GP2          | SPV:GP1,SPV:GP2
spv2@...       | SPV Lapangan GP3/GP4          | SPV:GP3,SPV:GP4
ceo@...        | CEO                           |
dirops@...     | Dirops (Faiz Muhammad Alfatih)|
yudi@...       | Yudi (Kadep Teknik)           |
```

- `SPK:GP1` / `SPK:GP2` / `SPK:GP3` / `SPK:GP4` — boleh isi Target Hari
  SLA & tambah SPK baru untuk GP yang bersangkutan saja.
- `Purchasing` — boleh isi Target Hari SLA & tambah data Purchasing baru.
- `HomeWithAi` — boleh isi Target Hari SLA & tambah data Home With AI baru.
- `SPV:GP1` / `SPV:GP2` / `SPV:GP3` / `SPV:GP4` — role **SPV Lapangan**,
  terpisah dari Haris/Ajis/Kahfi/Naufal di atas: boleh menginput Progres
  Konstruksi Mingguan (Kurva S + minimal 4 foto) untuk unit-unit di GP
  yang bersangkutan saja, lewat halaman "Input Progres" (Bagian 2g & 4).
  Tidak otomatis dapat scope SPK/Purchasing/HomeWithAi lainnya — kalau
  satu orang SPV juga PIC SPK, tambahkan kedua scope-nya dipisah koma.
- Penulisan harus persis (huruf besar/kecil bebas, tapi kata & tanda `:`
  harus sama) — kalau salah ketik, orang tsb dianggap tidak punya scope
  itu (aman, gagal-tertutup: bukan malah jadi bisa edit segalanya).

> Baris Akses lama yang belum punya kolom Role tetap valid — otomatis
> diperlakukan sebagai viewer (tidak bisa isi Target Hari atau tambah
> data apapun), jadi menambah kolom Role tidak merusak akses siapapun
> yang sudah ada. Tambahkan/hapus baris di tab ini kapan saja tanpa perlu
> deploy ulang script — perubahan langsung berlaku di request berikutnya.

### 2e. Penulisan Grup Proyek — penting

Saat mengecek data riil, kami temukan tab GP1 menulis `GP1` sedangkan tab
GP2 menulis `GP 2` (pakai spasi). Dashboard **sudah menormalisasi** ini
secara otomatis (spasi & huruf besar/kecil diabaikan saat mencocokkan
data), jadi tidak akan merusak penggabungan data. Tapi untuk tampilan yang
rapi di dashboard maupun konsistensi jangka panjang, sebaiknya seragamkan
penulisan ke depannya (mis. selalu `GP1`, `GP2`, `GP3`, `GP4` tanpa spasi)
di semua tab termasuk Home With AI & Purchasing.

### 2g. Tambah tab **"Rencana Progres"** dan **"Realisasi Progres"** (Progres Konstruksi Mingguan)

Fitur Kurva S sederhana — bandingkan rencana jadwal kerja mingguan
terhadap realisasinya, per unit (referensinya **Blok/No. Unit unit itu
sendiri**, bukan "Tipe Unit" — jadi tidak perlu tabel master tipe rumah
terpisah).

**Tab "Rencana Progres"** (diisi **manual di Sheets**, bulk paste dari
dokumen Time Schedule & Kurva S yang sudah biasa Anda buat per unit).
Baris header:

```
Grup Proyek | Nama Proyek | Blok/No. Unit | Minggu Ke- | Uraian Pekerjaan | Bobot (%)
```

- **Satu baris per (unit, minggu, item pekerjaan)** — persis satu sel
  M1..M16 di dokumen Kurva S Anda: kalau "Pekerjaan Struktur Beton
  Bertulang" ada nilai di kolom M4-M8, itu jadi 5 baris terpisah (Minggu
  Ke- 4, 5, 6, 7, 8) dengan **Uraian Pekerjaan** yang sama tapi
  **Bobot (%)** sesuai nilai di kolom minggu itu. Boleh ada lebih dari
  satu baris untuk (unit, minggu) yang sama kalau memang ada beberapa
  item pekerjaan aktif di minggu itu bersamaan — dashboard menjumlahkan
  otomatis jadi total rencana minggu itu.
- **Bobot (%)** adalah persentase **mingguan milik item itu saja**
  (bukan kumulatif, dan bukan total bobot item itu sepanjang proyek) —
  sama seperti nilai di sel M1..M16 dokumen Kurva S Anda. Dashboard
  menjumlahkan semua item per minggu, lalu menjumlahkan itu jadi kurva
  kumulatif otomatis.
- **Uraian Pekerjaan** ditampilkan sbg rincian di riwayat mingguan
  (modal Detail per Unit & halaman Input Progres), mis. "Minggu 4:
  Rencana 4,4% (Pekerjaan Struktur Beton Bertulang: 4,4%)".
- Kalau tab ini belum diisi untuk suatu unit, dashboard tidak error —
  bagian Progres Konstruksi unit itu cuma menampilkan Realisasi saja
  (tanpa garis Rencana pembanding, dan status jadwal unit itu tidak bisa
  dinilai — lihat catatan alert di bawah).

**Tab "Realisasi Progres"** (diisi **SPV Lapangan lewat dashboard**, dari
halaman tersendiri **"Input Progres"** — BUKAN dari modal Detail per Unit
(itu baca-saja, lihat Bagian 4), dan bukan diketik manual di Sheets, walau
tetap tersimpan sebagai sel biasa di sini). Baris header:

```
Grup Proyek | Nama Proyek | Blok/No. Unit | Minggu Ke- | Tanggal Update | Realisasi Progres Mingguan (%) | Keterangan | Lampiran Foto
```

- Sama seperti Rencana, **Realisasi Progres Mingguan (%)** adalah
  persentase **mingguan** (bukan kumulatif) — diisi satu angka agregat per
  minggu (bukan rincian per item pekerjaan seperti "Pekerjaan Struktur
  Beton", dst. — supaya SPV tidak perlu mengisi banyak angka tiap minggu).
- **Lampiran Foto** — diisi otomatis oleh dashboard: SPV meng-upload foto
  asli dari HP-nya (minimal **4 foto** per entri minggu, wajib — kalau
  kurang dari 4, penyimpanan ditolak), lalu Apps Script meng-upload
  masing-masing ke Google Drive (folder **"Foto Progres Konstruksi"**,
  dibuat otomatis di sebelah file spreadsheet ini) dan menulis URL-nya ke
  kolom ini, dipisah `, ` kalau lebih dari satu.
- **Siapa boleh isi**: role **SPV Lapangan** — scope `SPV:<GP>` di kolom
  Role tab Akses (Bagian 2d), **bukan** Haris/Ajis/scope SPK (beda dari
  desain awal fitur ini) — SPV boleh input progres unit manapun di GP
  yang scope-nya dia punya, tidak perlu jadi PIC SPK unit itu.

> **Otorisasi Google Drive**: karena fitur ini meng-upload file ke Drive,
> `appsscript.json` mendeklarasikan `oauthScopes` eksplisit
> (`spreadsheets` + `drive.file` — scope sempit, skrip cuma bisa akses
> file yang DIBUAT olehnya sendiri, bukan seluruh Drive SPV). Konsekuensi:
> tiap SPV Lapangan akan diminta **otorisasi ulang** (izin akses Drive)
> saat pertama kali membuka Web App SETELAH deployment ini di-deploy
> ulang — muncul layar consent Google standar, tinggal disetujui sekali.

**Alert "Tertinggal Jadwal"** — dashboard membandingkan **Rencana
kumulatif** (jumlah Bobot semua item terjadwal s/d minggu yang
SEHARUSNYA sudah dicapai HARI INI, dihitung dari Tanggal Terbit SPK unit
itu, 1 minggu = 7 hari kalender) terhadap **Realisasi kumulatif** (total
semua entri Realisasi Progres yang sudah dilaporkan SPV, apapun minggu
ke berapa dilaporkannya). Kalau Realisasi kumulatif masih di bawah
Rencana kumulatif itu, unitnya ditandai **"Tertinggal Jadwal"**. Sengaja
pakai perbandingan kumulatif (bukan cuma minggu yang sudah diisi SPV
saja) supaya unit yang belum sempat dilaporkan minggu ini pun tetap
ke-flag kalau memang sudah telat — bukan "belum lapor" jadi dianggap
aman. Begitu sudah lewat minggu terakhir yang dijadwalkan di Rencana
Progres, perbandingannya berhenti di 100% rencana (tidak terus menuntut
lebih walau sudah lama sejak SPK terbit). Kalau tab Rencana Progres
belum diisi sama sekali untuk suatu unit, status jadwalnya tidak bisa
dinilai (bukan dianggap aman ATAU telat).

Alert ini muncul di 4 tempat: **badge merah "Tertinggal Jadwal"** +
baris tabel ditandai merah di halaman Input Progres (kolom Status),
**banner peringatan** di atas tabel Input Progres (jumlah unit
tertinggal sesuai filter GP/Proyek saat itu), **badge** di section
Progres Konstruksi pada modal Detail per Unit (terlihat semua
orang, baca-saja), dan **card "Unit Tertinggal Jadwal Konstruksi"** di
Dashboard sub-tab SPK (dihitung dari unit-unit yang sedang tampil sesuai
filter Dashboard).

### 2h. Share & Protect sheet

1. **Share** file ke seluruh akun Google terkait (minimal akses
   **Viewer**; Haris/Ajis/Kahfi/Naufal/SPV Lapangan butuh **Editor**
   supaya bisa isi tab masing-masing).
2. **Protect sheet** per tab (klik kanan tab → Protect sheet):
   - Tab GP1, GP2, GP4 → hanya Haris yang boleh edit.
   - Tab GP3 → hanya Ajis yang boleh edit.
   - Tab Purchasing → hanya Kahfi.
   - Tab Home With AI → hanya Naufal.
   - Tab **Realisasi Progres** → **SPV Lapangan** (akun-akun dengan scope
     `SPV:GP...` di kolom Role, Bagian 2d) — BUKAN Haris/Ajis, role ini
     sekarang terpisah dari PIC SPK (lihat Bagian 2g).
   - Tab **Rencana Progres** → tetap Haris & Ajis (mereka yang bulk-paste
     jadwal rencana per unit dari dokumen Time Schedule & Kurva S).
   - Tab Akses → hanya Anda (admin/pemilik) — tab ini mengatur siapa boleh
     akses dashboard sekaligus scope tulis-balik Target Hari SLA/Tambah
     Data/Input Progres (kolom Role, Bagian 2d), sebaiknya tidak semua
     orang bisa ubah langsung di spreadsheet.

> Catatan penting: karena Web App di-deploy dengan **Execute as: User
> accessing the web app** (Bagian 3), SEMUA tulisan dari dashboard ke
> Sheets — kolom **Target Hari (SLA)**, baris baru dari **"+ Tambah
> Data"**, maupun baris baru di **Realisasi Progres** (dari halaman
> "Input Progres") — benar-benar berjalan atas nama akun yang sedang
> login, tunduk pada Protect sheet yang sama seperti kalau dia mengetik
> langsung di spreadsheet. Ini pas dengan setup Protect sheet di atas
> (Haris editor GP1/GP2/GP4, Ajis editor GP3, Kahfi editor Purchasing,
> Naufal editor Home With AI, SPV Lapangan editor Realisasi Progres), jadi
> tidak perlu pengaturan tambahan. Kalau nanti ada orang yang di kolom
> Role tab Akses (Bagian 2d) diberi scope untuk suatu tab tapi belum
> diberi akses **Editor** ke tab itu di sini, tulisannya akan gagal
> tersimpan (muncul pesan error di dashboard) — pastikan scope Role dan
> hak edit Protect sheet selalu sinkron untuk orang yang sama. Foto yang
> di-upload SPV lewat "Input Progres" tersimpan ke folder Drive di
> sebelah file spreadsheet ini (bukan sel Sheets), jadi tidak terikat
> Protect sheet — cukup pastikan SPV sudah diberi akses Editor/Commenter
> ke folder Google Drive tempat spreadsheet ini berada (folder dibuat
> otomatis saat entri progres pertama disimpan).

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
   pihak ketiga). Karena `appsscript.json` sekarang minta akses **Google
   Drive** juga (fitur upload foto progres, Bagian 2g), layar consent ini
   akan menyebut izin "Melihat, mengedit, membuat, dan menghapus file
   Google Drive tertentu Anda" (scope `drive.file`, dibatasi cuma file
   yang dibuat script ini sendiri) — setujui juga. Setiap pengguna lain
   (termasuk SPV Lapangan) akan melihat prompt otorisasi serupa saat
   pertama kali membuka Web App-nya, karena deploy pakai **Execute as:
   User accessing the web app**.
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
- Ada 6 menu di **sidebar sebelah kiri** (gaya ERP), masing-masing punya
  filter GP (bentuk tab tombol Semua/GP1/GP2/GP3/GP4, konsisten di menu-
  menu Master Data & Input Progres) + Proyek sendiri (menyesuaikan GP yang
  dipilih) selain filter yang disebut di bawah. Sidebar bisa **dilipat**
  jadi rel ikon saja lewat tombol `«` di bawah daftar menu (hemat ruang
  layar, preferensinya tersimpan per browser) — klik lagi untuk
  melebarkannya. Di layar sempit/HP (penting untuk SPV Lapangan yang
  banyak akses dari lapangan), sidebar otomatis jadi menu **off-canvas**:
  disembunyikan, muncul lewat tombol **☰** di pojok kiri atas, klik di
  luar sidebar atau pilih satu menu untuk menutupnya lagi.
  - **Dashboard** — punya 4 sub-tab: **Semua** (ringkasan gabungan: filter
    Tahun/Bulan/GP/Proyek/Kategori + kotak pencarian, kartu ringkasan,
    alert overdue, 5 grafik, dan tabel per kategori SPK/Home With
    AI/Purchasing), **SPK**, **Purchasing**, **Home With AI** — tiga
    sub-tab terakhir menampilkan kartu & grafik khusus kategori itu saja:
    - **SPK**: card Total Proyek, Total SPK (rincian PSU/Unit Rumah),
      Total Nilai Transaksi (rincian PSU/Unit Rumah), Unit Tertinggal
      Jadwal Konstruksi (Bagian 2g/2h); grafik **garis** Trend Penerbitan
      SPK dengan toggle **Bulan/Tahun**, dan chart Status Progres (Sesuai
      Jadwal vs Overdue).
    - **Purchasing**: card Total PO Purchasing (rincian Jenis Pengadaan),
      Total Nilai PO Purchasing; grafik garis Trend PO Purchasing (toggle
      Bulan/Tahun), chart Status Progres (proporsi status pekerjaan).
    - **Home With AI**: card Total PO Home With AI (rincian Status),
      Total Nilai Transaksi Home With AI; grafik garis Trend PO Home With
      AI (toggle Bulan/Tahun), chart Status Progres (proporsi Belum
      Order/On Proses/Terpasang).
    Filter Tahun/Bulan/GP/Proyek/Cari tetap berlaku di semua
    sub-tab; chip Kategori cuma tampil di sub-tab Semua.
  - **Master Data SPK** — seluruh kolom SPK apa adanya (persis tab GP1–GP4
    di spreadsheet), + kartu ringkasan (**Total SPK** & Total Nilai) di
    atas tabel, + filter Proyek & Jenis SPK.
  - **Master Data Purchasing** — seluruh kolom tab Purchasing apa adanya
    (termasuk Nama Vendor, Satuan, Harga Satuan, Harga Total, Lampiran) +
    kartu ringkasan (**Total PO** & Total Nilai) + filter Proyek/Jenis
    Pengadaan.
  - **Master Data Home With AI** — seluruh kolom tab Home With AI apa
    adanya (termasuk Nama Vendor, Satuan, Harga Satuan, Harga Total, Tgl
    Mulai, Tgl Selesai, Lampiran) + kartu ringkasan (**Total PO** & Total
    Nilai) + filter Proyek/Status.
  - **Master Data SLA** — gabungan proses SPK/Purchasing/Home With AI yang
    sudah punya Tanggal Terbit/Tanggal Order-Mulai, dengan kolom Target
    Hari (**diisi manual langsung di kolom ini** oleh PIC terkait — lihat
    Bagian 2c), Elapsed Hari, dan Status SLA, plus alert otomatis kalau ada
    yang **Overdue** (lewat target). Filter GP/Proyek/Kategori/Status SLA.
  - **Input Progres** — khusus **SPV Lapangan** (scope `SPV:GP...`, Bagian
    2d): daftar unit yang sudah punya SPK (kolom GP, Proyek, Blok/Unit,
    Jenis SPK, Minggu Terakhir Diisi, % Realisasi Terakhir, Status), filter
    GP/Proyek + kotak pencari. Klik satu unit untuk buka Kurva S & riwayat
    progresnya, plus form input progres minggu ini (lihat detail alurnya
    di bawah).
  Kelima menu Master Data/Input Progres ini punya kotak pencari sendiri
  dan **tidak** ikut filter Tahun/Bulan/Kategori di menu Dashboard —
  sengaja dibuat sebagai tampilan "apa adanya" dari data mentah per
  tab/proses.
- **Tombol "+ Tambah Data"** — muncul di toolbar Master Data SPK/
  Purchasing/Home With AI, **hanya untuk PIC yang punya scope Role**
  terkait (Bagian 2d; Haris/Ajis untuk SPK sesuai GP yang aktif, Kahfi
  untuk Purchasing, Naufal untuk Home With AI — CEO/Dirops/Yudi tidak
  melihat tombol ini sama sekali). Klik tombol → isi form → **Simpan**
  langsung menulis baris baru di Sheets (di tab GP yang sesuai untuk SPK)
  dan dashboard otomatis me-refresh. Kalau sedang di sub-tab GP tertentu
  di Master Data SPK, kolom Grup Proyek di form otomatis terkunci ke GP
  itu; kalau di "Semua", pilih dulu GP tujuan (hanya GP yang PIC punya
  scope-nya yang muncul di pilihan). Field Nama Proyek punya saran
  ketik-otomatis dari proyek yang sudah ada (untuk GP terpilih) supaya
  tidak salah ketik, tapi tetap boleh mengetik nama proyek baru. Field
  **Lampiran** boleh diisi lebih dari satu — klik **+ Tambah Lampiran**
  untuk menambah baris link/nama file lagi, klik **×** di sebelah baris
  untuk menghapusnya; semua baris yang terisi digabung jadi satu teks
  (dipisah koma) saat disimpan ke Sheets, karena kolomnya tetap satu sel.
- Klik satu baris di tabel manapun (Dashboard maupun Master Data) yang
  punya nilai Unit (Blok/No. Unit terisi) untuk membuka **Detail per
  Unit** — riwayat urut: **Riwayat SPK** (dengan Jenis SPK & Item SPK-nya)
  → **Purchasing** → **Home With AI**, lalu **Progres Konstruksi**
  (Kurva S Rencana vs Realisasi mingguan, dengan badge **"Tertinggal
  Jadwal"**/**"Sesuai Jadwal"** dan rincian Uraian Pekerjaan per minggu
  kalau ada — lihat Bagian 2g; kalau unit belum punya SPK, bagian ini
  menampilkan catatan "belum bisa dilacak" alih-alih chart kosong), dan
  paling bawah **Total Seluruh Pengeluaran** (jumlah SPK + Purchasing +
  Home With AI unit itu, digabung jadi satu angka). Section Progres
  Konstruksi di modal ini **baca-saja** untuk semua orang (CEO/Dirops/
  Admin Teknik) — input progres tidak lagi lewat sini, lihat menu "Input
  Progres" di bawah.
- **Menu "Input Progres"** — alur khusus **SPV Lapangan**: daftar unit
  yang sudah punya SPK, dengan kolom **Status** menandai **"Tertinggal
  Jadwal"** (merah, baris ikut ditandai merah) / **"Sesuai Jadwal"**
  (hijau) berdasar perbandingan Rencana vs Realisasi kumulatif (lihat
  catatan alert di Bagian 2g) — plus **banner peringatan** di atas tabel
  kalau ada unit yang tertinggal (sesuai filter GP/Proyek saat itu). Cari
  unitnya (filter GP/Proyek/kotak cari), klik baris unit → muncul modal
  berisi Kurva S + riwayat progres unit itu (sama seperti di modal
  Detail per Unit), dan **kalau viewer punya scope `SPV:<GP>` unit
  tersebut**, tampil juga form "Input Progres Minggu Ini": Minggu Ke-,
  Realisasi Progres (%), Keterangan, dan **upload foto** (pilih/foto
  langsung dari HP, minimal **4 foto** — tombol Simpan tetap nonaktif
  secara efektif sampai syarat ini terpenuhi, ditandai counter foto
  "n/4"). Foto di-kecilkan otomatis di browser sebelum dikirim (supaya
  cepat di koneksi lapangan), lalu di-upload ke Google Drive oleh script
  dan linknya tersimpan di kolom Lampiran Foto (Bagian 2g). Kalau viewer
  tidak punya scope SPV untuk GP unit itu, bagian form diganti pesan
  "Anda tidak berwenang menginput progres konstruksi untuk GP ini" —
  Kurva S & riwayatnya tetap terlihat.
- Tombol **⟳ Refresh** di kanan atas menarik data terbaru dari spreadsheet
  kapan saja. Auto-refresh berjalan sendiri di latar belakang — intervalnya
  bisa diatur lewat dropdown **Auto-refresh** di sebelah tombol Refresh
  (pilihan: 1/5/10/20/30 menit, default 5 menit). Pilihan interval
  tersimpan per browser (lewat localStorage), jadi tidak perlu diatur
  ulang tiap kali dibuka.
- **Aman dipakai bersamaan oleh beberapa PIC/SPV sekaligus.** "+ Tambah
  Data" dan Input Progres menambah baris baru dengan pola baca-baris-
  terakhir-lalu-tulis — kalau dua orang submit ke tab yang sama (mis. dua
  SPV beda GP yang sama-sama menulis ke tab Realisasi Progres, yang
  dipakai bersama lintas GP) persis di detik yang sama, ada risiko kecil
  keduanya "rebutan" nomor baris yang sama. `writeNewRecord_`
  (DataService.gs) sudah dibungkus `LockService.getScriptLock()` untuk
  menutup celah ini — submit yang bersamaan otomatis antre (biasanya
  cuma tertunda sepersekian detik), bukan saling menimpa. Mengedit sel
  yang berbeda (mis. Target Hari SLA di baris lain) tidak perlu
  pengamanan ini karena Google Sheets sendiri sudah aman untuk itu.

---

## 5. Batasan v1 / hal yang perlu diketahui

- **Dashboard ini read-only, kecuali empat pengecualian yang disengaja**:
  kolom **Target Hari (SLA)** di halaman Master Data SLA, tombol
  **"+ Tambah Data"** di Master Data SPK/Purchasing/Home With AI, dan
  form **Input Progres Minggu Ini** di halaman **"Input Progres"**
  (Bagian 2c/2d/2g/4; BUKAN lagi di modal Detail per Unit — itu sekarang
  baca-saja) — keempatnya boleh ditulis langsung dari dashboard oleh
  PIC/SPV terkait, tapi **cuma bisa menambah baris baru**, belum bisa
  mengedit atau menghapus baris yang sudah ada — kalau ada baris lama
  yang salah, tetap perlu diperbaiki langsung di Google Sheets (Target
  Hari SLA sedikit beda: itu memang isi ulang sel yang sama, bukan tambah
  baris). Selebihnya (edit data existing) tetap dilakukan langsung di
  Sheets oleh Haris/Ajis (SPK), Kahfi (Purchasing), Naufal (Home With AI)
  — sesuai PRD Bagian 5.
- **Input Progres Konstruksi mewajibkan minimal 4 foto per entri
  minggu** (divalidasi di browser dan di server) — kalau SPV belum
  sempat memotret 4 foto, entri minggu itu tidak bisa disimpan dulu.
  Foto tersimpan di folder Google Drive di sebelah file spreadsheet ini
  (bukan di dalam sel Sheets), dengan akses "siapapun yang punya link
  boleh lihat" (`ANYONE_WITH_LINK`, view-only) — supaya link-nya bisa
  dibuka langsung dari kolom Lampiran Foto tanpa perlu izin Drive
  tambahan per orang, tapi juga berarti siapapun yang memegang link
  foto itu bisa melihatnya walau tidak terdaftar di tab Akses. Kalau ini
  jadi perhatian (mis. foto lapangan dianggap sensitif), ubah manual
  jadi `ANYONE_IN_DOMAIN`/private + share manual di
  `uploadProgressPhotos_` (DataService.gs).
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
