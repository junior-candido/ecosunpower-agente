// src/modules/dashboard/mapa-usinas.ts
// Mapa das Usinas do Command Center (28/09/2026) — os DADOS dos alfinetes.
//
// Estado de cada usina = a MESMA régua do Command Center e da Central de
// Atenção (resumirFrota → estadoDaUsina → classificarSistema do Monitoramento):
// o mapa nunca diz de uma usina algo diferente da tela dela.
//
// TENANT-SAFE: toda consulta leva `.eq('company_id', companyId)` da SESSÃO
// (dupla tranca com o RLS). O nome do cliente vem de leads da MESMA empresa.
//
// REGRA DO JUNIOR: número só se for real — sem dado é null (o cartão mostra "—").

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  janelaBrasilia, resumirFrota,
  type UsinaLinha, type GeracaoLinha, type EstadoUsina,
} from './command-center-calc.js';
import { lerTudo, CONTAGEM, type Consulta } from './command-center-queries.js';
import { MARCAS_LABEL } from './views.js';

export interface LinhaMapa extends UsinaLinha {
  marca_inversor: string | null;
  lead_id: string | null;
  lat: number | string | null;
  lng: number | string | null;
  geo_fonte: string | null;
}

export interface PinoUsina {
  id: string;
  nome: string;
  cliente: string | null;
  cidade: string | null;
  uf: string | null;
  kwp: number | null;
  estado: EstadoUsina;
  /** Frase do problema (mesma da Central de Atenção). null = sem problema. */
  alerta: string | null;
  hojeKwh: number | null;
  mesKwh: number | null;
  /** Real ÷ esperado nos 7 dias completos (%). null sem kWp ou sem leitura. */
  pctEsperado: number | null;
  ultimaComunicacao: string | null;
  marca: string | null;
  lat: number;
  lng: number;
  /** Ponto só do centro da cidade (não do endereço). */
  aproximada: boolean;
  fonte: string | null;
  href: string;
}

export interface DadosMapa {
  geradoEm: string;
  /** Usinas ativas da empresa (com e sem posição). */
  total: number;
  porEstado: Record<EstadoUsina, number>;
  usinas: PinoUsina[];
  semPosicao: number;
  /** Até 5 nomes, pro aviso. */
  semPosicaoNomes: string[];
  /** Colunas do mapa ainda não existem no banco (migration 145). */
  migracaoPendente: boolean;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const r1 = (v: number) => Math.round(v * 10) / 10;

export function montarDadosMapa(
  linhas: readonly LinhaMapa[],
  geracoes: readonly GeracaoLinha[],
  clientes: ReadonlyMap<string, string>,
  o: { agora: Date; corteAtencao: number; migracaoPendente?: boolean },
): DadosMapa {
  const j = janelaBrasilia(o.agora);
  const ativas = linhas.filter((l) => l.ativo);
  const frota = resumirFrota(ativas, geracoes, [], { agora: o.agora, corteAtencao: o.corteAtencao });
  const porId = new Map(ativas.map((l) => [l.id, l]));

  // Mês (desde o dia 1º, Brasília) e dias com leitura nos 7 completos, por usina.
  const mes = new Map<string, number>();
  const dias7 = new Map<string, number>();
  for (const g of geracoes) {
    const kwh = num(g.geracao_kwh);
    if (kwh === null || !porId.has(g.sistema_id)) continue;
    if (g.data >= j.inicioMes && g.data <= j.hoje) mes.set(g.sistema_id, (mes.get(g.sistema_id) ?? 0) + kwh);
    if (g.data >= j.ha7 && g.data < j.hoje) dias7.set(g.sistema_id, (dias7.get(g.sistema_id) ?? 0) + 1);
  }

  const usinas: PinoUsina[] = [];
  const semPosicaoNomes: string[] = [];
  let semPosicao = 0;
  for (const u of frota.usinas) {
    const l = porId.get(u.id) as LinhaMapa;
    const lat = num(l.lat);
    const lng = num(l.lng);
    if (lat === null || lng === null || (lat === 0 && lng === 0)) {
      semPosicao += 1;
      if (semPosicaoNomes.length < 5) semPosicaoNomes.push(u.apelido);
      continue;
    }
    const nDias = dias7.get(u.id) ?? 0;
    const pct = u.esperadoDiaKwh !== null && u.esperadoDiaKwh > 0 && nDias > 0 && u.estado !== 'sem_monitoramento'
      ? Math.round((u.real7Kwh / (u.esperadoDiaKwh * nDias)) * 100)
      : null;
    const m = mes.get(u.id);
    usinas.push({
      id: u.id,
      nome: u.apelido,
      cliente: (l.lead_id && clientes.get(l.lead_id)) || null,
      cidade: u.cidade,
      uf: u.uf,
      kwp: u.potenciaKwp,
      estado: u.estado,
      alerta: u.alertaTexto,
      hojeKwh: u.hojeKwh === null ? null : r1(u.hojeKwh),
      mesKwh: m === undefined ? null : r1(m),
      pctEsperado: pct,
      ultimaComunicacao: u.ultimaSincronizacao,
      marca: l.marca_inversor ? (MARCAS_LABEL[l.marca_inversor] ?? l.marca_inversor) : null,
      lat, lng,
      aproximada: l.geo_fonte === 'cidade',
      fonte: l.geo_fonte,
      href: `/dashboard/monitoramento/${encodeURIComponent(u.id)}`,
    });
  }

  return {
    geradoEm: o.agora.toISOString(),
    total: frota.total,
    porEstado: frota.porEstado,
    usinas,
    semPosicao,
    semPosicaoNomes,
    migracaoPendente: !!o.migracaoPendente,
  };
}

const COLUNAS_BASE = 'id, apelido, potencia_kwp, cidade, uf, ativo, ultima_sincronizacao, ultimo_erro, status_inversor, acompanhamento, marca_inversor, lead_id';
const COLUNAS_GEO = 'lat, lng, geo_fonte';
const RE_COLUNA_FALTANDO = /column .*(lat|lng|geo_fonte).* does not exist|42703/i;

/**
 * Lê tudo o que o mapa precisa, SÓ da empresa da sessão. Erro de leitura
 * lança (quem chama responde "sem dado agora" — nunca um mapa vazio de mentira).
 */
export async function carregarMapaUsinas(
  db: SupabaseClient,
  companyId: string,
  agora: Date,
  corteAtencao: number,
): Promise<DadosMapa> {
  const j = janelaBrasilia(agora);
  const usinasDb = (sel: string, o?: typeof CONTAGEM) => db.from('sistemas_clientes').select(sel, o)
    .eq('company_id', companyId).eq('ativo', true);
  const lerUsinas = (colunas: string) => lerTudo<LinhaMapa>({
    contar: () => usinasDb('id', CONTAGEM),
    pagina: (de, ate) => usinasDb(colunas).order('id', { ascending: true }).range(de, ate) as unknown as Consulta<LinhaMapa>,
  }, 'sistemas_clientes');

  const inicio = j.inicioMes < j.ha7 ? j.inicioMes : j.ha7;
  const geracaoDb = (sel: string, o?: typeof CONTAGEM) => db.from('geracao_diaria').select(sel, o)
    .eq('company_id', companyId).gte('data', inicio).lte('data', j.hoje);
  const geracoesP = lerTudo<GeracaoLinha>({
    contar: () => geracaoDb('sistema_id', CONTAGEM),
    pagina: (de, ate) => geracaoDb('sistema_id, data, geracao_kwh')
      .order('sistema_id', { ascending: true }).order('data', { ascending: true }).range(de, ate) as unknown as Consulta<GeracaoLinha>,
  }, 'geracao_diaria');
  // Evita "unhandled rejection" se as usinas falharem primeiro.
  geracoesP.catch(() => undefined);

  let migracaoPendente = false;
  let linhas: LinhaMapa[];
  try {
    linhas = await lerUsinas(`${COLUNAS_BASE}, ${COLUNAS_GEO}`);
  } catch (err) {
    if (!RE_COLUNA_FALTANDO.test((err as Error).message)) throw err;
    // Migration 145 ainda não aplicada: mostra a frota como "sem localização".
    migracaoPendente = true;
    linhas = (await lerUsinas(COLUNAS_BASE)).map((l) => ({ ...l, lat: null, lng: null, geo_fonte: null }));
  }
  const geracoes = await geracoesP;

  // Nome do cliente (dono) — leads da MESMA empresa, em lotes.
  const ids = [...new Set(linhas.map((l) => l.lead_id).filter((x): x is string => typeof x === 'string' && x.length > 0))];
  const clientes = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    try {
      const { data, error } = await db.from('leads').select('id, name')
        .eq('company_id', companyId).in('id', ids.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as Array<{ id: string; name: string | null }>) {
        if (r.name?.trim()) clientes.set(r.id, r.name.trim());
      }
    } catch (err) {
      // Nome do cliente é bônus: sem ele o cartão mostra só a usina.
      console.warn('[mapa] nomes dos clientes não carregaram:', (err as Error).message);
      break;
    }
  }

  return montarDadosMapa(linhas, geracoes, clientes, { agora, corteAtencao, migracaoPendente });
}

