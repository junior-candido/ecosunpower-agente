// src/modules/financeiro/fiscal/ponte-caixa.ts
// Nota autorizada → dinheiro esperado (conta a receber, líquido) + ISS retido lançado
// como despesa confirmada (o tomador já pagou por nós). Idempotência: quem chama só
// engata se conta_receber_id ainda é NULL (anexarPdf tem CAS de status).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotaLinha } from './notas-repo.js';

export interface ContextoEngate { companyId: string; fechamentoId: string | null; leadId: string | null }

export async function engatarNotaNoCaixa(client: SupabaseClient, nota: NotaLinha, ctx: ContextoEngate): Promise<void> {
  const { data: conta, error: e1 } = await client.from('financeiro_contas_a_receber').insert({
    descricao: `NFS-e nº ${nota.numero ?? '?'} — ${nota.tomador.nome}`,
    valor: nota.valorLiquido, status: 'pendente',
    fechamento_id: ctx.fechamentoId, lead_id: ctx.leadId, created_by: 'fiscal',
  }).select('id').single();
  if (e1) throw new Error(`engatarNotaNoCaixa (conta): ${e1.message}`);
  const contaId = (conta as { id: string }).id;

  let lancamentoId: string | null = null;
  if (nota.issRetido) {
    const { data: cat } = await client.from('financeiro_categorias').select('id').eq('slug', 'outros').single();
    const { data: lanc, error: e2 } = await client.from('financeiro_lancamentos').insert({
      tipo: 'despesa', status: 'confirmado', valor: nota.valorIss,
      data_evento: nota.competencia, competencia: nota.competencia.slice(0, 7),
      contraparte: nota.tomador.nome,
      descricao: `ISS retido na fonte — NFS-e nº ${nota.numero ?? '?'} (${nota.tomador.nome})`,
      categoria_id: (cat as { id: string } | null)?.id ?? null,
      pf_pj: 'PJ', origem: 'tela', banco_conta: 'desconhecido', confianca: 'alta', created_by: 'fiscal',
    }).select('id').single();
    if (e2) throw new Error(`engatarNotaNoCaixa (ISS): ${e2.message}`);
    lancamentoId = (lanc as { id: string }).id;
  }

  const { error: e3 } = await client.from('fiscal_notas')
    .update({ conta_receber_id: contaId, lancamento_iss_id: lancamentoId, updated_at: new Date().toISOString() })
    .eq('id', nota.id);
  if (e3) throw new Error(`engatarNotaNoCaixa (amarra): ${e3.message}`);
}
