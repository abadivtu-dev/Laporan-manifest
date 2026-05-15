import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- hoisted mocks ----
const { mockGetSheetValues, mockBatchGet } = vi.hoisted(() => ({
  mockGetSheetValues: vi.fn(),
  mockBatchGet: vi.fn(),
}));

vi.mock('../../../src/sheets/client.js', () => ({
  getSheetValues: mockGetSheetValues,
  batchGetValues: mockBatchGet,
}));

// ---- module under test ----
import { fetchInvoiceData } from '../../../src/sheets/invoice-reader.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const SPREADSHEET_ID = 'invoice-spreadsheet-id';

function indukDbTerkiniHeaders() {
  return [
    'UNIQUE JAMAAH',
    'NAMA LENGKAP',
    'PAKET TRANSAKSI',
    'PAKET TERAKHIR',
    'TANGGAL TRANSAKSI',
    'TOTAL BAYAR',
    'STATUS',
    'KETERANGAN',
  ];
}

function indukRow(uniqueId, namaLengkap, paketTransaksi, paketTerakhir, overrides = {}) {
  return [
    uniqueId,
    namaLengkap,
    paketTransaksi,
    paketTerakhir,
    overrides.tanggal || '01/01/2026',
    overrides.totalBayar || '25000000',
    overrides.status || 'LUNAS',
    overrides.keterangan || '',
  ];
}

function buildIndukDbTerkini() {
  return [
    indukDbTerkiniHeaders(),
    indukRow('NIK-001', 'ANDI SURYA', 'JUN-01', 'JUN-01'),
    indukRow('NIK-002', 'BUDI SANTOSO', 'JUN-01', 'JUL-01'),  // PINDAH ke JUL-01
    indukRow('NIK-003', 'CICI DEWI', 'JUL-01', 'JUL-01'),
    indukRow('NIK-004', 'DEDI KURNIAWAN', 'JUN-01', 'JUN-01'),
    indukRow('NIK-005', 'EKA FITRIANI', 'JUN-01', 'AGU-01'),  // PINDAH ke AGU-01
  ];
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('fetchInvoiceData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds lookup map from INDUK DB TERKINI', async () => {
    mockBatchGet.mockResolvedValue([buildIndukDbTerkini()]);

    const result = await fetchInvoiceData(SPREADSHEET_ID);

    expect(result.lookupMap).toBeInstanceOf(Map);
    expect(result.lookupMap.size).toBe(5);

    // Verify a non-moved jamaah
    expect(result.lookupMap.get('NIK-001')).toEqual({
      uniqueJamaah: 'NIK-001',
      namaLengkap: 'ANDI SURYA',
      paketTransaksi: 'JUN-01',
      paketTerakhir: 'JUN-01',
    });

    // Verify a moved jamaah (PAKET TERAKHIR != PAKET TRANSAKSI)
    expect(result.lookupMap.get('NIK-002')).toEqual({
      uniqueJamaah: 'NIK-002',
      namaLengkap: 'BUDI SANTOSO',
      paketTransaksi: 'JUN-01',
      paketTerakhir: 'JUL-01',
    });

    expect(result.lookupMap.get('NIK-005')).toEqual({
      uniqueJamaah: 'NIK-005',
      namaLengkap: 'EKA FITRIANI',
      paketTransaksi: 'JUN-01',
      paketTerakhir: 'AGU-01',
    });
  });

  it('throws when required columns are missing', async () => {
    // Headers without UNIQUE JAMAAH
    const badHeaders = ['NAMA', 'ALAMAT', 'TELP'];
    mockBatchGet.mockResolvedValue([[badHeaders]]);

    await expect(
      fetchInvoiceData(SPREADSHEET_ID)
    ).rejects.toThrow(/Required columns not found/);
  });

  it('throws when PAKET TERAKHIR column is missing', async () => {
    const badHeaders = ['UNIQUE JAMAAH', 'NAMA', 'ALAMAT'];
    mockBatchGet.mockResolvedValue([[badHeaders]]);

    await expect(
      fetchInvoiceData(SPREADSHEET_ID)
    ).rejects.toThrow(/Required columns not found/);
  });

  it('returns empty lookup map when sheet has only headers', async () => {
    mockBatchGet.mockResolvedValue([[indukDbTerkiniHeaders()]]);

    const result = await fetchInvoiceData(SPREADSHEET_ID);
    expect(result.lookupMap.size).toBe(0);
  });

  it('skips empty rows when building map', async () => {
    const data = [
      indukDbTerkiniHeaders(),
      indukRow('NIK-001', 'ANDI SURYA', 'JUN-01', 'JUN-01'),
      [],  // empty row
      ['', '', '', '', '', '', '', ''],  // row with empty strings
      indukRow('NIK-002', 'BUDI SANTOSO', 'JUN-01', 'JUL-01'),
    ];
    mockBatchGet.mockResolvedValue([data]);

    const result = await fetchInvoiceData(SPREADSHEET_ID);
    expect(result.lookupMap.size).toBe(2);
  });

  it('returns rawData including header row', async () => {
    mockBatchGet.mockResolvedValue([buildIndukDbTerkini()]);

    const result = await fetchInvoiceData(SPREADSHEET_ID);
    expect(result.rawData).toBeDefined();
    expect(result.rawData).toHaveLength(6); // header + 5 data rows
    expect(result.rawData[0]).toContain('UNIQUE JAMAAH');
  });

  it('throws contextual error on API failure', async () => {
    mockBatchGet.mockRejectedValue(new Error('Permission denied'));

    await expect(
      fetchInvoiceData(SPREADSHEET_ID)
    ).rejects.toThrow(/Gagal fetch invoice/);
  });

  it('handles empty sheet (no rows at all)', async () => {
    mockBatchGet.mockResolvedValue([[]]);

    await expect(
      fetchInvoiceData(SPREADSHEET_ID)
    ).rejects.toThrow(/Required columns not found/);
  });
});
