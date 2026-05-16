import { initDatabase, getDatabase } from './storage/database.js';
import { getFailedReports } from './storage/report-log.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

initDatabase();

const command = process.argv[2];
const today = new Date().toLocaleDateString('en-CA', { timeZone: config.tz });

async function main() {
  switch (command) {
    case 'status':
      await showStatus();
      break;
    case 'resume':
      await resumePipeline();
      break;
    case 'preview':
      await previewReports();
      break;
    case 'retry-failed':
      await retryFailed(process.argv[3] || today);
      break;
    default:
      console.log(`Usage: node src/cli.js <command>

Commands:
  status         Show pipeline status for today
  resume         Resume failed pipeline from last state
  preview        Preview what reports would be sent (dry-run)
  retry-failed   Retry all failed pakets for a date (default: today)
`);
      process.exit(1);
  }
}

async function showStatus() {
  const db = getDatabase();

  const pipeRun = db
    .prepare(`SELECT * FROM pipeline_runs WHERE run_date = ? ORDER BY id DESC LIMIT 1`)
    .get(today);

  if (!pipeRun) {
    console.log(`No pipeline run found for ${today}`);
  } else {
    console.log(`Pipeline Run #${pipeRun.id}: ${pipeRun.status}`);
    console.log(`  Started: ${pipeRun.started_at}`);
    console.log(`  Completed: ${pipeRun.completed_at || 'N/A'}`);

    const sheetRuns = db
      .prepare(`SELECT * FROM spreadsheet_runs WHERE pipeline_run_id = ? ORDER BY sort_order`)
      .all(pipeRun.id);

    for (const sr of sheetRuns) {
      console.log(`  Spreadsheet ${sr.spreadsheet_id}: ${sr.status}`);
      const paketRuns = db
        .prepare(`SELECT * FROM paket_runs WHERE spreadsheet_run_id = ? ORDER BY sort_order`)
        .all(sr.id);
      for (const pr of paketRuns) {
        console.log(`    Paket ${pr.paket_code}: ${pr.status}${pr.last_error ? ` (${pr.last_error})` : ''}`);
      }
    }
  }

  const failed = await getFailedReports(today);
  if (failed.length > 0) {
    console.log(`\n${failed.length} failed reports for ${today}:`);
    for (const f of failed) {
      console.log(`  ${f.spreadsheet_id}/${f.paket_code}: ${f.last_error || 'unknown error'}`);
    }
  }

  process.exit(0);
}

async function resumePipeline() {
  const { runPipeline } = await import('./pipeline/orchestrator.js');
  console.log(`Resuming pipeline for ${today}...`);
  const result = await runPipeline({ reportDate: today });
  console.log(`Result: ${result.status}`);
  process.exit(result.status === 'completed' ? 0 : 1);
}

async function previewReports() {
  const { config } = await import('./config/index.js');
  const { fetchManifestData } = await import('./sheets/manifest-reader.js');
  const { fetchInvoiceData } = await import('./sheets/invoice-reader.js');
  const { getPreviousSnapshot } = await import('./storage/snapshot-store.js');
  const { detectNewJamaah } = await import('./comparator/engine.js');
  const { crosscheckWithInvoice } = await import('./comparator/crosscheck.js');
  const { CaptionBuilder } = await import('./reporter/caption-builder.js');

  console.log(`=== PREVIEW for ${today} ===\n`);

  for (const sheetId of config.spreadsheetIds) {
    console.log(`Spreadsheet: ${sheetId}`);
    const manifest = await fetchManifestData(sheetId);
    const invoiceMap = await fetchInvoiceData(config.invoiceSpreadsheetId);

    for (const paket of manifest.pakets) {
      const yesterday = getPreviousSnapshot(sheetId, paket.kodePaket, today);
      const yesterdayData = yesterday ? JSON.parse(yesterday.data_json) : null;
      const diff = detectNewJamaah(yesterdayData, paket.jamaah);
      const cross = crosscheckWithInvoice(diff.newJamaah, invoiceMap, paket.namaPaket);

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
        newJamaahList: cross.jamaahBaru.map((j) => j.nama),
        pindahanList: cross.jamaahPindahan.map((j) => ({ nama: j.nama, dariPaket: j.paketAsal || 'paket lain' })),
        keluarList: diff.removedJamaah.map((j) => j.nama),
        isFirstRun: diff.isFirstRun,
        lastSnapshotDate: yesterday?.snapshot_date || null,
      };

      const caption = new CaptionBuilder().build(captionData);
      console.log(caption);
      console.log('---');
    }
  }

  process.exit(0);
}

async function retryFailed(date) {
  const failed = await getFailedReports(date);
  if (failed.length === 0) {
    console.log(`No failed reports for ${date}`);
    process.exit(0);
  }

  console.log(`Retrying ${failed.length} failed reports for ${date}...`);
  // Re-run pipeline for the date — it will skip already-sent pakets
  const { runPipeline } = await import('./pipeline/orchestrator.js');
  const result = await runPipeline({ reportDate: date });
  console.log(`Result: ${result.status}`);
  process.exit(result.status === 'completed' ? 0 : 1);
}

main().catch((err) => {
  logger.error(`[cli] ${err.message}`);
  console.error(err.message);
  process.exit(1);
});
