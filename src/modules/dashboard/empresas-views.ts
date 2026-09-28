// src/modules/dashboard/empresas-views.ts
// Tela "Empresas (tenants)" — só admin da EcoSun (gate no router). Lista as
// empresas do prédio + formulário de provisionar (empresa + 1º admin).
// Renovação do miolo — R19 (28/09/2026): mesmos formulários (empresas/nova e
// empresas/:id/convite), visual cc- (tabela com status em pílula), sem Tailwind.
import { escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { EmpresaListItem } from './empresas-store.js';
import { cabecalhoPagina, cartaoSecao, tabela, pilulaStatus, botao, avatar, celulaDupla, aviso as avisoCc } from './ui/componentes.js';
import { paginaConfiguracoes } from './configuracoes-casca.js';

const CSS_EMPRESAS = `
.cc-em-form{max-width:640px;margin-top:16px}
.cc-em-form .cc-cf-nota{margin-bottom:14px}
.cc-em-form .cc-cf-grade-form{grid-template-columns:repeat(2,minmax(0,1fr))}
@media (max-width:760px){.cc-em-form .cc-cf-grade-form{grid-template-columns:minmax(0,1fr)}}
`;

const dataBr = (iso: string | null | undefined) => {
  const d = (iso ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : null;
};

export function renderEmpresasPage(
  empresas: EmpresaListItem[],
  user: DashUser | undefined,
  aviso?: { tipo: 'ok' | 'erro'; texto: string },
): string {
  const lista = tabela({
    mobile: 'cartoes',
    colunas: [{ titulo: 'Empresa' }, { titulo: 'Usuários', alinhar: 'dir', num: true }, { titulo: 'Status' }, { titulo: 'Criada em' }, { titulo: '' }],
    linhas: empresas.map((e) => [
      { html: `<div class="cc-cf-pessoa">${avatar(e.nome)}<div class="cc-dupla"><span class="cc-dupla-t">${escapeHtml(e.nome)}</span><span class="cc-cf-mono">${escapeHtml(e.id)}</span></div></div>` },
      e.usuarios,
      { html: e.ativo ? pilulaStatus('normal', 'ativa') : pilulaStatus('critico', 'inativa') },
      dataBr(e.createdAt),
      { html: `<div class="cc-cf-acoes"><form method="post" action="/dashboard/empresas/${escapeHtml(e.id)}/convite"><button type="submit" class="cc-btn cc-btn-sm" title="Manda um novo link de criar senha pro administrador (e-mail cadastrado)">Reenviar convite</button></form></div>` },
    ]),
    vazio: 'Nenhuma empresa ainda',
  });

  const form = `<form method="post" action="/dashboard/empresas/nova" class="cc-form cc-cf-grade-form" id="cc-cf-nova">
    <label class="cc-campo cc-cf-cheia"><span>Nome da empresa</span><input name="nome" required maxlength="80" placeholder="Ex.: Solar Exemplo"></label>
    <label class="cc-campo cc-cf-cheia"><span>Nome do administrador</span><input name="admin_nome" required maxlength="80" placeholder="Ex.: Maria Exemplo"></label>
    <label class="cc-campo"><span>Login</span><input name="admin_login" required maxlength="60" autocomplete="off" placeholder="ex.: maria"></label>
    <label class="cc-campo"><span>Senha inicial (opcional)</span><input name="admin_senha" type="password" minlength="8" autocomplete="new-password" placeholder="vazio = convite por e-mail"></label>
    <label class="cc-campo cc-cf-cheia"><span>E-mail do administrador</span><input name="admin_email" type="email" maxlength="120" autocomplete="off" placeholder="ex.: maria@empresa.com.br (recebe o convite)"></label>
    <div class="cc-cf-cheia">${botao({ rotulo: 'Criar empresa', tipo: 'submit', tom: 'ouro', icone: 'plus' })}</div>
  </form>`;

  const corpo = `
${aviso ? avisoCc({ tom: aviso.tipo, texto: aviso.texto }) : ''}
${cartaoSecao({ titulo: 'Empresas do prédio', dica: `${empresas.length} empresa${empresas.length === 1 ? '' : 's'}`, acoesHtml: botao({ rotulo: 'Nova empresa', href: '#cc-cf-nova', tamanho: 'sm', icone: 'plus' }), corpoHtml: lista })}
<div class="cc-em-form">${cartaoSecao({ titulo: 'Provisionar nova empresa', corpoHtml: `
  <p class="cc-cf-nota">Login e e-mail do PRIMEIRO administrador do tenant. <strong>Deixe a senha vazia</strong> pra ele receber um <strong>convite por e-mail</strong> e criar a própria senha (ninguém vê a senha de ninguém). Só preencha a senha inicial se não houver e-mail.</p>
  ${form}` })}</div>`;

  return paginaConfiguracoes({
    active: 'empresas', secao: 'empresas', title: 'Empresas', user, css: CSS_EMPRESAS,
    cabecalhoHtml: cabecalhoPagina({
      trilha: [{ rotulo: 'Configurações' }, { rotulo: 'Empresas' }],
      titulo: 'Empresas',
      subtitulo: 'Cada empresa é um prédio isolado: usuários, leads e usinas só dela. Provisionar cria a empresa + o papel Administrador + o 1º usuário.',
    }),
    corpoHtml: corpo,
  });
}
