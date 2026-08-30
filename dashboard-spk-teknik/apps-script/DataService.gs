/**
 * Baca & normalisasi data dari 6 tab (GP1-GP4 SPK, Home With AI,
 * Purchasing), lalu satukan jadi satu payload JSON datar untuk dashboard.
 *
 * Desain: tiap record diberi `unitKey`/`projectKey` yang sudah dinormalisasi
 * secara identik (lihat makeUnitKey/makeProjectKey di Utils.gs). Karena
 * kunci itu konsisten lintas ketiga sumber, client cukup filter array
 * datar berdasarkan key yang sama untuk dapat "Detail per Unit" gabungan
 * -- tidak perlu struktur index bersarang terpisah yang harus dijaga
 * sinkron dengan array aslinya.
 */

function buildDashboardPayload_(requestingEmail) {
  // Bandingkan per-tanggal (bukan timestamp persis) supaya unit yang jatuh
  // tempo HARI INI belum dianggap overdue -- baru overdue mulai besoknya,
  // sesuai PRD ("begitu tanggal hari ini melewati Tanggal Selesai").
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var scopes = getUserScopes_(requestingEmail);

  var spk = getSpkRows_(today, scopes);
  var homeWithAi = getHomeWithAiRows_(today, scopes);
  var purchasing = getPurchasingRows_(today, scopes);
  var progressRencana = getProgressRencanaRows_();
  var progressRealisasi = getProgressRealisasiRows_(scopes);

  var meta = buildMeta_(spk, homeWithAi, purchasing);
  // Scope mentah viewer sendiri (mis. ['SPK:GP1','SPK:GP2','SPK:GP4']) --
  // dipakai client utk memutuskan tombol "+ Tambah Data" mana yang
  // ditampilkan, tanpa perlu endpoint terpisah.
  meta.viewerScopes = scopes;

  return {
    generatedAt: new Date().toISOString(),
    spk: spk,
    homeWithAi: homeWithAi,
    purchasing: purchasing,
    progressRencana: progressRencana,
    progressRealisasi: progressRealisasi,
    meta: meta
  };
}

// ---------------------------------------------------------------------
// SLA -- "Target Hari" diinput manual per baris langsung dari dashboard
// (kolom "Target Hari (SLA)" di tiap tab sumber, lihat writeTargetHariSla_
// di bawah), BUKAN lookup dari kategori/jenis. Murni tambahan: tidak
// mengubah isOverdue/alert overdue SPK Unit Rumah yang sudah ada (lihat
// komentar di getSpkRows_).
// ---------------------------------------------------------------------

// startDate: Date atau null. manualTargetHari: angka hasil input manual
// PIC di baris itu, atau null kalau belum diisi. done: proses sudah
// dianggap selesai (SLA berhenti dihitung, tidak overdue).
// fallbackTargetHari: dipakai HANYA kalau manualTargetHari belum diisi
// (khusus SPK Unit Rumah, supaya tetap ada target walau PIC belum
// input Target Hari sama sekali).
function computeSla_(startDate, manualTargetHari, done, today, fallbackTargetHari) {
  var targetHari = (manualTargetHari != null) ? manualTargetHari : null;
  if (targetHari === null && fallbackTargetHari != null) targetHari = fallbackTargetHari;

  var targetDate = (startDate && targetHari !== null) ? addDays(startDate, targetHari) : null;
  var elapsedHari = startDate ? Math.floor((today.getTime() - startDate.getTime()) / 86400000) : null;
  var overdue = !!(targetDate && !done && today.getTime() > targetDate.getTime());

  return {
    slaTargetHari: targetHari,
    slaStartDate: toIsoDateString(startDate),
    slaTargetDate: toIsoDateString(targetDate),
    slaDone: !!done,
    slaOverdue: overdue,
    slaElapsedHari: elapsedHari
  };
}

// Tulis balik nilai Target Hari (SLA) manual ke sel yang tepat. `id`
// sudah mengkodekan lokasi fisik baris (mis. "GP1-12", "PUR-5", "HWA-3"
// -- lihat getSpkRows_/getPurchasingRows_/getHomeWithAiRows_), jadi cukup
// di-parse untuk tahu tab & nomor baris, tanpa perlu index terpisah.
function writeTargetHariSla_(recordType, id, value) {
  var tabName, fieldDefs;
  if (recordType === 'spk') {
    var dashIdx = String(id).lastIndexOf('-');
    tabName = String(id).substring(0, dashIdx);
    fieldDefs = SPK_FIELD_DEFS;
  } else if (recordType === 'purchasing') {
    tabName = CONFIG.PURCHASING_TAB;
    fieldDefs = PURCHASING_FIELD_DEFS;
  } else if (recordType === 'homeWithAi') {
    tabName = CONFIG.HOME_WITH_AI_TAB;
    fieldDefs = HOME_WITH_AI_FIELD_DEFS;
  } else {
    throw new Error('recordType tidak dikenal: ' + recordType);
  }

  var rowNumber = Number(String(id).substring(String(id).lastIndexOf('-') + 1));
  if (!rowNumber || rowNumber < 2) throw new Error('id baris tidak valid: ' + id);

  var sheet = getSpreadsheet().getSheetByName(tabName);
  if (!sheet) throw new Error('Tab tidak ditemukan: ' + tabName);

  var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var headerMap = buildHeaderMap(headerRow, fieldDefs);
  var col = headerMap.targetHariSla;
  if (col === undefined || col < 0) {
    throw new Error('Kolom "Target Hari (SLA)" belum ada di tab ' + tabName + '. Tambahkan kolomnya dulu (lihat README).');
  }

  sheet.getRange(rowNumber, col + 1).setValue(value);
}

// ---------------------------------------------------------------------
// "Tambah Data" -- input baris baru langsung dari dashboard (Addendum 5.A).
// Sama seperti writeTargetHariSla_ di atas: satu-satunya jalur tulis
// selain input manual di Sheets, dibatasi ketat lewat canEditSla_ (dicek
// di Code.gs sebelum fungsi ini dipanggil).
// ---------------------------------------------------------------------

// recordType: 'spk'|'purchasing'|'homeWithAi'. gp: nama tab GP1-4 (wajib
// utk spk, menentukan tab tujuan; diabaikan utk purchasing/homeWithAi
// krn tabnya tunggal). fields: object { fieldKey: value, ... } sesuai key
// di *_FIELD_DEFS Config.gs. Menulis SATU baris baru di akhir sheet
// dengan SATU panggilan setValues (bukan per-sel) supaya atomik & cepat.
function writeNewRecord_(recordType, gp, fields) {
  var tabName, fieldDefs;
  if (recordType === 'spk') {
    if (CONFIG.SPK_TABS.indexOf(gp) === -1) throw new Error('GP tidak valid: ' + gp);
    tabName = gp;
    fieldDefs = SPK_FIELD_DEFS;
    fields.grupProyek = gp; // pastikan kolom Grup Proyek konsisten dgn tab tujuan
  } else if (recordType === 'purchasing') {
    tabName = CONFIG.PURCHASING_TAB;
    fieldDefs = PURCHASING_FIELD_DEFS;
  } else if (recordType === 'homeWithAi') {
    tabName = CONFIG.HOME_WITH_AI_TAB;
    fieldDefs = HOME_WITH_AI_FIELD_DEFS;
  } else if (recordType === 'progresRealisasi') {
    tabName = CONFIG.PROGRESS_REALISASI_TAB;
    fieldDefs = PROGRESS_REALISASI_FIELD_DEFS;
  } else {
    throw new Error('recordType tidak dikenal: ' + recordType);
  }

  var sheet = getSpreadsheet().getSheetByName(tabName);
  if (!sheet) throw new Error('Tab tidak ditemukan: ' + tabName);

  var width = sheet.getLastColumn();
  var headerRow = sheet.getRange(1, 1, 1, width).getValues()[0];
  var headerMap = buildHeaderMap(headerRow, fieldDefs);

  var row = new Array(width).fill('');
  fieldDefs.forEach(function (def) {
    var col = headerMap[def.key];
    if (col === undefined || col < 0) return; // kolom tidak ada di sheet ini, lewati
    var value = fields[def.key];
    if (value === undefined || value === null || value === '') return; // biarkan kosong, jangan tulis 0/""

    // Field tanggal (key diawali "tanggal") dikirim client sbg string
    // "YYYY-MM-DD" -- konversi ke Date lokal, pola sama dgn parseDateCell/
    // addDays yg sudah dipakai di seluruh DataService.gs.
    if (def.key.indexOf('tanggal') === 0 && typeof value === 'string') {
      var parts = value.split('-');
      if (parts.length === 3) {
        value = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      }
    }
    row[col] = value;
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, width).setValues([row]);
}

function getSpkRows_(today, scopes) {
  var rows = [];

  CONFIG.SPK_TABS.forEach(function (tabName) {
    var sheet = getSpreadsheet().getSheetByName(tabName);
    if (!sheet) return;

    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return;

    var headerMap = buildHeaderMap(values[0], SPK_FIELD_DEFS);

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var noSpk = safeText(cellValue(row, headerMap, 'noSpk'));
      var namaPekerjaan = safeText(cellValue(row, headerMap, 'namaPekerjaan'));
      var nilaiKontrakRaw = cellValue(row, headerMap, 'nilaiKontrak');
      if (!noSpk && !namaPekerjaan && !nilaiKontrakRaw) continue; // baris kosong

      var gp = safeText(cellValue(row, headerMap, 'grupProyek'));
      var proyek = safeText(cellValue(row, headerMap, 'namaProyek'));
      var unit = safeText(cellValue(row, headerMap, 'blokUnit'));
      var jenisSpk = safeText(cellValue(row, headerMap, 'jenisSpk'));

      var tanggalTerbit = parseDateCell(cellValue(row, headerMap, 'tanggalTerbit'));
      var tanggalSelesaiInput = parseDateCell(cellValue(row, headerMap, 'tanggalSelesai'));

      var isUnitRumah = jenisSpk.toUpperCase() === CONFIG.UNIT_RUMAH_JENIS_SPK;
      var tanggalSelesaiEfektif = tanggalSelesaiInput;
      if (!tanggalSelesaiEfektif && isUnitRumah && tanggalTerbit) {
        tanggalSelesaiEfektif = addMonths(tanggalTerbit, CONFIG.UNIT_RUMAH_OVERDUE_MONTHS);
      }

      var isOverdue = !!(isUnitRumah && tanggalSelesaiEfektif && tanggalSelesaiEfektif.getTime() < today.getTime());

      var nilaiKontrak = safeNumber(nilaiKontrakRaw);
      var nilaiAddendum = safeNumber(cellValue(row, headerMap, 'nilaiAddendum'));

      var targetHariRaw = safeNumber(cellValue(row, headerMap, 'targetHariSla'));
      var targetHariManual = targetHariRaw > 0 ? targetHariRaw : null;

      // SLA murni tambahan (lihat komentar di computeSla_) -- tidak
      // mengganti isOverdue/tanggalSelesaiEfektif yang sudah ada di atas.
      var sla = computeSla_(
        tanggalTerbit, targetHariManual, false, today,
        isUnitRumah ? CONFIG.UNIT_RUMAH_DEFAULT_SLA_DAYS : null
      );

      rows.push({
        id: tabName + '-' + (r + 1),
        sourceTab: tabName,
        gp: gp,
        proyek: proyek,
        unit: unit,
        unitKey: unit ? makeUnitKey(gp, proyek, unit) : '',
        projectKey: makeProjectKey(gp, proyek),
        noSpk: noSpk,
        jenisSpk: jenisSpk,
        itemSpk: safeText(cellValue(row, headerMap, 'itemSpk')),
        kontraktor: safeText(cellValue(row, headerMap, 'kontraktor')),
        subKontraktor: safeText(cellValue(row, headerMap, 'subKontraktor')),
        namaPekerjaan: namaPekerjaan,
        volume: safeNumber(cellValue(row, headerMap, 'volume')),
        satuan: safeText(cellValue(row, headerMap, 'satuan')),
        hargaPerMeter: safeNumber(cellValue(row, headerMap, 'hargaPerMeter')),
        nilaiKontrak: nilaiKontrak,
        nilaiAddendum: nilaiAddendum,
        nilaiTotal: nilaiKontrak + nilaiAddendum,
        tanggalTerbit: toIsoDateString(tanggalTerbit),
        tanggalSelesaiInput: toIsoDateString(tanggalSelesaiInput),
        tanggalSelesaiEfektif: toIsoDateString(tanggalSelesaiEfektif),
        isOverdue: isOverdue,
        picAdminTeknik: safeText(cellValue(row, headerMap, 'picAdminTeknik')),
        keterangan: safeText(cellValue(row, headerMap, 'keterangan')),
        lampiran: safeText(cellValue(row, headerMap, 'lampiran')),
        slaTargetHari: sla.slaTargetHari,
        slaStartDate: sla.slaStartDate,
        slaTargetDate: sla.slaTargetDate,
        slaDone: sla.slaDone,
        slaOverdue: sla.slaOverdue,
        slaElapsedHari: sla.slaElapsedHari,
        canEditSla: hasScope_(scopes, 'spk', gp),
        tahun: tanggalTerbit ? tanggalTerbit.getFullYear() : null,
        bulan: tanggalTerbit ? tanggalTerbit.getMonth() + 1 : null
      });
    }
  });

  return rows;
}

function getHomeWithAiRows_(today, scopes) {
  var sheet = getSpreadsheet().getSheetByName(CONFIG.HOME_WITH_AI_TAB);
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headerMap = buildHeaderMap(values[0], HOME_WITH_AI_FIELD_DEFS);
  var rows = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var gp = safeText(cellValue(row, headerMap, 'grupProyek'));
    var proyek = safeText(cellValue(row, headerMap, 'namaProyek'));
    var unit = safeText(cellValue(row, headerMap, 'blokUnit'));
    var status = safeText(cellValue(row, headerMap, 'status'));
    if (!gp && !proyek && !unit && !status) continue;

    var tanggalMulai = parseDateCell(cellValue(row, headerMap, 'tanggalMulai'));
    var tanggalTerpasang = parseDateCell(cellValue(row, headerMap, 'tanggalTerpasang'));
    var tanggalSelesai = parseDateCell(cellValue(row, headerMap, 'tanggalSelesai'));

    var done = status === 'Terpasang' || !!tanggalSelesai;
    var targetHariRaw = safeNumber(cellValue(row, headerMap, 'targetHariSla'));
    var targetHariManual = targetHariRaw > 0 ? targetHariRaw : null;
    var sla = computeSla_(tanggalMulai, targetHariManual, done, today, null);

    rows.push({
      id: 'HWA-' + (r + 1),
      gp: gp,
      proyek: proyek,
      unit: unit,
      unitKey: unit ? makeUnitKey(gp, proyek, unit) : '',
      projectKey: makeProjectKey(gp, proyek),
      status: status,
      namaVendor: safeText(cellValue(row, headerMap, 'namaVendor')),
      satuan: safeText(cellValue(row, headerMap, 'satuan')),
      hargaSatuan: safeNumber(cellValue(row, headerMap, 'hargaSatuan')),
      nilai: safeNumber(cellValue(row, headerMap, 'nilai')),
      tanggalMulai: toIsoDateString(tanggalMulai),
      tanggalTerpasang: toIsoDateString(tanggalTerpasang),
      tanggalSelesai: toIsoDateString(tanggalSelesai),
      lampiran: safeText(cellValue(row, headerMap, 'lampiran')),
      keterangan: safeText(cellValue(row, headerMap, 'keterangan')),
      slaTargetHari: sla.slaTargetHari,
      slaStartDate: sla.slaStartDate,
      slaTargetDate: sla.slaTargetDate,
      slaDone: sla.slaDone,
      slaOverdue: sla.slaOverdue,
      slaElapsedHari: sla.slaElapsedHari,
      canEditSla: hasScope_(scopes, 'homeWithAi'),
      tahun: tanggalTerpasang ? tanggalTerpasang.getFullYear() : null,
      bulan: tanggalTerpasang ? tanggalTerpasang.getMonth() + 1 : null
    });
  }

  return rows;
}

// Promo Unit dianggap selesai kalau statusnya "Terpasang"; Material PSU/
// Unit Bangunan dianggap selesai kalau "Sudah Order" (lihat PRD 6C untuk
// dua set status yang berbeda per Jenis Pengadaan).
function isPurchasingDone_(jenisPengadaan, statusPekerjaan) {
  if (jenisPengadaan === 'Promo Unit') return statusPekerjaan === 'Terpasang';
  return statusPekerjaan === 'Sudah Order';
}

function getPurchasingRows_(today, scopes) {
  var sheet = getSpreadsheet().getSheetByName(CONFIG.PURCHASING_TAB);
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headerMap = buildHeaderMap(values[0], PURCHASING_FIELD_DEFS);
  var rows = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var gp = safeText(cellValue(row, headerMap, 'grupProyek'));
    var proyek = safeText(cellValue(row, headerMap, 'namaProyek'));
    var unit = safeText(cellValue(row, headerMap, 'blokUnit')); // kosong utk Material PSU (level proyek, bukan unit)
    var namaBarang = safeText(cellValue(row, headerMap, 'namaBarang'));
    var jenisPengadaan = safeText(cellValue(row, headerMap, 'jenisPengadaan'));
    if (!gp && !proyek && !namaBarang && !jenisPengadaan) continue;

    var statusPekerjaan = safeText(cellValue(row, headerMap, 'statusPekerjaan'));
    var tanggalMulai = parseDateCell(cellValue(row, headerMap, 'tanggalMulai'));
    var tanggal = parseDateCell(cellValue(row, headerMap, 'tanggal'));

    var done = isPurchasingDone_(jenisPengadaan, statusPekerjaan);
    var targetHariRaw = safeNumber(cellValue(row, headerMap, 'targetHariSla'));
    var targetHariManual = targetHariRaw > 0 ? targetHariRaw : null;
    var sla = computeSla_(tanggalMulai, targetHariManual, done, today, null);

    rows.push({
      id: 'PUR-' + (r + 1),
      gp: gp,
      proyek: proyek,
      unit: unit,
      unitKey: unit ? makeUnitKey(gp, proyek, unit) : '',
      projectKey: makeProjectKey(gp, proyek),
      jenisPengadaan: jenisPengadaan,
      namaBarang: namaBarang,
      namaVendor: safeText(cellValue(row, headerMap, 'namaVendor')),
      satuan: safeText(cellValue(row, headerMap, 'satuan')),
      hargaSatuan: safeNumber(cellValue(row, headerMap, 'hargaSatuan')),
      nilai: safeNumber(cellValue(row, headerMap, 'nilai')),
      statusPekerjaan: statusPekerjaan,
      tanggalMulai: toIsoDateString(tanggalMulai),
      tanggal: toIsoDateString(tanggal),
      lampiran: safeText(cellValue(row, headerMap, 'lampiran')),
      keterangan: safeText(cellValue(row, headerMap, 'keterangan')),
      slaTargetHari: sla.slaTargetHari,
      slaStartDate: sla.slaStartDate,
      slaTargetDate: sla.slaTargetDate,
      slaDone: sla.slaDone,
      slaOverdue: sla.slaOverdue,
      slaElapsedHari: sla.slaElapsedHari,
      canEditSla: hasScope_(scopes, 'purchasing'),
      tahun: tanggal ? tanggal.getFullYear() : null,
      bulan: tanggal ? tanggal.getMonth() + 1 : null
    });
  }

  return rows;
}

// ---------------------------------------------------------------------
// Progres Konstruksi Mingguan (Addendum 6) -- Rencana dibaca apa adanya
// dari tab "Rencana Progres" (diisi manual di Sheets, bulk paste dari
// dokumen Time Schedule & Kurva S yang sudah ada); Realisasi dibaca dari
// tab "Realisasi Progres" (diisi PIC lewat modal Detail per Unit,
// agregat % keseluruhan per minggu, bukan per item pekerjaan). Referensi
// ke unit murni lewat unitKey (Grup Proyek+Nama Proyek+Blok) -- TIDAK
// ada konsep "Tipe Unit" terpisah, sesuai keputusan user.
// ---------------------------------------------------------------------
function getProgressRencanaRows_() {
  var sheet = getSpreadsheet().getSheetByName(CONFIG.PROGRESS_RENCANA_TAB);
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headerMap = buildHeaderMap(values[0], PROGRESS_RENCANA_FIELD_DEFS);
  var rows = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var gp = safeText(cellValue(row, headerMap, 'grupProyek'));
    var proyek = safeText(cellValue(row, headerMap, 'namaProyek'));
    var unit = safeText(cellValue(row, headerMap, 'blokUnit'));
    var mingguKe = safeNumber(cellValue(row, headerMap, 'mingguKe'));
    if (!gp && !proyek && !unit) continue;
    if (!mingguKe) continue; // baris tanpa nomor minggu tidak berguna, lewati

    rows.push({
      gp: gp,
      proyek: proyek,
      unit: unit,
      unitKey: unit ? makeUnitKey(gp, proyek, unit) : '',
      mingguKe: mingguKe,
      rencanaProgres: safeNumber(cellValue(row, headerMap, 'rencanaProgres'))
    });
  }

  return rows;
}

function getProgressRealisasiRows_(scopes) {
  var sheet = getSpreadsheet().getSheetByName(CONFIG.PROGRESS_REALISASI_TAB);
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headerMap = buildHeaderMap(values[0], PROGRESS_REALISASI_FIELD_DEFS);
  var rows = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var gp = safeText(cellValue(row, headerMap, 'grupProyek'));
    var proyek = safeText(cellValue(row, headerMap, 'namaProyek'));
    var unit = safeText(cellValue(row, headerMap, 'blokUnit'));
    var mingguKe = safeNumber(cellValue(row, headerMap, 'mingguKe'));
    if (!gp && !proyek && !unit) continue;
    if (!mingguKe) continue;

    rows.push({
      id: 'PROG-' + (r + 1),
      gp: gp,
      proyek: proyek,
      unit: unit,
      unitKey: unit ? makeUnitKey(gp, proyek, unit) : '',
      mingguKe: mingguKe,
      tanggalUpdate: toIsoDateString(parseDateCell(cellValue(row, headerMap, 'tanggalUpdate'))),
      realisasiProgres: safeNumber(cellValue(row, headerMap, 'realisasiProgres')),
      keterangan: safeText(cellValue(row, headerMap, 'keterangan')),
      // Progres konstruksi = tanggung jawab PIC SPK unit itu (Haris/Ajis
      // sesuai GP) -- pakai scope 'spk' yg sudah ada, tidak perlu scope
      // Role baru terpisah.
      canEditProgress: hasScope_(scopes, 'spk', gp)
    });
  }

  return rows;
}

// Kumpulkan daftar tahun, GP, dan proyek-per-GP yang benar-benar muncul di
// data, supaya dropdown filter di client tidak perlu hardcode dan otomatis
// menyesuaikan begitu data baru masuk.
function buildMeta_(spk, homeWithAi, purchasing) {
  var years = {};
  var gpByKey = {}; // normalizedKey -> nama tampilan (pertama ditemukan)
  var projectByGp = {}; // normalizedGpKey -> { normalizedProjectKey -> nama tampilan }

  function note(record) {
    if (record.tahun) years[record.tahun] = true;
    if (record.gp) {
      var gpKey = normalizeKey(record.gp);
      if (!gpByKey[gpKey]) gpByKey[gpKey] = record.gp;
      if (record.proyek) {
        if (!projectByGp[gpKey]) projectByGp[gpKey] = {};
        var projKey = normalizeKey(record.proyek);
        if (!projectByGp[gpKey][projKey]) projectByGp[gpKey][projKey] = record.proyek;
      }
    }
  }

  spk.forEach(note);
  homeWithAi.forEach(note);
  purchasing.forEach(note);

  var gpList = Object.keys(gpByKey).sort().map(function (k) { return gpByKey[k]; });
  var projectsByGp = {};
  Object.keys(projectByGp).forEach(function (gpKey) {
    var displayGp = gpByKey[gpKey];
    projectsByGp[displayGp] = Object.keys(projectByGp[gpKey]).sort().map(function (pk) {
      return projectByGp[gpKey][pk];
    });
  });

  var yearList = Object.keys(years).map(Number).sort();

  return {
    years: yearList,
    gpList: gpList,
    projectsByGp: projectsByGp
  };
}
