// HTML do relatório → PDF, CONFERIDO antes de sair: exatamente 2 páginas e o
// rodapé presente na última (se algo vazou pra 3ª página ou cortou, recusa —
// nunca entrega PDF pela metade). Dependências injetadas pra testar sem Chrome.

import type { PdfOptions } from '../proposal/pdf-generator.js';
import { RODAPE_CONFERENCIA } from './relatorio-html.js';

export interface DepsRelatorioPdf {
  htmlToPdf: (html: string, o?: PdfOptions) => Promise<Buffer>;
  lerPdf: (pdf: Buffer) => Promise<{ paginas: number; texto: string }>;
}

export async function gerarRelatorioPdf(html: string, deps: DepsRelatorioPdf): Promise<Buffer> {
  const pdf = await deps.htmlToPdf(html, { format: 'A4', marginMm: 0, printBackground: true, waitForChartMs: 800 });
  const { paginas, texto } = await deps.lerPdf(pdf);
  if (paginas !== 2) throw new Error(`o relatório saiu com ${paginas} páginas (esperado 2) — algum bloco não coube`);
  if (!texto.replace(/\s+/g, ' ').includes(RODAPE_CONFERENCIA)) throw new Error('o rodapé do relatório não apareceu no PDF');
  return pdf;
}

/** Leitura real com unpdf (mesma lib do leitor de demonstrativos). */
export async function lerPdfUnpdf(pdf: Buffer): Promise<{ paginas: number; texto: string }> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { totalPages, text } = await extractText(doc, { mergePages: true });
  return { paginas: totalPages, texto: text };
}
