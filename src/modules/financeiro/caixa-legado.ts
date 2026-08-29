// src/modules/financeiro/caixa-legado.ts
// LEGADO — remover quando não houver pendente no banco. Antes da Fatia 1 a Caixa
// criava PENDENTE e pedia "Confere?" com botões; o que sobrou disso vive aqui
// (só pra pendentes antigos e pro botão pf/pj em pendente).
import { ehDuplicado } from './lancamentos.js';
import { getLancamento, getConfirmadosDoDia, buscarContaAbertaPorNome } from './lancamentos-repo.js';
import { montarResumoPendente, montarOfertaVinculoConta, type ItemResumo } from './resumo-lancamento.js';
import { FOOTER, rowParaResumo, type CaixaDeps } from './caixa-entrada.js';

// Resumo de pendente com botões Confirmar/Corrigir/Descartar.
export async function mandarResumo(deps: CaixaDeps, from: string, lancamentoId: string): Promise<void> {
  const row = await getLancamento(deps.supabase, lancamentoId);
  if (!row || row.status !== 'pendente') return;

  if (row.tipo === 'entrada' && row.pf_pj === 'PJ' && row.tem_nota !== false) {
    const nomeBusca = (row.extracao?.obra_ref as string | undefined) ?? row.contraparte ?? '';
    if (nomeBusca) {
      const conta = await buscarContaAbertaPorNome(deps.supabase, nomeBusca);
      if (conta) {
        const msg = montarOfertaVinculoConta(row.id, conta.id, conta.clienteNome, conta.saldo);
        await deps.sendWithButtons(from, msg.body, msg.buttons, FOOTER);
        return;
      }
    }
  }

  const duplicado = ehDuplicado(
    { valor: Number(row.valor), contraparte: row.contraparte, data_evento: row.data_evento },
    await getConfirmadosDoDia(deps.supabase, row.data_evento),
  );
  const itens: ItemResumo[] = Array.isArray(row.extracao?.itens) ? (row.extracao!.itens as ItemResumo[]) : [];
  const msg = montarResumoPendente(await rowParaResumo(deps, row), { duplicado, itens });
  await deps.sendWithButtons(from, msg.body, msg.buttons, FOOTER);
}
