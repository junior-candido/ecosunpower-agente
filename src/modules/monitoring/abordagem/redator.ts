// src/modules/monitoring/abordagem/redator.ts
// A IA escreve a mensagem; o SISTEMA fornece todos os números e o objetivo.
// Prompts e limpeza são PUROS (testáveis); a chamada Opus/Haiku é injetada.
import type Anthropic from '@anthropic-ai/sdk';
import type { AbordagemTipo } from './tipos.js';

export interface ContextoRedacao {
  tipo: AbordagemTipo;
  etapa: number;
  objetivo: string;                 // vem de escada.objetivoDoDegrau
  clienteNome: string;
  dados: {
    percentualQueda: number | null;
    diasOffline: number | null;
    trimestre: { kwh: number; reais: number } | null;
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
  if (c.dados.trimestre) dados.push(`gerou no trimestre: ${c.dados.trimestre.kwh} kWh (~R$ ${c.dados.trimestre.reais.toFixed(2)} de economia)`);
  if (c.dados.causaRaizAnterior) dados.push(`da última vez o problema foi: ${c.dados.causaRaizAnterior} (comece por aí)`);

  const treino = c.regrasTreino.length
    ? `\nREGRAS DE TREINO DO JUNIOR (obrigatórias):\n${c.regrasTreino.map((r) => `- ${r}`).join('\n')}`
    : '';
  const ajuste = c.ajusteDoJunior
    ? `\nVERSÃO ANTERIOR (o Junior mandou ajustar):\n"${c.mensagemAnterior ?? ''}"\nAJUSTE PEDIDO (prioridade máxima): ${c.ajusteDoJunior}`
    : '';

  return `Você é a Eva, consultora da EcoSunPower (energia solar, Brasília/GO), escrevendo UMA mensagem de WhatsApp pro cliente ${c.clienteNome.split(/\s+/)[0]}.

OBJETIVO DESTA MENSAGEM: ${c.objetivo}

DADOS REAIS (use APENAS estes números — NUNCA calcule nem invente nenhum):
${dados.length ? dados.map((d) => `- ${d}`).join('\n') : '- (sem números nesta mensagem)'}

REGRAS FIXAS:
- NUNCA fale preço ou valores de serviço (limpeza/visita) — quem fecha valor é o Junior.
- NUNCA invente dado, promessa ou prazo.
- Curta: no máximo 4 linhas, tom WhatsApp, 1-2 emojis no máximo.
- Quem assina é "Eva, da EcoSunPower". Junior é o Responsável Técnico (nunca "engenheiro").
- Termine puxando resposta do cliente (pergunta ou convite a responder).${treino}${ajuste}

Escreva SÓ a mensagem final, sem aspas, sem título, sem explicações.`;
}

export function limparMensagem(raw: string): string | null {
  let t = raw.trim();
  t = t.replace(/^["'""]+|["'""]+$/g, '');
  t = t.replace(/^(mensagem|resposta|texto)\s*:\s*/i, '');
  t = t.trim();
  return t.length > 0 ? t : null;
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
  return limparMensagem(raw);
}
