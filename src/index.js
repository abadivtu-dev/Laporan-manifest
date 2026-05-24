import { initDatabase } from './storage/database.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { startScheduler, stopScheduler, getSchedulerStatus } from './scheduler/cron.js';
import { startAdminServer, stopAdminServer } from './admin/server.js';
import { startTelegramBot, stopTelegramBot } from './telegram/bot.js';

let adminServer = null;

process.on('SIGTERM', () => {
  logger.info('[init] SIGTERM received, shutting down');
  stopScheduler();
  stopAdminServer();
  stopTelegramBot();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('[init] SIGINT received, shutting down');
  stopScheduler();
  stopAdminServer();
  stopTelegramBot();
  process.exit(0);
});

logger.info('[init] laporan-wa starting');
logger.info({ config: { ...config, telegramBotToken: '***' } }, '[init] configuration loaded');

initDatabase();
logger.info('[init] database ready');

adminServer = startAdminServer(config.adminPort);
startTelegramBot();

const args = process.argv.slice(2);

if (args.includes('--run-now')) {
  logger.info('[init] --run-now flag detected, running pipeline immediately');
  const { runPipeline } = await import('./pipeline/orchestrator.js');
  const result = await runPipeline();
  logger.info(`[init] manual run complete: ${result.status}`);
  process.exit(result.status === 'completed' ? 0 : 1);
} else if (args.includes('--status')) {
  const status = getSchedulerStatus();
  console.log(JSON.stringify(status, null, 2));
  process.exit(0);
} else {
  startScheduler();
  logger.info(`[init] scheduler running — next report at ${config.reportTime} ${config.tz}`);
  logger.info('[init] use --run-now to trigger immediately, --status to check');
}
