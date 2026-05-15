import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- hoisted mocks ----
const { mockBatchGet } = vi.hoisted(() => ({
  mockBatchGet: vi.fn(),
}));

vi.mock('../../../src/sheets/client.js', () => ({
  batchGetValues: mockBatchGet,
  getSheetValues: vi.fn(),
}));

// ---- module under test ----
import { fetchManifestData } from '../../../src/sheets/manifest-reader.js';

/* ------------------------------------------------------------------ */
/*  Helpers — realistic sheet data builders                            */
/* ------------------------------------------------------------------ */
const SPREADSHEET_ID = 'manifest-monthly-id';

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

function jamaahRow(noJamaah, nama, nik, overrides = {}) {
  const row = new Array(30).fill('');
  row[2] = noJamaah;
  row[3] = `REG-${noJamaah}`;
  row[4] = nik;
  row[6] = nama;
  row[12] = '25000000';
  row[13] = '0';
  row[14] = overrides.jk || 'L';
  row[29] = noJamaah;
  for (const [k, v] of Object.entries(overrides)) {
    const idx = { proses: 0, keluarga: 1, jk: 14, statusPaspor: 7 }[k];
    if (idx !== undefined) row[idx] = v;
  }
  return row;
}

function summaryRow(jumlah, pria, wanita) {
  const row = new Array(30).fill('');
  row[0] = `JUMLAH JAMAAH: ${jumlah}`;
  row[1] = `PRIA: ${pria}`;
  row[2] = `WANITA: ${wanita}`;
  return row;
}

function metaRow(kodePaket, namaPaket, tgl, seat, sisa, maskapai, rute) {
  return [
    `KODE PAKET: ${kodePaket}`,
    `PAKET: ${namaPaket}`,
    `SEAT: ${seat}`,
    `SISA: ${sisa}`,
    `TGL: ${tgl}`,
    `MASKAPAI: ${maskapai}`,
    `RUTE: ${rute}`,
  ];
}

function buildDataJamaahSheet() {
  return [
    // Block 1 — Paket A (June 15)
    metaRow('JUN-01', 'Umroh Reguler Juni', '15/06/2026', '45', '5', 'Saudia', 'CGK-JED-CGK'),
    buildFullHeaders(),
    jamaahRow('001', 'ANDI SURYA', 'NIK-001', { jk: 'L' }),
    jamaahRow('002', 'BUDI SANTOSO', 'NIK-002', { jk: 'L' }),
    jamaahRow('003', 'CICI DEWI', 'NIK-003', { jk: 'P' }),
    summaryRow(3, 2, 1),
    [],
    // Block 2 — Paket B (July 20)
    metaRow('JUL-01', 'Umroh VIP Juli', '20/07/2026', '30', '10', 'Emirates', 'CGK-DXB-JED-DXB-CGK'),
    buildFullHeaders(),
    jamaahRow('001', 'DEDI', 'NIK-004', { jk: 'L' }),
    jamaahRow('002', 'EKA', 'NIK-005', { jk: 'P' }),
    summaryRow(2, 1, 1),
  ];
}

function buildRekapSheet() {
  return [['REKAP', 'DATA']];
}

function buildUpdateSheet() {
  return [['UPDATE', 'DATA']];
}

function buildKosonganSheet() {
  return [['KOSONGAN', 'DATA']];
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('fetchManifestData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches 4 tabs, parses DATA JAMAAH, returns sorted paket array', async () => {
    mockBatchGet.mockResolvedValue([
      buildDataJamaahSheet(),
      buildRekapSheet(),
      buildUpdateSheet(),
      buildKosonganSheet(),
    ]);

    const result = await fetchManifestData(SPREADSHEET_ID);

    // Should be 2 pakets sorted by date
    expect(result).toHaveLength(2);

    // Sorted by date: June 15 first, then July 20
    expect(result[0].metadata.kodePaket).toBe('JUN-01');
    expect(result[0].metadata.tanggalKeberangkatan).toBe('15/06/2026');
    expect(result[0].jamaah).toHaveLength(3);
    expect(result[0].summary.jumlahJamaah).toBe(3);

    expect(result[1].metadata.kodePaket).toBe('JUL-01');
    expect(result[1].metadata.tanggalKeberangkatan).toBe('20/07/2026');
    expect(result[1].jamaah).toHaveLength(2);
    expect(result[1].summary.jumlahJamaah).toBe(2);
  });

  it('calls batchGetValues with correct 4 tab ranges', async () => {
    mockBatchGet.mockResolvedValue([
      buildDataJamaahSheet(),
      buildRekapSheet(),
      buildUpdateSheet(),
      buildKosonganSheet(),
    ]);

    await fetchManifestData(SPREADSHEET_ID);

    expect(mockBatchGet).toHaveBeenCalledTimes(1);
    const [actualId, actualRanges] = mockBatchGet.mock.calls[0];
    expect(actualId).toBe(SPREADSHEET_ID);
    expect(actualRanges).toEqual([
      'DATA JAMAAH!A1:AE',
      'DATA REKAP PAKET!A1:Z',
      'UPDATE JAMAAH!A1:Z',
      'DATA JAMAAH KOSONGAN!A1:Z',
    ]);
  });

  it('returns empty array when DATA JAMAAH has no data', async () => {
    mockBatchGet.mockResolvedValue([
      [],            // empty DATA JAMAAH
      buildRekapSheet(),
      buildUpdateSheet(),
      buildKosonganSheet(),
    ]);

    const result = await fetchManifestData(SPREADSHEET_ID);
    expect(result).toEqual([]);
  });

  it('includes rawData for all 4 tabs in each paket', async () => {
    mockBatchGet.mockResolvedValue([
      buildDataJamaahSheet(),
      buildRekapSheet(),
      buildUpdateSheet(),
      buildKosonganSheet(),
    ]);

    const result = await fetchManifestData(SPREADSHEET_ID);
    expect(result[0].rawData).toBeDefined();
    expect(result[0].rawData.dataJamaah).toBeDefined();
    expect(result[0].rawData.dataRekapPaket).toBeDefined();
    expect(result[0].rawData.updateJamaah).toBeDefined();
    expect(result[0].rawData.dataJamaahKosongan).toBeDefined();
  });

  it('sorts pakets by tanggalKeberangkatan ascending (terdekat ke terjauh)', async () => {
    // Build sheet with out-of-order dates
    const dataJamaah = [
      metaRow('MAR-01', 'Paket Maret', '15/03/2026', '45', '5', 'GA', 'CGK-JED'),
      buildFullHeaders(),
      jamaahRow('001', 'JAMAAH A', 'NIK-A', { jk: 'L' }),
      summaryRow(1, 1, 0),
      [],
      metaRow('JAN-01', 'Paket Januari', '10/01/2026', '30', '0', 'SA', 'CGK-MED'),
      buildFullHeaders(),
      jamaahRow('001', 'JAMAAH B', 'NIK-B', { jk: 'P' }),
      summaryRow(1, 0, 1),
      [],
      metaRow('FEB-01', 'Paket Februari', '20/02/2026', '40', '3', 'EK', 'CGK-DXB'),
      buildFullHeaders(),
      jamaahRow('001', 'JAMAAH C', 'NIK-C', { jk: 'L' }),
      summaryRow(1, 1, 0),
    ];

    mockBatchGet.mockResolvedValue([
      dataJamaah,
      buildRekapSheet(),
      buildUpdateSheet(),
      buildKosonganSheet(),
    ]);

    const result = await fetchManifestData(SPREADSHEET_ID);
    expect(result).toHaveLength(3);
    expect(result[0].metadata.kodePaket).toBe('JAN-01');
    expect(result[1].metadata.kodePaket).toBe('FEB-01');
    expect(result[2].metadata.kodePaket).toBe('MAR-01');
  });

  it('throws contextual error when batchGetValues fails', async () => {
    mockBatchGet.mockRejectedValue(new Error('API error'));

    await expect(
      fetchManifestData(SPREADSHEET_ID)
    ).rejects.toThrow(/Gagal fetch manifest/);
  });
});
