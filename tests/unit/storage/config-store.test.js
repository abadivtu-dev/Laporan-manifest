import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

let testDb;

vi.mock('../../../src/storage/database.js', () => ({
  getDatabase: () => testDb,
}));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
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

const configStore = await import('../../../src/storage/config-store.js');
const { getConfig, setConfig } = configStore;

describe('config-store', () => {
  describe('setConfig', () => {
    it('menyimpan konfigurasi baru', async () => {
      await setConfig('report_time', '21:00');

      const row = testDb.prepare('SELECT key, value FROM config WHERE key = ?').get('report_time');
      expect(row.key).toBe('report_time');
      expect(row.value).toBe('21:00');
    });

    it('mengupdate konfigurasi yang sudah ada', async () => {
      testDb.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('report_time', '20:00');

      await setConfig('report_time', '21:30');

      const row = testDb.prepare('SELECT value FROM config WHERE key = ?').get('report_time');
      expect(row.value).toBe('21:30');
    });

    it('menyimpan berbagai tipe nilai sebagai string', async () => {
      await setConfig('max_retry', 3);

      const row = testDb.prepare('SELECT value FROM config WHERE key = ?').get('max_retry');
      expect(row.value).toBe('3');
    });

    it('menyimpan nilai boolean sebagai string', async () => {
      await setConfig('debug_mode', true);

      const row = testDb.prepare('SELECT value FROM config WHERE key = ?').get('debug_mode');
      expect(row.value).toBe('true');
    });
  });

  describe('getConfig', () => {
    it('mengembalikan nilai konfigurasi yang ada', async () => {
      testDb.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('report_time', '21:00');

      const value = await getConfig('report_time');
      expect(value).toBe('21:00');
    });

    it('mengembalikan null untuk konfigurasi yang tidak ada', async () => {
      const value = await getConfig('nonexistent_key');
      expect(value).toBeNull();
    });

    it('mengembalikan nilai numerik sebagai string', async () => {
      testDb.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('max_retry', '5');

      const value = await getConfig('max_retry');
      expect(value).toBe('5');
    });
  });

  describe('getConfig dan setConfig bersama', () => {
    it('setConfig kemudian getConfig mengembalikan nilai yang sama', async () => {
      await setConfig('last_run', '2026-05-15 21:00:00');
      const value = await getConfig('last_run');
      expect(value).toBe('2026-05-15 21:00:00');
    });

    it('multiple key-value pairs bekerja dengan benar', async () => {
      await setConfig('key1', 'value1');
      await setConfig('key2', 'value2');
      await setConfig('key3', 'value3');

      expect(await getConfig('key1')).toBe('value1');
      expect(await getConfig('key2')).toBe('value2');
      expect(await getConfig('key3')).toBe('value3');
    });

    it('overwrite nilai yang sudah ada', async () => {
      await setConfig('my_key', 'old_value');
      await setConfig('my_key', 'new_value');

      expect(await getConfig('my_key')).toBe('new_value');
    });
  });
});
