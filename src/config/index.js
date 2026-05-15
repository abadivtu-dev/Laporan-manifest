import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const required = [
  'SPREADSHEET_MONTHLY_IDS',
  'INVOICE_SPREADSHEET_ID',
  'WA_GROUP_JID',
];

const defaults = {
  TZ: 'Asia/Jakarta',
  REPORT_TIME: '21:00',
  WA_MIN_DELAY_MS: '4000',
  WA_MAX_DELAY_MS: '8000',
  MAX_SPREADSHEET_RETRY: '3',
  MAX_PAKET_RETRY: '3',
  MAX_WA_SEND_RETRY: '3',
  PIPELINE_TIMEOUT_MS: '1800000',
  WA_GROUP_NAME: 'Laporan Manifest Umroh',
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
    wa: {
      groupJid: process.env.WA_GROUP_JID,
      groupName: process.env.WA_GROUP_NAME,
      minDelayMs: parseInt(process.env.WA_MIN_DELAY_MS, 10),
      maxDelayMs: parseInt(process.env.WA_MAX_DELAY_MS, 10),
    },
    retry: {
      maxSpreadsheetRetry: parseInt(process.env.MAX_SPREADSHEET_RETRY, 10),
      maxPaketRetry: parseInt(process.env.MAX_PAKET_RETRY, 10),
      maxWaSendRetry: parseInt(process.env.MAX_WA_SEND_RETRY, 10),
    },
    pipelineTimeoutMs: parseInt(process.env.PIPELINE_TIMEOUT_MS, 10),
  };
}

export const config = loadConfig();
