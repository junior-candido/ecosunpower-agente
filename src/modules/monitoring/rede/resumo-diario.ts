// Radar da Rede — resumo diário por usina (Energy Studio, Marco 2 — 02/10/2026).
// Lê a tensão do dia de TODAS as usinas que mandam tensão (telemetria do
// inversor ou medidor Shelly), roda a mesma análise da aba Rede e grava uma
// linha por usina e dia em rede_resumo_diario. Idempotente (upsert).
import type { SupabaseClient } from '@supabase/supabase-js';
import { ECOSUN_COMPANY_ID } from '../../tenant-resolver.js';
import { analisarRede, type LeituraTensao, type PontoGeracao } from './analise.js';

export interface ResumoRedeRodada { dia: string; usinas: number; gravadas: number; criticas: number }

async function lerTudo<T>(montar: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < 200; p++) {
    const { data, error } = await montar().range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export async function resumirRedeDoDia(
  db: SupabaseClient,
  dia: string,
  empresaTemModulo: (companyId: string) => Promise<boolean>,
): Promise<ResumoRedeRodada> {
  const ini = new Date(`${dia}T03:00:00Z`).toISOString();
  const fim = new Date(Date.parse(ini) + 86400_000).toISOString();

  // Inversor: tensão por fase + potência (para achar desarmes)
  const tens = await lerTudo<{ sistema_id: string; ponto: string; ts: string; valor: number }>(() => db.from('telemetria_medicoes')
    .select('sistema_id, ponto, ts, valor').like('ponto', 'tensao_fase%').gte('ts', ini).lt('ts', fim)
    .order('sistema_id', { ascending: true }).order('ts', { ascending: true }));
  const pot = await lerTudo<{ sistema_id: string; ts: string; valor: number }>(() => db.from('telemetria_medicoes')
    .select('sistema_id, ts, valor').eq('ponto', 'potencia').gte('ts', ini).lt('ts', fim)
    .order('sistema_id', { ascending: true }).order('ts', { ascending: true }));

  const porUsina = new Map<string, { L: LeituraTensao[]; G: PontoGeracao[]; fonte: string; nominal: 127 | 220 | 380 | null }>();
  const pegar = (id: string, fonte: string) => {
    let u = porUsina.get(id);
    if (!u) porUsina.set(id, (u = { L: [], G: [], fonte, nominal: null }));
    return u;
  };
  for (const t of tens) pegar(t.sistema_id, 'inversor').L.push({ ts: t.ts, fase: t.ponto, v: Number(t.valor) });
  for (const p of pot) if (porUsina.has(p.sistema_id)) pegar(p.sistema_id, 'inversor').G.push({ ts: p.ts, kw: Number(p.valor) });

  // Shelly (medidor ligado à usina), só para quem não tem tensão do inversor
  const meds = await lerTudo<{ id: string; sistema_id: string | null; tensao_nominal_v: number | null }>(() => db.from('medidores_energia')
    .select('id, sistema_id, tensao_nominal_v').not('sistema_id', 'is', null).order('id', { ascending: true }));
  const medDe = new Map(meds.filter((m) => m.sistema_id && !porUsina.has(m.sistema_id)).map((m) => [m.id, m]));
  if (medDe.size) {
    const q = await lerTudo<{ medidor_id: string; canal: number; inicio: string; tensao_max_v: number | null }>(() => db.from('energia_15min')
      .select('medidor_id, canal, inicio, tensao_max_v').in('medidor_id', [...medDe.keys()]).eq('papel', 'rede')
      .gte('inicio', ini).lt('inicio', fim).order('medidor_id', { ascending: true }).order('inicio', { ascending: true }));
    for (const r of q) {
      const m = medDe.get(r.medidor_id);
      if (!m?.sistema_id || r.tensao_max_v == null) continue;
      const u = pegar(m.sistema_id, 'shelly');
      const n = Number(m.tensao_nominal_v);
      u.nominal = n === 127 || n === 220 || n === 380 ? n : null;
      u.L.push({ ts: r.inicio, fase: `Canal ${r.canal}`, v: Number(r.tensao_max_v) });
    }
  }
  if (!porUsina.size) return { dia, usinas: 0, gravadas: 0, criticas: 0 };

  // Empresa de cada usina + módulo contratado
  const ids = [...porUsina.keys()];
  const sis: Array<{ id: string; company_id: string | null }> = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('sistemas_clientes').select('id, company_id').in('id', ids.slice(i, i + 200));
    sis.push(...((data ?? []) as Array<{ id: string; company_id: string | null }>));
  }
  const contratou = new Map<string, boolean>();
  const linhas: Record<string, unknown>[] = [];
  let criticas = 0;
  for (const s of sis) {
    const cid = s.company_id ?? ECOSUN_COMPANY_ID;
    if (!contratou.has(cid)) { try { contratou.set(cid, await empresaTemModulo(cid)); } catch { contratou.set(cid, false); } }
    if (!contratou.get(cid)) continue;
    const u = porUsina.get(s.id)!;
    const a = analisarRede(u.L, u.G, u.nominal);
    if (a.nivel === 'sem_dado') continue;
    if (a.nivel === 'critico') criticas++;
    linhas.push({
      sistema_id: s.id, dia, company_id: cid, nominal_v: a.nominal,
      v_min: Math.min(...a.fases.map((f) => f.min)), v_max: Math.max(...a.fases.map((f) => f.max)),
      min_precaria: a.fases.reduce((x, f) => x + f.minutos.precaria, 0),
      min_critica: a.fases.reduce((x, f) => x + f.minutos.critica, 0),
      min_acima_desarme: a.fases.reduce((x, f) => x + f.minutosAcimaDesarme, 0),
      desarmes: a.desarmes.length, nivel: a.nivel, fonte: u.fonte, calculado_em: new Date().toISOString(),
    });
  }
  for (let i = 0; i < linhas.length; i += 200) {
    const { error } = await db.from('rede_resumo_diario').upsert(linhas.slice(i, i + 200), { onConflict: 'sistema_id,dia' });
    if (error) throw new Error(`gravando resumo da rede: ${error.message}`);
  }
  console.log(`[rede] ${dia}: ${porUsina.size} usinas com tensão · ${linhas.length} gravadas · ${criticas} críticas`);
  return { dia, usinas: porUsina.size, gravadas: linhas.length, criticas };
}
