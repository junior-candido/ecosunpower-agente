// src/modules/financeiro/fiscal/nfse-pdf.ts
// Gera o PDF da NFS-e num dos 2 modelos (GDF/ISS.net ou DANFSe nacional) com o
// motor de PDF que já imprime as propostas (Puppeteer — proposal/pdf-generator).
// O QR aponta pra consulta pública nacional pela chave (nfse-pdf-dados.ts).
import QRCode from 'qrcode';
import type { DadosNotaPdf } from './nfse-pdf-dados.js';
import { htmlModeloGdf, htmlModeloNacional, nomeArquivoPdf } from './nfse-pdf-modelos.js';

export type ModeloPdf = 'gdf' | 'nacional';
export const MODELOS_PDF: ReadonlyArray<ModeloPdf> = ['gdf', 'nacional'];
export const ehModeloPdf = (m: unknown): m is ModeloPdf => m === 'gdf' || m === 'nacional';

type Renderizador = (html: string, opts: { marginMm: number; waitForChartMs: number }) => Promise<Buffer>;

async function renderPadrao(html: string, opts: { marginMm: number; waitForChartMs: number }): Promise<Buffer> {
  const { htmlToPdf } = await import('../../proposal/pdf-generator.js');
  return htmlToPdf(html, { format: 'A4', printBackground: true, ...opts });
}

export async function htmlDoModelo(d: DadosNotaPdf, modelo: ModeloPdf): Promise<string> {
  const qr = d.urlConsulta
    ? await QRCode.toDataURL(d.urlConsulta, { width: 240, margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
    : null;
  return modelo === 'gdf' ? htmlModeloGdf(d, qr) : htmlModeloNacional(d, qr);
}

export async function gerarPdfNota(
  d: DadosNotaPdf, modelo: ModeloPdf, render: Renderizador = renderPadrao,
): Promise<{ pdf: Buffer; nomeArquivo: string }> {
  const html = await htmlDoModelo(d, modelo);
  const pdf = await render(html, { marginMm: 8, waitForChartMs: 0 });
  return { pdf, nomeArquivo: nomeArquivoPdf(d, modelo) };
}
