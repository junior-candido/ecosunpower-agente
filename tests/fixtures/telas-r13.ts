// Onda 3 — R13: Manutenção + OS. Telas renovadas com dados FICTÍCIOS em volume n
// (usadas pelo teste "telas leves" e por scripts/medir-telas-leves.ts).
import type { DashUser } from '../../src/modules/dashboard/permissions.js';
import { renderManutencaoPage } from '../../src/modules/dashboard/manutencao-views.js';
import { renderOSPage } from '../../src/modules/dashboard/os-views.js';
import { hidratarChecklist } from '../../src/modules/dashboard/os-checklist.js';
import type { AgendaItem, LeituraPendente } from '../../src/modules/dashboard/manutencao-queries.js';
import type { ManutencaoTipo } from '../../src/modules/dashboard/manutencao-motor.js';

/** Classes fora do padrão cc- que a tela usa de propósito (gancho de JS ou de teste antigo). */
export const CLASSES_R13: string[] = [
  // Botão que abre o modal de leitura: o script da tela procura '.pv-leitura'.
  'pv-leitura',
];

const TIPOS: ManutencaoTipo[] = ['limpeza', 'revisao_inversor', 'revisao_eletrica', 'corretiva', 'inspecao'];
const dia = (d: number) => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);

export function telasR13(n: number, user: DashUser): Record<string, string> {
  const agenda: AgendaItem[] = Array.from({ length: n }, (_, i) => ({
    id: `m-${i}`, sistemaId: `s-${i}`, apelido: `Usina Exemplo ${i + 1}`, leadId: `l-${i}`,
    clienteNome: i % 4 === 0 ? null : `Cliente Fictício ${i + 1}`, tipo: TIPOS[i % TIPOS.length],
    origem: 'regra', data_agendada: i % 7 === 6 ? null : dia(i * 5 - 20), semApi: i % 3 === 0,
  }));
  const leituras: LeituraPendente[] = agenda.filter((a) => a.semApi).map((a) => ({
    sistemaId: a.sistemaId, apelido: a.apelido, leadId: a.leadId, clienteNome: a.clienteNome,
  }));
  const usinas = agenda.map((a) => ({ id: a.sistemaId, apelido: a.apelido }));
  const os = {
    id: 'os-1', sistema_id: 's-1', lead_id: 'l-1', manutencao_id: 'm-1', tipo: 'revisao_inversor' as const,
    status: 'aberta', checklist: {}, observacoes: 'Anotação de campo', executor: null,
    aberta_em: '2026-09-20T12:00:00Z', concluida_em: null, apelido: 'Usina Exemplo 1', clienteNome: 'Cliente Fictício 1',
  };
  return {
    'r13-manutencao': renderManutencaoPage({ agenda, leiturasPendentes: leituras, usinas }, user),
    'r13-os': renderOSPage(os, hidratarChecklist('revisao_inversor', { erros_alarmes: true, medicao_ca: '220V/5A' }, { termografia: 1 }),
      [{ id: 'f1', item_chave: 'termografia', storage_path: 'os/1.jpg', legenda: null, url: 'https://exemplo.invalid/1.jpg' }], user),
  };
}
