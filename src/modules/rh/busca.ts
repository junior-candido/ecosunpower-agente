// src/modules/rh/busca.ts
// Busca esperta no banco de talentos (Entrega 3 do RH): o Junior pergunta em
// linguagem natural ("quem tem NR-35 e mora no Gama?") e a IA vasculha os
// candidatos guardados (resumos da triagem) e devolve quem encaixa + motivo.
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

const MODELO_FORTE = 'claude-opus-4-7';
const MODELO_RAPIDO = 'claude-haiku-4-5-20251001';
const MAX_CANDIDATOS = 300; // teto do lote enviado pra IA (mais novos primeiro)

export interface CandidatoBusca {
  id: string;
  nome: string;
  vaga: string | null;       // título da vaga (null = banco de talentos)
  nota_ia: number | null;
  resumo_ia: string | null;
  alertas_ia: string | null;
  status: string;
}

export interface EncontradoBusca { id: string; motivo: string }

// ---------------------------------------------------------------------------
// PURO (testável)
// ---------------------------------------------------------------------------

export function montarPromptBusca(pergunta: string, candidatos: CandidatoBusca[]): string {
  const linhas = candidatos.map((c) => {
    const perfil = c.resumo_ia
      ? `${c.resumo_ia}${c.alertas_ia ? ` | Alertas: ${c.alertas_ia}` : ''}${c.nota_ia !== null ? ` | Nota triagem: ${c.nota_ia}` : ''}`
      : '(ainda sem triagem — só o nome disponível)';
    return `- id: ${c.id} | nome: ${c.nome} | vaga: ${c.vaga ?? 'Banco de Talentos'} | status: ${c.status} | perfil: ${perfil}`;
  }).join('\n');

  return `Você é o recrutador da EcoSunPower Energia Solar. O dono da empresa está garimpando
o banco de candidatos com esta pergunta:

"${pergunta}"

Candidatos guardados (o "perfil" é o resumo que a triagem fez do currículo de cada um):
${linhas}

Devolva APENAS um bloco \`\`\`json\`\`\` com a lista de quem ENCAIXA na pergunta, do melhor
pro pior encaixe (no máximo 10):
[{"id": "...", "motivo": "por que esse candidato encaixa, em 1 frase, citando a evidência do perfil"}]

Regras: só inclua candidato com evidência REAL no perfil (não suponha nada além do escrito).
Ninguém encaixa? Devolva [].`;
}

export function parseBusca(raw: string): EncontradoBusca[] {
  const m = /```json\s*([\s\S]*?)```/.exec(raw);
  if (!m) return [];
  let arr: unknown;
  try { arr = JSON.parse(m[1]); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is { id: unknown; motivo?: unknown } => !!x && typeof x === 'object' && 'id' in x)
    .map((x) => ({ id: String(x.id), motivo: typeof x.motivo === 'string' ? x.motivo : '' }))
    .filter((x) => x.id.trim() !== '')
    .slice(0, 10);
}

// ---------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------

async function chamarComFallback(client: Anthropic, prompt: string): Promise<string> {
  let response;
  try {
    response = await client.messages.create({ model: MODELO_FORTE, max_tokens: 700, messages: [{ role: 'user', content: prompt }] });
  } catch (apiErr) {
    console.warn('[rh-busca] Opus indisponível, fallback Haiku:', (apiErr as Error).message);
    response = await client.messages.create({ model: MODELO_RAPIDO, max_tokens: 700, messages: [{ role: 'user', content: prompt }] });
  }
  return response.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text').map((b) => b.text).join('');
}

// Roda a busca: junta candidatos (mais novos primeiro, até o teto) + vagas pros
// títulos, pergunta pra IA e devolve os encontrados JÁ com os dados da linha.
export async function buscarNoBanco(
  anthropic: Anthropic,
  supabase: SupabaseClient,
  pergunta: string,
): Promise<Array<EncontradoBusca & { candidato: CandidatoBusca }>> {
  const [{ data: cands }, { data: vagas }] = await Promise.all([
    supabase.from('rh_candidatos')
      .select('id,nome,vaga_id,nota_ia,resumo_ia,alertas_ia,status')
      .order('created_at', { ascending: false })
      .limit(MAX_CANDIDATOS),
    supabase.from('rh_vagas').select('id,titulo'),
  ]);
  const rows = (cands ?? []) as Array<{ id: string; nome: string; vaga_id: string | null; nota_ia: number | null; resumo_ia: string | null; alertas_ia: string | null; status: string }>;
  if (rows.length === 0) return [];
  const tituloVaga = new Map(((vagas ?? []) as Array<{ id: string; titulo: string }>).map((v) => [v.id, v.titulo]));
  const candidatos: CandidatoBusca[] = rows.map((r) => ({
    id: r.id, nome: r.nome, vaga: r.vaga_id ? (tituloVaga.get(r.vaga_id) ?? null) : null,
    nota_ia: r.nota_ia, resumo_ia: r.resumo_ia, alertas_ia: r.alertas_ia, status: r.status,
  }));

  const raw = await chamarComFallback(anthropic, montarPromptBusca(pergunta, candidatos));
  const porId = new Map(candidatos.map((c) => [c.id, c]));
  return parseBusca(raw)
    .filter((e) => porId.has(e.id)) // IA só pode devolver quem existe de verdade
    .map((e) => ({ ...e, candidato: porId.get(e.id)! }));
}
