import Anthropic from '@anthropic-ai/sdk';
import type { Channel } from './dashboard/resolve-channel.js';

export interface MetricasBI {
  taxaConversao: number;         // 0-100 (%)
  ticketMedio: number;           // R$
  tempoMedioFechamento: number;  // dias
  melhorOrigem: Channel | null;
  melhorVendedor: string | null;
  receitaPrevista: number;       // R$
}

const CANAL_LABEL: Record<Channel, string> = {
  meta:        'Instagram/Facebook',
  google:      'Google',
  blog:        'Blog/Orgânico',
  direto:      'Contato Direto',
  indicacao:   'Indicação',
  base_propria:'Base Própria',
  outro:       'Outro',
};

const FALLBACK = 'Resumo indisponível no momento. Verifique as métricas individualmente.';

function fmt(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function buildPrompt(m: MetricasBI): string {
  const linhas = [
    `Taxa de conversão: ${m.taxaConversao.toFixed(1)}%`,
    `Ticket médio: ${fmt(m.ticketMedio)}`,
    `Tempo médio de fechamento: ${m.tempoMedioFechamento} dias`,
    `Canal com mais fechamentos: ${m.melhorOrigem ? CANAL_LABEL[m.melhorOrigem] : 'dados insuficientes'}`,
    `Vendedor com mais fechamentos: ${m.melhorVendedor ?? 'dados insuficientes'}`,
    `Receita prevista (leads em aberto × taxa histórica): ${fmt(m.receitaPrevista)}`,
  ];

  return `Métricas do funil comercial da EcoSunPower:
${linhas.join('\n')}

Escreva um resumo executivo de 3 a 4 frases em português brasileiro para o gestor comercial.
Tom: direto e motivacional — destaque o que está bem e aponte o foco principal.
Não use bullet points nem títulos. Texto corrido apenas.`;
}

export async function resumirMetricas(
  anthropic: Anthropic,
  metricas: MetricasBI,
): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: 'Você é um analista de vendas da EcoSunPower. Gere resumos curtos, claros e motivacionais para o gestor.',
      messages: [{ role: 'user', content: buildPrompt(metricas) }],
    });

    const bloco = response.content.find(b => b.type === 'text');
    if (!bloco || bloco.type !== 'text') return FALLBACK;
    return bloco.text.trim();
  } catch {
    return FALLBACK;
  }
}
