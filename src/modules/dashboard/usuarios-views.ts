// src/modules/dashboard/usuarios-views.ts
// Telas de /usuarios: lista + form de criar/editar. Só admin (gating no router).
import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import type { UserListItem, RoleRow } from './users-store.js';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function renderUsuariosListPage(users: UserListItem[], roles: RoleRow[], viewer?: DashUser): string {
  const linhas = users.map((u) => `
    <tr class="border-b border-slate-200 hover:bg-slate-50">
      <td class="px-3 py-2">${esc(u.nome)}</td>
      <td class="px-3 py-2 text-slate-500">${esc(u.login)}</td>
      <td class="px-3 py-2">${esc(u.role_nome ?? '—')}</td>
      <td class="px-3 py-2">${u.ativo ? '🟢 ativo' : '⚪ inativo'}</td>
      <td class="px-3 py-2 text-right">
        <a href="/dashboard/usuarios/${u.id}" class="text-sky-600 hover:underline">editar</a>
      </td>
    </tr>`).join('');

  const opcoesPapel = roles.map((r) => `<option value="${r.id}">${esc(r.nome)}</option>`).join('');

  const body = `
  <div class="flex items-center justify-between mb-4">
    <h1 class="text-xl font-bold">Usuários</h1>
  </div>
  <form method="POST" action="/dashboard/usuarios/novo" class="bg-white rounded-lg border border-slate-200 p-4 mb-6 grid grid-cols-1 md:grid-cols-6 gap-3">
    <input name="nome" placeholder="Nome" required class="border border-slate-300 rounded-md px-3 py-1.5" />
    <input name="login" placeholder="Login" required class="border border-slate-300 rounded-md px-3 py-1.5" />
    <input name="senha" type="password" placeholder="Senha inicial" required class="border border-slate-300 rounded-md px-3 py-1.5" />
    <input name="telefone" inputmode="tel" placeholder="Zap (5561999998888)" class="border border-slate-300 rounded-md px-3 py-1.5" />
    <select name="role_id" required class="border border-slate-300 rounded-md px-3 py-1.5">${opcoesPapel}</select>
    <button class="bg-sky-600 hover:bg-sky-700 text-white rounded-md px-4 py-2">Criar usuário</button>
  </form>
  <table class="w-full bg-white rounded-lg border border-slate-200 text-sm">
    <thead><tr class="text-left text-slate-500 border-b border-slate-200">
      <th class="px-3 py-2">Nome</th><th class="px-3 py-2">Login</th><th class="px-3 py-2">Papel</th><th class="px-3 py-2">Status</th><th></th>
    </tr></thead>
    <tbody>${linhas || '<tr><td class="px-3 py-4 text-slate-400" colspan="5">Nenhum usuário</td></tr>'}</tbody>
  </table>`;
  return renderLayout({ active: 'home', title: 'Usuários', body, user: viewer });
}

export function renderUsuarioEditPage(
  user: { id: string; nome: string; login: string; ativo: boolean; role_id: string | null; telefone?: string | null },
  roles: RoleRow[],
  viewer?: DashUser,
): string {
  const opcoes = roles.map((r) => `<option value="${r.id}" ${r.id === user.role_id ? 'selected' : ''}>${esc(r.nome)}</option>`).join('');
  const body = `
  <a href="/dashboard/usuarios" class="text-sky-600 hover:underline text-sm">← Usuários</a>
  <h1 class="text-xl font-bold my-4">Editar: ${esc(user.nome)}</h1>
  <form method="POST" action="/dashboard/usuarios/${user.id}" class="bg-white rounded-lg border border-slate-200 p-4 grid gap-3 max-w-lg">
    <label class="text-sm">Nome
      <input name="nome" value="${esc(user.nome)}" class="w-full border border-slate-300 rounded-md px-3 py-1.5" />
    </label>
    <label class="text-sm">Papel
      <select name="role_id" class="w-full border border-slate-300 rounded-md px-3 py-1.5">${opcoes}</select>
    </label>
    <label class="text-sm">Nova senha (deixe em branco pra manter)
      <input name="senha" type="password" class="w-full border border-slate-300 rounded-md px-3 py-1.5" />
    </label>
    <label class="text-sm">Telefone (zap) — recebe o aviso de serviço atribuído
      <input name="telefone" inputmode="tel" value="${esc(user.telefone ?? '')}" placeholder="5561999998888" class="w-full border border-slate-300 rounded-md px-3 py-1.5" />
    </label>
    <label class="text-sm flex items-center gap-2">
      <input type="checkbox" name="ativo" ${user.ativo ? 'checked' : ''} /> Ativo
    </label>
    <button class="bg-sky-600 hover:bg-sky-700 text-white rounded-md px-4 py-2 w-fit">Salvar</button>
  </form>`;
  return renderLayout({ active: 'home', title: 'Editar usuário', body, user: viewer });
}
