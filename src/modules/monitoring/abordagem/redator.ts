// src/modules/monitoring/abordagem/redator.ts
// A IA escreve a mensagem; o SISTEMA fornece todos os números e o objetivo.
// Prompts e limpeza são PUROS (testáveis); a chamada Opus/Haiku é injetada.
import type Anthropic from '@anthropic-ai/sdk';
import type { AbordagemTipo } from './tipos.js';
import { empresa } from '../../empresa-config.js';

export interface ContextoRedacao {
  tipo: AbordagemTipo;
  etapa: number;
  objetivo: string;                 // vem de escada.objetivoDoDegrau
  clienteNome: string;
  dados: {
    percentualQueda: number | null;
    diasOffline: number | null;
    mes: { kwh: number; reais: number; mesLabel: string; parcial: boolean } | null;
    causaRaizAnterior: string | null;
  };
  regrasTreino: string[];           // monitoring_treino ativos (geral + do tipo)
  ajusteDoJunior: string | null;    // quando reescrevendo após [Ajustar]
  mensagemAnterior: string | null;  // a versão que o Junior mandou ajustar
}

export function montarPromptAbordagem(c: ContextoRedacao): string {
  const dados: string[] = [];
  if (c.dados.percentualQueda != null) dados.push(`queda de geração: ${c.dados.percentualQueda}% abaixo do esperado`);
  if (c.dados.diasOffline != null) dados.push(`dias sem enviar dados: ${c.dados.diasOffline}`);
  if (c.dados.mes) dados.push(c.dados.mes.parcial
    ? `gerou neste mês (${c.dados.mes.mesLabel}, até agora): ${c.dados.mes.kwh} kWh (~R$ ${c.dados.mes.reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de economia)`
    : `gerou em ${c.dados.mes.mesLabel}: ${c.dados.mes.kwh} kWh (~R$ ${c.dados.mes.reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de economia)`);
  if (c.dados.causaRaizAnterior) {
    // Sanitize: vem de conversa com cliente — não pode virar comando de prompt.
    const causaSafe = c.dados.causaRaizAnterior.replace(/\s+/g, ' ').slice(0, 200);
    dados.push(`da última vez o problema foi: ${causaSafe} (comece por aí)`);
  }

  const treino = c.regrasTreino.length
    ? `\nREGRAS DE TREINO DO JUNIOR (obrigatórias):\n${c.regrasTreino.map((r) => `- ${r}`).join('\n')}`
    : '';
  const ajuste = c.ajusteDoJunior
    ? `\nVERSÃO ANTERIOR (o Junior mandou ajustar):\n"${c.mensagemAnterior ?? ''}"\nAJUSTE PEDIDO (prioridade máxima): ${c.ajusteDoJunior}`
    : '';

  return `Você é a ${empresa().nomeAtendente}, consultora da ${empresa().nomeFantasia} (energia solar, ${empresa().cidade}/${empresa().uf} e região), escrevendo UMA mensagem de WhatsApp pro cliente ${c.clienteNome.trim().split(/\s+/)[0]}.

OBJETIVO DESTA MENSAGEM: ${c.objetivo}

DADOS REAIS (use APENAS estes números — NUNCA calcule nem invente nenhum):
${dados.length ? dados.map((d) => `- ${d}`).join('\n') : '- (sem números nesta mensagem)'}

REGRAS FIXAS:
- NUNCA fale preço ou valores de serviço (limpeza/visita) — quem fecha valor é o Junior.
- NUNCA invente dado, promessa ou prazo.
- Curta: no máximo 4 linhas, tom WhatsApp, 1-2 emojis no máximo.
- Quem assina é "${empresa().nomeAtendente}, da ${empresa().nomeFantasia}". Junior é o Responsável Técnico (nunca "engenheiro").
- Termine puxando resposta do cliente (pergunta ou convite a responder).${treino}${ajuste}

Escreva SÓ a mensagem final, sem aspas, sem título, sem explicações.`;
}

export function limparMensagem(raw: string): string | null {
  let t = raw.trim();
  t = t.replace(/^["'‘“""]+|["'‘“""]+$/g, '');
  t = t.replace(/^(mensagem|resposta|texto)\s*:\s*/i, '');
  t = t.trim();
  return t.length > 0 ? t : null;
}

// Clamp de segurança: o corpo do interactive WABA estoura em 1024 chars com o
// wrapper (rótulo + aspas) — 700 deixa folga. Corta no último espaço pra não
// picar palavra no meio.
export function clampMensagem(s: string, max = 700): string {
  if (s.length <= max) return s;
  const corte = s.slice(0, max);
  const ultimoEspaco = corte.lastIndexOf(' ');
  return (ultimoEspaco > 0 ? corte.slice(0, ultimoEspaco) : corte).trimEnd() + '…';
}

// ---------------------------------------------------------------------------
// Chamada de IA (fina, sem teste unitário) — Opus escreve, Haiku é fallback.
// ---------------------------------------------------------------------------
const MODELO_FORTE = 'claude-opus-4-7';
const MODELO_RAPIDO = 'claude-haiku-4-5-20251001';

export async function redigirMensagem(client: Anthropic, ctx: ContextoRedacao): Promise<string | null> {
  const prompt = montarPromptAbordagem(ctx);
  let response;
  try {
    response = await client.messages.create({ model: MODELO_FORTE, max_tokens: 512, messages: [{ role: 'user', content: prompt }] });
  } catch (err) {
    console.warn('[abordagem] Opus indisponível, fallback Haiku:', (err as Error).message);
    response = await client.messages.create({ model: MODELO_RAPIDO, max_tokens: 512, messages: [{ role: 'user', content: prompt }] });
  }
  const raw = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
  const limpa = limparMensagem(raw);
  return limpa === null ? null : clampMensagem(limpa);
}
