// src/modules/energia/energia-repo.ts
//
// EnergiaDb de verdade (Supabase). O cron usa o client de serviço (lê todas as
// empresas), então o isolamento é disciplina AQUI: toda consulta leva
// `.eq('company_id', m.company_id)` do próprio medidor, além do medidor_id.
// PostgREST devolve no máximo 1000 linhas por vez → paginação por `range`.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { EnergiaDb, MedidorRow, DiaParaGravar, Fonte } from './energia-service.js';
import type { Janela15, LeituraBruta } from './agregacao.js';
import type { LeituraMedidor } from './types.js';
import { diaBrt, inicioDoDiaBrtIso, limitarAoAgora, somarDias } from './tempo.js';
import { normalizarDeviceId } from './credenciais.js';

const PAGINA = 1000;
const LIMITE_PAGINAS = 60; // 60 mil linhas por chamada: teto de segurança (1 dia = 1.440)
/** Bruto órfão ligado/apagado por chamada (o resto fica pro ciclo seguinte). */
const LOTE_ORFAOS = 5000;
/** Ids por update/delete (vai na URL do PostgREST: 250 uuids ≈ 9 kB). */
const PEDACO_IDS = 250;

/**
 * Como o device_id pode estar gravado no bruto antigo: com ou sem o prefixo do
 * modelo, e com o código em minúsculas ou maiúsculas (o código antigo gravava
 * o que o aparelho mandava). O novo grava sempre normalizado.
 */
export function formasDoDeviceId(deviceId: string): string[] {
  const dev = normalizarDeviceId(deviceId);
  const out = new Set<string>();
  for (const cod of [dev, dev.toUpperCase()]) {
    for (const prefixo of ['', 'shellypro3em-', 'ShellyPro3EM-', 'shellyproem50-']) out.add(prefixo + cod);
  }
  return [...out];
}

export const COLUNAS_MEDIDOR =
  'id, company_id, lead_id, sistema_id, apelido, device_id, modo_coleta, perfil, canais, tensao_nominal_v, api_credentials_cifrado, ativo, status, status_desde, ultima_leitura_em, ultimo_erro, nuvem_ok, nuvem_desde, nuvem_avisado_em, aviso_dia, avisos_no_dia';

type Erro = { code?: string; message: string } | null;
function falhou(onde: string, error: Erro): never {
  const e = new Error(`${onde}: ${error?.message ?? 'erro'}`) as Error & { code?: string };
  e.code = error?.code;
  throw e;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function linhaParaJanela(r: Record<string, unknown>): Janela15 {
  return {
    inicio: new Date(String(r.inicio)).toISOString(),
    importadoWh: num(r.importado_wh) ?? 0,
    exportadoWh: num(r.exportado_wh) ?? 0,
    potenciaMaxW: num(r.potencia_max_w),
    tensaoMinV: num(r.tensao_min_v),
    tensaoMaxV: num(r.tensao_max_v),
    tensaoMedV: num(r.tensao_med_v),
    fpMedio: num(r.fp_medio),
    minTensaoPrecaria: num(r.min_tensao_precaria) ?? 0,
    minTensaoCritica: num(r.min_tensao_critica) ?? 0,
    minAcima242: num(r.min_acima_242) ?? 0,
    segundosCobertos: num(r.segundos_cobertos) ?? 0,
  };
}

/** Canal (entrada A/B/C) onde está o sensor do cabo da rede. Padrão: C (2). */
export const canalRede = (m: Pick<MedidorRow, 'canais'>): number => m.canais?.rede ?? 2;

const r3 = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 1000);
const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

export function criarEnergiaRepo(client: SupabaseClient): EnergiaDb {
  async function paginar<T>(montar: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: Erro }>, onde: string): Promise<T[]> {
    const out: T[] = [];
    for (let p = 0; p < LIMITE_PAGINAS; p++) {
      const { data, error } = await montar(p * PAGINA, (p + 1) * PAGINA - 1);
      if (error) falhou(onde, error);
      const linhas = (data ?? []) as T[];
      out.push(...linhas);
      if (linhas.length < PAGINA) break;
    }
    return out;
  }

  return {
    async medidoresAtivos() {
      const { data, error } = await client.from('medidores_energia').select(COLUNAS_MEDIDOR).eq('ativo', true).limit(5000);
      if (error) falhou('medidores_energia', error);
      return (data ?? []) as unknown as MedidorRow[];
    },

    async todosMedidores() {
      const { data, error } = await client.from('medidores_energia').select(COLUNAS_MEDIDOR).limit(5000);
      if (error) falhou('medidores_energia', error);
      return (data ?? []) as unknown as MedidorRow[];
    },

    async vincularBrutoOrfao(m) {
      // Índice parcial medicoes_shelly_orfas (136): sem órfão, a busca é de graça.
      const { data, error } = await client.from('medicoes_shelly').select('id, medido_em')
        .eq('company_id', m.company_id).is('medidor_id', null).in('device_id', formasDoDeviceId(m.device_id))
        .order('medido_em', { ascending: true }).limit(LOTE_ORFAOS);
      if (error) falhou('medicoes_shelly', error);
      const linhas = (data ?? []) as Array<{ id: string; medido_em: string }>;
      if (linhas.length === 0) return { vinculadas: 0, maisAntiga: null, restam: false };
      for (let i = 0; i < linhas.length; i += PEDACO_IDS) {
        const ids = linhas.slice(i, i + PEDACO_IDS).map((l) => l.id);
        // `is null` de novo: rodar duas vezes (ou em paralelo) não troca o dono de nada.
        const { error: e2 } = await client.from('medicoes_shelly').update({ medidor_id: m.id })
          .eq('company_id', m.company_id).is('medidor_id', null).in('id', ids);
        if (e2) falhou('medicoes_shelly', e2);
      }
      return { vinculadas: linhas.length, maisAntiga: new Date(linhas[0].medido_em).toISOString(), restam: linhas.length >= LOTE_ORFAOS };
    },

    async diasAlteradosDepoisDeFechar(m, desde) {
      const linhas = await paginar<{ inicio: string; atualizado_em: string }>((de, a) => client.from('energia_15min')
        .select('inicio, atualizado_em')
        .eq('company_id', m.company_id).eq('medidor_id', m.id).eq('papel', 'rede').eq('canal', canalRede(m))
        .gte('atualizado_em', desde)
        .order('inicio', { ascending: true }).range(de, a), 'energia_15min');
      const mexidoEm = new Map<string, number>();
      for (const l of linhas) {
        const dia = diaBrt(l.inicio);
        mexidoEm.set(dia, Math.max(mexidoEm.get(dia) ?? 0, Date.parse(l.atualizado_em)));
      }
      const dias = [...mexidoEm.keys()].sort();
      const fechadoEm = new Map<string, number>();
      for (let i = 0; i < dias.length; i += 100) {
        const { data, error } = await client.from('energia_diaria').select('dia, fechado_em')
          .eq('company_id', m.company_id).eq('medidor_id', m.id).in('dia', dias.slice(i, i + 100));
        if (error) falhou('energia_diaria', error);
        for (const r of (data ?? []) as Array<{ dia: string; fechado_em: string }>) fechadoEm.set(String(r.dia).slice(0, 10), Date.parse(r.fechado_em));
      }
      return dias.filter((d) => !fechadoEm.has(d) || fechadoEm.get(d)! < mexidoEm.get(d)!);
    },

    async apagarBrutoOrfaoAntesDe(iso) {
      // Sem company_id de propósito: é a limpeza do cron (service role) do bruto
      // que NÃO é de medidor nenhum. Um lote por dia; o índice parcial das órfãs acha rápido.
      const { data, error } = await client.from('medicoes_shelly').select('id')
        .is('medidor_id', null).lt('medido_em', iso).limit(LOTE_ORFAOS);
      if (error) falhou('medicoes_shelly', error);
      const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
      let apagadas = 0;
      for (let i = 0; i < ids.length; i += PEDACO_IDS) {
        const { count, error: e2 } = await client.from('medicoes_shelly').delete({ count: 'exact' })
          .is('medidor_id', null).in('id', ids.slice(i, i + PEDACO_IDS));
        if (e2) falhou('medicoes_shelly', e2);
        apagadas += count ?? 0;
      }
      return apagadas;
    },

    async brutoEntre(m, desde, ate) {
      const linhas = await paginar<Record<string, unknown>>((de, a) => client.from('medicoes_shelly')
        .select('medido_em, potencia_w, tensao, fator_potencia, energia_wh, energia_devolvida_wh')
        .eq('company_id', m.company_id).eq('medidor_id', m.id).eq('canal', canalRede(m))
        .gte('medido_em', desde).lt('medido_em', ate)
        .order('medido_em', { ascending: true }).range(de, a), 'medicoes_shelly');
      return linhas.map((r): LeituraBruta => ({
        medidoEm: new Date(String(r.medido_em)).toISOString(),
        potenciaW: num(r.potencia_w) ?? 0,
        tensao: num(r.tensao),
        fatorPotencia: num(r.fator_potencia),
        energiaWh: num(r.energia_wh),
        energiaDevolvidaWh: num(r.energia_devolvida_wh),
      }));
    },

    async primeiraLeitura(m) {
      const { data, error } = await client.from('medicoes_shelly').select('medido_em')
        .eq('company_id', m.company_id).eq('medidor_id', m.id).eq('canal', canalRede(m)).order('medido_em', { ascending: true }).limit(1);
      if (error) falhou('medicoes_shelly', error);
      return (data?.[0] as { medido_em?: string } | undefined)?.medido_em ?? null;
    },

    async proximaLeitura(m, apos) {
      const { data, error } = await client.from('medicoes_shelly').select('medido_em')
        .eq('company_id', m.company_id).eq('medidor_id', m.id).eq('canal', canalRede(m)).gte('medido_em', apos).order('medido_em', { ascending: true }).limit(1);
      if (error) falhou('medicoes_shelly', error);
      return (data?.[0] as { medido_em?: string } | undefined)?.medido_em ?? null;
    },

    async ultimaJanela(m) {
      const { data, error } = await client.from('energia_15min').select('inicio')
        .eq('company_id', m.company_id).eq('medidor_id', m.id).eq('papel', 'rede').eq('canal', canalRede(m))
        // Backfill (colado à mão) não é "já agregado": se contasse, o cursor
        // pularia o bruto que ainda não virou 15 min.
        .neq('fonte', 'backfill')
        .order('inicio', { ascending: false }).limit(1);
      if (error) falhou('energia_15min', error);
      const v = (data?.[0] as { inicio?: string } | undefined)?.inicio;
      return v ? new Date(v).toISOString() : null;
    },

    async gravarJanelas(m, js, fonte: Fonte) {
      const canal = canalRede(m);
      for (let i = 0; i < js.length; i += 500) {
        const linhas = js.slice(i, i + 500).map((j) => ({
          medidor_id: m.id, company_id: m.company_id, papel: 'rede', canal, inicio: j.inicio,
          importado_wh: r3(j.importadoWh), exportado_wh: r3(j.exportadoWh), potencia_max_w: r2(j.potenciaMaxW),
          tensao_min_v: r2(j.tensaoMinV), tensao_max_v: r2(j.tensaoMaxV), tensao_med_v: r2(j.tensaoMedV), fp_medio: r3(j.fpMedio),
          min_tensao_precaria: j.minTensaoPrecaria, min_tensao_critica: j.minTensaoCritica, min_acima_242: j.minAcima242,
          segundos_cobertos: j.segundosCobertos, fonte, atualizado_em: new Date().toISOString(),
        }));
        const { error } = await client.from('energia_15min').upsert(linhas, { onConflict: 'medidor_id,papel,canal,inicio' });
        if (error) falhou('energia_15min', error);
      }
    },

    async janelasDoDia(m, dia) {
      const linhas = await paginar<Record<string, unknown>>((de, a) => client.from('energia_15min').select('*')
        .eq('company_id', m.company_id).eq('medidor_id', m.id).eq('papel', 'rede').eq('canal', canalRede(m))
        .gte('inicio', inicioDoDiaBrtIso(dia)).lt('inicio', inicioDoDiaBrtIso(somarDias(dia, 1)))
        .order('inicio', { ascending: true }).range(de, a), 'energia_15min');
      return linhas.map(linhaParaJanela);
    },

    async geracaoDoDia(m, dia) {
      if (!m.sistema_id) return null;
      const { data, error } = await client.from('geracao_diaria').select('geracao_kwh')
        .eq('company_id', m.company_id).eq('sistema_id', m.sistema_id).eq('data', dia).limit(1);
      if (error) falhou('geracao_diaria', error);
      return num((data?.[0] as { geracao_kwh?: unknown } | undefined)?.geracao_kwh);
    },

    async gravarDia(m, r: DiaParaGravar) {
      const { error } = await client.from('energia_diaria').upsert({
        medidor_id: m.id, company_id: m.company_id, dia: r.dia,
        importado_kwh: r3(r.importadoKwh), exportado_kwh: r3(r.exportadoKwh),
        geracao_kwh: r3(r.geracaoKwh), consumo_kwh: r3(r.consumoKwh),
        imp_ponta_kwh: r3(r.impPontaKwh), imp_intermediario_kwh: r3(r.impIntermediarioKwh), imp_fora_ponta_kwh: r3(r.impForaPontaKwh),
        demanda_max_w: r2(r.demandaMaxW), demanda_max_inicio: r.demandaMaxInicio, base_noturna_w: r2(r.baseNoturnaW),
        tensao_min_v: r2(r.tensaoMinV), tensao_max_v: r2(r.tensaoMaxV), min_precaria: r.minPrecaria, min_critica: r.minCritica,
        cobertura_pct: Math.round(r.coberturaPct * 100) / 100, fechado_em: new Date().toISOString(),
      }, { onConflict: 'medidor_id,dia' });
      if (error) falhou('energia_diaria', error);
    },

    async gravarLeituraSintetica(m, l: LeituraMedidor, medidoEmBruto) {
      const medidoEm = limitarAoAgora(medidoEmBruto); // relógio do aparelho adiantado não vai pro futuro
      const { error } = await client.from('medicoes_shelly').upsert({
        company_id: m.company_id, medidor_id: m.id, lead_id: m.lead_id, device_id: m.device_id, apelido: m.apelido,
        canal: canalRede(m), medido_em: medidoEm,
        tensao: l.tensao, corrente: l.corrente, potencia_w: l.potenciaW, potencia_va: l.potenciaVa,
        fator_potencia: l.fatorPotencia, energia_wh: l.energiaWh, energia_devolvida_wh: l.energiaDevolvidaWh,
      }, { onConflict: 'device_id,canal,medido_em', ignoreDuplicates: true });
      if (error) falhou('medicoes_shelly', error);
      const { error: e2 } = await client.from('medidores_energia').update({ ultima_leitura_em: medidoEm })
        .eq('id', m.id).eq('company_id', m.company_id);
      if (e2) falhou('medidores_energia', e2);
    },

    async atualizarStatus(m, p) {
      const { error } = await client.from('medidores_energia').update({ ...p, updated_at: new Date().toISOString() })
        .eq('id', m.id).eq('company_id', m.company_id);
      if (error) falhou('medidores_energia', error);
    },

    async apagarBrutoAntesDe(m, iso) {
      const { count, error } = await client.from('medicoes_shelly').delete({ count: 'exact' })
        .eq('company_id', m.company_id).eq('medidor_id', m.id).lt('medido_em', iso);
      if (error) falhou('medicoes_shelly', error);
      return count ?? 0;
    },

    async apagar15minAntesDe(m, iso) {
      const { count, error } = await client.from('energia_15min').delete({ count: 'exact' })
        .eq('company_id', m.company_id).eq('medidor_id', m.id).lt('inicio', iso);
      if (error) falhou('energia_15min', error);
      return count ?? 0;
    },
  };
}
