import { fetchManifestData } from '../sheets/manifest-reader.js';
import { fetchInvoiceData } from '../sheets/invoice-reader.js';
import { logSpreadsheetRun, updateSpreadsheetRunStatus } from '../storage/report-log.js';
import { processPaket } from './paket-processor.js';
import { logger } from '../utils/logger.js';

export async function processSpreadsheet({
  spreadsheetId,
  invoiceSpreadsheetId,
  reportDate,
  sortOrder,
  messageQueue,
  sock,
  groupJid,
  config,
  pipelineRunId,
}) {
  const sheetRun = await logSpreadsheetRun({ pipelineRunId, spreadsheetId, sortOrder });

  try {
    logger.info(`[spreadsheet] fetching: ${spreadsheetId}`);

    const manifest = await fetchManifestData(spreadsheetId);
    const invoiceMap = await fetchInvoiceData(invoiceSpreadsheetId);

    logger.info(`[spreadsheet] ${spreadsheetId}: ${manifest.pakets.length} pakets`);

    for (const paket of manifest.pakets) {
      await processPaket({
        spreadsheetId,
        paket,
        invoiceMap,
        reportDate,
        messageQueue,
        sock,
        groupJid,
        config,
        spreadsheetRunId: sheetRun.id,
      });
    }

    await updateSpreadsheetRunStatus(sheetRun.id, 'completed', null);
    logger.info(`[spreadsheet] ${spreadsheetId}: all ${manifest.pakets.length} pakets done`);
    return { spreadsheetId, success: true };
  } catch (error) {
    logger.error(`[spreadsheet] ${spreadsheetId} failed: ${error.message}`);
    await updateSpreadsheetRunStatus(sheetRun.id, 'failed', error.message);
    throw error;
  }
}
