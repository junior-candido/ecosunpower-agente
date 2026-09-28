// src/modules/dashboard/usuarios-views.ts
// Telas de /usuarios: lista + form de criar/editar. Só admin (gating no router).
// Renovação do miolo — R19 (28/09/2026): mesmos formulários (novo, :id, :id/ativo,
// :id/excluir com confirm), visual cc- do Command Center (protótipo
// 13-configuracoes): pessoa com avatar, papel em pílula, o que o papel "vê" e o
// último acesso. Sem Tailwind, tema escuro (D4).
import type { DashUser } from './permissions.js';
import type { UserListItem, RoleRow } from './users-store.js';
import {
  cabecalhoPagina, cartaoSecao, tabela, pilulaStatus, botao, avatar, celulaDupla,
} from './ui/componentes.js';
import { escapeHtml as esc, SEM_DADO } from './ui/html.js';
import { paginaConfiguracoes } from './configuracoes-casca.js';

const CSS_USUARIOS = `
.cc-us-ve{font-size:12.5px;color:var(--cc-text-2);white-space:normal;display:inline-block;max-width:150px}
.cc-us .cc-cf-pessoa .cc-dupla{white-space:normal;max-width:210px}
.cc-us .cc-cf-acoes{flex-wrap:wrap;max-width:180px;margin-left:auto;white-space:normal}
.cc-us-quando{font-size:12.5px;color:var(--cc-muted);white-space:nowrap}
.cc-us-excluir{color:var(--cc-muted)}
.cc-us-excluir:hover{color:var(--cc-crit);border-color:rgba(228,87,75,.45)}
.cc-us-edit{max-width:640px}
.cc-us-edit .cc-cf-grade-form{grid-template-columns:repeat(2,minmax(0,1fr))}
@media (max-width:760px){.cc-us-edit .cc-cf-grade-form{grid-template-columns:minmax(0,1fr)}.cc-us .cc-cf-acoes,.cc-us-ve{max-width:none}}
`;

const TRILHA = [{ rotulo: 'Configurações' }, { rotulo: 'Usuários', href: '/dashboard/usuarios' }];

// Nome curto das áreas (permissions.ts) pra coluna "vê".
const AREA_ROTULO: Record<string, string> = {
  leads: 'leads', propostas: 'propostas', usinas: 'usinas', financeiro: 'financeiro',
  marketing: 'marketing', relatorios: 'relatórios', usuarios: 'usuários', configuracoes: 'configurações',
  rh: 'RH', servicos: 'serviços',
};

/** O que o papel deixa ver: "tudo" (admin), a lista de áreas, ou null (sem papel). */
export function oQueVe(role: RoleRow | null | undefined): string | null {
  if (!role) return null;
  if (role.is_admin) return 'tudo';
  const areas = Object.entries(role.permissoes ?? {})
    .filter(([, niveis]) => Array.isArray(niveis) && niveis.length > 0)
    .map(([a]) => AREA_ROTULO[a] ?? a);
  return areas.length ? areas.join(', ') : 'nada ainda';
}

/** Último acesso em linguagem simples, no horário de Brasília. */
export function ultimoAcesso(iso: string | null | undefined, agora: Date = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dia = (x: Date) => x.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const min = (agora.getTime() - d.getTime()) / 60_000;
  if (min >= 0 && min < 60) return 'agora há pouco';
  if (dia(d) === dia(agora)) return `hoje ${d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`;
  if (dia(d) === dia(new Date(agora.getTime() - 86_400_000))) return 'ontem';
  return dia(d);
}

/** Texto do confirm: sem aspas simples, barra ou quebra de linha (senão o JS do onsubmit não compila). */
const paraConfirm = (s: string) => s.replace(/'/g, '’').replace(/[\\\r\n]/g, ' ');

export function renderUsuariosListPage(users: UserListItem[], roles: RoleRow[], viewer?: DashUser): string {
  // Ativos primeiro; inativos vão pro fim, discretos.
  const ordenados = [...users].sort((a, b) => Number(b.ativo) - Number(a.ativo));
  const papelDe = (u: UserListItem) =>
    roles.find((r) => r.id === u.role_id) ?? roles.find((r) => r.nome === u.role_nome) ?? null;

  const linhas = ordenados.map((u) => {
    const papel = papelDe(u);
    const acoes = u.id === viewer?.id ? '' : `${u.ativo
      ? `<form method="POST" action="/dashboard/usuarios/${esc(u.id)}/ativo"><input type="hidden" name="valor" value="nao"><button type="submit" class="cc-btn cc-btn-sm">desativar</button></form>`
      : `<form method="POST" action="/dashboard/usuarios/${esc(u.id)}/ativo"><input type="hidden" name="valor" value="sim"><button type="submit" class="cc-btn cc-btn-sm">reativar</button></form>`}
      <form method="POST" action="/dashboard/usuarios/${esc(u.id)}/excluir"
        onsubmit="return confirm('Excluir ${esc(paraConfirm(u.nome))}?\\n\\nOs registros amarrados (serviços, leads) passam pra você. Essa é a única exclusão SEM desfazer do sistema.')">
        <button type="submit" class="cc-btn cc-btn-sm cc-btn-ghost cc-us-excluir">excluir</button>
      </form>`;
    return [
      { html: `<div class="cc-cf-pessoa">${avatar(u.nome)}${celulaDupla(u.nome, u.login, `/dashboard/usuarios/${u.id}`)}</div>` },
      { html: u.role_nome ? pilulaStatus(papel?.is_admin ? 'acompanhar' : 'info', u.role_nome) : pilulaStatus('sem_dado', 'sem papel') },
      { html: `<span class="cc-us-ve">${esc(oQueVe(papel) ?? SEM_DADO)}</span>` },
      { html: `<span class="cc-us-quando">${esc(ultimoAcesso(u.last_login_at) ?? SEM_DADO)}</span>` },
      { html: u.ativo ? pilulaStatus('normal', 'ativo') : pilulaStatus('sem_dado', 'inativo') },
      { html: `<div class="cc-cf-acoes">${botao({ rotulo: 'Editar', href: `/dashboard/usuarios/${u.id}`, tamanho: 'sm' })}${acoes}</div>` },
    ];
  });

  const tabelaHtml = tabela({
    mobile: 'cartoes',
    colunas: [{ titulo: 'Pessoa' }, { titulo: 'Papel' }, { titulo: 'Vê' }, { titulo: 'Último acesso' }, { titulo: 'Status' }, { titulo: '' }],
    linhas,
    vazio: 'Nenhum usuário',
  });

  // Linha de inativo discreta: marca a <tr> pela ordem (ativos vêm primeiro).
  let n = 0;
  const tabelaMarcada = tabelaHtml.replace(/<tr>(?=<td)/g, () => (ordenados[n++]?.ativo === false ? '<tr class="cc-cf-inativo">' : '<tr>'));

  const opcoesPapel = roles.map((r) => `<option value="${esc(r.id)}">${esc(r.nome)}</option>`).join('');
  const ativos = users.filter((u) => u.ativo).length;

  const novo = `<form method="POST" action="/dashboard/usuarios/novo" class="cc-form cc-cf-grade-form" id="cc-cf-novo">
    <label class="cc-campo"><span>Nome</span><input name="nome" placeholder="Nome" required /></label>
    <label class="cc-campo"><span>Login</span><input name="login" placeholder="Login" required autocomplete="off" /></label>
    <label class="cc-campo"><span>Senha inicial</span><input name="senha" type="password" placeholder="Senha inicial" required autocomplete="new-password" /></label>
    <label class="cc-campo"><span>WhatsApp</span><input name="telefone" inputmode="tel" placeholder="5561999998888" /></label>
    <label class="cc-campo"><span>E-mail</span><input name="email" type="email" placeholder="recebe as boas-vindas" /></label>
    <label class="cc-campo"><span>Papel</span><select name="role_id" required>${opcoesPapel}</select></label>
    <label class="cc-cf-check cc-cf-cheia">
      <input type="checkbox" name="acesso_temporario" /> Acesso temporário — expira sozinho quando concluir os serviços atribuídos (reabrir um serviço reativa)
    </label>
    <div class="cc-cf-cheia">${botao({ rotulo: 'Criar usuário', tipo: 'submit', tom: 'ouro', icone: 'plus' })}</div>
  </form>`;

  const corpo = `
${cartaoSecao({ titulo: 'Pessoas', dica: `${users.length} no total · ${ativos} ativa${ativos === 1 ? '' : 's'}`, acoesHtml: botao({ rotulo: 'Novo usuário', href: '#cc-cf-novo', tamanho: 'sm', icone: 'plus' }), corpoHtml: `<div class="cc-us">${tabelaMarcada}</div>` })}
${cartaoSecao({ titulo: 'Novo usuário', dica: 'com WhatsApp, recebe login e senha por lá', corpoHtml: novo })}`;

  return paginaConfiguracoes({
    active: 'usuarios', secao: 'usuarios', title: 'Usuários', user: viewer, css: CSS_USUARIOS,
    cabecalhoHtml: cabecalhoPagina({
      trilha: [TRILHA[0], { rotulo: 'Usuários' }],
      titulo: 'Usuários e permissões',
      subtitulo: 'Quem entra no painel, com qual papel e o que cada um vê.',
    }),
    corpoHtml: corpo,
  });
}

export function renderUsuarioEditPage(
  user: { id: string; nome: string; login: string; ativo: boolean; role_id: string | null; telefone?: string | null; acesso_temporario?: boolean; email?: string | null },
  roles: RoleRow[],
  viewer?: DashUser,
): string {
  const opcoes = roles.map((r) => `<option value="${esc(r.id)}"${r.id === user.role_id ? ' selected' : ''}>${esc(r.nome)}</option>`).join('');
  const form = `<form method="POST" action="/dashboard/usuarios/${esc(user.id)}" class="cc-form cc-cf-grade-form">
    <label class="cc-campo"><span>Nome</span><input name="nome" value="${esc(user.nome)}" /></label>
    <label class="cc-campo"><span>Papel</span><select name="role_id">${opcoes}</select></label>
    <label class="cc-campo"><span>Nova senha (em branco = mantém)</span><input name="senha" type="password" autocomplete="new-password" /></label>
    <label class="cc-campo"><span>WhatsApp — recebe o aviso de serviço atribuído</span><input name="telefone" inputmode="tel" value="${esc(user.telefone ?? '')}" placeholder="5561999998888" /></label>
    <label class="cc-campo cc-cf-cheia"><span>E-mail</span><input name="email" type="email" value="${esc(user.email ?? '')}" /></label>
    <label class="cc-cf-check cc-cf-cheia"><input type="checkbox" name="ativo"${user.ativo ? ' checked' : ''} /> Ativo</label>
    <label class="cc-cf-check cc-cf-cheia"><input type="checkbox" name="acesso_temporario"${user.acesso_temporario ? ' checked' : ''} /> Acesso temporário (expira ao concluir os serviços)</label>
    <div class="cc-cf-cheia">${botao({ rotulo: 'Salvar', tipo: 'submit', tom: 'ouro', icone: 'check' })}</div>
  </form>`;

  return paginaConfiguracoes({
    active: 'usuarios', secao: 'usuarios', title: 'Editar usuário', user: viewer, css: CSS_USUARIOS,
    cabecalhoHtml: cabecalhoPagina({
      trilha: [...TRILHA, { rotulo: user.nome }],
      titulo: `Editar: ${user.nome}`,
      seloHtml: user.ativo ? pilulaStatus('normal', 'ativo') : pilulaStatus('sem_dado', 'inativo'),
      subtitulo: `Login: ${user.login}`,
      acoesHtml: botao({ rotulo: '← Usuários', href: '/dashboard/usuarios' }),
    }),
    corpoHtml: `<div class="cc-us-edit">${cartaoSecao({ titulo: 'Dados e papel', corpoHtml: form })}</div>`,
  });
}
