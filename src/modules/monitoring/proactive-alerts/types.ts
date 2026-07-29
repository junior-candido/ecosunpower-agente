// src/modules/monitoring/proactive-alerts/types.ts
import type { Alerta } from '../classificacao.js';

export type AlertSeveridade = 'urgente' | 'aviso' | 'info';
export type AlertTipo =
  | 'sistema_offline'
  | 'queda_geracao'
  | 'erro_integracao'
  | 'milestone_economia'
  // Fase 2B: vigias de telemetria (ciclo diário próprio; o detect de geração
  // NÃO cria nem resolve estes — ver FAMILIA_GERACAO no detect.ts)
  | 'tensao_rede_alta'
  | 'string_zerada';

// Row em monitoring_alerts (linha 1:1 do DB)
export interface MonitoringAlertRow {
  id: string;
  sistema_id: string;
  tipo: AlertTipo;
  severidade: AlertSeveridade;
  texto: string;
  primeiro_visto_em: string;       // ISO timestamptz
  last_sent_at: string | null;
  next_send_at: string | null;
  snoozed_until: string | null;
  resolved_at: string | null;
  resolved_reason: string | null;
  acao_disparada: string | null;
  acao_disparada_em: string | null;
  created_at: string;
}

// Saída de detect.ts (intenções, ainda não aplicadas em DB)
export interface DetectOutput {
  novos: Array<{ sistema_id: string; alerta: Alerta }>;
  resolvidos: string[];            // ids de monitoring_alerts existentes
  persistentes_devidos: string[];  // ids existentes prontos pra re-envio
}

// Input mínimo de sistema pro detect (não força acoplar com tipo completo)
export interface SistemaParaDetect {
  id: string;
  lead_id: string | null;
  ativo: boolean;
  ultimo_erro: string | null;
  potencia_kwp: number | null;
  uf: string | null;
  diasSemGeracao: number;
  realUltimos7: number;
  // 084: último status do adapter — dá o MOTIVO no texto do alerta (fatia 1).
  status_inversor?: 'ok' | 'offline' | 'falha' | 'desconhecido' | null;
  // 085: régua da empresa dona (fração; ausente = 0.70).
  corteAtencao?: number | null;
  // 29/07: mediana de kWh/kWp em 7d da carteira da MESMA empresa
  // (régua relativa — ausente = régua absoluta de HSP).
  medianaCarteira7d?: number | null;
}

// Botão WABA
export interface AlertButton {
  id: string;      // ex 'evabt:alert-eva-limpeza:<sId>'
  title: string;   // ex '🧽 Eva agendar limpeza' (max 20 chars WABA)
}

// Resultado de format.ts
export interface FormattedAlert {
  texto: string;
  botoes: AlertButton[];
  footer?: string;
}
