import cron from 'node-cron';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { runPipeline } from '../pipeline/orchestrator.js';

let job = null;

export function startScheduler() {
  const [hour, minute] = config.reportTime.split(':');
  const expression = `${minute} ${hour} * * *`;

  logger.info(`[scheduler] starting — schedule: ${expression} (${config.tz})`);

  job = cron.schedule(
    expression,
    async () => {
      logger.info('[scheduler] trigger: starting daily report');
      try {
        const result = await runPipeline();
        logger.info(`[scheduler] daily report complete: ${result.status}`);
      } catch (error) {
        logger.error(`[scheduler] daily report crashed: ${error.message}`);
      }
    },
    { timezone: config.tz },
  );

  logger.info('[scheduler] started');
}

export function stopScheduler() {
  if (job) {
    job.stop();
    job = null;
    logger.info('[scheduler] stopped');
  }
}

export function getSchedulerStatus() {
  return {
    running: job !== null,
    schedule: config.reportTime,
    timezone: config.tz,
  };
}
