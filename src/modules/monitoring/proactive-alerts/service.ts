// src/modules/monitoring/proactive-alerts/service.ts
import type { SupabaseService } from '../../supabase.js';
import type { MonitoringService } from '../service.js';
import { detectarAlertasPendentes } from './detect.js';
import type { SistemaParaDetect, MonitoringAlertRow } from './types.js';

interface SistemaListadoDashboard {
  id: string;
  lead_id: string | null;
  ativo: boolean;
  ultimo_erro: string | null;
  potencia_kwp: number | null;
  uf: string | null;
  geracao_7d_kwh: number;
  diasSemGeracao?: number;          // se monitoring expor; senão derive
  status_inversor?: 'ok' | 'offline' | 'falha' | 'desconhecido' | null; // 084
}

export class ProactiveAlertService {
  constructor(
    private supabase: SupabaseService,
    private monitoring: MonitoringService,
  ) {}

  async runDetectionCycle(hoje: Date): Promise<{ novos: number; resolvidos: number; persistentes: number }> {
    const sistemasRaw = await this.monitoring.listarParaDashboard() as SistemaListadoDashboard[];
    const sistemas: SistemaParaDetect[] = sistemasRaw.map((s) => ({
      id: s.id,
      lead_id: s.lead_id,
      ativo: s.ativo,
      ultimo_erro: s.ultimo_erro,
      potencia_kwp: s.potencia_kwp,
      uf: s.uf,
      diasSemGeracao: s.diasSemGeracao ?? (s.geracao_7d_kwh > 0 ? 0 : 7),  // proxy
      realUltimos7: s.geracao_7d_kwh,
      status_inversor: s.status_inversor ?? null,
    }));

    const abertos = await this.supabase.getAlertasAbertosBySistemas(
      sistemas.map((s) => s.id),
    ) as MonitoringAlertRow[];

    const { novos, resolvidos, persistentes_devidos } = detectarAlertasPendentes(sistemas, abertos, hoje);

    for (const id of resolvidos) {
      await this.supabase.resolverAlerta(id, hoje.toISOString(), 'auto');
    }
    // [Fase 2 A3] alerta nasce carimbado com a empresa DONA do sistema (uma
    // consulta leve por ciclo; o detector puro não precisa saber de tenant).
    let donoDe = new Map<string, string | null>();
    if (novos.length > 0) {
      const { data: donos } = await this.supabase.getClient()
        .from('sistemas_clientes')
        .select('id, company_id')
        .in('id', novos.map((n) => n.sistema_id));
      donoDe = new Map((donos ?? []).map((d: any) => [d.id as string, (d.company_id as string | null) ?? null]));
    }
    for (const n of novos) {
      await this.supabase.criarAlertaPendente({
        sistema_id: n.sistema_id,
        tipo: n.alerta.tipo,
        severidade: n.alerta.severidade,
        texto: n.alerta.texto,
        primeiro_visto_em: hoje.toISOString(),
        next_send_at: hoje.toISOString(),
        company_id: donoDe.get(n.sistema_id) ?? null,
      });
    }
    // persistentes_devidos: nada aqui — dispatcher pega pela fila do DB

    console.log(
      `[proactive-alerts] detect: ${sistemas.length} sistemas, ${novos.length} novos, ${resolvidos.length} resolvidos, ${persistentes_devidos.length} persistentes`,
    );
    return { novos: novos.length, resolvidos: resolvidos.length, persistentes: persistentes_devidos.length };
  }
}
