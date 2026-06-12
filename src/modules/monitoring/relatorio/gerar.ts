// src/modules/monitoring/relatorio/gerar.ts
import { montarDadosRelatorio, type ModoRelatorio } from './dados.js';
import { renderRelatorioHtml } from './template.js';
import type { GravidadeResult } from './gravidade.js';

export interface GerarDeps {
  getDetalhe: (sistemaId: string) => Promise<any | null>;
  criarSlug: (sistemaId: string) => Promise<string>;
  htmlToPdf: (html: string) => Promise<Buffer>;
  gerarQr: (url: string) => Promise<string>;
  baseUrl: string; // ex: https://propostas.ecosunpower.eng.br
  // [ECOSOF] logo já resolvida pelo caller (obterLogoBase64: Storage com
  // fallback). Ausente = logo EcoSun embutida (default do template).
  logoBase64?: string;
}

export type GerarResult =
  | { ok: true; publicUrl: string; qrDataUrl: string; pdfBuffer: Buffer; sinal: GravidadeResult & { ratio7d: number } }
  | { ok: false; reason: string };

export async function gerarRelatorio(
  deps: GerarDeps,
  sistemaId: string,
  modo: ModoRelatorio,
): Promise<GerarResult> {
  const dados = await montarDadosRelatorio({ getDetalhe: deps.getDetalhe }, sistemaId, modo);
  if ('erro' in dados) return { ok: false, reason: dados.erro };

  const html = renderRelatorioHtml(dados, modo, deps.logoBase64);
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await deps.htmlToPdf(html);
  } catch (e) {
    return { ok: false, reason: `PDF: ${(e as Error).message}` };
  }
  const slug = await deps.criarSlug(sistemaId);
  const publicUrl = `${deps.baseUrl}/r/${slug}`;
  const qrDataUrl = await deps.gerarQr(publicUrl);
  return { ok: true, publicUrl, qrDataUrl, pdfBuffer, sinal: dados.sinal };
}
