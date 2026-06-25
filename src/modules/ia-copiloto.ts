// src/modules/ia-copiloto.ts
// Copiloto de IA CONVERSACIONAL do lead: o vendedor conversa com a IA pra tirar
// dúvida e refinar mensagens, com o contexto do lead carregado. O histórico é
// salvo por lead (tabela lead_ia_conversas) — vira treinamento/análise de vendas.
import type Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Carrega a base de vendas (conhecimento/vendas-ia.md) — cacheada. Degrada sem
// quebrar: se não achar o arquivo, o copiloto funciona sem a base (devolve '').
let _conhecimentoCache: string | null = null;
export function carregarConhecimentoVendas(): string {
  if (_conhecimentoCache !== null) return _conhecimentoCache;
  const here = dirname(fileURLToPath(import.meta.url)); // .../(src|dist)/modules
  const candidatos = [
    join(here, '..', '..', 'conhecimento', 'vendas-ia.md'),
    join(process.cwd(), 'conhecimento', 'vendas-ia.md'),
  ];
  for (const p of candidatos) {
    try {
      _conhecimentoCache = readFileSync(p, 'utf-8');
      return _conhecimentoCache;
    } catch {
      /* tenta o próximo */
    }
  }
  _conhecimentoCache = '';
  return _conhecimentoCache;
}

export interface ContextoLead {
  nome?: string;
  cidade?: string;
  etapa?: string;
  consumoMensalKwh?: number;
  potenciaKwp?: number;
  economiaMensalRs?: number;
  paybackAnos?: number | null;
}

export interface MensagemCopiloto {
  role: 'user' | 'assistant';
  conteudo: string;
}

const fmtRs = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

// System prompt: papel de copiloto de vendas + os dados do lead, pra IA responder
// com contexto. PURA (testável). Se não houver dados, avisa pra não inventar.
export function montarSystemPromptCopiloto(ctx: ContextoLead, conhecimento?: string): string {
  const dados = [
    ctx.nome ? `- Nome: ${ctx.nome}` : null,
    ctx.cidade ? `- Cidade: ${ctx.cidade}` : null,
    ctx.etapa ? `- Etapa no funil: ${ctx.etapa}` : null,
    ctx.consumoMensalKwh ? `- Consumo mensal: ${ctx.consumoMensalKwh} kWh` : null,
    ctx.potenciaKwp ? `- Sistema dimensionado: ${ctx.potenciaKwp} kWp` : null,
    ctx.economiaMensalRs ? `- Economia mensal estimada: ${fmtRs(ctx.economiaMensalRs)}/mês` : null,
    ctx.paybackAnos != null ? `- Payback estimado: ${ctx.paybackAnos} anos` : null,
  ].filter((l): l is string => l !== null);

  const temDimensionamento = !!(
    ctx.consumoMensalKwh || ctx.potenciaKwp || ctx.economiaMensalRs ||
    (ctx.paybackAnos != null && ctx.paybackAnos !== 0)
  );

  const linhas = [
    `Você é um copiloto de vendas da EcoSunPower (energia solar) ajudando um VENDEDOR a atender este lead.`,
    `Responda em português claro, sem jargão técnico. Quando pedirem uma mensagem pro cliente, entregue ela PRONTA (formato WhatsApp, curta, tom amigável sem pressão).`,
    `NÃO invente números que não estão nos dados abaixo. Se faltar um dado, diga o que precisa.`,
    ``,
    dados.length ? `Dados do lead:` : null,
    ...dados,
    temDimensionamento ? null : `Ainda não há dados de dimensionamento deste lead (consumo, economia etc.) — não invente.`,
  ].filter((l): l is string => l !== null);
  const base = linhas.join('\n');

  // Prepende a base de conhecimento de vendas (tom, objeções, modelos, regras),
  // que é o que faz a IA "vender do jeito Ecosunpower".
  if (conhecimento && conhecimento.trim()) {
    return `${conhecimento.trim()}\n\n====================================\n${base}`;
  }
  return base;
}

// Conversa com a IA: contexto do lead (system) + histórico + a pergunta nova.
export async function responderCopiloto(
  anthropic: Anthropic,
  input: { contextoLead: ContextoLead; historico: MensagemCopiloto[]; pergunta: string; conhecimento?: string },
): Promise<string> {
  const system = montarSystemPromptCopiloto(input.contextoLead, input.conhecimento);
  const messages: Anthropic.MessageParam[] = [
    ...input.historico.map((m) => ({ role: m.role, content: m.conteudo })),
    { role: 'user', content: input.pergunta },
  ];
  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system,
    messages,
  });
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
