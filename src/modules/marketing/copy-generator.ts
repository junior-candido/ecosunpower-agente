// src/modules/marketing/copy-generator.ts
import Anthropic from '@anthropic-ai/sdk';
import type { Persona, CreativeCopy } from './types.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Voce e um copywriter especialista em marketing digital pra empresa de energia solar.
Gere copies pra anuncios Meta (Facebook/Instagram). Tom calorico, tecnico mas acessivel.
NUNCA use a palavra "engenheiro" — sempre "Responsavel Tecnico CREA/CFT".
NUNCA mencione "alugar terra", "arrendar", "fazenda solar".
Mencione criterio "conta acima de R$ 700/mes" quando persona tem conta_minima >= 700.
Gere EXATAMENTE 3 variacoes: curto (1 linha headline + 1 linha body), medio (1 linha headline + 2-3 linhas body), longo (1 linha headline + 4-6 linhas body).
Retorne JSON ARRAY puro com {length, headline, body, cta}.`;

export async function generateCopies(params: {
  briefing: string;
  persona: Persona;
}): Promise<CreativeCopy[]> {
  const personaCtx = JSON.stringify({
    nome: params.persona.nome,
    categoria: params.persona.categoria_portfolio,
    regiao: params.persona.regiao_alvo,
    conta_minima: params.persona.conta_minima_brl,
    contexto_marca: params.persona.contexto_marca,
  }, null, 2);

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `BRIEFING: ${params.briefing}\n\nPERSONA:\n${personaCtx}\n\nGere as 3 copies em JSON puro.`,
    }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Claude nao retornou JSON: ' + text.slice(0, 200));
  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed) || parsed.length !== 3) {
    throw new Error('Esperado array de 3 copies, recebido: ' + JSON.stringify(parsed).slice(0, 200));
  }
  return parsed as CreativeCopy[];
}
