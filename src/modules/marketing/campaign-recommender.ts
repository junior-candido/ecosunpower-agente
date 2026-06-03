// src/modules/marketing/campaign-recommender.ts
//
// Monta o texto PT-BR do resumo diário a partir do relatório da calculadora.
// Separa geração de texto do cálculo puro.

import type { CampaignQualityReport, CampaignQualityRow } from './campaign-quality.js';

const ICON: Record<CampaignQualityRow['status'], string> = {
  campea: '🟢',
  ok: '⚪',
  cara: '🔴',
  sem_dados: '🟡',
};

function brl(v: number | null): string {
  return v == null ? '—' : `R$${Math.round(v)}`;
}

export function buildCampaignDigest(report: CampaignQualityReport, janelaDias: number): string {
  const { rows, mediaCostPerQualified } = report;
  const comDados = rows.filter((r) => r.status !== 'sem_dados');

  if (comDados.length === 0) {
    return `📊 *Campanhas (últimos ${janelaDias} dias)*\n\n🟡 Ainda juntando dados — poucas conversas pra opinar com segurança. Volto amanhã.`;
  }

  const ordenadas = [...comDados].sort((a, b) => {
    const ca = a.costPerQualified ?? Infinity;
    const cb = b.costPerQualified ?? Infinity;
    return ca - cb;
  });
  const campea = ordenadas[0];
  const pior = ordenadas[ordenadas.length - 1];

  const linhas = rows.map((r) => {
    const custo = r.status === 'sem_dados' ? 'juntando dados' : `${brl(r.costPerQualified)}/lead bom`;
    return `${ICON[r.status]} ${r.name} — ${custo}`;
  });

  let acao = '';
  if (campea.campaignId !== pior.campaignId) {
    acao = `\n\n💡 Sugiro *escalar* a ${campea.name} e *cortar verba* da ${pior.name}.`;
  } else {
    acao = `\n\n💡 ${campea.name} é a melhor no momento — manter.`;
  }

  const media = mediaCostPerQualified != null ? `\n_Média geral: ${brl(mediaCostPerQualified)}/lead bom_` : '';

  return `📊 *Campanhas (últimos ${janelaDias} dias)*\n\n${linhas.join('\n')}${media}${acao}`;
}
