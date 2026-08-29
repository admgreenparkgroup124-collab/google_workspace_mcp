/**
 * Helper murni (tidak menyentuh Spreadsheet/Session) yang dipakai
 * DataService.gs dan Auth.gs. Dipisah supaya gampang ditelusuri /
 * di-reasoning tanpa perlu menjalankan Apps Script.
 */

// Ratakan teks header supaya "Blok / No. Unit / Area Kerja" dan
// "Blok/No. Unit" bisa dicocokkan ke field logis yang sama.
function normalizeHeader(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Petakan { key -> index kolom } dari satu baris header, berdasar daftar
// definisi field { key, candidates[] } dari Config.gs. Kalau tidak
// ketemu exact match, coba fallback "header dimulai dengan kandidat utama"
// supaya tahan sedikit variasi penulisan. Kalau tetap tidak ketemu,
// indexnya -1 (dipegang aman oleh pemanggil, bukan error keras).
function buildHeaderMap(headerRow, fieldDefs) {
  var normalizedHeaders = headerRow.map(normalizeHeader);
  var map = {};
  fieldDefs.forEach(function (def) {
    var foundIndex = -1;
    for (var c = 0; c < def.candidates.length && foundIndex === -1; c++) {
      var candidate = def.candidates[c];
      foundIndex = normalizedHeaders.indexOf(candidate);
    }
    if (foundIndex === -1) {
      var primary = def.candidates[0];
      for (var i = 0; i < normalizedHeaders.length; i++) {
        if (normalizedHeaders[i] && normalizedHeaders[i].indexOf(primary) === 0) {
          foundIndex = i;
          break;
        }
      }
    }
    map[def.key] = foundIndex;
  });
  return map;
}

function cellValue(row, headerMap, key) {
  var idx = headerMap[key];
  if (idx === undefined || idx < 0) return '';
  var v = row[idx];
  return v === null || v === undefined ? '' : v;
}

// Kunci join yang agresif dinormalisasi (buang semua spasi, uppercase)
// supaya "GP1" vs "GP 2" vs "gp1 " semua konsisten -- lihat temuan
// inkonsistensi penulisan GP di data riil (lihat README/plan).
function normalizeKey(str) {
  return String(str || '').trim().toUpperCase().replace(/\s+/g, '');
}

function makeUnitKey(grupProyek, namaProyek, blokUnit) {
  return normalizeKey(grupProyek) + '|' + normalizeKey(namaProyek) + '|' + normalizeKey(blokUnit);
}

function makeProjectKey(grupProyek, namaProyek) {
  return normalizeKey(grupProyek) + '|' + normalizeKey(namaProyek);
}

function safeNumber(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (!v) return 0;
  var n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function safeText(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

// Terima Date object (umum, karena getValues() otomatis mengembalikan Date
// untuk sel berformat tanggal) atau string; kembalikan Date atau null.
function parseDateCell(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'string' && v.trim()) {
    var d = new Date(v.trim());
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// Tambah N bulan ke sebuah Date secara aman (tidak overflow ke bulan
// berikutnya kalau tanggal asal >28, mis. 31 Jan + 1 bulan -> 28/29 Feb,
// bukan 3 Mar seperti bug umum pakai setMonth() naif).
function addMonths(date, months) {
  var d = new Date(date.getTime());
  var day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  var lastDayOfNewMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDayOfNewMonth));
  return d;
}

// Tambah N hari ke sebuah Date (dipakai untuk hitung target SLA).
function addDays(date, days) {
  var d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function toIsoDateString(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  var y = date.getFullYear();
  var m = ('0' + (date.getMonth() + 1)).slice(-2);
  var d = ('0' + date.getDate()).slice(-2);
  return y + '-' + m + '-' + d;
}

function formatRupiah(n) {
  var num = Math.round(Number(n) || 0);
  var neg = num < 0;
  num = Math.abs(num);
  var s = String(num);
  var out = '';
  while (s.length > 3) {
    out = '.' + s.slice(-3) + out;
    s = s.slice(0, -3);
  }
  out = s + out;
  return (neg ? '-' : '') + 'Rp ' + out;
}
