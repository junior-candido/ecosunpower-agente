// src/modules/monitoring/proactive-alerts/format.ts
import type { MonitoringAlertRow, FormattedAlert, AlertButton } from './types.js';

interface SistemaResumo {
  id: string;
  apelido: string;
  potencia_kwp: number | null;
  marca_inversor: string;
}
interface LeadResumo {
  id: string;
  name: string | null;
  phone: string;
}

function nomeCliente(lead: LeadResumo | null, sistema: SistemaResumo): string {
  if (lead?.name) return lead.name;
  if (lead) return 'Cliente sem nome cadastrado';
  return sistema.apelido ?? 'Cliente sem nome cadastrado';
}

function header(tipo: MonitoringAlertRow['tipo']): string {
  switch (tipo) {
    case 'sistema_offline': return '🔴 OFFLINE';
    case 'queda_geracao': return '🟡 QUEDA';
    case 'erro_integracao': return '🔴 INTEGRAÇÃO';
    case 'milestone_economia': return '🟢 BOMBANDO';
  }
}

function botoesFor(tipo: MonitoringAlertRow['tipo'], sId: string): AlertButton[] {
  switch (tipo) {
    case 'sistema_offline':
      return [
        { id: `evabt:alert-eva-offline:${sId}`, title: '🔧 Eva avisar' },
        { id: `evabt:alert-ligar:${sId}`, title: '📞 Eu ligar' },
        { id: `evabt:alert-snooze3d:${sId}`, title: '💤 Adiar 3d' },
      ];
    case 'queda_geracao':
      return [
        { id: `evabt:alert-eva-limpeza:${sId}`, title: '🧽 Eva limpeza' },
        { id: `evabt:alert-ligar:${sId}`, title: '📞 Eu ligar' },
        { id: `evabt:alert-snooze3d:${sId}`, title: '💤 Adiar 3d' },
      ];
    case 'erro_integracao':
      return [
        { id: `evabt:alert-ver:${sId}`, title: '🔍 Ver detalhe' },
        { id: `evabt:alert-snooze3d:${sId}`, title: '💤 Adiar 3d' },
        { id: `evabt:alert-resolvido:${sId}`, title: '✅ Já resolvi' },
      ];
    case 'milestone_economia':
      return [
        { id: `evabt:alert-eva-depoimento:${sId}`, title: '⭐ Eva depoimento' },
        { id: `evabt:alert-snooze7d:${sId}`, title: '💤 Adiar 7d' },
        { id: `evabt:alert-ignorar:${sId}`, title: '❌ Ignorar' },
      ];
  }
}

export function formatAlertMessage(
  alerta: MonitoringAlertRow,
  sistema: SistemaResumo,
  lead: LeadResumo | null,
): FormattedAlert {
  const nome = nomeCliente(lead, sistema);
  const kwp = sistema.potencia_kwp != null ? `${sistema.potencia_kwp} kWp` : '— kWp';
  const marca = sistema.marca_inversor ?? 'inversor';
  const linha1 = `${header(alerta.tipo)}`;
  const linha2 = alerta.tipo === 'erro_integracao'
    ? `${nome} — ${marca}`
    : `${nome} — ${kwp} (${marca})`;
  const texto = `${linha1}\n${linha2}\n${alerta.texto}`;
  return {
    texto,
    botoes: botoesFor(alerta.tipo, sistema.id),
    footer: `sistema ${sistema.id.slice(0, 8)}`,
  };
}
