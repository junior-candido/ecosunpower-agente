// src/modules/dashboard/relatorio-pi-views.ts
// Views de admin para o fluxo A5 — Relatório Pós-Instalação:
//   renderFormNovoRelatorio  → GET /dashboard/clientes/:id/relatorio-pos-instalacao/novo
//   renderPreviewRelatorio   → GET /dashboard/clientes/:id/relatorio-pos-instalacao/:rid/preview
import { renderLayout } from './views.js';

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

export function renderFormNovoRelatorio(input: {
  lead_id: string;
  cliente_nome: string | null;
  data_instalacao_pre: string | null;
}): string {
  const body = `
    <div class="max-w-3xl mx-auto">
      <div class="mb-6">
        <a href="/dashboard/clientes/${escapeHtml(input.lead_id)}" class="text-sky-300 text-sm hover:underline">← Voltar ao perfil</a>
        <h1 class="text-2xl font-bold text-slate-100 mt-3">📋 Novo relatório pós-instalação</h1>
        <p class="text-slate-400 text-sm mt-1">Cliente: <strong>${escapeHtml(input.cliente_nome ?? 'sem nome')}</strong></p>
      </div>

      <form action="/dashboard/clientes/${escapeHtml(input.lead_id)}/relatorio-pos-instalacao" method="post" enctype="multipart/form-data" class="bg-slate-800/60 border border-slate-700 rounded-xl p-6 space-y-5">
        <div>
          <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">📸 Fotos da obra <span class="text-slate-500 font-normal">(pode selecionar várias de uma vez)</span></label>
          <input type="file" name="fotos" multiple accept="image/*" class="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-cyan-600 file:text-white hover:file:bg-cyan-700 cursor-pointer">
          <p class="text-xs text-slate-500 mt-1">Máx 10 fotos · até 20MB cada · JPG/PNG/WebP/HEIC.</p>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">💬 Mensagem personalizada <span class="text-slate-500 font-normal">(opcional)</span></label>
          <textarea name="mensagem_personalizada" rows="4" placeholder="Ex: Obrigado pela confiança! Foi um prazer trabalhar na sua obra. Seu sistema foi dimensionado pensando no seu consumo atual e tem margem pra futuras expansões..." class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm"></textarea>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">📅 Data de instalação</label>
          <input type="date" name="data_instalacao" value="${escapeHtml(input.data_instalacao_pre ?? '')}" class="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
        </div>

        <div class="flex gap-3 pt-2">
          <a href="/dashboard/clientes/${escapeHtml(input.lead_id)}" class="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">Cancelar</a>
          <button class="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold">📋 Gerar preview</button>
        </div>
      </form>
    </div>
  `;
  return renderLayout({ active: 'clientes', title: 'Novo relatório pós-instalação', body, dark: true });
}

export function renderPreviewRelatorio(input: {
  lead_id: string;
  relatorio_id: string;
  slug: string;
  html_preview: string;        // HTML do template renderizado com publico=false
  ja_enviado: boolean;
  enviado_em: string | null;
}): string {
  const body = `
    <div class="max-w-5xl mx-auto">
      <div class="mb-4 flex items-center justify-between gap-4">
        <div>
          <a href="/dashboard/clientes/${escapeHtml(input.lead_id)}" class="text-sky-300 text-sm hover:underline">← Voltar ao perfil</a>
          <h1 class="text-2xl font-bold text-slate-100 mt-3">Preview do relatório</h1>
          ${input.ja_enviado
            ? `<p class="text-emerald-400 text-sm mt-1">✅ Enviado em ${escapeHtml(input.enviado_em ?? '')}</p>`
            : `<p class="text-amber-300 text-sm mt-1">⚠ Ainda não enviado pro cliente</p>`}
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <a href="/dashboard/clientes/${escapeHtml(input.lead_id)}/relatorio-pos-instalacao/novo" class="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">🔄 Refazer</a>
          ${!input.ja_enviado ? `
          <form action="/dashboard/clientes/${escapeHtml(input.lead_id)}/relatorio-pos-instalacao/${escapeHtml(input.relatorio_id)}/enviar" method="post" onsubmit="return confirm('Enviar relatório pelo WhatsApp do cliente agora?')">
            <button class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">📤 Enviar pro cliente</button>
          </form>` : ''}
        </div>
      </div>

      <div class="bg-white rounded-xl overflow-hidden shadow-2xl">
        <iframe srcdoc="${escapeHtml(input.html_preview)}" class="w-full" style="min-height:900px;border:none"></iframe>
      </div>

      <p class="text-slate-500 text-xs mt-4 text-center">
        Link público: <code class="bg-slate-800 px-2 py-1 rounded">${escapeHtml(input.slug)}</code> ·
        <a href="/r-pi/${escapeHtml(input.slug)}" target="_blank" class="text-sky-300 hover:underline">abrir versão pública</a>
      </p>
    </div>
  `;
  return renderLayout({ active: 'clientes', title: 'Preview relatório', body, dark: true });
}
