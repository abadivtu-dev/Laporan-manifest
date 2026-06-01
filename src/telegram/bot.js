import https from 'https';
import { getDatabase } from '../storage/database.js';
import { getFailedReports } from '../storage/report-log.js';
import { getSpreadsheetIds } from '../storage/spreadsheet-config.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// ── Telegram API helper (zero-dependency, built-in https) ────────────────────

/**
 * Call Telegram Bot API.
 *
 * Socket timeout must exceed the long-polling timeout (30 s) so the socket
 * never fires before the API responds.  65 s gives headroom for latency.
 *
 * @param {string} method        — Telegram method name (e.g. "getUpdates")
 * @param {object} body          — JSON body
 * @param {number} [timeoutMs]   — socket timeout in ms (default 65_000)
 * @returns {Promise<object>}    — parsed `result` field from the Telegram response
 */
function telegramApi(method, body, timeoutMs = 65_000) {
  const token = config.telegramBotToken;
  if (!token) return Promise.reject(new Error('TELEGRAM_BOT_TOKEN not configured'));

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (!json.ok) {
              const err = new Error(`Telegram API error: ${json.description || data}`);
              err.code = json.error_code;
              reject(err);
            } else {
              resolve(json.result);
            }
          } catch {
            reject(new Error(`Telegram API parse error: ${data}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Telegram API socket timeout'));
    });
    req.write(payload);
    req.end();
  });
}

// ── Keyboard definitions ─────────────────────────────────────────────────────

const MAIN_MENU = {
  inline_keyboard: [
    [{ text: '🚀 Run Pipeline Now', callback_data: '/run_now' }],
    [{ text: '📊 Cek Status Hari Ini', callback_data: '/status' }],
    [{ text: '🔄 Retry Failed', callback_data: '/retry_failed' }],
    [{ text: '📂 List Spreadsheet', callback_data: '/list_sheets' }],
  ],
};

// ── Message builder ──────────────────────────────────────────────────────────

function sendMessage(chatId, text, replyMarkup = null) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return telegramApi('sendMessage', body).catch((err) =>
    logger.error({ err }, '[telegram] sendMessage failed'),
  );
}

function answerCallback(callbackQueryId, text) {
  return telegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  }).catch((err) => logger.error({ err }, '[telegram] answerCallbackQuery failed'));
}

// ── Command handlers ─────────────────────────────────────────────────────────

async function handleStart(chatId) {
  const today = todayDate();
  await sendMessage(
    chatId,
    `<b>🤖 LAPORAN-WA Bot</b>\n\n` +
    `Chat ID kamu: <code>${chatId}</code>\n\n` +
    `Pilih aksi dari tombol di bawah:\n` +
    `📅 Hari ini: <b>${today}</b>\n` +
    `⏰ Jadwal: <b>${config.reportTime} ${config.tz}</b>`,
    MAIN_MENU,
  );
}

async function handleStatus(chatId) {
  const db = getDatabase();
  const today = todayDate();

  const pipeRun = db
    .prepare(`SELECT * FROM pipeline_runs WHERE run_date = ? ORDER BY id DESC LIMIT 1`)
    .get(today);

  if (!pipeRun) {
    await sendMessage(chatId, `📊 <b>Tidak ada pipeline run untuk ${today}</b>\n\nBelum ada laporan yang dikirim hari ini.`, MAIN_MENU);
    return;
  }

  const sheetRuns = db
    .prepare(`SELECT * FROM spreadsheet_runs WHERE pipeline_run_id = ? ORDER BY sort_order`)
    .all(pipeRun.id);

  let text = `<b>📊 Status Pipeline — ${today}</b>\n\n`;
  text += `<b>Pipeline:</b> ${statusEmoji(pipeRun.status)} ${pipeRun.status}\n`;
  text += `<code>Mulai:</code> ${pipeRun.started_at}\n`;
  if (pipeRun.completed_at) text += `<code>Selesai:</code> ${pipeRun.completed_at}\n`;
  text += `\n`;

  for (const sr of sheetRuns) {
    text += `<b>Spreadsheet:</b> <code>${sr.spreadsheet_id.slice(0, 20)}...</code> → ${statusEmoji(sr.status)} ${sr.status}\n`;
    const paketRuns = db
      .prepare(`SELECT * FROM paket_runs WHERE spreadsheet_run_id = ? ORDER BY sort_order`)
      .all(sr.id);
    for (const pr of paketRuns) {
      text += `  └ ${pr.paket_code}: ${statusEmoji(pr.status)} ${pr.status}`;
      if (pr.last_error) text += ` <i>(${pr.last_error.slice(0, 60)})</i>`;
      text += `\n`;
    }
  }

  const failed = await getFailedReports(today);
  if (failed.length > 0) {
    text += `\n⚠ <b>${failed.length} laporan gagal:</b>\n`;
    for (const f of failed) {
      text += `  └ <code>${f.paket_code}</code>: ${f.last_error || 'unknown'}\n`;
    }
  }

  await sendMessage(chatId, text, MAIN_MENU);
}

async function handleRunNow(chatId) {
  const today = todayDate();

  // Cek apakah pipeline sedang berjalan
  const db = getDatabase();
  const running = db
    .prepare(`SELECT id FROM pipeline_runs WHERE run_date = ? AND status = 'running'`)
    .get(today);

  if (running) {
    await sendMessage(chatId, `⚠ <b>Pipeline sedang berjalan!</b>\n\nTunggu selesai dulu sebelum menjalankan lagi.`, MAIN_MENU);
    return;
  }

  await sendMessage(chatId, `🚀 <b>Pipeline started!</b>\n\nTanggal: ${today}\n\nLaporan akan dikirim ke Telegram grup. Bot akan memberi tahu jika sudah selesai.`);

  // Jalankan pipeline di background
  const { runPipeline } = await import('../pipeline/orchestrator.js');
  runPipeline({ reportDate: today })
    .then(async (result) => {
      if (result.status === 'completed') {
        await sendMessage(chatId, `✅ <b>Pipeline selesai!</b>\n\nSemua laporan untuk ${today} sudah dikirim.`, MAIN_MENU);
      } else {
        await sendMessage(chatId, `❌ <b>Pipeline gagal!</b>\n\n${result.error || result.reason || 'Unknown error'}`, MAIN_MENU);
      }
    })
    .catch(async (err) => {
      logger.error({ err }, '[telegram] background pipeline failed');
      await sendMessage(chatId, `❌ <b>Pipeline error:</b> ${err.message}`, MAIN_MENU);
    });
}

async function handleRetryFailed(chatId) {
  const today = todayDate();
  const failed = await getFailedReports(today);

  if (failed.length === 0) {
    await sendMessage(chatId, `✅ <b>Tidak ada laporan gagal untuk ${today}</b>`, MAIN_MENU);
    return;
  }

  await sendMessage(chatId, `🔄 <b>Retrying ${failed.length} laporan gagal untuk ${today}...</b>`);

  const { runPipeline } = await import('../pipeline/orchestrator.js');
  runPipeline({ reportDate: today })
    .then(async (result) => {
      if (result.status === 'completed') {
        await sendMessage(chatId, `✅ <b>Retry selesai!</b>\n\nLaporan untuk ${today} sudah dikirim ulang.`, MAIN_MENU);
      } else {
        await sendMessage(chatId, `❌ <b>Retry gagal:</b> ${result.error || 'Unknown error'}`, MAIN_MENU);
      }
    })
    .catch(async (err) => {
      await sendMessage(chatId, `❌ <b>Retry error:</b> ${err.message}`, MAIN_MENU);
    });
}

async function handleListSheets(chatId) {
  let items;
  try {
    items = await getSpreadsheetIds();
  } catch {
    items = [];
  }

  if (items.length === 0) {
    const envIds = config.spreadsheetIds;
    if (envIds.length > 0) {
      let text = `<b>📂 Spreadsheet IDs (dari .env):</b>\n\n`;
      envIds.forEach((id, i) => {
        text += `  ${i + 1}. <code>${id}</code>\n`;
      });
      text += `\n<i>Belum ada data di database — fallback ke .env</i>`;
      await sendMessage(chatId, text, MAIN_MENU);
    } else {
      await sendMessage(chatId, `📂 <b>Tidak ada spreadsheet ID terkonfigurasi</b>`, MAIN_MENU);
    }
    return;
  }

  let text = `<b>📂 Spreadsheet IDs (${items.length}):</b>\n\n`;
  items.forEach((entry, i) => {
    text += `  ${i + 1}. <b>${entry.label || 'Tanpa Label'}</b>\n`;
    text += `     <code>${entry.id}</code>\n`;
  });

  await sendMessage(chatId, text, MAIN_MENU);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusEmoji(status) {
  switch (status) {
    case 'completed': return '✅';
    case 'failed': return '❌';
    case 'running': return '🔄';
    case 'sent': return '✅';
    default: return '⏳';
  }
}

function todayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: config.tz });
}

/**
 * Detect whether an error is a "normal" long-polling result, not a real failure.
 *
 * Telegram `getUpdates` with `timeout=30` returns an empty `[]` after ~30 s of
 * idleness.  That is expected — the socket timeout in `telegramApi` is 65 s, so
 * it should never win the race.  If a socket timeout DOES happen it means the
 * network dropped the connection, which we treat as a real error.
 */
function _isPollingTimeout(err) {
  const msg = (err.message || '').toLowerCase();
  return msg.includes('socket timeout') || msg.includes('telegram api timeout');
}

// ── Long polling engine ──────────────────────────────────────────────────────

const POLL_LONGPOLL_SECS = 30;     // Telegram long-poll timeout (seconds)
const POLL_RECONNECT_MS = 500;     // normal delay between polls
const POLL_CONFLICT_WAIT_MS = 10_000; // wait after 409 Conflict

let offset = 0;
let polling = false;
let pollTimer = null;
let pollInFlight = false;           // guard against concurrent polls

/**
 * Schedule the next poll cycle, cancelling any previously scheduled timer.
 * Must be called while NOT inside an in-flight poll (unless the guard is off).
 */
function _scheduleNextPoll(delayMs = POLL_RECONNECT_MS) {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (!polling) return;
  pollTimer = setTimeout(poll, delayMs);
}

async function poll() {
  // Guard: never run two polls concurrently (belt-and-suspenders with the
  // timer cancel above — handles edge cases where poll() is called externally)
  if (!polling) return;
  if (pollInFlight) {
    logger.warn('[telegram] poll already in flight, skipping duplicate');
    return;
  }
  pollInFlight = true;

  try {
    const updates = await telegramApi(
      'getUpdates',
      {
        offset,
        timeout: POLL_LONGPOLL_SECS,
        allowed_updates: ['message', 'callback_query'],
      },
      65_000,    // socket timeout — must be > long-poll timeout
    );

    if (updates && updates.length > 0) {
      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        await handleUpdate(update);
      }
    }
    // Empty result after long-poll timeout is normal — just loop again
    _scheduleNextPoll(POLL_RECONNECT_MS);
  } catch (err) {
    const code = err.code || 0;

    if (code === 409) {
      // Another getUpdates is still active — Telegram terminated it.
      // Delete any lingering webhook, wait, then retry.
      logger.warn('[telegram] 409 conflict — clearing webhook and retrying in 10s');
      try { await telegramApi('deleteWebhook', { drop_pending_updates: true }, 10_000); } catch {}
      _scheduleNextPoll(POLL_CONFLICT_WAIT_MS);
    } else if (_isPollingTimeout(err)) {
      logger.warn('[telegram] long-poll socket timeout — reconnecting');
      _scheduleNextPoll(POLL_RECONNECT_MS);
    } else {
      logger.error({ err }, '[telegram] poll error');
      _scheduleNextPoll(5_000);  // back off on unknown errors
    }
  } finally {
    pollInFlight = false;
  }
}

async function handleUpdate(update) {
  try {
    // Callback query (inline button)
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id;
      const data = cq.data;

      if (!chatId) return;

      // Ack callback
      await answerCallback(cq.id, '');

      switch (data) {
        case '/run_now':
          await handleRunNow(chatId);
          break;
        case '/status':
          await handleStatus(chatId);
          break;
        case '/retry_failed':
          await handleRetryFailed(chatId);
          break;
        case '/list_sheets':
          await handleListSheets(chatId);
          break;
        default:
          await sendMessage(chatId, `Unknown command: ${data}`, MAIN_MENU);
      }
      return;
    }

    // Text message
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat?.id;
      const text = (msg.text || '').trim();

      if (!chatId) return;

      if (text === '/start' || text === '/menu') {
        await handleStart(chatId);
      } else if (text === '/run_now') {
        await handleRunNow(chatId);
      } else if (text === '/status') {
        await handleStatus(chatId);
      } else if (text === '/retry_failed') {
        await handleRetryFailed(chatId);
      } else if (text === '/list_sheets') {
        await handleListSheets(chatId);
      } else if (text.startsWith('/')) {
        await sendMessage(chatId, `Perintah tidak dikenal: ${text}\n\nGunakan tombol di bawah atau /start`, MAIN_MENU);
      }
    }
  } catch (err) {
    logger.error({ err }, '[telegram] handleUpdate error');
  }
}

// ── Start / Stop ─────────────────────────────────────────────────────────────

export async function startTelegramBot() {
  if (!config.telegramBotToken) {
    logger.warn('[telegram] TELEGRAM_BOT_TOKEN not configured, bot skipped');
    return;
  }

  // Hapus pending updates (webhook safety)
  try {
    await telegramApi('deleteWebhook', { drop_pending_updates: true });
  } catch {
    // non-fatal
  }

  // Dapatkan offset terbaru supaya skip message lama
  try {
    const updates = await telegramApi('getUpdates', { offset: -1, limit: 1 }, 10_000);
    if (updates && updates.length > 0) {
      offset = updates[0].update_id + 1;
    }
  } catch {
    // non-fatal
  }

  polling = true;
  poll();

  try {
    const me = await telegramApi('getMe', {}, 10_000);
    logger.info(`[telegram] bot @${me.username} started — listening for commands`);
  } catch {
    logger.info('[telegram] bot started — listening for commands');
  }
}

export function stopTelegramBot() {
  polling = false;
  pollInFlight = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  logger.info('[telegram] bot stopped');
}
