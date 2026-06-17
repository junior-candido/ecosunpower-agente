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
  buscarContaAbertaPorNome, gravarContaNoLancamento, reverterParaPendente,
  getSaldoConta, type LancamentoRow,
} from './lancamentos-repo.js';
import { uploadComprovante } from './comprovantes.js';
import {
  montarResumoPendente, montarPedidoPfPj, montarConfirmacaoApagar,
  montarOfertaVinculoConta, montarEscolhaAtividade,
  montarPedidoEsclarecimento, montarAberturaMultipla, type LancamentoResumo,
} from './resumo-lancamento.js';
import { criarContaDeFechamento, registrarRecebimento } from './contas.js';
import { parseValorReais } from './comando-imposto.js';
import { getAtividades, cancelarConta } from './repo.js';

interface Waba {
  sendInteractiveButtons(to: string, body: string, buttons: Array<{ id: string; title: string }>, footer?: string): Promise<unknown>;
}

const FOOTER = 'Caixa de Entrada · Financeiro';
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// PURO: uma entrada PJ com nota, ainda sem conta, precisa passar pelo motor de imposto (atividade).
// Sem nota / despesa / PF / já vinculada → não passa (vira só caixa, ou já tratada).
export function entradaPrecisaImposto(row: { tipo: 'despesa' | 'entrada'; pf_pj: 'PF' | 'PJ' | null; conta_id: string | null; tem_nota: boolean }): boolean {
  return row.tipo === 'entrada' && row.pf_pj === 'PJ' && !row.conta_id && row.tem_nota !== false;
}

// PURO: decide o que fazer com a lista extraída.
// lancar = itens financeiros a virar pendente; esclarecer = deu dinheiro mas nada extraído (nunca calar).
export function planejarCaptura(itens: ExtracaoLancamento[]): { lancar: ExtracaoLancamento[]; esclarecer: boolean } {
  const lancar = itens.filter((i) => i.financeiro);
  return { lancar, esclarecer: lancar.length === 0 };
}

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
    pf_pj: row.pf_pj, tem_nota: row.tem_nota,
  };
}

// Cria o pendente a partir de uma extração válida e manda o resumo + botões.
// Correção herda comprovante/categoria/obra do original — "o do posto era 350" não pode perder a foto da nota.
async function criarPendenteEFalar(
  deps: CaixaDeps, from: string, e: ExtracaoLancamento,
  midia: { base64: string; mimeType: string; messageId: string } | null,
  herdado?: { storagePath: string | null; mimeType?: string | null; leadId: string | null; categoriaId: string | null },
): Promise<void> {
  await expirarPendentesAntigos(deps.supabase); // varredura preguiçosa (sem cron)
  const dataEvento = e.data ?? hojeBRT();
  const cats = await getCategorias(deps.supabase);
  const slug = resolverCategoria(e.categoria_slug);
  let categoriaId = cats.find((c) => c.slug === slug)?.id ?? null;
  // Categoria do original vale mais que o fallback "outros" da extração nova.
  if ((!e.categoria_slug || e.categoria_slug === 'outros') && herdado?.categoriaId) {
    categoriaId = herdado.categoriaId;
  }

  // Sem valor não tem pendente — Eva pergunta e espera a resposta de texto.
  if (!(typeof e.valor === 'number' && e.valor > 0)) {
    await deps.sendText(from, 'Não consegui ler o valor 🤔 Me fala o valor e o que foi? (ex: "380 gasolina no Shell")');
    return;
  }

  // Comprovante: best-effort ANTES de confirmar (nada se perde).
  // Sem mídia nova, a correção reaproveita o comprovante do lançamento original.
  let storagePath: string | null = null;
  if (midia) {
    storagePath = await uploadComprovante(deps.supabase, midia.base64, midia.mimeType, competenciaDe(dataEvento));
    if (!storagePath) {
      await deps.sendText(from, '⚠️ Não consegui arquivar o comprovante (lanço mesmo assim — depois me reenvia o arquivo).');
    }
  } else if (herdado?.storagePath) {
    storagePath = herdado.storagePath;
  }

  // Vínculo de obra "quando der": citou cliente → tenta achar o lead.
  let leadId: string | null = null;
  if (e.obra_ref) {
    const t = e.obra_ref.replace(/[%_]/g, '\\$&'); // escapa curinga do ilike
    const { data } = await deps.supabase.from('leads').select('id')
      .ilike('name', `%${t}%`).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    leadId = (data as { id: string } | null)?.id ?? null;
  }
  if (!leadId && herdado?.leadId) leadId = herdado.leadId; // obra do original como fallback

  const faltaPfPj = e.pf_pj !== 'PF' && e.pf_pj !== 'PJ';
  const id = await criarPendente(deps.supabase, {
    tipo: e.tipo ?? 'despesa', valor: e.valor, dataEvento,
    contraparte: e.contraparte, descricao: e.descricao, categoriaId,
    pfPj: faltaPfPj ? null : e.pf_pj, leadId, storagePath,
    mimeType: midia?.mimeType ?? herdado?.mimeType ?? null, origem: midia ? 'zap_midia' : 'zap_texto',
    messageId: midia?.messageId ?? null,
    extracao: { ...e, aguardando: faltaPfPj }, createdBy: from, temNota: e.tem_nota,
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
  // Escolha: a oferta de vínculo pula o aviso de duplicado — 2 PIX iguais do mesmo
  // cliente no dia são plausíveis e o admin vê o valor no botão.
  if (row.tipo === 'entrada' && row.pf_pj === 'PJ' && row.tem_nota !== false) {
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
    const lista = kind === 'pdf'
      ? await extrairDePdf(deps.anthropic, midia.base64, hoje)
      : await extrairDeImagem(deps.anthropic, midia.base64, midia.mimeType, hoje);
    const { lancar } = planejarCaptura(lista);
    if (lancar.length === 0) return false; // comprovante não-financeiro → fluxo normal
    for (let i = 0; i < lancar.length; i++) {
      await criarPendenteEFalar(deps, from, lancar[i], i === 0 ? midia : null);
    }
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
    const aguardando = await getPendenteAguardando(deps.supabase, from);
    if (aguardando) {
      const hoje = hojeBRT();
      const contexto = `O lançamento pendente atual é: ${JSON.stringify(aguardando.extracao)}. ` +
        `Se a resposta do dono abaixo CORRIGE/COMPLETA esse lançamento, devolva o JSON completo já mesclado com "relacionado": true. ` +
        `Se for um lançamento NOVO (outro gasto/entrada, sem relação com o pendente), devolva o JSON do novo com "relacionado": false.\n\nResposta: "${texto}"`;
      const listaCtx = await extrairDeTexto(deps.anthropic, contexto, hoje);
      const e = listaCtx.find((x) => x.financeiro) ?? null;
      const extras = listaCtx.filter((x) => x.financeiro && x !== e);
      // Mescla SÓ com afirmação explícita do modelo; senão é lançamento novo.
      if (e && e.relacionado !== true) {
        await atualizarPendente(deps.supabase, aguardando.id, { extracao: { ...aguardando.extracao, aguardando: false } });
        await criarPendenteEFalar(deps, from, e, null);
        for (const x of extras) await criarPendenteEFalar(deps, from, x, null);
        return true;
      }
      if (e) {
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
        for (const x of extras) await criarPendenteEFalar(deps, from, x, null);
        return true;
      }
      await atualizarPendente(deps.supabase, aguardando.id, { extracao: { ...aguardando.extracao, aguardando: false } });
      return false;
    }

    // 1.5) Número solto (ex: "16mil", "30000", "R$ 30 mil") NÃO é lançamento.
    // Sem contexto (verbo/quem/categoria) é ambíguo — costuma ser cálculo de
    // imposto ou outra coisa. Nunca vira gasto/entrada sem o admin dizer mais.
    // Protege o dinheiro: impede valor escorregar pro caixa (ex.: Calcular imposto).
    // OBS: respostas a um pendente já foram tratadas no bloco "aguardando" acima.
    if (parseValorReais(texto) !== null) return false;

    // 2) Gate barato: é assunto financeiro?
    if (!(await gateTextoFinanceiro(deps.anthropic, texto))) return false;

    // 3) Extração completa (lista de eventos)
    const lista = await extrairDeTexto(deps.anthropic, texto, hojeBRT());
    const { lancar, esclarecer } = planejarCaptura(lista);

    // Rede de segurança: gate disse dinheiro mas não saiu nada → pergunta (nunca cala).
    if (esclarecer) { await deps.sendText(from, montarPedidoEsclarecimento()); return true; }

    // apagar/corrigir = intenção de alvo único → trata o 1º item pelo caminho de hoje.
    const primeiro = lancar[0];
    const extras = lancar.slice(1); // itens além do 1º (ex.: "apaga o do posto, paguei 380")
    const lancarExtras = async () => { for (const x of extras) await criarPendenteEFalar(deps, from, x, null); };
    if (primeiro.intencao === 'apagar') {
      const alvo = primeiro.contraparte
        ? await buscarConfirmadoPorContraparte(deps.supabase, primeiro.contraparte)
        : await getUltimoConfirmado(deps.supabase);
      if (!alvo) { await deps.sendText(from, 'Não achei lançamento pra apagar 🤔'); await lancarExtras(); return true; }
      // Invariante Fatia 2: recebimento lançado não se desfaz por botão — estorno é manual (cancelarConta tem o mesmo guard).
      if (alvo.tipo === 'entrada' && alvo.conta_id) {
        await deps.sendText(from, '⚠️ Essa entrada está ligada a uma venda (recebimento e imposto já contados). Estorno é manual por enquanto — me chama que a gente ajusta no banco.');
        await lancarExtras(); return true;
      }
      const msg = montarConfirmacaoApagar(await rowParaResumo(deps, alvo));
      await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
      await lancarExtras(); return true;
    }

    if (primeiro.intencao === 'corrigir') {
      const alvo = primeiro.contraparte
        ? await buscarConfirmadoPorContraparte(deps.supabase, primeiro.contraparte)
        : await getUltimoConfirmado(deps.supabase);
      if (!alvo) { await deps.sendText(from, 'Não achei o lançamento pra corrigir 🤔 Me fala qual (ex: "o do posto").'); await lancarExtras(); return true; }
      // Invariante Fatia 2: recebimento lançado não se desfaz por botão — estorno é manual (cancelarConta tem o mesmo guard).
      if (alvo.tipo === 'entrada' && alvo.conta_id) {
        await deps.sendText(from, '⚠️ Essa entrada está ligada a uma venda (recebimento e imposto já contados). Estorno é manual por enquanto — me chama que a gente ajusta no banco.');
        await lancarExtras(); return true;
      }
      // Correção = apaga o antigo (soft) + cria pendente novo já corrigido.
      // Simples e auditável: o histórico guarda os dois.
      const corrigido: ExtracaoLancamento = {
        ...primeiro, intencao: 'lancar',
        tipo: primeiro.tipo ?? alvo.tipo,
        valor: primeiro.valor ?? Number(alvo.valor),
        data: primeiro.data ?? alvo.data_evento,
        contraparte: primeiro.contraparte ?? alvo.contraparte,
        pf_pj: primeiro.pf_pj ?? alvo.pf_pj,
      };
      await mudarStatus(deps.supabase, alvo.id, 'confirmado', 'apagado',
        { descricao: `${alvo.descricao ?? ''} [substituído por correção]`.trim() });
      // mime_type não está no row — o storage_path basta (extensão implícita no path).
      await criarPendenteEFalar(deps, from, corrigido, null,
        { storagePath: alvo.storage_path, mimeType: undefined, leadId: alvo.lead_id, categoriaId: alvo.categoria_id });
      await lancarExtras(); return true;
    }

    // lançamento(s) novo(s): se for mais de um, abre avisando quantos.
    if (lancar.length > 1) await deps.sendText(from, montarAberturaMultipla(lancar.length));
    for (const e of lancar) {
      await criarPendenteEFalar(deps, from, e, null);
    }
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
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status !== 'pendente') { await deps.sendText(from, 'Esse lançamento não está mais pendente.'); return true; }
        await atualizarPendente(deps.supabase, id, {
          pf_pj: acao.toUpperCase(), extracao: { ...row.extracao, aguardando: false },
        });
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
            await atualizarPendente(deps.supabase, id, { extracao: { ...row.extracao, aguardando: true } });
            const msg = montarPedidoPfPj(id);
            await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
          } else {
            await deps.sendText(from, `Falta: ${v.faltando.join(', ')}. Me manda por texto que eu completo.`);
            await atualizarPendente(deps.supabase, id, { extracao: { ...row.extracao, aguardando: true } });
          }
          return true;
        }
        // Entrada PJ com nota e sem conta vinculada precisa de atividade (imposto) antes.
        if (entradaPrecisaImposto(row)) {
          const atividades = await getAtividades(deps.supabase);
          const msg = montarEscolhaAtividade(id, atividades);
          await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
          return true;
        }
        const ok = await mudarStatus(deps.supabase, id, 'pendente', 'confirmado');
        if (ok) {
          const msgEntrada = row.tem_nota === false
            ? `💰 Entrada lançada: ${brl(Number(row.valor))} (sem nota — fora do imposto).`
            : `💰 Entrada lançada: ${brl(Number(row.valor))}.`;
          await deps.sendText(from, row.tipo === 'despesa' ? `💸 Lançado: ${brl(Number(row.valor))}. Tá no caixa.` : msgEntrada);
        } else await deps.sendText(from, 'Esse lançamento já tinha sido processado.');
        return true;
      }
      case 'corr': {
        const row = await getLancamento(deps.supabase, id);
        // Sem pendente vivo não tem o que corrigir — perguntar "o que tá errado?"
        // faria a resposta cair em outro alvo.
        if (!row || row.status !== 'pendente') { await deps.sendText(from, 'Esse lançamento não está mais pendente.'); return true; }
        await atualizarPendente(deps.supabase, id, { extracao: { ...row.extracao, aguardando: true } });
        await deps.sendText(from, 'O que tá errado? Me fala (ex: "era 350" / "é PF" / "foi ontem").');
        return true;
      }
      case 'desc': {
        const ok = await mudarStatus(deps.supabase, id, 'pendente', 'apagado');
        await deps.sendText(from, ok ? 'Descartado 👍' : 'Esse lançamento não está mais pendente.');
        return true;
      }
      case 'apg': {
        // Invariante Fatia 2: recebimento lançado não se desfaz por botão — estorno é manual (cancelarConta tem o mesmo guard).
        const row = await getLancamento(deps.supabase, id);
        if (row?.tipo === 'entrada' && row?.conta_id) {
          await deps.sendText(from, '⚠️ Essa entrada está ligada a uma venda (recebimento e imposto já contados). Estorno é manual por enquanto — me chama que a gente ajusta no banco.');
          return true;
        }
        const ok = await mudarStatus(deps.supabase, id, 'confirmado', 'apagado');
        await deps.sendText(from, ok ? '🗑️ Apagado (fica no histórico, sai dos números).' : 'Esse já tinha sido apagado.');
        return true;
      }
      case 'vinc': {
        // finlan:vinc:<lancamentoId>:<contaId> — entrada casa com venda aberta.
        if (!extra) { console.warn('[caixa-entrada] vinc sem contaId'); return true; }
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status !== 'pendente') { await deps.sendText(from, 'Esse lançamento não está mais pendente.'); return true; }
        // Saldo ANTES do CAS: valor maior que o saldo da venda não confirma nada.
        const saldo = await getSaldoConta(deps.supabase, extra);
        if (saldo === null) { await deps.sendText(from, '⚠️ Essa venda não está mais em aberto.'); return true; }
        if (Number(row.valor) > saldo + 0.01) {
          await deps.waba.sendInteractiveButtons(from,
            `⚠️ O valor (${brl(Number(row.valor))}) é MAIOR que o saldo da venda (${brl(saldo)}). Lança como entrada avulsa ou corrige o valor:`,
            [
              { id: `finlan:avul:${id}`, title: 'Entrada avulsa' },
              { id: `finlan:corr:${id}`, title: 'Corrigir valor' },
              { id: `finlan:desc:${id}`, title: 'Descartar' },
            ], FOOTER);
          return true;
        }
        // CAS no lançamento ANTES do dinheiro: clique duplo para aqui (1 recebimento só).
        // Crash depois do CAS deixa lançamento confirmado SEM recebimento — faltando e
        // detectável, nunca duplicado (mesmo invariante da Fatia 2, contas.ts).
        const ok = await mudarStatus(deps.supabase, id, 'pendente', 'confirmado', { conta_id: extra });
        if (!ok) { await deps.sendText(from, 'Esse lançamento já tinha sido processado.'); return true; }
        // Só o passo de DINHEIRO reverte — falha de envio de mensagem não desfaz recebimento já entrado.
        let r: Awaited<ReturnType<typeof registrarRecebimento>>;
        try {
          r = await registrarRecebimento(deps.supabase, extra, Number(row.valor));
        } catch (err) {
          // Compensação: falha no passo de dinheiro desfaz o CAS porteiro — nunca fica entrada confirmada fantasma.
          await reverterParaPendente(deps.supabase, id);
          await deps.sendText(from, `❌ Não consegui registrar na venda (${(err as Error).message}). O lançamento voltou pra pendente.`);
          return true;
        }
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
        if (!extra) { console.warn('[caixa-entrada] atv sem atividadeId'); return true; }
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status !== 'pendente') { await deps.sendText(from, 'Esse lançamento não está mais pendente.'); return true; }
        // CAS porteiro ANTES de criar a conta: clique duplo não cria 2ª conta avulsa.
        const ok = await mudarStatus(deps.supabase, id, 'pendente', 'confirmado');
        if (!ok) { await deps.sendText(from, 'Esse lançamento já tinha sido processado.'); return true; }
        // Só o passo de DINHEIRO reverte — falha de envio de mensagem não desfaz recebimento já entrado.
        let contaId: string | undefined;
        let r: Awaited<ReturnType<typeof registrarRecebimento>>;
        try {
          ({ contaId } = await criarContaDeFechamento(deps.supabase, {
            fechamentoId: null, leadId: row.lead_id, atividadeId: extra,
            descricao: `Entrada avulsa — ${row.contraparte ?? row.descricao ?? 'sem descrição'}`,
            valor: Number(row.valor), createdBy: from,
          }));
          r = await registrarRecebimento(deps.supabase, contaId);
          await gravarContaNoLancamento(deps.supabase, id, contaId);
        } catch (err) {
          if (contaId) {
            // Conta avulsa órfã não pode ficar inflando o "A receber" — cancela
            // best-effort (o guard do cancelarConta protege se o dinheiro entrou).
            try { await cancelarConta(deps.supabase, contaId); } catch { /* manual */ }
          }
          // Compensação: falha no passo de dinheiro desfaz o CAS porteiro — nunca fica entrada confirmada fantasma.
          await reverterParaPendente(deps.supabase, id);
          await deps.sendText(from, `❌ Não consegui registrar na venda (${(err as Error).message}). O lançamento voltou pra pendente.`);
          return true;
        }
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
