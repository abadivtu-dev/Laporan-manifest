import { describe, it, expect } from 'vitest';
import { crosscheckWithInvoice } from '../../../src/comparator/crosscheck.js';

function j(uniqueId, nama) {
  return { uniqueId, NAMA: nama };
}

describe('crosscheckWithInvoice', () => {
  it('filter jamaah yang PAKET TERAKHIR berbeda dari paket saat ini', () => {
    const newJamaah = [j('NIK-001', 'Andi'), j('NIK-002', 'Budi'), j('NIK-003', 'Cici')];
    const invoiceMap = new Map([
      ['NIK-002', 'PAKET UMROH 11H - JUNI 2026'], // Budi pindah dari paket lain
      ['NIK-003', 'PAKET UMROH 13H - JUNI 2026'], // Cici pindah dari paket lain
    ]);
    const currentPackage = 'PAKET UMROH 9H - JULI 2026';

    const result = crosscheckWithInvoice(newJamaah, invoiceMap, currentPackage);

    expect(result.jamaahBaru).toHaveLength(1);
    expect(result.jamaahBaru[0].NAMA).toBe('Andi');
    expect(result.jamaahPindahan).toHaveLength(2);
    expect(result.jamaahPindahan.map((j) => j.NAMA)).toEqual(['Budi', 'Cici']);
  });

  it('jamaah dengan PAKET TERAKHIR sama dengan paket saat ini tetap dianggap baru', () => {
    const newJamaah = [j('NIK-001', 'Andi')];
    const invoiceMap = new Map([['NIK-001', 'PAKET UMROH 9H - JULI 2026']]);
    const currentPackage = 'PAKET UMROH 9H - JULI 2026';

    const result = crosscheckWithInvoice(newJamaah, invoiceMap, currentPackage);

    expect(result.jamaahBaru).toHaveLength(1);
    expect(result.jamaahPindahan).toHaveLength(0);
  });

  it('jamaah tidak ada di invoice map: tetap dihitung baru', () => {
    const newJamaah = [j('NIK-001', 'Andi'), j('NIK-002', 'Budi')];
    const invoiceMap = new Map();
    const currentPackage = 'PAKET A';

    const result = crosscheckWithInvoice(newJamaah, invoiceMap, currentPackage);

    expect(result.jamaahBaru).toHaveLength(2);
    expect(result.jamaahPindahan).toHaveLength(0);
  });

  it('input array kosong', () => {
    const result = crosscheckWithInvoice([], new Map(), 'PAKET A');

    expect(result.jamaahBaru).toHaveLength(0);
    expect(result.jamaahPindahan).toHaveLength(0);
  });

  it('invoice map null atau undefined', () => {
    const newJamaah = [j('NIK-001', 'Andi')];

    const result = crosscheckWithInvoice(newJamaah, null, 'PAKET A');

    expect(result.jamaahBaru).toHaveLength(1);
    expect(result.jamaahPindahan).toHaveLength(0);
  });
});
