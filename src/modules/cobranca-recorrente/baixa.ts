// src/modules/cobranca-recorrente/baixa.ts
// PAGOU (28/09/2026). Vem de dois lugares:
//  - webhook da InfinitePay (NÃO assinado → o index reconfirma no
//    payment_check ANTES de chegar aqui);
//  - botão "Marcar como paga (Pix direto)" da tela da casa (com confirm).
// Aqui: confere o valor contra a FATURA (sem valor confirmado = não baixa),
// baixa UMA vez (update condicional), lança a RECEITA no caixa, anda o
// vencimento, libera acesso suspenso e REATIVA a assistente do tenant (só se
// não sobrou outra fatura vencida em aberto), e manda o recibo (uma vez).
// Falha no caixa/recibo nunca desfaz o pagamento.

import { somarMeses, vencimentoDaCompetencia, reais, hojeBrasilia } from './ciclo.js';
import { MODELO_RECIBO, paramsModeloRecibo, emailRecibo, referenciaDaFatura } from './mensagens.js';
import { decidirPausa } from './pausa.js';
import { reativarAssistenteDe, type AssinaturaMotor, type CanaisDeps, type PausaDeps } from './motor.js';
import type { FaturaRow, InfoBaixa, TipoAviso } from './faturas-repo.js';

export interface BaixaDeps extends CanaisDeps, PausaDeps {
  marcarFaturaPaga(faturaId: string, info: InfoBaixa): Promise<boolean>;
  /** Lança a receita no caixa; devolve o id do lançamento (null = já existia). */
  lancarReceita(a: AssinaturaMotor, f: FaturaRow, info: InfoBaixa): Promise<string | null>;
  vincularLancamento(faturaId: string, lancamentoId: string): Promise<void>;
  /** true = o acesso estava suspenso e voltou (só destrava se `podeDestravar`). */
  registrarPagamentoNaAssinatura(assinaturaId: string, proximoVenceEm: string | null, podeDestravar: boolean): Promise<boolean>;
  liberarAcesso(a: AssinaturaMotor): Promise<void>;
  reservarAviso(faturaId: string, tipo: TipoAviso): Promise<boolean>;
  /** Faturas da assinatura DEPOIS da baixa (pra saber se sobrou alguma vencida). */
  faturasDaAssinatura(assinaturaId: string): Promise<FaturaRow[]>;
}

/** Na baixa, o valor pago pode não vir (payment_check sem valor): aí NÃO baixa. */
export type InfoPagamento = Omit<InfoBaixa, 'pagoCentavos'> & { pagoCentavos: number | null };

export type ResultadoBaixa =
  | { ok: true; lancamentoId: string | null; reativou: boolean }
  | { ok: false; motivo: 'ja_paga' | 'valor_nao_bate' };

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function rotuloMetodo(metodo: string | null): string {
  if (metodo === 'pix') return 'Pix (link)';
  if (metodo === 'credit_card') return 'cartão de crédito (link)';
  if (metodo === 'pix_direto') return 'Pix direto (marcado na tela)';
  return metodo ?? 'forma não informada';
}

export async function baixarFatura(deps: BaixaDeps, a: AssinaturaMotor, f: FaturaRow, pag: InfoPagamento): Promise<ResultadoBaixa> {
  const base = { fatura_id: f.id, assinatura_id: a.id, forma_baixa: pag.formaBaixa };
  if (f.status !== 'aberta') return { ok: false, motivo: 'ja_paga' };

  // O valor tem que bater contra a FATURA. Sem valor confirmado → não baixa.
  if (pag.pagoCentavos === null || !(pag.pagoCentavos >= f.valorCentavos)) {
    deps.log({ evento: 'valor_nao_bate', ...base, pago_centavos: pag.pagoCentavos, valor_centavos: f.valorCentavos });
    // Uma vez por fatura (a InfinitePay reenvia o webhook).
    if (await deps.reservarAviso(f.id, 'valor_alerta').catch(() => false)) {
      const pago = pag.pagoCentavos === null ? 'a InfinitePay não informou o valor pago' : `o valor pago (R$ ${reais(pag.pagoCentavos)}) não bate com a fatura (R$ ${reais(f.valorCentavos)})`;
      await deps.avisarJunior(`⚠️ Pagamento da mensalidade de ${a.nome} (${referenciaDaFatura(f.descricao, f.competencia)}) NÃO foi baixado: ${pago}. Confira na InfinitePay e, se estiver certo, use "Marcar como paga" na tela.`).catch(() => undefined);
    }
    return { ok: false, motivo: 'valor_nao_bate' };
  }
  const info: InfoBaixa = { ...pag, pagoCentavos: pag.pagoCentavos };

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

  // Sobrou alguma fatura VENCIDA em aberto? Então nada destrava/reativa ainda.
  const hoje = hojeBrasilia();
  let restantes: FaturaRow[] = [];
  try { restantes = (await deps.faturasDaAssinatura(a.id)).map((x) => (x.id === f.id ? { ...x, status: 'paga' as const } : x)); } catch { /* segue: sem lista, não reativa */ }
  const semOutraVencida = !restantes.some((x) => x.status === 'aberta' && x.venceEm < hoje);

  // Assinatura: vencimento anda; acesso suspenso volta (se nada mais vencido).
  try {
    const proximo = a.diaVencimento ? vencimentoDaCompetencia(somarMeses(f.competencia, 1), a.diaVencimento) : null;
    if (await deps.registrarPagamentoNaAssinatura(a.id, proximo, semOutraVencida)) await deps.liberarAcesso(a);
  } catch (e) {
    deps.log({ evento: 'erro_assinatura_pos_pagamento', ...base, erro: msg(e) });
  }

  // Assistente do tenant pausada por fatura → volta sozinha.
  let reativou = false;
  try {
    if (a.assistentePausadaEm && restantes.length && decidirPausa(a, restantes, hoje, deps.casaId) === 'reativar') {
      reativou = await reativarAssistenteDe(deps, a, 'pagou');
    }
  } catch (e) {
    deps.log({ evento: 'erro_reativar', ...base, erro: msg(e) });
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

  await deps.auditar({ assinaturaId: a.id, acao: info.formaBaixa === 'manual' ? 'fatura_paga_manual' : 'fatura_paga_link', detalhe: f.competencia.slice(0, 7) }).catch(() => undefined);
  await deps.avisarJunior(`💰 Mensalidade paga: ${a.nome} — ${referenciaDaFatura(f.descricao, f.competencia)} · R$ ${reais(info.pagoCentavos)} via ${rotuloMetodo(info.metodo)}.${lancamentoId ? ' Lançada no caixa como entrada.' : ''}`).catch(() => undefined);
  return { ok: true, lancamentoId, reativou };
}
