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

  // Jenis SPK yang Tanggal Selesai-nya otomatis dihitung (Tanggal Terbit + 5 bulan)
  UNIT_RUMAH_JENIS_SPK: 'UNIT RUMAH',
  UNIT_RUMAH_OVERDUE_MONTHS: 5
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
  { key: 'lampiran', candidates: ['lampiran'] }
];

var HOME_WITH_AI_FIELD_DEFS = [
  { key: 'grupProyek', candidates: ['grup proyek'] },
  { key: 'namaProyek', candidates: ['nama proyek'] },
  { key: 'blokUnit', candidates: ['blok no unit area kerja', 'blok no unit', 'blok unit', 'no unit'] },
  { key: 'status', candidates: ['status'] },
  { key: 'nilai', candidates: ['nilai rp', 'nilai'] },
  { key: 'tanggalTerpasang', candidates: ['tanggal terpasang'] },
  { key: 'keterangan', candidates: ['keterangan'] }
];

var PURCHASING_FIELD_DEFS = [
  { key: 'grupProyek', candidates: ['grup proyek'] },
  { key: 'namaProyek', candidates: ['nama proyek'] },
  { key: 'blokUnit', candidates: ['blok no unit area kerja', 'blok no unit', 'blok unit', 'no unit'] },
  { key: 'jenisPengadaan', candidates: ['jenis pengadaan'] },
  { key: 'namaBarang', candidates: ['nama barang item', 'nama barang'] },
  { key: 'nilai', candidates: ['nilai rp', 'nilai'] },
  { key: 'statusPekerjaan', candidates: ['status pekerjaan'] },
  { key: 'tanggal', candidates: ['tanggal'] },
  { key: 'keterangan', candidates: ['keterangan'] }
];

var ACCESS_FIELD_DEFS = [
  { key: 'email', candidates: ['email', 'alamat email', 'email address'] },
  { key: 'nama', candidates: ['nama', 'nama lengkap'] }
];

// Status yang valid, dipakai untuk validasi ringan & urutan tampilan di UI
var HOME_WITH_AI_STATUSES = ['Belum Order', 'On Proses', 'Terpasang'];
var PURCHASING_MATERIAL_STATUSES = ['Belum Order', 'On Proses', 'Sudah Order'];
var PURCHASING_PROMO_STATUSES = ['Belum Terpasang', 'On Proses', 'Terpasang'];
var JENIS_PENGADAAN = ['Promo Unit', 'Material PSU', 'Material Unit Bangunan'];
