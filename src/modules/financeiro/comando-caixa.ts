// src/modules/financeiro/comando-caixa.ts
// "/caixa" ou "/contas" (admin): a pagar nos próximos 7 dias, a receber, movimento de hoje e
// quantos lançamentos ainda estão sem dono. Texto é PURO (montarCaixa); o handler faz o I/O.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getContasAbertas } from './contas-pagar.js';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const maisDias = (iso: string, dias: number) => new Date(Date.parse(iso) + dias * 86_400_000).toISOString().slice(0, 10);

export function montarCaixa(d: {
  hojeIso: string;
  aPagar7d: Array<{ descricao: string; valor: number; vencimento: string; mundo: 'PJ' | 'PF' }>;
  aReceber: Array<{ descricao: string; valor: number }>;
  hoje: { entradas: number; saidas: number; n: number };
  semDono: number;
}): string {
  const ate = maisDias(d.hojeIso, 7);
  const totPagar = d.aPagar7d.reduce((s, c) => s + c.valor, 0);
  const totReceber = d.aReceber.reduce((s, c) => s + c.valor, 0);
  const linhas = [
    `💼 *Caixa — ${dBR(d.hojeIso)}*`,
    `\n📤 A PAGAR até ${dBR(ate)}: ${brl(totPagar)}`,
    ...d.aPagar7d.map((c) => `• ${c.vencimento < d.hojeIso ? '⚠️ ' : ''}${c.descricao} — ${brl(c.valor)} (${c.mundo}) ${dBR(c.vencimento)}`),
    `\n📥 A RECEBER: ${brl(totReceber)}`,
    ...d.aReceber.slice(0, 8).map((c) => `• ${c.descricao} — ${brl(c.valor)}`),
    `\n📆 Hoje: ${d.hoje.n} lançamento(s) · entrou ${brl(d.hoje.entradas)} · saiu ${brl(d.hoje.saidas)}`,
  ];
  if (d.semDono > 0) linhas.push(`\n❓ ${d.semDono} lançamento(s) sem dono — te pergunto na segunda.`);
  return linhas.join('\n');
}

export interface CaixaHandlerDeps {
  client: SupabaseClient;
  isAdminPhone: (p: string) => boolean;
  sendText: (to: string, t: string) => Promise<void>;
  hoje: () => string; // AAAA-MM-DD em BRT
}

export function makeCaixaHandler(deps: CaixaHandlerDeps) {
  return async function tryHandleCaixaCommand(from: string, text: string): Promise<boolean> {
    if (!deps.isAdminPhone(from)) return false;
    if (!/^\/?(caixa|contas)\s*$/i.test(text.trim())) return false;
    try {
      await deps.sendText(from, await montarCaixaDoBanco(deps.client, deps.hoje()));
    } catch (err) {
      console.error('[financeiro] /caixa falhou:', (err as Error).message);
      await deps.sendText(from, `❌ Não consegui montar o caixa agora: ${(err as Error).message}`);
    }
    return true;
  };
}

// I/O: lê o banco e monta o texto. Erro de banco vira Error('caixa: …') — o handler avisa o admin.
async function montarCaixaDoBanco(client: SupabaseClient, hojeIso: string): Promise<string> {
  {
    const aPagar7d = await getContasAbertas(client, maisDias(hojeIso, 7));

    const { data: rec, error: errRec } = await client.from('financeiro_contas_a_receber')
      .select('descricao, valor, valor_recebido')
      .in('status', ['pendente', 'recebido_parcial']).order('created_at');
    if (errRec) throw new Error(`caixa: ${errRec.message}`);
    const aReceber = ((rec ?? []) as Array<{ descricao: string | null; valor: number; valor_recebido: number | null }>)
      .map((r) => ({ descricao: r.descricao ?? 'sem descrição', valor: Number(r.valor) - Number(r.valor_recebido ?? 0) }));

    const { data: hj, error: errHj } = await client.from('financeiro_lancamentos')
      .select('tipo, valor').eq('status', 'confirmado').eq('data_evento', hojeIso);
    if (errHj) throw new Error(`caixa: ${errHj.message}`);
    const hoje = { n: (hj ?? []).length, entradas: 0, saidas: 0 };
    for (const l of (hj ?? []) as Array<{ tipo: string; valor: number }>) {
      if (l.tipo === 'entrada') hoje.entradas += Number(l.valor); else hoje.saidas += Number(l.valor);
    }

    const { count, error: errSd } = await client.from('financeiro_lancamentos')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmado').is('favorecido_id', null)
      .in('confianca', ['baixa', 'pendente']).gte('data_evento', hojeIso.slice(0, 8) + '01');
    if (errSd) throw new Error(`caixa: ${errSd.message}`);

    return montarCaixa({
      hojeIso,
      aPagar7d: aPagar7d.map((c) => ({ descricao: c.descricao, valor: c.valor, vencimento: c.vencimento, mundo: c.mundo })),
      aReceber, hoje, semDono: count ?? 0,
    });
  }
}
