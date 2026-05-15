import { chromium } from 'playwright';
import { HtmlBuilder } from './html-builder.js';
import { logger } from '../utils/logger.js';

let _browserInstance = null;

/**
 * Initialize a single Playwright Chromium browser instance (singleton).
 * @returns {Promise<import('playwright').Browser>}
 */
export async function initBrowser() {
  if (_browserInstance) {
    return _browserInstance;
  }
  try {
    _browserInstance = await chromium.launch({ headless: true });
    logger.info('[screenshotter] Browser Chromium launched');
    return _browserInstance;
  } catch (error) {
    logger.error(`[screenshotter] Gagal launch browser: ${error.message}`);
    throw new Error(`Gagal launch Chromium: ${error.message}`, { cause: error });
  }
}

/**
 * Render HTML content and capture screenshot of .report-container.
 * @param {import('playwright').Page} page
 * @param {string} html - Full HTML string
 * @returns {Promise<Buffer>} Screenshot buffer
 */
export async function captureScreenshot(page, html) {
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    const element = page.locator('.report-container');
    await element.waitFor({ state: 'visible' });
    return await element.screenshot({
      type: 'png',
      omitBackground: true,
    });
  } catch (error) {
    logger.error(`[screenshotter] Gagal capture screenshot: ${error.message}`);
    throw new Error(`Gagal capture screenshot: ${error.message}`, { cause: error });
  }
}

/**
 * Close browser instance if it exists.
 * @param {import('playwright').Browser} browser
 */
export async function closeBrowser(browser) {
  if (!browser) return;
  try {
    await browser.close();
    if (browser === _browserInstance) {
      _browserInstance = null;
    }
    logger.info('[screenshotter] Browser closed');
  } catch (error) {
    logger.warn(`[screenshotter] Error saat close browser: ${error.message}`);
  }
}

/**
 * High-level: build HTML + capture single screenshot.
 * @param {Object} packageData
 * @param {Date} reportDate
 * @returns {Promise<Buffer>}
 */
export async function renderScreenshot(packageData, reportDate) {
  try {
    const builder = new HtmlBuilder();
    const html = builder.buildReportHtml({ ...packageData, reportDate });
    const browser = await initBrowser();
    const context = await browser.newContext({
      deviceScaleFactor: 2,
      viewport: { width: 1100, height: 1 },
    });
    const page = await context.newPage();
    try {
      return await captureScreenshot(page, html);
    } finally {
      await page.close();
      await context.close();
    }
  } catch (error) {
    logger.error(`[screenshotter] renderScreenshot gagal: ${error.message}`);
    throw new Error(`renderScreenshot gagal: ${error.message}`, { cause: error });
  }
}

/**
 * Render multiple screenshots for multi-page reports.
 * @param {Object} packageData
 * @param {Date} reportDate
 * @returns {Promise<Buffer[]>} Array of screenshot buffers
 */
export async function renderMultiPageScreenshots(packageData, reportDate) {
  try {
    const dataWithDate = { ...packageData, reportDate };
    const builder = new HtmlBuilder();
    const html = builder.buildReportHtml(dataWithDate);
    const allRows = packageData.rows || [];
    const pages = builder._paginateRows(allRows);

    if (pages.length <= 1) {
      const buffer = await renderScreenshot(packageData, reportDate);
      return [buffer];
    }

    const browser = await initBrowser();
    const buffers = [];

    for (let i = 0; i < pages.length; i++) {
      const pageData = {
        ...dataWithDate,
        rows: pages[i],
      };
      const pageHtml = builder.buildReportHtml(pageData);
      const context = await browser.newContext({
        deviceScaleFactor: 2,
        viewport: { width: 1100, height: 1 },
      });
      const page = await context.newPage();
      try {
        const buffer = await captureScreenshot(page, pageHtml);
        buffers.push(buffer);
      } finally {
        await page.close();
        await context.close();
      }
    }

    return buffers;
  } catch (error) {
    logger.error(`[screenshotter] renderMultiPageScreenshots gagal: ${error.message}`);
    throw new Error(`renderMultiPageScreenshots gagal: ${error.message}`, { cause: error });
  }
}
