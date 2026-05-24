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

/**
 * Fetch SEASON 2026 data for jamaah classification and grouping.
 *
 * Columns (zero-indexed):
 *    1/B  = TANGGAL           → filter by report date
 *   68/BQ = ID. REG
 *   71/BT = status invoice    → KWITANSI BARU | PEMBAYARAN | CANCEL
 *   73/BV = JUMLAH ANGGOTA    → pax count
 *   74/BW = NAMA              → nama pembawa (leader)
 *   75/BX = paket umroh       → nama paket di invoice
 *
 * @param {string} spreadsheetId
 * @param {string} reportDate — "YYYY-MM-DD" format
 * @returns {Promise<Map<string, object>>}
 */
export async function fetchSeasonData(spreadsheetId, reportDate) {
  try {
    logger.info({ spreadsheetId, reportDate }, '[invoice-reader] fetching SEASON 2026 data');

    const rows = await getSheetValues(spreadsheetId, 'SEASON 2026!A2:BX');

    if (!rows || rows.length < 2) {
      throw new Error('SEASON 2026 is empty or not found');
    }

    // Header row (row 1 in sheet = index 0 since we start at A2)
    const headerRow = rows[0];
    const hdr = headerRow.map((h) => (h || '').toString().trim().toUpperCase());

    const idRegIdx = hdr.indexOf('ID. REG');
    const tglIdx =        1; // B — fixed
    const statusIdx =    71; // BT — fixed
    const jumlahIdx =    73; // BV — fixed
    const namaIdx =      74; // BW — fixed
    const paketIdx =     75; // BX — fixed

    if (idRegIdx === -1) {
      logger.warn('[invoice-reader] ID. REG column not found in SEASON 2026');
    }

    // Convert reportDate "YYYY-MM-DD" to "DD/MM/YYYY" for comparison
    const [y, m, d] = reportDate.split('-');
    const targetDate = `${d}/${m}/${y}`;

    const lookupMap = new Map();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 72) continue;

      const idReg = idRegIdx >= 0 ? (row[idRegIdx] || '').toString().trim() : '';
      if (!idReg) continue;

      const rawTgl = (row[tglIdx] || '').toString().trim();
      const statusInvoice = (row[statusIdx] || '').toString().trim().toUpperCase();
      const jumlahAnggota = parseInt((row[jumlahIdx] || '0').toString().trim(), 10) || 1;
      const namaPembawa = (row[namaIdx] || '').toString().trim();
      const paketInvoice = (row[paketIdx] || '').toString().trim();

      // Only include entries dated today
      if (rawTgl !== targetDate) continue;

      lookupMap.set(idReg, {
        statusInvoice,
        jumlahAnggota,
        namaPembawa,
        paketInvoice,
      });
    }

    logger.info(
      { spreadsheetId, mapSize: lookupMap.size },
      '[invoice-reader] SEASON 2026 lookup map built',
    );

    return lookupMap;
  } catch (error) {
    logger.error({ err: error, spreadsheetId }, '[invoice-reader] fetchSeasonData failed');
    throw new Error(
      `Gagal fetch SEASON 2026 dari spreadsheet "${spreadsheetId}": ${error.message}`,
      { cause: error },
    );
  }
}