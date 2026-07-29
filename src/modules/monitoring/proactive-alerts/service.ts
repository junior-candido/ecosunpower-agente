// src/modules/monitoring/proactive-alerts/service.ts
import type { SupabaseService } from '../../supabase.js';
import type { MonitoringService } from '../service.js';
import { empresaDe } from '../../empresa-config.js';
import { detectarAlertasPendentes } from './detect.js';
import { avaliarTelemetriaUsina, type MedicaoFina } from './telemetria-regras.js';
import { buscarPaginado } from '../paginacao.js';
import { getAdapter } from '../adapter-registry.js';
import type { MarcaInversor } from '../types.js';
import type { SistemaParaDetect, MonitoringAlertRow } from './types.js';

interface SistemaListadoDashboard {
  id: string;
  company_id?: string | null;
  marca_inversor?: string;
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
      corteAtencao: empresaDe(s.company_id).reguaAtencaoPct / 100, // 085
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

  // [Fase 2B] Vigias de TENSÃO e CORRENTE — 1×/dia (18h BRT, ver index.ts).
  // Lê as medições finas dos últimos 3 dias (só sistemas cuja marca coleta
  // telemetria), roda as regras puras e cria/resolve os alertas
  // tensao_rede_alta / string_zerada. Dispatcher/fila existentes despacham.
  async runTelemetriaRulesCycle(hoje: Date): Promise<{ novos: number; resolvidos: number }> {
    const client = this.supabase.getClient();
    const sistemasRaw = await this.monitoring.listarParaDashboard() as SistemaListadoDashboard[];
    const sistemas = sistemasRaw.filter((s) => s.ativo && s.marca_inversor && getAdapter(s.marca_inversor as MarcaInversor)?.fetchTelemetry);
    if (sistemas.length === 0) return { novos: 0, resolvidos: 0 };

    const desdeIso = new Date(hoje.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const desdeDia = desdeIso.slice(0, 10);
    const abertos = (await this.supabase.getAlertasAbertosBySistemas(
      sistemas.map((s) => s.id),
    ) as MonitoringAlertRow[]).filter(
      (a) => !a.resolved_at && (a.tipo === 'tensao_rede_alta' || a.tipo === 'string_zerada'),
    );

    let novos = 0, resolvidos = 0;
    for (const s of sistemas) {
      // medições finas 3d (só pontos das regras) — paginado (teto 1000)
      const medicoes = await buscarPaginado(() => client
        .from('telemetria_medicoes')
        .select('ponto, ts, valor')
        .eq('sistema_id', s.id)
        .gte('ts', desdeIso)
        // curinga do PostgREST dentro de .or() é * (vira % no SQL)
        .or('ponto.like.tensao_fase*,ponto.like.corrente_pv*,ponto.like.corrente_mppt*')
        .order('ts', { ascending: true })) as MedicaoFina[];

      const { data: ger } = await client
        .from('geracao_diaria')
        .select('data, geracao_kwh')
        .eq('sistema_id', s.id)
        .gte('data', desdeDia);
      const geracaoPorDia = new Map<string, number>(
        ((ger ?? []) as Array<{ data: string; geracao_kwh: number }>).map((g) => [g.data, Number(g.geracao_kwh) || 0]),
      );

      const atuais = avaliarTelemetriaUsina(medicoes, geracaoPorDia);
      const abertosDoSistema = abertos.filter((a) => a.sistema_id === s.id);

      for (const alerta of atuais) {
        const jaAberto = abertosDoSistema.find((a) => a.tipo === alerta.tipo);
        if (jaAberto) continue; // dedupe: aberto persiste; fila cuida do re-envio
        await this.supabase.criarAlertaPendente({
          sistema_id: s.id,
          tipo: alerta.tipo,
          severidade: alerta.severidade,
          texto: alerta.texto,
          primeiro_visto_em: hoje.toISOString(),
          next_send_at: hoje.toISOString(),
          company_id: (s as any).company_id ?? null,
        });
        novos++;
      }
      for (const aberto of abertosDoSistema) {
        if (!atuais.find((a) => a.tipo === aberto.tipo)) {
          await this.supabase.resolverAlerta(aberto.id, hoje.toISOString(), 'auto');
          resolvidos++;
        }
      }
    }
    console.log(`[proactive-alerts] telemetria: ${sistemas.length} sistemas, ${novos} novos, ${resolvidos} resolvidos`);
    return { novos, resolvidos };
  }
}
