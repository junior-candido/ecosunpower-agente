// src/modules/financeiro/resumo-semanal.ts
// Resumo semanal (segunda 8h BRT): agrupa os lançamentos "sem dono" da semana por
// contraparte e pergunta ao Junior, com botões, o que é cada um (mão de obra /
// material / pessoal PF). O botão finfav: aprende o favorecido e aplica a todos
// os lançamentos iguais. PURO (agrupar/montar/janela) + I/O (tick, responder).
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizarTexto, aprenderFavorecido } from './favorecidos.js';
import { getSemDono, definirFavorecido, getCategorias } from './lancamentos-repo.js';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export interface Grupo {
  chave: string;       // contraparte normalizada
  contraparte: string; // como veio no primeiro lançamento (pra mostrar)
  exemploId: string;   // id do 1º lançamento — vai no botão
  ids: string[];
  total: number;
  n: number;
}

export interface LinhaSemDono {
  id: string; contraparte: string | null; valor: number; data_evento: string; tipo: 'despesa' | 'entrada';
}

// PURO: agrupa por contraparte normalizada, soma e conta; maior total primeiro.
export function agruparSemDono(rows: LinhaSemDono[]): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const r of rows) {
    const chave = normalizarTexto(r.contraparte) || 'sem descrição';
    const g = m.get(chave) ?? { chave, contraparte: r.contraparte ?? 'sem descrição', exemploId: r.id, ids: [], total: 0, n: 0 };
    g.ids.push(r.id);
    g.total += Number(r.valor);
    g.n++;
    m.set(chave, g);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

export interface Pergunta { body: string; buttons: Array<{ id: string; title: string }> }

// PURO: uma pergunta por grupo, no máximo 5 (os maiores).
export function montarPerguntas(grupos: Grupo[]): Pergunta[] {
  return grupos.slice(0, 5).map((g) => ({
    body: `❓ *${g.contraparte.replace(/\*/g, '')}*: ${g.n} pagamento(s), total ${brl(g.total)}. Isso é:`,
    buttons: [
      { id: `finfav:mo:${g.exemploId}`, title: 'Mão de obra' },
      { id: `finfav:mat:${g.exemploId}`, title: 'Material' },
      { id: `finfav:pf:${g.exemploId}`, title: 'Pessoal (PF)' },
    ],
  }));
}

// PURO: segunda-feira às 8h em Brasília (UTC-3).
export function ehSegunda8h(agora: Date): boolean {
  const brt = new Date(agora.getTime() - 3 * 3600e3);
  return brt.getUTCDay() === 1 && brt.getUTCHours() === 8;
}

export interface ResumoSemanalDeps {
  client: SupabaseClient;
  adminPhone: string;
  hoje: () => string; // AAAA-MM-DD em BRT
  sendText: (to: string, text: string) => Promise<void>;
  enviarComBotoes: (to: string, body: string, buttons: Array<{ id: string; title: string }>, footer?: string) => Promise<void>;
  // Dedupe (opcional, pra teste): por padrão usa memória do módulo — 1 envio por dia.
  jaEnviouHoje?: (hoje: string) => boolean;
  marcarEnviado?: (hoje: string) => void;
}

// Dedupe em memória: o tick é horário e pode disparar 2× dentro da hora das 8h.
let ultimoEnvio = '';

export async function tickResumoSemanal(d: ResumoSemanalDeps, agora = new Date()): Promise<void> {
  if (!ehSegunda8h(agora)) return;
  const hoje = d.hoje();
  const jaEnviou = d.jaEnviouHoje ?? ((h: string) => ultimoEnvio === h);
  const marcar = d.marcarEnviado ?? ((h: string) => { ultimoEnvio = h; });
  if (jaEnviou(hoje)) return;
  marcar(hoje);

  const de = new Date(Date.parse(hoje) - 6 * 86_400_000).toISOString().slice(0, 10); // 7 dias incluindo hoje
  const rows = await getSemDono(d.client, de, hoje);
  if (rows.length === 0) return;
  const grupos = agruparSemDono(rows);
  const total = rows.reduce((s, r) => s + Number(r.valor), 0);
  await d.sendText(d.adminPhone,
    `📊 Semana ${dBR(de)}–${dBR(hoje)}: ${rows.length} lançamento(s) sem dono (${brl(total)}). Me ajuda com os maiores:`);
  for (const p of montarPerguntas(grupos)) {
    await d.enviarComBotoes(d.adminPhone, p.body, p.buttons, 'Financeiro · semanal');
  }
}

// Botão finfav:<mo|mat|pf>:<lancamentoId> → aprende o favorecido pela contraparte do
// lançamento e aplica a TODOS os lançamentos com a mesma contraparte (sem dono ou já
// desse favorecido). IDEMPOTENTE: favorecidos tem UNIQUE (company_id, nome) — segundo
// toque (ou troca de "Mão de obra" pra "Material") atualiza o existente em vez de inserir.
// Devolve quantos lançamentos foram atualizados.
export async function responderFavorecido(client: SupabaseClient, acao: 'mo' | 'mat' | 'pf', lancamentoId: string): Promise<number> {
  const { data: l, error } = await client.from('financeiro_lancamentos').select('contraparte').eq('id', lancamentoId).maybeSingle();
  if (error) throw new Error(`responderFavorecido: ${error.message}`);
  const contraparte = (l as { contraparte: string | null } | null)?.contraparte;
  if (!contraparte) return 0;

  const slug = acao === 'mo' ? 'mao_de_obra' : acao === 'mat' ? 'material_eletrico' : 'outros';
  const mundo: 'PF' | 'PJ' = acao === 'pf' ? 'PF' : 'PJ';
  const cats = await getCategorias(client);
  const catId = cats.find((c) => c.slug === slug)?.id ?? null;

  const { data: existente, error: e1 } = await client.from('financeiro_favorecidos').select('id')
    .eq('nome', contraparte).maybeSingle();
  if (e1) throw new Error(`responderFavorecido: ${e1.message}`);
  let favId: string;
  if (existente) {
    favId = (existente as { id: string }).id;
    const { error: e3 } = await client.from('financeiro_favorecidos')
      .update({ categoria_slug: slug, mundo_padrao: mundo }).eq('id', favId);
    if (e3) throw new Error(`responderFavorecido: ${e3.message}`);
  } else {
    favId = await aprenderFavorecido(client, {
      nome: contraparte, padroes: [contraparte], categoria_slug: slug, mundo_padrao: mundo, tipo_padrao: 'despesa',
    });
  }

  const t = contraparte.replace(/[%_]/g, '\\$&'); // escapa curinga do ilike
  const { data: iguais, error: e2 } = await client.from('financeiro_lancamentos').select('id')
    .or(`favorecido_id.is.null,favorecido_id.eq.${favId}`).neq('status', 'apagado').ilike('contraparte', t);
  if (e2) throw new Error(`responderFavorecido: ${e2.message}`);
  const lista = (iguais ?? []) as Array<{ id: string }>;
  for (const r of lista) await definirFavorecido(client, r.id, favId, mundo, catId);
  return lista.length;
}
