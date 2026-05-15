import { getPreviousSnapshot, saveSnapshot } from '../storage/snapshot-store.js';
import { logSentReport, logPaketRun, updatePaketRunStatus } from '../storage/report-log.js';
import { detectNewJamaah } from '../comparator/engine.js';
import { crosscheckWithInvoice } from '../comparator/crosscheck.js';
import { renderMultiPageScreenshots } from '../reporter/screenshotter.js';
import { CaptionBuilder } from '../reporter/caption-builder.js';
import { retryWithBackoff } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

export async function processPaket({
  spreadsheetId,
  paket,
  invoiceMap,
  reportDate,
  messageQueue,
  sock,
  groupJid,
  config,
  spreadsheetRunId,
}) {
  const paketCode = paket.kodePaket;
  const paketRunId = logPaketRun({ spreadsheetRunId, paketCode, sortOrder: 0 });

  try {
    logger.info(`[paket] processing: ${paketCode} (${paket.jamaah.length} jamaah)`);

    const yesterdaySnapshot = getPreviousSnapshot(spreadsheetId, paketCode, reportDate);
    const yesterdayData = yesterdaySnapshot ? JSON.parse(yesterdaySnapshot.data_json) : null;

    const diffResult = detectNewJamaah(yesterdayData, paket.jamaah);

    let crossResult = {
      jamaahBaru: diffResult.newJamaah,
      jamaahPindahan: [],
    };
    if (invoiceMap && diffResult.newCount > 0) {
      crossResult = crosscheckWithInvoice(diffResult.newJamaah, invoiceMap, paket.namaPaket);
    }

    const photos = await renderMultiPageScreenshots(paket, reportDate);

    const captionData = {
      packageData: {
        namaPaket: paket.namaPaket,
        tanggal: paket.tanggal,
        maskapai: paket.maskapai,
        rute: paket.rute,
        totalJamaah: paket.jamaah.length,
        maxSeat: paket.totalSeat,
        sisaSeat: paket.sisaSeat,
      },
      newJamaahList: crossResult.jamaahBaru.map((j) => j.NAMA),
      pindahanList: crossResult.jamaahPindahan.map((j) => ({
        nama: j.NAMA,
        dariPaket: j.paketAsal || 'paket lain',
      })),
      keluarList: diffResult.removedJamaah.map((j) => j.NAMA),
      isFirstRun: diffResult.isFirstRun,
      lastSnapshotDate: yesterdaySnapshot?.snapshot_date || null,
    };

    const caption = new CaptionBuilder().build(captionData);

    const msgResult = await retryWithBackoff(
      async () => {
        return await messageQueue.sendToGroup(sock, groupJid, photos[0], caption);
      },
      { maxAttempts: config.retry.maxWaSendRetry, baseDelayMs: 5000, context: `paket=${paketCode}` }
    );

    saveSnapshot({
      spreadsheetId,
      paketCode,
      snapshotDate: reportDate,
      jamaahData: paket.jamaah,
    });

    logSentReport({
      spreadsheetId,
      paketCode,
      reportDate,
      waMessageId: msgResult.messageId,
      status: msgResult.success ? 'sent' : 'failed',
    });

    updatePaketRunStatus(paketRunId, 'completed', null);

    const totalBaru = crossResult.jamaahBaru.length + crossResult.jamaahPindahan.length;
    logger.info(`[paket] ${paketCode}: ${totalBaru} new (${crossResult.jamaahBaru.length} murni, ${crossResult.jamaahPindahan.length} pindahan), sent=${msgResult.success}`);

    return { paketCode, success: msgResult.success, paketRunId };
  } catch (error) {
    logger.error(`[paket] ${paketCode} failed: ${error.message}`);
    updatePaketRunStatus(paketRunId, 'failed', error.message);
    throw error;
  }
}
