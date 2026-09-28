// src/modules/dashboard/command-center-queries.ts
// Leituras do Command Center (fase B). Cada FONTE é isolada: se falha, vira
// `null` (a tela mostra "—") e entra na lista de fontes com o estado
// "falhou" — a Central de Atenção nunca diz "tudo em dia" quando não conseguiu ler.
//
// TENANT-SAFE: TODA consulta leva `.eq('company_id', companyId)` no código
// (dupla tranca com o RLS do bancoDoOperador, que pode estar desligado e cair
// no cliente de serviço). Abrir pro tenant é só a flag da rota.
//
// PERMISSÃO: área que o usuário não pode ver nem é consultada.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCommandCenterKpis, extrairValorTotal, VENDA_STATUSES, type CommandCenterKpis } from './queries.js';
import { CRITERIO_LEAD_ESPERANDO } from './cockpit-queries.js';
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
import type { ContaAberta } from '../financeiro/alertas-vencimento.js';

export interface PermissoesCC { usinas: boolean; leads: boolean; propostas: boolean; financeiro: boolean }
export const TODAS_PERMISSOES: PermissoesCC = { usinas: true, leads: true, propostas: true, financeiro: true };

/** Fontes de aviso da Central de Atenção (painel "De onde vêm os avisos"). */
export type IdFonte = 'usinas' | 'leads_esperando' | 'sla' | 'propostas' | 'gd' | 'manutencao' | 'contas';
export type EstadoFonte = 'ok' | 'falhou' | 'sem_acesso';
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
const ORDEM_FONTES: IdFonte[] = ['usinas', 'leads_esperando', 'sla', 'propostas', 'gd', 'manutencao', 'contas'];

export interface DadosCommandCenter {
  agora: Date;
  permissoes: PermissoesCC;
  /** null = falhou ou sem acesso. */
  frota: ResumoFrota | null;
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

/** Status de lead que já saiu do funil ativo (fechou ou perdeu). */
const LEAD_ENCERRADO = new Set<string>([...VENDA_STATUSES, 'ganho', 'perdido', 'cliente_fechado']);

const TAMANHO_PAGINA = 1000;
const MAX_PAGINAS = 30;

type Consulta<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Lê todas as páginas (o PostgREST corta em 1000). Erro em QUALQUER página lança:
 *  soma parcial nunca vira número na tela. */
async function lerTudo<T>(montar: (de: number, ate: number) => Consulta<T>, contexto: string): Promise<T[]> {
  const tudo: T[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const de = p * TAMANHO_PAGINA;
    const { data, error } = await montar(de, de + TAMANHO_PAGINA - 1);
    if (error) throw new Error(`${contexto}: ${error.message}`);
    const linhas = data ?? [];
    tudo.push(...linhas);
    if (linhas.length < TAMANHO_PAGINA) return tudo;
  }
  throw new Error(`${contexto}: mais de ${MAX_PAGINAS * TAMANHO_PAGINA} linhas — não dá pra somar tudo`);
}

async function lerUma<T>(consulta: Consulta<T>, contexto: string): Promise<T[]> {
  const { data, error } = await consulta;
  if (error) throw new Error(`${contexto}: ${error.message}`);
  return data ?? [];
}

type ConsultaContagem = PromiseLike<{ data?: unknown; count: number | null; error: { message: string } | null }>;

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

export async function carregarCommandCenter(
  db: SupabaseClient,
  companyId: string,
  agora: Date,
  permissoes: PermissoesCC,
): Promise<DadosCommandCenter> {
  const j = janelaBrasilia(agora);
  const agoraMs = agora.getTime();
  const agoraIso = agora.toISOString();
  const desde24h = new Date(agoraMs - 24 * 3_600_000).toISOString();
  const cfg = empresaDe(companyId);
  const P = permissoes;

  // --- Usinas (frota + telemetria) ---------------------------------------
  const frotaP = P.usinas ? tentar('usinas', async () => {
    const [usinas, geracoes, telemetria] = await Promise.all([
      lerTudo<UsinaLinha>((de, ate) => db.from('sistemas_clientes')
        .select('id, apelido, potencia_kwp, cidade, uf, ativo, ultima_sincronizacao, ultimo_erro, status_inversor, acompanhamento')
        .eq('company_id', companyId).eq('ativo', true)
        .order('id', { ascending: true }).range(de, ate), 'sistemas_clientes'),
      lerTudo<GeracaoLinha>((de, ate) => db.from('geracao_diaria')
        .select('sistema_id, data, geracao_kwh')
        .eq('company_id', companyId)
        .gte('data', j.inicioMes < j.ha30 ? j.inicioMes : j.ha30).lte('data', j.hoje)
        .order('sistema_id', { ascending: true }).order('data', { ascending: true }).range(de, ate), 'geracao_diaria'),
      // Geração ao vivo é bônus: se a telemetria falhar, o resto da frota segue (e "Geração agora" fica "—").
      tentar('telemetria', () => lerUma<TelemetriaLinha>(db.from('telemetria_medicoes')
        .select('sistema_id, device_key, valor, ts')
        .eq('company_id', companyId).eq('ponto', 'potencia')
        .gte('ts', new Date(agoraMs - 30 * 60_000).toISOString())
        .order('ts', { ascending: false }).limit(5000), 'telemetria_medicoes')),
    ]);
    return resumirFrota(usinas, geracoes, telemetria ?? [], { agora, corteAtencao: cfg.reguaAtencaoPct / 100 });
  }) : Promise.resolve(null);

  // --- Comercial (contagens) -------------------------------------------
  const kpisP = tentar('kpis do mês', () => fetchCommandCenterKpis(db, companyId, agora));
  const mudancasP = Promise.all([
    P.leads ? contar(() => db.from('leads').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).gte('created_at', desde24h), 'leads 24 h') : Promise.resolve(null),
    P.propostas ? contar(() => db.from('propostas_publicas').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('revoked', false).gte('created_at', desde24h), 'propostas 24 h') : Promise.resolve(null),
    P.leads ? contar(() => db.from('leads').select('id', { count: 'exact', head: true })
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

  const tarefasP = P.leads ? tentar('tarefas SLA', () => lerUma<{ id: string; lead_id: string; due_at: string }>(db.from('lead_tarefas')
    .select('id, lead_id, due_at')
    .eq('company_id', companyId).eq('status', 'pendente').lt('due_at', agoraIso)
    .order('due_at', { ascending: true }).limit(1000), 'lead_tarefas')) : Promise.resolve(null);

  const propostasP = P.propostas ? tentar('propostas', () => lerUma<{
    id: string; lead_id: string | null; created_at: string; sent_to_client_at: string | null; ultimo_acesso_at: string | null;
    cliente_respondeu_at: string | null; revoked: boolean; expires_at: string | null; dados_input: unknown;
  }>(db.from('propostas_publicas')
    .select('id, lead_id, created_at, sent_to_client_at, ultimo_acesso_at, cliente_respondeu_at, revoked, expires_at, dados_input')
    .eq('company_id', companyId).eq('revoked', false).is('cliente_respondeu_at', null)
    .gte('created_at', new Date(agoraMs - 60 * 86_400_000).toISOString())
    .order('created_at', { ascending: false }).limit(500), 'propostas_publicas')) : Promise.resolve(null);

  // --- Usinas: GD e manutenção ------------------------------------------
  const gdP = P.usinas ? tentar('créditos GD', async (): Promise<CreditoGdParaAtencao[]> => {
    const linhas = await lerTudo<{ instalacao: string; cliente_nome: string | null; referencia: string; proximo_expirar_kwh: unknown; ciclo_expirar: string | null }>(
      (de, ate) => db.from('demonstrativos_gd')
        .select('instalacao, cliente_nome, referencia, proximo_expirar_kwh, ciclo_expirar')
        .eq('company_id', companyId).gte('referencia', inicioMesAntes(j.hoje, 12))
        .order('referencia', { ascending: false }).order('instalacao', { ascending: true }).range(de, ate),
      'demonstrativos_gd',
    );
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
    .limit(2000), 'manutencoes')) : Promise.resolve(null);

  // --- Financeiro --------------------------------------------------------
  const recebidoP = P.financeiro ? tentar('recebido no mês', async () => {
    const linhas = await lerTudo<{ valor: unknown }>((de, ate) => db.from('financeiro_recebimentos')
      .select('valor').eq('company_id', companyId).eq('competencia', competenciaAtual(agora))
      .order('id', { ascending: true }).range(de, ate), 'financeiro_recebimentos');
    return Math.round(linhas.reduce((s, l) => s + (numOuNull(l.valor) ?? 0), 0) * 100) / 100;
  }) : Promise.resolve(null);

  const contasP = P.financeiro ? tentar('contas a pagar', async (): Promise<ContaAberta[]> => {
    const linhas = await lerUma<{ id: string; descricao: string; valor: unknown; vencimento: string; mundo: 'PJ' | 'PF'; categoria_slug: string | null }>(
      db.from('financeiro_contas_a_pagar')
        .select('id, descricao, valor, vencimento, mundo, categoria_slug')
        .eq('company_id', companyId).eq('status', 'aberta').lte('vencimento', somarDias(j.hoje, 3))
        .order('vencimento', { ascending: true }).limit(500),
      'financeiro_contas_a_pagar',
    );
    return linhas.map((c) => ({ ...c, valor: numOuNull(c.valor) ?? NaN, lembretes: [] }));
  }) : Promise.resolve(null);

  const [frota, kpisMes, [leads24, propostas24, vendas24], leadsEsperando, tarefas, propostas, gd, manut, recebidoMes, contas] =
    await Promise.all([frotaP, kpisP, mudancasP, leadsEsperandoP, tarefasP, propostasP, gdP, manutP, recebidoP, contasP]);

  // Status dos leads das tarefas e propostas (1 consulta, em lotes) — pra não
  // cobrar tarefa/proposta de quem já fechou ou foi perdido.
  const idsLeads = [...new Set([...(tarefas ?? []).map((t) => t.lead_id), ...(propostas ?? []).map((p) => p.lead_id)]
    .filter((x): x is string => typeof x === 'string' && x.length > 0))];
  const statusLead = idsLeads.length ? await tentar('status dos leads', async () => {
    const m = new Map<string, string>();
    for (let i = 0; i < idsLeads.length; i += 200) {
      const lote = await lerUma<{ id: string; status: string | null }>(db.from('leads')
        .select('id, status').eq('company_id', companyId).in('id', idsLeads.slice(i, i + 200)), 'leads (status)');
      for (const l of lote) if (l.status) m.set(l.id, l.status);
    }
    return m;
  }) : new Map<string, string>();
  const encerrado = (leadId: string | null) => !!leadId && !!statusLead && LEAD_ENCERRADO.has(statusLead.get(leadId) ?? '');

  // --- Avisos -------------------------------------------------------------
  const eventos: EventoAtencao[] = [];
  const estado = new Map<IdFonte, EstadoFonte>();
  const marcar = (id: IdFonte, permitido: boolean, ok: boolean) => estado.set(id, !permitido ? 'sem_acesso' : ok ? 'ok' : 'falhou');

  marcar('usinas', P.usinas, frota !== null);
  if (frota) {
    eventos.push(...eventosDeUsinas(frota.usinas, {
      tarifaRsKwh: (u) => tarifaPorConcessionaria(u.uf, cfg),
    }));
  }
  marcar('leads_esperando', P.leads, leadsEsperando !== null);
  eventos.push(...eventosDeLeadsEsperando(leadsEsperando, agoraMs));

  // SLA/propostas dependem do status dos leads: sem ele, não dá pra saber o que já fechou.
  const tarefasOk = tarefas !== null && statusLead !== null;
  marcar('sla', P.leads, tarefasOk);
  if (tarefasOk) {
    const vencidas = tarefas.filter((t) => !encerrado(t.lead_id));
    eventos.push(...eventosDeSlaVencido({ total: vencidas.length, maisAntigo: vencidas[0]?.due_at ?? null }, agoraMs));
  }
  const propostasOk = propostas !== null && statusLead !== null;
  marcar('propostas', P.propostas, propostasOk);
  if (propostasOk) {
    // Proposta refeita (reajuste, nova versão): vale só a MAIS RECENTE de cada lead —
    // a antiga não está "parada" e não pode somar de novo no "R$ em jogo".
    const vistos = new Set<string>();
    const atuais = propostas.filter((p) => {
      if (!p.lead_id) return true;
      if (vistos.has(p.lead_id)) return false;
      vistos.add(p.lead_id);
      return true;
    });
    eventos.push(...eventosDePropostas(atuais.map((p): PropostaParaAtencao => ({
      id: p.id, created_at: p.created_at, sent_to_client_at: p.sent_to_client_at, ultimo_acesso_at: p.ultimo_acesso_at,
      cliente_respondeu_at: p.cliente_respondeu_at, revoked: p.revoked, expires_at: p.expires_at,
      valorTotal: extrairValorTotal(p.dados_input), leadEncerrado: encerrado(p.lead_id),
    })), agoraMs));
  }
  marcar('gd', P.usinas, gd !== null);
  if (gd) eventos.push(...eventosDeCreditosGd(gd, j.hoje));

  marcar('manutencao', P.usinas, manut !== null);
  let manutencao: DadosCommandCenter['manutencao'] = null;
  if (manut) {
    const hojeUtc = new Date(`${j.hoje}T12:00:00Z`);
    const st = manut.map((m) => statusAgendaItem(m.data_agendada, hojeUtc));
    manutencao = { vencidas: st.filter((s) => s === 'vencida').length, proximas30: st.filter((s) => s === 'proxima').length };
    eventos.push(...eventosDeManutencao(manut, j.hoje));
  }
  marcar('contas', P.financeiro, contas !== null);
  if (contas) eventos.push(...eventosDeContas(contas, j.hoje));

  const k = kpisMes ?? { leads: null, propostas: null, vendas: null, usinasNovas: null };
  return {
    agora,
    permissoes: P,
    frota,
    // Contagem de área sem permissão não sai daqui (a consulta é barata e única; o número some).
    kpisMes: {
      leads: P.leads ? k.leads : null,
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
