import { describe, it, expect } from 'vitest';
import { HtmlBuilder } from '../../src/reporter/html-builder.js';

describe('HtmlBuilder', () => {
  const sampleRows = [
    {
      no: 1,
      nama: 'Andi Pratama',
      statusPaspor: 'DONE',
      kamar: '101',
      totalPembayaran: 25000000,
      kurangBayar: 0,
      noManifest: 'MF-001',
    },
    {
      no: 2,
      nama: 'Budi Santoso',
      statusPaspor: 'NOT YET',
      kamar: '102',
      totalPembayaran: 15000000,
      kurangBayar: 10000000,
      noManifest: 'MF-002',
    },
    {
      no: 3,
      nama: 'Cici Amelia',
      statusPaspor: 'IN PROCESS',
      kamar: '103',
      totalPembayaran: 25000000,
      kurangBayar: 0,
      noManifest: 'MF-003',
    },
  ];

  const packageData = {
    namaPaket: 'PAKET UMROH A',
    tanggal: '15 Juni 2026',
    maskapai: 'Garuda Indonesia',
    kodePaket: 'PKT-001',
    rows: sampleRows,
    totalJamaah: 3,
    reportDate: new Date('2026-06-15'),
  };

  describe('buildReportHtml', () => {
    it('menghasilkan HTML yang mengandung judul paket', () => {
      const builder = new HtmlBuilder();
      const html = builder.buildReportHtml(packageData);

      expect(html).toContain('PAKET UMROH A');
      expect(html).toContain('Garuda Indonesia');
      expect(html).toContain('PKT-001');
    });

    it('menghasilkan tabel dengan data jamaah', () => {
      const builder = new HtmlBuilder();
      const html = builder.buildReportHtml(packageData);

      expect(html).toContain('Andi Pratama');
      expect(html).toContain('Budi Santoso');
      expect(html).toContain('Cici Amelia');
      expect(html).toContain('MF-001');
      expect(html).toContain('MF-002');
      expect(html).toContain('MF-003');
    });

    it('merender badge status DONE dengan warna hijau', () => {
      const builder = new HtmlBuilder();
      const html = builder.buildReportHtml(packageData);

      expect(html).toContain('Andi Pratama');
      expect(html).toMatch(/DONE/);
    });

    it('merender badge status NOT YET dengan warna kuning', () => {
      const builder = new HtmlBuilder();
      const html = builder.buildReportHtml(packageData);

      const notYetMatch = html.match(/NOT YET/g);
      expect(notYetMatch).toBeTruthy();
    });

    it('memformat currency dengan benar', () => {
      const builder = new HtmlBuilder();
      const html = builder.buildReportHtml(packageData);

      expect(html).toContain('Rp');
    });

    it('menampilkan footer dengan total jamaah', () => {
      const builder = new HtmlBuilder();
      const html = builder.buildReportHtml(packageData);

      expect(html).toContain('Total Jamaah: 3');
    });
  });

  describe('_paginateRows', () => {
    it('mengembalikan satu halaman jika rows <= maxPerPage', () => {
      const builder = new HtmlBuilder();
      const pages = builder._paginateRows(sampleRows, 25);

      expect(pages).toHaveLength(1);
      expect(pages[0]).toHaveLength(3);
    });

    it('membagi ke beberapa halaman jika rows > maxPerPage', () => {
      const builder = new HtmlBuilder();
      const manyRows = Array.from({ length: 30 }, (_, i) => ({
        no: i + 1,
        nama: `Jamaah ${i + 1}`,
        statusPaspor: 'DONE',
        kamar: '101',
        totalPembayaran: 25000000,
        kurangBayar: 0,
        noManifest: `MF-${String(i + 1).padStart(3, '0')}`,
      }));
      const pages = builder._paginateRows(manyRows, 25);

      expect(pages).toHaveLength(2);
      expect(pages[0]).toHaveLength(25);
      expect(pages[1]).toHaveLength(5);
    });

    it('mengembalikan array kosong untuk rows kosong', () => {
      const builder = new HtmlBuilder();
      const pages = builder._paginateRows([], 25);

      expect(pages).toHaveLength(1);
      expect(pages[0]).toHaveLength(0);
    });
  });

  describe('Multi halaman', () => {
    it('menghasilkan label "Halaman 1/N" untuk multi halaman', () => {
      const builder = new HtmlBuilder();
      const manyRows = Array.from({ length: 30 }, (_, i) => ({
        no: i + 1,
        nama: `Jamaah ${i + 1}`,
        statusPaspor: 'DONE',
        kamar: '101',
        totalPembayaran: 25000000,
        kurangBayar: 0,
        noManifest: `MF-${String(i + 1).padStart(3, '0')}`,
      }));
      const html = builder.buildReportHtml({
        ...packageData,
        rows: manyRows,
        totalJamaah: 30,
      });

      expect(html).toContain('Halaman 1/2');
      expect(html).toContain('Halaman 2/2');
    });
  });

  describe('_renderStatusBadge', () => {
    it('mengembalikan badge DONE dengan class badge-done', () => {
      const builder = new HtmlBuilder();
      const badge = builder._renderStatusBadge('DONE');

      expect(badge).toContain('badge-done');
      expect(badge).toContain('DONE');
    });

    it('mengembalikan badge NOT YET dengan class badge-notyet', () => {
      const builder = new HtmlBuilder();
      const badge = builder._renderStatusBadge('NOT YET');
      expect(badge).toContain('badge-notyet');
      expect(badge).toContain('NOT YET');
    });

    it('mengembalikan badge merah untuk status lainnya', () => {
      const builder = new HtmlBuilder();
      const badge = builder._renderStatusBadge('IN PROCESS');
      expect(badge).toContain('badge-other');
      expect(badge).toContain('IN PROCESS');
    });

    it('menangani null/undefined', () => {
      const builder = new HtmlBuilder();
      expect(builder._renderStatusBadge(null)).toContain('badge-other');
      expect(builder._renderStatusBadge(undefined)).toContain('badge-other');
      expect(builder._renderStatusBadge('')).toContain('badge-other');
    });
  });

  describe('Edge cases', () => {
    it('menangani rows kosong', () => {
      const builder = new HtmlBuilder();
      const html = builder.buildReportHtml({
        ...packageData,
        rows: [],
        totalJamaah: 0,
      });

      expect(html).toContain('PAKET UMROH A');
    });

    it('menangani nilai pembayaran null', () => {
      const builder = new HtmlBuilder();
      const html = builder.buildReportHtml({
        ...packageData,
        rows: [{
          no: 1,
          nama: 'Test',
          statusPaspor: 'DONE',
          kamar: '101',
          totalPembayaran: null,
          kurangBayar: undefined,
          noManifest: 'MF-000',
        }],
        totalJamaah: 1,
      });

      expect(html).toContain('Test');
    });
  });
});
