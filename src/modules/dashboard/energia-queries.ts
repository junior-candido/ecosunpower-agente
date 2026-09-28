// src/modules/dashboard/energia-queries.ts
//
// Leituras e escritas das telas da Gestão de Energia. TODA consulta leva
// `.eq('company_id', companyId)` da SESSÃO (além do RLS quando o crachá por
// empresa estiver ligado — bancoDoOperador). Consumo é dado pessoal: medidor de
// outra empresa simplesmente "não existe" (404), nunca 403.
//
// Tabela ausente (migrations 136/137 ainda não aplicadas) → { ok: false,
// motivo: 'migration' } e a tela explica, sem quebrar.

import type { SupabaseClient } from '@supabase/supabase-js';
import { tabelaAusente } from '../energia/db-erros.js';
import { inicioDoDiaBrtIso, somarDias } from '../energia/tempo.js';
import type { DiaMedido, EntradaPainel, JanelaPerfil } from '../energia/energia-casa.js';

export type Falha = { ok: false; motivo: 'migration' | 'falha' };
type Erro = { code?: string; message: string } | null;
const falha = (error: Erro, onde: string): Falha => {
  if (tabelaAusente(error)) return { ok: false, motivo: 'migration' };
  console.warn(`[energia] ${onde}:`, error?.message);
  return { ok: false, motivo: 'falha' };
};
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export interface MedidorTela {
  id: string;
  apelido: string;
  device_id: string;
  modelo: string | null;
  modo_coleta: 'push' | 'nuvem' | 'push_nuvem';
  perfil: 'triphase' | 'monophase';
  canais: { rede?: number } | null;
  ligacao: string | null;
  tensao_nominal_v: number | null;
  concessionaria: string | null;
  uc_instalacao: string | null;
  codigo_cliente: string | null;
  grupo_gd: string | null;
  sistema_id: string | null;
  lead_id: string | null;
  status: string;
  status_desde: string | null;
  ultima_leitura_em: string | null;
  ultimo_erro: string | null;
  /** Chave da nuvem: null = não testada, false = recusada/não abre. */
  nuvem_ok: boolean | null;
  consentimento_em: string | null;
  ativo: boolean;
  /** Fica no servidor (mascarar/testar). Nunca vai pro HTML. */
  api_credentials_cifrado: string | null;
  tem_token: boolean;
}

const COLUNAS = 'id, apelido, device_id, modelo, modo_coleta, perfil, canais, ligacao, tensao_nominal_v, concessionaria, uc_instalacao, codigo_cliente, grupo_gd, sistema_id, lead_id, status, status_desde, ultima_leitura_em, ultimo_erro, nuvem_ok, consentimento_em, ativo, api_credentials_cifrado, token_ingest_hash';

function paraTela(r: Record<string, unknown>): MedidorTela {
  const { token_ingest_hash, ...resto } = r;
  return { ...(resto as unknown as MedidorTela), tem_token: !!token_ingest_hash };
}

export interface ItemListaMedidor {
  medidor: MedidorTela;
  usina: string | null;
  cliente: string | null;
}

export async function listarMedidores(db: SupabaseClient, companyId: string): Promise<{ ok: true; itens: ItemListaMedidor[] } | Falha> {
  const { data, error } = await db.from('medidores_energia').select(COLUNAS).eq('company_id', companyId).order('apelido', { ascending: true }).limit(500);
  if (error) return falha(error, 'listarMedidores');
  const ms = ((data ?? []) as Record<string, unknown>[]).map(paraTela);
  const sistemaIds = [...new Set(ms.map((m) => m.sistema_id).filter((x): x is string => !!x))];
  const leadIds = [...new Set(ms.map((m) => m.lead_id).filter((x): x is string => !!x))];
  const usinas = new Map<string, string>();
  const leads = new Map<string, string>();
  if (sistemaIds.length) {
    const r = await db.from('sistemas_clientes').select('id, apelido').eq('company_id', companyId).in('id', sistemaIds);
    for (const s of (r.data ?? []) as Array<{ id: string; apelido: string }>) usinas.set(s.id, s.apelido);
  }
  if (leadIds.length) {
    const r = await db.from('leads').select('id, name').eq('company_id', companyId).in('id', leadIds);
    for (const l of (r.data ?? []) as Array<{ id: string; name: string | null }>) if (l.name) leads.set(l.id, l.name);
  }
  return {
    ok: true,
    itens: ms.map((m) => ({ medidor: m, usina: m.sistema_id ? usinas.get(m.sistema_id) ?? null : null, cliente: m.lead_id ? leads.get(m.lead_id) ?? null : null })),
  };
}

export async function carregarMedidor(db: SupabaseClient, companyId: string, id: string): Promise<{ ok: true; medidor: MedidorTela | null } | Falha> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: true, medidor: null };
  const { data, error } = await db.from('medidores_energia').select(COLUNAS).eq('company_id', companyId).eq('id', id).limit(1);
  if (error) return falha(error, 'carregarMedidor');
  const r = (data ?? [])[0] as Record<string, unknown> | undefined;
  return { ok: true, medidor: r ? paraTela(r) : null };
}

export interface UsinaOpcao { id: string; apelido: string; lead_id: string | null; marca: string | null; potencia_kwp: number | null }

export async function listarUsinas(db: SupabaseClient, companyId: string): Promise<UsinaOpcao[]> {
  const { data, error } = await db.from('sistemas_clientes').select('id, apelido, lead_id, marca_inversor, potencia_kwp')
    .eq('company_id', companyId).eq('ativo', true).order('apelido', { ascending: true }).limit(2000);
  if (error) { console.warn('[energia] listarUsinas:', error.message); return []; }
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id), apelido: String(r.apelido ?? ''), lead_id: (r.lead_id as string | null) ?? null,
    marca: (r.marca_inversor as string | null) ?? null, potencia_kwp: num(r.potencia_kwp),
  }));
}

export async function nomeDaUsina(db: SupabaseClient, companyId: string, sistemaId: string | null): Promise<string | null> {
  if (!sistemaId) return null;
  const { data } = await db.from('sistemas_clientes').select('apelido').eq('company_id', companyId).eq('id', sistemaId).limit(1);
  return ((data ?? [])[0] as { apelido?: string } | undefined)?.apelido ?? null;
}

function paraDia(r: Record<string, unknown>): DiaMedido {
  return {
    dia: String(r.dia).slice(0, 10),
    importadoKwh: num(r.importado_kwh),
    exportadoKwh: num(r.exportado_kwh),
    coberturaPct: num(r.cobertura_pct) ?? 0,
    baseNoturnaW: num(r.base_noturna_w),
    demandaMaxW: num(r.demanda_max_w),
  };
}

async function diasEntre(db: SupabaseClient, companyId: string, medidorId: string, de: string, ate: string): Promise<DiaMedido[] | Falha> {
  const { data, error } = await db.from('energia_diaria')
    .select('dia, importado_kwh, exportado_kwh, cobertura_pct, base_noturna_w, demanda_max_w')
    .eq('company_id', companyId).eq('medidor_id', medidorId).gte('dia', de).lte('dia', ate)
    .order('dia', { ascending: true }).limit(400);
  if (error) return falha(error, 'energia_diaria');
  return ((data ?? []) as Record<string, unknown>[]).map(paraDia);
}

/** Tudo que a tela "Energia da casa" precisa, escopado pela empresa da sessão. */
export async function carregarDadosCasa(
  db: SupabaseClient, companyId: string, m: MedidorTela, hoje: string, diasJanela = 30,
): Promise<{ ok: true; entrada: EntradaPainel; referenciaDemonstrativo: string | null } | Falha> {
  const de = somarDias(hoje, -(diasJanela - 1));
  const dias = await diasEntre(db, companyId, m.id, de, hoje);
  if (!Array.isArray(dias)) return dias;

  const geracao: Record<string, number> = {};
  if (m.sistema_id) {
    const { data, error } = await db.from('geracao_diaria').select('data, geracao_kwh')
      .eq('company_id', companyId).eq('sistema_id', m.sistema_id).gte('data', de).lte('data', hoje).limit(400);
    if (error) console.warn('[energia] geracao_diaria:', error.message);
    for (const g of (data ?? []) as Array<{ data: string; geracao_kwh: unknown }>) {
      const v = num(g.geracao_kwh);
      if (v !== null) geracao[String(g.data).slice(0, 10)] = v;
    }
  }

  // 15 min dos últimos N dias (até ~2.880 linhas): paginado.
  const janelas: JanelaPerfil[] = [];
  const desdeIso = inicioDoDiaBrtIso(de);
  for (let p = 0; p < 10; p++) {
    const { data, error } = await db.from('energia_15min').select('inicio, importado_wh, exportado_wh, segundos_cobertos')
      .eq('company_id', companyId).eq('medidor_id', m.id).eq('papel', 'rede').eq('canal', m.canais?.rede ?? 2).gte('inicio', desdeIso)
      .order('inicio', { ascending: true }).range(p * 1000, p * 1000 + 999);
    if (error) return falha(error, 'energia_15min');
    const linhas = (data ?? []) as Array<Record<string, unknown>>;
    for (const r of linhas) {
      janelas.push({
        inicio: new Date(String(r.inicio)).toISOString(), importadoWh: num(r.importado_wh) ?? 0,
        exportadoWh: num(r.exportado_wh) ?? 0, segundosCobertos: num(r.segundos_cobertos) ?? 0,
      });
    }
    if (linhas.length < 1000) break;
  }

  // Conferência: o demonstrativo mais recente desta UC (mesma empresa).
  let mes: EntradaPainel['mes'] = null;
  let referenciaDemonstrativo: string | null = null;
  if (m.uc_instalacao) {
    const { data, error } = await db.from('demonstrativos_gd').select('referencia, injetado_kwh, consumo_kwh')
      .eq('company_id', companyId).eq('instalacao', m.uc_instalacao).order('referencia', { ascending: false }).limit(1);
    if (error) console.warn('[energia] demonstrativos_gd:', error.message);
    const d = (data ?? [])[0] as { referencia: string; injetado_kwh: unknown; consumo_kwh: unknown } | undefined;
    if (d) {
      referenciaDemonstrativo = String(d.referencia).slice(0, 10);
      const ref = `${referenciaDemonstrativo.slice(0, 7)}-01`;
      const [a, mm] = ref.split('-').map(Number);
      const fim = new Date(Date.UTC(a, mm, 0)).toISOString().slice(0, 10);
      const diasMes = await diasEntre(db, companyId, m.id, ref, fim);
      mes = {
        referencia: ref,
        dias: Array.isArray(diasMes) ? diasMes : [],
        demonstrativo: { injetado_kwh: num(d.injetado_kwh), consumo_kwh: num(d.consumo_kwh) },
      };
    }
  }

  return { ok: true, entrada: { hoje, diasJanela, temUsina: !!m.sistema_id, dias, geracao, janelas, mes }, referenciaDemonstrativo };
}

// ---------------------------------------------------------------------------
// Escritas (sempre com o company_id da sessão)
// ---------------------------------------------------------------------------

export type DadosMedidor = Record<string, unknown>;

export async function criarMedidor(db: SupabaseClient, companyId: string, dados: DadosMedidor): Promise<{ ok: true; id: string } | { ok: false; motivo: 'duplicado' | 'migration' | 'falha' }> {
  const { data, error } = await db.from('medidores_energia').insert({ ...dados, company_id: companyId }).select('id').limit(1);
  if (error) {
    if (error.code === '23505') return { ok: false, motivo: 'duplicado' };
    return falha(error, 'criarMedidor');
  }
  return { ok: true, id: String(((data ?? [])[0] as { id: string }).id) };
}

export async function atualizarMedidor(db: SupabaseClient, companyId: string, id: string, dados: DadosMedidor): Promise<{ ok: true } | { ok: false; motivo: 'duplicado' | 'migration' | 'falha' }> {
  const { error } = await db.from('medidores_energia').update({ ...dados, updated_at: new Date().toISOString() })
    .eq('company_id', companyId).eq('id', id);
  if (error) {
    if (error.code === '23505') return { ok: false, motivo: 'duplicado' };
    return falha(error, 'atualizarMedidor');
  }
  return { ok: true };
}
