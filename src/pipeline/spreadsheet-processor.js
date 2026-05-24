import { fetchManifestData } from '../sheets/manifest-reader.js';
import { fetchInvoiceData, fetchSeasonData } from '../sheets/invoice-reader.js';
import { logSpreadsheetRun, updateSpreadsheetRunStatus } from '../storage/report-log.js';
import { processPaket } from './paket-processor.js';
import { logger } from '../utils/logger.js';

export async function processSpreadsheet({
  spreadsheetId,
  invoiceSpreadsheetId,
  reportDate,
  sortOrder,
  pipelineRunId,
}) {
  const sheetRun = await logSpreadsheetRun({ pipelineRunId, spreadsheetId, sortOrder });

  try {
    logger.info(`[spreadsheet] fetching: ${spreadsheetId}`);

    const manifest = await fetchManifestData(spreadsheetId);
    const invoiceMap = await fetchInvoiceData(invoiceSpreadsheetId);
    const seasonMap = await fetchSeasonData(invoiceSpreadsheetId, reportDate);

    logger.info(`[spreadsheet] ${spreadsheetId}: ${manifest.length} pakets`);

    for (const paket of manifest) {
      const validJamaah = (paket.jamaah || []).filter((j) => {
        const idReg = (j.idRegister || '').toString().trim();
        if (!idReg) return false;
        if (idReg.startsWith('#')) return false;        // #N/A, #ERROR!, #VALUE!, #REF!
        if (idReg.toUpperCase() === 'N/A') return false; // N/A tanpa #
        if (idReg === '-' || idReg === '--') return false;
        return idReg.length >= 2;
      });
      if (validJamaah.length === 0) {
        logger.info(`[spreadsheet] ${spreadsheetId}: skip ${paket.metadata.kodePaket} (0 jamaah valid)`);
        continue;
      }

      await processPaket({
        spreadsheetId,
        paket,
        invoiceMap,
        seasonMap,
        reportDate,
        spreadsheetRunId: sheetRun.id,
      });
    }

    await updateSpreadsheetRunStatus(sheetRun.id, 'completed', null);
    logger.info(`[spreadsheet] ${spreadsheetId}: all ${manifest.length} pakets done`);
    return { spreadsheetId, success: true };
  } catch (error) {
    logger.error(`[spreadsheet] ${spreadsheetId} failed: ${error.message}`);
    await updateSpreadsheetRunStatus(sheetRun.id, 'failed', error.message);
    throw error;
  }
}
