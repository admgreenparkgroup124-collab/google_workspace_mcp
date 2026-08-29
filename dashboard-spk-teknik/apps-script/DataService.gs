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

function buildDashboardPayload_() {
  // Bandingkan per-tanggal (bukan timestamp persis) supaya unit yang jatuh
  // tempo HARI INI belum dianggap overdue -- baru overdue mulai besoknya,
  // sesuai PRD ("begitu tanggal hari ini melewati Tanggal Selesai").
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var slaConfig = getSlaConfig_();

  var spk = getSpkRows_(today, slaConfig);
  var homeWithAi = getHomeWithAiRows_(today, slaConfig);
  var purchasing = getPurchasingRows_(today, slaConfig);

  return {
    generatedAt: new Date().toISOString(),
    spk: spk,
    homeWithAi: homeWithAi,
    purchasing: purchasing,
    meta: buildMeta_(spk, homeWithAi, purchasing)
  };
}

// ---------------------------------------------------------------------
// SLA -- tab "SLA Config" (admin-editable) menentukan target hari per
// Kategori+Jenis proses. Murni tambahan: tidak mengubah isOverdue/alert
// overdue SPK Unit Rumah yang sudah ada (lihat komentar di getSpkRows_).
// ---------------------------------------------------------------------
function getSlaConfig_() {
  var map = {};
  var sheet = getSpreadsheet().getSheetByName(CONFIG.SLA_CONFIG_TAB);
  if (!sheet) return map;

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return map;

  var headerMap = buildHeaderMap(values[0], SLA_CONFIG_FIELD_DEFS);
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var kategori = safeText(cellValue(row, headerMap, 'kategori'));
    var jenisRaw = safeText(cellValue(row, headerMap, 'jenis'));
    var jenis = jenisRaw === '-' ? '' : jenisRaw;
    var targetHari = safeNumber(cellValue(row, headerMap, 'targetHari'));
    if (!kategori || !targetHari) continue;
    map[normalizeKey(kategori) + '|' + normalizeKey(jenis)] = targetHari;
  }
  return map;
}

function lookupSlaTargetHari_(slaConfig, kategori, jenis) {
  var key = normalizeKey(kategori) + '|' + normalizeKey(jenis);
  return slaConfig[key] !== undefined ? slaConfig[key] : null;
}

// startDate: Date atau null. done: proses sudah dianggap selesai (SLA
// berhenti dihitung, tidak overdue). fallbackTargetHari: dipakai kalau
// tidak ada baris SLA Config yang cocok (khusus SPK Unit Rumah, supaya
// tetap ada target walau admin belum mengisi SLA Config sama sekali).
function computeSla_(slaConfig, kategori, jenis, startDate, done, today, fallbackTargetHari) {
  var targetHari = lookupSlaTargetHari_(slaConfig, kategori, jenis);
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

function getSpkRows_(today, slaConfig) {
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

      // SLA murni tambahan (lihat komentar di computeSla_) -- tidak
      // mengganti isOverdue/tanggalSelesaiEfektif yang sudah ada di atas.
      var sla = computeSla_(
        slaConfig, CONFIG.SLA_KATEGORI_SPK, jenisSpk, tanggalTerbit, false, today,
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
        tahun: tanggalTerbit ? tanggalTerbit.getFullYear() : null,
        bulan: tanggalTerbit ? tanggalTerbit.getMonth() + 1 : null
      });
    }
  });

  return rows;
}

function getHomeWithAiRows_(today, slaConfig) {
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
    var sla = computeSla_(slaConfig, CONFIG.SLA_KATEGORI_HWA, '', tanggalMulai, done, today, null);

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

function getPurchasingRows_(today, slaConfig) {
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
    var sla = computeSla_(slaConfig, CONFIG.SLA_KATEGORI_PURCHASING, jenisPengadaan, tanggalMulai, done, today, null);

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
      tahun: tanggal ? tanggal.getFullYear() : null,
      bulan: tanggal ? tanggal.getMonth() + 1 : null
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
