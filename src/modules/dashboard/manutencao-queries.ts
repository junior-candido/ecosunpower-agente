// src/modules/dashboard/manutencao-queries.ts
// I/O da manutenção: agenda, prontuário, leituras pendentes + writes.
// A leitura manual de geração vai pra geracao_diaria (fetched_source='manual')
// e reusa saúde/relatório existentes.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cadenciaDaUsina, proximaData, ordenarAgenda, precisaLeituraDoMes, feedbackLeitura,
  type ManutencaoTipo, type ManutencaoOrigem, type FeedbackLeitura,
} from './manutencao-motor.js';

import { usinaPertenceAoOperador } from './permissions.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

const HSP_PADRAO = 5.2; // DF/GO (kWh/m²/dia) — esperado da leitura manual

// ---- Empresa da sessão (revisão de segurança do R13, 28/09/2026) ----
// As rotas de Manutenção/OS liam e escreviam com o client de SERVIÇO (ou com o
// client-do-operador, que hoje ainda cai no de serviço — RLS_TENANT_ROTAS
// desligada) SEM filtrar a empresa: a agenda e as leituras pendentes de um
// tenant mostravam as usinas de TODAS as empresas, e um POST com o :id de outra
// empresa marcava feita/abria OS/salvava checklist. Agora toda leitura filtra
// o company_id da SESSÃO e toda escrita por :id confere o dono antes.

/** Filtro da empresa: a EcoSun também vê as linhas antigas sem company_id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- builder do PostgREST (tipo profundo demais pro tsc)
function daEmpresa(q: any, companyId: string): any {
  return companyId === ECOSUN_COMPANY_ID
    ? q.or(`company_id.eq.${ECOSUN_COMPANY_ID},company_id.is.null`)
    : q.eq('company_id', companyId);
}

/** Usina (sistema) da empresa da sessão — null se não existe ou é de outra empresa. */
export async function sistemaDoOperador(client: SupabaseClient, sistemaId: string, companyId: string): Promise<{ leadId: string | null; companyId: string } | null> {
  const { data } = await client.from('sistemas_clientes').select('id, lead_id, company_id').eq('id', sistemaId).maybeSingle();
  const r = data as { lead_id?: string | null; company_id?: string | null } | null;
  if (!r || !usinaPertenceAoOperador(r.company_id ?? null, companyId)) return null;
  return { leadId: r.lead_id ?? null, companyId: r.company_id ?? ECOSUN_COMPANY_ID };
}

/** Manutenção da empresa da sessão — null se não existe ou é de outra empresa. */
export async function manutencaoDoOperador(client: SupabaseClient, id: string, companyId: string): Promise<{ leadId: string | null; tipo: ManutencaoTipo } | null> {
  const { data } = await client.from('manutencoes').select('id, lead_id, tipo, company_id').eq('id', id).maybeSingle();
  const r = data as { lead_id?: string | null; tipo: ManutencaoTipo; company_id?: string | null } | null;
  if (!r || !usinaPertenceAoOperador(r.company_id ?? null, companyId)) return null;
  return { leadId: r.lead_id ?? null, tipo: r.tipo };
}

/** Usinas ativas da empresa (select dos formulários agendar / nova OS). */
export async function listarUsinasAtivas(client: SupabaseClient, companyId: string): Promise<Array<{ id: string; apelido: string }>> {
  const { data, error } = await daEmpresa(client.from('sistemas_clientes').select('id, apelido').eq('ativo', true), companyId).order('apelido');
  if (error) throw new Error(`listarUsinasAtivas: ${error.message}`);
  return (data ?? []).map((u: any) => ({ id: u.id, apelido: u.apelido }));
}

function semApi(s: { acompanhamento?: string | null; api_credentials?: any }): boolean {
  if (s.acompanhamento === 'manual') return true;
  const cred = s.api_credentials;
  return !cred || (typeof cred === 'object' && Object.keys(cred).length === 0);
}

export interface AgendaItem {
  id: string; sistemaId: string; apelido: string; leadId: string | null;
  clienteNome: string | null; tipo: ManutencaoTipo; origem: ManutencaoOrigem;
  data_agendada: string | null; semApi: boolean;
}

// Agenda: manutenções agendadas (vencidas + próximas), guiada por atenção.
export async function listarAgenda(client: SupabaseClient, companyId: string): Promise<AgendaItem[]> {
  const { data, error } = await daEmpresa(client.from('manutencoes')
    .select('id, sistema_id, lead_id, tipo, origem, data_agendada, sistemas_clientes!inner(apelido, acompanhamento, api_credentials, leads(name))')
    .eq('status', 'agendada'), companyId)
    .limit(500);
  if (error) throw new Error(`listarAgenda: ${error.message}`);
  const itens: AgendaItem[] = (data ?? []).map((m: any) => ({
    id: m.id, sistemaId: m.sistema_id, leadId: m.lead_id,
    apelido: m.sistemas_clientes?.apelido ?? '(usina)',
    clienteNome: m.sistemas_clientes?.leads?.name ?? null,
    tipo: m.tipo, origem: m.origem, data_agendada: m.data_agendada,
    semApi: semApi(m.sistemas_clientes ?? {}),
  }));
  return ordenarAgenda(itens, new Date());
}

export interface ProntuarioManutencao {
  id: string; tipo: ManutencaoTipo; status: string; origem: ManutencaoOrigem;
  data_agendada: string | null; feita_em: string | null; notas: string | null;
}
// Prontuário de uma usina: agenda + histórico (mais recente primeiro).
export async function prontuarioUsina(client: SupabaseClient, sistemaId: string): Promise<ProntuarioManutencao[]> {
  const { data, error } = await client.from('manutencoes')
    .select('id, tipo, status, origem, data_agendada, feita_em, notas')
    .eq('sistema_id', sistemaId)
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(`prontuarioUsina: ${error.message}`);
  return (data ?? []) as ProntuarioManutencao[];
}

// Usinas sem API que estão sem leitura manual no mês corrente (empurrão mensal).
export interface LeituraPendente { sistemaId: string; apelido: string; leadId: string | null; clienteNome: string | null }
export async function listarLeiturasPendentes(client: SupabaseClient, companyId: string): Promise<LeituraPendente[]> {
  const { data: sistemas, error } = await daEmpresa(client.from('sistemas_clientes')
    .select('id, apelido, lead_id, acompanhamento, api_credentials, leads(name)')
    .eq('ativo', true), companyId);
  if (error) throw new Error(`listarLeiturasPendentes: ${error.message}`);
  const manuais = (sistemas ?? []).filter((s: any) => semApi(s));
  if (manuais.length === 0) return [];

  const ids = manuais.map((s: any) => s.id);
  const { data: leituras, error: e2 } = await client.from('geracao_diaria')
    .select('sistema_id, data').eq('fetched_source', 'manual').in('sistema_id', ids)
    .order('data', { ascending: false });
  if (e2) throw new Error(`listarLeiturasPendentes/leituras: ${e2.message}`);
  const ultima = new Map<string, string>();
  for (const l of (leituras ?? []) as any[]) if (!ultima.has(l.sistema_id)) ultima.set(l.sistema_id, l.data);

  const hoje = new Date();
  return manuais
    .filter((s: any) => precisaLeituraDoMes(false, ultima.get(s.id) ? ultima.get(s.id) + 'T00:00:00Z' : null, hoje))
    .map((s: any) => ({ sistemaId: s.id, apelido: s.apelido, leadId: s.lead_id, clienteNome: s.leads?.name ?? null }));
}

// ---- Writes ----

export async function criarManutencao(client: SupabaseClient, m: {
  sistemaId: string; leadId: string | null; tipo: ManutencaoTipo;
  origem: ManutencaoOrigem; dataAgendada: string; alertaId?: string | null;
  /** Empresa DONA da usina (sem isso o DEFAULT da 077 carimbava EcoSun). */
  companyId: string;
}): Promise<string | null> {
  const { data, error } = await client.from('manutencoes').insert({
    company_id: m.companyId, sistema_id: m.sistemaId, lead_id: m.leadId, tipo: m.tipo, origem: m.origem,
    status: 'agendada', data_agendada: m.dataAgendada, alerta_id: m.alertaId ?? null,
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return null; // já existe agendada do tipo nessa usina
    throw new Error(`criarManutencao: ${error.message}`);
  }
  return (data as { id: string }).id;
}

// Marca feita + auto-agenda a próxima do mesmo tipo (se recorrer) + resolve alerta.
export async function marcarManutencaoFeita(client: SupabaseClient, id: string, p: {
  feitaEm: string; feitoPor: string; notas?: string;
}): Promise<void> {
  const { data: m, error } = await client.from('manutencoes')
    .select('id, sistema_id, lead_id, tipo, alerta_id, company_id, sistemas_clientes(manutencao_cadencia)')
    .eq('id', id).maybeSingle();
  if (error) throw new Error(`marcarManutencaoFeita/get: ${error.message}`);
  if (!m) throw new Error('marcarManutencaoFeita: manutenção não encontrada');
  const row = m as any;

  const { error: e2 } = await client.from('manutencoes')
    .update({ status: 'feita', feita_em: p.feitaEm, feito_por: p.feitoPor, notas: p.notas ?? null, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'agendada');
  if (e2) throw new Error(`marcarManutencaoFeita/update: ${e2.message}`);

  // auto-agenda a próxima
  const cadencia = cadenciaDaUsina(row.tipo, row.sistemas_clientes?.manutencao_cadencia ?? null);
  const prox = proximaData(new Date(p.feitaEm + 'T00:00:00Z'), cadencia);
  if (prox) {
    await criarManutencao(client, {
      sistemaId: row.sistema_id, leadId: row.lead_id, tipo: row.tipo,
      origem: 'regra', dataAgendada: prox.toISOString().slice(0, 10),
      companyId: row.company_id ?? ECOSUN_COMPANY_ID,
    });
  }
  // resolve alerta manutencao_devida aberto da usina
  if (row.alerta_id) {
    await client.from('alertas_sistema').update({ resolved_at: new Date().toISOString() }).eq('id', row.alerta_id).is('resolved_at', null);
  }
}

export async function reagendarManutencao(client: SupabaseClient, id: string, novaData: string): Promise<void> {
  const { error } = await client.from('manutencoes')
    .update({ data_agendada: novaData, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'agendada');
  if (error) throw new Error(`reagendarManutencao: ${error.message}`);
}

// Leitura manual de geração do mês: grava em geracao_diaria (source manual,
// no 1º dia da competência) e devolve o feedback esperado×digitado.
export async function registrarLeituraManual(client: SupabaseClient, p: {
  sistemaId: string; competencia: string; kwh: number;  // competencia 'YYYY-MM'
}): Promise<FeedbackLeitura> {
  const dia = `${p.competencia}-01`;
  const ano = Number(p.competencia.slice(0, 4)), mes = Number(p.competencia.slice(5, 7));
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();

  // [Fase 2 A3] busca o sistema ANTES pra carimbar a leitura com a empresa
  // DONA (sem isso o default EcoSun quebrava/vazava a leitura de tenant).
  const { data: s } = await client.from('sistemas_clientes')
    .select('potencia_kwp, company_id').eq('id', p.sistemaId).maybeSingle();
  const companyId = ((s as any)?.company_id as string | undefined) ?? '00000000-0000-0000-0000-000000000001';

  const { error } = await client.from('geracao_diaria')
    .upsert({ sistema_id: p.sistemaId, data: dia, geracao_kwh: p.kwh, fetched_source: 'manual', company_id: companyId }, { onConflict: 'sistema_id,data' });
  if (error) throw new Error(`registrarLeituraManual: ${error.message}`);

  const kwp = (s as any)?.potencia_kwp != null ? Number((s as any).potencia_kwp) : 0;
  return feedbackLeitura(p.kwh, kwp, HSP_PADRAO, diasNoMes);
}
