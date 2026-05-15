import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { logger } from '../utils/logger.js';

let _waSocket = null;

export async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    printQRInTerminal: true,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('[wa] QR code received, scan to authenticate');
    }

    if (connection === 'open') {
      logger.info('[wa] connected', { connection });
      _waSocket = sock;
    } else if (connection === 'connecting') {
      logger.info('[wa] connecting', { connection });
    } else if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      if (isLoggedOut) {
        logger.error('[wa] session logged out, re-scan required', { reason: statusCode });
        _waSocket = null;
        throw new Error(`WA session logged out (${statusCode}), re-scan required`);
      }

      logger.warn('[wa] connection closed, reconnecting', { reason: statusCode });
      _waSocket = null;
      startBot().catch((err) => {
        logger.error('[wa] reconnect failed', { error: err.message });
      });
    }
  });

  sock.ev.on('creds.update', saveCreds);

  _waSocket = sock;
  return sock;
}

export function isConnected(sock) {
  if (!sock) return false;
  return sock.ws != null;
}

export async function disconnect(sock) {
  if (!sock) return;

  logger.info('[wa] disconnect called');
  sock.end();
  sock.ws?.close();
  _waSocket = null;
}

export function getSocket() {
  if (!_waSocket) {
    throw new Error('WA client not initialized. Call startBot() first.');
  }
  return _waSocket;
}
