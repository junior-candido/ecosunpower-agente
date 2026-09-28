// src/modules/monitoring/usinas-posicao.ts
// Posição (lat/lng) das usinas no banco — Mapa das Usinas, 28/09/2026.
//
// TENANT-SAFE: toda leitura e escrita leva `.eq('company_id', companyId)` da
// SESSÃO (dupla tranca com o RLS). A usina mora em sistemas_clientes; o
// endereço do dono vem de leads (rua/número/CEP/cidade), só da mesma empresa.
//
// Regra do alfinete: ponto 'manual' (arrastado por alguém) NUNCA é trocado
// pela localização automática — nem pela API do inversor. A proteção está no
// código (podeSobrescrever) E na própria gravação (filtro `geo_fonte` ≠ manual).

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deslocarAproximado, podeSobrescrever, pontoNoBrasil, ehGeoFonte,
  type Geocodificador, type EnderecoUsina, type GeoFonte,
} from './geocodificacao.js';

/** Filtro PostgREST: só grava onde o ponto atual NÃO é manual. */
export const FILTRO_NAO_MANUAL = 'geo_fonte.is.null,geo_fonte.neq.manual';

export interface UsinaSemPosicao { id: string; apelido: string; cidade: string | null; uf: string | null }

/** Coluna nova ainda não criada no banco (migration 145 não aplicada). */
export function ehColunaFaltando(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === '42703' || /column .*(lat|lng|geo_fonte|geo_em).* does not exist/i.test(err.message ?? '');
}

/** Usinas ATIVAS da empresa ainda sem ponto no mapa (ordem estável pelo nome). */
export async function listarSemPosicao(db: SupabaseClient, companyId: string, limite = 2000): Promise<UsinaSemPosicao[]> {
  const { data, error } = await db.from('sistemas_clientes')
    .select('id, apelido, cidade, uf')
    .eq('company_id', companyId).eq('ativo', true).is('lat', null)
    .order('apelido', { ascending: true }).limit(limite);
  if (error) throw new Error(`sistemas_clientes (sem posição): ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id), apelido: String(r.apelido ?? ''),
    cidade: (r.cidade as string | null) ?? null, uf: (r.uf as string | null) ?? null,
  }));
}

export type ResultadoLocalizar =
  | { ok: true; fonte: GeoFonte; pulada?: false; lat: number; lng: number }
  | { ok: true; pulada: true; motivo: string }
  | { ok: false; motivo: string; limite?: boolean };

interface LinhaUsina {
  id: string; apelido: string | null; cidade: string | null; uf: string | null;
  lead_id: string | null; lat: number | null; lng: number | null; geo_fonte: string | null;
}
interface LinhaLead { endereco_rua: string | null; endereco_numero: string | null; cep: string | null; city: string | null; uf: string | null }

/** Monta o endereço: rua do dono + a cidade DELE (casam entre si); sem rua, a cidade da usina. */
export function enderecoDaUsina(u: Pick<LinhaUsina, 'cidade' | 'uf'>, lead: LinhaLead | null): EnderecoUsina {
  const rua = lead?.endereco_rua?.trim() || null;
  if (rua && (lead?.city?.trim() || u.cidade?.trim())) {
    return {
      rua, numero: lead?.endereco_numero ?? null, cep: lead?.cep ?? null,
      cidade: lead?.city?.trim() || u.cidade, uf: lead?.uf?.trim() || u.uf,
    };
  }
  return { cidade: u.cidade?.trim() || lead?.city?.trim() || null, uf: u.uf?.trim() || lead?.uf?.trim() || null };
}

/**
 * Localiza UMA usina da empresa e grava o ponto. Ponto manual é pulado.
 * Nunca lança (erro vira { ok:false, motivo }).
 */
export async function localizarUsina(
  db: SupabaseClient,
  companyId: string,
  id: string,
  geo: Geocodificador,
  agora: () => Date = () => new Date(),
): Promise<ResultadoLocalizar> {
  try {
    const { data: u, error } = await db.from('sistemas_clientes')
      .select('id, apelido, cidade, uf, lead_id, lat, lng, geo_fonte')
      .eq('id', id).eq('company_id', companyId).maybeSingle();
    if (error) return { ok: false, motivo: ehColunaFaltando(error) ? 'o banco ainda não tem as colunas do mapa (migration 145)' : error.message };
    if (!u) return { ok: false, motivo: 'usina não encontrada' };
    const usina = u as LinhaUsina;
    const atual = ehGeoFonte(usina.geo_fonte) ? usina.geo_fonte : null;
    if (atual === 'manual') return { ok: true, pulada: true, motivo: 'posição ajustada à mão — mantida' };

    let lead: LinhaLead | null = null;
    if (usina.lead_id) {
      const { data: l } = await db.from('leads')
        .select('endereco_rua, endereco_numero, cep, city, uf')
        .eq('id', usina.lead_id).eq('company_id', companyId).maybeSingle();
      lead = (l as LinhaLead | null) ?? null;
    }

    const r = await geo.localizar(enderecoDaUsina(usina, lead));
    if (!r.ok) return { ok: false, motivo: r.motivo, limite: r.limite };
    if (!podeSobrescrever(atual, r.fonte)) return { ok: true, pulada: true, motivo: 'já tem uma posição melhor' };

    const ponto = r.fonte === 'cidade' ? deslocarAproximado(r, usina.id) : { lat: r.lat, lng: r.lng };
    const { error: e2 } = await db.from('sistemas_clientes')
      .update({ lat: ponto.lat, lng: ponto.lng, geo_fonte: r.fonte, geo_em: agora().toISOString() })
      .eq('id', usina.id).eq('company_id', companyId).or(FILTRO_NAO_MANUAL);
    if (e2) return { ok: false, motivo: e2.message };
    return { ok: true, fonte: r.fonte, lat: ponto.lat, lng: ponto.lng };
  } catch (err) {
    console.error('[mapa] localizarUsina falhou:', (err as Error).message);
    return { ok: false, motivo: 'erro inesperado ao localizar' };
  }
}

/** Alfinete arrastado: grava o ponto como 'manual' (só na usina da empresa). */
export async function salvarPosicaoManual(
  db: SupabaseClient,
  companyId: string,
  id: string,
  lat: number,
  lng: number,
  agora: () => Date = () => new Date(),
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (!pontoNoBrasil(lat, lng)) return { ok: false, motivo: 'ponto fora do Brasil' };
  const la = Math.round(lat * 1e6) / 1e6;
  const ln = Math.round(lng * 1e6) / 1e6;
  const { data, error } = await db.from('sistemas_clientes')
    .update({ lat: la, lng: ln, geo_fonte: 'manual', geo_em: agora().toISOString() })
    .eq('id', id).eq('company_id', companyId).select('id');
  if (error) return { ok: false, motivo: ehColunaFaltando(error) ? 'o banco ainda não tem as colunas do mapa (migration 145)' : error.message };
  if (!Array.isArray(data) || data.length === 0) return { ok: false, motivo: 'usina não encontrada' };
  return { ok: true };
}

/**
 * Ponto informado pela marca do inversor (import/descoberta). Melhor esforço:
 * nunca lança, nunca mexe em ponto manual, ignora coordenada inválida.
 */
export async function gravarPosicaoDaApi(
  db: SupabaseClient,
  companyId: string,
  id: string,
  lat: unknown,
  lng: unknown,
  agora: () => Date = () => new Date(),
): Promise<void> {
  const la = typeof lat === 'string' ? Number(lat) : lat;
  const ln = typeof lng === 'string' ? Number(lng) : lng;
  if (typeof la !== 'number' || typeof ln !== 'number' || !pontoNoBrasil(la, ln)) return;
  try {
    const { error } = await db.from('sistemas_clientes')
      .update({ lat: la, lng: ln, geo_fonte: 'api', geo_em: agora().toISOString() })
      .eq('id', id).eq('company_id', companyId).or(FILTRO_NAO_MANUAL);
    if (error) console.warn(`[mapa] posição da API não gravada (${id}): ${error.message}`);
  } catch (err) {
    console.warn(`[mapa] posição da API lançou (${id}): ${(err as Error).message}`);
  }
}
