import crypto from 'crypto';
import { getDatabase } from './database.js';

/**
 * Menyimpan snapshot data jamaah ke database.
 * Jika snapshot dengan spreadsheet_id, paket_code, dan snapshot_date yang sama sudah ada,
 * maka akan di-update (upsert).
 *
 * @param {Object} params
 * @param {string} params.spreadsheetId
 * @param {string} params.paketCode
 * @param {string} params.snapshotDate - Format YYYY-MM-DD
 * @param {Array<Object>} params.jamaahData
 * @returns {Promise<Object>} Record snapshot yang tersimpan
 */
export async function saveSnapshot({ spreadsheetId, paketCode, snapshotDate, jamaahData }) {
  if (!Array.isArray(jamaahData)) {
    throw new Error('jamaahData harus berupa array');
  }

  try {
    const db = getDatabase();
    const dataJson = JSON.stringify(jamaahData);
    const jamaahHash = crypto.createHash('sha256').update(dataJson).digest('hex');
    const jamaahCount = jamaahData.length;

    db.prepare(`
      INSERT INTO snapshots (spreadsheet_id, paket_code, snapshot_date, jamaah_hash, jamaah_count, data_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(spreadsheet_id, paket_code, snapshot_date)
      DO UPDATE SET jamaah_hash = excluded.jamaah_hash,
                    jamaah_count = excluded.jamaah_count,
                    data_json = excluded.data_json,
                    created_at = datetime('now','localtime')
    `).run(spreadsheetId, paketCode, snapshotDate, jamaahHash, jamaahCount, dataJson);

    const row = db.prepare(`
      SELECT * FROM snapshots WHERE spreadsheet_id = ? AND paket_code = ? AND snapshot_date = ?
    `).get(spreadsheetId, paketCode, snapshotDate);

    return row;
  } catch (error) {
    throw new Error(`Gagal menyimpan snapshot ${spreadsheetId}/${paketCode}/${snapshotDate}: ${error.message}`, { cause: error });
  }
}

/**
 * Mengambil snapshot paling terakhir SEBELUM tanggal tertentu.
 *
 * @param {string} spreadsheetId
 * @param {string} paketCode
 * @param {string} beforeDate - Format YYYY-MM-DD (exclusive)
 * @returns {Promise<Object|null>}
 */
export async function getPreviousSnapshot(spreadsheetId, paketCode, beforeDate) {
  try {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM snapshots
      WHERE spreadsheet_id = ? AND paket_code = ? AND snapshot_date < ?
      ORDER BY snapshot_date DESC
      LIMIT 1
    `).get(spreadsheetId, paketCode, beforeDate);

    return row || null;
  } catch (error) {
    throw new Error(`Gagal mengambil previous snapshot ${spreadsheetId}/${paketCode}/${beforeDate}: ${error.message}`, { cause: error });
  }
}

/**
 * Mengambil snapshot pada tanggal exact.
 *
 * @param {string} spreadsheetId
 * @param {string} paketCode
 * @param {string} date - Format YYYY-MM-DD
 * @returns {Promise<Object|null>}
 */
export async function getSnapshot(spreadsheetId, paketCode, date) {
  try {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM snapshots
      WHERE spreadsheet_id = ? AND paket_code = ? AND snapshot_date = ?
    `).get(spreadsheetId, paketCode, date);

    return row || null;
  } catch (error) {
    throw new Error(`Gagal mengambil snapshot ${spreadsheetId}/${paketCode}/${date}: ${error.message}`, { cause: error });
  }
}

/**
 * Menghapus snapshot yang lebih lama dari retentionDays.
 *
 * @param {number} [retentionDays=90]
 * @returns {Promise<number>} Jumlah snapshot yang dihapus
 */
export async function cleanOldSnapshots(retentionDays = 90) {
  try {
    const db = getDatabase();
    const result = db.prepare(`
      DELETE FROM snapshots
      WHERE snapshot_date < date('now', '-' || ? || ' days')
    `).run(retentionDays);

    return result.changes;
  } catch (error) {
    throw new Error(`Gagal cleanOldSnapshots (retention=${retentionDays}): ${error.message}`, { cause: error });
  }
}
