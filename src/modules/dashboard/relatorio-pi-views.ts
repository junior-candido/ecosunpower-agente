// src/modules/dashboard/relatorio-pi-views.ts
// Views de admin para o fluxo A5 — Relatório Pós-Instalação:
//   renderFormNovoRelatorio  → GET /dashboard/clientes/:id/relatorio-pos-instalacao/novo
//   renderPreviewRelatorio   → GET /dashboard/clientes/:id/relatorio-pos-instalacao/:rid/preview
// Renovação do miolo — R16 (28/09/2026): mesmos formulários (upload multipart,
// enviar com confirm); visual no padrão cc-, tema escuro (D4), sem Tailwind.
// O documento que o cliente recebe (template/PDF) NÃO muda.
import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import { cabecalhoPagina, cartaoSecao, botao, pilulaStatus, icone } from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

const CSS_RPI = `
.cc-rp .cc-panel+.cc-panel{margin-top:16px}
.cc-rp-form{display:flex;flex-direction:column;gap:16px}
.cc-rp-form textarea{width:100%}
.cc-rp-form input[type=date]{width:220px;max-width:100%}
.cc-rp-fotos{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.cc-rp-fotos input[type=file]{flex:1 1 220px;min-width:0}
.cc-rp-nota{margin:0;font-size:12.5px;color:var(--cc-faint)}
.cc-rp-acoes{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.cc-rp-acoes form{margin:0}
.cc-rp-previa{background:#fff;border-radius:12px;overflow:hidden}
.cc-rp-previa iframe{display:block;width:100%;min-height:900px;border:0}
.cc-rp-link{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px;font-size:13px;color:var(--cc-muted)}
.cc-rp-link code{font-size:12.5px;padding:4px 8px;border-radius:8px;background:var(--cc-surface-3);color:var(--cc-info);overflow-wrap:anywhere;min-width:0}
.cc-rp-link a{color:var(--cc-info)}
@media (max-width:760px){
  .cc-rp-acoes{width:100%}
  .cc-rp-acoes>.cc-btn,.cc-rp-acoes>form{flex:1 1 auto}
  .cc-rp-acoes .cc-btn{width:100%;justify-content:center}
  .cc-rp-previa iframe{min-height:640px}
}
`;

const layout = (title: string, body: string, user: DashUser | undefined, largo: boolean) => renderLayout({
  active: 'clientes', title, body: `<div class="cc-root cc-rp">${body}</div><style>${CSS_RPI}</style>`, user,
  tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro', largo,
});

export function renderFormNovoRelatorio(input: {
  lead_id: string;
  cliente_nome: string | null;
  data_instalacao_pre: string | null;
  user: DashUser | undefined;
}): string {
  const nome = input.cliente_nome ?? 'sem nome';
  const form = `
      <form action="/dashboard/clientes/${escapeHtml(input.lead_id)}/relatorio-pos-instalacao" method="post" enctype="multipart/form-data" class="cc-form cc-rp-form">
        <div class="cc-campo">
          <span>Fotos da obra (pode selecionar várias de uma vez)</span>
          <div class="cc-rp-fotos">
            <input type="file" name="fotos" multiple accept="image/*" id="rp_fotos" aria-label="Fotos da obra">
            <button type="button" onclick="var i=document.getElementById('rp_fotos');i.setAttribute('capture','environment');i.removeAttribute('multiple');i.click();i.removeAttribute('capture');i.setAttribute('multiple','')" class="cc-btn cc-btn-sm">📷 Tirar foto</button>
          </div>
          <p class="cc-rp-nota">Máx 10 fotos · até 20MB cada · JPG/PNG/WebP/HEIC.</p>
        </div>

        <label class="cc-campo">
          <span>Mensagem personalizada (opcional)</span>
          <textarea name="mensagem_personalizada" rows="4" placeholder="Ex: Obrigado pela confiança! Foi um prazer trabalhar na sua obra. Seu sistema foi dimensionado pensando no seu consumo atual e tem margem pra futuras expansões..."></textarea>
        </label>

        <label class="cc-campo">
          <span>Data de instalação</span>
          <input type="date" name="data_instalacao" value="${escapeHtml(input.data_instalacao_pre ?? '')}">
        </label>

        <div class="cc-rp-acoes">
          ${botao({ rotulo: 'Gerar prévia', tipo: 'submit', tom: 'ouro', icone: 'doc-check' })}
          <a href="/dashboard/clientes/${escapeHtml(input.lead_id)}" class="cc-btn">Cancelar</a>
        </div>
      </form>`;

  const body = `
${cabecalhoPagina({
    trilha: [{ rotulo: 'Clientes' }, { rotulo: nome, href: `/dashboard/clientes/${input.lead_id}` }, { rotulo: 'Relatório pós-instalação' }],
    titulo: 'Novo relatório pós-instalação',
    subtitulo: `Cliente: ${nome}`,
    acoesHtml: botao({ rotulo: '← Voltar ao perfil', href: `/dashboard/clientes/${input.lead_id}` }),
  })}
${cartaoSecao({ titulo: 'Fotos e mensagem', dica: 'o cliente recebe um link com as fotos e a mensagem', corpoHtml: form })}`;
  return layout('Novo relatório pós-instalação', body, input.user, false);
}

export function renderPreviewRelatorio(input: {
  lead_id: string;
  relatorio_id: string;
  slug: string;
  html_preview: string;        // HTML do template renderizado com publico=false
  ja_enviado: boolean;
  enviado_em: string | null;
  user: DashUser | undefined;
}): string {
  const acoes = `<div class="cc-rp-acoes">
    ${!input.ja_enviado ? `
    <form action="/dashboard/clientes/${escapeHtml(input.lead_id)}/relatorio-pos-instalacao/${escapeHtml(input.relatorio_id)}/enviar" method="post" onsubmit="return confirm('Enviar relatório pelo WhatsApp do cliente agora?')">
      <button class="cc-btn cc-btn-gold">${icone('send', 'sm')}Enviar pro cliente</button>
    </form>` : ''}
    ${botao({ rotulo: 'Refazer', href: `/dashboard/clientes/${input.lead_id}/relatorio-pos-instalacao/novo` })}
    ${botao({ rotulo: '← Voltar ao perfil', href: `/dashboard/clientes/${input.lead_id}` })}
  </div>`;

  const body = `
${cabecalhoPagina({
    trilha: [{ rotulo: 'Clientes' }, { rotulo: 'Cliente', href: `/dashboard/clientes/${input.lead_id}` }, { rotulo: 'Prévia do relatório' }],
    titulo: 'Prévia do relatório',
    seloHtml: input.ja_enviado
      ? pilulaStatus('normal', `Enviado em ${input.enviado_em ?? '—'}`)
      : pilulaStatus('atencao', 'Ainda não enviado pro cliente'),
    acoesHtml: acoes,
  })}
${cartaoSecao({
    titulo: 'Como o cliente vê',
    corpoHtml: `<div class="cc-rp-previa"><iframe title="Prévia do relatório" srcdoc="${escapeHtml(input.html_preview)}"></iframe></div>
      <p class="cc-rp-link">Link público: <code>${escapeHtml(input.slug)}</code>
        <a href="/r-pi/${escapeHtml(input.slug)}" target="_blank" rel="noopener">abrir versão pública</a></p>`,
  })}`;
  return layout('Preview relatório', body, input.user, true);
}
