// src/modules/dashboard/configuracoes-casca.ts
// Casca comum das telas de Configurações (renovação do miolo — R19, 28/09/2026):
// /usuarios, /usuarios/:id, /empresas, /whatsapp e /minha-assinatura.
// Tema escuro do Command Center (D4), sem Tailwind, e a navegação de seções do
// protótipo (13-configuracoes) SÓ com links que já existem — com o MESMO
// portão do menu lateral (menu-areas.ts): tenant nunca vê Empresas; a EcoSun
// não vê "Conectar WhatsApp" nem "Minha assinatura" (ela não usa essas telas).
import { renderLayout } from './views.js';
import { can, type DashUser } from './permissions.js';
import { icone } from './ui/componentes.js';
import { escapeHtml } from './ui/html.js';
import type { NomeIcone } from './ui/icones.js';
import { temaDaTela } from './ui/tema.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

export type SecaoConfig = 'usuarios' | 'whatsapp' | 'minha_assinatura' | 'empresas' | 'custo_ia';

/** Tenant = usuário de outra empresa (sem usuário = tela legada → trata como casa). */
export function ehTenant(user: DashUser | undefined): boolean {
  return !!user && user.companyId !== ECOSUN_COMPANY_ID;
}

const CSS_CONFIG = `
.cc-cf{--cf-nav:220px}
.cc-cf-grade{display:grid;grid-template-columns:var(--cf-nav) minmax(0,1fr);gap:20px;align-items:start}
.cc-cf-grade.cc-cf-sem-nav{grid-template-columns:minmax(0,1fr)}
.cc-cf-nav{display:flex;flex-direction:column;gap:4px;position:sticky;top:16px}
.cc-cf-nav a{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;font-size:13.5px;font-weight:500;color:var(--cc-muted);border:1px solid transparent;border-left:3px solid transparent}
.cc-cf-nav a:hover{color:var(--cc-text);background:rgba(255,255,255,.03)}
.cc-cf-nav a.cc-cf-on{color:var(--cc-text);font-weight:600;background:var(--cc-surface);border-color:var(--cc-line);border-left-color:var(--cc-gold)}
.cc-cf-nav a.cc-cf-on svg{color:var(--cc-gold-2)}
.cc-cf-conteudo{min-width:0}
.cc-cf .cc-panel+.cc-panel,.cc-cf .cc-aviso+.cc-panel,.cc-cf .cc-cf-duas+.cc-panel,.cc-cf .cc-panel+.cc-cf-duas{margin-top:16px}
.cc-cf-duas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}
.cc-cf .cc-cf-duas .cc-panel{margin:0}
.cc-cf-grade-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:end}
.cc-cf-grade-form .cc-cf-cheia{grid-column:1/-1}
.cc-cf-check{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--cc-text-2)}
.cc-cf-check input{width:16px;height:16px;accent-color:var(--cc-gold);flex:none}
.cc-cf-acoes{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:nowrap;white-space:nowrap}
.cc-cf-acoes form{margin:0}
.cc-cf-pessoa{display:flex;align-items:center;gap:10px;min-width:0}
.cc-cf-inativo td{opacity:.55}
.cc-cf-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--cc-faint);overflow-wrap:anywhere}
.cc-cf-nota{margin:0;font-size:12.5px;color:var(--cc-muted);line-height:1.5}
.cc-cf-nota+.cc-cf-nota{margin-top:6px}
@media (max-width:1023px){
  .cc-cf-grade{grid-template-columns:minmax(0,1fr)}
  .cc-cf-nav{position:static;flex-direction:row;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;gap:6px;padding-bottom:2px}
  .cc-cf-nav a{flex:none;white-space:nowrap;border:1px solid var(--cc-line);border-radius:99px;padding:7px 12px}
  .cc-cf-nav a.cc-cf-on{border-color:rgba(251,191,36,.45)}
  .cc-cf-duas{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:760px){
  .cc-cf-grade-form{grid-template-columns:minmax(0,1fr)}
  .cc-cf-acoes{justify-content:flex-end;flex-wrap:wrap}
}
`;

interface ItemNav { secao: SecaoConfig; href: string; rotulo: string; ic: NomeIcone; ve: (u: DashUser | undefined) => boolean }

// Mesmos portões dos itens do grupo "Configurações" (e de "Minha assinatura") em menu-areas.ts.
const ITENS: ItemNav[] = [
  { secao: 'usuarios', href: '/dashboard/usuarios', rotulo: 'Usuários e permissões', ic: 'users', ve: (u) => can(u, 'usuarios', 'visualizar') },
  { secao: 'whatsapp', href: '/dashboard/whatsapp', rotulo: 'WhatsApp', ic: 'wa', ve: (u) => ehTenant(u) && can(u, 'usuarios', 'administrar') },
  { secao: 'minha_assinatura', href: '/dashboard/minha-assinatura', rotulo: 'Minha assinatura', ic: 'receipt', ve: (u) => ehTenant(u) && can(u, 'usinas', 'visualizar') },
  { secao: 'empresas', href: '/dashboard/empresas', rotulo: 'Empresas', ic: 'grid', ve: (u) => !!u && !ehTenant(u) && can(u, 'usuarios', 'administrar') },
  // Custo de IA por empresa (28/09/2026) — SÓ a casa, mesmo portão de Empresas.
  { secao: 'custo_ia', href: '/dashboard/custo-ia', rotulo: 'Custo de IA', ic: 'receipt', ve: (u) => !!u && !ehTenant(u) && can(u, 'usuarios', 'administrar') },
];

/** Navegação de seções (só aparece com 2+ seções visíveis pra este usuário). */
export function navConfiguracoes(user: DashUser | undefined, ativa: SecaoConfig): string {
  const itens = ITENS.filter((i) => i.secao === ativa || i.ve(user));
  if (itens.length < 2) return '';
  return `<nav class="cc-cf-nav" aria-label="Seções de configurações">${itens.map((i) =>
    `<a href="${i.href}"${i.secao === ativa ? ' class="cc-cf-on" aria-current="page"' : ''}>${icone(i.ic, 'sm')}${escapeHtml(i.rotulo)}</a>`).join('')}</nav>`;
}

/** Página de Configurações: cabeçalho em cima, seções à esquerda, conteúdo à direita. */
export function paginaConfiguracoes(input: {
  active: 'usuarios' | 'whatsapp' | 'minha_assinatura' | 'empresas' | 'custo_ia';
  secao: SecaoConfig;
  title: string;
  cabecalhoHtml: string;
  corpoHtml: string;
  css?: string;
  scripts?: string;
  user: DashUser | undefined;
}): string {
  const nav = navConfiguracoes(input.user, input.secao);
  const body = `<div class="cc-root cc-cf">
${input.cabecalhoHtml}
<div class="cc-cf-grade${nav ? '' : ' cc-cf-sem-nav'}">${nav}<div class="cc-cf-conteudo">${input.corpoHtml}</div></div>
</div><style>${CSS_CONFIG}${input.css ?? ''}</style>`;
  return renderLayout({
    active: input.active, title: input.title, body, scripts: input.scripts, user: input.user,
    tailwind: false, dark: temaDaTela(input.user, 'escuro') === 'escuro', largo: true,
  });
}
