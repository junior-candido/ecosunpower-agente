// src/modules/dashboard/vincular-usinas-views.ts
// Tela do mutirão: lista usinas sem cliente, com a sugestão por nome
// pré-selecionada num <select>. O Junior confere e confirma em lote.

import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { SugestaoVinculo, LeadOpcao } from './vincular-usinas.js';

export interface VincularUsinasPageData {
  sugestoes: SugestaoVinculo[];
  leads: LeadOpcao[];
  user?: DashUser;
}

function optionsLeads(leads: LeadOpcao[], selecionado: string | null): string {
  const vazio = `<option value="">— deixar sem cliente —</option>`;
  const opts = leads.map((l) => {
    const sel = l.id === selecionado ? ' selected' : '';
    return `<option value="${escapeHtml(l.id)}"${sel}>${escapeHtml(l.name ?? '(sem nome)')}</option>`;
  });
  return vazio + opts.join('');
}

export function renderVincularUsinasPage(data: VincularUsinasPageData): string {
  if (data.sugestoes.length === 0) {
    return renderLayout({ active: 'usinas_kanban', title: 'Vincular usinas', user: data.user, body: `
      <h1 class="text-xl font-semibold mb-4">Vincular usinas ao cliente</h1>
      <p class="text-slate-500">Nenhuma usina pendente de vínculo. 🎉</p>` });
  }
  const linhas = data.sugestoes.map((s) => `
    <tr class="border-b border-slate-100">
      <td class="py-2 px-2 text-sm text-slate-800">${escapeHtml(s.apelido ?? 'Sem apelido')}</td>
      <td class="py-2 px-2">
        <select name="${escapeHtml(s.usinaId)}" class="border border-slate-300 rounded px-2 py-1 text-sm w-full">
          ${optionsLeads(data.leads, s.leadSugeridoId)}
        </select>
      </td>
    </tr>`).join('');
  return renderLayout({ active: 'usinas_kanban', title: 'Vincular usinas', user: data.user, body: `
    <h1 class="text-xl font-semibold mb-2">Vincular usinas ao cliente</h1>
    <p class="text-slate-500 text-sm mb-4">
      As usinas abaixo já operam mas não têm cliente. A sugestão (por nome) já vem marcada —
      confira, ajuste se precisar e confirme. Ao confirmar, elas vão pro <strong>Pós-venda</strong>
      e somem do kanban de obras.</p>
    <form method="post" action="/dashboard/usinas/vincular">
      <table class="w-full border border-slate-200 rounded">
        <thead><tr class="bg-slate-50 text-left text-xs text-slate-500">
          <th class="py-2 px-2">Usina (apelido)</th><th class="py-2 px-2">Cliente</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <button type="submit" class="mt-4 bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
        Confirmar vínculos
      </button>
    </form>` });
}
