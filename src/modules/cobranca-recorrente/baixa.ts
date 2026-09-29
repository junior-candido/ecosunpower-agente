// src/modules/cobranca-recorrente/baixa.ts
// PAGOU (28/09/2026). Vem de dois lugares:
//  - webhook da InfinitePay (NÃO assinado → o index reconfirma no
//    payment_check e confere o valor ANTES de chegar aqui);
//  - botão "Marcar como paga (Pix direto)" da tela da casa (com confirm).
// Aqui: confere o valor de novo, baixa UMA vez (update condicional), lança a
// RECEITA no caixa, anda o vencimento, libera acesso suspenso e manda o
// recibo curto (uma vez). Falha no caixa/recibo nunca desfaz o pagamento.

import { somarMeses, vencimentoDaCompetencia, reais } from './ciclo.js';
import { MODELO_RECIBO, paramsModeloRecibo, emailRecibo, referenciaDaFatura } from './mensagens.js';
import type { AssinaturaMotor, CanaisDeps } from './motor.js';
import type { FaturaRow, InfoBaixa, TipoAviso } from './faturas-repo.js';

export interface BaixaDeps extends CanaisDeps {
  marcarFaturaPaga(faturaId: string, info: InfoBaixa): Promise<boolean>;
  /** Lança a receita no caixa; devolve o id do lançamento (null = já existia). */
  lancarReceita(a: AssinaturaMotor, f: FaturaRow, info: InfoBaixa): Promise<string | null>;
  vincularLancamento(faturaId: string, lancamentoId: string): Promise<void>;
  /** true = o acesso estava suspenso e voltou. */
  registrarPagamentoNaAssinatura(assinaturaId: string, proximoVenceEm: string | null): Promise<boolean>;
  liberarAcesso(a: AssinaturaMotor): Promise<void>;
  reservarAviso(faturaId: string, tipo: TipoAviso): Promise<boolean>;
}

export type ResultadoBaixa =
  | { ok: true; lancamentoId: string | null }
  | { ok: false; motivo: 'ja_paga' | 'valor_nao_bate' };

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function rotuloMetodo(metodo: string | null): string {
  if (metodo === 'pix') return 'Pix (link)';
  if (metodo === 'credit_card') return 'cartão (link)';
  if (metodo === 'pix_direto') return 'Pix direto (marcado na tela)';
  return metodo ?? 'forma não informada';
}

export async function baixarFatura(deps: BaixaDeps, a: AssinaturaMotor, f: FaturaRow, info: InfoBaixa): Promise<ResultadoBaixa> {
  const base = { fatura_id: f.id, assinatura_id: a.id, forma_baixa: info.formaBaixa };
  if (f.status !== 'aberta') return { ok: false, motivo: 'ja_paga' };

  // O valor tem que bater (o webhook já conferiu contra a cobrança; aqui é contra a FATURA).
  if (!(info.pagoCentavos >= f.valorCentavos)) {
    deps.log({ evento: 'valor_nao_bate', ...base, pago_centavos: info.pagoCentavos, valor_centavos: f.valorCentavos });
    await deps.avisarJunior(`⚠️ Pagamento da mensalidade de ${a.nome} (${referenciaDaFatura(f.descricao, f.competencia)}) NÃO foi baixado: o valor pago (R$ ${reais(info.pagoCentavos)}) não bate com a fatura (R$ ${reais(f.valorCentavos)}). Confira na InfinitePay.`).catch(() => undefined);
    return { ok: false, motivo: 'valor_nao_bate' };
  }

  if (!(await deps.marcarFaturaPaga(f.id, info))) return { ok: false, motivo: 'ja_paga' };
  deps.log({ evento: 'fatura_paga', ...base, metodo: info.metodo, pago_centavos: info.pagoCentavos });

  // Caixa: RECEITA. Falhou → o pagamento fica; o Junior lança na mão.
  let lancamentoId: string | null = null;
  try {
    lancamentoId = await deps.lancarReceita(a, f, info);
    if (lancamentoId) await deps.vincularLancamento(f.id, lancamentoId);
  } catch (e) {
    deps.log({ evento: 'erro_caixa', ...base, erro: msg(e) });
    await deps.avisarJunior(`⚠️ A mensalidade de ${a.nome} (${referenciaDaFatura(f.descricao, f.competencia)}, R$ ${reais(info.pagoCentavos)}) foi PAGA, mas o lançamento no caixa falhou (${msg(e)}). Lance na mão como entrada.`).catch(() => undefined);
  }

  // Assinatura: vencimento anda; acesso suspenso volta.
  try {
    const proximo = a.diaVencimento ? vencimentoDaCompetencia(somarMeses(f.competencia, 1), a.diaVencimento) : null;
    if (await deps.registrarPagamentoNaAssinatura(a.id, proximo)) await deps.liberarAcesso(a);
  } catch (e) {
    deps.log({ evento: 'erro_assinatura_pos_pagamento', ...base, erro: msg(e) });
  }

  // Recibo curto (uma vez).
  try {
    if (await deps.reservarAviso(f.id, 'recibo')) {
      const d = { nome: a.nome, descricao: f.descricao, competencia: f.competencia, venceEm: f.venceEm, valorCentavos: f.valorCentavos, link: null, pagoCentavos: info.pagoCentavos, pagoEm: info.pagoEm };
      const canais: string[] = [];
      if (a.telefone && await deps.modeloAprovado(MODELO_RECIBO).catch(() => false)) {
        try { await deps.enviarModelo(a.telefone, MODELO_RECIBO, paramsModeloRecibo(d)); canais.push('whatsapp'); }
        catch (e) { deps.log({ evento: 'erro_envio', canal: 'whatsapp', acao: 'recibo', ...base, erro: msg(e) }); }
      }
      if (a.email) {
        const em = emailRecibo(d);
        try { await deps.enviarEmail(a.email, em.assunto, em.html, null); canais.push('email'); }
        catch (e) { deps.log({ evento: 'erro_envio', canal: 'email', acao: 'recibo', ...base, erro: msg(e) }); }
      }
      deps.log({ evento: 'recibo_enviado', ...base, canais });
    }
  } catch (e) {
    deps.log({ evento: 'erro_recibo', ...base, erro: msg(e) });
  }

  await deps.avisarJunior(`💰 Mensalidade paga: ${a.nome} — ${referenciaDaFatura(f.descricao, f.competencia)} · R$ ${reais(info.pagoCentavos)} via ${rotuloMetodo(info.metodo)}.${lancamentoId ? ' Lançada no caixa como entrada.' : ''}`).catch(() => undefined);
  return { ok: true, lancamentoId };
}
