import { getDatabase } from './database.js';

/**
 * Mencatat laporan yang terkirim ke database.
 *
 * @param {Object} params
 * @param {string} params.spreadsheetId
 * @param {string} params.paketCode
 * @param {string} params.reportDate - Format YYYY-MM-DD
 * @param {string} [params.waMessageId]
 * @param {string} [params.status='sent']
 * @returns {Promise<Object>} Record sent_report yang tersimpan
 */
export async function logSentReport({ spreadsheetId, paketCode, reportDate, waMessageId, status = 'sent' }) {
  try {
    const db = getDatabase();
    const existing = db.prepare(`
      SELECT id FROM sent_reports
      WHERE spreadsheet_id = ? AND paket_code = ? AND report_date = ?
    `).get(spreadsheetId, paketCode, reportDate);

    if (existing) {
      db.prepare(`
        UPDATE sent_reports
        SET wa_message_id = ?, status = ?, last_error = NULL, attempts = attempts + 1, sent_at = datetime('now','localtime')
        WHERE id = ?
      `).run(waMessageId || null, status, existing.id);
    } else {
      db.prepare(`
        INSERT INTO sent_reports (spreadsheet_id, paket_code, report_date, wa_message_id, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(spreadsheetId, paketCode, reportDate, waMessageId || null, status);
    }

    const row = db.prepare(`
      SELECT * FROM sent_reports
      WHERE spreadsheet_id = ? AND paket_code = ? AND report_date = ?
    `).get(spreadsheetId, paketCode, reportDate);

    return row;
  } catch (error) {
    throw new Error(`Gagal logSentReport ${spreadsheetId}/${paketCode}/${reportDate}: ${error.message}`, { cause: error });
  }
}

/**
 * Mengecek apakah laporan sudah pernah dikirim.
 *
 * @param {string} spreadsheetId
 * @param {string} paketCode
 * @param {string} reportDate - Format YYYY-MM-DD
 * @returns {Promise<boolean>}
 */
export async function isAlreadySent(spreadsheetId, paketCode, reportDate, status = null) {
  try {
    const db = getDatabase();
    let query = `SELECT COUNT(*) as count FROM sent_reports
      WHERE spreadsheet_id = ? AND paket_code = ? AND report_date = ?`;
    const params = [spreadsheetId, paketCode, reportDate];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    const row = db.prepare(query).get(...params);
    return row.count > 0;
  } catch (error) {
    throw new Error(`Gagal isAlreadySent ${spreadsheetId}/${paketCode}/${reportDate}: ${error.message}`, { cause: error });
  }
}

/**
 * Mengambil daftar laporan gagal pada tanggal tertentu.
 *
 * @param {string} reportDate - Format YYYY-MM-DD
 * @returns {Promise<Array<Object>>}
 */
export async function getFailedReports(reportDate) {
  try {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM sent_reports
      WHERE report_date = ? AND status = 'failed'
    `).all(reportDate);

    return rows;
  } catch (error) {
    throw new Error(`Gagal getFailedReports ${reportDate}: ${error.message}`, { cause: error });
  }
}

/**
 * Memperbarui status dan error message pada laporan.
 *
 * @param {string} spreadsheetId
 * @param {string} paketCode
 * @param {string} reportDate - Format YYYY-MM-DD
 * @param {Object} params
 * @param {string} params.status
 * @param {string} [params.errorMessage]
 * @returns {Promise<void>}
 */
export async function updateReportStatus(spreadsheetId, paketCode, reportDate, { status, errorMessage }) {
  try {
    const db = getDatabase();
    db.prepare(`
      UPDATE sent_reports
      SET status = ?, last_error = ?, attempts = attempts + 1
      WHERE spreadsheet_id = ? AND paket_code = ? AND report_date = ?
    `).run(status, errorMessage || null, spreadsheetId, paketCode, reportDate);
  } catch (error) {
    throw new Error(`Gagal updateReportStatus ${spreadsheetId}/${paketCode}/${reportDate}: ${error.message}`, { cause: error });
  }
}

/**
 * Mencatat pipeline run baru.
 *
 * @param {Object} params
 * @param {string} params.runDate - Format YYYY-MM-DD
 * @returns {Promise<Object>} Record pipeline_run
 */
export async function logPipelineRun({ runDate }) {
  try {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO pipeline_runs (run_date, status)
      VALUES (?, 'running')
    `).run(runDate);

    const row = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(result.lastInsertRowid);
    return row;
  } catch (error) {
    throw new Error(`Gagal logPipelineRun ${runDate}: ${error.message}`, { cause: error });
  }
}

/**
 * Mencatat spreadsheet run dalam pipeline.
 *
 * @param {Object} params
 * @param {number} params.pipelineRunId
 * @param {string} params.spreadsheetId
 * @param {number} params.sortOrder
 * @returns {Promise<Object>} Record spreadsheet_run
 */
export async function logSpreadsheetRun({ pipelineRunId, spreadsheetId, sortOrder }) {
  try {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO spreadsheet_runs (pipeline_run_id, spreadsheet_id, sort_order, status)
      VALUES (?, ?, ?, 'pending')
    `).run(pipelineRunId, spreadsheetId, sortOrder);

    const row = db.prepare('SELECT * FROM spreadsheet_runs WHERE id = ?').get(result.lastInsertRowid);
    return row;
  } catch (error) {
    throw new Error(`Gagal logSpreadsheetRun ${spreadsheetId}: ${error.message}`, { cause: error });
  }
}

/**
 * Mencatat paket run dalam pipeline.
 *
 * @param {Object} params
 * @param {number} params.spreadsheetRunId
 * @param {string} params.paketCode
 * @param {number} params.sortOrder
 * @returns {Promise<Object>} Record paket_run
 */
export async function logPaketRun({ spreadsheetRunId, paketCode, sortOrder }) {
  try {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO paket_runs (spreadsheet_run_id, paket_code, sort_order, status)
      VALUES (?, ?, ?, 'pending')
    `).run(spreadsheetRunId, paketCode, sortOrder);

    const row = db.prepare('SELECT * FROM paket_runs WHERE id = ?').get(result.lastInsertRowid);
    return row;
  } catch (error) {
    throw new Error(`Gagal logPaketRun ${paketCode}: ${error.message}`, { cause: error });
  }
}

/**
 * Memperbarui status paket run.
 *
 * @param {number} paketRunId
 * @param {string} status
 * @param {string|null} error
 * @returns {Promise<void>}
 */
export async function updatePaketRunStatus(paketRunId, status, error) {
  try {
    const db = getDatabase();
    db.prepare(`
      UPDATE paket_runs
      SET status = ?, last_error = ?, completed_at = CASE WHEN ? IN ('completed','failed') THEN datetime('now','localtime') ELSE NULL END
      WHERE id = ?
    `).run(status, error || null, status, paketRunId);
  } catch (error) {
    throw new Error(`Gagal updatePaketRunStatus ${paketRunId}: ${error.message}`, { cause: error });
  }
}

/**
 * Memperbarui status spreadsheet run.
 *
 * @param {number} spreadsheetRunId
 * @param {string} status
 * @param {string|null} error
 * @returns {Promise<void>}
 */
export async function updateSpreadsheetRunStatus(spreadsheetRunId, status, error) {
  try {
    const db = getDatabase();
    db.prepare(`
      UPDATE spreadsheet_runs
      SET status = ?, error = ?, completed_at = CASE WHEN ? IN ('completed','failed') THEN datetime('now','localtime') ELSE NULL END
      WHERE id = ?
    `).run(status, error || null, status, spreadsheetRunId);
  } catch (error) {
    throw new Error(`Gagal updateSpreadsheetRunStatus ${spreadsheetRunId}: ${error.message}`, { cause: error });
  }
}
