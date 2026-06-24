// src/modules/dashboard/permissions.ts
// Modelo de permissões do dashboard: áreas × níveis, configurável por papel.
// Checagem central via can(). is_admin libera tudo; "administrar" numa área
// concede todos os níveis daquela área.

export const AREAS = [
  'leads', 'propostas', 'usinas', 'financeiro',
  'marketing', 'relatorios', 'usuarios', 'configuracoes',
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
}

export function can(user: DashUser | null | undefined, area: Area, nivel: Nivel): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  const perms = user.permissoes?.[area] ?? [];
  if (perms.includes('administrar')) return true;
  return perms.includes(nivel);
}
