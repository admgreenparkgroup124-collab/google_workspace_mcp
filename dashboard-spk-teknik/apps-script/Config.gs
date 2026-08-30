/**
 * Konfigurasi terpusat: nama tab, nama field logis per tab, dan definisi
 * kolom yang dipakai buildHeaderMap() (lihat Utils.gs) supaya pembacaan
 * tetap benar walau posisi kolom di sheet digeser, asalkan nama header
 * kolomnya tidak diubah total.
 *
 * PENTING: script ini container-bound (dibuat lewat Extensions > Apps
 * Script dari dalam Sheet-nya sendiri), jadi getSpreadsheet() cukup pakai
 * SpreadsheetApp.getActiveSpreadsheet() -- tidak perlu SPREADSHEET_ID.
 */

var CONFIG = {
  SPK_TABS: ['GP1', 'GP2', 'GP3', 'GP4'],
  HOME_WITH_AI_TAB: 'Home With AI',
  PURCHASING_TAB: 'Purchasing',
  ACCESS_TAB: 'Akses',
  PROGRESS_RENCANA_TAB: 'Rencana Progres',
  PROGRESS_REALISASI_TAB: 'Realisasi Progres',

  // Folder Drive (dibuat otomatis sbg subfolder di sebelah file
  // spreadsheet ini) tempat foto progres konstruksi mingguan disimpan --
  // lihat getOrCreateProgressPhotosFolder_/uploadProgressPhotos_ di
  // DataService.gs (Addendum 7).
  PROGRESS_PHOTOS_FOLDER_NAME: 'Foto Progres Konstruksi',

  // Jenis SPK yang Tanggal Selesai-nya otomatis dihitung (Tanggal Terbit + 5 bulan)
  UNIT_RUMAH_JENIS_SPK: 'UNIT RUMAH',
  UNIT_RUMAH_OVERDUE_MONTHS: 5,

  // Fallback target SLA (hari) untuk SPK Unit Rumah selama PIC belum
  // mengisi "Target Hari (SLA)" manual utk baris itu -- supaya tetap
  // konsisten dengan aturan Tanggal Selesai otomatis di atas (5 bulan
  // ~ 30 hari/bulan) alih-alih kosong begitu saja.
  UNIT_RUMAH_DEFAULT_SLA_DAYS: 150
};

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

// ---- Definisi kolom per jenis tab (dipakai oleh buildHeaderMap di Utils.gs) ----
// Tiap field: { key, candidates: [array kandidat header setelah dinormalisasi] }
// Kandidat pertama dianggap paling "resmi"; sisanya jaring pengaman kalau
// header ditulis sedikit berbeda (mis. "Blok / No. Unit / Area Kerja").

var SPK_FIELD_DEFS = [
  { key: 'no', candidates: ['no'] },
  { key: 'noSpk', candidates: ['no spk'] },
  { key: 'jenisSpk', candidates: ['jenis spk'] },
  { key: 'itemSpk', candidates: ['item spk'] },
  { key: 'grupProyek', candidates: ['grup proyek'] },
  { key: 'namaProyek', candidates: ['nama proyek'] },
  { key: 'blokUnit', candidates: ['blok no unit area kerja', 'blok no unit', 'blok unit', 'no unit'] },
  { key: 'kontraktor', candidates: ['kontraktor vendor', 'kontraktor'] },
  { key: 'subKontraktor', candidates: ['sub kontraktor'] },
  { key: 'namaPekerjaan', candidates: ['nama pekerjaan'] },
  { key: 'volume', candidates: ['volume'] },
  { key: 'satuan', candidates: ['satuan'] },
  { key: 'hargaPerMeter', candidates: ['harga per meter rp', 'harga per meter'] },
  { key: 'nilaiKontrak', candidates: ['nilai kontrak rp', 'nilai kontrak'] },
  { key: 'nilaiAddendum', candidates: ['nilai addendum rp', 'nilai addendum'] },
  { key: 'tanggalTerbit', candidates: ['tanggal terbit'] },
  { key: 'tanggalSelesai', candidates: ['tanggal selesai'] },
  { key: 'picAdminTeknik', candidates: ['pic admin teknik'] },
  { key: 'keterangan', candidates: ['keterangan'] },
  { key: 'lampiran', candidates: ['lampiran'] },
  { key: 'targetHariSla', candidates: ['target hari sla', 'target hari'] }
];

var HOME_WITH_AI_FIELD_DEFS = [
  { key: 'grupProyek', candidates: ['grup proyek'] },
  { key: 'namaProyek', candidates: ['nama proyek'] },
  { key: 'blokUnit', candidates: ['blok no unit area kerja', 'blok no unit', 'blok unit', 'no unit'] },
  { key: 'status', candidates: ['status'] },
  { key: 'namaVendor', candidates: ['nama vendor', 'vendor'] },
  { key: 'satuan', candidates: ['satuan'] },
  { key: 'hargaSatuan', candidates: ['harga satuan rp', 'harga satuan'] },
  // "nilai" tetap nama field internal-nya; header sheet sekarang "Harga
  // Total (Rp)" -- kandidat lama "Nilai (Rp)" dipertahankan di belakang
  // supaya tetap kompatibel kalau sheet belum di-rename.
  { key: 'nilai', candidates: ['harga total rp', 'harga total', 'nilai rp', 'nilai'] },
  { key: 'tanggalMulai', candidates: ['tanggal order mulai', 'tanggal mulai', 'tanggal order'] },
  { key: 'tanggalTerpasang', candidates: ['tanggal terpasang'] },
  { key: 'tanggalSelesai', candidates: ['tanggal selesai'] },
  { key: 'lampiran', candidates: ['lampiran'] },
  { key: 'keterangan', candidates: ['keterangan'] },
  { key: 'targetHariSla', candidates: ['target hari sla', 'target hari'] }
];

var PURCHASING_FIELD_DEFS = [
  { key: 'grupProyek', candidates: ['grup proyek'] },
  { key: 'namaProyek', candidates: ['nama proyek'] },
  { key: 'blokUnit', candidates: ['blok no unit area kerja', 'blok no unit', 'blok unit', 'no unit'] },
  { key: 'jenisPengadaan', candidates: ['jenis pengadaan'] },
  { key: 'namaBarang', candidates: ['nama barang item', 'nama barang'] },
  { key: 'namaPekerjaan', candidates: ['nama pekerjaan'] },
  { key: 'namaVendor', candidates: ['nama vendor', 'vendor'] },
  { key: 'satuan', candidates: ['satuan'] },
  { key: 'qty', candidates: ['qty', 'quantity', 'jumlah'] },
  { key: 'hargaSatuan', candidates: ['harga satuan rp', 'harga satuan'] },
  { key: 'nilai', candidates: ['harga total rp', 'harga total', 'nilai rp', 'nilai'] },
  { key: 'statusPekerjaan', candidates: ['status pekerjaan'] },
  { key: 'tanggalMulai', candidates: ['tanggal order mulai', 'tanggal mulai', 'tanggal order'] },
  { key: 'tanggal', candidates: ['tanggal'] },
  { key: 'lampiran', candidates: ['lampiran'] },
  { key: 'keterangan', candidates: ['keterangan'] },
  { key: 'targetHariSla', candidates: ['target hari sla', 'target hari'] }
];

var ACCESS_FIELD_DEFS = [
  { key: 'email', candidates: ['email', 'alamat email', 'email address'] },
  { key: 'nama', candidates: ['nama', 'nama lengkap'] },
  // Scope tulis-balik SLA per PIC, dipisah koma: "SPK:GP1,SPK:GP2,SPK:GP4",
  // "Purchasing", "HomeWithAi". Kosong/tidak ada kolom = viewer (baca saja).
  { key: 'role', candidates: ['role', 'peran'] }
];

// Rencana Progres: diisi manual di Sheets (bulk paste dari dokumen Time
// Schedule & Kurva S existing) -- Grup Proyek/Nama Proyek/Blok/No. Unit
// dipakai persis sama seperti tab lain utk hitung unitKey (Addendum 6:
// referensi jadwal per UNIT langsung via Blok, bukan lewat "Tipe Unit").
// Addendum 8: satu baris per (unit, minggu, item pekerjaan) -- persis satu
// sel M1..M16 di dokumen Kurva S, BUKAN satu baris per minggu lagi (bisa
// lebih dari satu item aktif di minggu yang sama). `rencanaProgres` =
// bobot mingguan ITEM ini saja (header sheet "Bobot (%)"); total rencana
// mingguan unit itu = jumlah `rencanaProgres` semua baris minggu yang
// sama (lihat aggregateRencanaByWeek_ di JavaScript.html).
var PROGRESS_RENCANA_FIELD_DEFS = [
  { key: 'grupProyek', candidates: ['grup proyek'] },
  { key: 'namaProyek', candidates: ['nama proyek'] },
  { key: 'blokUnit', candidates: ['blok no unit area kerja', 'blok no unit', 'blok unit', 'no unit'] },
  { key: 'mingguKe', candidates: ['minggu ke', 'minggu'] },
  { key: 'uraianPekerjaan', candidates: ['uraian pekerjaan', 'uraian'] },
  { key: 'rencanaProgres', candidates: ['bobot %', 'bobot', 'rencana progres mingguan', 'rencana progres', 'rencana'] }
];

// Realisasi Progres: diisi SPV Lapangan lewat halaman "Input Progres"
// tersendiri di dashboard (bukan modal Detail per Unit lagi, lihat
// Addendum 7), satu baris baru tiap minggu -- agregat % keseluruhan
// (bukan per item pekerjaan), wajib dilampiri minimal 4 foto (kolom
// "Lampiran Foto", URL Drive dipisah ", " -- lihat uploadProgressPhotos_
// di DataService.gs).
var PROGRESS_REALISASI_FIELD_DEFS = [
  { key: 'grupProyek', candidates: ['grup proyek'] },
  { key: 'namaProyek', candidates: ['nama proyek'] },
  { key: 'blokUnit', candidates: ['blok no unit area kerja', 'blok no unit', 'blok unit', 'no unit'] },
  { key: 'mingguKe', candidates: ['minggu ke', 'minggu'] },
  { key: 'tanggalUpdate', candidates: ['tanggal update', 'tanggal'] },
  { key: 'realisasiProgres', candidates: ['realisasi progres mingguan', 'realisasi progres', 'realisasi'] },
  { key: 'keterangan', candidates: ['keterangan'] },
  { key: 'lampiranFoto', candidates: ['lampiran foto', 'foto'] }
];

// Status yang valid, dipakai untuk validasi ringan & urutan tampilan di UI
var HOME_WITH_AI_STATUSES = ['Belum Order', 'On Proses', 'Terpasang'];
var PURCHASING_MATERIAL_STATUSES = ['Belum Order', 'On Proses', 'Sudah Order'];
var PURCHASING_PROMO_STATUSES = ['Belum Terpasang', 'On Proses', 'Terpasang'];
var JENIS_PENGADAAN = ['Promo Unit', 'Material PSU', 'Material Unit Bangunan'];
