import { getDatabase } from './database.js';

const CONFIG_KEY = 'spreadsheet_ids';

/**
 * Ambil semua spreadsheet ID dari database.
 * @returns {Promise<Array<{id: string, label: string}>>}
 */
export async function getSpreadsheetIds() {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(CONFIG_KEY);
    if (!row) return [];
    return JSON.parse(row.value);
  } catch (error) {
    throw new Error(`Gagal membaca ${CONFIG_KEY}: ${error.message}`, { cause: error });
  }
}

/**
 * Simpan seluruh daftar spreadsheet ID.
 * @param {Array<{id: string, label: string}>} items
 * @returns {Promise<void>}
 */
export async function replaceSpreadsheetIds(items) {
  try {
    const db = getDatabase();
    const json = JSON.stringify(items);
    db.prepare(
      'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(CONFIG_KEY, json);
  } catch (error) {
    throw new Error(`Gagal menyimpan ${CONFIG_KEY}: ${error.message}`, { cause: error });
  }
}

/**
 * Tambah satu spreadsheet ID ke daftar.
 * @param {string} id
 * @param {string} label
 * @returns {Promise<Array<{id: string, label: string}>>} daftar terbaru
 */
export async function addSpreadsheetId(id, label) {
  try {
    const trimmed = id.trim();
    if (!trimmed) throw new Error('Spreadsheet ID tidak boleh kosong');

    const items = await getSpreadsheetIds();
    if (items.some((item) => item.id === trimmed)) {
      throw new Error(`Spreadsheet ID "${trimmed}" sudah ada`);
    }

    items.push({ id: trimmed, label: (label || '').trim() });
    await replaceSpreadsheetIds(items);
    return items;
  } catch (error) {
    throw new Error(`Gagal menambah spreadsheet: ${error.message}`, { cause: error });
  }
}

/**
 * Hapus satu spreadsheet ID dari daftar.
 * @param {string} id
 * @returns {Promise<Array<{id: string, label: string}>>} daftar terbaru
 */
export async function removeSpreadsheetId(id) {
  try {
    const items = await getSpreadsheetIds();
    const filtered = items.filter((item) => item.id !== id);
    await replaceSpreadsheetIds(filtered);
    return filtered;
  } catch (error) {
    throw new Error(`Gagal menghapus spreadsheet: ${error.message}`, { cause: error });
  }
}
