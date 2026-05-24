import { getDatabase } from '../storage/database.js';
import { logPipelineRun } from '../storage/report-log.js';
import { processSpreadsheet } from './spreadsheet-processor.js';
import { config, resolveSpreadsheetIds } from '../config/index.js';
import { getSpreadsheetIds } from '../storage/spreadsheet-config.js';
import { sendTextToTelegram } from '../sender/telegram-sender.js';
import { logger } from '../utils/logger.js';

export async function runPipeline({ reportDate = todayDate() } = {}) {
  logger.info(`[pipeline] starting for ${reportDate}`);

  if (!config.telegramBotToken || !config.telegramChatId) {
    logger.error('[pipeline] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured');
    return { status: 'failed', error: 'Telegram config missing' };
  }

  if (!acquireLock(reportDate)) {
    logger.warn('[pipeline] already running, exiting');
    return { status: 'skipped', reason: 'already_running' };
  }

  const pipeRun = await logPipelineRun({ runDate: reportDate });

  try {
    const sheetIds = await resolveSpreadsheetIds();
    let configItems = [];
    try {
      configItems = await getSpreadsheetIds();
    } catch {
      // fallback: pakai ID saja
    }

    const labelMap = new Map();
    for (const item of configItems) {
      labelMap.set(item.id, item.label || '');
    }

    let spreadsheetsDone = 0;

    for (let i = 0; i < sheetIds.length; i++) {
      const sheetId = sheetIds[i];

      try {
        const label = labelMap.get(sheetId) || `Spreadsheet ${i + 1}`;
        await sendTextToTelegram(
          config.telegramChatId,
          `⭐ ⭐ ⭐ <b>${label}</b> ⭐ ⭐ ⭐`,
        );

        await processSpreadsheet({
          spreadsheetId: sheetId,
          invoiceSpreadsheetId: config.invoiceSpreadsheetId,
          reportDate,
          sortOrder: i,
          pipelineRunId: pipeRun.id,
        });
        spreadsheetsDone++;
      } catch (error) {
        logger.error(`[pipeline] spreadsheet ${sheetId} failed: ${error.message}`);
      }
    }

    logger.info(`[pipeline] completed: ${spreadsheetsDone}/${sheetIds.length} spreadsheets`);
    completePipeline(pipeRun.id, 'completed');
    return { status: 'completed', spreadsheetsDone };
  } catch (error) {
    logger.error(`[pipeline] fatal: ${error.message}`);
    completePipeline(pipeRun.id, 'failed');
    return { status: 'failed', error: error.message };
  }
}

function acquireLock(runDate) {
  const db = getDatabase();
  const active = db
    .prepare(`SELECT id, started_at FROM pipeline_runs WHERE run_date = ? AND status = 'running'`)
    .get(runDate);

  if (active) {
    const startedAt = new Date(active.started_at + 'Z');
    const ageSeconds = (Date.now() - startedAt.getTime()) / 1000;
    if (ageSeconds > config.pipelineTimeoutMs / 1000) {
      logger.warn(`[pipeline] stale lock detected (${Math.round(ageSeconds)}s), overriding`);
      db.prepare(`UPDATE pipeline_runs SET status = 'timed_out' WHERE id = ?`).run(active.id);
      return true;
    }
    return false;
  }
  return true;
}

function completePipeline(pipeRunId, status) {
  const db = getDatabase();
  db.prepare(
    `UPDATE pipeline_runs SET status = ?, completed_at = datetime('now','localtime') WHERE id = ?`
  ).run(status, pipeRunId);
}

function todayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: config.tz });
}
