/**
 * Parser for DATA JAMAAH sheet.
 *
 * Segmentasi raw sheet data (2D array) menjadi array blok paket.
 * Setiap blok memiliki: metadata header, column headers, baris jamaah, summary.
 */

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const COLUMN_FIELD_MAP = {
  'PROSES/CANCEL/PINDAH': 'proses',
  PROSES: 'proses',
  'KELUARGA/ROMBONGAN': 'keluarga',
  'NO JAMAAH': 'noJamaah',
  'ID REGISTER': 'idRegister',
  NIK: 'nik',
  'JENIS IDENTITAS': 'jenisIdentitas',
  NAMA: 'nama',
  'STATUS PASPOR': 'statusPaspor',
  'KETERANGAN PASPOR': 'keteranganPaspor',
  'HOTEL MAKKAH': 'hotelMakkah',
  'HOTEL MADINAH': 'hotelMadinah',
  KAMAR: 'kamar',
  'TOTAL PEMBAYARAN': 'totalPembayaran',
  'KURANG BAYAR': 'kurangBayar',
  'JENIS KELAMIN': 'jenisKelamin',
  'TEMPAT LAHIR': 'tempatLahir',
  'TGL LAHIR': 'tglLahir',
  'STATUS MENIKAH': 'statusMenikah',
  'NO TELP/HP': 'noTelp',
  'REQUEST WAITING LIST': 'requestWaitingList',
  PEKERJAAN: 'pekerjaan',
  'PENDIDIKAN TERAKHIR': 'pendidikanTerakhir',
  'NO PASPOR': 'noPaspor',
  'NAMA PASPOR': 'namaPaspor',
  'TGL DIKELUARKAN': 'tglDikeluarkan',
  'TGL HABIS': 'tglHabis',
  'KOTA PASPOR': 'kotaPaspor',
  HUB: 'hub',
  ALAMAT: 'alamat',
  'NO MANIFEST': 'noManifest',
};

/* ------------------------------------------------------------------ */
/*  Row-type detection helpers                                        */
/* ------------------------------------------------------------------ */

/**
 * Check if a row is empty (all cells blank/whitespace).
 * @param {Array<string>|null|undefined} row
 * @returns {boolean}
 */
export function isEmptyRow(row) {
  if (!row || row.length === 0) return true;
  return row.every((cell) => !cell || cell.toString().trim() === '');
}

/**
 * Detect column-header row — the first cell starts with "PROSES"
 * and second starts with "KELUARGA".
 * @param {Array<string>|null|undefined} row
 * @returns {boolean}
 */
export function isColumnHeaderRow(row) {
  if (!row || row.length < 3) return false;
  const c0 = (row[0] || '').toString().trim();
  const c1 = (row[1] || '').toString().trim();
  const c2 = (row[2] || '').toString().trim();
  return (
    (c0.startsWith('PROSES')) &&
    c1.startsWith('KELUARGA') &&
    c2.startsWith('NO')
  );
}

/**
 * Detect summary row — first cell contains "JUMLAH JAMAAH", "JUMLAH", or "TOTAL".
 * @param {Array<string>|null|undefined} row
 * @returns {boolean}
 */
export function isSummaryRow(row) {
  if (!row || row.length === 0) return false;
  const first = (row[0] || '').toString().trim().toUpperCase();
  return (
    first.startsWith('JUMLAH') ||
    first.startsWith('TOTAL')
  );
}

/* ------------------------------------------------------------------ */
/*  Row parsers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Parse a metadata row into a structured object.
 *
 * Expected keys: KODE PAKET, PAKET, SEAT, SISA, TGL/TANGGAL, MASKAPAI, RUTE.
 *
 * @param {Array<string>|null} row
 * @returns {object}
 */
export function parseMetaRow(row) {
  if (!row || isEmptyRow(row)) return {};

  const meta = {};

  for (const cell of row) {
    if (!cell || !cell.includes(':')) continue;

    const sepIdx = cell.indexOf(':');
    const key = cell.substring(0, sepIdx).trim().toUpperCase().replace(/\s+/g, ' ');
    const value = cell.substring(sepIdx + 1).trim();

    switch (key) {
      case 'KODE PAKET':
        meta.kodePaket = value;
        break;
      case 'PAKET':
        meta.namaPaket = value;
        break;
      case 'SEAT':
        meta.jumlahSeat = parseInt(value, 10) || 0;
        break;
      case 'SISA':
        meta.sisaSeat = parseInt(value, 10) || 0;
        break;
      case 'TGL':
      case 'TANGGAL':
        meta.tanggalKeberangkatan = value;
        break;
      case 'MASKAPAI':
        meta.maskapai = value;
        break;
      case 'RUTE':
        meta.rute = value;
        break;
    }
  }

  return meta;
}

/**
 * Parse a summary row into { jumlahJamaah, jamaahPria, jamaahWanita }.
 * @param {Array<string>|null} row
 * @returns {object|null}
 */
export function parseSummaryRow(row) {
  if (!row || isEmptyRow(row)) return null;

  const summary = {};

  for (const cell of row) {
    if (!cell || !cell.includes(':')) continue;

    const sepIdx = cell.indexOf(':');
    const key = cell.substring(0, sepIdx).trim().toUpperCase().replace(/\s+/g, ' ');
    const rawValue = cell.substring(sepIdx + 1).trim();
    const value = parseInt(rawValue, 10) || 0;

    if (key === 'JUMLAH JAMAAH' || key === 'JUMLAH' || key === 'TOTAL') {
      summary.jumlahJamaah = value;
    } else if (key === 'PRIA' || key === 'JAMAAH PRIA') {
      summary.jamaahPria = value;
    } else if (key === 'WANITA' || key === 'JAMAAH WANITA') {
      summary.jamaahWanita = value;
    }
  }

  return summary;
}

/**
 * Normalize column-header row into field-name array.
 * @param {Array<string>} headerRow
 * @returns {Array<string>}
 */
function _normalizeHeaders(headerRow) {
  return (headerRow || []).map((h) => {
    const trimmed = (h || '').toString().trim();
    return COLUMN_FIELD_MAP[trimmed] || '';
  });
}

/**
 * Parse a single data row using normalized column headers.
 * @param {Array<string>} row
 * @param {Array<string>} columnHeaders — normalized field names
 * @returns {object}
 */
export function parseDataRow(row, columnHeaders) {
  const obj = {};
  for (let i = 0; i < (columnHeaders || []).length; i++) {
    const field = columnHeaders[i];
    if (!field) continue;
    obj[field] = (row[i] || '').toString().trim();
  }
  return obj;
}

/* ------------------------------------------------------------------ */
/*  Block extraction                                                   */
/* ------------------------------------------------------------------ */

/**
 * Extract one paket block starting at `headerIdx`.
 *
 * @param {Array<Array<string>>} rows
 * @param {number} headerIdx — index of the column-header row
 * @returns {{ block: object, nextIndex: number }}
 */
function _extractBlock(rows, headerIdx) {
  const columnHeaders = _normalizeHeaders(rows[headerIdx]);

  // Find metadata row: scan backward from headerIdx, skip empty rows
  let metaIdx = headerIdx - 1;
  while (metaIdx >= 0 && isEmptyRow(rows[metaIdx])) {
    metaIdx--;
  }
  const metadata = metaIdx >= 0 ? parseMetaRow(rows[metaIdx]) : {};

  // Walk forward: collect data rows until summary or next header
  let idx = headerIdx + 1;
  const dataRows = [];

  while (idx < rows.length) {
    const currentRow = rows[idx];

    if (isEmptyRow(currentRow)) {
      idx++;
      continue;
    }

    if (isSummaryRow(currentRow)) {
      const summary = parseSummaryRow(currentRow);
      return {
        block: { metadata, columnHeaders, jamaah: dataRows, summary },
        nextIndex: idx + 1,
      };
    }

    if (isColumnHeaderRow(currentRow)) {
      // Next block started — no summary found for this one
      return {
        block: { metadata, columnHeaders, jamaah: dataRows, summary: null },
        nextIndex: idx,
      };
    }

    dataRows.push(parseDataRow(currentRow, columnHeaders));
    idx++;
  }

  return {
    block: { metadata, columnHeaders, jamaah: dataRows, summary: null },
    nextIndex: idx,
  };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Parse raw DATA JAMAAH sheet data into an array of paket blocks.
 *
 * @param {Array<Array<string>>} rawRows — 2D array from Google Sheets API
 * @returns {Array<{metadata: object, columnHeaders: string[], jamaah: object[], summary: object|null}>}
 */
export function parseSheetData(rawRows) {
  if (!rawRows || rawRows.length === 0) return [];

  const blocks = [];
  let i = 0;

  while (i < rawRows.length) {
    if (isColumnHeaderRow(rawRows[i])) {
      const { block, nextIndex } = _extractBlock(rawRows, i);
      blocks.push(block);
      i = nextIndex;
    } else {
      i++;
    }
  }

  return blocks;
}
