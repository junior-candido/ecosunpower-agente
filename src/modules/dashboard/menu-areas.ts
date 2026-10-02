// src/modules/dashboard/menu-areas.ts
// Arquitetura de menus do Energy Command Center (fase A — spec
// docs/superpowers/specs/2026-09-27-command-center-design.md §4).
//
// O menu deixou de ser "setores" soltos e virou ÁREAS da empresa de energia,
// na ordem do protótipo aprovado pelo Junior. NENHUMA rota antiga saiu: todas
// estão aqui (teste tests/cc-menu-areas.test.ts garante), no mesmo endereço.
//
// O gating é o MESMO de antes: `estadoDoItem` da vitrine (visível / bloqueado
// com cadeado / escondido) + soEcosun/soTenant. A fechadura de verdade continua
// no servidor (`exigir(area, nivel)` de cada rota).
//
// 28/09/2026 — segundo portão: o MÓDULO contratado pela empresa. O módulo de
// cada item vem do mapa único MODULO_DA_ROTA (modulos-contratados.ts), pelo
// href; a mesma tabela trava a rota no servidor (criarTravaDeModulo).

import { estadoDoItem, type EstadoItem } from './vitrine-menu.js';
import { moduloDoCaminho } from './modulos-contratados.js';
import type { Area, Nivel } from './permissions.js';
import type { NomeIcone } from './ui/icones.js';
import type { TomSelo } from './ui/componentes.js';

export interface ItemMenu {
  href: string;
  key: string;
  label: string;
  area?: Area;
  nivel?: Nivel;
  /** Item exclusivo da EcoSun (gestão de tenants): some pro usuário de outra empresa. */
  soEcosun?: boolean;
  /** Item exclusivo do TENANT (ex.: Minha assinatura): some pra EcoSun e telas sem usuário. */
  soTenant?: boolean;
  /** Item sem área aberto ao tenant (ver vitrine-menu.ts). */
  abertoATenant?: boolean;
}

export type IdGrupo =
  | 'command_center' | 'comercial' | 'marketing' | 'usinas' | 'instalacoes' | 'om'
  | 'financeiro' | 'clientes' | 'relatorios' | 'ia' | 'rh' | 'config';

export interface GrupoMenu {
  id: IdGrupo;
  titulo: string;
  icone: NomeIcone;
  itens: ItemMenu[];
  /** Linha divisória antes do grupo (IA/Config ficam separados, como no protótipo). */
  separarAntes?: boolean;
  /** Título pro tenant quando o da casa leva marca da EcoSun (ex.: "Eva"). */
  tituloTenant?: string;
}

export const MENU_AREAS: GrupoMenu[] = [
  {
    id: 'command_center', titulo: 'Command Center', icone: 'gauge',
    itens: [
      { href: '/dashboard/command-center', key: 'command_center', label: 'Command Center', abertoATenant: true },
      { href: '/dashboard/atencao', key: 'atencao', label: 'Central de Atenção', abertoATenant: true },
      { href: '/dashboard/home', key: 'home', label: 'Visão geral' },
      // R5 (D2 = a): o Cockpit saiu do menu; aposentado de vez (/cockpit só
      // redireciona pra entrada).
      { href: '/dashboard/predio', key: 'predio', label: 'Prédio Vivo', soEcosun: true },
    ],
  },
  {
    id: 'comercial', titulo: 'Comercial / CRM', icone: 'users',
    itens: [
      // Atendimento (28/09): conversas de WhatsApp + cockpit do lead, em 3 colunas.
      { href: '/dashboard/leads/conversas', key: 'conversas', label: 'Conversas', area: 'leads' },
      { href: '/dashboard/leads', key: 'leads', label: 'Leads', area: 'leads' },
      { href: '/dashboard/leads/kanban', key: 'kanban', label: 'Quadro de Vendas', area: 'leads' },
      { href: '/dashboard/propostas', key: 'propostas', label: 'Propostas', area: 'propostas' },
      { href: '/dashboard/vendas/fechar', key: 'fechar_venda', label: 'Fechou! (registrar venda)' },
      { href: '/dashboard/contratos', key: 'contratos', label: 'Contratos & Procurações' },
      { href: '/dashboard/recados', key: 'recados', label: 'Recados da equipe', area: 'leads' },
      { href: '/dashboard/lojas', key: 'lojas', label: 'Comparador de Lojas' },
    ],
  },
  {
    id: 'marketing', titulo: 'Marketing', icone: 'mega',
    itens: [
      { href: '/dashboard/marketing', key: 'marketing', label: 'Campanhas', area: 'marketing' },
      { href: '/dashboard/marketing/blog', key: 'blog', label: 'Blog', area: 'marketing' },
      { href: '/dashboard/marketing/email', key: 'email', label: 'E-mail Marketing', area: 'marketing' },
      { href: '/dashboard/cadencia', key: 'cadencia', label: 'Cadência', area: 'marketing' },
    ],
  },
  {
    id: 'usinas', titulo: 'Usinas', icone: 'sun',
    itens: [
      { href: '/dashboard/monitoramento', key: 'monitoramento', label: 'Monitoramento', area: 'usinas' },
      { href: '/dashboard/energy-studio', key: 'energy_studio', label: 'Energy Studio', area: 'usinas' },
      { href: '/dashboard/demonstrativos', key: 'demonstrativos', label: 'Demonstrativos GD', area: 'usinas' },
      { href: '/dashboard/medicao', key: 'medicao', label: 'Medição', area: 'usinas' },
      { href: '/dashboard/energia', key: 'energia', label: 'Energia da casa', area: 'usinas' },
      { href: '/dashboard/minha-assinatura', key: 'minha_assinatura', label: 'Minha assinatura', area: 'usinas', soTenant: true },
    ],
  },
  {
    id: 'instalacoes', titulo: 'Instalações', icone: 'hammer',
    itens: [
      { href: '/dashboard/usinas/kanban', key: 'usinas_kanban', label: 'Quadro de Obras', area: 'usinas' },
    ],
  },
  {
    id: 'om', titulo: 'O&M', icone: 'wrench',
    itens: [
      { href: '/dashboard/manutencao', key: 'manutencao', label: 'Manutenção' },
      { href: '/dashboard/servicos', key: 'servicos', label: 'Serviços (campo)', area: 'servicos' },
    ],
  },
  {
    id: 'financeiro', titulo: 'Financeiro', icone: 'wallet',
    itens: [
      { href: '/dashboard/financeiro', key: 'financeiro', label: 'Visão financeira', area: 'financeiro' },
      { href: '/dashboard/fiscal', key: 'fiscal', label: 'Notas fiscais', area: 'financeiro' },
      { href: '/dashboard/cobrar', key: 'cobrar', label: 'Cobrar cliente', area: 'financeiro' },
      // Cobrança recorrente (28/09/2026): SÓ a casa — é a carteira de TODOS os assinantes.
      { href: '/dashboard/assinaturas', key: 'assinaturas', label: 'Assinaturas', area: 'financeiro', soEcosun: true },
    ],
  },
  {
    id: 'clientes', titulo: 'Clientes', icone: 'contact',
    itens: [
      { href: '/dashboard/clientes', key: 'clientes', label: 'Clientes', soEcosun: true },
      { href: '/dashboard/pos-venda', key: 'pos_venda', label: 'Pós-venda', area: 'usinas' },
      { href: '/dashboard/pastas', key: 'pastas', label: 'Pasta do Cliente', area: 'usinas' },
    ],
  },
  // Relatórios: o hub (/dashboard/relatorios) chega na fase G. Sem item, o
  // grupo não aparece — nada de link morto.
  { id: 'relatorios', titulo: 'Relatórios', icone: 'file', itens: [] },
  {
    id: 'ia', titulo: 'IA · Eva', tituloTenant: 'IA · Assistente', icone: 'spark', separarAntes: true,
    itens: [
      { href: '/dashboard/conhecimento', key: 'conhecimento', label: 'O que a assistente sabe', area: 'leads' },
      { href: '/dashboard/cerebro', key: 'cerebro', label: 'Cérebro', area: 'relatorios', soEcosun: true },
    ],
  },
  {
    id: 'rh', titulo: 'Equipe · RH', icone: 'contact',
    itens: [
      { href: '/dashboard/rh/candidatos', key: 'rh_candidatos', label: 'Candidatos', area: 'rh' },
      { href: '/dashboard/rh/vagas', key: 'rh_vagas', label: 'Vagas', area: 'rh' },
      { href: '/dashboard/rh/busca', key: 'rh_busca', label: 'Busca IA', area: 'rh' },
    ],
  },
  {
    id: 'config', titulo: 'Configurações', icone: 'cog',
    itens: [
      { href: '/dashboard/usuarios', key: 'usuarios', label: 'Usuários', area: 'usuarios' },
      { href: '/dashboard/whatsapp', key: 'whatsapp', label: 'Conectar WhatsApp', area: 'usuarios', nivel: 'administrar', soTenant: true },
      { href: '/dashboard/empresas', key: 'empresas', label: 'Empresas (tenants)', area: 'usuarios', nivel: 'administrar', soEcosun: true },
    ],
  },
];

const CHAVES = new Set(MENU_AREAS.flatMap((g) => g.itens.map((i) => i.key)));

/** A chave existe no menu? (ex.: /conhecer/:chave vem da URL). */
export function ehChaveDeMenu(k: string): boolean {
  return CHAVES.has(k);
}

export interface SeloGrupo { valor: number | string; tom?: TomSelo }

export interface ItemMontado extends ItemMenu { estado: Exclude<EstadoItem, 'escondido'>; ativo: boolean }
export interface GrupoMontado {
  id: IdGrupo;
  titulo: string;
  icone: NomeIcone;
  separarAntes?: boolean;
  itens: ItemMontado[];
  ativo: boolean;
  aberto: boolean;
  /** Todos os itens visíveis estão bloqueados (vitrine) → cabeçalho apagado com cadeado. */
  trancado: boolean;
  selo?: SeloGrupo;
}

/**
 * Menu pronto pra desenhar, para ESTE usuário. Puro: `podeNaArea` é o `can()` injetado.
 * Grupo sem item visível some. Grupo com o item ativo vem aberto.
 */
export function montarMenu(
  user: { companyId: string } | undefined,
  ativo: string,
  ecosunCompanyId: string,
  podeNaArea: (u: never, area: string, nivel?: string) => boolean,
  selos: Partial<Record<IdGrupo, SeloGrupo>> = {},
): GrupoMontado[] {
  const out: GrupoMontado[] = [];
  for (const g of MENU_AREAS) {
    const itens: ItemMontado[] = [];
    for (const it of g.itens) {
      // Módulo do item sai do MESMO mapa da trava das rotas (pelo href).
      const modulo = moduloDoCaminho(it.href)?.modulo;
      const estado = estadoDoItem({ ...it, modulo }, user, ecosunCompanyId, podeNaArea);
      if (estado === 'escondido') continue;
      itens.push({ ...it, estado, ativo: it.key === ativo });
    }
    if (itens.length === 0) continue;
    const temAtivo = itens.some((i) => i.ativo);
    const ehTenant = !!user && user.companyId !== ecosunCompanyId;
    out.push({
      id: g.id,
      titulo: ehTenant && g.tituloTenant ? g.tituloTenant : g.titulo,
      icone: g.icone,
      separarAntes: g.separarAntes,
      itens,
      ativo: temAtivo,
      aberto: temAtivo,
      trancado: itens.every((i) => i.estado === 'bloqueado'),
      selo: selos[g.id],
    });
  }
  return out;
}
