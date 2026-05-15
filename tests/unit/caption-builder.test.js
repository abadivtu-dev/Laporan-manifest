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

  describe('Skenario 1: Normal — ada jamaah baru', () => {
    it('menampilkan daftar nama jamaah baru', () => {
      const builder = new CaptionBuilder();
      const result = builder.build({
        packageData: basePackageData,
        newJamaahList: ['Andi Pratama', 'Budi Santoso', 'Cici Amelia'],
        pindahanList: [],
        keluarList: [],
        isFirstRun: false,
        lastSnapshotDate: null,
        currentDate: new Date('2026-06-15'),
      });

      expect(result).toContain('PAKET UMROH A');
      expect(result).toContain('Garuda Indonesia');
      expect(result).toContain('Jakarta - Jeddah');
      expect(result).toContain('Total Jamaah: 20/30 seat');
      expect(result).toContain('Jamaah Baru Hari Ini: 3 orang');
      expect(result).toContain('Andi Pratama');
      expect(result).toContain('Budi Santoso');
      expect(result).toContain('Cici Amelia');
      expect(result).toContain('Sisa Seat: 10');
    });
  });

  describe('Skenario 2: Tidak ada perubahan', () => {
    it('menampilkan tidak ada jamaah baru', () => {
      const builder = new CaptionBuilder();
      const result = builder.build({
        packageData: basePackageData,
        newJamaahList: [],
        pindahanList: [],
        keluarList: [],
        isFirstRun: false,
        lastSnapshotDate: null,
        currentDate: new Date('2026-06-15'),
      });

      expect(result).toContain('PAKET UMROH A');
      expect(result).toContain('Jamaah Baru Hari Ini: - (tidak ada)');
      expect(result).toContain('Total Jamaah: 20/30 seat');
    });
  });

  describe('Skenario 3: Hanya perpindahan', () => {
    it('menampilkan section perpindahan saja', () => {
      const builder = new CaptionBuilder();
      const result = builder.build({
        packageData: basePackageData,
        newJamaahList: [],
        pindahanList: [
          { nama: 'Dewi Lestari', dariPaket: 'PAKET UMROH B' },
          { nama: 'Eko Prasetyo', dariPaket: 'PAKET UMROH C' },
        ],
        keluarList: [],
        isFirstRun: false,
        lastSnapshotDate: null,
        currentDate: new Date('2026-06-15'),
      });

      expect(result).toContain('PAKET UMROH A');
      expect(result).toContain('Perpindahan Jamaah');
      expect(result).toContain('Dewi Lestari');
      expect(result).toContain('dari PAKET UMROH B');
      expect(result).toContain('Eko Prasetyo');
      expect(result).toContain('dari PAKET UMROH C');
      expect(result).toContain('Jamaah Baru Hari Ini: - (tidak ada)');
    });
  });

  describe('Skenario 4: Campur — baru + pindahan', () => {
    it('menampilkan kedua section: baru dan pindahan', () => {
      const builder = new CaptionBuilder();
      const result = builder.build({
        packageData: basePackageData,
        newJamaahList: ['Fajar Hidayat'],
        pindahanList: [
          { nama: 'Gita Permata', dariPaket: 'PAKET UMROH D' },
        ],
        keluarList: [],
        isFirstRun: false,
        lastSnapshotDate: null,
        currentDate: new Date('2026-06-15'),
      });

      expect(result).toContain('Fajar Hidayat');
      expect(result).toContain('Gita Permata');
      expect(result).toContain('dari PAKET UMROH D');
      expect(result).toContain('Jamaah Baru Hari Ini: 2 orang');
      expect(result).toContain('Perpindahan Jamaah');
    });
  });

  describe('Skenario 5: First run', () => {
    it('semua jamaah dianggap baru dengan catatan first run', () => {
      const builder = new CaptionBuilder();
      const result = builder.build({
        packageData: { ...basePackageData, totalJamaah: 25 },
        newJamaahList: ['Hendra Gunawan', 'Indah Wahyuni', 'Joko Susilo', 'Kartika Sari'],
        pindahanList: [],
        keluarList: [],
        isFirstRun: true,
        lastSnapshotDate: null,
        currentDate: new Date('2026-06-15'),
      });

      expect(result).toContain('Pertama Kali');
      expect(result).toContain('Jamaah Baru Hari Ini: 4 orang');
      expect(result).toContain('Hendra Gunawan');
      expect(result).toContain('Indah Wahyuni');
      expect(result).toContain('Kartika Sari');
    });
  });

  describe('Skenario 6: Snapshot gap > 1 hari', () => {
    it('menampilkan catatan sejak tanggal X', () => {
      const builder = new CaptionBuilder();
      const result = builder.build({
        packageData: basePackageData,
        newJamaahList: ['Lina Marlina'],
        pindahanList: [],
        keluarList: [],
        isFirstRun: false,
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
        newJamaahList: [],
        pindahanList: [],
        keluarList: [],
        isFirstRun: false,
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
        newJamaahList: [],
        pindahanList: [],
        keluarList: ['Mulyono', 'Nina Zainab'],
        isFirstRun: false,
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
        newJamaahList: null,
        pindahanList: undefined,
        keluarList: null,
        isFirstRun: false,
        lastSnapshotDate: null,
        currentDate: new Date('2026-06-15'),
      });

      expect(result).toContain('Jamaah Baru Hari Ini: - (tidak ada)');
    });

    it('menampilkan kombinasi baru, pindahan, dan keluar', () => {
      const builder = new CaptionBuilder();
      const result = builder.build({
        packageData: basePackageData,
        newJamaahList: ['Oscar'],
        pindahanList: [{ nama: 'Puji', dariPaket: 'PAKET E' }],
        keluarList: ['Qori'],
        isFirstRun: false,
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
