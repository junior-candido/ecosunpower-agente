// src/modules/dashboard/command-center-queries.ts
// Leituras do Command Center (fase B). Cada FONTE é isolada: se falha, vira
// `null` (a tela mostra "—") e entra na lista de fontes com o estado
// "falhou" — a Central de Atenção nunca diz "tudo em dia" quando não conseguiu ler.
//
// TENANT-SAFE: TODA consulta leva `.eq('company_id', companyId)` no código
// (dupla tranca com o RLS do bancoDoOperador, que pode estar desligado e cair
// no cliente de serviço).
//
// ACESSO = papel do usuário E módulo contratado pela empresa (empresa_modulos,
// migration 128). Bloco que não passa nas duas nem é consultado. Bloco não
// contratado vira vitrine (cadeado) na tela; contratado sem papel vira "sem acesso".

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCommandCenterKpis, extrairValorTotal, VENDA_STATUSES, type CommandCenterKpis } from './queries.js';
import {
  janelaBrasilia, resumirFrota, somarDias,
  type ResumoFrota, type UsinaLinha, type GeracaoLinha, type TelemetriaLinha,
} from './command-center-calc.js';
import {
  eventosDeUsinas, eventosDeLeadsEsperando, eventosDeSlaVencido, eventosDePropostas,
  eventosDeCreditosGd, eventosDeManutencao, eventosDeContas,
  type ContagemComMaisAntigo, type PropostaParaAtencao, type CreditoGdParaAtencao,
} from './central-atencao-fontes.js';
import type { EventoAtencao } from './central-atencao.js';
import { statusAgendaItem } from './manutencao-motor.js';
import { empresaDe } from '../empresa-config.js';
import { tarifaPorConcessionaria } from '../solar-params.js';
import { competenciaAtual } from '../financeiro/repo.js';
import { lerModulosAtivos } from './modulos-contratados.js';
import type { ContaAberta } from '../financeiro/alertas-vencimento.js';

/** Lead "esperando resposta": a Eva está ativa, o lead não saiu, está no começo
 *  do funil e ninguém mexeu nele há mais de 24 h. Regra ÚNICA da Central de
 *  Atenção (veio do Cockpit antigo, aposentado na faxina pós-renovação). */
export const CRITERIO_LEAD_ESPERANDO = {
  status: ['novo', 'qualificando', 'qualificado'],
  horas: 24,
} as const;

/** Blocos do Command Center. O&M e Instalações seguem `usinas` (mesmo papel, mesmo módulo). */
export interface PermissoesCC { usinas: boolean; leads: boolean; propostas: boolean; financeiro: boolean; marketing: boolean }
export type BlocoCC = keyof PermissoesCC;
export const TODAS_PERMISSOES: PermissoesCC = { usinas: true, leads: true, propostas: true, financeiro: true, marketing: true };
export const NENHUM_MODULO: PermissoesCC = { usinas: false, leads: false, propostas: false, financeiro: false, marketing: false };

/** Bloco → módulo contratado (empresa_modulos.modulo). Leads e propostas vêm da assistente ("eva"). */
export const MODULO_DO_BLOCO: Readonly<Record<BlocoCC, string>> = {
  usinas: 'monitoramento', leads: 'eva', propostas: 'eva', financeiro: 'financeiro', marketing: 'marketing',
};

/** Os dois portões juntos: papel E contrato. */
export function combinarAcesso(papel: PermissoesCC, contratados: PermissoesCC): PermissoesCC {
  return {
    usinas: papel.usinas && contratados.usinas,
    leads: papel.leads && contratados.leads,
    propostas: papel.propostas && contratados.propostas,
    financeiro: papel.financeiro && contratados.financeiro,
    marketing: papel.marketing && contratados.marketing,
  };
}

/** Módulos ativos da empresa → blocos do Command Center. */
export function blocosContratados(ativos: ReadonlySet<string>): PermissoesCC {
  const out = { ...NENHUM_MODULO };
  for (const b of Object.keys(MODULO_DO_BLOCO) as BlocoCC[]) out[b] = ativos.has(MODULO_DO_BLOCO[b]);
  return out;
}

/**
 * O que a empresa contratou, em blocos do Command Center. A regra (EcoSun tem
 * tudo sem ler a tabela; erro/exceção → tudo desligado, fail-closed) mora em
 * UM lugar só: lerModulosAtivos (modulos-contratados.ts), a mesma do menu e da
 * trava das rotas.
 */
export async function lerModulosContratados(db: SupabaseClient, companyId: string): Promise<PermissoesCC> {
  return blocosContratados(await lerModulosAtivos(db, companyId));
}

/** Fontes de aviso da Central de Atenção (painel "De onde vêm os avisos"). */
export type IdFonte = 'usinas' | 'leads_esperando' | 'sla' | 'propostas' | 'gd' | 'manutencao' | 'contas';
export type EstadoFonte = 'ok' | 'falhou' | 'sem_acesso' | 'nao_contratado';
export interface FonteAviso { id: IdFonte; rotulo: string; estado: EstadoFonte }

export const ROTULO_FONTE: Record<IdFonte, string> = {
  usinas: 'Usinas paradas, abaixo do esperado ou sem comunicação',
  leads_esperando: 'Leads esperando resposta (mais de 24 h)',
  sla: 'Prazos das tarefas dos leads',
  propostas: 'Propostas paradas (72 h)',
  gd: 'Créditos GD perto de vencer',
  manutencao: 'Manutenção vencida',
  contas: 'Contas a pagar',
};
/** Nome curto, pra frase "Nenhum aviso de …". */
export const NOME_CURTO_FONTE: Record<IdFonte, string> = {
  usinas: 'usinas', leads_esperando: 'leads esperando', sla: 'prazos dos leads', propostas: 'propostas',
  gd: 'créditos GD', manutencao: 'manutenção', contas: 'contas a pagar',
};
/** De qual bloco (papel + módulo) cada fonte depende. */
export const BLOCO_DA_FONTE: Record<IdFonte, BlocoCC> = {
  usinas: 'usinas', leads_esperando: 'leads', sla: 'leads', propostas: 'propostas', gd: 'usinas', manutencao: 'usinas', contas: 'financeiro',
};
const ORDEM_FONTES: IdFonte[] = ['usinas', 'leads_esperando', 'sla', 'propostas', 'gd', 'manutencao', 'contas'];

export interface DadosCommandCenter {
  agora: Date;
  /** O que o usuário pode ver de fato (papel E módulo contratado). */
  permissoes: PermissoesCC;
  /** O que a empresa contratou (o resto vira vitrine com cadeado). */
  contratados: PermissoesCC;
  /** null = falhou ou sem acesso. */
  frota: ResumoFrota | null;
  /** Algum lote da telemetria bateu o limite: "Geração agora" pode estar incompleta. */
  telemetriaCortada: boolean;
  /** Contagens do mês (cada campo null se falhou ou sem acesso). */
  kpisMes: CommandCenterKpis;
  /** Desde ontem neste horário (últimas 24 h). */
  mudancas24h: { leads: number | null; propostas: number | null; vendas: number | null };
  /** Faturamento RECEBIDO no mês (mesma conta da tela Financeiro). */
  recebidoMes: number | null;
  manutencao: { vencidas: number; proximas30: number } | null;
  eventos: EventoAtencao[];
  fontes: FonteAviso[];
}

export interface OpcoesCarga {
  /** Módulos contratados. Ausente = todos (quem chama sem saber, ex.: testes antigos). */
  contratados?: PermissoesCC;
  /** Contas a pagar PF (pessoais do dono) só pro admin. Padrão: só PJ. */
  verContasPF?: boolean;
}

/** Status de lead que já saiu do funil ativo (fechou ou perdeu). */
const LEAD_ENCERRADO = new Set<string>([...VENDA_STATUSES, 'ganho', 'perdido', 'cliente_fechado']);

const TAMANHO_PAGINA = 1000;
/** Teto de linhas numa leitura paginada (~1.300 usinas × 31 dias ≈ 40 mil). Acima disso a fonte "não carrega". */
export const MAX_LINHAS = 200_000;
const PAGINAS_EM_PARALELO = 5;
/** Ids por consulta de telemetria (URL do PostgREST não pode crescer sem fim). */
const IDS_POR_LOTE = 150;
export const LIMITE_TELEMETRIA = 5000;

export type Consulta<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
export type ConsultaContagem = PromiseLike<{ data?: unknown; count: number | null; error: { message: string } | null }>;
export const CONTAGEM = { count: 'exact' as const, head: true };

/** Roda as tarefas em ondas de `n` ao mesmo tempo (não derruba o banco com 40 consultas juntas). */
async function emOndas<T>(tarefas: Array<() => Promise<T>>, n: number): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < tarefas.length; i += n) out.push(...await Promise.all(tarefas.slice(i, i + n).map((t) => t())));
  return out;
}

/**
 * Lê tudo: conta exata antes (1 consulta "head"), depois as páginas em ondas
 * paralelas. Erro em QUALQUER página lança: soma parcial nunca vira número.
 * Acima de MAX_LINHAS lança também (a fonte vira "não carregou").
 */
export async function lerTudo<T>(
  l: { contar: () => ConsultaContagem; pagina: (de: number, ate: number) => Consulta<T> },
  contexto: string,
): Promise<T[]> {
  const { count, error } = await l.contar();
  if (error) throw new Error(`${contexto} (contagem): ${error.message}`);
  if (typeof count !== 'number' || !Number.isFinite(count)) throw new Error(`${contexto}: contagem não veio`);
  if (count > MAX_LINHAS) throw new Error(`${contexto}: ${count} linhas, acima do teto de ${MAX_LINHAS} — não dá pra somar tudo`);
  const paginas = Math.ceil(count / TAMANHO_PAGINA);
  const partes = await emOndas(Array.from({ length: paginas }, (_, p) => async () => {
    const de = p * TAMANHO_PAGINA;
    const { data, error: e } = await l.pagina(de, de + TAMANHO_PAGINA - 1);
    if (e) throw new Error(`${contexto}: ${e.message}`);
    return data ?? [];
  }), PAGINAS_EM_PARALELO);
  return partes.flat();
}

async function lerUma<T>(consulta: Consulta<T>, contexto: string): Promise<T[]> {
  const { data, error } = await consulta;
  if (error) throw new Error(`${contexto}: ${error.message}`);
  return data ?? [];
}

/** Recebe a consulta como função: até o `db.from` lançar vira null, não derruba a tela. */
async function contar(consulta: () => ConsultaContagem, contexto: string): Promise<number | null> {
  try {
    const { count, error } = await consulta();
    if (error) { console.error(`[command-center] ${contexto}:`, error.message); return null; }
    return typeof count === 'number' && Number.isFinite(count) ? count : null;
  } catch (err) {
    console.error(`[command-center] ${contexto} lançou:`, (err as Error).message);
    return null;
  }
}

/** Roda uma fonte isolada: erro vira null (e é logado), nunca derruba a tela. */
async function tentar<T>(contexto: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[command-center] ${contexto} falhou:`, (err as Error).message);
    return null;
  }
}

const numOuNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** 'AAAA-MM-01' de N meses antes do mês da data. */
function inicioMesAntes(iso: string, meses: number): string {
  const [a, m] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 - meses, 1));
  return d.toISOString().slice(0, 10);
}

function fatiar<T>(lista: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}

export async function carregarCommandCenter(
  db: SupabaseClient,
  companyId: string,
  agora: Date,
  permissoes: PermissoesCC,
  opcoes: OpcoesCarga = {},
): Promise<DadosCommandCenter> {
  const j = janelaBrasilia(agora);
  const agoraMs = agora.getTime();
  const agoraIso = agora.toISOString();
  const desde24h = new Date(agoraMs - 24 * 3_600_000).toISOString();
  const cfg = empresaDe(companyId);
  const C = { ...TODAS_PERMISSOES, ...(opcoes.contratados ?? {}) };
  // Mesmo que quem chama passe só o papel, o contrato tranca aqui também.
  const P = combinarAcesso({ ...NENHUM_MODULO, ...permissoes }, C);

  // --- Usinas (frota + telemetria) ---------------------------------------
  const frotaP = P.usinas ? tentar('usinas', async () => {
    const usinasDb = (sel: string, o?: typeof CONTAGEM) => db.from('sistemas_clientes').select(sel, o)
      .eq('company_id', companyId).eq('ativo', true);
    const inicioGeracao = j.inicioMes < j.ha30 ? j.inicioMes : j.ha30;
    const geracaoDb = (sel: string, o?: typeof CONTAGEM) => db.from('geracao_diaria').select(sel, o)
      .eq('company_id', companyId).gte('data', inicioGeracao).lte('data', j.hoje);

    const usinasP = lerTudo<UsinaLinha>({
      contar: () => usinasDb('id', CONTAGEM),
      pagina: (de, ate) => usinasDb('id, apelido, potencia_kwp, cidade, uf, ativo, ultima_sincronizacao, ultimo_erro, status_inversor, acompanhamento')
        .order('id', { ascending: true }).range(de, ate) as unknown as Consulta<UsinaLinha>,
    }, 'sistemas_clientes');
    const geracoesP = lerTudo<GeracaoLinha>({
      contar: () => geracaoDb('sistema_id', CONTAGEM),
      pagina: (de, ate) => geracaoDb('sistema_id, data, geracao_kwh')
        .order('sistema_id', { ascending: true }).order('data', { ascending: true }).range(de, ate) as unknown as Consulta<GeracaoLinha>,
    }, 'geracao_diaria');
    // Geração ao vivo é bônus: se a telemetria falhar, o resto da frota segue (e "Geração agora" fica "—").
    // Filtra pelas usinas ativas pra usar o índice (sistema_id, device_key, ponto, ts).
    const telemetriaP = usinasP.then((us) => tentar('telemetria', async () => {
      const ids = us.map((u) => u.id);
      if (!ids.length) return { linhas: [] as TelemetriaLinha[], cortada: false };
      const desde = new Date(agoraMs - 30 * 60_000).toISOString();
      const lotes = await emOndas(fatiar(ids, IDS_POR_LOTE).map((lote) => () => lerUma<TelemetriaLinha>(db.from('telemetria_medicoes')
        .select('sistema_id, device_key, valor, ts')
        .eq('company_id', companyId).eq('ponto', 'potencia').in('sistema_id', lote)
        .gte('ts', desde)
        .order('ts', { ascending: false }).limit(LIMITE_TELEMETRIA) as unknown as Consulta<TelemetriaLinha>, 'telemetria_medicoes')), PAGINAS_EM_PARALELO);
      const cortada = lotes.some((l) => l.length >= LIMITE_TELEMETRIA);
      if (cortada) console.warn(`[command-center] telemetria: um lote bateu o limite de ${LIMITE_TELEMETRIA} linhas — "Geração agora" pode estar incompleta`);
      return { linhas: lotes.flat(), cortada };
    }), () => null);

    const [usinas, geracoes, telemetria] = await Promise.all([usinasP, geracoesP, telemetriaP]);
    return {
      resumo: resumirFrota(usinas, geracoes, telemetria?.linhas ?? [], { agora, corteAtencao: cfg.reguaAtencaoPct / 100 }),
      telemetriaCortada: telemetria?.cortada ?? false,
    };
  }) : Promise.resolve(null);

  // --- Comercial (contagens) -------------------------------------------
  // Marketing mostra "leads do mês": a contagem roda se leads OU marketing puder ver.
  const kpisP = tentar('kpis do mês', () => fetchCommandCenterKpis(db, companyId, agora, {
    leads: P.leads || P.marketing, propostas: P.propostas, vendas: P.leads, usinasNovas: P.usinas,
  }));
  const mudancasP = Promise.all([
    P.leads ? contar(() => db.from('leads').select('id', CONTAGEM)
      .eq('company_id', companyId).gte('created_at', desde24h), 'leads 24 h') : Promise.resolve(null),
    P.propostas ? contar(() => db.from('propostas_publicas').select('id', CONTAGEM)
      .eq('company_id', companyId).eq('revoked', false).gte('created_at', desde24h), 'propostas 24 h') : Promise.resolve(null),
    P.leads ? contar(() => db.from('leads').select('id', CONTAGEM)
      .eq('company_id', companyId).gte('contract_signed_at', desde24h), 'vendas 24 h') : Promise.resolve(null),
  ]);

  const leadsEsperandoP = P.leads ? tentar('leads esperando', async (): Promise<ContagemComMaisAntigo> => {
    const desde = new Date(agoraMs - CRITERIO_LEAD_ESPERANDO.horas * 3_600_000).toISOString();
    const { data, count, error } = await db.from('leads')
      .select('updated_at', { count: 'exact' })
      .eq('company_id', companyId).eq('eva_active', true).eq('opt_out', false)
      .in('status', [...CRITERIO_LEAD_ESPERANDO.status]).lt('updated_at', desde)
      .order('updated_at', { ascending: true }).limit(1);
    if (error) throw new Error(error.message);
    if (typeof count !== 'number') throw new Error('contagem não veio');
    const primeiro = (data ?? [])[0] as { updated_at?: string } | undefined;
    return { total: count, maisAntigo: primeiro?.updated_at ?? null };
  }) : Promise.resolve(null);

  const tarefasP = P.leads ? tentar('tarefas SLA', () => {
    const tarefasDb = (sel: string, o?: typeof CONTAGEM) => db.from('lead_tarefas').select(sel, o)
      .eq('company_id', companyId).eq('status', 'pendente').lt('due_at', agoraIso);
    return lerTudo<{ id: string; lead_id: string; due_at: string }>({
      contar: () => tarefasDb('id', CONTAGEM),
      pagina: (de, ate) => tarefasDb('id, lead_id, due_at')
        .order('due_at', { ascending: true }).order('id', { ascending: true }).range(de, ate) as unknown as Consulta<{ id: string; lead_id: string; due_at: string }>,
    }, 'lead_tarefas');
  }) : Promise.resolve(null);

  type PropostaLinha = {
    id: string; lead_id: string | null; created_at: string; sent_to_client_at: string | null; ultimo_acesso_at: string | null;
    cliente_respondeu_at: string | null; revoked: boolean; expires_at: string | null; dados_input: unknown;
  };
  // SEM pré-filtro de revogada/respondida: primeiro fica a MAIS RECENTE de cada
  // lead, depois o filtro decide. Senão a antiga (sem resposta) apareceria
  // "parada" quando o cliente respondeu a nova.
  const LIMITE_PROPOSTAS = 500;
  const propostasP = P.propostas ? tentar('propostas', async () => {
    const linhas = await lerUma<PropostaLinha>(db.from('propostas_publicas')
      .select('id, lead_id, created_at, sent_to_client_at, ultimo_acesso_at, cliente_respondeu_at, revoked, expires_at, dados_input')
      .eq('company_id', companyId)
      .gte('created_at', new Date(agoraMs - 60 * 86_400_000).toISOString())
      .order('created_at', { ascending: false }).limit(LIMITE_PROPOSTAS) as unknown as Consulta<PropostaLinha>, 'propostas_publicas');
    if (linhas.length >= LIMITE_PROPOSTAS) console.warn(`[command-center] propostas: bateu o limite de ${LIMITE_PROPOSTAS} (60 dias) — as mais antigas ficaram de fora`);
    return linhas;
  }) : Promise.resolve(null);

  // --- Usinas: GD e manutenção ------------------------------------------
  const gdP = P.usinas ? tentar('créditos GD', async (): Promise<CreditoGdParaAtencao[]> => {
    type Linha = { instalacao: string; cliente_nome: string | null; referencia: string; proximo_expirar_kwh: unknown; ciclo_expirar: string | null };
    const gdDb = (sel: string, o?: typeof CONTAGEM) => db.from('demonstrativos_gd').select(sel, o)
      .eq('company_id', companyId).gte('referencia', inicioMesAntes(j.hoje, 12));
    const linhas = await lerTudo<Linha>({
      contar: () => gdDb('instalacao', CONTAGEM),
      pagina: (de, ate) => gdDb('instalacao, cliente_nome, referencia, proximo_expirar_kwh, ciclo_expirar')
        .order('referencia', { ascending: false }).order('instalacao', { ascending: true }).range(de, ate) as unknown as Consulta<Linha>,
    }, 'demonstrativos_gd');
    // Vale o demonstrativo MAIS RECENTE de cada UC (a lista vem do mais novo pro mais velho).
    const ultimo = new Map<string, CreditoGdParaAtencao>();
    for (const l of linhas) {
      if (ultimo.has(l.instalacao)) continue;
      ultimo.set(l.instalacao, {
        instalacao: l.instalacao, clienteNome: l.cliente_nome?.trim() || `UC ${l.instalacao}`,
        proximoExpirarKwh: numOuNull(l.proximo_expirar_kwh), cicloExpirar: l.ciclo_expirar,
      });
    }
    return [...ultimo.values()];
  }) : Promise.resolve(null);

  const manutP = P.usinas ? tentar('manutenção', () => lerUma<{ id: string; data_agendada: string | null }>(db.from('manutencoes')
    .select('id, data_agendada')
    .eq('company_id', companyId).eq('status', 'agendada').lte('data_agendada', somarDias(j.hoje, 30))
    .limit(2000) as unknown as Consulta<{ id: string; data_agendada: string | null }>, 'manutencoes')) : Promise.resolve(null);

  // --- Financeiro --------------------------------------------------------
  const recebidoP = P.financeiro ? tentar('recebido no mês', async () => {
    const recDb = (sel: string, o?: typeof CONTAGEM) => db.from('financeiro_recebimentos').select(sel, o)
      .eq('company_id', companyId).eq('competencia', competenciaAtual(agora));
    const linhas = await lerTudo<{ valor: unknown }>({
      contar: () => recDb('id', CONTAGEM),
      pagina: (de, ate) => recDb('valor').order('id', { ascending: true }).range(de, ate) as unknown as Consulta<{ valor: unknown }>,
    }, 'financeiro_recebimentos');
    return Math.round(linhas.reduce((s, l) => s + (numOuNull(l.valor) ?? 0), 0) * 100) / 100;
  }) : Promise.resolve(null);

  const contasP = P.financeiro ? tentar('contas a pagar', async (): Promise<ContaAberta[]> => {
    type Linha = { id: string; descricao: string; valor: unknown; vencimento: string; mundo: 'PJ' | 'PF'; categoria_slug: string | null };
    let q = db.from('financeiro_contas_a_pagar')
      .select('id, descricao, valor, vencimento, mundo, categoria_slug')
      .eq('company_id', companyId).eq('status', 'aberta');
    // Conta PF é a vida pessoal do dono: só o admin vê.
    if (!opcoes.verContasPF) q = q.eq('mundo', 'PJ');
    const linhas = await lerUma<Linha>(q.lte('vencimento', somarDias(j.hoje, 3))
      .order('vencimento', { ascending: true }).limit(500) as unknown as Consulta<Linha>, 'financeiro_contas_a_pagar');
    return linhas.map((c) => ({ ...c, valor: numOuNull(c.valor) ?? NaN, lembretes: [] }));
  }) : Promise.resolve(null);

  const [frotaR, kpisMes, [leads24, propostas24, vendas24], leadsEsperando, tarefas, propostasTodas, gd, manut, recebidoMes, contas] =
    await Promise.all([frotaP, kpisP, mudancasP, leadsEsperandoP, tarefasP, propostasP, gdP, manutP, recebidoP, contasP]);
  const frota = frotaR?.resumo ?? null;

  // Proposta refeita (reajuste, nova versão): vale só a MAIS RECENTE de cada lead
  // (a lista vem da mais nova pra mais velha).
  const vistos = new Set<string>();
  const propostas = propostasTodas?.filter((p) => {
    if (!p.lead_id) return true;
    if (vistos.has(p.lead_id)) return false;
    vistos.add(p.lead_id);
    return true;
  }) ?? null;

  // Status dos leads das tarefas e propostas — pra não cobrar tarefa/proposta de
  // quem já fechou ou foi perdido. Só com permissão de leads; sem ela, as
  // propostas contam sem essa checagem (a lista de leads não é lida).
  const idsLeads = P.leads ? [...new Set([...(tarefas ?? []).map((t) => t.lead_id), ...(propostas ?? []).map((p) => p.lead_id)]
    .filter((x): x is string => typeof x === 'string' && x.length > 0))] : [];
  const statusLead = idsLeads.length ? await tentar('status dos leads', async () => {
    const lotes = await emOndas(fatiar(idsLeads, 200).map((lote) => () => lerUma<{ id: string; status: string | null }>(db.from('leads')
      .select('id, status').eq('company_id', companyId).in('id', lote) as unknown as Consulta<{ id: string; status: string | null }>, 'leads (status)')), PAGINAS_EM_PARALELO);
    const m = new Map<string, string>();
    for (const l of lotes.flat()) if (l.status) m.set(l.id, l.status);
    return m;
  }) : new Map<string, string>();
  const encerrado = (leadId: string | null) => !!leadId && !!statusLead && LEAD_ENCERRADO.has(statusLead.get(leadId) ?? '');

  // --- Avisos -------------------------------------------------------------
  const eventos: EventoAtencao[] = [];
  const estado = new Map<IdFonte, EstadoFonte>();
  const marcar = (id: IdFonte, ok: boolean) => {
    const b = BLOCO_DA_FONTE[id];
    estado.set(id, !C[b] ? 'nao_contratado' : !P[b] ? 'sem_acesso' : ok ? 'ok' : 'falhou');
  };

  marcar('usinas', frota !== null);
  if (frota) {
    eventos.push(...eventosDeUsinas(frota.usinas, {
      tarifaRsKwh: (u) => tarifaPorConcessionaria(u.uf, cfg),
    }));
  }
  marcar('leads_esperando', leadsEsperando !== null);
  eventos.push(...eventosDeLeadsEsperando(leadsEsperando, agoraMs));

  // SLA/propostas dependem do status dos leads: sem ele, não dá pra saber o que já fechou.
  const tarefasOk = tarefas !== null && statusLead !== null;
  marcar('sla', tarefasOk);
  if (tarefasOk) {
    const vencidas = tarefas.filter((t) => !encerrado(t.lead_id));
    eventos.push(...eventosDeSlaVencido({ total: vencidas.length, maisAntigo: vencidas[0]?.due_at ?? null }, agoraMs));
  }
  const propostasOk = propostas !== null && statusLead !== null;
  marcar('propostas', propostasOk);
  if (propostasOk) {
    eventos.push(...eventosDePropostas(propostas.map((p): PropostaParaAtencao => ({
      id: p.id, created_at: p.created_at, sent_to_client_at: p.sent_to_client_at, ultimo_acesso_at: p.ultimo_acesso_at,
      cliente_respondeu_at: p.cliente_respondeu_at, revoked: p.revoked, expires_at: p.expires_at,
      valorTotal: extrairValorTotal(p.dados_input), leadEncerrado: encerrado(p.lead_id),
    })), agoraMs));
  }
  marcar('gd', gd !== null);
  if (gd) eventos.push(...eventosDeCreditosGd(gd, j.hoje));

  marcar('manutencao', manut !== null);
  let manutencao: DadosCommandCenter['manutencao'] = null;
  if (manut) {
    const hojeUtc = new Date(`${j.hoje}T12:00:00Z`);
    const st = manut.map((m) => statusAgendaItem(m.data_agendada, hojeUtc));
    manutencao = { vencidas: st.filter((s) => s === 'vencida').length, proximas30: st.filter((s) => s === 'proxima').length };
    eventos.push(...eventosDeManutencao(manut, j.hoje));
  }
  marcar('contas', contas !== null);
  if (contas) eventos.push(...eventosDeContas(contas, j.hoje));

  const k = kpisMes ?? { leads: null, propostas: null, vendas: null, usinasNovas: null };
  return {
    agora,
    permissoes: P,
    contratados: C,
    frota,
    telemetriaCortada: frotaR?.telemetriaCortada ?? false,
    // Contagem de área sem acesso não sai daqui.
    kpisMes: {
      leads: P.leads || P.marketing ? k.leads : null,
      propostas: P.propostas ? k.propostas : null,
      vendas: P.leads ? k.vendas : null,
      usinasNovas: P.usinas ? k.usinasNovas : null,
    },
    mudancas24h: { leads: leads24, propostas: propostas24, vendas: vendas24 },
    recebidoMes,
    manutencao,
    eventos,
    fontes: ORDEM_FONTES.map((id) => ({ id, rotulo: ROTULO_FONTE[id], estado: estado.get(id) ?? 'falhou' })),
  };
}
