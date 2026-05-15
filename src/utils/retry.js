import { logger } from './logger.js';

export async function retryWithBackoff(fn, { maxAttempts = 3, baseDelayMs = 2000, context = '' } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      const delay = baseDelayMs * Math.pow(3, attempt - 1);
      logger.warn(`[retry] attempt=${attempt}/${maxAttempts} failed, retrying in ${delay}ms | ${context}: ${error.message}`);
      await sleep(delay);
    }
  }

  logger.error(`[retry] all ${maxAttempts} attempts failed | ${context}: ${lastError.message}`);
  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
