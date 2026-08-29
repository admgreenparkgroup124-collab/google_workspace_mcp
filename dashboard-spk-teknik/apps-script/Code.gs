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
  return buildDashboardPayload_();
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
