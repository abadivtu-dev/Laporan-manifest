/**
 * Invoice Reader — read INDUK DB TERKINI from the invoice spreadsheet
 * and build a lookup map for cross-checking jamaah perpindahan.
 *
 * Sheet structure (row 5 = header):
 *   ID REG | NAMA JAMAAH | PAKET UMROH | JUMLAH JAMAAH | NO INVOICE | TGGL MSK MANIFEST
 */

import { getSheetValues } from './client.js';
import { logger } from '../utils/logger.js';

const TAB_NAME = 'INDUK DB TERKINI';
const RANGE = `'${TAB_NAME}'!A5:Z`;

/**
 * Fetch invoice data and build a lookup map keyed by ID REG.
 *
 * @param {string} spreadsheetId
 * @returns {Promise<Map<string, object>>}
 */
export async function fetchInvoiceData(spreadsheetId) {
  try {
    logger.info({ spreadsheetId }, '[invoice-reader] fetching invoice data');

    const rows = await getSheetValues(spreadsheetId, RANGE);

    if (!rows || rows.length < 1) {
      throw new Error('INDUK DB TERKINI is empty or headers not found');
    }

    const headers = rows[0].map((h) => (h || '').toString().trim().toUpperCase());

    const idIdx = headers.indexOf('ID REG');
    const namaIdx = headers.indexOf('NAMA JAMAAH');
    const paketIdx = headers.indexOf('PAKET UMROH');

    if (idIdx === -1) {
      throw new Error(
        `Column "ID REG" not found in ${TAB_NAME}. Found: ${headers.join(', ')}`,
      );
    }

    const lookupMap = new Map();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => !c || c.toString().trim() === '')) continue;

      const idReg = (row[idIdx] || '').toString().trim();
      if (!idReg) continue;

      // Simpan data terakhir per ID REG (kalau ada duplikat, ambil yang terakhir)
      lookupMap.set(idReg, {
        uniqueJamaah: idReg,
        namaLengkap: namaIdx !== -1 ? (row[namaIdx] || '').toString().trim() : '',
        paketTerakhir: paketIdx !== -1 ? (row[paketIdx] || '').toString().trim() : '',
      });
    }

    logger.info(
      { spreadsheetId, mapSize: lookupMap.size },
      '[invoice-reader] invoice lookup map built',
    );

    return lookupMap;
  } catch (error) {
    logger.error({ err: error, spreadsheetId }, '[invoice-reader] fetchInvoiceData failed');
    throw new Error(
      `Gagal fetch invoice data dari spreadsheet "${spreadsheetId}": ${error.message}`,
      { cause: error },
    );
  }
}
