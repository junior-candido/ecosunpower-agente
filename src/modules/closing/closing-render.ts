// src/modules/closing/closing-render.ts
// HTML → PDF A4 via Puppeteer. Single browser instance lazy.
// Margens iguais ao tmp/render-contrato-pdf.mjs original.

import puppeteer, { Browser } from 'puppeteer';

let browserSingleton: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserSingleton && browserSingleton.isConnected()) return browserSingleton;
  browserSingleton = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  return browserSingleton;
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '2cm', right: '2.2cm', bottom: '2cm', left: '2.2cm' },
    });
    return Buffer.from(pdfBytes);
  } finally {
    await page.close();
  }
}

export async function shutdownPdfRenderer(): Promise<void> {
  if (browserSingleton) {
    await browserSingleton.close();
    browserSingleton = null;
  }
}
