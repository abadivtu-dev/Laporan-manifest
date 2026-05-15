import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

let testDb;

vi.mock('../../../src/storage/database.js', () => ({
  getDatabase: () => testDb,
}));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sent_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spreadsheet_id TEXT NOT NULL,
  paket_code TEXT NOT NULL,
  report_date TEXT NOT NULL,
  wa_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  attempts INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  sent_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(spreadsheet_id, paket_code, report_date)
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  spreadsheets_total INTEGER DEFAULT 0,
  spreadsheets_done INTEGER DEFAULT 0,
  pakets_total INTEGER DEFAULT 0,
  pakets_done INTEGER DEFAULT 0,
  pakets_failed INTEGER DEFAULT 0,
  started_at TEXT DEFAULT (datetime('now','localtime')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS spreadsheet_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline_run_id INTEGER NOT NULL,
  spreadsheet_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paket_count INTEGER DEFAULT 0,
  paket_done INTEGER DEFAULT 0,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (pipeline_run_id) REFERENCES pipeline_runs(id)
);

CREATE TABLE IF NOT EXISTS paket_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spreadsheet_run_id INTEGER NOT NULL,
  paket_code TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (spreadsheet_run_id) REFERENCES spreadsheet_runs(id)
);
`;

beforeEach(() => {
  testDb = new Database(':memory:');
  testDb.exec(SCHEMA);
});

afterEach(() => {
  if (testDb) {
    testDb.close();
  }
});

const reportLog = await import('../../../src/storage/report-log.js');
const {
  logSentReport,
  isAlreadySent,
  getFailedReports,
  updateReportStatus,
  logPipelineRun,
  logSpreadsheetRun,
  logPaketRun,
  updatePaketRunStatus,
  updateSpreadsheetRunStatus,
} = reportLog;

describe('report-log', () => {
  describe('logSentReport', () => {
    it('mencatat laporan yang terkirim', async () => {
      const result = await logSentReport({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        reportDate: '2026-05-15',
        waMessageId: 'WA123',
        status: 'sent',
      });

      expect(result).toBeDefined();
      expect(result.spreadsheet_id).toBe('sheet-1');
      expect(result.paket_code).toBe('PKG-001');
      expect(result.report_date).toBe('2026-05-15');
      expect(result.wa_message_id).toBe('WA123');
      expect(result.status).toBe('sent');
      expect(result.attempts).toBe(1);
    });

    it('menggunakan status default "sent" jika tidak disediakan', async () => {
      const result = await logSentReport({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        reportDate: '2026-05-15',
        waMessageId: 'WA123',
      });

      expect(result.status).toBe('sent');
    });

    it('menolak duplikat (unique constraint) untuk spreadsheet_id, paket_code, report_date yang sama', async () => {
      await logSentReport({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        reportDate: '2026-05-15',
        waMessageId: 'WA123',
        status: 'sent',
      });

      await expect(logSentReport({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        reportDate: '2026-05-15',
        waMessageId: 'WA456',
        status: 'sent',
      })).rejects.toThrow();
    });

    it('mengizinkan duplikat jika spreadsheet_id berbeda', async () => {
      await logSentReport({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        reportDate: '2026-05-15',
        waMessageId: 'WA123',
        status: 'sent',
      });

      const result = await logSentReport({
        spreadsheetId: 'sheet-2',
        paketCode: 'PKG-001',
        reportDate: '2026-05-15',
        waMessageId: 'WA456',
        status: 'sent',
      });

      expect(result).toBeDefined();
    });
  });

  describe('isAlreadySent', () => {
    it('mengembalikan true jika laporan sudah dikirim', async () => {
      await logSentReport({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        reportDate: '2026-05-15',
        waMessageId: 'WA123',
        status: 'sent',
      });

      const result = await isAlreadySent('sheet-1', 'PKG-001', '2026-05-15');
      expect(result).toBe(true);
    });

    it('mengembalikan false jika laporan belum dikirim', async () => {
      const result = await isAlreadySent('sheet-1', 'PKG-001', '2026-05-15');
      expect(result).toBe(false);
    });

    it('mengembalikan false jika hanya kombinasi parsial yang cocok', async () => {
      await logSentReport({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        reportDate: '2026-05-15',
        waMessageId: 'WA123',
        status: 'sent',
      });

      const result = await isAlreadySent('sheet-1', 'PKG-002', '2026-05-15');
      expect(result).toBe(false);
    });
  });

  describe('getFailedReports', () => {
    it('mengembalikan daftar laporan gagal pada tanggal tertentu', async () => {
      await logSentReport({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        reportDate: '2026-05-15',
        waMessageId: null,
        status: 'failed',
      });

      await logSentReport({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-002',
        reportDate: '2026-05-15',
        waMessageId: null,
        status: 'failed',
      });

      await logSentReport({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-003',
        reportDate: '2026-05-15',
        waMessageId: 'WA789',
        status: 'sent',
      });

      const results = await getFailedReports('2026-05-15');
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.paket_code)).toEqual(expect.arrayContaining(['PKG-001', 'PKG-002']));
    });

    it('mengembalikan array kosong jika tidak ada laporan gagal', async () => {
      const results = await getFailedReports('2026-05-15');
      expect(results).toEqual([]);
    });
  });

  describe('updateReportStatus', () => {
    it('memperbarui status dan error laporan', async () => {
      await logSentReport({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        reportDate: '2026-05-15',
        waMessageId: 'WA123',
        status: 'sent',
      });

      await updateReportStatus('sheet-1', 'PKG-001', '2026-05-15', {
        status: 'failed',
        errorMessage: 'WA send timeout',
      });

      const updated = testDb.prepare(
        'SELECT status, last_error FROM sent_reports WHERE spreadsheet_id = ? AND paket_code = ? AND report_date = ?'
      ).get('sheet-1', 'PKG-001', '2026-05-15');

      expect(updated.status).toBe('failed');
      expect(updated.last_error).toBe('WA send timeout');
    });

    it('tidak memengaruhi laporan lain saat memperbarui', async () => {
      await logSentReport({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        reportDate: '2026-05-15',
        waMessageId: 'WA123',
        status: 'sent',
      });

      await logSentReport({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-002',
        reportDate: '2026-05-15',
        waMessageId: 'WA456',
        status: 'sent',
      });

      await updateReportStatus('sheet-1', 'PKG-001', '2026-05-15', {
        status: 'failed',
        errorMessage: 'error',
      });

      const unchanged = testDb.prepare(
        'SELECT status FROM sent_reports WHERE paket_code = ?'
      ).get('PKG-002');

      expect(unchanged.status).toBe('sent');
    });
  });

  describe('pipeline tracking', () => {
    let pipelineRunId, spreadsheetRunId, paketRunId;

    it('logPipelineRun: mencatat pipeline run baru', async () => {
      const result = await logPipelineRun({ runDate: '2026-05-15' });

      expect(result).toBeDefined();
      expect(result.run_date).toBe('2026-05-15');
      expect(result.status).toBe('running');

      pipelineRunId = result.id;
    });

    it('logSpreadsheetRun: mencatat spreadsheet run', async () => {
      const pipelineRun = await logPipelineRun({ runDate: '2026-05-15' });
      pipelineRunId = pipelineRun.id;

      const result = await logSpreadsheetRun({
        pipelineRunId,
        spreadsheetId: 'sheet-1',
        sortOrder: 1,
      });

      expect(result).toBeDefined();
      expect(result.pipeline_run_id).toBe(pipelineRunId);
      expect(result.spreadsheet_id).toBe('sheet-1');
      expect(result.sort_order).toBe(1);
      expect(result.status).toBe('pending');

      spreadsheetRunId = result.id;
    });

    it('logPaketRun: mencatat paket run baru', async () => {
      const pipelineRun = await logPipelineRun({ runDate: '2026-05-15' });
      const spreadsheetRun = await logSpreadsheetRun({
        pipelineRunId: pipelineRun.id,
        spreadsheetId: 'sheet-1',
        sortOrder: 1,
      });

      const result = await logPaketRun({
        spreadsheetRunId: spreadsheetRun.id,
        paketCode: 'PKG-001',
        sortOrder: 1,
      });

      expect(result).toBeDefined();
      expect(result.spreadsheet_run_id).toBe(spreadsheetRun.id);
      expect(result.paket_code).toBe('PKG-001');
      expect(result.sort_order).toBe(1);
      expect(result.status).toBe('pending');
      expect(result.attempts).toBe(0);

      paketRunId = result.id;
    });

    it('updatePaketRunStatus: memperbarui status paket run', async () => {
      const pipelineRun = await logPipelineRun({ runDate: '2026-05-15' });
      const spreadsheetRun = await logSpreadsheetRun({
        pipelineRunId: pipelineRun.id,
        spreadsheetId: 'sheet-1',
        sortOrder: 1,
      });
      const paketRun = await logPaketRun({
        spreadsheetRunId: spreadsheetRun.id,
        paketCode: 'PKG-001',
        sortOrder: 1,
      });

      await updatePaketRunStatus(paketRun.id, 'completed', null);

      const updated = testDb.prepare('SELECT status, last_error FROM paket_runs WHERE id = ?').get(paketRun.id);
      expect(updated.status).toBe('completed');
      expect(updated.last_error).toBeNull();
    });

    it('updatePaketRunStatus: mencatat error jika ada', async () => {
      const pipelineRun = await logPipelineRun({ runDate: '2026-05-15' });
      const spreadsheetRun = await logSpreadsheetRun({
        pipelineRunId: pipelineRun.id,
        spreadsheetId: 'sheet-1',
        sortOrder: 1,
      });
      const paketRun = await logPaketRun({
        spreadsheetRunId: spreadsheetRun.id,
        paketCode: 'PKG-001',
        sortOrder: 1,
      });

      await updatePaketRunStatus(paketRun.id, 'failed', 'Connection timeout');

      const updated = testDb.prepare('SELECT status, last_error FROM paket_runs WHERE id = ?').get(paketRun.id);
      expect(updated.status).toBe('failed');
      expect(updated.last_error).toBe('Connection timeout');
    });

    it('updateSpreadsheetRunStatus: memperbarui status spreadsheet run', async () => {
      const pipelineRun = await logPipelineRun({ runDate: '2026-05-15' });
      const spreadsheetRun = await logSpreadsheetRun({
        pipelineRunId: pipelineRun.id,
        spreadsheetId: 'sheet-1',
        sortOrder: 1,
      });

      await updateSpreadsheetRunStatus(spreadsheetRun.id, 'completed', null);

      const updated = testDb.prepare('SELECT status, error FROM spreadsheet_runs WHERE id = ?').get(spreadsheetRun.id);
      expect(updated.status).toBe('completed');
      expect(updated.error).toBeNull();
    });
  });
});
