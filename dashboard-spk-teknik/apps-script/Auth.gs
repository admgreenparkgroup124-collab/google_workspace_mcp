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
