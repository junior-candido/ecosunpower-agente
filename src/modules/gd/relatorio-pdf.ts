// HTML do relatório → PDF, CONFERIDO antes de sair: exatamente 2 páginas e o
// rodapé presente na última (se algo vazou pra 3ª página ou cortou, recusa —
// nunca entrega PDF pela metade). Dependências injetadas pra testar sem Chrome.

import type { PdfOptions } from '../proposal/pdf-generator.js';
import { RODAPE_CONFERENCIA, MARCA_GRAFICO_OK, CONTEUDO_CORTADO_MARCA } from './relatorio-html.js';

export interface DepsRelatorioPdf {
  htmlToPdf: (html: string, o?: PdfOptions) => Promise<Buffer>;
  lerPdf: (pdf: Buffer) => Promise<{ paginas: number; texto: string }>;
}

export interface OpcoesRelatorioPdf {
  /** true quando o relatório tem meses (gráfico Chart.js) — exige a marca de que o gráfico carregou. */
  exigeGrafico?: boolean;
}

export async function gerarRelatorioPdf(html: string, deps: DepsRelatorioPdf, opts: OpcoesRelatorioPdf = {}): Promise<Buffer> {
  const pdf = await deps.htmlToPdf(html, { format: 'A4', marginMm: 0, printBackground: true, waitForChartMs: 800 });
  const { paginas, texto } = await deps.lerPdf(pdf);
  if (paginas !== 2) throw new Error(`o relatório saiu com ${paginas} páginas (esperado 2) — algum bloco não coube`);
  if (!texto.replace(/\s+/g, ' ').includes(RODAPE_CONFERENCIA)) throw new Error('o rodapé do relatório não apareceu no PDF');
  // Sem Puppeteer: o script de conferência (relatorio-html.ts) já rodou no
  // navegador e gravou essa marca visível se algum `.conteudo` passou do
  // `.rod` — sinal de que `overflow:hidden` cortou algo em silêncio.
  if (texto.includes(CONTEUDO_CORTADO_MARCA)) throw new Error('o relatório não coube em 2 páginas');
  // Chart.js vem de CDN: se o script não carregou, o PDF sai com 2 páginas e o
  // rodapé certos mas o gráfico em branco — a marca só existe se o gráfico rodou.
  if (opts.exigeGrafico && !texto.includes(MARCA_GRAFICO_OK)) {
    throw new Error('o gráfico do relatório não carregou — tente de novo');
  }
  return pdf;
}

/** Leitura real com unpdf (mesma lib do leitor de demonstrativos). */
export async function lerPdfUnpdf(pdf: Buffer): Promise<{ paginas: number; texto: string }> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { totalPages, text } = await extractText(doc, { mergePages: true });
  return { paginas: totalPages, texto: text };
}
