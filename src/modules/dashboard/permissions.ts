// src/modules/dashboard/permissions.ts
// Modelo de permissões do dashboard: áreas × níveis, configurável por papel.
// Checagem central via can(). is_admin libera tudo; "administrar" numa área
// concede todos os níveis daquela área.

export const AREAS = [
  'leads', 'propostas', 'usinas', 'financeiro',
  'marketing', 'relatorios', 'usuarios', 'configuracoes', 'rh',
  'servicos', // Diário de Serviços (registro de campo — papel "Campo" vê só isso)
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
  // Módulos que a EMPRESA contratou (empresa_modulos). Preenchido por requisição
  // pela trava de módulos (modulos-contratados.ts) só pro tenant; o menu tranca
  // o que não está aqui. Ausente = não conferido (EcoSun, telas sem o router).
  modulosContratados?: readonly string[];
}

// Modo TV (renovação do miolo R26, decisão D6 = a — SEM migration): a TV do
// escritório entra com um usuário comum cujo PAPEL se chama "TV só-leitura"
// (variações: "TV", "TV somente leitura"). Esse papel não tem permissão de
// área nenhuma e o painel só deixa ele abrir /dashboard/tv (travaPapelTv) —
// números e quadros do Command Center da empresa DELE, sem nome de cliente,
// sem dinheiro. O papel é uma linha em dashboard_roles (dado, não estrutura).
export const PAPEL_TV = 'TV só-leitura';
export function ehPapelTv(user: DashUser | null | undefined): boolean {
  if (!user || user.isAdmin) return false;
  const nome = String(user.roleNome ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return /^tv(\b|$)/.test(nome);
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
// "Atualizar todas" (POST /monitoramento/sync-todos): a EcoSun sincroniza a
// frota inteira (igual ao cron); tenant só as usinas da empresa dele; sem
// empresa na sessão → null (nega). Revisão de segurança do R8, 28/09/2026.
export function escopoSyncTodos(
  companyDoOperador: string | null | undefined,
): { tudo: true; companyId?: undefined } | { companyId: string; tudo?: undefined } | null {
  if (!companyDoOperador) return null;
  return companyDoOperador === ECOSUN_DISPARO ? { tudo: true } : { companyId: companyDoOperador };
}

export function usinaPertenceAoOperador(
  companyDaUsina: string | null | undefined,
  companyDoOperador: string | null | undefined,
): boolean {
  if (!companyDoOperador) return false;
  return (companyDaUsina ?? ECOSUN_DISPARO) === companyDoOperador;
}
