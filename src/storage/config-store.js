import { getDatabase } from './database.js';

/**
 * Mengambil nilai konfigurasi berdasarkan key.
 * @param {string} key
 * @returns {Promise<string|null>}
 */
export async function getConfig(key) {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
    return row ? row.value : null;
  } catch (error) {
    throw new Error(`Gagal membaca config ${key}: ${error.message}`, { cause: error });
  }
}

/**
 * Menyimpan atau mengupdate nilai konfigurasi.
 * @param {string} key
 * @param {string|number|boolean} value
 * @returns {Promise<void>}
 */
export async function setConfig(key, value) {
  try {
    const db = getDatabase();
    const stringValue = String(value);
    db.prepare(
      'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, stringValue);
  } catch (error) {
    throw new Error(`Gagal menyimpan config ${key}: ${error.message}`, { cause: error });
  }
}
