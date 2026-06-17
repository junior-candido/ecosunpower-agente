// src/modules/financeiro/apagar-menu.ts
// Submenu "🗑️ Apagar lançamento" do Financeiro: lista os lançamentos vivos dos
// últimos 30 dias, o admin toca o que quer, confirma e apaga (soft-delete:
// status → 'apagado', fica no histórico e sai dos números).
import type { SupabaseClient } from '@supabase/supabase-js';
import { getLancamentosRecentes, getLancamento, mudarStatus, type LancamentoRow } from './lancamentos-repo.js';
import { estornarRecebimento } from './contas.js';

const brl = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// data_evento vem como 'YYYY-MM-DD' → 'dd/mm'
function ddmm(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return d && m ? `${d}/${m}` : iso.slice(0, 10);
}

function rotulo(r: LancamentoRow): { title: string; description: string } {
  const sinal = r.tipo === 'entrada' ? '➕' : '➖';
  const quem = r.contraparte ? ` · ${r.contraparte}` : (r.descricao ? ` · ${r.descricao}` : '');
  const pend = r.status === 'pendente' ? ' (pendente)' : '';
  return {
    title: `${sinal} ${brl(Number(r.valor))} · ${ddmm(r.data_evento)}`.slice(0, 24),
    description: `${r.tipo === 'entrada' ? 'Entrada' : 'Gasto'}${quem}${pend}`.slice(0, 72),
  };
}

// Venda com pagamentos parciais (vários recebimentos): o vínculo lançamento↔recebimento
// não é 1:1, então estornar pode errar — mantém manual com mensagem clara.
const VENDA_PARCIAL_MSG =
  '⚠️ Essa venda tem pagamentos parciais — me chama que a gente acerta com cuidado.';

// Rows da lista interativa (até 10, mais recentes primeiro). null = vazio.
export async function montarListaApagar(client: SupabaseClient):
  Promise<{ rows: Array<{ id: string; title: string; description: string }>; total: number } | null> {
  const lista = await getLancamentosRecentes(client, 30, 10);
  if (lista.length === 0) return null;
  const rows = lista.map((r) => ({ id: `findel:${r.id}`, ...rotulo(r) }));
  return { rows, total: lista.length };
}

// Confirmação de apagar UM lançamento (após o admin tocar a row da lista).
// Retorna os botões, OU null (não achou). Entrada de venda NÃO bloqueia mais —
// avisa que vai estornar; o estorno acontece ao confirmar.
export async function montarConfirmacaoApagarLancamento(client: SupabaseClient, id: string):
  Promise<{ body: string; buttons: Array<{ id: string; title: string }> } | null> {
  const r = await getLancamento(client, id);
  if (!r || r.status === 'apagado') return null;
  const { title, description } = rotulo(r);
  const avisoVenda = (r.tipo === 'entrada' && r.conta_id)
    ? '\n\n⚠️ É de uma venda — vou estornar o recebimento e o imposto junto.'
    : '';
  return {
    body: `Apagar este lançamento?\n\n${title}\n_${description}_${avisoVenda}`,
    buttons: [
      { id: `findel-go:${r.id}`, title: '🗑️ Apagar' },
      { id: 'findel-no', title: 'Cancelar' },
    ],
  };
}

// Executa o soft-delete. Retorna a mensagem pro admin.
export async function executarApagarLancamento(client: SupabaseClient, id: string): Promise<string> {
  const r = await getLancamento(client, id);
  if (!r) return 'Não achei esse lançamento 🤔';
  if (r.status === 'apagado') return 'Esse já tinha sido apagado.';
  // Entrada de venda: estorna o recebimento (conta + imposto + RBT12) ANTES de apagar.
  if (r.tipo === 'entrada' && r.conta_id) {
    const est = await estornarRecebimento(client, r.conta_id);
    if (!est.ok) return VENDA_PARCIAL_MSG;
    const ok = await mudarStatus(client, id, r.status, 'apagado');
    if (!ok) return 'Esse já tinha sido apagado.';
    return `🗑️ Apagado e estornado: tirei ${brl(est.valorEstornado)} do recebido e ${brl(est.impostoEstornado)} de imposto.`;
  }
  const ok = await mudarStatus(client, id, r.status, 'apagado');
  return ok ? '🗑️ Apagado! Saiu dos números (fica no histórico).' : 'Esse já tinha sido apagado.';
}
