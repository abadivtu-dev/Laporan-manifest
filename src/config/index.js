import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const required = [
  'SPREADSHEET_MONTHLY_IDS',
  'INVOICE_SPREADSHEET_ID',
  'TELEGRAM_CHAT_ID',
];

const defaults = {
  TZ: 'Asia/Jakarta',
  REPORT_TIME: '21:00',
  MAX_SPREADSHEET_RETRY: '3',
  MAX_PAKET_RETRY: '3',
  MAX_TELEGRAM_RETRY: '3',
  PIPELINE_TIMEOUT_MS: '1800000',
  ADMIN_PORT: '3456',
  TELEGRAM_BOT_TOKEN: '',
};

function loadConfig() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  for (const [key, val] of Object.entries(defaults)) {
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }

  return {
    tz: process.env.TZ,
    reportTime: process.env.REPORT_TIME,
    spreadsheetIds: process.env.SPREADSHEET_MONTHLY_IDS.split(',').map((s) => s.trim()),
    invoiceSpreadsheetId: process.env.INVOICE_SPREADSHEET_ID,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    retry: {
      maxSpreadsheetRetry: parseInt(process.env.MAX_SPREADSHEET_RETRY, 10),
      maxPaketRetry: parseInt(process.env.MAX_PAKET_RETRY, 10),
      maxTelegramRetry: parseInt(process.env.MAX_TELEGRAM_RETRY, 10),
    },
    pipelineTimeoutMs: parseInt(process.env.PIPELINE_TIMEOUT_MS, 10),
    adminPort: parseInt(process.env.ADMIN_PORT, 10),
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  };
}

export const config = loadConfig();

/**
 * Resolve spreadsheet IDs — database dulu, fallback ke .env.
 * Harus dipanggil setelah database diinisialisasi.
 * @returns {Promise<string[]>}
 */
export async function resolveSpreadsheetIds() {
  try {
    const { getSpreadsheetIds } = await import('../storage/spreadsheet-config.js');
    const items = await getSpreadsheetIds();
    if (items && items.length > 0) {
      return items.map((entry) => entry.id);
    }
  } catch {
    // DB not ready or error — fall through to env
  }
  return config.spreadsheetIds;
}
