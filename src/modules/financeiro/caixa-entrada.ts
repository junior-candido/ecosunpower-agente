// src/modules/financeiro/caixa-entrada.ts
// Orquestrador da Caixa de Entrada Universal: mídia/texto do ADMIN vira
// lançamento pendente com botões; clique confirma. Eva classifica (extrator),
// SISTEMA calcula e lança (motor da Fatia 2 pra entrada PJ).
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  gateTextoFinanceiro, extrairDeTexto, extrairDeImagem, extrairDePdf,
  type ExtracaoLancamento,
} from './extrator-lancamento.js';
import { validarParaConfirmar, ehDuplicado, resolverCategoria, competenciaDe } from './lancamentos.js';
import {
  criarPendente, getLancamento, mudarStatus, atualizarPendente,
  getPendenteAguardando, getConfirmadosDoDia, getUltimoConfirmado,
  buscarConfirmadoPorContraparte, expirarPendentesAntigos, getCategorias,
  buscarContaAbertaPorNome, type LancamentoRow,
} from './lancamentos-repo.js';
import { uploadComprovante } from './comprovantes.js';
import {
  montarResumoPendente, montarPedidoPfPj, montarConfirmacaoApagar,
  montarOfertaVinculoConta, montarEscolhaAtividade, type LancamentoResumo,
} from './resumo-lancamento.js';
import { criarContaDeFechamento, registrarRecebimento } from './contas.js';
import { getAtividades } from './repo.js';

interface Waba {
  sendInteractiveButtons(to: string, body: string, buttons: Array<{ id: string; title: string }>, footer?: string): Promise<unknown>;
}

const FOOTER = 'Caixa de Entrada · Financeiro';
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const hojeBRT = (): string => {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
};

export interface CaixaDeps {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  waba: Waba;
  sendText: (to: string, text: string) => Promise<void>;
}

async function nomeCategoria(deps: CaixaDeps, categoriaId: string | null): Promise<string | null> {
  if (!categoriaId) return null;
  const cats = await getCategorias(deps.supabase);
  return cats.find((c) => c.id === categoriaId)?.nome ?? null;
}

async function rowParaResumo(deps: CaixaDeps, row: LancamentoRow): Promise<LancamentoResumo> {
  return {
    id: row.id, tipo: row.tipo, valor: Number(row.valor), data_evento: row.data_evento,
    contraparte: row.contraparte, categoriaNome: await nomeCategoria(deps, row.categoria_id),
    pf_pj: row.pf_pj,
  };
}

// Cria o pendente a partir de uma extração válida e manda o resumo + botões.
async function criarPendenteEFalar(
  deps: CaixaDeps, from: string, e: ExtracaoLancamento,
  midia: { base64: string; mimeType: string; messageId: string } | null,
): Promise<void> {
  await expirarPendentesAntigos(deps.supabase); // varredura preguiçosa (sem cron)
  const dataEvento = e.data ?? hojeBRT();
  const cats = await getCategorias(deps.supabase);
  const slug = resolverCategoria(e.categoria_slug);
  const cat = cats.find((c) => c.slug === slug) ?? null;

  // Sem valor não tem pendente — Eva pergunta e espera a resposta de texto.
  if (!(typeof e.valor === 'number' && e.valor > 0)) {
    await deps.sendText(from, 'Não consegui ler o valor 🤔 Me fala o valor e o que foi? (ex: "380 gasolina no Shell")');
    return;
  }

  // Comprovante: best-effort ANTES de confirmar (nada se perde).
  let storagePath: string | null = null;
  if (midia) {
    storagePath = await uploadComprovante(deps.supabase, midia.base64, midia.mimeType, competenciaDe(dataEvento));
    if (!storagePath) {
      await deps.sendText(from, '⚠️ Não consegui arquivar o comprovante (lanço mesmo assim — depois me reenvia o arquivo).');
    }
  }

  // Vínculo de obra "quando der": citou cliente → tenta achar o lead.
  let leadId: string | null = null;
  if (e.obra_ref) {
    const { data } = await deps.supabase.from('leads').select('id')
      .ilike('name', `%${e.obra_ref}%`).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    leadId = (data as { id: string } | null)?.id ?? null;
  }

  const faltaPfPj = e.pf_pj !== 'PF' && e.pf_pj !== 'PJ';
  const id = await criarPendente(deps.supabase, {
    tipo: e.tipo ?? 'despesa', valor: e.valor, dataEvento,
    contraparte: e.contraparte, descricao: e.descricao, categoriaId: cat?.id ?? null,
    pfPj: faltaPfPj ? null : e.pf_pj, leadId, storagePath,
    mimeType: midia?.mimeType ?? null, origem: midia ? 'zap_midia' : 'zap_texto',
    messageId: midia?.messageId ?? null,
    extracao: { ...e, aguardando: faltaPfPj }, createdBy: from,
  });

  if (faltaPfPj) {
    const msg = montarPedidoPfPj(id);
    await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
    return;
  }
  await mandarResumo(deps, from, id);
}

async function mandarResumo(deps: CaixaDeps, from: string, lancamentoId: string): Promise<void> {
  const row = await getLancamento(deps.supabase, lancamentoId);
  if (!row || row.status !== 'pendente') return;

  // Entrada que cita cliente com venda em aberto → oferece vincular (motor Fatia 2).
  if (row.tipo === 'entrada' && row.pf_pj === 'PJ') {
    const nomeBusca = (row.extracao?.obra_ref as string | undefined) ?? row.contraparte ?? '';
    if (nomeBusca) {
      const conta = await buscarContaAbertaPorNome(deps.supabase, nomeBusca);
      if (conta) {
        const msg = montarOfertaVinculoConta(row.id, conta.id, conta.clienteNome, conta.saldo);
        await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
        return;
      }
    }
  }

  const duplicado = ehDuplicado(
    { valor: Number(row.valor), contraparte: row.contraparte, data_evento: row.data_evento },
    await getConfirmadosDoDia(deps.supabase, row.data_evento),
  );
  const msg = montarResumoPendente(await rowParaResumo(deps, row), { duplicado });
  await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
}

// ---------------------------------------------------------------------------
// ENTRADAS públicas (chamadas pelo index.ts)
// ---------------------------------------------------------------------------

// Mídia de admin (imagem/pdf). Retorna true se tratou (era financeiro).
export async function tryHandleFinanceiroMedia(
  deps: CaixaDeps, from: string,
  midia: { base64: string; mimeType: string; messageId: string },
  kind: 'imagem' | 'pdf',
): Promise<boolean> {
  try {
    const hoje = hojeBRT();
    const e = kind === 'pdf'
      ? await extrairDePdf(deps.anthropic, midia.base64, hoje)
      : await extrairDeImagem(deps.anthropic, midia.base64, midia.mimeType, hoje);
    if (!e || !e.financeiro) return false; // não é assunto financeiro → fluxo normal
    await criarPendenteEFalar(deps, from, e, midia);
    return true;
  } catch (err) {
    console.error('[caixa-entrada] midia falhou:', (err as Error).message);
    return false; // qualquer erro → fluxo normal (nunca trava a Eva)
  }
}

// Texto de admin (inclui transcrição de áudio/vídeo). Retorna true se tratou.
export async function tryHandleFinanceiroTexto(deps: CaixaDeps, from: string, texto: string): Promise<boolean> {
  try {
    // 1) Tem pendente esperando resposta (PF/PJ por texto, valor, correção)?
    const aguardando = await getPendenteAguardando(deps.supabase);
    if (aguardando) {
      const hoje = hojeBRT();
      const contexto = `O lançamento pendente atual é: ${JSON.stringify(aguardando.extracao)}. ` +
        `A resposta do dono abaixo CORRIGE/COMPLETA esse lançamento — devolva o JSON completo já mesclado.\n\nResposta: "${texto}"`;
      const e = await extrairDeTexto(deps.anthropic, contexto, hoje);
      if (e && e.financeiro) {
        const cats = await getCategorias(deps.supabase);
        const cat = cats.find((c) => c.slug === resolverCategoria(e.categoria_slug)) ?? null;
        await atualizarPendente(deps.supabase, aguardando.id, {
          valor: e.valor ?? aguardando.valor, data_evento: e.data ?? aguardando.data_evento,
          competencia: competenciaDe(e.data ?? aguardando.data_evento),
          contraparte: e.contraparte ?? aguardando.contraparte,
          descricao: e.descricao ?? aguardando.descricao,
          categoria_id: cat?.id ?? aguardando.categoria_id,
          pf_pj: e.pf_pj ?? aguardando.pf_pj,
          extracao: { ...e, aguardando: false },
        });
        await mandarResumo(deps, from, aguardando.id);
        return true;
      }
      // resposta não relacionada → solta o pendente e segue fluxo normal
      await atualizarPendente(deps.supabase, aguardando.id, { extracao: { ...aguardando.extracao, aguardando: false } });
      return false;
    }

    // 2) Gate barato: é assunto financeiro?
    if (!(await gateTextoFinanceiro(deps.anthropic, texto))) return false;

    // 3) Extração completa
    const e = await extrairDeTexto(deps.anthropic, texto, hojeBRT());
    if (!e || !e.financeiro) return false;

    if (e.intencao === 'apagar') {
      const alvo = e.contraparte
        ? await buscarConfirmadoPorContraparte(deps.supabase, e.contraparte)
        : await getUltimoConfirmado(deps.supabase);
      if (!alvo) { await deps.sendText(from, 'Não achei lançamento pra apagar 🤔'); return true; }
      const msg = montarConfirmacaoApagar(await rowParaResumo(deps, alvo));
      await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
      return true;
    }

    if (e.intencao === 'corrigir') {
      const alvo = e.contraparte
        ? await buscarConfirmadoPorContraparte(deps.supabase, e.contraparte)
        : await getUltimoConfirmado(deps.supabase);
      if (!alvo) { await deps.sendText(from, 'Não achei o lançamento pra corrigir 🤔 Me fala qual (ex: "o do posto").'); return true; }
      // Correção = apaga o antigo (soft) + cria pendente novo já corrigido.
      // Simples e auditável: o histórico guarda os dois.
      const corrigido: ExtracaoLancamento = {
        ...e, intencao: 'lancar',
        tipo: e.tipo ?? alvo.tipo,
        valor: e.valor ?? Number(alvo.valor),
        data: e.data ?? alvo.data_evento,
        contraparte: e.contraparte ?? alvo.contraparte,
        pf_pj: e.pf_pj ?? alvo.pf_pj,
      };
      await mudarStatus(deps.supabase, alvo.id, 'confirmado', 'apagado',
        { descricao: `${alvo.descricao ?? ''} [substituído por correção]`.trim() });
      await criarPendenteEFalar(deps, from, corrigido, null);
      return true;
    }

    await criarPendenteEFalar(deps, from, e, null);
    return true;
  } catch (err) {
    console.error('[caixa-entrada] texto falhou:', (err as Error).message);
    return false;
  }
}

// Botões finlan:<acao>:<id>[:<extra>]. Retorna true se tratou.
export async function handleFinlanButton(deps: CaixaDeps, from: string, buttonId: string): Promise<boolean> {
  const [prefixo, acao, id, extra] = buttonId.trim().split(':');
  if (prefixo !== 'finlan') return false;
  if (acao === 'noop') return true;
  try {
    switch (acao) {
      case 'pf': case 'pj': {
        await atualizarPendente(deps.supabase, id, { pf_pj: acao.toUpperCase() });
        const row = await getLancamento(deps.supabase, id);
        if (row) await atualizarPendente(deps.supabase, id, { extracao: { ...row.extracao, aguardando: false } });
        await mandarResumo(deps, from, id);
        return true;
      }
      case 'conf': {
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status !== 'pendente') {
          await deps.sendText(from, 'Esse lançamento não está mais pendente.');
          return true;
        }
        const v = validarParaConfirmar({ tipo: row.tipo, valor: Number(row.valor), data_evento: row.data_evento, pf_pj: row.pf_pj });
        if (!v.ok) {
          if (v.faltando.includes('pf_pj')) {
            const msg = montarPedidoPfPj(id);
            await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
          } else {
            await deps.sendText(from, `Falta: ${v.faltando.join(', ')}. Me manda por texto que eu completo.`);
            await atualizarPendente(deps.supabase, id, { extracao: { ...row.extracao, aguardando: true } });
          }
          return true;
        }
        // Entrada PJ sem conta vinculada precisa de atividade (imposto) antes.
        if (row.tipo === 'entrada' && row.pf_pj === 'PJ' && !row.conta_id) {
          const atividades = await getAtividades(deps.supabase);
          const msg = montarEscolhaAtividade(id, atividades);
          await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
          return true;
        }
        const ok = await mudarStatus(deps.supabase, id, 'pendente', 'confirmado');
        if (ok) await deps.sendText(from, row.tipo === 'despesa' ? `💸 Lançado: ${brl(Number(row.valor))}. Tá no caixa.` : `💰 Entrada lançada: ${brl(Number(row.valor))}.`);
        else await deps.sendText(from, 'Esse lançamento já tinha sido processado.');
        return true;
      }
      case 'corr': {
        const row = await getLancamento(deps.supabase, id);
        if (row) await atualizarPendente(deps.supabase, id, { extracao: { ...row.extracao, aguardando: true } });
        await deps.sendText(from, 'O que tá errado? Me fala (ex: "era 350" / "é PF" / "foi ontem").');
        return true;
      }
      case 'desc': {
        const ok = await mudarStatus(deps.supabase, id, 'pendente', 'apagado');
        await deps.sendText(from, ok ? 'Descartado 👍' : 'Esse lançamento não está mais pendente.');
        return true;
      }
      case 'apg': {
        const ok = await mudarStatus(deps.supabase, id, 'confirmado', 'apagado');
        await deps.sendText(from, ok ? '🗑️ Apagado (fica no histórico, sai dos números).' : 'Esse já tinha sido apagado.');
        return true;
      }
      case 'vinc': {
        // finlan:vinc:<lancamentoId>:<contaId> — entrada casa com venda aberta.
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status !== 'pendente') { await deps.sendText(from, 'Esse lançamento não está mais pendente.'); return true; }
        const r = await registrarRecebimento(deps.supabase, extra, Number(row.valor) > 0 ? Number(row.valor) : undefined);
        await mudarStatus(deps.supabase, id, 'pendente', 'confirmado', { conta_id: extra });
        const aviso = r.total
          ? `💵 Recebimento total na venda: ${brl(r.acumulado)}.`
          : `💵 Parcela na venda: ${brl(r.parcela)} (falta ${brl(r.saldoRestante)}).`;
        await deps.sendText(from, `${aviso}\nImposto desta parcela (Anexo ${r.calc.anexo}): *${brl(r.calc.imposto)}* — separe pro DAS.`);
        return true;
      }
      case 'avul': {
        const atividades = await getAtividades(deps.supabase);
        const msg = montarEscolhaAtividade(id, atividades);
        await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
        return true;
      }
      case 'atv': {
        // finlan:atv:<lancamentoId>:<atividadeId> — entrada avulsa PJ: cria conta
        // avulsa + recebimento total imediato (motor Fatia 2 → imposto/RBT12 certos).
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status !== 'pendente') { await deps.sendText(from, 'Esse lançamento não está mais pendente.'); return true; }
        const { contaId } = await criarContaDeFechamento(deps.supabase, {
          fechamentoId: null, leadId: row.lead_id, atividadeId: extra,
          descricao: `Entrada avulsa — ${row.contraparte ?? row.descricao ?? 'sem descrição'}`,
          valor: Number(row.valor), createdBy: from,
        });
        const r = await registrarRecebimento(deps.supabase, contaId);
        await mudarStatus(deps.supabase, id, 'pendente', 'confirmado', { conta_id: contaId });
        await deps.sendText(from, `💰 Entrada avulsa lançada: ${brl(Number(row.valor))}.\nImposto (Anexo ${r.calc.anexo}): *${brl(r.calc.imposto)}* — separe pro DAS.`);
        return true;
      }
      default:
        console.warn(`[caixa-entrada] finlan ação desconhecida: ${acao}`);
        return true;
    }
  } catch (err) {
    console.error('[caixa-entrada] botão falhou:', (err as Error).message);
    await deps.sendText(from, `❌ ${(err as Error).message}`);
    return true;
  }
}
