// src/modules/dashboard/blog-views.ts
// View da aba Blog (sob o setor Marketing). Renderiza o BODY com os drafts
// pendentes pra aprovar/publicar/descartar pelo dashboard — sem depender do
// WhatsApp. O wrapper renderLayout({ active:'blog', ... }) fica no router.

import type { BlogDraft } from '../blog-generator.js';
import { escapeHtml } from './views.js';

const CATEGORIA_LABEL: Record<BlogDraft['category'], string> = {
  tecnico: 'Técnico',
  tecnologia: 'Tecnologia',
  mercado: 'Mercado',
  regulacao: 'Regulação',
  casos: 'Casos',
  tutorial: 'Tutorial',
};

/**
 * Banner de sucesso/erro no topo, a partir dos query params ?ok / ?erro.
 * Retorna '' quando não há nada a mostrar.
 */
function renderBanner(flags: { ok?: boolean; erro?: string }): string {
  if (flags.ok) {
    return `<div style="background:#064e3b;border:1px solid #34d399;border-radius:12px;padding:14px 18px;margin-bottom:20px;color:#d1fae5">
      ✅ <strong>Pronto!</strong> O post foi publicado. O Cloudflare Pages atualiza o site em ~2 min.
    </div>`;
  }
  if (flags.erro) {
    return `<div style="background:#450a0a;border:1px solid #f87171;border-radius:12px;padding:14px 18px;margin-bottom:20px;color:#fecaca">
      ❌ <strong>Não deu certo:</strong> ${escapeHtml(flags.erro)}
    </div>`;
  }
  return '';
}

/** Aviso amigável quando o gerador de blog não está disponível. */
export function renderBlogIndisponivel(): string {
  return `
  <div style="max-width:760px;margin:0 auto">
    <h1 style="font-size:24px;font-weight:700;color:#0f172a;margin-bottom:6px">📝 Blog — aprovar posts</h1>
    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:18px;color:#92400e;margin-top:16px">
      ⚠️ <strong>O gerador de blog não está disponível agora.</strong>
      <p style="margin:8px 0 0">Isso costuma acontecer quando o serviço subiu sem as configurações do blog.
      A fila de posts segue funcionando pelo WhatsApp normalmente.</p>
    </div>
  </div>`;
}

/**
 * BODY da página de drafts. Cada draft vira um card com foto do hero, título,
 * descrição, categoria/tempo/slug e dois botões (Publicar / Descartar).
 */
export function renderBlogDraftsPage(
  drafts: BlogDraft[],
  flags: { ok?: boolean; erro?: string; avisoLeitura?: string } = {},
): string {
  const banner = renderBanner(flags);

  const avisoLeitura = flags.avisoLeitura
    ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:14px 18px;margin-bottom:20px;color:#92400e">
         ⚠️ Não consegui ler a fila de posts agora (${escapeHtml(flags.avisoLeitura)}). Tente recarregar em instantes.
       </div>`
    : '';

  const corpo = drafts.length === 0
    ? `<div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:14px;padding:40px 24px;text-align:center;color:#64748b;margin-top:8px">
         <div style="font-size:34px;margin-bottom:8px">📭</div>
         <div style="font-size:17px;font-weight:600;color:#334155">Nenhum post esperando aprovação</div>
         <div style="margin-top:6px">O sistema gera 1 por dia. Volte aqui quando houver um rascunho novo.</div>
       </div>`
    : `<div style="display:grid;gap:18px;margin-top:8px">${drafts.map(renderDraftCard).join('')}</div>`;

  return `
  <div style="max-width:920px;margin:0 auto">
    <h1 style="font-size:24px;font-weight:700;color:#0f172a;margin-bottom:6px">📝 Blog — aprovar posts</h1>
    <p style="color:#64748b;margin-bottom:20px">Aprove e publique os rascunhos direto por aqui — não precisa do WhatsApp.
      Publicar manda o post pro site (sai do ar em ~2 min via Cloudflare).</p>
    ${banner}
    ${avisoLeitura}
    ${corpo}
  </div>`;
}

function renderDraftCard(draft: BlogDraft): string {
  const id = encodeURIComponent(draft.id);
  const categoria = CATEGORIA_LABEL[draft.category] ?? escapeHtml(draft.category);
  const tempo = `${draft.readingTime} min de leitura`;

  const hero = draft.heroImageUrl
    ? `<img src="${escapeHtml(draft.heroImageUrl)}" alt="${escapeHtml(draft.heroImageAlt ?? draft.title)}"
         style="width:100%;max-width:260px;height:160px;object-fit:cover;border-radius:12px;flex-shrink:0;background:#e2e8f0">`
    : `<div style="width:100%;max-width:260px;height:160px;border-radius:12px;flex-shrink:0;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:34px">🖼️</div>`;

  const tags = draft.tags && draft.tags.length
    ? `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">${draft.tags.slice(0, 6).map((t) =>
        `<span style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;border-radius:999px;padding:2px 10px;font-size:12px">${escapeHtml(t)}</span>`,
      ).join('')}</div>`
    : '';

  return `
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;box-shadow:0 1px 2px rgba(15,23,42,.04)">
    <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
      ${hero}
      <div style="flex:1;min-width:240px">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px;color:#64748b;margin-bottom:8px">
          <span style="background:#1e293b;color:#fff;border-radius:6px;padding:2px 8px;font-weight:600">${categoria}</span>
          <span>⏱️ ${escapeHtml(tempo)}</span>
          <span style="color:#94a3b8">/blog/${escapeHtml(draft.slug)}</span>
        </div>
        <div style="font-size:18px;font-weight:700;color:#0f172a;line-height:1.3">${escapeHtml(draft.title)}</div>
        <p style="color:#475569;margin:8px 0 0;line-height:1.5">${escapeHtml(draft.description)}</p>
        ${tags}
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
          <a href="/dashboard/marketing/blog/${id}/revisar"
            style="background:#1e293b;color:#fff;border-radius:10px;padding:10px 18px;font-weight:700;font-size:14px;text-decoration:none;display:inline-block">
            ✏️ Revisar / editar
          </a>
          <form method="POST" action="/dashboard/marketing/blog/${id}/publicar" style="margin:0">
            <button type="submit"
              style="background:#16a34a;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-weight:700;font-size:14px;cursor:pointer">
              📤 Publicar
            </button>
          </form>
          <form method="POST" action="/dashboard/marketing/blog/${id}/descartar" style="margin:0"
            onsubmit="return confirm('Descartar este rascunho? Ele não vai pro site.')">
            <button type="submit"
              style="background:#fff;color:#b91c1c;border:1px solid #fecaca;border-radius:10px;padding:10px 18px;font-weight:600;font-size:14px;cursor:pointer">
              🗑️ Descartar
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>`;
}

/**
 * Página de REVISÃO de um rascunho: lê o conteúdo inteiro, edita título/resumo/
 * texto, vê (ou busca) a foto do hero e publica. Resolve "publicar no escuro" +
 * "post sem foto". É o BODY; o router envolve no renderLayout({ active:'blog' }).
 */
export function renderBlogRevisarPage(
  draft: BlogDraft,
  flags: { ok?: boolean; erro?: string; fotoOk?: boolean } = {},
): string {
  const id = encodeURIComponent(draft.id);
  const banner = renderBanner(flags);
  const fotoBanner = flags.fotoOk
    ? `<div style="background:#064e3b;border:1px solid #34d399;border-radius:12px;padding:12px 16px;margin-bottom:16px;color:#d1fae5">🖼️ Foto atualizada!</div>`
    : '';

  const hero = draft.heroImageUrl
    ? `<img src="${escapeHtml(draft.heroImageUrl)}" alt="${escapeHtml(draft.heroImageAlt ?? draft.title)}"
         style="width:100%;max-width:440px;height:230px;object-fit:cover;border-radius:12px;background:#e2e8f0">`
    : `<div style="width:100%;max-width:440px;height:230px;border-radius:12px;background:#e2e8f0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94a3b8;gap:6px">
         <div style="font-size:34px">🖼️</div><div style="font-size:13px">Sem foto ainda — busque uma abaixo</div>
       </div>`;

  return `
  <div style="max-width:820px;margin:0 auto">
    <a href="/dashboard/marketing/blog" style="color:#2563eb;text-decoration:none;font-size:14px">← Voltar pros rascunhos</a>
    <h1 style="font-size:24px;font-weight:700;color:#0f172a;margin:8px 0 4px">✏️ Revisar rascunho</h1>
    <p style="color:#64748b;margin-bottom:18px">Leia, ajuste o que quiser e confira a foto. Só publique quando estiver do seu jeito.</p>
    ${banner}
    ${fotoBanner}

    <!-- FOTO -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;margin-bottom:16px">
      <div style="font-weight:600;color:#334155;margin-bottom:10px">Foto do post</div>
      ${hero}
      <form method="POST" action="/dashboard/marketing/blog/${id}/foto" style="margin:12px 0 0">
        <button type="submit" style="background:#0ea5e9;color:#fff;border:0;border-radius:10px;padding:9px 16px;font-weight:600;font-size:14px;cursor:pointer">
          🔄 ${draft.heroImageUrl ? 'Trocar foto' : 'Buscar foto'}
        </button>
      </form>
    </div>

    <!-- EDITAR -->
    <form method="POST" action="/dashboard/marketing/blog/${id}/editar"
      style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;margin-bottom:16px">
      <label style="display:block;font-weight:600;color:#334155;margin-bottom:6px">Título</label>
      <input name="title" value="${escapeHtml(draft.title)}"
        style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px;margin-bottom:14px">
      <label style="display:block;font-weight:600;color:#334155;margin-bottom:6px">Resumo</label>
      <textarea name="description" rows="2"
        style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px;margin-bottom:14px">${escapeHtml(draft.description)}</textarea>
      <label style="display:block;font-weight:600;color:#334155;margin-bottom:6px">Conteúdo (texto do post)</label>
      <textarea name="contentMd" rows="22"
        style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;font-size:13px;font-family:ui-monospace,monospace;line-height:1.5">${escapeHtml(draft.contentMd)}</textarea>
      <button type="submit" style="background:#475569;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-weight:700;font-size:14px;cursor:pointer;margin-top:14px">
        💾 Salvar alterações
      </button>
    </form>

    <!-- PUBLICAR -->
    <form method="POST" action="/dashboard/marketing/blog/${id}/publicar" style="margin:0"
      onsubmit="return confirm('Publicar este post no site agora?')">
      <button type="submit" style="background:#16a34a;color:#fff;border:0;border-radius:10px;padding:12px 22px;font-weight:700;font-size:15px;cursor:pointer">
        📤 Publicar agora
      </button>
    </form>
  </div>`;
}
