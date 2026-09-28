// src/modules/dashboard/blog-views.ts
// Marketing › Blog: rascunhos pra aprovar/publicar/descartar pelo painel (sem
// depender do WhatsApp) e a tela de revisar (ler, editar, foto, publicar).
// renderBlogDraftsPage / renderBlogRevisarPage / renderBlogIndisponivel
// devolvem o CORPO; renderBlogLayout envolve na casca (o router chama).
// Renovação do miolo — R17 (28/09/2026): mesmos formulários (publicar,
// descartar com confirm, editar, foto, publicar agora com confirm) e links;
// visual cc- do Command Center, tema escuro (D4), sem Tailwind.
// O blog é o do site da casa: tenant vê renderBlogIndisponivel('empresa').

import type { BlogDraft } from '../blog-generator.js';
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import { cabecalhoPagina, cartaoSecao, estadoVazio, aviso, botao, chip } from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';

const CSS_BLOG = `
.cc-bl>*+*{margin-top:16px}
.cc-bl-lista{display:grid;gap:16px}
.cc-bl-post{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
.cc-bl-foto{width:260px;max-width:100%;height:160px;object-fit:cover;border-radius:12px;flex:none;background:var(--cc-surface-3)}
.cc-bl-sem-foto{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--cc-faint);font-size:13px;text-align:center;padding:10px}
.cc-bl-txt{flex:1 1 260px;min-width:0}
.cc-bl-meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px;color:var(--cc-muted);margin-bottom:8px}
.cc-bl-meta code{color:var(--cc-faint);overflow-wrap:anywhere}
.cc-bl-titulo{font-size:18px;font-weight:700;line-height:1.3;color:var(--cc-text);overflow-wrap:anywhere}
.cc-bl-desc{color:var(--cc-text-2);margin:8px 0 0;line-height:1.5;overflow-wrap:anywhere}
.cc-bl-tags{margin-top:10px}
.cc-bl-acoes{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;align-items:center}
.cc-bl-acoes form{margin:0}
.cc-bl-rev{max-width:860px}
.cc-bl-rev .cc-bl-foto{width:440px;height:230px}
.cc-bl-rev form{margin:0}
.cc-bl-campos{display:grid;gap:14px}
.cc-bl-campos textarea{width:100%}
.cc-bl-campos textarea[name=contentMd]{font-family:ui-monospace,monospace;font-size:13px;line-height:1.5;min-height:420px}
.cc-bl-campos input{width:100%}
@media (max-width:760px){
  .cc-bl-foto,.cc-bl-rev .cc-bl-foto{width:100%;height:190px}
  .cc-bl-acoes form,.cc-bl-acoes>.cc-btn{flex:1 1 auto}
  .cc-bl-acoes .cc-btn{width:100%;justify-content:center}
}
`;

const CATEGORIA_LABEL: Record<BlogDraft['category'], string> = {
  tecnico: 'Técnico',
  tecnologia: 'Tecnologia',
  mercado: 'Mercado',
  regulacao: 'Regulação',
  casos: 'Casos',
  tutorial: 'Tutorial',
};

/** Casca da aba Blog (o router passa o corpo pronto). */
export function renderBlogLayout(input: { title: string; body: string; user: DashUser | undefined }): string {
  return renderLayout({
    active: 'blog', title: input.title, user: input.user,
    body: `<div class="cc-root cc-bl">${input.body}</div><style>${CSS_BLOG}</style>`,
    tailwind: false, dark: temaDaTela(input.user, 'escuro') === 'escuro', largo: true,
  });
}

/** Aviso de sucesso/erro no topo, a partir dos query params ?ok / ?erro. */
function renderBanner(flags: { ok?: boolean; erro?: string }, okTexto = 'Pronto! O post foi publicado. O site atualiza em uns 2 minutos.'): string {
  if (flags.ok) return aviso({ tom: 'ok', texto: okTexto });
  if (flags.erro) return aviso({ tom: 'erro', texto: `Não deu certo: ${flags.erro}` });
  return '';
}

const TRILHA = [{ rotulo: 'Marketing', href: '/dashboard/marketing' }, { rotulo: 'Blog', href: '/dashboard/marketing/blog' }];

/**
 * Aviso quando o blog não abre: 'config' = o gerador não subiu neste servidor;
 * 'empresa' = o blog é o do site da casa (tenant ainda não tem o dele).
 */
export function renderBlogIndisponivel(motivo: 'config' | 'empresa' = 'config'): string {
  const cab = cabecalhoPagina({ trilha: TRILHA, titulo: 'Blog — aprovar posts' });
  if (motivo === 'empresa') {
    return `${cab}${estadoVazio({
      tipo: 'construcao', titulo: 'O blog ainda não está disponível para a sua empresa.',
      texto: 'Quando o blog do seu site estiver ligado ao painel, os rascunhos para aprovar aparecem aqui.', icone: 'doc-check',
    })}`;
  }
  return `${cab}${aviso({ tom: 'atencao', texto: 'O gerador de blog não está disponível agora.' })}
    ${estadoVazio({
      tipo: 'sem_dado', titulo: 'Blog fora do ar neste servidor',
      texto: 'Isso costuma acontecer quando o serviço subiu sem as configurações do blog. A fila de posts segue funcionando pelo WhatsApp normalmente.',
    })}`;
}

/**
 * CORPO da página de rascunhos. Cada rascunho vira um cartão com foto, título,
 * resumo, categoria/tempo/endereço e os botões Revisar / Publicar / Descartar.
 */
export function renderBlogDraftsPage(
  drafts: BlogDraft[],
  flags: { ok?: boolean; erro?: string; avisoLeitura?: string } = {},
): string {
  const avisoLeitura = flags.avisoLeitura
    ? aviso({ tom: 'atencao', texto: `Não consegui ler a fila de posts agora (${flags.avisoLeitura}). Tente recarregar em instantes.` })
    : '';

  const corpo = drafts.length === 0
    ? estadoVazio({ tipo: 'vazio', titulo: 'Nenhum post esperando aprovação', texto: 'O sistema gera 1 por dia. Volte aqui quando houver um rascunho novo.', icone: 'doc-check' })
    : `<div class="cc-bl-lista">${drafts.map((d, i) => renderDraftCard(d, i === 0)).join('')}</div>`;

  return `
    ${cabecalhoPagina({
      trilha: TRILHA,
      titulo: 'Blog — aprovar posts',
      subtitulo: 'Revise e publique os rascunhos direto por aqui — não precisa do WhatsApp. Publicar manda o post pro site (fica no ar em uns 2 minutos).',
    })}
    ${renderBanner(flags)}
    ${avisoLeitura}
    ${corpo}`;
}

function fotoHtml(draft: BlogDraft, semFotoTexto: string): string {
  return draft.heroImageUrl
    ? `<img class="cc-bl-foto" src="${escapeHtml(draft.heroImageUrl)}" alt="${escapeHtml(draft.heroImageAlt ?? draft.title)}">`
    : `<div class="cc-bl-foto cc-bl-sem-foto"><span aria-hidden="true">🖼️</span><span>${escapeHtml(semFotoTexto)}</span></div>`;
}

/** Cartão de um rascunho. O 1º da fila leva o "Revisar" dourado (ação principal da tela). */
function renderDraftCard(draft: BlogDraft, primeiro: boolean): string {
  const id = encodeURIComponent(draft.id);
  const categoria = CATEGORIA_LABEL[draft.category] ?? draft.category;
  const tags = draft.tags && draft.tags.length
    ? `<div class="cc-chips cc-bl-tags">${draft.tags.slice(0, 6).map((t) => chip({ rotulo: t })).join('')}</div>`
    : '';

  return cartaoSecao({
    titulo: categoria,
    dica: `${draft.readingTime} min de leitura`,
    classe: 'cc-bl-card',
    corpoHtml: `<div class="cc-bl-post">
      ${fotoHtml(draft, 'Sem foto ainda')}
      <div class="cc-bl-txt">
        <div class="cc-bl-meta"><code>/blog/${escapeHtml(draft.slug)}</code></div>
        <div class="cc-bl-titulo">${escapeHtml(draft.title)}</div>
        <p class="cc-bl-desc">${escapeHtml(draft.description)}</p>
        ${tags}
        <div class="cc-bl-acoes">
          ${botao({ rotulo: 'Revisar / editar', href: `/dashboard/marketing/blog/${id}/revisar`, tom: primeiro ? 'ouro' : 'normal', icone: 'eye' })}
          <form method="POST" action="/dashboard/marketing/blog/${id}/publicar">
            ${botao({ rotulo: 'Publicar', tipo: 'submit', icone: 'send' })}
          </form>
          <form method="POST" action="/dashboard/marketing/blog/${id}/descartar"
            onsubmit="return confirm('Descartar este rascunho? Ele não vai pro site.')">
            ${botao({ rotulo: 'Descartar', tipo: 'submit', tom: 'fantasma' })}
          </form>
        </div>
      </div>
    </div>`,
  });
}

/**
 * CORPO da REVISÃO de um rascunho: lê o conteúdo inteiro, edita título/resumo/
 * texto, vê (ou busca) a foto e publica. Resolve "publicar no escuro" + "post
 * sem foto". O router envolve com renderBlogLayout.
 */
export function renderBlogRevisarPage(
  draft: BlogDraft,
  flags: { ok?: boolean; erro?: string; fotoOk?: boolean } = {},
): string {
  const id = encodeURIComponent(draft.id);
  const fotoBanner = flags.fotoOk ? aviso({ tom: 'ok', texto: 'Foto atualizada!' }) : '';

  const foto = cartaoSecao({
    titulo: 'Foto do post',
    corpoHtml: `${fotoHtml(draft, 'Sem foto ainda — busque uma abaixo')}
      <form method="POST" action="/dashboard/marketing/blog/${id}/foto" style="margin-top:12px">
        ${botao({ rotulo: draft.heroImageUrl ? 'Trocar foto' : 'Buscar foto', tipo: 'submit', icone: 'search' })}
      </form>`,
  });

  const editar = cartaoSecao({
    titulo: 'Texto do post',
    corpoHtml: `<form method="POST" action="/dashboard/marketing/blog/${id}/editar" class="cc-form cc-bl-campos">
      <label class="cc-campo"><span>Título</span>
        <input name="title" value="${escapeHtml(draft.title)}">
      </label>
      <label class="cc-campo"><span>Resumo</span>
        <textarea name="description" rows="2">${escapeHtml(draft.description)}</textarea>
      </label>
      <label class="cc-campo"><span>Conteúdo (texto do post)</span>
        <textarea name="contentMd" rows="22">${escapeHtml(draft.contentMd)}</textarea>
      </label>
      <div>${botao({ rotulo: 'Salvar alterações', tipo: 'submit', icone: 'check' })}</div>
    </form>`,
  });

  const publicar = `<form method="POST" action="/dashboard/marketing/blog/${id}/publicar"
      onsubmit="return confirm('Publicar este post no site agora?')">
      ${botao({ rotulo: 'Publicar agora', tipo: 'submit', tom: 'ouro', icone: 'send' })}
    </form>`;

  return `<div class="cc-bl-rev">
    ${cabecalhoPagina({
      trilha: [...TRILHA, { rotulo: 'Revisar rascunho' }],
      titulo: 'Revisar rascunho',
      subtitulo: 'Leia, ajuste o que quiser e confira a foto. Só publique quando estiver do seu jeito.',
      acoesHtml: `${botao({ rotulo: '← Voltar pros rascunhos', href: '/dashboard/marketing/blog', tom: 'fantasma', tamanho: 'sm' })}`,
    })}
    ${renderBanner(flags, 'Alterações salvas.')}
    ${fotoBanner}
    ${foto}
    ${editar}
    <div class="cc-bl-acoes">${publicar}</div>
  </div>`;
}
