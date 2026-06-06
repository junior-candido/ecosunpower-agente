// src/modules/proposal/service-render.ts
// Tipo de item de serviço (texto livre do Junior) + renderizações:
//  - renderServicosAdicionaisSection: seção que soma serviços numa proposta solar.
//  - renderServiceOnlyHTML (Task 5, ainda não): proposta só-serviço elegante.

import { fmtRs, escapeHtml } from './format.js';

export interface ServicoItem {
  titulo: string;
  descricao: string;   // texto livre; replicado fiel (apenas escapado pra HTML)
  valorRs: number;
  imagemUrl?: string;  // usada só no layout só-serviço (Task 5)
}

// Renderiza a seção "Serviços adicionais" pra uma proposta que TEM solar.
// Lista cada serviço (título, descrição, preço) e mostra o total geral
// (valor do solar + soma dos serviços). Vazio => string vazia (seção some).
export function renderServicosAdicionaisSection(servicos: ServicoItem[], valorSolarRs: number): string {
  if (!servicos || servicos.length === 0) return '';
  const validos = servicos.filter((s): s is ServicoItem => !!s && typeof s.titulo === 'string');
  if (validos.length === 0) return '';
  const somaServicos = validos.reduce((acc, s) => acc + (Number(s.valorRs) || 0), 0);
  const totalGeral = (Number(valorSolarRs) || 0) + somaServicos;

  const linhas = validos.map(s => `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding:24px;border:1px solid var(--border);border-radius:16px;background:#fff;margin-bottom:16px">
      <div style="flex:1">
        <div style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;color:var(--dark);margin-bottom:6px">${escapeHtml(s.titulo)}</div>
        <div style="font-size:14px;color:var(--muted);line-height:1.55;white-space:pre-line">${escapeHtml(s.descricao)}</div>
      </div>
      <div style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;color:var(--primary-600);white-space:nowrap">R$ ${fmtRs(Number(s.valorRs) || 0, 0)}</div>
    </div>`).join('');

  return `
<section style="background:var(--surface-alt);padding:80px 0">
  <div class="container">
    <span class="section-tag">Serviços adicionais</span>
    <h2 class="section-title">Além do sistema solar</h2>
    <p class="section-subtitle">Serviços de engenharia elétrica inclusos nesta proposta.</p>
    ${linhas}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:24px;padding:28px;border-radius:16px;background:linear-gradient(135deg,var(--primary-600) 0%,var(--primary-800) 100%);color:#fff;margin-top:8px">
      <div style="font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600;letter-spacing:0.02em">Total da proposta (solar + serviços)</div>
      <div style="font-family:'Space Grotesk',sans-serif;font-size:32px;font-weight:700">R$ ${fmtRs(totalGeral, 0)}</div>
    </div>
  </div>
</section>`;
}
