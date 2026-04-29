// Geracao de PDF a partir do HTML da proposta.
// Usa Puppeteer headless. Espera Chart.js renderizar antes de imprimir.
//
// Pra Easypanel: precisa instalar dependencias do Chromium (apt: libnss3 libatk-bridge2.0-0 libxss1 libgtk-3-0).
// Alternativa pra deploy mais leve: trocar 'puppeteer' por 'puppeteer-core' + chromium do sistema.

let _puppeteer: any | null = null;
async function getPuppeteer(): Promise<any> {
  if (_puppeteer) return _puppeteer;
  try {
    const mod = await import('puppeteer');
    _puppeteer = (mod as any).default ?? mod;
    return _puppeteer;
  } catch (err) {
    throw new Error(
      'puppeteer nao instalado. Rode: npm install puppeteer\n' +
      'Original: ' + (err instanceof Error ? err.message : String(err)),
    );
  }
}

export interface PdfOptions {
  format?: 'A4' | 'Letter';
  printBackground?: boolean;
  marginMm?: number;
  waitForChartMs?: number; // tempo extra pro Chart.js renderizar
}

export async function htmlToPdf(html: string, options: PdfOptions = {}): Promise<Buffer> {
  const puppeteer = await getPuppeteer();
  const {
    format = 'A4',
    printBackground = true,
    marginMm = 15,
    waitForChartMs = 1500,
  } = options;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 2 });

    // setContent: usa 'load' apenas (networkidle0 trava se Google Fonts CDN ficar lenta).
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });

    // Aguarda fontes prontas (FontFace API). Mais confiavel que esperar networkidle.
    try {
      await page.evaluate(() => (document as any).fonts?.ready);
    } catch {
      // ignora se browser nao suporta document.fonts
    }

    // Tempo extra pro Chart.js terminar a animacao.
    await new Promise(resolve => setTimeout(resolve, waitForChartMs));

    const pdfBuffer = await page.pdf({
      format,
      printBackground,
      margin: {
        top: `${marginMm}mm`,
        right: `${marginMm}mm`,
        bottom: `${marginMm}mm`,
        left: `${marginMm}mm`,
      },
      preferCSSPageSize: false,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
