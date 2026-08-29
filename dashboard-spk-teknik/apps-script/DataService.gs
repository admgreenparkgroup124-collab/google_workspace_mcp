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
  var spk = getSpkRows_();
  var homeWithAi = getHomeWithAiRows_();
  var purchasing = getPurchasingRows_();

  return {
    generatedAt: new Date().toISOString(),
    spk: spk,
    homeWithAi: homeWithAi,
    purchasing: purchasing,
    meta: buildMeta_(spk, homeWithAi, purchasing)
  };
}

function getSpkRows_() {
  var rows = [];
  // Bandingkan per-tanggal (bukan timestamp persis) supaya unit yang jatuh
  // tempo HARI INI belum dianggap overdue -- baru overdue mulai besoknya,
  // sesuai PRD ("begitu tanggal hari ini melewati Tanggal Selesai").
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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
        tahun: tanggalTerbit ? tanggalTerbit.getFullYear() : null,
        bulan: tanggalTerbit ? tanggalTerbit.getMonth() + 1 : null
      });
    }
  });

  return rows;
}

function getHomeWithAiRows_() {
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

    var tanggalTerpasang = parseDateCell(cellValue(row, headerMap, 'tanggalTerpasang'));

    rows.push({
      id: 'HWA-' + (r + 1),
      gp: gp,
      proyek: proyek,
      unit: unit,
      unitKey: unit ? makeUnitKey(gp, proyek, unit) : '',
      projectKey: makeProjectKey(gp, proyek),
      status: status,
      nilai: safeNumber(cellValue(row, headerMap, 'nilai')),
      tanggalTerpasang: toIsoDateString(tanggalTerpasang),
      keterangan: safeText(cellValue(row, headerMap, 'keterangan')),
      tahun: tanggalTerpasang ? tanggalTerpasang.getFullYear() : null,
      bulan: tanggalTerpasang ? tanggalTerpasang.getMonth() + 1 : null
    });
  }

  return rows;
}

function getPurchasingRows_() {
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

    var tanggal = parseDateCell(cellValue(row, headerMap, 'tanggal'));

    rows.push({
      id: 'PUR-' + (r + 1),
      gp: gp,
      proyek: proyek,
      unit: unit,
      unitKey: unit ? makeUnitKey(gp, proyek, unit) : '',
      projectKey: makeProjectKey(gp, proyek),
      jenisPengadaan: jenisPengadaan,
      namaBarang: namaBarang,
      nilai: safeNumber(cellValue(row, headerMap, 'nilai')),
      statusPekerjaan: safeText(cellValue(row, headerMap, 'statusPekerjaan')),
      tanggal: toIsoDateString(tanggal),
      keterangan: safeText(cellValue(row, headerMap, 'keterangan')),
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
