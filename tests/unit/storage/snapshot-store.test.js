import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

let testDb;

vi.mock('../../../src/storage/database.js', () => ({
  getDatabase: () => testDb,
}));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spreadsheet_id TEXT NOT NULL,
  paket_code TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  jamaah_hash TEXT NOT NULL,
  jamaah_count INTEGER NOT NULL DEFAULT 0,
  data_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(spreadsheet_id, paket_code, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_lookup
  ON snapshots(spreadsheet_id, paket_code, snapshot_date);
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

// Import after mock setup
const snapshotStore = await import('../../../src/storage/snapshot-store.js');
const { saveSnapshot, getPreviousSnapshot, getSnapshot, cleanOldSnapshots } = snapshotStore;

describe('snapshot-store', () => {
  const sampleData = [
    { nik: '001', nama: 'Andi' },
    { nik: '002', nama: 'Budi' },
  ];

  describe('saveSnapshot', () => {
    it('menyimpan snapshot baru ke database', async () => {
      const result = await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-15',
        jamaahData: sampleData,
      });

      expect(result).toBeDefined();
      expect(result.spreadsheet_id).toBe('sheet-1');
      expect(result.paket_code).toBe('PKG-001');
      expect(result.snapshot_date).toBe('2026-05-15');
      expect(result.jamaah_count).toBe(2);
      expect(result.jamaah_hash).toBeDefined();
      expect(result.jamaah_hash.length).toBe(64); // SHA256 hex
      expect(result.data_json).toBe(JSON.stringify(sampleData));
    });

    it('mengupdate snapshot yang sudah ada (upsert) pada tanggal sama', async () => {
      await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-15',
        jamaahData: sampleData,
      });

      const updatedData = [
        { nik: '001', nama: 'Andi' },
        { nik: '002', nama: 'Budi' },
        { nik: '003', nama: 'Cici' },
      ];

      const result = await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-15',
        jamaahData: updatedData,
      });

      expect(result.jamaah_count).toBe(3);
      expect(result.data_json).toBe(JSON.stringify(updatedData));

      // Pastikan hanya 1 row di database (upsert bukan insert baru)
      const rows = testDb.prepare(
        'SELECT COUNT(*) as count FROM snapshots WHERE spreadsheet_id = ? AND paket_code = ? AND snapshot_date = ?'
      ).get('sheet-1', 'PKG-001', '2026-05-15');
      expect(rows.count).toBe(1);
    });

    it('melempar error jika jamaahData tidak valid', async () => {
      await expect(saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-15',
        jamaahData: null,
      })).rejects.toThrow();
    });

    it('menghasilkan hash yang berbeda untuk data berbeda', async () => {
      const r1 = await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-15',
        jamaahData: sampleData,
      });

      const r2 = await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-16',
        jamaahData: [
          { nik: '001', nama: 'Andi' },
        ],
      });

      expect(r1.jamaah_hash).not.toBe(r2.jamaah_hash);
    });
  });

  describe('getPreviousSnapshot', () => {
    it('mengambil snapshot terakhir sebelum tanggal tertentu', async () => {
      await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-14',
        jamaahData: [{ nik: '001', nama: 'Andi' }],
      });

      await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-15',
        jamaahData: sampleData,
      });

      const result = await getPreviousSnapshot('sheet-1', 'PKG-001', '2026-05-16');
      expect(result).toBeDefined();
      expect(result.snapshot_date).toBe('2026-05-15');
      expect(result.jamaah_count).toBe(2);
    });

    it('mengembalikan null jika tidak ada snapshot sebelumnya', async () => {
      const result = await getPreviousSnapshot('sheet-1', 'PKG-001', '2026-05-16');
      expect(result).toBeNull();
    });

    it('mengembalikan null jika hanya ada snapshot setelah tanggal', async () => {
      await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-17',
        jamaahData: sampleData,
      });

      const result = await getPreviousSnapshot('sheet-1', 'PKG-001', '2026-05-16');
      expect(result).toBeNull();
    });

    it('mengambil snapshot paling terakhir (bukan pertama) sebelum tanggal', async () => {
      await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-10',
        jamaahData: [{ nik: '001', nama: 'Andi' }],
      });

      await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-12',
        jamaahData: [{ nik: '001', nama: 'Andi' }, { nik: '002', nama: 'Budi' }],
      });

      const result = await getPreviousSnapshot('sheet-1', 'PKG-001', '2026-05-14');
      expect(result.snapshot_date).toBe('2026-05-12');
      expect(result.jamaah_count).toBe(2);
    });

    it('memfilter berdasarkan spreadsheet_id', async () => {
      await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-15',
        jamaahData: sampleData,
      });

      const result = await getPreviousSnapshot('sheet-2', 'PKG-001', '2026-05-16');
      expect(result).toBeNull();
    });
  });

  describe('getSnapshot', () => {
    it('mengambil snapshot pada tanggal exact', async () => {
      await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-15',
        jamaahData: sampleData,
      });

      const result = await getSnapshot('sheet-1', 'PKG-001', '2026-05-15');
      expect(result).toBeDefined();
      expect(result.snapshot_date).toBe('2026-05-15');
      expect(result.jamaah_count).toBe(2);
    });

    it('mengembalikan null jika snapshot tidak ditemukan', async () => {
      const result = await getSnapshot('sheet-1', 'PKG-001', '2026-05-15');
      expect(result).toBeNull();
    });

    it('tidak mengembalikan snapshot dari tanggal lain', async () => {
      await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-14',
        jamaahData: sampleData,
      });

      const result = await getSnapshot('sheet-1', 'PKG-001', '2026-05-15');
      expect(result).toBeNull();
    });

    it('tidak mengembalikan snapshot dari spreadsheet_id berbeda', async () => {
      await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-15',
        jamaahData: sampleData,
      });

      const result = await getSnapshot('sheet-2', 'PKG-001', '2026-05-15');
      expect(result).toBeNull();
    });
  });

  describe('cleanOldSnapshots', () => {
    it('menghapus snapshot yang lebih tua dari retention days', async () => {
      await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-01-15',
        jamaahData: sampleData,
      });

      await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-15',
        jamaahData: sampleData,
      });

      const deleted = await cleanOldSnapshots(90);

      const remaining = testDb.prepare('SELECT COUNT(*) as count FROM snapshots').get();
      expect(remaining.count).toBe(1);

      const keptSnapshot = testDb.prepare('SELECT snapshot_date FROM snapshots').get();
      expect(keptSnapshot.snapshot_date).toBe('2026-05-15');
    });

    it('tidak menghapus snapshot yang masih dalam rentang', async () => {
      await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-10',
        jamaahData: sampleData,
      });

      await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-05-14',
        jamaahData: sampleData,
      });

      await cleanOldSnapshots(7);

      const remaining = testDb.prepare('SELECT COUNT(*) as count FROM snapshots').get();
      expect(remaining.count).toBe(2);
    });

    it('menggunakan retentionDays default 90 jika tidak disediakan', async () => {
      await saveSnapshot({
        spreadsheetId: 'sheet-1',
        paketCode: 'PKG-001',
        snapshotDate: '2026-01-01',
        jamaahData: sampleData,
      });

      const deleted = await cleanOldSnapshots();

      const row = testDb.prepare('SELECT COUNT(*) as count FROM snapshots').get();
      // January 1, 2026 is definitely more than 90 days from now (May 15, 2026)
      expect(row.count).toBe(0);
    });
  });
});
