import { logger } from '../utils/logger.js';

const MAX_CONSECUTIVE_FAILS = 3;

export class MessageQueue {
  constructor({ minDelayMs = 4000, maxDelayMs = 8000 } = {}) {
    this._minDelayMs = minDelayMs;
    this._maxDelayMs = maxDelayMs;
    this._sent = 0;
    this._failed = 0;
    this._totalDelayMs = 0;
    this._lastSendTime = 0;
    this._consecutiveFails = 0;
  }

  async sendToGroup(sock, groupJid, imageBuffer, caption) {
    const delay = this._calculateDelay();
    if (delay > 0) {
      await this._wait(delay);
    }

    return this._sendWithRetry(sock, groupJid, imageBuffer, caption);
  }

  getStats() {
    const totalAttempts = this._sent + this._failed;
    return {
      sent: this._sent,
      failed: this._failed,
      avgDelayMs: totalAttempts > 0 ? Math.round(this._totalDelayMs / totalAttempts) : 0,
    };
  }

  _calculateDelay() {
    if (this._lastSendTime === 0) return 0;

    const elapsed = Date.now() - this._lastSendTime;
    const baseJitter = this._minDelayMs + Math.random() * (this._maxDelayMs - this._minDelayMs);
    const actualBase = Math.max(0, baseJitter - elapsed);

    if (this._consecutiveFails === 0) {
      return Math.max(0, actualBase);
    }

    // Exponential backoff: base * 2^(consecutiveFails - 1)
    const backoffMultiplier = Math.pow(2, this._consecutiveFails - 1);
    return Math.max(0, baseJitter * backoffMultiplier - elapsed);
  }

  async _sendWithRetry(sock, groupJid, imageBuffer, caption) {
    let attempts = 0;

    while (attempts < MAX_CONSECUTIVE_FAILS) {
      attempts++;
      logger.info('[wa] sending message', { attempt: attempts, maxAttempts: MAX_CONSECUTIVE_FAILS });

      try {
        const result = await sock.sendMessage(groupJid, {
          image: imageBuffer,
          caption,
        });

        this._sent++;
        this._consecutiveFails = 0;
        this._lastSendTime = Date.now();

        logger.info('[wa] message sent', { messageId: result.key?.id });

        return { success: true, messageId: result.key?.id };
      } catch (error) {
        const isAuthFailure = error.message && error.message.includes('auth_failure');
        if (isAuthFailure) {
          logger.error('[wa] auth failure, not retrying', { error: error.message });
          throw error;
        }

        this._consecutiveFails++;
        logger.warn('[wa] send failed', {
          attempt: attempts,
          consecutiveFails: this._consecutiveFails,
          error: error.message,
        });

        if (attempts < MAX_CONSECUTIVE_FAILS) {
          // Wait with backoff before retry
          const backoffDelay = this._minDelayMs * Math.pow(2, attempts - 1);
          await this._wait(backoffDelay);
        }
      }
    }

    // All attempts exhausted
    this._failed++;
    this._consecutiveFails = 0;
    this._lastSendTime = Date.now();

    logger.error('[wa] all send attempts failed', { maxAttempts: MAX_CONSECUTIVE_FAILS });

    return { success: false, messageId: undefined };
  }

  async _wait(ms) {
    this._totalDelayMs += ms;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
