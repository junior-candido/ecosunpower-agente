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
}
