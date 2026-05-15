import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Playwright before importing screenshotter
vi.mock('playwright', () => {
  const mockPage = {
    setContent: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn(() => ({
      screenshot: vi.fn().mockResolvedValue(Buffer.from('screenshot-data')),
      waitFor: vi.fn().mockResolvedValue(undefined),
    })),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return {
    chromium: {
      launch: vi.fn().mockResolvedValue(mockBrowser),
    },
    _mockPage: mockPage,
    _mockContext: mockContext,
    _mockBrowser: mockBrowser,
  };
});

// Mock HtmlBuilder
vi.mock('../../src/reporter/html-builder.js', () => {
  const MockHtmlBuilder = vi.fn();
  MockHtmlBuilder.prototype.buildReportHtml = vi.fn().mockReturnValue('<html>Mock Report</html>');
  return { HtmlBuilder: MockHtmlBuilder };
});

import { chromium } from 'playwright';
import {
  initBrowser,
  captureScreenshot,
  closeBrowser,
  renderScreenshot,
  renderMultiPageScreenshots,
} from '../../src/reporter/screenshotter.js';

describe('Screenshotter', () => {
  const samplePackageData = {
    namaPaket: 'PAKET UMROH A',
    tanggal: '15 Juni 2026',
    maskapai: 'Garuda Indonesia',
    kodePaket: 'PKT-001',
    rows: [
      { no: 1, nama: 'Andi', statusPaspor: 'DONE', kamar: '101', totalPembayaran: 25000000, kurangBayar: 0, noManifest: 'MF-001' },
    ],
    totalJamaah: 1,
    reportDate: new Date('2026-06-15'),
  };

  describe('initBrowser', () => {
    it('meluncurkan Chromium headless', async () => {
      vi.clearAllMocks();
      const b = await initBrowser();
      expect(chromium.launch).toHaveBeenCalledOnce();
      expect(b).toBeDefined();
      await closeBrowser(b);
    });

    it('mengembalikan instance yang sama untuk panggilan kedua', async () => {
      const b1 = await initBrowser();
      const b2 = await initBrowser();
      expect(b2).toBe(b1);
      await closeBrowser(b1);
    });
  });

  describe('captureScreenshot', () => {
    let browser;

    beforeEach(async () => {
      vi.clearAllMocks();
      browser = await initBrowser();
    });

    afterEach(async () => {
      if (browser) await closeBrowser(browser);
    });

    it('mengeset konten HTML dan mengambil screenshot', async () => {
      const page = await (await browser.newContext()).newPage();
      const buffer = await captureScreenshot(page, '<html>Test</html>');

      expect(page.setContent).toHaveBeenCalledWith('<html>Test</html>', { waitUntil: 'networkidle' });
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString()).toBe('screenshot-data');
    });

    it('menggunakan selector .report-container', async () => {
      const page = await (await browser.newContext()).newPage();
      await captureScreenshot(page, '<html>Test</html>');

      expect(page.locator).toHaveBeenCalledWith('.report-container');
    });
  });

  describe('closeBrowser', () => {
    it('menutup browser', async () => {
      vi.clearAllMocks();
      const b = await initBrowser();
      const { _mockBrowser } = await import('playwright');
      await closeBrowser(b);
      expect(_mockBrowser.close).toHaveBeenCalledOnce();
    });

    it('tidak error jika browser null', async () => {
      await expect(closeBrowser(null)).resolves.toBeUndefined();
      await expect(closeBrowser(undefined)).resolves.toBeUndefined();
    });
  });

  describe('renderScreenshot', () => {
    let browser;

    beforeEach(async () => {
      vi.clearAllMocks();
      browser = await initBrowser();
    });

    afterEach(async () => {
      if (browser) await closeBrowser(browser);
    });

    it('high-level: build HTML + capture screenshot', async () => {
      const { HtmlBuilder } = await import('../../src/reporter/html-builder.js');
      const buffer = await renderScreenshot(samplePackageData, new Date('2026-06-15'));

      expect(HtmlBuilder.prototype.buildReportHtml).toHaveBeenCalled();
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('renderMultiPageScreenshots', () => {
    let browser;

    beforeEach(async () => {
      vi.clearAllMocks();
      browser = await initBrowser();
    });

    afterEach(async () => {
      if (browser) await closeBrowser(browser);
    });

    it('mengembalikan array buffer untuk multi halaman', async () => {
      const { HtmlBuilder } = await import('../../src/reporter/html-builder.js');
      HtmlBuilder.prototype.buildReportHtml
        .mockReturnValueOnce('<html>Page 1</html>')
        .mockReturnValueOnce('<html>Page 2</html>');

      HtmlBuilder.prototype._paginateRows = vi.fn(() => [
        [{ no: 1, nama: 'A' }],
        [{ no: 2, nama: 'B' }],
      ]);

      const multiPageData = {
        ...samplePackageData,
        rows: Array.from({ length: 30 }, (_, i) => ({
          no: i + 1,
          nama: `Jamaah ${i + 1}`,
          statusPaspor: 'DONE',
          kamar: '101',
          totalPembayaran: 25000000,
          kurangBayar: 0,
          noManifest: `MF-${String(i + 1).padStart(3, '0')}`,
        })),
        totalJamaah: 30,
      };

      const buffers = await renderMultiPageScreenshots(multiPageData, new Date('2026-06-15'));
      expect(Array.isArray(buffers)).toBe(true);
    });
  });
});
