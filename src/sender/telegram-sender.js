import https from 'https';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Send photo + caption to a Telegram chat.
 * Zero-dependency — uses Node.js built-in https.
 *
 * @param {string} chatId
 * @param {Buffer} photoBuffer — PNG screenshot
 * @param {string} caption
 * @returns {Promise<{success: boolean, messageId?: string}>}
 */
function sendPhoto(chatId, photoBuffer, caption) {
  const token = config.telegramBotToken;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN not configured');
  }

  return new Promise((resolve, reject) => {
    const boundary = `boundary${Date.now()}${Math.random().toString(36).slice(2)}`;
    const crlf = '\r\n';

    // Build multipart body
    const parts = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="chat_id"`,
      ``,
      `${chatId}`,
      `--${boundary}`,
      `Content-Disposition: form-data; name="caption"`,
      ``,
      caption,
      `--${boundary}`,
      `Content-Disposition: form-data; name="photo"; filename="report.png"`,
      `Content-Type: image/png`,
      ``,
    ];

    const head = Buffer.from(parts.join(crlf) + crlf);
    const tail = Buffer.from(`${crlf}--${boundary}--${crlf}`);
    const body = Buffer.concat([head, photoBuffer, tail]);

    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/sendPhoto`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        timeout: 60000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.ok) {
              const messageId = json.result?.message_id;
              resolve({ success: true, messageId: String(messageId) });
            } else {
              const err = new Error(`Telegram API error: ${json.description || data}`);
              err.code = json.error_code;
              reject(err);
            }
          } catch {
            reject(new Error(`Telegram sendPhoto parse error: ${data}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Telegram sendPhoto timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Retry wrapper (reuse same pattern as MessageQueue) ────────────────────────

const MAX_RETRY = 3;
const BASE_DELAY_MS = 5000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send photo to Telegram with retry + backoff.
 *
 * @param {string} chatId
 * @param {Buffer} photoBuffer
 * @param {string} caption
 * @param {{ maxAttempts?: number, baseDelayMs?: number }} [opts]
 * @returns {Promise<{success: boolean, messageId?: string}>}
 */
function sendMessage(chatId, text) {
  const token = config.telegramBotToken;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured');

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 30000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.ok) resolve({ success: true, messageId: String(json.result.message_id) });
            else reject(new Error(`Telegram API error: ${json.description || data}`));
          } catch { reject(new Error(`Telegram sendMessage parse error: ${data}`)); }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Telegram sendMessage timeout')); });
    req.write(payload);
    req.end();
  });
}

/**
 * Send text message to Telegram (for headers/separators).
 * @param {string} chatId
 * @param {string} text
 * @returns {Promise<{success: boolean, messageId?: string}>}
 */
export async function sendTextToTelegram(chatId, text) {
  try {
    logger.info('[telegram-sender] sending text header');
    const result = await sendMessage(chatId, text);
    logger.info(`[telegram-sender] text sent OK, messageId=${result.messageId}`);
    return result;
  } catch (error) {
    logger.warn(`[telegram-sender] text failed: ${error.message}`);
    return { success: false, messageId: undefined };
  }
}

export async function sendToTelegram(chatId, photoBuffer, caption, opts = {}) {
  const maxAttempts = opts.maxAttempts || MAX_RETRY;
  const baseDelayMs = opts.baseDelayMs || BASE_DELAY_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info(`[telegram-sender] sending to chat=${chatId} (attempt ${attempt}/${maxAttempts})`);
      const result = await sendPhoto(chatId, photoBuffer, caption);
      logger.info(`[telegram-sender] sent OK, messageId=${result.messageId}`);
      return result;
    } catch (error) {
      logger.warn(`[telegram-sender] attempt ${attempt} failed: ${error.message}`);
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await wait(delay);
      }
    }
  }

  logger.error(`[telegram-sender] all ${maxAttempts} attempts exhausted`);
  return { success: false, messageId: undefined };
}
