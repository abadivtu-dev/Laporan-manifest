import { initDatabase } from './storage/database.js';
import { config } from './config/index.js';
import { startAdminServer, stopAdminServer } from './admin/server.js';
import { logger } from './utils/logger.js';

initDatabase();

const port = config.adminPort;
startAdminServer(port);

logger.info(`[admin-cli] buka http://127.0.0.1:${port} untuk konfigurasi spreadsheet`);
console.log(`\n  Web Config berjalan di http://127.0.0.1:${port}\n`);
console.log('  Tekan Ctrl+C untuk berhenti.\n');

process.on('SIGINT', () => {
  stopAdminServer();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopAdminServer();
  process.exit(0);
});
