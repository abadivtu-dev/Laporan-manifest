import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { formatDateTime } from '../utils/formatters.js';
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
   * Build complete report HTML string from paket block.
   *
   * @param {Object} opts
   * @param {Object} opts.metadata — { kodePaket, namaPaket, rute, jumlahSeat, sisaSeat, tanggalKeberangkatan, maskapai, asal, tujuan }
   * @param {Array<Object>} opts.jamaah — array of jamaah objects (columns F-Q fields)
   * @param {Date} [opts.reportDate]
   * @returns {string} HTML string
   */
  buildReportHtml({ metadata, jamaah, reportDate }) {
    try {
      const template = _loadTemplate();
      // Hanya tampilkan baris yang memiliki ID REG terisi
      const filteredRows = this._filterValidRows(jamaah);
      const pages = this._paginateRows(filteredRows, MAX_ROWS_PER_PAGE);
      const totalPages = pages.length;
      const timestamp = reportDate
        ? formatDateTime(reportDate)
        : formatDateTime(new Date());

      const pageHtmls = pages.map((pageRows, index) => {
        const pageLabel = totalPages > 1
          ? `Halaman ${index + 1}/${totalPages}`
          : null;

        const enrichedRows = pageRows.map((row) => ({
          noJamaah: row.noJamaah || '',
          idRegister: row.idRegister || '',
          nik: row.nik || '',
          jenisIdentitas: row.jenisIdentitas || '',
          nama: row.nama || '',
          statusBadge: this._renderStatusBadge(row.statusPaspor),
          keteranganPaspor: row.keteranganPaspor || '',
          hotelMakkah: row.hotelMakkah || '',
          hotelMadinah: row.hotelMadinah || '',
          kamar: row.kamar || '',
          totalPembayaran: row.totalPembayaran || '',
          kurangBayar: row.kurangBayar || '',
        }));

        return template({
          kodePaket: metadata.kodePaket || '',
          namaPaket: metadata.namaPaket || '',
          rute: metadata.rute || '',
          jumlahSeat: metadata.jumlahSeat || 0,
          sisaSeat: metadata.sisaSeat || 0,
          tanggal: metadata.tanggalKeberangkatan || '',
          maskapai: metadata.maskapai || '',
          asal: metadata.asal || '',
          tujuan: metadata.tujuan || '',
          totalJamaah: filteredRows.length,
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
   * Filter hanya baris yang memiliki ID REG valid (bukan kosong atau #N/A).
   */
  _filterValidRows(rows) {
    return (rows || []).filter((row) => {
      const idReg = (row.idRegister || '').trim();
      return idReg && idReg !== '#N/A';
    });
  }

  /**
   * Split rows into pages (chunks).
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
