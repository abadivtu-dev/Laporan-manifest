import { initDatabase } from './storage/database.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

logger.info('[init] laporan-wa starting');
logger.info({ config: { ...config, wa: '***' } }, '[init] configuration loaded');

initDatabase();
logger.info('[init] foundation modules ready');
