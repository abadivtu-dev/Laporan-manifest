/**
 * Invoice Reader — read INDUK DB TERKINI from the invoice spreadsheet
 * and build a lookup map for cross-checking jamaah perpindahan.
 */

import { batchGetValues } from './client.js';
import { logger } from '../utils/logger.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TAB_NAME = 'INDUK DB TERKINI';
const RANGE = 'INDUK DB TERKINI!A1:H';

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Fetch invoice data and build a lookup map keyed by UNIQUE JAMAAH.
 *
 * The lookup map contains:
 *   { uniqueJamaah, namaLengkap, paketTransaksi, paketTerakhir }
 *
 * @param {string} spreadsheetId — Invoice spreadsheet ID
 * @returns {Promise<{lookupMap: Map<string, object>, rawData: Array<Array<string>>}>}
 */
export async function fetchInvoiceData(spreadsheetId) {
  try {
    logger.info({ spreadsheetId }, '[invoice-reader] fetching invoice data');

    const [rows] = await batchGetValues(spreadsheetId, [RANGE]);

    if (!rows || rows.length < 1) {
      throw new Error('Required columns not found — sheet is empty');
    }

    const headers = rows[0].map((h) => (h || '').toString().trim());

    const uniqueIdx = headers.indexOf('UNIQUE JAMAAH');
    const namaIdx = headers.indexOf('NAMA LENGKAP');
    const paketTransaksiIdx = headers.indexOf('PAKET TRANSAKSI');
    const paketTerakhirIdx = headers.indexOf('PAKET TERAKHIR');

    if (uniqueIdx === -1 || paketTerakhirIdx === -1) {
      throw new Error(
        `Required columns not found in ${TAB_NAME}. Need "UNIQUE JAMAAH" and "PAKET TERAKHIR". Found: ${headers.join(', ')}`,
      );
    }

    const lookupMap = new Map();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => !c || c.toString().trim() === '')) continue;

      const uniqueJamaah = (row[uniqueIdx] || '').toString().trim();
      if (!uniqueJamaah) continue;

      lookupMap.set(uniqueJamaah, {
        uniqueJamaah,
        namaLengkap: namaIdx !== -1 ? (row[namaIdx] || '').toString().trim() : '',
        paketTransaksi: paketTransaksiIdx !== -1 ? (row[paketTransaksiIdx] || '').toString().trim() : '',
        paketTerakhir: (row[paketTerakhirIdx] || '').toString().trim(),
      });
    }

    logger.info(
      { spreadsheetId, mapSize: lookupMap.size },
      '[invoice-reader] invoice lookup map built',
    );

    return {
      lookupMap,
      rawData: rows,
    };
  } catch (error) {
    logger.error({ err: error, spreadsheetId }, '[invoice-reader] fetchInvoiceData failed');
    throw new Error(
      `Gagal fetch invoice data dari spreadsheet "${spreadsheetId}": ${error.message}`,
      { cause: error },
    );
  }
}
