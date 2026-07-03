import type { SupabaseService } from '../supabase.js';
import { getAdapter } from './adapter-registry.js';
import type { AdapterContext, SistemaCliente } from './types.js';

// A API (Sungrow) devolve W/Wh; o catálogo guarda kW/kWh -> fator 0.001. V/A/Hz/°C = 1.
export function fatorDaUnidade(unidade: string): number {
  return unidade === 'kW' || unidade === 'kWh' ? 0.001 : 1;
}

export function montarCatalogo(
  rows: Array<{ ponto_nativo: string; ponto: string; unidade: string; categoria: string }>,
): Map<string, { ponto: string; unidade: string; fator: number }> {
  const m = new Map<string, { ponto: string; unidade: string; fator: number }>();
  for (const r of rows) m.set(r.ponto_nativo, { ponto: r.ponto, unidade: r.unidade, fator: fatorDaUnidade(r.unidade) });
  return m;
}

// Agrega leituras finas em resumo diário por (sistema, device, ponto, dia).
export function agregarDia(
  rows: Array<{ sistema_id: string; device_key: string; ponto: string; ts: string; valor: number; unidade: string }>,
): Array<{ sistema_id: string; device_key: string; ponto: string; dia: string; valor_min: number; valor_max: number; valor_med: number; unidade: string }> {
  const g = new Map<string, { sistema_id: string; device_key: string; ponto: string; dia: string; unidade: string; vs: number[] }>();
  for (const r of rows) {
    const dia = r.ts.slice(0, 10);
    const k = `${r.sistema_id}|${r.device_key}|${r.ponto}|${dia}`;
    if (!g.has(k)) g.set(k, { sistema_id: r.sistema_id, device_key: r.device_key, ponto: r.ponto, dia, unidade: r.unidade, vs: [] });
    g.get(k)!.vs.push(r.valor);
  }
  return [...g.values()].map((x) => ({
    sistema_id: x.sistema_id, device_key: x.device_key, ponto: x.ponto, dia: x.dia, unidade: x.unidade,
    valor_min: Math.min(...x.vs), valor_max: Math.max(...x.vs),
    valor_med: Number((x.vs.reduce((a, b) => a + b, 0) / x.vs.length).toFixed(4)),
  }));
}

// Provê o AdapterContext (pra persistir rotação de token). MonitoringService cumpre isso.
export interface CtxProvider { buildAdapterContext(s: SistemaCliente): AdapterContext }

export class TelemetriaService {
  constructor(private supabase: SupabaseService, private ctxProvider: CtxProvider) {}

  // Tira uma foto (agora) das grandezas catalogadas de todos os sistemas ativos
  // cuja marca implementa fetchTelemetry, e grava em telemetria_medicoes.
  async coletar(agoraIso: string): Promise<{ sistemas: number; medicoes: number; falhas: number }> {
    const client = this.supabase.getClient();
    const { data: sistemas } = await client.from('sistemas_clientes').select('*').eq('ativo', true);
    let medicoes = 0, falhas = 0, n = 0;
    for (const s of (sistemas ?? []) as SistemaCliente[]) {
      const adapter = getAdapter(s.marca_inversor);
      if (!adapter?.fetchTelemetry) continue;
      const { data: cat } = await client
        .from('telemetria_catalogo')
        .select('ponto_nativo,ponto,unidade,categoria')
        .eq('marca', s.marca_inversor)
        .eq('device_type', 1);
      if (!cat || cat.length === 0) continue;
      const catalogo = montarCatalogo(cat as Array<{ ponto_nativo: string; ponto: string; unidade: string; categoria: string }>);
      n++;
      try {
        const r = await adapter.fetchTelemetry(s.api_credentials, catalogo, agoraIso, this.ctxProvider.buildAdapterContext(s));
        if (!r.ok) { falhas++; continue; }
        const rows = r.devices.flatMap((d) =>
          d.leituras.map((l) => ({ sistema_id: s.id, device_key: d.deviceKey, ponto: l.ponto, ts: l.ts, valor: l.valor, unidade: l.unidade })),
        );
        if (rows.length === 0) continue;
        const { error } = await client.from('telemetria_medicoes').upsert(rows, { onConflict: 'sistema_id,device_key,ponto,ts' });
        if (error) { falhas++; console.warn(`[telemetria] upsert sistema=${s.id}: ${error.message}`); continue; }
        medicoes += rows.length;
      } catch (err) { falhas++; console.warn(`[telemetria] sistema=${s.id} excecao: ${(err as Error).message}`); }
    }
    return { sistemas: n, medicoes, falhas };
  }

  // Resume as leituras finas com mais de 6 meses em telemetria_resumo (diário) e
  // apaga as finas antigas. `corteIso` = limite (tudo com ts < corte é resumido).
  async resumirAntigos(corteIso: string): Promise<{ resumidos: number; apagados: number }> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('telemetria_medicoes')
      .select('sistema_id,device_key,ponto,ts,valor,unidade')
      .lt('ts', corteIso);
    if (error) { console.warn(`[telemetria] resumirAntigos select: ${error.message}`); return { resumidos: 0, apagados: 0 }; }
    const rows = (data ?? []) as Array<{ sistema_id: string; device_key: string; ponto: string; ts: string; valor: number; unidade: string }>;
    if (rows.length === 0) return { resumidos: 0, apagados: 0 };
    const resumo = agregarDia(rows);
    const up = await client.from('telemetria_resumo').upsert(resumo, { onConflict: 'sistema_id,device_key,ponto,dia' });
    if (up.error) { console.warn(`[telemetria] resumirAntigos upsert: ${up.error.message}`); return { resumidos: 0, apagados: 0 }; }
    const del = await client.from('telemetria_medicoes').delete().lt('ts', corteIso);
    if (del.error) { console.warn(`[telemetria] resumirAntigos delete: ${del.error.message}`); return { resumidos: resumo.length, apagados: 0 }; }
    return { resumidos: resumo.length, apagados: rows.length };
  }

  // Pra tela "Dados": dispositivos que já reportaram + as grandezas do catálogo
  // (rótulo/unidade amigáveis) da marca do sistema.
  async listarGrandezas(
    sistemaId: string,
    marca: string,
  ): Promise<{ devices: string[]; grandezas: Array<{ ponto: string; rotulo: string; unidade: string }> }> {
    const client = this.supabase.getClient();
    const { data: meds } = await client.from('telemetria_medicoes').select('device_key').eq('sistema_id', sistemaId);
    const devices = [...new Set((meds ?? []).map((m: { device_key: string }) => m.device_key))].sort();
    const { data: cat } = await client
      .from('telemetria_catalogo')
      .select('ponto,rotulo,unidade')
      .eq('marca', marca)
      .eq('device_type', 1);
    const grandezas = (cat ?? []).map((c: { ponto: string; rotulo: string; unidade: string }) => ({ ponto: c.ponto, rotulo: c.rotulo, unidade: c.unidade }));
    return { devices, grandezas };
  }

  // Série de uma grandeza no tempo (fino, de telemetria_medicoes) a partir de `inicioIso`.
  async serieTelemetria(
    sistemaId: string,
    deviceKey: string,
    ponto: string,
    inicioIso: string,
  ): Promise<Array<{ ts: string; valor: number }>> {
    const client = this.supabase.getClient();
    const { data } = await client
      .from('telemetria_medicoes')
      .select('ts,valor')
      .eq('sistema_id', sistemaId)
      .eq('device_key', deviceKey)
      .eq('ponto', ponto)
      .gte('ts', inicioIso)
      .order('ts', { ascending: true })
      .limit(5000);
    return (data ?? []).map((r: { ts: string; valor: number }) => ({ ts: r.ts, valor: Number(r.valor) }));
  }
}
