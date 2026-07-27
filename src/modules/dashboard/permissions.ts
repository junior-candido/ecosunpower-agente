// src/modules/dashboard/permissions.ts
// Modelo de permissões do dashboard: áreas × níveis, configurável por papel.
// Checagem central via can(). is_admin libera tudo; "administrar" numa área
// concede todos os níveis daquela área.

export const AREAS = [
  'leads', 'propostas', 'usinas', 'financeiro',
  'marketing', 'relatorios', 'usuarios', 'configuracoes', 'rh',
] as const;
export type Area = (typeof AREAS)[number];

export const NIVEIS = [
  'visualizar', 'criar', 'editar', 'excluir', 'exportar', 'administrar',
] as const;
export type Nivel = (typeof NIVEIS)[number];

export type Permissoes = Partial<Record<Area, Nivel[]>>;

export interface DashUser {
  id: string;
  companyId: string;
  nome: string;
  login: string;
  isAdmin: boolean;
  roleNome: string;
  permissoes: Permissoes;
  // [Fase 2 A2] Nome da empresa da sessão (companies.nome) — o layout usa pra
  // marcar o dashboard do tenant. Ausente/EcoSun = visual EcoSun de sempre.
  companyNome?: string;
}

export function can(user: DashUser | null | undefined, area: Area, nivel: Nivel): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  const perms = user.permissoes?.[area] ?? [];
  if (perms.includes('administrar')) return true;
  return perms.includes(nivel);
}

// [Gate B5 provisório — degustação Sabion 27/07] Disparo de MENSAGEM (Eva /
// WABA / IA falando com cliente) é exclusivo da CASA EcoSun até cada tenant
// ter WABA própria. Existe pra que o papel do tenant possa ganhar 'editar'
// (cadastrar os próprios clientes, mover Kanban) SEM falar em nome da EcoSun
// pelo número da EcoSun. Sem empresa → lado seguro (não dispara).
const ECOSUN_DISPARO = '00000000-0000-0000-0000-000000000001';
export function podeDispararMensagens(companyId: string | null | undefined): boolean {
  return companyId === ECOSUN_DISPARO;
}

// [Degustação Sabion 27/07] Usina só abre pra EMPRESA dona. Usina sem carimbo
// (company_id null) é legado pré-multi-tenant = EcoSun. Operador sem empresa
// na sessão → nega (fail-closed). Usado nas rotas /monitoramento/:id*.
export function usinaPertenceAoOperador(
  companyDaUsina: string | null | undefined,
  companyDoOperador: string | null | undefined,
): boolean {
  if (!companyDoOperador) return false;
  return (companyDaUsina ?? ECOSUN_DISPARO) === companyDoOperador;
}
