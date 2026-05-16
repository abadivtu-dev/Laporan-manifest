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
  'PROSES CANCEL / PINDAH': 'proses',
  'PROSES': 'proses',
  'KELUARGA/ROMBONGAN': 'keluarga',
  'NO JAMAAH': 'noJamaah',
  'ID REGISTER': 'idRegister',
  'NIK': 'nik',
  'JENIS IDENTITAS': 'jenisIdentitas',
  'NAMA': 'nama',
  'STATUS PASPOR': 'statusPaspor',
  'KETERANGAN PASPOR': 'keteranganPaspor',
  'HOTEL MAKKAH': 'hotelMakkah',
  'HOTEL MADINAH': 'hotelMadinah',
  'KAMAR': 'kamar',
  'TOTAL PEMBAYARAN': 'totalPembayaran',
  'KURANG BAYAR': 'kurangBayar',
  'JENIS KELAMIN': 'jenisKelamin',
  'TEMPAT LAHIR': 'tempatLahir',
  'TGL LAHIR': 'tglLahir',
  'STATUS MENIKAH': 'statusMenikah',
  'NO TELP/HP': 'noTelp',
  'REQUEST WAITING LIST': 'requestWaitingList',
  'PEKERJAAN': 'pekerjaan',
  'PENDIDIKAN TERAKHIR': 'pendidikanTerakhir',
  'NO PASPOR': 'noPaspor',
  'NAMA PASPOR': 'namaPaspor',
  'TGL DIKELUARKAN': 'tglDikeluarkan',
  'TGL HABIS': 'tglHabis',
  'KOTA PASPOR': 'kotaPaspor',
  'HUB': 'hub',
  'ALAMAT': 'alamat',
  'NO MANIFEST': 'noManifest',
};

/* ------------------------------------------------------------------ */
/*  Row-type detection helpers                                        */
/* ------------------------------------------------------------------ */

/**
 * Check if a row is empty (all cells blank/whitespace).
 */
export function isEmptyRow(row) {
  if (!row || row.length === 0) return true;
  return row.every((cell) => !cell || cell.toString().trim() === '');
}

/**
 * Detect seat-info row — column G (index 6) contains "Jml. Seat".
 */
export function isSeatInfoRow(row) {
  if (!row || row.length < 8) return false;
  const g = (row[6] || '').toString().trim().toUpperCase();
  return g.includes('JML') && g.includes('SEAT');
}

/**
 * Detect column-header row — col D (3) starts with "PROSES",
 * col E (4) starts with "KELUARGA", col F (5) starts with "NO".
 */
export function isColumnHeaderRow(row) {
  if (!row || row.length < 6) return false;
  const c3 = (row[3] || '').toString().trim().toUpperCase();
  const c4 = (row[4] || '').toString().trim().toUpperCase();
  const c5 = (row[5] || '').toString().trim().toUpperCase();
  return (
    c3.startsWith('PROSES') &&
    c4.startsWith('KELUARGA') &&
    c5.startsWith('NO')
  );
}

/**
 * Detect summary row — checks col A (index 0) and col F (index 5) for
 * "JUMLAH JAMAAH", "JAMAAH PRIA", "JAMAAH WANITA", or "TOTAL".
 */
export function isSummaryRow(row) {
  if (!row || row.length === 0) return false;
  const first = (row[0] || '').toString().trim().toUpperCase();
  const colF = row.length > 5 ? (row[5] || '').toString().trim().toUpperCase() : '';
  return (
    first.startsWith('JUMLAH') ||
    first.startsWith('TOTAL') ||
    colF.startsWith('JUMLAH') ||
    colF.startsWith('JAMAAH')
  );
}

/* ------------------------------------------------------------------ */
/*  Row parsers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Parse seat-info row (fixed-position layout).
 *
 * Col D (3): block number
 * Col E (4): kode paket
 * Col H (7): jumlah seat
 * Col J (9): sisa seat
 * Col K (10): tanggal keberangkatan (DD-Mon-YYYY)
 * Col M (12): maskapai
 * Col N (13): bandara asal
 * Col O (14): bandara tujuan
 */
export function parseSeatInfoRow(row) {
  if (!row || isEmptyRow(row)) return {};

  const rawTanggal = (row[10] || '').toString().trim();
  const rawJumlah = (row[7] || '').toString().trim();
  const rawSisa = (row[9] || '').toString().trim();

  return {
    kodePaket: (row[4] || '').toString().trim(),
    jumlahSeat: parseInt(rawJumlah, 10) || 0,
    sisaSeat: parseInt(rawSisa, 10) || 0,
    tanggalKeberangkatan: rawTanggal,
    maskapai: (row[12] || '').toString().trim(),
    asal: (row[13] || '').toString().trim(),
    tujuan: (row[14] || '').toString().trim(),
  };
}

/**
 * Parse descriptive rows between seat-info and column-header.
 * Extracts namaPaket from the "4A1" row (col F), rute from "3A1" row.
 */
export function parseDescriptionRows(descRows) {
  let namaPaket = '';
  let rute = '';

  for (const row of descRows) {
    if (!row || isEmptyRow(row)) continue;
    const marker = (row[2] || '').toString().trim().toUpperCase();
    const textF = (row[6] || '').toString().trim();

    if (marker.includes('4A')) {
      namaPaket = textF || namaPaket;
    } else if (marker.includes('3A')) {
      rute = textF || rute;
    } else if (!namaPaket && textF) {
      namaPaket = textF;
    }
  }

  return { namaPaket, rute };
}

/**
 * Parse a summary row into { jumlahJamaah, jamaahPria, jamaahWanita }.
 *
 * Summary rows have the label in col F (index 5) and value in col J (index 9):
 *   "JUMLAH JAMAAH" → jumlahJamaah
 *   "JAMAAH PRIA"   → jamaahPria
 *   "JAMAAH WANITA" → jamaahWanita
 */
export function parseSummaryRow(row) {
  if (!row || isEmptyRow(row)) return null;

  const label = row.length > 5 ? (row[5] || '').toString().trim().toUpperCase() : '';
  const rawValue = row.length > 9 ? (row[9] || '').toString().trim() : '0';
  const value = parseInt(rawValue, 10) || 0;

  if (label.startsWith('JUMLAH')) {
    return { jumlahJamaah: value, jamaahPria: 0, jamaahWanita: 0 };
  }
  if (label.startsWith('JAMAAH PRIA') || label === 'PRIA') {
    return { jumlahJamaah: 0, jamaahPria: value, jamaahWanita: 0 };
  }
  if (label.startsWith('JAMAAH WANITA') || label === 'WANITA') {
    return { jumlahJamaah: 0, jamaahPria: 0, jamaahWanita: value };
  }

  return null;
}

/**
 * Normalize a single header cell: remove newlines, (*) markers, extra spaces.
 */
function _normalizeHeader(raw) {
  if (!raw) return '';
  return raw
    .replace(/\n/g, ' ')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize column-header row into field-name array.
 */
function _normalizeHeaders(headerRow) {
  return (headerRow || []).map((h) => {
    const normalized = _normalizeHeader(h);
    return COLUMN_FIELD_MAP[normalized] || '';
  });
}

/**
 * Parse a single data row using normalized column headers.
 */
export function parseDataRow(row, columnHeaders) {
  const obj = {};
  for (let i = 0; i < (columnHeaders || []).length; i++) {
    const field = columnHeaders[i];
    if (!field) continue;
    obj[field] = (row[i] || '').toString().trim();
  }
  obj.uniqueId = obj.idRegister || obj.nik || '';
  return obj;
}

/* ------------------------------------------------------------------ */
/*  Block extraction                                                   */
/* ------------------------------------------------------------------ */

/**
 * Extract one paket block starting at `seatInfoIdx`.
 *
 * Structure:
 *   [seat info row]  ← seatInfoIdx
 *   [optional: trip-date row, empty rows]
 *   [description rows: nama paket, rute]
 *   [column header row]
 *   [data rows...]
 *   [summary row or next seat-info row]
 *
 * @returns {{ block: object, nextIndex: number }}
 */
function _extractBlock(rows, seatInfoIdx) {
  // Parse seat info
  const seatInfo = parseSeatInfoRow(rows[seatInfoIdx]);

  // Scan forward: collect description rows until column header
  let idx = seatInfoIdx + 1;
  const descRows = [];

  while (idx < rows.length) {
    const row = rows[idx];
    if (isColumnHeaderRow(row)) break;
    if (isSeatInfoRow(row)) break; // malformed block, no header found
    if (isEmptyRow(row)) {
      idx++;
      continue;
    }
    descRows.push(row);
    idx++;
  }

  // Parse description
  const desc = parseDescriptionRows(descRows);

  // If we hit another seat-info or EOF before column header, return what we have
  if (idx >= rows.length || isSeatInfoRow(rows[idx])) {
    return {
      block: {
        metadata: {
          ...seatInfo,
          ...desc,
        },
        columnHeaders: [],
        jamaah: [],
        summary: null,
        seatInfoRow: rows[seatInfoIdx],
        descRows,
        rawRows: [],
      },
      nextIndex: idx,
    };
  }

  // Parse column headers
  const columnHeaders = _normalizeHeaders(rows[idx]);

  // Walk forward: collect data rows until summary or next seat-info
  idx++;
  const dataRows = [];
  const rawRows = [];

  while (idx < rows.length) {
    const currentRow = rows[idx];

    if (isEmptyRow(currentRow)) {
      idx++;
      continue;
    }

    if (isSeatInfoRow(currentRow)) {
      // Next block started
      return {
        block: {
          metadata: { ...seatInfo, ...desc },
          columnHeaders,
          jamaah: dataRows,
          summary: null,
          seatInfoRow: rows[seatInfoIdx],
          descRows,
          rawRows,
        },
        nextIndex: idx,
      };
    }

    if (isSummaryRow(currentRow)) {
      // Collect all consecutive summary rows (JUMLAH JAMAAH, PRIA, WANITA)
      const summary = parseSummaryRow(currentRow) || {};
      idx++;
      while (idx < rows.length) {
        const nextRow = rows[idx];
        if (isEmptyRow(nextRow)) {
          idx++;
          continue;
        }
        if (isSummaryRow(nextRow)) {
          const nextSummary = parseSummaryRow(nextRow);
          if (nextSummary) {
            if (nextSummary.jumlahJamaah > 0) summary.jumlahJamaah = nextSummary.jumlahJamaah;
            if (nextSummary.jamaahPria > 0) summary.jamaahPria = nextSummary.jamaahPria;
            if (nextSummary.jamaahWanita > 0) summary.jamaahWanita = nextSummary.jamaahWanita;
          }
          idx++;
          continue;
        }
        break;
      }
      return {
        block: {
          metadata: { ...seatInfo, ...desc },
          columnHeaders,
          jamaah: dataRows,
          summary,
          seatInfoRow: rows[seatInfoIdx],
          descRows,
          rawRows,
        },
        nextIndex: idx,
      };
    }

    if (isColumnHeaderRow(currentRow)) {
      // Malformed — another header before summary/seat-info
      return {
        block: {
          metadata: { ...seatInfo, ...desc },
          columnHeaders,
          jamaah: dataRows,
          summary: null,
          seatInfoRow: rows[seatInfoIdx],
          descRows,
          rawRows,
        },
        nextIndex: idx,
      };
    }

    dataRows.push(parseDataRow(currentRow, columnHeaders));
    rawRows.push(currentRow);
    idx++;
  }

  return {
    block: {
      metadata: { ...seatInfo, ...desc },
      columnHeaders,
      jamaah: dataRows,
      summary: null,
      seatInfoRow: rows[seatInfoIdx],
      descRows,
      rawRows,
    },
    nextIndex: idx,
  };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Parse raw DATA JAMAAH sheet data into an array of paket blocks.
 *
 * Detection starts from "Jml. Seat" rows (seat-info row).
 *
 * @param {Array<Array<string>>} rawRows — 2D array from Google Sheets API
 * @returns {Array<{metadata: object, columnHeaders: string[], jamaah: object[], summary: object|null}>}
 */
export function parseSheetData(rawRows) {
  if (!rawRows || rawRows.length === 0) return [];

  const blocks = [];
  let i = 0;

  while (i < rawRows.length) {
    if (isSeatInfoRow(rawRows[i])) {
      const { block, nextIndex } = _extractBlock(rawRows, i);
      blocks.push(block);
      i = nextIndex;
    } else {
      i++;
    }
  }

  return blocks;
}
