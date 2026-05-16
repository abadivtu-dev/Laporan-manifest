import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { logger } from '../utils/logger.js';

let _waSocket = null;

export async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  return new Promise((resolve, reject) => {
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        logger.warn('[wa] QR code received — need to re-authenticate. Run: node setup-wa.mjs');
        reject(new Error('WA re-authentication required. Run node setup-wa.mjs'));
        return;
      }

      if (connection === 'connecting') {
        logger.info('[wa] connecting...');
      }

      if (connection === 'open') {
        logger.info('[wa] connected');
        _waSocket = sock;
        resolve(sock);
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = code === DisconnectReason.loggedOut;

        if (isLoggedOut) {
          logger.error({ code }, '[wa] session logged out');
          _waSocket = null;
          reject(new Error(`WA session logged out (${code}), run node setup-wa.mjs to re-auth`));
          return;
        }

        // 515 = restart required (normal)
        if (code === 515 || code === 428) {
          logger.info({ code }, '[wa] restart koneksi (normal)...');
          sock.ev.removeAllListeners();
          const newSock = makeWASocket({
            auth: state,
            syncFullHistory: false,
            markOnlineOnConnect: false,
          });
          newSock.ev.on('creds.update', saveCreds);
          newSock.ev.on('connection.update', ({ connection: conn2, lastDisconnect: ld2, qr: qr2 }) => {
            if (qr2) {
              reject(new Error('WA re-authentication required after restart. Run node setup-wa.mjs'));
              return;
            }
            if (conn2 === 'open') {
              logger.info('[wa] connected (after restart)');
              _waSocket = newSock;
              resolve(newSock);
            }
            if (conn2 === 'close') {
              const c2 = ld2?.error?.output?.statusCode;
              if (c2 === DisconnectReason.loggedOut) {
                _waSocket = null;
                reject(new Error(`WA session logged out (${c2})`));
                return;
              }
              logger.warn({ code: c2 }, '[wa] koneksi tertutup setelah restart');
            }
          });
          return;
        }

        logger.warn({ code }, '[wa] connection closed, reconnecting...');
      }
    });
  });
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
