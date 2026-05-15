import { describe, it, expect } from 'vitest';
import {
  parseSheetData,
  isColumnHeaderRow,
  isSummaryRow,
  isEmptyRow,
  parseMetaRow,
  parseSummaryRow,
  parseDataRow,
} from '../../../src/sheets/parser.js';

/* ------------------------------------------------------------------ */
/*  Helper to build a full DATA JAMAAH sheet array                     */
/* ------------------------------------------------------------------ */
function buildFullHeaders() {
  return [
    'PROSES/CANCEL/PINDAH',
    'KELUARGA/ROMBONGAN',
    'NO JAMAAH',
    'ID REGISTER',
    'NIK',
    'JENIS IDENTITAS',
    'NAMA',
    'STATUS PASPOR',
    'KETERANGAN PASPOR',
    'HOTEL MAKKAH',
    'HOTEL MADINAH',
    'KAMAR',
    'TOTAL PEMBAYARAN',
    'KURANG BAYAR',
    'JENIS KELAMIN',
    'TEMPAT LAHIR',
    'TGL LAHIR',
    'STATUS MENIKAH',
    'NO TELP/HP',
    'REQUEST WAITING LIST',
    'PEKERJAAN',
    'PENDIDIKAN TERAKHIR',
    'NO PASPOR',
    'NAMA PASPOR',
    'TGL DIKELUARKAN',
    'TGL HABIS',
    'KOTA PASPOR',
    'HUB',
    'ALAMAT',
    'NO MANIFEST',
  ];
}

function jamaahDataRow(overrides = {}) {
  const row = [
    '',                              // PROSES
    'KELUARGA 001',                  // KELUARGA
    '001',                           // NO JAMAAH
    'REG-001',                       // ID REGISTER
    '3273010505900001',              // NIK
    'KTP',                           // JENIS IDENTITAS
    'ANDI SURYA',                    // NAMA
    'VALID',                         // STATUS PASPOR
    '',                              // KETERANGAN PASPOR
    'Movenpick',                     // HOTEL MAKKAH
    'Pullman',                       // HOTEL MADINAH
    '245',                           // KAMAR
    '25000000',                      // TOTAL PEMBAYARAN
    '0',                             // KURANG BAYAR
    'L',                             // JENIS KELAMIN
    'Jakarta',                       // TEMPAT LAHIR
    '15/05/1990',                    // TGL LAHIR
    'Kawin',                         // STATUS MENIKAH
    '08123456789',                   // NO TELP/HP
    '',                              // REQUEST WAITING LIST
    'Swasta',                        // PEKERJAAN
    'S1',                            // PENDIDIKAN TERAKHIR
    'C1234567',                      // NO PASPOR
    'ANDI SURYA',                    // NAMA PASPOR
    '01/01/2025',                    // TGL DIKELUARKAN
    '01/01/2030',                    // TGL HABIS
    'Jakarta',                       // KOTA PASPOR
    'KEPALA KELUARGA',               // HUB
    'Jl. Contoh No. 123',            // ALAMAT
    '001',                           // NO MANIFEST
  ];
  for (const [k, v] of Object.entries(overrides)) {
    const idx = { nik: 4, nama: 6, noJamaah: 2, proses: 0, keluarga: 1, noManifest: 29 }[k];
    if (idx !== undefined) row[idx] = v;
  }
  return row;
}

function summaryRow(jumlah = 2, pria = 1, wanita = 1) {
  const row = new Array(30).fill('');
  row[0] = `JUMLAH JAMAAH: ${jumlah}`;
  row[1] = `PRIA: ${pria}`;
  row[2] = `WANITA: ${wanita}`;
  return row;
}

function metaRow(overrides = {}) {
  return [
    overrides.kodePaket ?? 'KODE PAKET: UMR-001',
    overrides.namaPaket ?? 'PAKET: Umroh Reguler Juni 2026',
    overrides.seat ?? 'SEAT: 45',
    overrides.sisa ?? 'SISA: 5',
    overrides.tgl ?? 'TGL: 15/06/2026',
    overrides.maskapai ?? 'MASKAPAI: Saudia',
    overrides.rute ?? 'RUTE: CGK-JED-CGK',
  ];
}

/* ------------------------------------------------------------------ */
/*  Parser — detection helpers                                         */
/* ------------------------------------------------------------------ */

describe('isEmptyRow', () => {
  it('returns true for null/undefined', () => {
    expect(isEmptyRow(null)).toBe(true);
    expect(isEmptyRow(undefined)).toBe(true);
  });

  it('returns true for empty array', () => {
    expect(isEmptyRow([])).toBe(true);
  });

  it('returns true for row with all empty strings', () => {
    expect(isEmptyRow(['', '', ''])).toBe(true);
  });

  it('returns false for a row with data', () => {
    expect(isEmptyRow(['KODE PAKET: UMR-001', '', 'SEAT: 45'])).toBe(false);
  });

  it('returns true for row with only whitespace cells', () => {
    expect(isEmptyRow(['  ', '', '   '])).toBe(true);
  });
});

describe('isColumnHeaderRow', () => {
  it('detects a valid column header row', () => {
    expect(isColumnHeaderRow(buildFullHeaders())).toBe(true);
  });

  it('returns false for empty row', () => {
    expect(isColumnHeaderRow([])).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isColumnHeaderRow(null)).toBe(false);
    expect(isColumnHeaderRow(undefined)).toBe(false);
  });

  it('returns false for a data row', () => {
    expect(isColumnHeaderRow(jamaahDataRow())).toBe(false);
  });

  it('returns false for a summary row', () => {
    expect(isColumnHeaderRow(summaryRow())).toBe(false);
  });

  it('returns false for a metadata row', () => {
    expect(isColumnHeaderRow(metaRow())).toBe(false);
  });

  it('detects header even with extra columns', () => {
    const h = buildFullHeaders();
    h.push('EXTRA');
    expect(isColumnHeaderRow(h)).toBe(true);
  });

  it('detects header with "PROSES" (without CANCEL/PINDAH suffix)', () => {
    const h = buildFullHeaders();
    h[0] = 'PROSES';
    expect(isColumnHeaderRow(h)).toBe(true);
  });
});

describe('isSummaryRow', () => {
  it('detects a summary row starting with "JUMLAH JAMAAH"', () => {
    expect(isSummaryRow(summaryRow())).toBe(true);
  });

  it('returns false for empty row', () => {
    expect(isSummaryRow([])).toBe(false);
  });

  it('returns false for a data row', () => {
    expect(isSummaryRow(jamaahDataRow())).toBe(false);
  });

  it('returns false for a metadata row', () => {
    expect(isSummaryRow(metaRow())).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isSummaryRow(null)).toBe(false);
    expect(isSummaryRow(undefined)).toBe(false);
  });

  it('detects row that starts with "JUMLAH" prefix only', () => {
    expect(isSummaryRow(['JUMLAH: 10', 'PRIA: 5', 'WANITA: 5'])).toBe(true);
  });

  it('detects row with "TOTAL" in first cell', () => {
    expect(isSummaryRow(['TOTAL: 5', 'PRIA: 3', 'WANITA: 2'])).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Parser — row parsers                                                */
/* ------------------------------------------------------------------ */

describe('parseMetaRow', () => {
  it('extracts all fields from a complete metadata row', () => {
    const result = parseMetaRow(metaRow());
    expect(result).toEqual({
      kodePaket: 'UMR-001',
      namaPaket: 'Umroh Reguler Juni 2026',
      jumlahSeat: 45,
      sisaSeat: 5,
      tanggalKeberangkatan: '15/06/2026',
      maskapai: 'Saudia',
      rute: 'CGK-JED-CGK',
    });
  });

  it('handles partial metadata (only kode paket)', () => {
    const result = parseMetaRow(['KODE PAKET: UMR-001', '', '', '', '', '', '']);
    expect(result).toEqual({
      kodePaket: 'UMR-001',
    });
  });

  it('returns empty object for empty row', () => {
    expect(parseMetaRow([])).toEqual({});
    expect(parseMetaRow(null)).toEqual({});
  });

  it('parses numeric fields correctly', () => {
    const result = parseMetaRow(metaRow({ seat: 'SEAT: 100', sisa: 'SISA: 0' }));
    expect(result.jumlahSeat).toBe(100);
    expect(result.sisaSeat).toBe(0);
  });

  it('handles "TANGGAL" key', () => {
    const result = parseMetaRow(['TANGGAL: 20/07/2026']);
    expect(result.tanggalKeberangkatan).toBe('20/07/2026');
  });
});

describe('parseSummaryRow', () => {
  it('extracts summary fields', () => {
    const result = parseSummaryRow(summaryRow(40, 20, 20));
    expect(result).toEqual({
      jumlahJamaah: 40,
      jamaahPria: 20,
      jamaahWanita: 20,
    });
  });

  it('returns null for empty row', () => {
    expect(parseSummaryRow([])).toBeNull();
    expect(parseSummaryRow(null)).toBeNull();
  });

  it('handles zero counts', () => {
    const result = parseSummaryRow(summaryRow(0, 0, 0));
    expect(result).toEqual({
      jumlahJamaah: 0,
      jamaahPria: 0,
      jamaahWanita: 0,
    });
  });

  it('parses "JUMLAH JAMAAH:" with whitespace', () => {
    const row = ['  JUMLAH JAMAAH: 5  ', '  PRIA: 2  ', '  WANITA: 3  '];
    expect(parseSummaryRow(row)).toEqual({
      jumlahJamaah: 5,
      jamaahPria: 2,
      jamaahWanita: 3,
    });
  });

  it('handles "JAMAAH PRIA" / "JAMAAH WANITA" keys', () => {
    const row = ['JUMLAH JAMAAH: 10', 'JAMAAH PRIA: 6', 'JAMAAH WANITA: 4'];
    expect(parseSummaryRow(row)).toEqual({
      jumlahJamaah: 10,
      jamaahPria: 6,
      jamaahWanita: 4,
    });
  });
});

describe('parseDataRow', () => {
  // parseDataRow expects pre-normalized column headers (from COLUMN_FIELD_MAP)
  const normalizedHeaders = [
    'proses', 'keluarga', 'noJamaah', 'idRegister', 'nik', 'jenisIdentitas',
    'nama', 'statusPaspor', 'keteranganPaspor', 'hotelMakkah', 'hotelMadinah',
    'kamar', 'totalPembayaran', 'kurangBayar', 'jenisKelamin', 'tempatLahir',
    'tglLahir', 'statusMenikah', 'noTelp', 'requestWaitingList', 'pekerjaan',
    'pendidikanTerakhir', 'noPaspor', 'namaPaspor', 'tglDikeluarkan', 'tglHabis',
    'kotaPaspor', 'hub', 'alamat', 'noManifest',
  ];

  it('maps a data row to structured object', () => {
    const row = jamaahDataRow();
    const result = parseDataRow(row, normalizedHeaders);
    expect(result.nama).toBe('ANDI SURYA');
    expect(result.nik).toBe('3273010505900001');
    expect(result.noJamaah).toBe('001');
    expect(result.idRegister).toBe('REG-001');
    expect(result.namaPaspor).toBe('ANDI SURYA');
    expect(result.noPaspor).toBe('C1234567');
    expect(result.totalPembayaran).toBe('25000000');
  });

  it('handles row shorter than headers gracefully', () => {
    const shortRow = ['', '', '001', '', 'NIK-001'];
    const result = parseDataRow(shortRow, normalizedHeaders);
    expect(result.noJamaah).toBe('001');
    expect(result.nik).toBe('NIK-001');
    expect(result.nama).toBe('');
  });

  it('trims whitespace from cell values', () => {
    const row = jamaahDataRow({ nama: '  ANDI SURYA  ' });
    const result = parseDataRow(row, normalizedHeaders);
    expect(result.nama).toBe('ANDI SURYA');
  });

  it('maps column headers using COLUMN_FIELD_MAP', () => {
    const result = parseDataRow(jamaahDataRow(), normalizedHeaders);
    expect(result).toHaveProperty('proses');
    expect(result).toHaveProperty('keluarga');
    expect(result).toHaveProperty('noJamaah');
    expect(result).toHaveProperty('nama');
    expect(result).toHaveProperty('nik');
    expect(result).toHaveProperty('statusPaspor');
    expect(result).toHaveProperty('totalPembayaran');
    expect(result).toHaveProperty('kurangBayar');
    expect(result).toHaveProperty('jenisKelamin');
    expect(result).toHaveProperty('noManifest');
  });
});

/* ------------------------------------------------------------------ */
/*  parseSheetData — integration scenarios                              */
/* ------------------------------------------------------------------ */

describe('parseSheetData', () => {
  it('parses a single paket block with 2 jamaah', () => {
    const data = [
      metaRow(),
      buildFullHeaders(),
      jamaahDataRow({ noJamaah: '001', nama: 'ANDI SURYA', nik: 'NIK-001' }),
      jamaahDataRow({ noJamaah: '002', nama: 'BUDI SANTOSO', nik: 'NIK-002' }),
      summaryRow(2, 2, 0),
    ];

    const result = parseSheetData(data);
    expect(result).toHaveLength(1);

    const paket = result[0];
    expect(paket.metadata.kodePaket).toBe('UMR-001');
    expect(paket.metadata.namaPaket).toBe('Umroh Reguler Juni 2026');
    expect(paket.jamaah).toHaveLength(2);
    expect(paket.jamaah[0].nama).toBe('ANDI SURYA');
    expect(paket.jamaah[1].nama).toBe('BUDI SANTOSO');
    expect(paket.summary.jumlahJamaah).toBe(2);
  });

  it('parses two paket blocks', () => {
    const data = [
      // Block 1
      metaRow({ kodePaket: 'KODE PAKET: UMR-001' }),
      buildFullHeaders(),
      jamaahDataRow({ noJamaah: '001', nama: 'ANDI SURYA' }),
      summaryRow(1, 1, 0),
      // Empty separator
      [],
      // Block 2
      metaRow({ kodePaket: 'KODE PAKET: UMR-002', namaPaket: 'PAKET: Umroh VIP' }),
      buildFullHeaders(),
      jamaahDataRow({ noJamaah: '001', nama: 'CICI DEWI' }),
      jamaahDataRow({ noJamaah: '002', nama: 'DEDI KURNIAWAN' }),
      summaryRow(2, 1, 1),
    ];

    const result = parseSheetData(data);
    expect(result).toHaveLength(2);

    expect(result[0].metadata.kodePaket).toBe('UMR-001');
    expect(result[0].jamaah).toHaveLength(1);

    expect(result[1].metadata.kodePaket).toBe('UMR-002');
    expect(result[1].jamaah).toHaveLength(2);
    expect(result[1].summary.jumlahJamaah).toBe(2);
  });

  it('handles empty data (no paket blocks)', () => {
    expect(parseSheetData([])).toHaveLength(0);
    expect(parseSheetData([['some random data']])).toHaveLength(0);
    expect(parseSheetData([[''], ['']])).toHaveLength(0);
  });

  it('handles a block with no jamaah data', () => {
    const data = [
      metaRow({ seat: 'SEAT: 45', sisa: 'SISA: 45' }),
      buildFullHeaders(),
      summaryRow(0, 0, 0),
    ];

    const result = parseSheetData(data);
    expect(result).toHaveLength(1);
    expect(result[0].jamaah).toHaveLength(0);
    expect(result[0].summary.jumlahJamaah).toBe(0);
  });

  it('skips rows before the first paket block (global header)', () => {
    const data = [
      ['LAPORAN DATA JAMAAH'],
      ['BULAN: JUNI 2026'],
      [],
      metaRow({ kodePaket: 'KODE PAKET: UMR-001' }),
      buildFullHeaders(),
      jamaahDataRow({ nama: 'ANDI SURYA' }),
      summaryRow(1, 1, 0),
    ];

    const result = parseSheetData(data);
    expect(result).toHaveLength(1);
    expect(result[0].metadata.kodePaket).toBe('UMR-001');
  });

  it('handles partial metadata gracefully', () => {
    const data = [
      ['KODE PAKET: UMR-001'],
      buildFullHeaders(),
      jamaahDataRow({ nama: 'ANDI SURYA' }),
      summaryRow(1, 1, 0),
    ];

    const result = parseSheetData(data);
    expect(result).toHaveLength(1);
    expect(result[0].metadata.kodePaket).toBe('UMR-001');
    expect(result[0].metadata.namaPaket).toBeUndefined();
  });

  it('handles metadata row that is also the first row (no header before)', () => {
    const data = [
      metaRow(),
      buildFullHeaders(),
      jamaahDataRow({ nama: 'ANDI SURYA' }),
      summaryRow(1, 1, 0),
    ];

    const result = parseSheetData(data);
    expect(result).toHaveLength(1);
    expect(result[0].metadata.kodePaket).toBe('UMR-001');
  });

  it('preserves all jamaah fields in parsed data', () => {
    const data = [
      metaRow(),
      buildFullHeaders(),
      jamaahDataRow(),
      summaryRow(1, 1, 0),
    ];

    const result = parseSheetData(data);
    const j = result[0].jamaah[0];
    expect(j.noJamaah).toBe('001');
    expect(j.nik).toBe('3273010505900001');
    expect(j.jenisIdentitas).toBe('KTP');
    expect(j.nama).toBe('ANDI SURYA');
    expect(j.statusPaspor).toBe('VALID');
    expect(j.hotelMakkah).toBe('Movenpick');
    expect(j.hotelMadinah).toBe('Pullman');
    expect(j.kamar).toBe('245');
    expect(j.totalPembayaran).toBe('25000000');
    expect(j.jenisKelamin).toBe('L');
    expect(j.tempatLahir).toBe('Jakarta');
    expect(j.tglLahir).toBe('15/05/1990');
    expect(j.noTelp).toBe('08123456789');
    expect(j.pekerjaan).toBe('Swasta');
    expect(j.pendidikanTerakhir).toBe('S1');
    expect(j.noPaspor).toBe('C1234567');
    expect(j.noManifest).toBe('001');
  });
});
