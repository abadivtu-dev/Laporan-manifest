import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { formatCurrency, formatDateTime } from '../utils/formatters.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = resolve(__dirname, '../templates/table.hbs');
const MAX_ROWS_PER_PAGE = 25;

let _templateCache = null;

function _loadTemplate() {
  if (!_templateCache) {
    const source = readFileSync(TEMPLATE_PATH, 'utf-8');
    _templateCache = Handlebars.compile(source);
  }
  return _templateCache;
}

export class HtmlBuilder {
  /**
   * Build complete report HTML string (concatenated if multi-page).
   * @param {Object} packageData
   * @param {Array} packageData.rows - Array of row objects
   * @param {string} packageData.namaPaket
   * @param {string} packageData.tanggal
   * @param {string} packageData.maskapai
   * @param {string} [packageData.rute]
   * @param {string} packageData.kodePaket
   * @param {number} packageData.totalJamaah
   * @param {Date} [packageData.reportDate]
   * @returns {string} HTML string
   */
  buildReportHtml(packageData) {
    try {
      const template = _loadTemplate();
      const allRows = packageData.rows || [];
      const pages = this._paginateRows(allRows, MAX_ROWS_PER_PAGE);
      const totalPages = pages.length;
      const timestamp = packageData.reportDate
        ? formatDateTime(packageData.reportDate)
        : formatDateTime(new Date());

      const pageHtmls = pages.map((pageRows, index) => {
        const pageLabel = totalPages > 1
          ? `Halaman ${index + 1}/${totalPages}`
          : null;

        const enrichedRows = pageRows.map((row) => ({
          no: row.no,
          nama: row.nama || '',
          kamar: row.kamar != null ? String(row.kamar) : '-',
          totalPembayaran: formatCurrency(row.totalPembayaran),
          kurangBayar: formatCurrency(row.kurangBayar),
          noManifest: row.noManifest || '-',
          statusBadge: this._renderStatusBadge(row.statusPaspor),
        }));

        return template({
          namaPaket: packageData.namaPaket || '',
          tanggal: packageData.tanggal || '',
          maskapai: packageData.maskapai || '',
          rute: packageData.rute || '',
          kodePaket: packageData.kodePaket || '',
          totalJamaah: packageData.totalJamaah,
          pageLabel,
          rows: enrichedRows,
          timestamp,
        });
      });

      return pageHtmls.join('\n');
    } catch (error) {
      logger.error(`[html-builder] Gagal build HTML: ${error.message}`);
      throw new Error(`Gagal build HTML: ${error.message}`, { cause: error });
    }
  }

  /**
   * Split rows into pages (chunks).
   * @param {Array} rows
   * @param {number} maxPerPage
   * @returns {Array<Array>}
   */
  _paginateRows(rows, maxPerPage = MAX_ROWS_PER_PAGE) {
    if (!rows || rows.length === 0) return [[]];
    const pages = [];
    for (let i = 0; i < rows.length; i += maxPerPage) {
      pages.push(rows.slice(i, i + maxPerPage));
    }
    return pages;
  }

  /**
   * Render status paspor as HTML badge.
   * @param {string} status
   * @returns {string} HTML badge string
   */
  _renderStatusBadge(status) {
    const label = (status || '').trim();
    if (!label) {
      return '<span class="badge badge-other">-</span>';
    }
    let cssClass;
    if (label === 'DONE') {
      cssClass = 'badge-done';
    } else if (label === 'NOT YET') {
      cssClass = 'badge-notyet';
    } else {
      cssClass = 'badge-other';
    }
    return `<span class="badge ${cssClass}">${Handlebars.escapeExpression(label)}</span>`;
  }
}
