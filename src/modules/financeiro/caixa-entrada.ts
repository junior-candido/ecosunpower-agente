// src/modules/financeiro/caixa-entrada.ts
// Orquestrador da Caixa de Entrada Universal (Fatia 1 "sem trava"): mídia/texto do
// ADMIN vira lançamento JÁ CONFIRMADO, com confiança. Botões servem só pra corrigir
// ou apagar DEPOIS (botoes-caixa.ts). Eva classifica (extrator + dicionário de
// favorecidos); imposto e "atividade" ficam pro fechamento do mês — nunca travam.
// Invariantes: NUNCA SOME (original só sai dos números com o corrigido dentro) e
// NUNCA CONTA 2× (duplicado por hash; vínculo de venda com CAS).
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  gateTextoFinanceiro, extrairDeTexto, extrairDeImagem, extrairDePdf, corrigirItensComTexto,
  type ExtracaoLancamento, type ItemNota,
} from './extrator-lancamento.js';
import { competenciaDe } from './lancamentos.js';
import {
  criarConfirmado, getLancamento, mudarStatus, atualizarPendente, restaurarApagado,
  getPendenteAguardando, getUltimoConfirmado, buscarConfirmadoPorContraparte,
  expirarPendentesAntigos, getCategorias, buscarContaAbertaPorNome,
  JANELA_AGUARDANDO_MS, type LancamentoRow,
} from './lancamentos-repo.js';
import { uploadComprovante } from './comprovantes.js';
import { classificar } from './classificar.js';
import { getFavorecidos } from './favorecidos.js';
import {
  montarConfirmacaoApagar, montarRegistrado, montarOfertaVinculoRegistrado,
  montarPedidoEsclarecimento, montarAberturaMultipla, type LancamentoResumo,
} from './resumo-lancamento.js';
import { parseValorReais } from './comando-imposto.js';
import { gravarComprasDaNota } from './materiais.js';
import { tamanhoBase64Bytes } from '../pdf-guard.js';
import { precisaFila, contarPaginas, enfileirar } from './arquivos-fila.js';

export const FOOTER = 'Caixa de Entrada · Financeiro';
export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const MSG_ENTRADA_LIGADA = '⚠️ Essa entrada está ligada a uma venda (recebimento e imposto já contados). Estorno é manual por enquanto — me chama que a gente ajusta no banco.';

export interface CaixaDeps {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  sendText: (to: string, text: string) => Promise<void>;
  // Botões: quem injeta decide (WABA com fallback texto). A Caixa não depende de WABA.
  sendWithButtons: (to: string, body: string, buttons: Array<{ id: string; title: string }>, footer?: string) => Promise<void>;
}
export type Categoria = { id: string; slug: string; nome: string };
export type Herdado = { storagePath: string | null; mimeType?: string | null; leadId: string | null; categoriaId: string | null };
export type Midia = { base64: string; mimeType: string; messageId: string };

// ---------------------------------------------------------------------------
// PUROS
// ---------------------------------------------------------------------------

// Uma entrada PJ com nota, ainda sem conta, precisa passar pelo motor de imposto (atividade).
// (Fatia 1: não é mais etapa do registro — usado só pelo botão legado "conf".)
export function entradaPrecisaImposto(row: { tipo: 'despesa' | 'entrada'; pf_pj: 'PF' | 'PJ' | 'FRONTEIRA' | null; conta_id: string | null; tem_nota: boolean }): boolean {
  return row.tipo === 'entrada' && row.pf_pj === 'PJ' && !row.conta_id && row.tem_nota !== false;
}

// Decide o que fazer com a lista extraída.
// lancar = itens financeiros a registrar; esclarecer = deu dinheiro mas nada extraído (nunca calar).
export function planejarCaptura(itens: ExtracaoLancamento[]): { lancar: ExtracaoLancamento[]; esclarecer: boolean } {
  const lancar = itens.filter((i) => i.financeiro);
  return { lancar, esclarecer: lancar.length === 0 };
}

// LEGADO — remover quando não houver pendente no banco. Pendente fica "aguardando"
// texto quando falta PF/PJ OU quando é nota com itens.
export function pendenteAguardaTexto(faltaPfPj: boolean, itens: unknown): boolean {
  return faltaPfPj || (Array.isArray(itens) && itens.length > 0);
}

// Com valor registra JÁ (tipo ausente vira despesa lá na frente); sem valor pergunta
// UMA vez e não cria nada. É a única "pergunta" do caminho automático.
export function decidirRegistro(e: { valor: number | null; tipo: 'despesa' | 'entrada' | null }): { acao: 'registrar' | 'perguntar_valor' } {
  return typeof e.valor === 'number' && e.valor > 0 ? { acao: 'registrar' } : { acao: 'perguntar_valor' };
}

// Botão Corrigir: o lançamento "era confirmado" se está confirmado AGORA ou se já
// tinha sido marcado antes (duplo toque não pode rebaixar true → false).
export function proximoEraConfirmado(statusAtual: LancamentoRow['status'], extracao: Record<string, unknown> | null): boolean {
  return statusAtual === 'confirmado' || extracao?.era_confirmado === true;
}

// Mescla o que o admin corrigiu com o que já estava no lançamento (só o que ele NÃO disse herda).
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

// "Não peguei o valor" → o admin responde só "380". Guarda a extração em memória (por
// admin, best-effort, processo único) e o número solto dentro da janela completa o registro.
export interface EsperandoValor { extracao: ExtracaoLancamento; midia: Midia | null; herdado?: Herdado; desde: number }
const esperandoValor = new Map<string, EsperandoValor>();

// Número solto dentro da janela → extração completa; senão null (expirou ou não é valor).
export function combinarValorSolto(guardado: EsperandoValor, texto: string, agora: number = Date.now()): ExtracaoLancamento | null {
  if (agora - guardado.desde > JANELA_AGUARDANDO_MS) return null;
  const valor = parseValorReais(texto);
  if (valor === null || valor <= 0) return null;
  return { ...guardado.extracao, valor, campos_faltando: guardado.extracao.campos_faltando.filter((c) => c !== 'valor') };
}

// Carimbo de quando a Eva PERGUNTOU — a janela de 10 min conta daqui, não da criação.
export const agoraIso = (): string => new Date().toISOString();

const hojeBRT = (): string => {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Helpers de I/O compartilhados (botões e legado usam)
// ---------------------------------------------------------------------------

export async function rowParaResumo(deps: CaixaDeps, row: LancamentoRow, cats?: Categoria[]): Promise<LancamentoResumo> {
  const lista = row.categoria_id ? (cats ?? await getCategorias(deps.supabase)) : [];
  return {
    id: row.id, tipo: row.tipo, valor: Number(row.valor), data_evento: row.data_evento,
    contraparte: row.contraparte, categoriaNome: lista.find((c) => c.id === row.categoria_id)?.nome ?? null,
    pf_pj: row.pf_pj, tem_nota: row.tem_nota,
  };
}

async function nomeLead(deps: CaixaDeps, leadId: string | null): Promise<string | null> {
  if (!leadId) return null;
  const { data } = await deps.supabase.from('leads').select('name').eq('id', leadId).maybeSingle();
  return (data as { name: string | null } | null)?.name ?? null;
}

// ---------------------------------------------------------------------------
// REGISTRO
// ---------------------------------------------------------------------------

// Registra JÁ CONFIRMADO a partir de uma extração e responde "✅ Registrei" + botões
// corrigir/apagar. Nunca cria pendente. Correção herda comprovante/categoria/obra do
// original — "o do posto era 350" não pode perder a foto da nota.
// Devolve o id criado (null se não registrou: sem valor ou duplicado).
export async function registrarEFalar(
  deps: CaixaDeps, from: string, e: ExtracaoLancamento,
  midia: Midia | null,
  herdado?: Herdado, arquivoId: string | null = null,
): Promise<string | null> {
  await expirarPendentesAntigos(deps.supabase); // varredura preguiçosa (sem cron)

  // Sem valor não tem registro — pergunta UMA vez; o número solto seguinte completa.
  // (Quem limpa a pergunta antiga é a captura, ANTES de processar a mensagem nova —
  // assim o item 2 com valor de uma mesma nota não apaga a pergunta do item 1.)
  if (decidirRegistro(e).acao === 'perguntar_valor') {
    esperandoValor.set(from, { extracao: e, midia, herdado, desde: Date.now() });
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
  const resumo: LancamentoResumo = row ? await rowParaResumo(deps, row, cats) : {
    id, tipo, valor, data_evento: dataEvento, contraparte: e.contraparte ?? cls.favorecido_nome,
    categoriaNome: cats.find((c) => c.id === categoriaId)?.nome ?? null, pf_pj: mundo, tem_nota: e.tem_nota,
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

// ---------------------------------------------------------------------------
// CORREÇÃO
// ---------------------------------------------------------------------------

// Correção: apaga (soft) o original e registra o corrigido JÁ confirmado. O índice de
// duplicidade ignora apagados — por isso o original sai ANTES. Se o corrigido NÃO entrar
// (erro ou duplicado com outro), o original VOLTA: nunca some. Devolve o id novo ou null.
export async function substituirPorCorrecao(deps: CaixaDeps, from: string, alvo: LancamentoRow, corrigido: ExtracaoLancamento): Promise<string | null> {
  const de = alvo.status === 'pendente' ? 'pendente' : 'confirmado';
  const volta = alvo.status === 'confirmado' || alvo.extracao?.era_confirmado === true ? 'confirmado' : 'pendente';
  await mudarStatus(deps.supabase, alvo.id, de, 'apagado',
    { descricao: `${alvo.descricao ?? ''} [substituído por correção]`.trim() });
  let novo: string | null = null;
  try {
    // mime_type não está no row — o storage_path basta (extensão implícita no path).
    novo = await registrarEFalar(deps, from, corrigido, null,
      { storagePath: alvo.storage_path, mimeType: undefined, leadId: alvo.lead_id, categoriaId: alvo.categoria_id });
  } finally {
    if (!novo) {
      try {
        await restaurarApagado(deps.supabase, alvo.id, volta, alvo.descricao);
        await deps.sendText(from, '⚠️ A correção não entrou — o original continua no caixa como estava.');
      } catch (err) {
        console.error('[caixa-entrada] restaurar original falhou:', (err as Error).message);
      }
    }
  }
  return novo;
}

// Pendente "aguardando" que era confirmado (botão Corrigir) volta pro caixa quando a
// resposta NÃO era correção — nunca fica pendente órfão esperando o GC.
async function soltarAguardando(deps: CaixaDeps, pend: LancamentoRow): Promise<void> {
  const extracao = { ...pend.extracao, aguardando: false };
  if (pend.extracao?.era_confirmado === true) {
    await mudarStatus(deps.supabase, pend.id, 'pendente', 'confirmado', { extracao });
  } else {
    await atualizarPendente(deps.supabase, pend.id, { extracao });
  }
}

// ---------------------------------------------------------------------------
// CAPTURA (chamadas pelo index.ts)
// ---------------------------------------------------------------------------

// Contador do que já entrou: se der erro no meio, o admin fica sabendo o que ficou
// de fora e a mensagem NÃO volta pro cérebro de conversa (já produziu efeito).
function contador(deps: CaixaDeps, from: string) {
  let registrados = 0;
  let atual: ExtracaoLancamento | null = null;
  const reg = async (e: ExtracaoLancamento, midia: Midia | null = null, herdado?: Herdado): Promise<string | null> => {
    atual = e;
    const id = await registrarEFalar(deps, from, e, midia, herdado);
    if (id) registrados++;
    return id;
  };
  const corrigir = async (alvo: LancamentoRow, corrigido: ExtracaoLancamento): Promise<void> => {
    atual = corrigido;
    if (await substituirPorCorrecao(deps, from, alvo, corrigido)) registrados++;
  };
  // Devolve true quando o erro deve ser considerado "tratado" (algo já entrou).
  const falhou = async (err: unknown): Promise<boolean> => {
    if (registrados === 0) return false;
    const a = atual as ExtracaoLancamento | null;
    const item = a ? [a.contraparte, a.descricao, a.valor !== null ? brl(a.valor) : null].filter(Boolean).join(' · ') : '?';
    try {
      await deps.sendText(from, `⚠️ Registrei ${registrados} lançamento(s); deu erro em "${item}": ${(err as Error).message}. Me manda esse de novo.`);
    } catch { /* melhor esforço */ }
    return true;
  };
  return { reg, corrigir, falhou };
}

// Guarda a mídia na fila (Storage + linha 'fila'); o tick lê em segundo plano.
async function enfileirarMidia(deps: CaixaDeps, from: string, midia: Midia, bytes: number, paginas: number): Promise<string> {
  return enfileirar(deps.supabase, {
    base64: midia.base64, mimeType: midia.mimeType, bytes, paginas, origem: 'zap',
    enviadoPor: from, messageId: midia.messageId, competencia: hojeBRT().slice(0, 7),
  });
}

// Mídia de admin (imagem/pdf). Retorna true se tratou (era financeiro ou foi pra fila).
// Regra: nada pesado é lido dentro do webhook — PDF com 2+ páginas ou arquivo
// acima do limite vai pra fila e o admin recebe "recebi"; o resto lê na hora.
export async function tryHandleFinanceiroMedia(
  deps: CaixaDeps, from: string, midia: Midia, kind: 'imagem' | 'pdf',
): Promise<boolean> {
  const c = contador(deps, from);
  const bytes = tamanhoBase64Bytes(midia.base64);
  let paginas = 1;
  try {
    if (kind === 'pdf') paginas = await contarPaginas(midia.base64);
    if (precisaFila({ bytes, paginas, mime: midia.mimeType })) {
      await enfileirarMidia(deps, from, midia, bytes, paginas);
      await deps.sendText(from, `📥 Recebi (${paginas} pág., ${(bytes / 1e6).toFixed(1)} MB). Vou ler em segundo plano e te aviso.`);
      return true;
    }
    const hoje = hojeBRT();
    const lista = kind === 'pdf'
      ? await extrairDePdf(deps.anthropic, midia.base64, hoje)
      : await extrairDeImagem(deps.anthropic, midia.base64, midia.mimeType, hoje);
    const { lancar } = planejarCaptura(lista);
    if (lancar.length === 0) return false; // comprovante não-financeiro → fluxo normal
    esperandoValor.delete(from); // mensagem financeira nova: a pergunta antiga não vale mais
    for (let i = 0; i < lancar.length; i++) {
      await c.reg(lancar[i], i === 0 ? midia : null);
    }
    return true;
  } catch (err) {
    console.error('[caixa-entrada] midia falhou:', (err as Error).message);
    // NUNCA SOME: o que não deu pra ler agora vai pra fila e o tick tenta de novo.
    try {
      await enfileirarMidia(deps, from, midia, bytes, paginas);
      await deps.sendText(from, '📥 Guardei o arquivo; vou tentar ler em segundo plano.');
      return true;
    } catch (err2) {
      console.error('[caixa-entrada] enfileirar após falha também falhou:', (err2 as Error).message);
    }
    return c.falhou(err); // nada entrou → fluxo normal (nunca trava a Eva)
  }
}

// Texto de admin (inclui transcrição de áudio/vídeo). Retorna true se tratou.
export async function tryHandleFinanceiroTexto(deps: CaixaDeps, from: string, texto: string): Promise<boolean> {
  const c = contador(deps, from);
  try {
    // 0) Eva perguntou o valor há menos de 10 min e veio só o número → completa o registro.
    const guardado = esperandoValor.get(from);
    if (guardado) {
      const completo = combinarValorSolto(guardado, texto);
      if (completo) {
        esperandoValor.delete(from);
        await c.reg(completo, guardado.midia, guardado.herdado);
        return true;
      }
      if (Date.now() - guardado.desde > JANELA_AGUARDANDO_MS) esperandoValor.delete(from);
    }

    // 1) Eva PERGUNTOU algo há menos de 10 min (botão Corrigir)? Só aí o texto é resposta.
    const aguardando = await getPendenteAguardando(deps.supabase, from);
    if (aguardando) {
      // Nota com itens: o texto corrige os itens ("a curva é 7,00") e o lançamento
      // corrigido entra JÁ confirmado (nunca escorrega pro cérebro de conversa).
      const itensAtuais = Array.isArray(aguardando.extracao?.itens)
        ? (aguardando.extracao!.itens as ItemNota[]) : [];
      if (itensAtuais.length > 0) {
        const itensCorrigidos = await corrigirItensComTexto(deps.anthropic, itensAtuais, texto, hojeBRT());
        await c.corrigir(aguardando, mesclarCorrecao(aguardando, { itens: itensCorrigidos }));
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
        esperandoValor.delete(from);
        await c.reg(e);
        for (const x of extras) await c.reg(x);
        return true;
      }
      if (e) {
        await c.corrigir(aguardando, mesclarCorrecao(aguardando, e));
        for (const x of extras) await c.reg(x);
        return true;
      }
      await soltarAguardando(deps, aguardando);
      return false;
    }

    // 1.5) Número solto (ex: "16mil", "30000", "R$ 30 mil") NÃO é lançamento.
    // Sem contexto (verbo/quem/categoria) é ambíguo — costuma ser cálculo de
    // imposto ou outra coisa. Nunca vira gasto/entrada sem o admin dizer mais.
    // (A resposta à pergunta de valor já foi tratada no passo 0.)
    if (parseValorReais(texto) !== null) return false;

    // 2) Gate barato: é assunto financeiro?
    if (!(await gateTextoFinanceiro(deps.anthropic, texto))) return false;

    // 3) Extração completa (lista de eventos)
    const lista = await extrairDeTexto(deps.anthropic, texto, hojeBRT());
    const { lancar, esclarecer } = planejarCaptura(lista);

    // Rede de segurança: gate disse dinheiro mas não saiu nada → pergunta (nunca cala).
    if (esclarecer) { await deps.sendText(from, montarPedidoEsclarecimento()); return true; }
    esperandoValor.delete(from); // mensagem financeira nova: a pergunta antiga não vale mais

    // apagar/corrigir = intenção de alvo único → trata o 1º item pelo caminho de hoje.
    const primeiro = lancar[0];
    const extras = lancar.slice(1); // itens além do 1º (ex.: "apaga o do posto, paguei 380")
    const lancarExtras = async () => { for (const x of extras) await c.reg(x); };
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
      // Correção = apaga o antigo (soft) + registra o corrigido JÁ confirmado (com volta se falhar).
      const corrigido: ExtracaoLancamento = {
        ...primeiro, intencao: 'lancar',
        tipo: primeiro.tipo ?? alvo.tipo,
        valor: primeiro.valor ?? Number(alvo.valor),
        data: primeiro.data ?? alvo.data_evento,
        contraparte: primeiro.contraparte ?? alvo.contraparte,
        pf_pj: primeiro.pf_pj ?? alvo.pf_pj,
      };
      await c.corrigir(alvo, corrigido);
      await lancarExtras(); return true;
    }

    // lançamento(s) novo(s): se for mais de um, abre avisando quantos.
    if (lancar.length > 1) await deps.sendText(from, montarAberturaMultipla(lancar.length));
    for (const e of lancar) await c.reg(e);
    return true;
  } catch (err) {
    console.error('[caixa-entrada] texto falhou:', (err as Error).message);
    return c.falhou(err);
  }
}
