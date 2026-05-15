import { google } from 'googleapis';
import { logger } from '../utils/logger.js';

/** @type {import('googleapis').sheets_v4.Sheets | null} */
let sheets = null;

/**
 * Initialize the Google Sheets client (idempotent — safe to call multiple times).
 * Uses GOOGLE_APPLICATION_CREDENTIALS env var implicitly via GoogleAuth.
 */
async function _initClient() {
  if (sheets) return;

  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  sheets = google.sheets({ version: 'v4', auth });
  logger.info('[sheets] client initialized');
}

/**
 * Fetch values from a single sheet range.
 *
 * @param {string} spreadsheetId
 * @param {string} range — e.g. "DATA JAMAAH!A1:AE"
 * @returns {Promise<Array<Array<string>>>}
 */
export async function getSheetValues(spreadsheetId, range) {
  try {
    await _initClient();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    return response.data.values || [];
  } catch (error) {
    logger.error({ err: error, spreadsheetId, range }, '[sheets] getSheetValues failed');
    throw new Error(
      `Gagal fetch range "${range}" dari spreadsheet "${spreadsheetId}": ${error.message}`,
      { cause: error },
    );
  }
}

/**
 * Fetch values from multiple ranges in parallel (batchGet).
 *
 * @param {string} spreadsheetId
 * @param {string[]} ranges — array of A1 notation ranges
 * @returns {Promise<Array<Array<Array<string>>>>} — results in the same order as `ranges`
 */
export async function batchGetValues(spreadsheetId, ranges) {
  try {
    await _initClient();

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
    });

    return response.data.valueRanges.map((vr) => vr.values || []);
  } catch (error) {
    logger.error({ err: error, spreadsheetId, rangeCount: ranges.length }, '[sheets] batchGetValues failed');
    throw new Error(
      `Gagal batchGetValues dari spreadsheet "${spreadsheetId}": ${error.message}`,
      { cause: error },
    );
  }
}

/**
 * Reset internal state (for testing only).
 */
export function _resetForTest() {
  sheets = null;
}
