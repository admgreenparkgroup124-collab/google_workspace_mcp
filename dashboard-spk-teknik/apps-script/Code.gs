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
    .setTitle('Dashboard Monitoring SPK & PO - Green Park Group')
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

  if (['spk', 'purchasing', 'homeWithAi'].indexOf(recordType) === -1) {
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
// sengaja minimal (Nama Proyek terisi, field tanggal utama terisi, field
// nilai numerik valid) -- cukup untuk mencegah baris kosong/rusak, bukan
// validasi bisnis penuh (itu tanggung jawab PIC saat mengisi).
function addRecord(payload) {
  var access = checkAccess();
  if (!access.allowed) {
    throw new Error('Akses ditolak. Email ' + (access.email || '(tidak terdeteksi)') + ' belum terdaftar di tab Akses.');
  }

  payload = payload || {};
  var recordType = payload.recordType;
  var gp = payload.gp;
  var fields = payload.fields || {};

  if (['spk', 'purchasing', 'homeWithAi'].indexOf(recordType) === -1) {
    throw new Error('recordType tidak valid.');
  }
  if (!canEditSla_(access.email, recordType, gp)) {
    throw new Error('Anda tidak berwenang menambah data ini.');
  }
  if (!safeText(fields.namaProyek)) {
    throw new Error('Nama Proyek tidak boleh kosong.');
  }

  var mainDateKey = recordType === 'spk' ? 'tanggalTerbit' : 'tanggalMulai';
  if (!safeText(fields[mainDateKey])) {
    throw new Error((recordType === 'spk' ? 'Tanggal Terbit' : 'Tanggal Order/Mulai') + ' tidak boleh kosong.');
  }

  var mainValueKey = recordType === 'spk' ? 'nilaiKontrak' : 'nilai';
  var mainValue = Number(fields[mainValueKey]);
  if (!isFinite(mainValue) || mainValue < 0) {
    throw new Error((recordType === 'spk' ? 'Nilai Kontrak' : 'Harga Total') + ' harus berupa angka >= 0.');
  }

  writeNewRecord_(recordType, gp, fields);
  return buildDashboardPayload_(access.email);
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
