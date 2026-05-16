import { getDatabase } from '../storage/database.js';
import { logPipelineRun } from '../storage/report-log.js';
import { processSpreadsheet } from './spreadsheet-processor.js';
import { startBot, getSocket, isConnected } from '../sender/wa-client.js';
import { findGroup } from '../sender/group-finder.js';
import { MessageQueue } from '../sender/message-queue.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export async function runPipeline({ reportDate = todayDate() } = {}) {
  logger.info(`[pipeline] starting for ${reportDate}`);

  if (!acquireLock(reportDate)) {
    logger.warn('[pipeline] already running, exiting');
    return { status: 'skipped', reason: 'already_running' };
  }

  const pipeRun = await logPipelineRun({ runDate: reportDate });

  try {
    logger.info('[pipeline] initializing WA client...');
    const sock = await startBot();
    if (!isConnected(sock)) {
      throw new Error('WA client failed to connect');
    }

    const groupJid = await findGroup(sock, config.wa.groupJid, config.wa.groupName);
    logger.info(`[pipeline] target group: ${groupJid}`);

    const messageQueue = new MessageQueue({
      minDelayMs: config.wa.minDelayMs,
      maxDelayMs: config.wa.maxDelayMs,
    });

    let spreadsheetsDone = 0;
    let paketsFailed = 0;

    for (let i = 0; i < config.spreadsheetIds.length; i++) {
      const sheetId = config.spreadsheetIds[i];

      try {
        await processSpreadsheet({
          spreadsheetId: sheetId,
          invoiceSpreadsheetId: config.invoiceSpreadsheetId,
          reportDate,
          sortOrder: i,
          messageQueue,
          sock,
          groupJid,
          config,
          pipelineRunId: pipeRun.id,
        });
        spreadsheetsDone++;
      } catch (error) {
        logger.error(`[pipeline] spreadsheet ${sheetId} failed: ${error.message}`);
      }
    }

    const stats = messageQueue.getStats();
    logger.info(`[pipeline] completed: ${spreadsheetsDone}/${config.spreadsheetIds.length} spreadsheets, ${stats.sent} WA msgs sent, ${stats.failed} failed`);

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
