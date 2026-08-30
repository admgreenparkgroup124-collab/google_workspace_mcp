/**
 * Kontrol akses berbasis email akun Google yang sedang login (PRD Bagian
 * 8a) -- karena file ini milik akun Gmail biasa (bukan Workspace domain),
 * kita tidak bisa membatasi lewat "siapapun di domain @greenparkgroup".
 * Sebagai gantinya, doGet() di Code.gs memanggil checkAccess() dan hanya
 * merender dashboard kalau email yang login ada di tab "Akses".
 */

function checkAccess() {
  var email = '';
  try {
    email = Session.getActiveUser().getEmail() || '';
  } catch (e) {
    email = '';
  }
  email = email.toLowerCase().trim();

  if (!email) {
    return { allowed: false, email: '' };
  }

  var allowedEmails = getAllowedEmails_();
  return { allowed: allowedEmails.indexOf(email) !== -1, email: email };
}

function getAllowedEmails_() {
  var sheet = getSpreadsheet().getSheetByName(CONFIG.ACCESS_TAB);
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headerMap = buildHeaderMap(values[0], ACCESS_FIELD_DEFS);
  var emailCol = headerMap.email >= 0 ? headerMap.email : 0;

  var emails = [];
  for (var i = 1; i < values.length; i++) {
    var raw = safeText(values[i][emailCol]);
    if (raw) emails.push(raw.toLowerCase());
  }
  return emails;
}

// Scope tulis-balik SLA milik satu email, dibaca dari kolom "Role" di tab
// Akses (dipisah koma, mis. "SPK:GP1,SPK:GP2,SPK:GP4"). Baris lama tanpa
// kolom Role atau nilai kosong -> array kosong (viewer, tidak bisa edit
// apapun) -- non-breaking terhadap data Akses yang sudah ada.
function getUserScopes_(email) {
  var normalizedEmail = String(email || '').toLowerCase().trim();
  if (!normalizedEmail) return [];

  var sheet = getSpreadsheet().getSheetByName(CONFIG.ACCESS_TAB);
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headerMap = buildHeaderMap(values[0], ACCESS_FIELD_DEFS);
  var emailCol = headerMap.email >= 0 ? headerMap.email : 0;

  for (var i = 1; i < values.length; i++) {
    var rowEmail = safeText(values[i][emailCol]).toLowerCase();
    if (rowEmail !== normalizedEmail) continue;
    var roleRaw = safeText(cellValue(values[i], headerMap, 'role'));
    if (!roleRaw) return [];
    return roleRaw.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return !!s; });
  }
  return [];
}

// Sama seperti canEditSla_ tapi terima `scopes` yang sudah diambil
// sebelumnya (lihat getUserScopes_) -- dipakai DataService.gs saat
// membangun banyak baris sekaligus, supaya tidak baca ulang tab Akses
// per baris. recordType: 'spk' | 'purchasing' | 'homeWithAi' |
// 'progresRealisasi'. gp dipakai utk recordType yang scope-nya per GP
// ('spk' -> "SPK:GP1", 'progresRealisasi' -> "SPV:GP1"); diabaikan utk
// 'purchasing'/'homeWithAi' (scope-nya "Purchasing"/"HomeWithAi" saja).
function hasScope_(scopes, recordType, gp) {
  if (!scopes || !scopes.length) return false;

  if (recordType === 'spk') {
    var wantedScope = 'SPK:' + normalizeKey(gp);
    return scopes.some(function (s) { return normalizeKey(s) === wantedScope; });
  }
  if (recordType === 'purchasing') {
    return scopes.some(function (s) { return normalizeKey(s) === 'PURCHASING'; });
  }
  if (recordType === 'homeWithAi') {
    return scopes.some(function (s) { return normalizeKey(s) === 'HOMEWITHAI'; });
  }
  // Progres konstruksi mingguan (Addendum 7) = tanggung jawab SPV
  // Lapangan per GP, role terpisah dari PIC SPK ("SPV:GP1" dst di
  // kolom Role tab Akses) -- BUKAN lagi scope 'spk' seperti versi
  // Addendum 6 sebelumnya.
  if (recordType === 'progresRealisasi') {
    var wantedSpvScope = 'SPV:' + normalizeKey(gp);
    return scopes.some(function (s) { return normalizeKey(s) === wantedSpvScope; });
  }
  return false;
}

// recordType: 'spk' | 'purchasing' | 'homeWithAi' | 'progresRealisasi'.
// Dipakai saat mengecek satu permintaan tulis-balik tunggal
// (updateSlaTargetHari/addRecord/addProgressRealisasi di Code.gs).
function canEditSla_(email, recordType, gp) {
  return hasScope_(getUserScopes_(email), recordType, gp);
}
