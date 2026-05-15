import { describe, it, expect } from 'vitest';
import { detectNewJamaah, generateJamaahHash } from '../../../src/comparator/engine.js';

function j(nik, nama) {
  return { uniqueId: nik, NAMA: nama, NIK: nik };
}

describe('detectNewJamaah', () => {
  it('mendeteksi jamaah yang ada hari ini tapi tidak kemarin', () => {
    const kemarin = [j('NIK-001', 'Andi'), j('NIK-002', 'Budi')];
    const hariIni = [j('NIK-001', 'Andi'), j('NIK-002', 'Budi'), j('NIK-003', 'Cici')];

    const result = detectNewJamaah(kemarin, hariIni);

    expect(result.newJamaah).toHaveLength(1);
    expect(result.newJamaah[0].NAMA).toBe('Cici');
    expect(result.newCount).toBe(1);
    expect(result.isFirstRun).toBe(false);
    expect(result.noChanges).toBe(false);
  });

  it('return array kosong jika tidak ada jamaah baru', () => {
    const kemarin = [j('NIK-001', 'Andi')];
    const hariIni = [j('NIK-001', 'Andi')];

    const result = detectNewJamaah(kemarin, hariIni);

    expect(result.newJamaah).toHaveLength(0);
    expect(result.newCount).toBe(0);
    expect(result.noChanges).toBe(true);
  });

  it('semua jamaah dianggap baru jika snapshot kemarin null (first run)', () => {
    const hariIni = [j('NIK-001', 'Andi'), j('NIK-002', 'Budi')];

    const result = detectNewJamaah(null, hariIni);

    expect(result.newJamaah).toHaveLength(2);
    expect(result.newCount).toBe(2);
    expect(result.isFirstRun).toBe(true);
  });

  it('deteksi jamaah keluar (ada kemarin, tidak ada hari ini)', () => {
    const kemarin = [j('NIK-001', 'Andi'), j('NIK-002', 'Budi'), j('NIK-003', 'Cici')];
    const hariIni = [j('NIK-001', 'Andi'), j('NIK-003', 'Cici')];

    const result = detectNewJamaah(kemarin, hariIni);

    expect(result.removedJamaah).toHaveLength(1);
    expect(result.removedJamaah[0].NAMA).toBe('Budi');
    expect(result.removedCount).toBe(1);
  });

  it('handle snapshot array kosong', () => {
    const result = detectNewJamaah([], [j('NIK-001', 'Andi')]);

    expect(result.newJamaah).toHaveLength(1);
    expect(result.isFirstRun).toBe(false);
  });

  it('handle hari ini array kosong (paket kosong)', () => {
    const kemarin = [j('NIK-001', 'Andi')];
    const result = detectNewJamaah(kemarin, []);

    expect(result.newJamaah).toHaveLength(0);
    expect(result.removedJamaah).toHaveLength(1);
  });

  it('keduanya array kosong', () => {
    const result = detectNewJamaah([], []);

    expect(result.newJamaah).toHaveLength(0);
    expect(result.removedJamaah).toHaveLength(0);
    expect(result.noChanges).toBe(true);
  });

  it('hash pre-check mendeteksi no changes tanpa full diff', () => {
    const kemarin = [j('NIK-001', 'Andi'), j('NIK-002', 'Budi')];
    const hariIni = [j('NIK-001', 'Andi'), j('NIK-002', 'Budi')];

    const result = detectNewJamaah(kemarin, hariIni);

    expect(result.noChanges).toBe(true);
    expect(result.newJamaah).toHaveLength(0);
  });

  it('fallback ke ID REGISTER jika NIK kosong', () => {
    const kemarin = [{ uniqueId: 'REG-001', NAMA: 'Andi', 'ID REGISTER': 'REG-001' }];
    const hariIni = [
      { uniqueId: 'REG-001', NAMA: 'Andi', 'ID REGISTER': 'REG-001' },
      { uniqueId: 'REG-002', NAMA: 'Budi', 'ID REGISTER': 'REG-002' },
    ];

    const result = detectNewJamaah(kemarin, hariIni);

    expect(result.newJamaah).toHaveLength(1);
    expect(result.newJamaah[0].NAMA).toBe('Budi');
  });
});

describe('generateJamaahHash', () => {
  it('menghasilkan hash konsisten untuk input yang sama', () => {
    const data = [j('NIK-001', 'Andi'), j('NIK-002', 'Budi')];
    const hash1 = generateJamaahHash(data);
    const hash2 = generateJamaahHash(data);
    expect(hash1).toBe(hash2);
  });

  it('menghasilkan hash berbeda untuk input berbeda', () => {
    const data1 = [j('NIK-001', 'Andi')];
    const data2 = [j('NIK-001', 'Andi'), j('NIK-002', 'Budi')];
    expect(generateJamaahHash(data1)).not.toBe(generateJamaahHash(data2));
  });

  it('handle array kosong', () => {
    const hash = generateJamaahHash([]);
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe('string');
  });
});
