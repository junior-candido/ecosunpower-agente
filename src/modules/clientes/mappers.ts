// src/modules/clientes/mappers.ts
import type { InstallationStatus, JornadaFase } from './types.js';

const FASES_ORDEM: JornadaFase[] = ['lead', 'proposta', 'contrato', 'instalado', 'operando', 'pos_venda'];

export function instalacaoFase(status: InstallationStatus): JornadaFase {
  switch (status) {
    case 'qualificado': return 'proposta';
    case 'proposta_aceita':
    case 'contrato_assinado': return 'contrato';
    case 'instalado':
    case 'medidor_trocado': return 'instalado';
    case 'operando': return 'operando';
    case 'pos_venda_concluido': return 'pos_venda';
    default: return 'lead';
  }
}

const CLIENTE_STATUSES = new Set<InstallationStatus>([
  'contrato_assinado', 'instalado', 'medidor_trocado',
  'operando', 'pos_venda_concluido',
]);
export function isCliente(status: InstallationStatus): boolean {
  return CLIENTE_STATUSES.has(status);
}

const LABELS: Record<string, string> = {
  novo: 'Novo lead',
  qualificando: 'Qualificando',
  qualificado: 'Qualificado',
  proposta_aceita: 'Proposta aceita',
  contrato_assinado: 'Contrato assinado',
  instalado: 'Instalado',
  medidor_trocado: 'Medidor trocado',
  operando: 'Operando',
  pos_venda_concluido: 'Pós-venda concluído',
};
export function statusLabel(status: InstallationStatus): string {
  if (!status) return '—';
  return LABELS[status] ?? status;
}

export function statusCorChip(status: InstallationStatus): string {
  switch (status) {
    case 'operando':
    case 'pos_venda_concluido':
      return 'bg-green-500/15 border-green-500/40 text-green-400';
    case 'instalado':
    case 'medidor_trocado':
    case 'contrato_assinado':
      return 'bg-sky-500/15 border-sky-500/40 text-sky-400';
    case 'proposta_aceita':
    case 'qualificado':
      return 'bg-amber-500/15 border-amber-500/40 text-amber-400';
    default:
      return 'bg-slate-500/15 border-slate-500/40 text-slate-400';
  }
}

export function faseConcluida(faseAlvo: JornadaFase, faseAtual: JornadaFase): boolean {
  return FASES_ORDEM.indexOf(faseAlvo) <= FASES_ORDEM.indexOf(faseAtual);
}
