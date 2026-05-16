/**
 * Manifest Reader — fetch DATA JAMAAH + DATA REKAP PAKET,
 * gabungkan metadata dari rekapitulasi dengan data jamaah dari manifest.
 */

import { batchGetValues } from './client.js';
import { parseSheetData } from './parser.js';
import { logger } from '../utils/logger.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const RANGES = [
  'DATA JAMAAH!A1:AE',
  'DATA REKAP PAKET!A1:Z',
  'UPDATE JAMAAH!A1:Z',
  'DATA JAMAAH KOSONGAN!A1:Z',
];

/* ------------------------------------------------------------------ */
/*  DATA REKAP PAKET parser                                            */
/* ------------------------------------------------------------------ */

/**
 * Parse DATA REKAP PAKET tab into array of paket metadata.
 *
 * Header at row 3 (0-indexed):
 *   NO | NO MANIFEST | KEBERANGKATAN | NAMA PAKET INVOICE | PROGRAM PAKET |
 *   ID PAKET | JML. SEAT | SEAT TERISI | SISA SEAT
 *
 * Data rows start at row 4.
 *
 * @param {Array<Array<string>>} rows
 * @returns {Array<Object>}
 */
function _parseRekapPaket(rows) {
  if (!rows || rows.length < 5) return [];

  const headerRow = rows[3];
  if (!headerRow) return [];

  const headers = headerRow.map((h) => (h || '').toString().trim().toUpperCase());

  const idxNo = headers.indexOf('NO');
  const idxNoManifest = headers.indexOf('NO MANIFEST');
  const idxKeberangkatan = headers.indexOf('KEBERANGKATAN');
  const idxNamaPaket = headers.indexOf('NAMA PAKET INVOICE');
  const idxProgram = headers.indexOf('PROGRAM PAKET');
  const idxIdPaket = headers.indexOf('ID PAKET');
  const idxJmlSeat = headers.indexOf('JML. SEAT');
  const idxTerisi = headers.indexOf('SEAT TERISI');
  const idxSisa = headers.indexOf('SISA SEAT');

  const pakets = [];

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const no = (row[idxNo] || '').toString().trim();
    if (!no || isNaN(parseInt(no, 10))) continue;

    const kodePaket = idxIdPaket !== -1 ? (row[idxIdPaket] || '').toString().trim() : '';
    const jumlahSeat = idxJmlSeat !== -1 ? (parseInt((row[idxJmlSeat] || '0').toString().trim(), 10) || 0) : 0;
    const seatTerisi = idxTerisi !== -1 ? (parseInt((row[idxTerisi] || '0').toString().trim(), 10) || 0) : 0;
    const sisaSeat = idxSisa !== -1 ? (parseInt((row[idxSisa] || '0').toString().trim(), 10) || 0) : 0;

    pakets.push({
      no: parseInt(no, 10),
      noManifest: idxNoManifest !== -1 ? (row[idxNoManifest] || '').toString().trim() : '',
      tanggalKeberangkatan: idxKeberangkatan !== -1 ? (row[idxKeberangkatan] || '').toString().trim() : '',
      namaPaket: idxNamaPaket !== -1 ? (row[idxNamaPaket] || '').toString().trim() : '',
      programPaket: idxProgram !== -1 ? (row[idxProgram] || '').toString().trim() : '',
      kodePaket,
      jumlahSeat,
      seatTerisi,
      sisaSeat,
    });
  }

  return pakets;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Parse a date string (DD/MM/YYYY) or (DD-Mon-YYYY) into a Date object for sorting.
 */
function _parseDateForSort(dateStr) {
  if (!dateStr) return new Date(0);

  // Coba DD-Mon-YYYY (e.g., "16-Jun-2026")
  const monMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const monMatch = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (monMatch) {
    const mon = monMatch[2].toLowerCase();
    if (monMap[mon] !== undefined) {
      return new Date(parseInt(monMatch[3]), monMap[mon], parseInt(monMatch[1]));
    }
  }

  // Coba DD/MM/YYYY
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts.map(Number);
    if (!isNaN(dd) && !isNaN(mm) && !isNaN(yyyy)) {
      return new Date(yyyy, mm - 1, dd);
    }
  }

  return new Date(0);
}

/* ------------------------------------------------------------------ */
/*  Matching logic                                                     */
/* ------------------------------------------------------------------ */

/**
 * Match DATA JAMAAH blocks with DATA REKAP PAKET entries.
 *
 * Matching strategy:
 *   1. By kodePaket / ID PAKET (preferred)
 *   2. By "1A{N}" marker (CJS column in rekapitulasi ↔ col C in seat info row)
 *   3. By sequential index (fallback)
 *
 * @param {Array<Object>} rekapList — from DATA REKAP PAKET
 * @param {Array<Object>} blocks — from DATA JAMAAH
 * @returns {Array<Object>} combined pakets sorted by departure date
 */
function _combinePakets(rekapList, blocks) {
  const combined = [];

  for (const rekap of rekapList) {
    // Cari block yang cocok
    let matchedBlock = null;

    // Strategy 1: match by kodePaket
    if (rekap.kodePaket) {
      matchedBlock = blocks.find((b) => b.metadata.kodePaket === rekap.kodePaket);
    }

    // Strategy 2: match by index (sequential)
    if (!matchedBlock && rekap.no <= blocks.length) {
      // Blocks already in sequential order, match by rekap.no - 1
      const candidate = blocks[rekap.no - 1];
      // Verify: check if seat info row col C contains matching marker
      if (candidate && candidate.seatInfoRow) {
        const marker = (candidate.seatInfoRow[2] || '').toString().trim();
        // Accept if marker matches expected pattern or if kodePaket is empty in both
        matchedBlock = candidate;
      }
    }

    // Strategy 3: try match by "1A{N}" marker
    if (!matchedBlock) {
      const expectedMarker = `1A${rekap.no}`;
      matchedBlock = blocks.find((b) => {
        if (!b.seatInfoRow) return false;
        const marker = (b.seatInfoRow[2] || '').toString().trim();
        return marker === expectedMarker;
      });
    }

    if (matchedBlock) {
      combined.push({
        metadata: {
          // Prioritaskan DATA REKAP PAKET untuk metadata
          kodePaket: rekap.kodePaket || matchedBlock.metadata.kodePaket,
          namaPaket: rekap.namaPaket || matchedBlock.metadata.namaPaket,
          programPaket: rekap.programPaket || matchedBlock.metadata.rute || '',
          rute: matchedBlock.metadata.rute || rekap.programPaket || '',
          jumlahSeat: rekap.jumlahSeat || matchedBlock.metadata.jumlahSeat,
          seatTerisi: rekap.seatTerisi,
          sisaSeat: rekap.sisaSeat,
          tanggalKeberangkatan: rekap.tanggalKeberangkatan || matchedBlock.metadata.tanggalKeberangkatan,
          noManifest: rekap.noManifest,
          maskapai: matchedBlock.metadata.maskapai || '',
          asal: matchedBlock.metadata.asal || '',
          tujuan: matchedBlock.metadata.tujuan || '',
        },
        jamaah: matchedBlock.jamaah || [],
        columnHeaders: matchedBlock.columnHeaders || [],
        summary: matchedBlock.summary || null,
        seatInfoRow: matchedBlock.seatInfoRow || [],
        descRows: matchedBlock.descRows || [],
        rawRows: matchedBlock.rawRows || [],
      });
    } else {
      // Paket tidak punya data di DATA JAMAAH — tetap masuk dengan jamaah kosong
      combined.push({
        metadata: {
          kodePaket: rekap.kodePaket,
          namaPaket: rekap.namaPaket || `Paket #${rekap.no}`,
          programPaket: rekap.programPaket || '',
          rute: '',
          jumlahSeat: rekap.jumlahSeat,
          seatTerisi: rekap.seatTerisi,
          sisaSeat: rekap.sisaSeat,
          tanggalKeberangkatan: rekap.tanggalKeberangkatan,
          noManifest: rekap.noManifest,
          maskapai: '',
          asal: '',
          tujuan: '',
        },
        jamaah: [],
        columnHeaders: [],
        summary: null,
        seatInfoRow: [],
        descRows: [],
        rawRows: [],
      });
    }
  }

  // Sort by departure date (terdekat ke terjauh)
  return combined.sort((a, b) => {
    const dateA = _parseDateForSort(a.metadata.tanggalKeberangkatan);
    const dateB = _parseDateForSort(b.metadata.tanggalKeberangkatan);
    return dateA - dateB;
  });
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Fetch and parse manifest data from a monthly spreadsheet.
 *
 * Reads DATA JAMAAH + DATA REKAP PAKET, combines metadata from
 * rekapitulasi with jamaah data from manifest.
 *
 * @param {string} spreadsheetId
 * @returns {Promise<Array<Object>>} combined pakets sorted by departure date
 */
export async function fetchManifestData(spreadsheetId) {
  try {
    logger.info({ spreadsheetId }, '[manifest-reader] fetching manifest data');

    const [dataJamaah, dataRekapPaket, updateJamaah, dataJamaahKosongan] =
      await batchGetValues(spreadsheetId, RANGES);

    logger.info(
      { spreadsheetId, dataJamaahRows: dataJamaah.length, rekapRows: dataRekapPaket.length },
      '[manifest-reader] raw data received',
    );

    const rekapList = _parseRekapPaket(dataRekapPaket);
    logger.info(
      { spreadsheetId, rekapCount: rekapList.length },
      '[manifest-reader] parsed rekapitulasi',
    );

    const blocks = parseSheetData(dataJamaah);
    logger.info(
      { spreadsheetId, blockCount: blocks.length },
      '[manifest-reader] parsed data jamaah blocks',
    );

    // Attach raw tab data for downstream use
    const rawData = {
      dataJamaah,
      dataRekapPaket,
      updateJamaah,
      dataJamaahKosongan,
    };

    const combined = _combinePakets(rekapList, blocks);
    const withRaw = combined.map((p) => ({ ...p, rawData }));

    logger.info(
      { spreadsheetId, paketCount: withRaw.length },
      '[manifest-reader] combined pakets ready',
    );

    return withRaw;
  } catch (error) {
    logger.error({ err: error, spreadsheetId }, '[manifest-reader] fetchManifestData failed');
    throw new Error(
      `Gagal fetch manifest data dari spreadsheet "${spreadsheetId}": ${error.message}`,
      { cause: error },
    );
  }
}
