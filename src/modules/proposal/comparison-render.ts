// src/modules/proposal/comparison-render.ts
// Quadro comparativo de DUAS opções de sistema solar, lado a lado, SEM recomendação.
// Cada opção mostra os números principais + as fichas (marca/tecnologia) dos equipamentos.

import { fmtRs, fmtNum, escapeHtml } from './format.js';
import { getBrandFicha } from './brand-fichas.js';

export interface ComparacaoOpcao {
  rotulo: string;             // "Opção A" / "Opção B" (ou nome livre)
  potenciaKwp: number;
  geracaoMensalKwh: number;
  valorTotalRs: number;
  paybackTexto: string;       // já formatado (ex: "4 anos e 2 meses")
  economia25AnosRs: number;
  moduloFabricante: string;
  inversorFabricante: string;
}

export function renderComparacaoSolar(opcoes: ComparacaoOpcao[]): string {
  if (!opcoes || opcoes.length < 2) return '';

  const cards = opcoes.map(o => {
    const fModulo = getBrandFicha(o.moduloFabricante, 'modulo');
    const fInversor = getBrandFicha(o.inversorFabricante, 'inversor');
    const linha = (label: string, valor: string) =>
      `<div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #E2E8F0"><span style="color:#64748B;font-size:14px">${label}</span><strong style="font-size:15px">${valor}</strong></div>`;
    const ficha = (titulo: string, f: ReturnType<typeof getBrandFicha>) => f ? `
      <div style="margin-top:16px;padding:16px;background:#F8FAFC;border-radius:12px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#0E7CB8;margin-bottom:6px">${escapeHtml(titulo)}: ${escapeHtml(f.marca)} ${f.tier1 ? '· Tier 1' : ''}</div>
        <div style="font-size:13px;color:#475569;line-height:1.5">${escapeHtml(f.resumo)}</div>
      </div>` : '';
    return `
      <div style="flex:1;min-width:280px;border:1px solid #E2E8F0;border-radius:20px;padding:28px;background:#fff">
        <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:#0F172A;margin-bottom:16px">${escapeHtml(o.rotulo)}</div>
        ${linha('Potência', fmtNum(o.potenciaKwp, 1) + ' kWp')}
        ${linha('Geração', fmtNum(o.geracaoMensalKwh) + ' kWh/mês')}
        ${linha('Investimento', 'R$ ' + fmtRs(o.valorTotalRs, 0))}
        ${linha('Payback', escapeHtml(o.paybackTexto))}
        ${linha('Economia 25 anos', 'R$ ' + fmtRs(o.economia25AnosRs, 0))}
        ${ficha('Módulo', fModulo)}
        ${ficha('Inversor', fInversor)}
      </div>`;
  }).join('');

  return `
<section style="background:#F8FAFC;padding:64px 24px">
  <div style="max-width:1000px;margin:0 auto">
    <span style="display:inline-block;font-size:12px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#0E7CB8;margin-bottom:12px">Compare as opções</span>
    <h2 style="font-family:'Space Grotesk',sans-serif;font-size:32px;color:#0F172A;margin-bottom:8px">Dois caminhos pra você decidir</h2>
    <p style="font-size:16px;color:#64748B;margin-bottom:32px">As duas opções são premium. A escolha é sua — veja os números e a tecnologia de cada marca.</p>
    <div style="display:flex;gap:24px;flex-wrap:wrap">${cards}</div>
  </div>
</section>`;
}
