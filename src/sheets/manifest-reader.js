/**
 * Manifest Reader — fetch DATA JAMAAH and associated tabs,
 * parse them, and return sorted paket array.
 */

import { batchGetValues } from './client.js';
import { parseSheetData } from './parser.js';
import { logger } from '../utils/logger.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TAB_NAMES = [
  'DATA JAMAAH',
  'DATA REKAP PAKET',
  'UPDATE JAMAAH',
  'DATA JAMAAH KOSONGAN',
];

const RANGES = [
  'DATA JAMAAH!A1:AE',
  'DATA REKAP PAKET!A1:Z',
  'UPDATE JAMAAH!A1:Z',
  'DATA JAMAAH KOSONGAN!A1:Z',
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Parse a date string (DD/MM/YYYY) into a Date object for sorting.
 * @param {string} dateStr
 * @returns {Date}
 */
function _parseDateForSort(dateStr) {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split('/');
  if (parts.length !== 3) return new Date(0);
  const [dd, mm, yyyy] = parts.map(Number);
  return new Date(yyyy, mm - 1, dd);
}

/**
 * Sort paket blocks ascending by tanggalKeberangkatan (terdekat ke terjauh).
 * @param {Array} pakets
 * @returns {Array}
 */
function _sortPaketsByDate(pakets) {
  return [...pakets].sort((a, b) => {
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
 * Reads 4 tabs in parallel via batchGet, parses DATA JAMAAH into
 * paket blocks, and returns them sorted by departure date.
 *
 * @param {string} spreadsheetId — Google Sheets ID
 * @returns {Promise<Array<{metadata: object, jamaah: object[], summary: object|null, rawData: object}>>}
 */
export async function fetchManifestData(spreadsheetId) {
  try {
    logger.info({ spreadsheetId }, '[manifest-reader] fetching manifest data');

    const [dataJamaah, dataRekapPaket, updateJamaah, dataJamaahKosongan] =
      await batchGetValues(spreadsheetId, RANGES);

    logger.info(
      { spreadsheetId, dataJamaahRows: dataJamaah.length },
      '[manifest-reader] raw data received',
    );

    const pakets = parseSheetData(dataJamaah);

    // Attach raw tab data to each paket for downstream use (e.g. screenshot builder)
    const rawData = {
      dataJamaah,
      dataRekapPaket,
      updateJamaah,
      dataJamaahKosongan,
    };

    const paketsWithRaw = pakets.map((p) => ({
      ...p,
      rawData,
    }));

    const sorted = _sortPaketsByDate(paketsWithRaw);

    logger.info(
      { spreadsheetId, paketCount: sorted.length },
      '[manifest-reader] parsed and sorted pakets',
    );

    return sorted;
  } catch (error) {
    logger.error({ err: error, spreadsheetId }, '[manifest-reader] fetchManifestData failed');
    throw new Error(
      `Gagal fetch manifest data dari spreadsheet "${spreadsheetId}": ${error.message}`,
      { cause: error },
    );
  }
}
