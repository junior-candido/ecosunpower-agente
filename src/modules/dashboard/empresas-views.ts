// src/modules/dashboard/empresas-views.ts
// Tela "Empresas (tenants)" — só admin da EcoSun (gate no router). Lista as
// empresas do prédio + formulário de provisionar (empresa + 1º admin).
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { EmpresaListItem } from './empresas-store.js';

export function renderEmpresasPage(
  empresas: EmpresaListItem[],
  user: DashUser | undefined,
  aviso?: { tipo: 'ok' | 'erro'; texto: string },
): string {
  const linhas = empresas
    .map(
      (e) => `<tr class="border-b border-slate-100 hover:bg-slate-50">
        <td class="px-4 py-3 font-medium">${escapeHtml(e.nome)}</td>
        <td class="px-4 py-3 text-sm text-slate-500 font-mono">${escapeHtml(e.id)}</td>
        <td class="px-4 py-3 text-center">${e.usuarios}</td>
        <td class="px-4 py-3 text-center">${e.ativo ? '<span class="text-emerald-600">ativa</span>' : '<span class="text-rose-600">inativa</span>'}</td>
        <td class="px-4 py-3 text-sm text-slate-500">${escapeHtml((e.createdAt ?? '').slice(0, 10))}</td>
      </tr>`,
    )
    .join('\n');

  const avisoHtml = aviso
    ? `<div class="mb-4 px-4 py-3 rounded-xl text-sm ${aviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}">${escapeHtml(aviso.texto)}</div>`
    : '';

  const body = `
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-slate-800">🏢 Empresas (tenants)</h1>
    <p class="text-sm text-slate-500 mt-1">Cada empresa é um prédio isolado: usuários, leads e usinas só dela (RLS). Provisionar cria a empresa + o papel Administrador + o 1º usuário.</p>
  </div>
  ${avisoHtml}
  <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto mb-8">
    <table class="w-full text-left">
      <thead class="text-xs uppercase tracking-wide text-slate-500 bg-slate-50">
        <tr>
          <th class="px-4 py-3">Empresa</th>
          <th class="px-4 py-3">ID</th>
          <th class="px-4 py-3 text-center">Usuários</th>
          <th class="px-4 py-3 text-center">Status</th>
          <th class="px-4 py-3">Criada em</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
  </div>

  <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-xl accent-amber">
    <h2 class="text-lg font-semibold text-slate-800 mb-1">➕ Provisionar nova empresa</h2>
    <p class="text-xs text-slate-500 mb-4">O login e a senha abaixo são do PRIMEIRO administrador do tenant — entregue a ele e peça pra trocar a senha no primeiro acesso.</p>
    <form method="post" action="/dashboard/empresas/nova" class="space-y-3">
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1">Nome da empresa</label>
        <input name="nome" required maxlength="80" class="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="Ex.: Sabion Solar">
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1">Nome do administrador</label>
        <input name="admin_nome" required maxlength="80" class="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="Ex.: Thiago Sabino">
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Login</label>
          <input name="admin_login" required maxlength="60" autocomplete="off" class="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="ex.: thiago">
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Senha inicial</label>
          <input name="admin_senha" type="password" required minlength="8" autocomplete="new-password" class="w-full border border-slate-300 rounded-lg px-3 py-2">
        </div>
      </div>
      <button type="submit" class="px-4 py-2 rounded-lg bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 transition">Criar empresa</button>
    </form>
  </div>`;

  return renderLayout({ active: 'empresas', title: 'Empresas', body, user });
}
