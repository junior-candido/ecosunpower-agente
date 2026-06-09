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
  economiaMensalRs?: number;  // economia por mês em R$ (destaque); opcional
  cartaoParcelaRs?: number;         // parcela do cartão em 24× (pagamento por opção); opcional
  financiamentoParcelaRs?: number;  // parcela do financiamento (até 90×) por opção; opcional
  moduloFabricante: string;
  moduloModelo?: string;
  moduloPotenciaW?: number;
  moduloQuantidade?: number;
  inversorFabricante: string;
  inversorModelo?: string;
  inversorQuantidade?: number;
}

// Monta "12× Vertex 700W" (módulo) ou "1× SG5.0RS-L" (inversor). Sem quantidade,
// não dá pra montar a linha — devolve '' e o caller esconde (cai na ficha da marca).
function linhaEquipamento(qtd?: number, modelo?: string, fabricante?: string, potenciaW?: number): string {
  if (!qtd || qtd <= 0) return '';
  const nome = (modelo || fabricante || '').trim();
  if (!nome) return '';
  const wp = potenciaW && potenciaW > 0 ? ` ${fmtNum(potenciaW)}W` : '';
  return `${qtd}× ${nome}${wp}`;
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
    const modulosTxt = linhaEquipamento(o.moduloQuantidade, o.moduloModelo, o.moduloFabricante, o.moduloPotenciaW);
    const inversorTxt = linhaEquipamento(o.inversorQuantidade, o.inversorModelo, o.inversorFabricante);
    // Economia mensal em destaque — é o número que o cliente mais entende ("quanto sobra por mês").
    const economiaMensal = (o.economiaMensalRs && o.economiaMensalRs > 0)
      ? `<div style="margin:16px 0;padding:14px 16px;background:#ECFDF5;border-radius:12px;text-align:center">
           <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#059669">Economia mensal</div>
           <div style="font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:700;color:#047857">R$ ${fmtRs(o.economiaMensalRs, 0)}<span style="font-size:14px;font-weight:500;color:#059669">/mês</span></div>
         </div>`
      : '';
    return `
      <div style="flex:1;min-width:280px;border:1px solid #E2E8F0;border-radius:20px;padding:28px;background:#fff">
        <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:#0F172A;margin-bottom:16px">${escapeHtml(o.rotulo)}</div>
        ${linha('Potência', fmtNum(o.potenciaKwp, 1) + ' kWp')}
        ${modulosTxt ? linha('Módulos', escapeHtml(modulosTxt)) : ''}
        ${inversorTxt ? linha('Inversor', escapeHtml(inversorTxt)) : ''}
        ${linha('Geração', fmtNum(o.geracaoMensalKwh) + ' kWh/mês')}
        ${linha('Investimento', 'R$ ' + fmtRs(o.valorTotalRs, 0))}
        ${(o.cartaoParcelaRs && o.cartaoParcelaRs > 0)
          ? `<div style="padding:8px 0 0;text-align:right;color:#64748B;font-size:13px">ou 24× de <strong style="color:#0F172A">R$ ${fmtRs(o.cartaoParcelaRs, 0)}</strong> no cartão</div>`
          : ''}
        ${(o.financiamentoParcelaRs && o.financiamentoParcelaRs > 0)
          ? `<div style="padding:4px 0 12px;text-align:right;color:#64748B;font-size:13px">ou até 90× de <strong style="color:#0F172A">R$ ${fmtRs(o.financiamentoParcelaRs, 0)}</strong> financiado</div>`
          : ''}
        ${economiaMensal}
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
