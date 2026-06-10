// src/modules/financeiro/engate-fechar.ts
// Ponte /fechar -> Núcleo Financeiro: venda fechada vira conta a receber com
// imposto provisório; botões marcam recebimento (PIX 50/50 = 2 parciais).
import type { SupabaseClient } from '@supabase/supabase-js';
import { criarContaDeFechamento, registrarRecebimento } from './contas.js';
import { cancelarConta } from './repo.js';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Id de botão "OK" que o roteador finrcv: ignora em silêncio (um id solto tipo
// 'noop' cairia no fluxo de conversa da Eva e geraria resposta estranha).
const BTN_OK = { id: 'finrcv:noop:0', title: 'OK' };

const rotuloStatus = (s: string) =>
  ({ pendente: 'pendente', recebido_parcial: 'parcial recebida', recebido: 'recebida', cancelado: 'cancelada' }[s] ?? s);

interface Waba {
  sendInteractiveButtons(to: string, body: string, buttons: Array<{ id: string; title: string }>, footer?: string): Promise<unknown>;
}

export async function createFechamentoConta(
  client: SupabaseClient,
  waba: Waba,
  adminPhone: string,
  fechamentoId: string,
  atividadeId: string,
): Promise<void> {
  // Dedupe: se já existe conta ativa pra esse fechamento, aborta com opções de recebimento
  const { data: existente, error: dupErr } = await client
    .from('financeiro_contas_a_receber')
    .select('id, valor, status, valor_recebido')
    .eq('fechamento_id', fechamentoId)
    .neq('status', 'cancelado')
    .maybeSingle();
  if (dupErr) throw new Error(`createFechamentoConta: ${dupErr.message}`);
  if (existente) {
    const e = existente as { id: string; valor: number; status: string; valor_recebido: number };
    await waba.sendInteractiveButtons(
      adminPhone,
      `⚠️ Essa venda já está lançada: ${brl(Number(e.valor))} (${rotuloStatus(e.status)}${Number(e.valor_recebido) > 0 ? `, recebido ${brl(Number(e.valor_recebido))}` : ''}).\nQuer marcar recebimento?`,
      [
        { id: `finrcv:total:${e.id}`, title: 'Recebido total' },
        { id: `finrcv:parcial:${e.id}`, title: 'Recebido parcial' },
        { id: `finrcv:cancelar:${e.id}`, title: 'Cancelar venda' },
      ],
      'Núcleo Financeiro',
    );
    return;
  }

  const { data: fch, error } = await client
    .from('fechamentos')
    .select('lead_id, dados_snapshot')
    .eq('id', fechamentoId)
    .single();
  if (error) throw new Error(`createFechamentoConta: ${error.message}`);
  const snap = (fch as { dados_snapshot?: { comercial?: { valor_total_brl?: number } } } | null)?.dados_snapshot;
  const valor = Number(snap?.comercial?.valor_total_brl ?? 0);
  const leadId = (fch as { lead_id?: string | null } | null)?.lead_id ?? null;
  if (valor <= 0) {
    await waba.sendInteractiveButtons(adminPhone, '⚠️ Venda sem valor no fechamento — não dá pra lançar.', [BTN_OK]);
    return;
  }
  const { contaId, calc } = await criarContaDeFechamento(client, {
    fechamentoId, leadId, atividadeId, descricao: `Venda fechamento ${fechamentoId.slice(0, 8)}`, valor, createdBy: adminPhone,
  });
  await waba.sendInteractiveButtons(
    adminPhone,
    `✅ Conta a receber criada: ${brl(valor)} (Anexo ${calc.anexo}).\nImposto provisório a separar: *${brl(calc.imposto)}*.\nQuando receber, marque aqui:`,
    [
      { id: `finrcv:total:${contaId}`, title: 'Recebido total' },
      { id: `finrcv:parcial:${contaId}`, title: 'Recebido parcial' },
      { id: `finrcv:cancelar:${contaId}`, title: 'Cancelar venda' },
    ],
    'Núcleo Financeiro',
  );
}

export async function handleRecebimento(
  client: SupabaseClient,
  waba: Waba,
  adminPhone: string,
  acao: 'total' | 'parcial' | 'cancelar',
  contaId: string,
  valorParcial?: number,
): Promise<void> {
  if (acao === 'cancelar') {
    await cancelarConta(client, contaId);
    await waba.sendInteractiveButtons(adminPhone, '🚫 Venda cancelada — não conta receita nem imposto.', [BTN_OK]);
    return;
  }
  // "parcial" sem valor digitado: metade do SALDO da conta (caso PIX 50/50).
  // Valor livre é fast-follow documentado.
  let valor = valorParcial;
  if (acao === 'parcial' && valor === undefined) {
    const { data, error } = await client
      .from('financeiro_contas_a_receber')
      .select('valor, valor_recebido, status')
      .eq('id', contaId)
      .single();
    if (error || !data) throw new Error(`handleRecebimento: ${error?.message ?? 'conta não encontrada'}`);
    const c = data as { valor: number; valor_recebido: number; status: string };
    // Trava 2ª parcial: PIX 50/50 = apenas UMA parcela intermediária
    if (c.status === 'recebido_parcial') {
      const recebido = Number(c.valor_recebido);
      const valorTotal = Number(c.valor);
      await waba.sendInteractiveButtons(
        adminPhone,
        `⚠️ Já tem uma parcela lançada (${brl(recebido)} de ${brl(valorTotal)}). Recebeu o resto? Toca aqui:`,
        [{ id: `finrcv:total:${contaId}`, title: 'Recebi o resto' }],
        'Núcleo Financeiro',
      );
      return;
    }
    valor = Math.round(((Number(c.valor) - Number(c.valor_recebido)) / 2) * 100) / 100;
  }
  const { calc, total, parcela, acumulado, saldoRestante } = await registrarRecebimento(client, contaId, acao === 'parcial' ? valor : undefined);
  let msg: string;
  if (total) {
    msg = `💵 Recebimento total registrado: ${brl(acumulado)}.\nImposto confirmado (Anexo ${calc.anexo}): *${brl(calc.imposto)}* — separe pro DAS.`;
    await waba.sendInteractiveButtons(adminPhone, msg, [BTN_OK]);
  } else {
    msg = `💵 Parcial registrado: ${brl(parcela)} (metade do saldo).\nFalta ${brl(saldoRestante)}.\nImposto desta parcela (Anexo ${calc.anexo}): *${brl(calc.imposto)}* — separe pro DAS.`;
    await waba.sendInteractiveButtons(
      adminPhone,
      msg,
      [{ id: `finrcv:total:${contaId}`, title: 'Recebi o resto' }],
      'Núcleo Financeiro',
    );
  }
}
