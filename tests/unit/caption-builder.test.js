import { describe, it, expect } from 'vitest';
import { CaptionBuilder } from '../../src/reporter/caption-builder.js';

describe('CaptionBuilder', () => {
  const basePackageData = {
    namaPaket: 'PAKET UMROH A',
    tanggal: '15 Juni 2026',
    maskapai: 'Garuda Indonesia',
    rute: 'Jakarta - Jeddah',
    kodePaket: 'PKT-001',
    totalJamaah: 20,
    maxSeat: 30,
    sisaSeat: 10,
  };

  describe('Skenario 1: Normal — ada jamaah baru (grouped)', () => {
    it('menampilkan leader + pax untuk grup jamaah baru', () => {
      const builder = new CaptionBuilder();
      const result = builder.build({
        packageData: basePackageData,
        newJamaahGroups: [
          { leader: 'Andi Pratama', pax: 1 },
          { leader: 'Budi Santoso', pax: 3 },
        ],
        pindahanGroups: [],
        newCount: 4,
        pindahanCount: 0,
        keluarList: [],

        lastSnapshotDate: null,
        currentDate: new Date('2026-06-15'),
      });

      expect(result).toContain('PAKET UMROH A');
      expect(result).toContain('Garuda Indonesia');
      expect(result).toContain('Jakarta - Jeddah');
      expect(result).toContain('Total Jamaah: 20/30 seat');
      expect(result).toContain('Jamaah Baru Hari Ini: 4 orang');
      expect(result).toContain('❯ Andi Pratama');
      expect(result).toContain('❯ Budi Santoso + 3 pax');
      expect(result).toContain('Sisa Seat: 10');
    });
  });

  describe('Skenario 2: Tidak ada perubahan', () => {
    it('tidak menampilkan baris jamaah baru', () => {
      const builder = new CaptionBuilder();
      const result = builder.build({
        packageData: basePackageData,
        newJamaahGroups: [],
        pindahanGroups: [],
        newCount: 0,
        pindahanCount: 0,
        keluarList: [],

        lastSnapshotDate: null,
        currentDate: new Date('2026-06-15'),
      });

      expect(result).toContain('PAKET UMROH A');
      expect(result).not.toContain('Jamaah Baru Hari Ini');
      expect(result).toContain('Total Jamaah: 20/30 seat');
    });
  });

  describe('Skenario 3: Hanya perpindahan', () => {
    it('menampilkan section perpindahan dengan grup', () => {
      const builder = new CaptionBuilder();
      const result = builder.build({
        packageData: basePackageData,
        newJamaahGroups: [],
        pindahanGroups: [
          { leader: 'Dewi Lestari', pax: 2, dariPaket: 'PAKET UMROH B' },
          { leader: 'Eko Prasetyo', pax: 1, dariPaket: 'PAKET UMROH C' },
        ],
        newCount: 0,
        pindahanCount: 3,
        keluarList: [],

        lastSnapshotDate: null,
        currentDate: new Date('2026-06-15'),
      });

      expect(result).toContain('PAKET UMROH A');
      expect(result).toContain('Jamaah Baru Hari Ini: 3 orang');
      expect(result).toContain('❯ Dewi Lestari + 2 pax');
      expect(result).toContain('❯ Eko Prasetyo');
      expect(result).toContain('Perpindahan Jamaah');
      expect(result).toContain('dari PAKET UMROH B');
      expect(result).toContain('dari PAKET UMROH C');
    });
  });

  describe('Skenario 4: Campur — baru + pindahan', () => {
    it('menampilkan kedua section: baru dan pindahan', () => {
      const builder = new CaptionBuilder();
      const result = builder.build({
        packageData: basePackageData,
        newJamaahGroups: [
          { leader: 'Fajar Hidayat', pax: 1 },
        ],
        pindahanGroups: [
          { leader: 'Gita Permata', pax: 1, dariPaket: 'PAKET UMROH D' },
        ],
        newCount: 1,
        pindahanCount: 1,
        keluarList: [],

        lastSnapshotDate: null,
        currentDate: new Date('2026-06-15'),
      });

      expect(result).toContain('❯ Fajar Hidayat');
      expect(result).toContain('❯ Gita Permata');
      expect(result).toContain('dari PAKET UMROH D');
      expect(result).toContain('Jamaah Baru Hari Ini: 2 orang');
      expect(result).toContain('Perpindahan Jamaah');
    });
  });

  describe('Skenario 5: Snapshot gap > 1 hari', () => {
    it('menampilkan catatan sejak tanggal X', () => {
      const builder = new CaptionBuilder();
      const result = builder.build({
        packageData: basePackageData,
        newJamaahGroups: [
          { leader: 'Lina Marlina', pax: 1 },
        ],
        pindahanGroups: [],
        newCount: 1,
        pindahanCount: 0,
        keluarList: [],

        lastSnapshotDate: '2026-06-10',
        currentDate: new Date('2026-06-15'),
      });

      expect(result).toContain('Data sejak 10 Jun 2026');
      expect(result).toContain('Lina Marlina');
    });
  });

  describe('Skenario 7: Paket kosong', () => {
    it('menampilkan "Belum ada jamaah"', () => {
      const builder = new CaptionBuilder();
      const result = builder.build({
        packageData: { ...basePackageData, totalJamaah: 0, sisaSeat: 30 },
        newJamaahGroups: [],
        pindahanGroups: [],
        newCount: 0,
        pindahanCount: 0,
        keluarList: [],

        lastSnapshotDate: null,
        currentDate: new Date('2026-06-15'),
      });

      expect(result).toContain('PAKET UMROH A');
      expect(result).toContain('Belum ada jamaah');
      expect(result).toContain('Sisa Seat: 30');
    });
  });

  describe('Skenario 8: Ada jamaah keluar', () => {
    it('menampilkan section jamaah keluar', () => {
      const builder = new CaptionBuilder();
      const result = builder.build({
        packageData: basePackageData,
        newJamaahGroups: [],
        pindahanGroups: [],
        newCount: 0,
        pindahanCount: 0,
        keluarList: ['Mulyono', 'Nina Zainab'],

        lastSnapshotDate: null,
        currentDate: new Date('2026-06-15'),
      });

      expect(result).toContain('Jamaah Keluar');
      expect(result).toContain('Mulyono');
      expect(result).toContain('Nina Zainab');
    });
  });

  describe('Edge cases', () => {
    it('menangani daftar undefined/null dengan aman', () => {
      const builder = new CaptionBuilder();
      const result = builder.build({
        packageData: basePackageData,
        newJamaahGroups: null,
        pindahanGroups: undefined,
        newCount: 0,
        pindahanCount: 0,
        keluarList: null,

        lastSnapshotDate: null,
        currentDate: new Date('2026-06-15'),
      });

      expect(result).not.toContain('Jamaah Baru Hari Ini');
    });

    it('menampilkan kombinasi baru, pindahan, dan keluar', () => {
      const builder = new CaptionBuilder();
      const result = builder.build({
        packageData: basePackageData,
        newJamaahGroups: [
          { leader: 'Oscar', pax: 1 },
        ],
        pindahanGroups: [
          { leader: 'Puji', pax: 1, dariPaket: 'PAKET E' },
        ],
        newCount: 1,
        pindahanCount: 1,
        keluarList: ['Qori'],

        lastSnapshotDate: null,
        currentDate: new Date('2026-06-15'),
      });

      expect(result).toContain('Oscar');
      expect(result).toContain('Puji');
      expect(result).toContain('Qori');
      expect(result).toContain('Jamaah Baru Hari Ini: 2 orang');
    });
  });
});
