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
    }));

    const abertos = await this.supabase.getAlertasAbertosBySistemas(
      sistemas.map((s) => s.id),
    ) as MonitoringAlertRow[];

    const { novos, resolvidos, persistentes_devidos } = detectarAlertasPendentes(sistemas, abertos, hoje);

    for (const id of resolvidos) {
      await this.supabase.resolverAlerta(id, hoje.toISOString(), 'auto');
    }
    for (const n of novos) {
      await this.supabase.criarAlertaPendente({
        sistema_id: n.sistema_id,
        tipo: n.alerta.tipo,
        severidade: n.alerta.severidade,
        texto: n.alerta.texto,
        primeiro_visto_em: hoje.toISOString(),
        next_send_at: hoje.toISOString(),
      });
    }
    // persistentes_devidos: nada aqui — dispatcher pega pela fila do DB

    console.log(
      `[proactive-alerts] detect: ${sistemas.length} sistemas, ${novos.length} novos, ${resolvidos.length} resolvidos, ${persistentes_devidos.length} persistentes`,
    );
    return { novos: novos.length, resolvidos: resolvidos.length, persistentes: persistentes_devidos.length };
  }
}
