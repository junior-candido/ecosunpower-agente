// src/modules/financeiro/caixa-entrada.ts
// Orquestrador da Caixa de Entrada Universal (Fatia 1 "sem trava"): mídia/texto do
// ADMIN vira lançamento JÁ CONFIRMADO, com confiança. Botões servem só pra corrigir
// ou apagar DEPOIS. Eva classifica (extrator + dicionário de favorecidos); imposto
// e "atividade" ficam pro fechamento do mês — nunca travam o registro.
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  gateTextoFinanceiro, extrairDeTexto, extrairDeImagem, extrairDePdf, corrigirItensComTexto,
  type ExtracaoLancamento, type ItemNota,
} from './extrator-lancamento.js';
import { validarParaConfirmar, ehDuplicado, resolverCategoria, competenciaDe } from './lancamentos.js';
import {
  criarConfirmado, getLancamento, mudarStatus, atualizarPendente, definirPfPj,
  getPendenteAguardando, getConfirmadosDoDia, getUltimoConfirmado,
  buscarConfirmadoPorContraparte, expirarPendentesAntigos, getCategorias,
  buscarContaAbertaPorNome, gravarContaNoLancamento, reverterParaPendente,
  vincularContaSeLivre, desvincularConta, getSaldoConta, type LancamentoRow,
} from './lancamentos-repo.js';
import { uploadComprovante } from './comprovantes.js';
import { classificar } from './classificar.js';
import { getFavorecidos } from './favorecidos.js';
import {
  montarResumoPendente, montarPedidoPfPj, montarConfirmacaoApagar, montarRegistrado,
  montarOfertaVinculoConta, montarOfertaVinculoRegistrado, montarEscolhaAtividade,
  montarPedidoEsclarecimento, montarAberturaMultipla, type LancamentoResumo, type ItemResumo,
} from './resumo-lancamento.js';
import { criarContaDeFechamento, registrarRecebimento } from './contas.js';
import { parseValorReais } from './comando-imposto.js';
import { gravarComprasDaNota } from './materiais.js';
import { getAtividades, cancelarConta } from './repo.js';

const FOOTER = 'Caixa de Entrada · Financeiro';
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MSG_ENTRADA_LIGADA = '⚠️ Essa entrada está ligada a uma venda (recebimento e imposto já contados). Estorno é manual por enquanto — me chama que a gente ajusta no banco.';

// PURO: uma entrada PJ com nota, ainda sem conta, precisa passar pelo motor de imposto (atividade).
// Sem nota / despesa / PF / já vinculada → não passa (vira só caixa, ou já tratada).
// (Fatia 1: não é mais etapa obrigatória do registro — usado só pelos botões legados.)
export function entradaPrecisaImposto(row: { tipo: 'despesa' | 'entrada'; pf_pj: 'PF' | 'PJ' | 'FRONTEIRA' | null; conta_id: string | null; tem_nota: boolean }): boolean {
  return row.tipo === 'entrada' && row.pf_pj === 'PJ' && !row.conta_id && row.tem_nota !== false;
}

// PURO: decide o que fazer com a lista extraída.
// lancar = itens financeiros a registrar; esclarecer = deu dinheiro mas nada extraído (nunca calar).
export function planejarCaptura(itens: ExtracaoLancamento[]): { lancar: ExtracaoLancamento[]; esclarecer: boolean } {
  const lancar = itens.filter((i) => i.financeiro);
  return { lancar, esclarecer: lancar.length === 0 };
}

// PURO: um pendente (legado) fica "aguardando" texto quando falta PF/PJ OU quando é nota
// com itens — aí a correção de item por texto ("a curva é 7,00") é capturada.
export function pendenteAguardaTexto(faltaPfPj: boolean, itens: unknown): boolean {
  return faltaPfPj || (Array.isArray(itens) && itens.length > 0);
}

// PURO: com valor registra JÁ (tipo ausente vira despesa lá na frente); sem valor pergunta
// UMA vez e não cria nada. É a única "pergunta" do caminho automático.
export function decidirRegistro(e: { valor: number | null; tipo: 'despesa' | 'entrada' | null }): { acao: 'registrar' | 'perguntar_valor' } {
  return typeof e.valor === 'number' && e.valor > 0 ? { acao: 'registrar' } : { acao: 'perguntar_valor' };
}

// Carimbo de quando a Eva PERGUNTOU — a janela de 10 min conta daqui, não da criação
// (um "Corrigir" tocado no dia seguinte tem que engolir a resposta do mesmo jeito).
const agoraIso = (): string => new Date().toISOString();

const hojeBRT = (): string => {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
};

export interface CaixaDeps {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  sendText: (to: string, text: string) => Promise<void>;
  // Botões: quem injeta decide (WABA com fallback texto). A Caixa não depende de WABA.
  sendWithButtons: (to: string, body: string, buttons: Array<{ id: string; title: string }>, footer?: string) => Promise<void>;
}

type Herdado = { storagePath: string | null; mimeType?: string | null; leadId: string | null; categoriaId: string | null };

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

async function nomeLead(deps: CaixaDeps, leadId: string | null): Promise<string | null> {
  if (!leadId) return null;
  const { data } = await deps.supabase.from('leads').select('name').eq('id', leadId).maybeSingle();
  return (data as { name: string | null } | null)?.name ?? null;
}

// Registra JÁ CONFIRMADO a partir de uma extração e responde "✅ Registrei" + botões
// corrigir/apagar. Nunca cria pendente. Correção herda comprovante/categoria/obra do
// original — "o do posto era 350" não pode perder a foto da nota.
// Devolve o id criado (null se não registrou: sem valor ou duplicado).
export async function registrarEFalar(
  deps: CaixaDeps, from: string, e: ExtracaoLancamento,
  midia: { base64: string; mimeType: string; messageId: string } | null,
  herdado?: Herdado, arquivoId: string | null = null,
): Promise<string | null> {
  await expirarPendentesAntigos(deps.supabase); // varredura preguiçosa (sem cron)

  // Sem valor não tem registro — pergunta UMA vez; a resposta entra como mensagem nova.
  if (decidirRegistro(e).acao === 'perguntar_valor') {
    await deps.sendText(from, 'Não peguei o valor 🤔 Me fala o valor e o que foi (ex: "380 gasolina no Shell").');
    return null;
  }
  const valor = e.valor as number;
  const tipo = e.tipo ?? 'despesa';
  const dataEvento = e.data ?? hojeBRT();

  // Classificação: dicionário (favorecidos) > extração explícita > padrão PJ com confiança baixa.
  const [cats, dic] = await Promise.all([getCategorias(deps.supabase), getFavorecidos(deps.supabase)]);
  const cls = classificar({
    tipo, valor, contraparte: e.contraparte, categoria_slug: e.categoria_slug,
    pf_pj: e.pf_pj === 'FRONTEIRA' ? null : e.pf_pj, descricao: e.descricao,
  }, dic);
  // FRONTEIRA dito explicitamente pelo extrator vale — não é "assumi PJ".
  const mundo = e.pf_pj === 'FRONTEIRA' ? 'FRONTEIRA' : cls.mundo;
  const confianca = e.pf_pj === 'FRONTEIRA' && cls.confianca === 'baixa' ? 'media' : cls.confianca;
  let categoriaId = cats.find((c) => c.slug === cls.categoria_slug)?.id ?? null;
  // Categoria do original vale mais que o fallback "outros" da extração nova.
  if (cls.categoria_slug === 'outros' && herdado?.categoriaId) categoriaId = herdado.categoriaId;

  // Comprovante: best-effort ANTES de registrar (nada se perde).
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
  let obraNome: string | null = null;
  if (e.obra_ref) {
    const t = e.obra_ref.replace(/[%_]/g, '\\$&'); // escapa curinga do ilike
    const { data } = await deps.supabase.from('leads').select('id, name')
      .ilike('name', `%${t}%`).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    const lead = data as { id: string; name: string | null } | null;
    leadId = lead?.id ?? null;
    obraNome = lead?.name ?? null;
  }
  if (!leadId && herdado?.leadId) { // obra do original como fallback
    leadId = herdado.leadId;
    obraNome = await nomeLead(deps, leadId);
  }

  let id: string;
  try {
    id = await criarConfirmado(deps.supabase, {
      tipo, valor, dataEvento,
      contraparte: e.contraparte ?? cls.favorecido_nome, descricao: e.descricao, categoriaId,
      pfPj: mundo, leadId, storagePath,
      mimeType: midia?.mimeType ?? herdado?.mimeType ?? null, origem: midia ? 'zap_midia' : 'zap_texto',
      messageId: midia?.messageId ?? null,
      extracao: { ...e }, createdBy: from, temNota: e.tem_nota,
      bancoConta: 'desconhecido', favorecidoId: cls.favorecido_id, confianca, arquivoId,
    });
  } catch (err) {
    if ((err as Error).message === 'DUPLICADO') {
      await deps.sendText(from, '↩️ Esse eu já tinha registrado (mesmo valor, mesmo dia, mesma descrição).');
      return null;
    }
    throw err;
  }

  if (e.itens?.length) await gravarComprasDaNota(deps.supabase, id).catch(() => undefined);

  const row = await getLancamento(deps.supabase, id);
  const resumo: LancamentoResumo = row ? await rowParaResumo(deps, row) : {
    id, tipo, valor, data_evento: dataEvento, contraparte: e.contraparte ?? cls.favorecido_nome,
    categoriaNome: await nomeCategoria(deps, categoriaId), pf_pj: mundo, tem_nota: e.tem_nota,
  };
  const msg = montarRegistrado(resumo, { confianca, obraNome });
  await deps.sendWithButtons(from, msg.body, msg.buttons, FOOTER);

  // Extra opcional: entrada PJ que casa com venda em aberto → oferece vincular (motor Fatia 2).
  if (row) await oferecerVinculoConta(deps, from, row);
  return id;
}

// Só quando existe venda aberta com o nome citado. Não bloqueia nada: o lançamento já está no caixa.
async function oferecerVinculoConta(deps: CaixaDeps, from: string, row: LancamentoRow): Promise<void> {
  if (!(row.tipo === 'entrada' && row.pf_pj === 'PJ' && row.tem_nota !== false && !row.conta_id)) return;
  const nomeBusca = (row.extracao?.obra_ref as string | undefined) ?? row.contraparte ?? '';
  if (!nomeBusca) return;
  const conta = await buscarContaAbertaPorNome(deps.supabase, nomeBusca);
  if (!conta) return;
  const msg = montarOfertaVinculoRegistrado(row.id, conta.id, conta.clienteNome, conta.saldo);
  await deps.sendWithButtons(from, msg.body, msg.buttons, FOOTER);
}

// Correção por texto: apaga (soft) o original e registra o corrigido JÁ confirmado.
// Simples e auditável: o histórico guarda os dois. O índice de duplicidade ignora apagados.
async function substituirPorCorrecao(deps: CaixaDeps, from: string, alvo: LancamentoRow, corrigido: ExtracaoLancamento): Promise<void> {
  await mudarStatus(deps.supabase, alvo.id, alvo.status === 'pendente' ? 'pendente' : 'confirmado', 'apagado',
    { descricao: `${alvo.descricao ?? ''} [substituído por correção]`.trim() });
  // mime_type não está no row — o storage_path basta (extensão implícita no path).
  const novo = await registrarEFalar(deps, from, corrigido, null,
    { storagePath: alvo.storage_path, mimeType: undefined, leadId: alvo.lead_id, categoriaId: alvo.categoria_id });
  // Raro (duplicado com OUTRO lançamento): o original já saiu dos números — avisa em vez de sumir.
  if (!novo) await deps.sendText(from, '⚠️ O original saiu dos números e o corrigido não entrou. Me manda o lançamento completo de novo.');
}

// PURO: mescla o que o admin corrigiu com o que já estava no lançamento (só o que ele NÃO disse herda).
export function mesclarCorrecao(base: LancamentoRow, e: Partial<ExtracaoLancamento>): ExtracaoLancamento {
  const ext = (base.extracao ?? {}) as Partial<ExtracaoLancamento>;
  return {
    financeiro: true, intencao: 'lancar',
    tipo: e.tipo ?? base.tipo,
    valor: e.valor ?? Number(base.valor),
    data: e.data ?? base.data_evento,
    contraparte: e.contraparte ?? base.contraparte,
    categoria_slug: e.categoria_slug && e.categoria_slug !== 'outros' ? e.categoria_slug : (ext.categoria_slug ?? null),
    pf_pj: e.pf_pj ?? base.pf_pj,
    obra_ref: e.obra_ref ?? ext.obra_ref ?? null,
    descricao: e.descricao ?? base.descricao,
    material: e.material ?? ext.material ?? null,
    quantidade: e.quantidade ?? ext.quantidade ?? null,
    unidade: e.unidade ?? ext.unidade ?? null,
    itens: e.itens?.length ? e.itens : (Array.isArray(ext.itens) ? ext.itens : []),
    campos_faltando: [], relacionado: true,
    tem_nota: typeof e.tem_nota === 'boolean' ? e.tem_nota : base.tem_nota,
  };
}

// Resumo de pendente LEGADO (criado antes da Fatia 1, ou via botões pf/pj antigos).
async function mandarResumo(deps: CaixaDeps, from: string, lancamentoId: string): Promise<void> {
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

// Pendente "aguardando" que era confirmado (botão Corrigir) volta pro caixa quando a
// resposta NÃO era correção — nunca fica pendente órfão esperando o GC apagar.
async function soltarAguardando(deps: CaixaDeps, pend: LancamentoRow): Promise<void> {
  const extracao = { ...pend.extracao, aguardando: false };
  if (pend.extracao?.era_confirmado === true) {
    await mudarStatus(deps.supabase, pend.id, 'pendente', 'confirmado', { extracao });
  } else {
    await atualizarPendente(deps.supabase, pend.id, { extracao });
  }
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
      await registrarEFalar(deps, from, lancar[i], i === 0 ? midia : null);
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
    // 1) Eva PERGUNTOU algo há menos de 10 min (botão Corrigir)? Só aí o texto é resposta.
    const aguardando = await getPendenteAguardando(deps.supabase, from);
    if (aguardando) {
      // Nota com itens: o texto corrige os itens ("a curva é 7,00") e o lançamento
      // corrigido entra JÁ confirmado (nunca escorrega pro cérebro de conversa).
      const itensAtuais = Array.isArray(aguardando.extracao?.itens)
        ? (aguardando.extracao!.itens as ItemNota[]) : [];
      if (itensAtuais.length > 0) {
        const itensCorrigidos = await corrigirItensComTexto(deps.anthropic, itensAtuais, texto, hojeBRT());
        await substituirPorCorrecao(deps, from, aguardando, mesclarCorrecao(aguardando, { itens: itensCorrigidos }));
        return true;
      }

      const hoje = hojeBRT();
      const contexto = `O lançamento atual é: ${JSON.stringify(aguardando.extracao)}. ` +
        `Se a resposta do dono abaixo CORRIGE/COMPLETA esse lançamento, devolva o JSON completo já mesclado com "relacionado": true. ` +
        `Se for um lançamento NOVO (outro gasto/entrada, sem relação com o atual), devolva o JSON do novo com "relacionado": false.\n\nResposta: "${texto}"`;
      const listaCtx = await extrairDeTexto(deps.anthropic, contexto, hoje);
      const e = listaCtx.find((x) => x.financeiro) ?? null;
      const extras = listaCtx.filter((x) => x.financeiro && x !== e);
      // Mescla SÓ com afirmação explícita do modelo; senão é lançamento novo.
      if (e && e.relacionado !== true) {
        await soltarAguardando(deps, aguardando);
        await registrarEFalar(deps, from, e, null);
        for (const x of extras) await registrarEFalar(deps, from, x, null);
        return true;
      }
      if (e) {
        await substituirPorCorrecao(deps, from, aguardando, mesclarCorrecao(aguardando, e));
        for (const x of extras) await registrarEFalar(deps, from, x, null);
        return true;
      }
      await soltarAguardando(deps, aguardando);
      return false;
    }

    // 1.5) Número solto (ex: "16mil", "30000", "R$ 30 mil") NÃO é lançamento.
    // Sem contexto (verbo/quem/categoria) é ambíguo — costuma ser cálculo de
    // imposto ou outra coisa. Nunca vira gasto/entrada sem o admin dizer mais.
    // Protege o dinheiro: impede valor escorregar pro caixa (ex.: Calcular imposto).
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
    const lancarExtras = async () => { for (const x of extras) await registrarEFalar(deps, from, x, null); };
    if (primeiro.intencao === 'apagar') {
      const alvo = primeiro.contraparte
        ? await buscarConfirmadoPorContraparte(deps.supabase, primeiro.contraparte)
        : await getUltimoConfirmado(deps.supabase);
      if (!alvo) { await deps.sendText(from, 'Não achei lançamento pra apagar 🤔'); await lancarExtras(); return true; }
      // Invariante Fatia 2: recebimento lançado não se desfaz por botão — estorno é manual (cancelarConta tem o mesmo guard).
      if (alvo.tipo === 'entrada' && alvo.conta_id) {
        await deps.sendText(from, MSG_ENTRADA_LIGADA);
        await lancarExtras(); return true;
      }
      const msg = montarConfirmacaoApagar(await rowParaResumo(deps, alvo));
      await deps.sendWithButtons(from, msg.body, msg.buttons, FOOTER);
      await lancarExtras(); return true;
    }

    if (primeiro.intencao === 'corrigir') {
      const alvo = primeiro.contraparte
        ? await buscarConfirmadoPorContraparte(deps.supabase, primeiro.contraparte)
        : await getUltimoConfirmado(deps.supabase);
      if (!alvo) { await deps.sendText(from, 'Não achei o lançamento pra corrigir 🤔 Me fala qual (ex: "o do posto").'); await lancarExtras(); return true; }
      // Invariante Fatia 2: recebimento lançado não se desfaz por botão — estorno é manual (cancelarConta tem o mesmo guard).
      if (alvo.tipo === 'entrada' && alvo.conta_id) {
        await deps.sendText(from, MSG_ENTRADA_LIGADA);
        await lancarExtras(); return true;
      }
      // Correção = apaga o antigo (soft) + registra o corrigido JÁ confirmado.
      const corrigido: ExtracaoLancamento = {
        ...primeiro, intencao: 'lancar',
        tipo: primeiro.tipo ?? alvo.tipo,
        valor: primeiro.valor ?? Number(alvo.valor),
        data: primeiro.data ?? alvo.data_evento,
        contraparte: primeiro.contraparte ?? alvo.contraparte,
        pf_pj: primeiro.pf_pj ?? alvo.pf_pj,
      };
      await substituirPorCorrecao(deps, from, alvo, corrigido);
      await lancarExtras(); return true;
    }

    // lançamento(s) novo(s): se for mais de um, abre avisando quantos.
    if (lancar.length > 1) await deps.sendText(from, montarAberturaMultipla(lancar.length));
    for (const e of lancar) {
      await registrarEFalar(deps, from, e, null);
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
        if (!row || row.status === 'apagado') { await deps.sendText(from, 'Esse lançamento já foi apagado.'); return true; }
        const pfPj = acao.toUpperCase() as 'PF' | 'PJ';
        if (row.status === 'confirmado') {
          // Já registrado: só troca o mundo (botão "É PF" do registro com confiança baixa).
          await definirPfPj(deps.supabase, id, pfPj);
          await deps.sendText(from, pfPj === 'PF' ? '👍 Marquei como PF (pessoal).' : '👍 Marquei como PJ (empresa).');
          return true;
        }
        await atualizarPendente(deps.supabase, id, {
          // Nota com itens segue aberta pra correção por texto mesmo após resolver PF/PJ.
          pf_pj: pfPj, extracao: { ...row.extracao, aguardando: pendenteAguardaTexto(false, row.extracao?.itens), aguardando_desde: agoraIso() },
        });
        await mandarResumo(deps, from, id);
        return true;
      }
      case 'conf': {
        // Legado: pendentes criados antes da Fatia 1 ainda confirmam por clique.
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status !== 'pendente') {
          await deps.sendText(from, 'Esse lançamento não está mais pendente.');
          return true;
        }
        const v = validarParaConfirmar({ tipo: row.tipo, valor: Number(row.valor), data_evento: row.data_evento, pf_pj: row.pf_pj });
        if (!v.ok) {
          if (v.faltando.includes('pf_pj')) {
            await atualizarPendente(deps.supabase, id, { extracao: { ...row.extracao, aguardando: true, aguardando_desde: agoraIso() } });
            const msg = montarPedidoPfPj(id);
            await deps.sendWithButtons(from, msg.body, msg.buttons, FOOTER);
          } else {
            await deps.sendText(from, `Falta: ${v.faltando.join(', ')}. Me manda por texto que eu completo.`);
            await atualizarPendente(deps.supabase, id, { extracao: { ...row.extracao, aguardando: true, aguardando_desde: agoraIso() } });
          }
          return true;
        }
        // Entrada PJ com nota e sem conta vinculada precisa de atividade (imposto) antes.
        if (entradaPrecisaImposto(row)) {
          const atividades = await getAtividades(deps.supabase);
          const msg = montarEscolhaAtividade(id, atividades);
          await deps.sendWithButtons(from, msg.body, msg.buttons, FOOTER);
          return true;
        }
        const ok = await mudarStatus(deps.supabase, id, 'pendente', 'confirmado');
        if (ok) {
          const res = await gravarComprasDaNota(deps.supabase, id).catch(() => ({ gravados: 0, pulados: 0 }));
          const sufMat = res.gravados === 0 ? ''
            : res.pulados > 0
              ? `\n📦 Guardei ${res.gravados} de ${res.gravados + res.pulados} preços (${res.pulados} ficaram de fora — faltou preço/nome).`
              : `\n📦 Guardei ${res.gravados} preço(s) pra comparar (manda "preço do <material>").`;
          const msgEntrada = row.tem_nota === false
            ? `💰 Entrada lançada: ${brl(Number(row.valor))} (sem nota — fora do imposto).`
            : `💰 Entrada lançada: ${brl(Number(row.valor))}.`;
          await deps.sendText(from, (row.tipo === 'despesa' ? `💸 Lançado: ${brl(Number(row.valor))}. Tá no caixa.` : msgEntrada) + sufMat);
        } else await deps.sendText(from, 'Esse lançamento já tinha sido processado.');
        return true;
      }
      case 'corr': {
        // Corrigir um lançamento JÁ registrado: volta pra pendente "aguardando" por 10 min;
        // o próximo texto mescla e re-registra (substituirPorCorrecao). Sem resposta, o
        // texto seguinte não-relacionado devolve ele pro caixa (soltarAguardando).
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status === 'apagado') { await deps.sendText(from, 'Esse lançamento já foi apagado.'); return true; }
        if (row.tipo === 'entrada' && row.conta_id) { await deps.sendText(from, MSG_ENTRADA_LIGADA); return true; }
        const eraConfirmado = row.status === 'confirmado';
        if (eraConfirmado) await reverterParaPendente(deps.supabase, id);
        await atualizarPendente(deps.supabase, id, { extracao: { ...row.extracao, aguardando: true, aguardando_desde: agoraIso(), era_confirmado: eraConfirmado } });
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
          await deps.sendText(from, MSG_ENTRADA_LIGADA);
          return true;
        }
        const ok = await mudarStatus(deps.supabase, id, 'confirmado', 'apagado');
        await deps.sendText(from, ok ? '🗑️ Apagado (fica no histórico, sai dos números).' : 'Esse já tinha sido apagado.');
        return true;
      }
      case 'vinc': {
        // finlan:vinc:<lancamentoId>:<contaId> — entrada casa com venda aberta.
        // Aceita pendente (legado) e confirmado sem conta (Fatia 1).
        if (!extra) { console.warn('[caixa-entrada] vinc sem contaId'); return true; }
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status === 'apagado' || (row.status === 'confirmado' && row.conta_id)) {
          await deps.sendText(from, 'Esse lançamento já foi processado.'); return true;
        }
        // Saldo ANTES do CAS: valor maior que o saldo da venda não confirma nada.
        const saldo = await getSaldoConta(deps.supabase, extra);
        if (saldo === null) { await deps.sendText(from, '⚠️ Essa venda não está mais em aberto.'); return true; }
        if (Number(row.valor) > saldo + 0.01) {
          await deps.sendWithButtons(from,
            `⚠️ O valor (${brl(Number(row.valor))}) é MAIOR que o saldo da venda (${brl(saldo)}). Lança como entrada avulsa ou corrige o valor:`,
            [
              { id: `finlan:avul:${id}`, title: 'Entrada avulsa' },
              { id: `finlan:corr:${id}`, title: 'Corrigir valor' },
              row.status === 'pendente' ? { id: `finlan:desc:${id}`, title: 'Descartar' } : { id: `finlan:apg:${id}`, title: 'Apagar' },
            ], FOOTER);
          return true;
        }
        // CAS no lançamento ANTES do dinheiro: clique duplo para aqui (1 recebimento só).
        // Crash depois do CAS deixa lançamento com conta SEM recebimento — faltando e
        // detectável, nunca duplicado (mesmo invariante da Fatia 2, contas.ts).
        const eraPendente = row.status === 'pendente';
        const ok = eraPendente
          ? await mudarStatus(deps.supabase, id, 'pendente', 'confirmado', { conta_id: extra })
          : await vincularContaSeLivre(deps.supabase, id, extra);
        if (!ok) { await deps.sendText(from, 'Esse lançamento já tinha sido processado.'); return true; }
        // Só o passo de DINHEIRO reverte — falha de envio de mensagem não desfaz recebimento já entrado.
        let r: Awaited<ReturnType<typeof registrarRecebimento>>;
        try {
          r = await registrarRecebimento(deps.supabase, extra, Number(row.valor));
        } catch (err) {
          // Compensação: falha no passo de dinheiro desfaz o CAS porteiro — nunca fica vínculo fantasma.
          if (eraPendente) await reverterParaPendente(deps.supabase, id);
          else await desvincularConta(deps.supabase, id);
          await deps.sendText(from, `❌ Não consegui registrar na venda (${(err as Error).message}). ${eraPendente ? 'O lançamento voltou pra pendente.' : 'O lançamento ficou no caixa, sem vínculo.'}`);
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
        await deps.sendWithButtons(from, msg.body, msg.buttons, FOOTER);
        return true;
      }
      case 'atv': {
        // finlan:atv:<lancamentoId>:<atividadeId> — entrada avulsa PJ: cria conta
        // avulsa + recebimento total imediato (motor Fatia 2 → imposto/RBT12 certos).
        if (!extra) { console.warn('[caixa-entrada] atv sem atividadeId'); return true; }
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status === 'apagado' || (row.status === 'confirmado' && row.conta_id)) {
          await deps.sendText(from, 'Esse lançamento já foi processado.'); return true;
        }
        const eraPendente = row.status === 'pendente';
        // Pendente (legado): CAS porteiro ANTES de criar a conta — clique duplo não cria 2ª conta.
        // Confirmado (Fatia 1): o CAS é o vínculo da conta (vincularContaSeLivre) logo abaixo;
        // um clique duplo cria conta órfã que a compensação cancela.
        if (eraPendente) {
          const ok = await mudarStatus(deps.supabase, id, 'pendente', 'confirmado');
          if (!ok) { await deps.sendText(from, 'Esse lançamento já tinha sido processado.'); return true; }
        }
        // Só o passo de DINHEIRO reverte — falha de envio de mensagem não desfaz recebimento já entrado.
        let contaId: string | undefined;
        let r: Awaited<ReturnType<typeof registrarRecebimento>>;
        try {
          ({ contaId } = await criarContaDeFechamento(deps.supabase, {
            fechamentoId: null, leadId: row.lead_id, atividadeId: extra,
            descricao: `Entrada avulsa — ${row.contraparte ?? row.descricao ?? 'sem descrição'}`,
            valor: Number(row.valor), createdBy: from,
          }));
          if (eraPendente) {
            await gravarContaNoLancamento(deps.supabase, id, contaId);
          } else if (!(await vincularContaSeLivre(deps.supabase, id, contaId))) {
            throw new Error('lançamento já vinculado a outra venda');
          }
          r = await registrarRecebimento(deps.supabase, contaId);
        } catch (err) {
          if (contaId) {
            // Conta avulsa órfã não pode ficar inflando o "A receber" — cancela
            // best-effort (o guard do cancelarConta protege se o dinheiro entrou).
            try { await cancelarConta(deps.supabase, contaId); } catch { /* manual */ }
          }
          // Compensação: falha no passo de dinheiro desfaz o CAS porteiro — nunca fica vínculo fantasma.
          if (eraPendente) await reverterParaPendente(deps.supabase, id);
          else await desvincularConta(deps.supabase, id);
          await deps.sendText(from, `❌ Não consegui registrar na venda (${(err as Error).message}). ${eraPendente ? 'O lançamento voltou pra pendente.' : 'O lançamento ficou no caixa, sem vínculo.'}`);
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
