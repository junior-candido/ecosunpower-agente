// src/modules/dashboard/pasta-views.ts
// Pasta Digital do Cliente — telas admin:
//   renderListaPastas  → GET  /dashboard/pastas
//   renderEditorPasta  → GET  /dashboard/pastas/:id
//   renderPreviewPasta → GET  /dashboard/pastas/:id/preview
import { renderLayout } from './views.js';
import { SECOES } from '../relatorios/pasta/types.js';
import type { ArquivoPasta, PastaClienteRow } from '../relatorios/pasta/types.js';

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

export function renderListaPastas(input: {
  pastas: Array<{ id: string; slug: string; status: string; acessos: number; enviado_em: string | null; updated_at: string; cliente_nome: string | null; qtd_arquivos: number }>;
  clientes: Array<{ id: string; name: string | null }>;
  publicBase: string;
}): string {
  const linhas = input.pastas.map((p) => `
    <tr class="border-b border-slate-700/60 hover:bg-slate-800/40">
      <td class="py-3 px-3"><a href="/dashboard/pastas/${escapeHtml(p.id)}" class="text-sky-300 hover:underline font-semibold">${escapeHtml(p.cliente_nome ?? 'sem nome')}</a></td>
      <td class="py-3 px-3">${p.status === 'publicada'
        ? '<span class="text-emerald-400 text-sm">🟢 publicada</span>'
        : '<span class="text-amber-300 text-sm">📝 rascunho</span>'}</td>
      <td class="py-3 px-3 text-slate-300 text-sm">${p.qtd_arquivos} arquivo${p.qtd_arquivos === 1 ? '' : 's'}</td>
      <td class="py-3 px-3 text-slate-300 text-sm">${p.acessos} acesso${p.acessos === 1 ? '' : 's'}</td>
      <td class="py-3 px-3 text-slate-400 text-sm">${p.enviado_em ? '📤 ' + escapeHtml(String(p.enviado_em).slice(0, 10)) : '—'}</td>
      <td class="py-3 px-3">
        ${p.status === 'publicada'
          ? `<button onclick="navigator.clipboard.writeText('${escapeHtml(input.publicBase)}/pasta/${escapeHtml(p.slug)}').then(()=>this.textContent='✅ copiado')" class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200">🔗 copiar link</button>`
          : ''}
      </td>
    </tr>`).join('');

  const opcoesClientes = input.clientes
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name ?? 'sem nome')}</option>`)
    .join('');

  const body = `
    <div class="max-w-5xl mx-auto">
      <div class="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold text-slate-100">📁 Pasta do Cliente</h1>
          <p class="text-slate-400 text-sm mt-1">Entrega digital pós-instalação: fotos + documentos num link só, com a marca da casa.</p>
        </div>
        <form action="/dashboard/pastas" method="post" class="flex items-center gap-2">
          <select name="lead_id" required class="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm min-w-[220px]">
            <option value="">— escolher cliente —</option>
            ${opcoesClientes}
          </select>
          <button class="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold whitespace-nowrap">➕ Abrir pasta</button>
        </form>
      </div>

      ${input.pastas.length === 0
        ? '<div class="bg-slate-800/60 border border-slate-700 rounded-xl p-10 text-center text-slate-400">Nenhuma pasta ainda. Escolha um cliente acima pra abrir a primeira. 🌞</div>'
        : `<div class="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
        <table class="w-full text-left">
          <thead><tr class="text-xs uppercase tracking-wider text-slate-400 border-b border-slate-700">
            <th class="py-2 px-3">Cliente</th><th class="py-2 px-3">Status</th><th class="py-2 px-3">Arquivos</th>
            <th class="py-2 px-3">Acessos</th><th class="py-2 px-3">Enviada</th><th class="py-2 px-3"></th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`}
    </div>
  `;
  return renderLayout({ active: 'pastas', title: 'Pasta do Cliente', body, dark: true });
}

export function renderEditorPasta(input: {
  pasta: PastaClienteRow;
  cliente_nome: string | null;
  tem_rpi: boolean;
  fotos_urls: Record<string, string>;   // storage_path -> signed url (miniaturas das fotos)
  publicBase: string;
}): string {
  const p = input.pasta;
  const arquivos: ArquivoPasta[] = p.arquivos ?? [];

  const blocosSecoes = SECOES.map((s) => {
    const doSecao = arquivos.filter((a) => a.secao === s.id);
    const listaHtml = doSecao.map((a) => `
      <div class="flex items-center gap-3 py-2 border-b border-slate-700/40 last:border-0">
        ${s.id === 'fotos' && input.fotos_urls[a.storage_path]
          ? `<img src="${escapeHtml(input.fotos_urls[a.storage_path])}" class="w-14 h-14 object-cover rounded-lg" alt="">`
          : `<span class="text-xl w-14 text-center">${/\.(mp4|mov|webm|m4v)$/i.test(a.storage_path) ? '🎬' : '📄'}</span>`}
        <span class="flex-1 text-sm text-slate-200 break-all">${escapeHtml(a.nome_exibicao)}
          ${a.origem === 'r-pi' ? '<span class="text-xs text-violet-300 ml-1">(do relatório)</span>' : ''}
          ${p.capa_storage_path === a.storage_path ? '<span class="text-xs text-amber-300 ml-1">⭐ capa</span>' : ''}
        </span>
        ${s.id === 'fotos' && p.capa_storage_path !== a.storage_path ? `
        <form action="/dashboard/pastas/${escapeHtml(p.id)}/capa" method="post">
          <input type="hidden" name="storage_path" value="${escapeHtml(a.storage_path)}">
          <button class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200">⭐ capa</button>
        </form>` : ''}
        <form action="/dashboard/pastas/${escapeHtml(p.id)}/arquivos/remover" method="post" onsubmit="return confirm('Tirar este arquivo da pasta?')">
          <input type="hidden" name="storage_path" value="${escapeHtml(a.storage_path)}">
          <button class="text-xs px-2 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200">🗑️</button>
        </form>
      </div>`).join('');

    return `
      <div class="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
        <h3 class="text-sm font-bold text-slate-200 mb-2">${escapeHtml(s.titulo)} <span class="text-slate-500 font-normal">(${doSecao.length})</span></h3>
        ${listaHtml || '<p class="text-xs text-slate-500 mb-2">Nada aqui ainda.</p>'}
        <form action="/dashboard/pastas/${escapeHtml(p.id)}/arquivos" method="post" enctype="multipart/form-data" class="mt-3 flex items-center gap-2">
          <input type="hidden" name="secao" value="${s.id}">
          <input type="file" name="arquivos" multiple ${s.id === 'fotos' ? 'accept="image/*"' : s.id === 'monitoramento' ? 'accept="image/*,video/*"' : 'accept="image/*,application/pdf"'} required
            class="block flex-1 text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-cyan-600 file:text-white hover:file:bg-cyan-700 cursor-pointer">
          <button class="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs whitespace-nowrap">⬆️ Adicionar</button>
        </form>
        ${s.id === 'fotos' && input.tem_rpi ? `
        <form action="/dashboard/pastas/${escapeHtml(p.id)}/puxar-rpi" method="post" class="mt-2">
          <button class="text-xs px-3 py-1.5 rounded-lg bg-violet-800/70 hover:bg-violet-700 text-violet-100">✨ Puxar fotos do Relatório Pós-Instalação</button>
        </form>` : ''}
      </div>`;
  }).join('');

  const publicUrl = `${input.publicBase}/pasta/${p.slug}`;

  const body = `
    <div class="max-w-4xl mx-auto">
      <div class="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <a href="/dashboard/pastas" class="text-sky-300 text-sm hover:underline">← Todas as pastas</a>
          <h1 class="text-2xl font-bold text-slate-100 mt-2">📁 Pasta de ${escapeHtml(input.cliente_nome ?? 'sem nome')}</h1>
          <p class="mt-1 text-sm ${p.status === 'publicada' ? 'text-emerald-400' : 'text-amber-300'}">
            ${p.status === 'publicada' ? `🟢 Publicada · ${p.acessos} acesso(s)` : '📝 Rascunho — o cliente ainda não vê'}
          </p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <a href="/dashboard/pastas/${escapeHtml(p.id)}/preview" class="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">👁️ Prévia</a>
          <form action="/dashboard/pastas/${escapeHtml(p.id)}/publicar" method="post">
            <button class="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold">${p.status === 'publicada' ? '🔄 Republicar' : '🚀 Publicar'}</button>
          </form>
          ${p.status === 'publicada' ? `
          <form action="/dashboard/pastas/${escapeHtml(p.id)}/enviar" method="post" onsubmit="return confirm('Enviar o link da pasta pelo WhatsApp do cliente agora?')">
            <button class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">📤 Enviar no zap</button>
          </form>` : ''}
        </div>
      </div>

      ${p.status === 'publicada' ? `
      <div class="mb-4 bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <span class="text-xs text-slate-400">Link do cliente:</span>
        <code class="text-xs bg-slate-900 px-2 py-1 rounded text-sky-300">${escapeHtml(publicUrl)}</code>
        <button onclick="navigator.clipboard.writeText('${escapeHtml(publicUrl)}').then(()=>this.textContent='✅ copiado')" class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200">copiar</button>
      </div>` : ''}

      <form action="/dashboard/pastas/${escapeHtml(p.id)}/dados" method="post" class="mb-4 bg-slate-800/60 border border-slate-700 rounded-xl p-5 grid gap-4 md:grid-cols-2">
        <div>
          <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">📅 Data da entrega</label>
          <input type="date" name="data_entrega" value="${escapeHtml(p.data_entrega ?? '')}" class="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
        </div>
        <div class="md:col-span-2">
          <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">💬 Mensagem do zap <span class="text-slate-500 font-normal">(opcional — vazio usa a mensagem padrão; o link entra sozinho no final)</span></label>
          <textarea name="mensagem_zap" rows="3" class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">${escapeHtml(p.mensagem_zap ?? '')}</textarea>
        </div>
        <div><button class="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">💾 Salvar dados</button></div>
      </form>

      <div class="grid gap-4">${blocosSecoes}</div>
    </div>
  `;
  return renderLayout({ active: 'pastas', title: `Pasta — ${input.cliente_nome ?? ''}`, body, dark: true });
}

export function renderPreviewPasta(input: {
  pasta_id: string;
  cliente_nome: string | null;
  html_preview: string;
}): string {
  const body = `
    <div class="max-w-5xl mx-auto">
      <div class="mb-4">
        <a href="/dashboard/pastas/${escapeHtml(input.pasta_id)}" class="text-sky-300 text-sm hover:underline">← Voltar ao editor</a>
        <h1 class="text-2xl font-bold text-slate-100 mt-3">Prévia — pasta de ${escapeHtml(input.cliente_nome ?? '')}</h1>
        <p class="text-slate-400 text-sm mt-1">É exatamente isso que o cliente vai ver (menos o banner amarelo).</p>
      </div>
      <div class="bg-white rounded-xl overflow-hidden shadow-2xl">
        <iframe srcdoc="${escapeHtml(input.html_preview)}" class="w-full" style="min-height:900px;border:none"></iframe>
      </div>
    </div>
  `;
  return renderLayout({ active: 'pastas', title: 'Prévia da pasta', body, dark: true });
}
