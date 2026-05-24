import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getSpreadsheetIds, addSpreadsheetId, removeSpreadsheetId } from '../storage/spreadsheet-config.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
  });
}

async function handleApi(req, res) {
  const { method, url } = req;

  if (url === '/api/spreadsheet-ids') {
    if (method === 'GET') {
      const data = await getSpreadsheetIds();
      return sendJson(res, 200, { data });
    }

    if (method === 'POST') {
      const body = await parseBody(req);
      if (!body || !body.id || !body.id.trim()) {
        return sendJson(res, 400, { error: 'Spreadsheet ID wajib diisi' });
      }
      const data = await addSpreadsheetId(body.id, body.label || '');
      return sendJson(res, 200, { data });
    }

    if (method === 'DELETE') {
      const body = await parseBody(req);
      if (!body || !body.id) {
        return sendJson(res, 400, { error: 'ID wajib diisi' });
      }
      const data = await removeSpreadsheetId(body.id);
      return sendJson(res, 200, { data });
    }
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function serveStatic(res) {
  try {
    const htmlPath = join(__dirname, 'index.html');
    const html = await readFile(htmlPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal server error');
  }
}

let server = null;

export function startAdminServer(port) {
  server = createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/api/')) {
        await handleApi(req, res);
      } else {
        await serveStatic(res);
      }
    } catch (error) {
      logger.error({ err: error }, '[admin] request error');
      sendJson(res, 500, { error: 'Internal server error' });
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`[admin] port ${port} sudah dipakai, admin server tidak jalan`);
    } else {
      logger.error({ err }, '[admin] server error');
    }
  });

  server.listen(port, '127.0.0.1', () => {
    logger.info(`[admin] web UI tersedia di http://127.0.0.1:${port}`);
  });

  return server;
}

export function stopAdminServer() {
  if (server) {
    server.close();
    server = null;
  }
}
