import { getPreviousSnapshot, saveSnapshot } from '../storage/snapshot-store.js';
import { isAlreadySent, logSentReport, logPaketRun, updatePaketRunStatus } from '../storage/report-log.js';
import { detectNewJamaah } from '../comparator/engine.js';
import { renderMultiPageScreenshots } from '../reporter/screenshotter.js';
import { CaptionBuilder } from '../reporter/caption-builder.js';
import { sendToTelegram } from '../sender/telegram-sender.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Classify and group jamaah using SEASON 2026 invoice data.
 *
 * BT column values: KWITANSI BARU → new, PEMBAYARAN / GANTI PAKET → pindahan, CANCEL → excluded.
 * Grouping uses BV (JUMLAH ANGGOTA) and BW (NAMA pembawa) from invoice.
 */
function _classifyAndGroup(jamaahValid, seasonMap, currentPaketName) {
  const jamaahBaru = [];
  const jamaahPindahan = [];
  const groupMap = new Map();

  if (!seasonMap || seasonMap.size === 0) {
    return { jamaahBaru, jamaahPindahan, newGroups: [], pindahanGroups: [] };
  }

  for (const j of jamaahValid) {
    const seasonEntry = seasonMap.get(j.uniqueId);
    if (!seasonEntry) continue;

    const { statusInvoice, jumlahAnggota, namaPembawa, paketInvoice } = seasonEntry;
    const leaderName = namaPembawa || j.nama;
    const pax = jumlahAnggota || 1;

    if (statusInvoice === 'KWITANSI BARU') {
      jamaahBaru.push(j);
      if (!groupMap.has(leaderName)) {
        groupMap.set(leaderName, { leader: leaderName, pax, type: 'baru' });
      }
    } else if (statusInvoice === 'PEMBAYARAN' || statusInvoice === 'GANTI PAKET') {
      if (paketInvoice && paketInvoice !== currentPaketName) {
        jamaahPindahan.push(j);
        if (!groupMap.has(leaderName)) {
          groupMap.set(leaderName, {
            leader: leaderName,
            pax,
            type: 'pindahan',
            dariPaket: paketInvoice,
          });
        }
      }
    }
  }

  const newGroups = [...groupMap.values()]
    .filter((g) => g.type === 'baru')
    .map(({ leader, pax }) => ({ leader, pax }));
  const pindahanGroups = [...groupMap.values()]
    .filter((g) => g.type === 'pindahan')
    .map(({ leader, pax, dariPaket }) => ({ leader, pax, dariPaket }));

  return { jamaahBaru, jamaahPindahan, newGroups, pindahanGroups };
}

export async function processPaket({
  spreadsheetId,
  paket,
  invoiceMap,
  seasonMap,
  reportDate,
  spreadsheetRunId,
}) {
  const meta = paket.metadata;
  const paketCode = meta.kodePaket;

  if (await isAlreadySent(spreadsheetId, paketCode, reportDate, 'sent')) {
    logger.info(`[paket] ${paketCode}: already sent for ${reportDate}, skipping`);
    return { paketCode, success: true, skipped: true };
  }

  const paketRun = await logPaketRun({ spreadsheetRunId, paketCode, sortOrder: 0 });

  try {
    const jamaahValid = paket.jamaah.filter((j) => {
      const idReg = (j.idRegister || '').toString().trim();
      if (!idReg) return false;
      if (idReg.startsWith('#')) return false;        // #N/A, #ERROR!, #VALUE!, #REF!
      if (idReg.toUpperCase() === 'N/A') return false; // N/A tanpa #
      if (idReg === '-' || idReg === '--') return false;
      return idReg.length >= 2;
    });

    logger.info(`[paket] processing: ${paketCode} (${jamaahValid.length}/${paket.jamaah.length} jamaah valid)`);

    const yesterdaySnapshot = await getPreviousSnapshot(spreadsheetId, paketCode, reportDate);
    const yesterdayData = yesterdaySnapshot ? JSON.parse(yesterdaySnapshot.data_json) : null;
    const diffResult = detectNewJamaah(yesterdayData, jamaahValid);

    const { newGroups, pindahanGroups } = _classifyAndGroup(
      jamaahValid,
      seasonMap,
      meta.namaPaket,
    );

    const photos = await renderMultiPageScreenshots(paket, reportDate);

    const captionData = {
      packageData: {
        namaPaket: meta.namaPaket,
        tanggal: meta.tanggalKeberangkatan,
        maskapai: meta.maskapai,
        rute: meta.rute,
        totalJamaah: jamaahValid.length,
        maxSeat: meta.jumlahSeat,
        sisaSeat: meta.sisaSeat,
      },
      newJamaahGroups: newGroups,
      pindahanGroups,
      newCount: newGroups.reduce((sum, g) => sum + g.pax, 0),
      pindahanCount: pindahanGroups.reduce((sum, g) => sum + g.pax, 0),
      keluarList: diffResult.removedJamaah.map((j) => j.nama),
      lastSnapshotDate: yesterdaySnapshot?.snapshot_date || null,
    };

    const caption = new CaptionBuilder().build(captionData);

    const msgResult = await sendToTelegram(
      config.telegramChatId,
      photos[0],
      caption,
      { maxAttempts: config.retry.maxTelegramRetry },
    );

    await saveSnapshot({
      spreadsheetId,
      paketCode,
      snapshotDate: reportDate,
      jamaahData: jamaahValid,
    });

    await logSentReport({
      spreadsheetId,
      paketCode,
      reportDate,
      waMessageId: msgResult.messageId,
      status: msgResult.success ? 'sent' : 'failed',
    });

    await updatePaketRunStatus(paketRun.id, 'completed', null);

    const totalBaru = newGroups.length + pindahanGroups.length;
    logger.info(`[paket] ${paketCode}: ${totalBaru} groups baru, sent=${msgResult.success}`);

    return { paketCode, success: msgResult.success, paketRunId: paketRun.id };
  } catch (error) {
    logger.error(`[paket] ${paketCode} failed: ${error.message}`);
    await updatePaketRunStatus(paketRun.id, 'failed', error.message);
    throw error;
  }
}
