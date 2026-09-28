// Casos da Manutenção + OS (renovação do miolo, R13) — 2 telas:
//   renderManutencaoPage → GET /dashboard/manutencao (agenda, leituras, agendar, nova OS)
//   renderOSPage         → GET /dashboard/os/:id (checklist + fotos + concluir + laudo)
// Dados FICTÍCIOS: nomes inventados, nunca cliente real. Datas relativas a HOJE
// (a pílula da agenda sai de statusAgendaItem, que olha a data de hoje).
import { renderManutencaoPage } from '../../src/modules/dashboard/manutencao-views.js';
import { renderOSPage } from '../../src/modules/dashboard/os-views.js';
import { hidratarChecklist } from '../../src/modules/dashboard/os-checklist.js';
import type { AgendaItem, LeituraPendente } from '../../src/modules/dashboard/manutencao-queries.js';
import type { OSRow, FotoOS } from '../../src/modules/dashboard/os-queries.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

/** Data ISO (AAAA-MM-DD) a `dias` de hoje (negativo = passado). */
export const diaRelativo = (dias: number): string => new Date(Date.now() + dias * 86400_000).toISOString().slice(0, 10);

const S = (n: number) => `11111111-2222-4333-8444-${String(n).padStart(12, '0')}`;
const M = (n: number) => `aaaaaaaa-2222-4333-8444-${String(n).padStart(12, '0')}`;

export const item = (over: Partial<AgendaItem> = {}): AgendaItem => ({
  id: M(1), sistemaId: S(1), apelido: 'Casa Exemplo Norte', leadId: 'l1', clienteNome: 'Ana Exemplo',
  tipo: 'limpeza', origem: 'regra', data_agendada: diaRelativo(-12), semApi: false, ...over,
});

export const AGENDA: AgendaItem[] = [
  item(),
  item({ id: M(2), sistemaId: S(2), apelido: 'Sítio <script>alert(1)</script>', clienteNome: "Bruno D'Ávila <b>x</b>", tipo: 'revisao_inversor', origem: 'alerta', data_agendada: diaRelativo(-2), semApi: true }),
  item({ id: M(3), sistemaId: S(3), apelido: 'Padaria Pão Quente', clienteNome: null, tipo: 'revisao_eletrica', data_agendada: diaRelativo(4) }),
  item({ id: M(4), sistemaId: S(4), apelido: 'Chácara Recanto', clienteNome: 'Carla Exemplo', tipo: 'inspecao', origem: 'manual', data_agendada: diaRelativo(25), semApi: true }),
  item({ id: M(5), sistemaId: S(5), apelido: 'Oficina Motor Bom', clienteNome: 'Davi Exemplo', tipo: 'corretiva', origem: 'manual', data_agendada: diaRelativo(80) }),
  item({ id: M(6), sistemaId: S(6), apelido: 'Casa sem data', clienteNome: 'Eva Lima', tipo: 'limpeza', data_agendada: null }),
];

export const LEITURAS: LeituraPendente[] = [
  { sistemaId: S(2), apelido: 'Sítio <script>alert(1)</script>', leadId: 'l2', clienteNome: "Bruno D'Ávila <b>x</b>" },
  { sistemaId: S(4), apelido: 'Chácara Recanto', leadId: 'l4', clienteNome: null },
];

export const USINAS = [
  { id: S(1), apelido: 'Casa Exemplo Norte' }, { id: S(2), apelido: 'Sítio <script>alert(1)</script>' },
  { id: S(3), apelido: 'Padaria Pão Quente' }, { id: S(4), apelido: 'Chácara Recanto' },
];

const OS_ID = 'bbbbbbbb-2222-4333-8444-000000000001';
export const os = (over: Partial<OSRow> = {}): OSRow => ({
  id: OS_ID, sistema_id: S(1), lead_id: 'l1', manutencao_id: M(1), tipo: 'limpeza',
  status: 'aberta', checklist: {}, observacoes: null, executor: null,
  aberta_em: '2026-09-20T12:00:00Z', concluida_em: null, apelido: 'Casa Exemplo Norte', clienteNome: 'Ana Exemplo', ...over,
});

export const FOTOS: FotoOS[] = [
  { id: 'f1', item_chave: 'fotos_modulos', storage_path: 'os/1.jpg', legenda: null, url: 'https://exemplo.invalid/1.jpg' },
  { id: 'f2', item_chave: 'fotos_modulos', storage_path: 'os/2.jpg', legenda: null, url: 'https://exemplo.invalid/2.jpg"onerror="x' },
];

export const CASOS_MANUTENCAO: Record<string, () => string> = {
  'agenda': () => renderManutencaoPage({ agenda: AGENDA, leiturasPendentes: LEITURAS, usinas: USINAS }, USER_CASA),
  'agenda-tenant': () => renderManutencaoPage({ agenda: AGENDA.slice(2), leiturasPendentes: LEITURAS.slice(1), usinas: USINAS }, USER_TENANT),
  'agenda-vazia': () => renderManutencaoPage({ agenda: [], leiturasPendentes: [], usinas: [] }, USER_CASA),
  'so-leituras': () => renderManutencaoPage({ agenda: [], leiturasPendentes: LEITURAS, usinas: USINAS }, USER_CASA),
  'os-limpeza': () => renderOSPage(
    os({ checklist: { inspecao_visual: true, geracao_antes_depois: '38 → 41' }, observacoes: 'Módulo 3 com <b>sujeira</b> "pesada"' }),
    hidratarChecklist('limpeza', { inspecao_visual: true, geracao_antes_depois: '38 → 41' }, { fotos_modulos: 2 }), FOTOS, USER_CASA),
  'os-revisao-inversor': () => renderOSPage(
    os({ tipo: 'revisao_inversor', apelido: 'Sítio <script>alert(1)</script>', clienteNome: "Bruno D'Ávila" }),
    hidratarChecklist('revisao_inversor', { medicao_ca: '220V/5A' }, {}), [], USER_CASA),
  'os-concluida': () => renderOSPage(
    os({ status: 'concluida', concluida_em: '2026-09-22T12:00:00Z', checklist: { inspecao_visual: true, limpeza_placas: true }, observacoes: 'Tudo certo.' }),
    hidratarChecklist('limpeza', { inspecao_visual: true, limpeza_placas: true, estruturas: true, geracao_antes_depois: '40' }, { fotos_modulos: 2 }), FOTOS, USER_CASA),
  'os-tenant': () => renderOSPage(
    os({ tipo: 'corretiva', apelido: null, clienteNome: null }),
    hidratarChecklist('corretiva', {}, {}), [], USER_TENANT),
};
