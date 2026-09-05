/**
 * Entry point Web App. doGet() mengecek akses (Auth.gs) lalu merender
 * Index.html; getDashboardData() dipanggil dari client lewat
 * google.script.run untuk mengambil data gabungan (DataService.gs).
 */

function doGet(e) {
  var access = checkAccess();

  if (!access.allowed) {
    return HtmlService.createHtmlOutput(renderAccessDeniedHtml_(access.email))
      .setTitle('Akses Ditolak - Dashboard Teknik GPG');
  }

  var template = HtmlService.createTemplateFromFile('Index');
  template.userEmail = access.email;

  return template.evaluate()
    .setTitle('Dashboard Monitoring SPK, Purchasing, & Home With AI - Green Park Group')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Dipakai Index.html untuk menyisipkan Styles.html / JavaScript.html
// (pola standar HtmlService untuk "include" partial).
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Dipanggil client via google.script.run.getDashboardData(). Cek akses
// lagi di sini (defense-in-depth) supaya tidak mengandalkan hanya
// pengecekan saat render halaman.
function getDashboardData() {
  var access = checkAccess();
  if (!access.allowed) {
    throw new Error('Akses ditolak. Email ' + (access.email || '(tidak terdeteksi)') + ' belum terdaftar di tab Akses.');
  }
  return buildDashboardPayload_(access.email);
}

// Dipanggil client dari halaman Master Data SLA saat PIC mengedit "Target
// Hari" langsung di dashboard. payload: { recordType, id, gp, targetHari }.
// Setelah tulis berhasil, kembalikan payload dashboard yang sudah
// di-refresh penuh supaya client tinggal ganti rawData & render ulang
// (tidak perlu logic partial-update terpisah di frontend).
function updateSlaTargetHari(payload) {
  var access = checkAccess();
  if (!access.allowed) {
    throw new Error('Akses ditolak. Email ' + (access.email || '(tidak terdeteksi)') + ' belum terdaftar di tab Akses.');
  }

  payload = payload || {};
  var recordType = payload.recordType;
  var id = payload.id;
  var gp = payload.gp;
  var targetHari = Number(payload.targetHari);

  if (['spk', 'purchasing', 'homeWithAi', 'pembelianWifi'].indexOf(recordType) === -1) {
    throw new Error('recordType tidak valid.');
  }
  if (!id) {
    throw new Error('id baris tidak boleh kosong.');
  }
  if (!isFinite(targetHari) || targetHari < 0) {
    throw new Error('Target Hari harus berupa angka >= 0.');
  }
  if (!canEditSla_(access.email, recordType, gp)) {
    throw new Error('Anda tidak berwenang mengubah Target Hari SLA untuk data ini.');
  }

  writeTargetHariSla_(recordType, id, targetHari);
  return buildDashboardPayload_(access.email);
}

// Dipanggil client dari tombol "+ Tambah Data" di halaman Master Data
// SPK/Purchasing/Home With AI. payload: { recordType, gp, fields }. Pola
// sama dengan updateSlaTargetHari: cek akses+scope, tulis, kembalikan
// payload dashboard yang sudah di-refresh penuh. Validasi di sini
// sengaja minimal -- cukup untuk mencegah baris kosong/rusak, bukan
// validasi bisnis penuh (itu tanggung jawab PIC saat mengisi).
//
// Progres konstruksi mingguan (recordType 'progresRealisasi') TIDAK
// lewat endpoint ini lagi -- lihat addProgressRealisasi() di bawah,
// endpoint terpisah karena payload-nya bawa foto (upload ke Drive) dan
// scope-nya beda (SPV Lapangan, bukan PIC SPK/Purchasing/HWA).
// Field "utama" (tanggal & nilai) yang wajib diisi per recordType --
// dipakai addRecord() di bawah. Sengaja jadi lookup table (bukan ternary
// spk-vs-lainnya seperti sebelumnya) supaya menambah recordType baru
// (Addendum 9: 'pembelianWifi') tidak perlu mengubah logic validasi,
// cukup tambah satu entri; perilaku utk spk/purchasing/homeWithAi yang
// sudah ada TIDAK berubah (pesan error & field yang dicek persis sama).
var RECORD_TYPE_MAIN_FIELDS_ = {
  spk: { dateKey: 'tanggalTerbit', dateLabel: 'Tanggal Terbit', valueKey: 'nilaiKontrak', valueLabel: 'Nilai Kontrak' },
  purchasing: { dateKey: 'tanggalMulai', dateLabel: 'Tanggal Order/Mulai', valueKey: 'nilai', valueLabel: 'Harga Total' },
  homeWithAi: { dateKey: 'tanggalMulai', dateLabel: 'Tanggal Order/Mulai', valueKey: 'nilai', valueLabel: 'Harga Total' },
  pembelianWifi: { dateKey: 'tanggalAktivasi', dateLabel: 'Tanggal Aktivasi', valueKey: 'biayaBundling', valueLabel: 'Biaya Bundling' }
};

function addRecord(payload) {
  var access = checkAccess();
  if (!access.allowed) {
    throw new Error('Akses ditolak. Email ' + (access.email || '(tidak terdeteksi)') + ' belum terdaftar di tab Akses.');
  }

  payload = payload || {};
  var recordType = payload.recordType;
  var gp = payload.gp;
  var fields = payload.fields || {};

  var mainFields = RECORD_TYPE_MAIN_FIELDS_[recordType];
  if (!mainFields) {
    throw new Error('recordType tidak valid.');
  }

  if (!canEditSla_(access.email, recordType, gp)) {
    throw new Error('Anda tidak berwenang menambah data ini.');
  }

  if (!safeText(fields.namaProyek)) {
    throw new Error('Nama Proyek tidak boleh kosong.');
  }

  if (!safeText(fields[mainFields.dateKey])) {
    throw new Error(mainFields.dateLabel + ' tidak boleh kosong.');
  }

  var mainValue = Number(fields[mainFields.valueKey]);
  if (!isFinite(mainValue) || mainValue < 0) {
    throw new Error(mainFields.valueLabel + ' harus berupa angka >= 0.');
  }

  writeNewRecord_(recordType, gp, fields);
  return buildDashboardPayload_(access.email);
}

// Dipanggil client dari halaman "Input Progres" (SPV Lapangan) -- klik
// satu unit yang sudah ada SPK, isi progres minggu ini + upload minimal
// 4 foto. payload: { gp, proyek, unit, mingguKe, realisasiProgres,
// keterangan, photos: [{name, mimeType, base64}, ...] }. Alur: cek
// akses -> validasi field & jumlah foto -> cek scope SPV:<gp> -> upload
// foto ke Drive -> tulis baris baru -> kembalikan payload yang sudah
// di-refresh penuh (pola sama dengan addRecord/updateSlaTargetHari).
function addProgressRealisasi(payload) {
  var access = checkAccess();
  if (!access.allowed) {
    throw new Error('Akses ditolak. Email ' + (access.email || '(tidak terdeteksi)') + ' belum terdaftar di tab Akses.');
  }

  payload = payload || {};
  var gp = payload.gp;
  var proyek = safeText(payload.proyek);
  var unit = safeText(payload.unit);
  var photos = payload.photos || [];

  if (!proyek || !unit) {
    throw new Error('Data unit (Proyek/Blok) tidak boleh kosong.');
  }

  var mingguKe = Number(payload.mingguKe);
  if (!isFinite(mingguKe) || mingguKe < 1) {
    throw new Error('Minggu Ke- harus berupa angka >= 1.');
  }
  var realisasiProgres = Number(payload.realisasiProgres);
  if (!isFinite(realisasiProgres) || realisasiProgres < 0 || realisasiProgres > 100) {
    throw new Error('Realisasi Progres harus berupa angka 0-100.');
  }
  if (!photos.length || photos.length < 4) {
    throw new Error('Lampirkan minimal 4 foto progres minggu ini.');
  }

  if (!canEditSla_(access.email, 'progresRealisasi', gp)) {
    throw new Error('Anda tidak berwenang menginput progres konstruksi untuk GP ini.');
  }

  var photoUrls = uploadProgressPhotos_(photos);

  writeNewRecord_('progresRealisasi', gp, {
    grupProyek: gp,
    namaProyek: proyek,
    blokUnit: unit,
    mingguKe: mingguKe,
    realisasiProgres: realisasiProgres,
    tanggalUpdate: toIsoDateString(new Date()),
    keterangan: safeText(payload.keterangan),
    lampiranFoto: photoUrls.join(', ')
  });

  return buildDashboardPayload_(access.email);
}

// Master Opsi (Addendum 26, menu "Master Opsi" di sidebar) -- daftar
// nilai dropdown yang dipakai bersama di form Tambah Data & filter
// (Jenis SPK, Item SPK, Kategori Home With AI, Jenis Pengadaan, Status
// Home With AI, Status Pekerjaan Purchasing). Beda dari Target Hari
// SLA/Tambah Data lainnya: TIDAK dibatasi scope Role -- siapapun yang
// login boleh menambah/menghapus (ini pengaturan bersama, bukan data
// transaksi per-PIC). payload: { tipe, nilai }.
function addMasterOpsi(payload) {
  var access = checkAccess();
  if (!access.allowed) {
    throw new Error('Akses ditolak. Email ' + (access.email || '(tidak terdeteksi)') + ' belum terdaftar di tab Akses.');
  }

  payload = payload || {};
  var tipe = safeText(payload.tipe);
  var nilai = safeText(payload.nilai);

  if (MASTER_OPSI_TIPE_LIST.indexOf(tipe) === -1) {
    throw new Error('Tipe opsi tidak dikenal: ' + tipe);
  }
  if (!nilai) {
    throw new Error('Nilai tidak boleh kosong.');
  }

  var existing = getMasterOpsiRows_();
  var duplicate = existing.some(function (r) {
    return r.tipe === tipe && r.nilai.trim().toLowerCase() === nilai.trim().toLowerCase();
  });
  if (duplicate) {
    throw new Error('Nilai "' + nilai + '" sudah ada di daftar ini.');
  }

  writeNewRecord_('masterOpsi', null, { tipe: tipe, nilai: nilai });
  return buildDashboardPayload_(access.email);
}

// Dipanggil dari halaman Master Opsi saat menghapus satu baris nilai.
// payload: { id } -- id mengkodekan nomor baris fisik di tab "Master
// Opsi" (lihat getMasterOpsiRows_/deleteMasterOpsiRow_).
function deleteMasterOpsi(payload) {
  var access = checkAccess();
  if (!access.allowed) {
    throw new Error('Akses ditolak. Email ' + (access.email || '(tidak terdeteksi)') + ' belum terdaftar di tab Akses.');
  }

  payload = payload || {};
  if (!payload.id) {
    throw new Error('id tidak boleh kosong.');
  }

  deleteMasterOpsiRow_(payload.id);
  return buildDashboardPayload_(access.email);
}

// ---------------------------------------------------------------------
// Backfill Rencana Kerja Template Unit Rumah (Addendum 31) -- JALANKAN
// SEKALI SECARA MANUAL dari editor Apps Script (pilih fungsi ini di
// dropdown "Run" toolbar, klik Run) untuk mengisi Rencana Progres bagi
// unit UNIT RUMAH yang SPK-nya sudah ada SEBELUM Addendum 31 tapi belum
// punya baris Rencana sama sekali (mis. diinput manual langsung ke sheet
// GP1-4, bukan lewat "+ Tambah Data"). Unit yang SUDAH punya Rencana
// (manual atau otomatis) TIDAK disentuh/ditimpa. Setelah dijalankan, cek
// ringkasannya di View > Logs (Executions) pada editor Apps Script.
// ---------------------------------------------------------------------
function backfillUnitRumahRencanaTemplate() {
  var seen = {};
  var filled = [];
  var skipped = 0;

  CONFIG.SPK_TABS.forEach(function (tabName) {
    var sheet = getSpreadsheet().getSheetByName(tabName);
    if (!sheet) return;
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return;
    var headerMap = buildHeaderMap(values[0], SPK_FIELD_DEFS);

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var gp = safeText(cellValue(row, headerMap, 'grupProyek'));
      var proyek = safeText(cellValue(row, headerMap, 'namaProyek'));
      var unit = safeText(cellValue(row, headerMap, 'blokUnit'));
      var jenisSpk = safeText(cellValue(row, headerMap, 'jenisSpk'));
      if (!unit || jenisSpk.toUpperCase() !== CONFIG.UNIT_RUMAH_JENIS_SPK) continue;

      var unitKey = makeUnitKey(gp, proyek, unit);
      if (seen[unitKey]) continue;
      seen[unitKey] = true;

      if (hasRencanaForUnit_(unitKey)) { skipped++; continue; }

      writeRencanaTemplateForUnit_(gp, proyek, unit);
      filled.push(gp + ' | ' + proyek + ' | ' + unit);
    }
  });

  Logger.log('Rencana Kerja template ditulis untuk ' + filled.length + ' unit:');
  filled.forEach(function (u) { Logger.log('  - ' + u); });
  Logger.log(skipped + ' unit dilewati (sudah punya Rencana).');
  return filled.length + ' unit diisi, ' + skipped + ' dilewati (sudah ada Rencana).';
}

function renderAccessDeniedHtml_(email) {
  var safeEmail = email ? String(email).replace(/[<>&]/g, '') : '(tidak terdeteksi)';
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Akses Ditolak</title>' +
    '<style>' +
    'body{font-family:Arial,Helvetica,sans-serif;background:#f4f6f8;color:#1f2d3d;' +
    'display:flex;align-items:center;justify-content:center;height:100vh;margin:0}' +
    '.box{background:#fff;padding:32px 40px;border-radius:8px;' +
    'box-shadow:0 2px 10px rgba(0,0,0,.08);max-width:420px;text-align:center}' +
    'h1{font-size:18px;color:#b3261e;margin:0 0 8px}' +
    'p{font-size:14px;line-height:1.5;color:#4a5568;margin:6px 0}' +
    '</style></head><body><div class="box">' +
    '<h1>Akses Ditolak</h1>' +
    '<p>Email <strong>' + safeEmail + '</strong> belum terdaftar sebagai pengguna dashboard ini.</p>' +
    '<p>Hubungi admin (pemilik spreadsheet) untuk ditambahkan ke tab <strong>Akses</strong>.</p>' +
    '</div></body></html>';
}
