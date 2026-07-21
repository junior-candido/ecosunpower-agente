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
  cartaoParcelaRs?: number;         // parcela do cartão (pagamento por opção); opcional
  // [ECOSOF] nº de parcelas do cartão exibido (24 = Belenus/EcoSun, 12 = genérico).
  // Default 24 preserva o output antigo quando o caller não informa.
  cartaoParcelas?: number;
  financiamentoParcelaRs?: number;  // parcela do financiamento (até 90×) por opção; opcional
  moduloFabricante: string;
  moduloModelo?: string;
  moduloPotenciaW?: number;
  moduloQuantidade?: number;
  inversorFabricante: string;
  inversorModelo?: string;
  inversorQuantidade?: number;
  // Créditos SCEE: energia que sobra por mês (geração além do consumo) e fica
  // guardada por 60 meses. Só aparece quando > 0 — é o argumento da opção maior.
  // Com autoconsumo remoto, é a sobra DEPOIS de abater a outra unidade.
  creditosMensalKwh?: number;
  // Autoconsumo remoto (outra unidade do mesmo titular): economia em R$ de lá
  // (já com Fio B) e os kWh abatidos. A economia mensal (economiaMensalRs) já é
  // o TOTAL — estes campos abrem a divisão casa + outra unidade no card.
  economiaRemotaRs?: number;
  creditosRemotoKwh?: number;
  // Curva de geração mês a mês (12 valores, jan→dez): do estudo PVSol quando a
  // opção tem, senão a sazonalidade calculada. Vira o mini-gráfico do card.
  geracaoMensalDistribuida?: number[];
  // Consumo usado no cálculo DESTA opção. Normalmente é o mesmo do cliente nas
  // duas; quando o Junior monta cenários (ex: B pra 800 kWh), o card avisa.
  consumoMensalKwh?: number;
}

// Mini-gráfico de barras da geração mês a mês (SVG inline, mesmo azul da marca
// usado no gráfico grande da proposta). Curva inválida (≠12 números) → ''.
function renderMiniGeracaoSVG(curva?: number[]): string {
  if (!Array.isArray(curva) || curva.length !== 12 || !curva.every(v => isFinite(v) && v >= 0)) return '';
  const max = Math.max(...curva);
  if (max <= 0) return '';
  const MESES = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const W = 280, H = 96, padTop = 8, padBottom = 16, padX = 4;
  const innerH = H - padTop - padBottom;
  const groupW = (W - padX * 2) / 12;
  const barW = Math.min(14, groupW * 0.6);
  const barras = curva.map((v, i) => {
    const h = Math.max(2, (v / max) * innerH);
    const x = padX + i * groupW + (groupW - barW) / 2;
    const y = padTop + innerH - h;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2.5" fill="#0E7CB8" opacity="${v === max ? '1' : '0.75'}"/>
      <text x="${(padX + i * groupW + groupW / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="8" fill="#94A3B8">${MESES[i]}</text>`;
  }).join('');
  return `
      <div style="margin-top:16px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748B;margin-bottom:6px">Geração mês a mês</div>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Geração mensal estimada ao longo do ano">${barras}</svg>
      </div>`;
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

  // Consumo só aparece nos cards quando as opções usam consumos DIFERENTES
  // (cenários). Igual nas duas = é do cliente, não diferencia nada.
  const consumos = opcoes.map(o => Number(o.consumoMensalKwh)).filter(v => isFinite(v) && v > 0);
  const consumosDiferentes = consumos.length === opcoes.length && new Set(consumos).size > 1;

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
    // Com autoconsumo remoto o valor é o TOTAL e a divisão casa + outra unidade vem embaixo.
    const remota = Number(o.economiaRemotaRs);
    const temRemota = isFinite(remota) && remota > 0 && (o.economiaMensalRs ?? 0) > remota;
    const divisaoRemota = temRemota
      ? `<div style="font-size:13px;color:#059669;margin-top:4px">R$ ${fmtRs((o.economiaMensalRs as number) - remota, 0)} nesta casa + R$ ${fmtRs(remota, 0)} na outra unidade</div>`
      : '';
    const economiaMensal = (o.economiaMensalRs && o.economiaMensalRs > 0)
      ? `<div style="margin:16px 0;padding:14px 16px;background:#ECFDF5;border-radius:12px;text-align:center">
           <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#059669">Economia mensal</div>
           <div style="font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:700;color:#047857">R$ ${fmtRs(o.economiaMensalRs, 0)}<span style="font-size:14px;font-weight:500;color:#059669">/mês</span></div>
           ${divisaoRemota}
         </div>`
      : '';
    // Outra unidade (autoconsumo remoto): os kWh que abatem a fatura de lá.
    const remotoBox = (o.creditosRemotoKwh && o.creditosRemotoKwh > 0)
      ? `<div style="margin:12px 0;padding:10px 16px;background:#F0FDF4;border-radius:12px;text-align:center;font-size:13px;color:#166534">
           🏠 <b>+ ${fmtNum(o.creditosRemotoKwh)} kWh/mês</b> abatidos na outra unidade (mesmo titular)
         </div>`
      : '';
    // Créditos SCEE: destaque quando a opção gera mais do que o cliente consome.
    const creditos = (o.creditosMensalKwh && o.creditosMensalKwh > 0)
      ? `<div style="margin:12px 0;padding:12px 16px;background:#F0F9FF;border-radius:12px;text-align:center">
           <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#0E7CB8">Sobra em créditos</div>
           <div style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;color:#075985">+ ${fmtNum(o.creditosMensalKwh)} kWh<span style="font-size:13px;font-weight:500;color:#0E7CB8">/mês</span></div>
           <div style="font-size:12px;color:#64748B;margin-top:2px">energia guardada por 60 meses — pra crescer o consumo sem pagar mais</div>
         </div>`
      : '';
    const consumoOpcao = Number(o.consumoMensalKwh);
    const consumoLinha = (consumosDiferentes && isFinite(consumoOpcao) && consumoOpcao > 0)
      ? linha('Consumo do cenário', fmtNum(consumoOpcao) + ' kWh/mês')
      : '';
    return `
      <div style="flex:1;min-width:280px;border:1px solid #E2E8F0;border-radius:20px;padding:28px;background:#fff">
        <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:#0F172A;margin-bottom:16px">${escapeHtml(o.rotulo)}</div>
        ${linha('Potência', fmtNum(o.potenciaKwp, 1) + ' kWp')}
        ${modulosTxt ? linha('Módulos', escapeHtml(modulosTxt)) : ''}
        ${inversorTxt ? linha('Inversor', escapeHtml(inversorTxt)) : ''}
        ${linha('Geração', fmtNum(o.geracaoMensalKwh) + ' kWh/mês')}
        ${consumoLinha}
        ${linha('Investimento', 'R$ ' + fmtRs(o.valorTotalRs, 0))}
        ${(o.cartaoParcelaRs && o.cartaoParcelaRs > 0)
          ? `<div style="padding:8px 0 0;text-align:right;color:#64748B;font-size:13px">ou ${o.cartaoParcelas ?? 24}× de <strong style="color:#0F172A">R$ ${fmtRs(o.cartaoParcelaRs, 0)}</strong> no cartão</div>`
          : ''}
        ${(o.financiamentoParcelaRs && o.financiamentoParcelaRs > 0)
          ? `<div style="padding:4px 0 12px;text-align:right;color:#64748B;font-size:13px">ou até 90× de <strong style="color:#0F172A">R$ ${fmtRs(o.financiamentoParcelaRs, 0)}</strong> financiado</div>`
          : ''}
        ${economiaMensal}
        ${remotoBox}
        ${creditos}
        ${linha('Payback', escapeHtml(o.paybackTexto))}
        ${linha('Economia 25 anos', 'R$ ' + fmtRs(o.economia25AnosRs, 0))}
        ${renderMiniGeracaoSVG(o.geracaoMensalDistribuida)}
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
