import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- hoisted mocks ----
const { mockGet, mockBatchGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockBatchGet: vi.fn(),
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn(),
    },
    sheets: vi.fn(() => ({
      spreadsheets: {
        values: {
          get: mockGet,
          batchGet: mockBatchGet,
        },
      },
    })),
  },
}));

// ---- module under test ----
import { getSheetValues, batchGetValues, _resetForTest } from '../../../src/sheets/client.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const SPREADSHEET_ID = 'test-spreadsheet-id';

describe('getSheetValues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTest();
  });

  it('returns values from a single range', async () => {
    const fakeData = [
      ['Nama', 'Umur'],
      ['Andi', '25'],
      ['Budi', '30'],
    ];
    mockGet.mockResolvedValue({ data: { values: fakeData } });

    const result = await getSheetValues(SPREADSHEET_ID, 'Sheet1!A1:B10');
    expect(result).toEqual(fakeData);
    expect(mockGet).toHaveBeenCalledWith({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A1:B10',
    });
  });

  it('returns empty array when sheet has no data', async () => {
    mockGet.mockResolvedValue({ data: {} });

    const result = await getSheetValues(SPREADSHEET_ID, 'EmptySheet!A1:Z');
    expect(result).toEqual([]);
  });

  it('returns empty array when values is null', async () => {
    mockGet.mockResolvedValue({ data: { values: null } });

    const result = await getSheetValues(SPREADSHEET_ID, 'Sheet1!A1:B');
    expect(result).toEqual([]);
  });

  it('throws contextual error on API failure', async () => {
    mockGet.mockRejectedValue(new Error('API rate limit exceeded'));

    await expect(
      getSheetValues(SPREADSHEET_ID, 'Sheet1!A1:Z')
    ).rejects.toThrow(/Gagal fetch/);

    await expect(
      getSheetValues(SPREADSHEET_ID, 'Sheet1!A1:Z')
    ).rejects.toThrow(/test-spreadsheet-id/);
  });

  it('re-throws with context including the range name', async () => {
    mockGet.mockRejectedValue(new Error('Not found'));

    await expect(
      getSheetValues(SPREADSHEET_ID, 'DATA JAMAAH!A1:Z')
    ).rejects.toThrow(/DATA JAMAAH/);
  });
});

describe('batchGetValues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTest();
  });

  it('returns values for each range in order', async () => {
    const ranges = ['Tab1!A1:Z', 'Tab2!A1:Z', 'Tab3!A1:Z', 'Tab4!A1:Z'];
    const fakeResponse = {
      data: {
        valueRanges: [
          { values: [['a1', 'b1'], ['a2', 'b2']] },
          { values: [['c1', 'd1']] },
          { values: [] },
          { values: [['e1']] },
        ],
      },
    };
    mockBatchGet.mockResolvedValue(fakeResponse);

    const result = await batchGetValues(SPREADSHEET_ID, ranges);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual([['a1', 'b1'], ['a2', 'b2']]);
    expect(result[1]).toEqual([['c1', 'd1']]);
    expect(result[2]).toEqual([]);
    expect(result[3]).toEqual([['e1']]);

    expect(mockBatchGet).toHaveBeenCalledWith({
      spreadsheetId: SPREADSHEET_ID,
      ranges,
    });
  });

  it('returns array of empty arrays when all ranges have no data', async () => {
    mockBatchGet.mockResolvedValue({
      data: {
        valueRanges: [
          { values: null },
          { values: null },
        ],
      },
    });

    const result = await batchGetValues(SPREADSHEET_ID, ['A!A1:Z', 'B!A1:Z']);
    expect(result).toEqual([[], []]);
  });

  it('throws contextual error on batch API failure', async () => {
    mockBatchGet.mockRejectedValue(new Error('Permission denied'));

    await expect(
      batchGetValues(SPREADSHEET_ID, ['Tab1!A1:Z'])
    ).rejects.toThrow(/Gagal batchGetValues/);
  });
});

describe('auth initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTest();
  });

  it('calls GoogleAuth constructor exactly once for multiple calls', async () => {
    const { google } = await import('googleapis');
    const googleAuthSpy = google.auth.GoogleAuth;

    mockGet.mockResolvedValue({ data: { values: [['ok']] } });

    await getSheetValues(SPREADSHEET_ID, 'R1');
    await getSheetValues(SPREADSHEET_ID, 'R2');

    // GoogleAuth should be called only once
    expect(googleAuthSpy).toHaveBeenCalledTimes(1);
    expect(googleAuthSpy).toHaveBeenCalledWith({
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  });
});
