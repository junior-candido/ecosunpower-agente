// Revisão de segurança do R19 (28/09/2026): as rotas /usuarios/:id* rodam no
// client de SERVIÇO (sem RLS) e buscavam/alteravam/excluíam o usuário só pelo
// id. Um admin de tenant (ou quem tem usuarios.editar) conseguia, pelo id:
// ver login/telefone/e-mail de gente de OUTRA empresa, trocar a senha dela
// (tomar a conta), desativá-la ou excluí-la (transferindo o histórico pra
// outro usuário da mesma empresa-alvo), e dar papel de outra empresa / papel
// acima do dele (virar admin). Agora tudo confere a empresa da SESSÃO.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { bancoFalso } from './helpers/banco-falso.js';
import {
  papelCabeNoOperador, conferirAlvoUsuario, conferirPapelParaDar, usuarioParaEditar, updateUser, excluirTransferindoHistorico,
} from '../src/modules/dashboard/users-store.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

const A = 'aaaa0000-0000-4000-8000-000000000001';
const B = 'bbbb0000-0000-4000-8000-000000000002';

const adminA: DashUser = { id: 'ua-adm', companyId: A, nome: 'Admin A', login: 'a', isAdmin: true, roleNome: 'Administrador', permissoes: {} };
const gerenteA: DashUser = { id: 'ua-ger', companyId: A, nome: 'Gerente A', login: 'g', isAdmin: false, roleNome: 'Gerente', permissoes: { usuarios: ['visualizar', 'criar', 'editar'], leads: ['visualizar', 'editar'] } };

function banco() {
  return bancoFalso({
    dashboard_roles: [
      { id: 'ra-adm', company_id: A, nome: 'Administrador', permissoes: {}, is_admin: true },
      { id: 'ra-ger', company_id: A, nome: 'Gerente', permissoes: { usuarios: ['visualizar', 'criar', 'editar'], leads: ['visualizar', 'editar'] }, is_admin: false },
      { id: 'ra-com', company_id: A, nome: 'Comercial', permissoes: { leads: ['visualizar'] }, is_admin: false },
      { id: 'ra-fin', company_id: A, nome: 'Financeiro', permissoes: { financeiro: ['visualizar'] }, is_admin: false },
      { id: 'rb-adm', company_id: B, nome: 'Administrador', permissoes: {}, is_admin: true },
    ],
    dashboard_users: [
      { id: 'ua-adm', company_id: A, nome: 'Admin A', login: 'a', ativo: true, role_id: 'ra-adm', telefone: null, acesso_temporario: false, email: null },
      { id: 'ua-ger', company_id: A, nome: 'Gerente A', login: 'g', ativo: true, role_id: 'ra-ger', telefone: null, acesso_temporario: false, email: null },
      { id: 'ua-com', company_id: A, nome: 'Comercial A', login: 'c', ativo: true, role_id: 'ra-com', telefone: null, acesso_temporario: false, email: null },
      { id: 'ub-adm', company_id: B, nome: 'Admin B', login: 'b', ativo: true, role_id: 'rb-adm', telefone: '5561999990002', acesso_temporario: false, email: 'b@exemplo.invalid' },
      { id: 'ub-2', company_id: B, nome: 'Outro B', login: 'b2', ativo: true, role_id: null, telefone: null, acesso_temporario: false, email: null },
    ],
  });
}

describe('papel que o operador pode dar', () => {
  const papel = (over: Record<string, unknown>) => ({ company_id: A, is_admin: false, permissoes: {}, ...over }) as any;
  it('papel de OUTRA empresa: nunca (nem pro admin)', () => {
    expect(papelCabeNoOperador(papel({ company_id: B, is_admin: true }), adminA)).toBe(false);
  });
  it('admin dá qualquer papel da empresa dele', () => {
    expect(papelCabeNoOperador(papel({ is_admin: true }), adminA)).toBe(true);
  });
  it('não-admin: não dá papel de admin nem com área/nível que ele não tem', () => {
    expect(papelCabeNoOperador(papel({ is_admin: true }), gerenteA)).toBe(false);
    expect(papelCabeNoOperador(papel({ permissoes: { financeiro: ['visualizar'] } }), gerenteA)).toBe(false);
    expect(papelCabeNoOperador(papel({ permissoes: { usuarios: ['administrar'] } }), gerenteA)).toBe(false);
    expect(papelCabeNoOperador(papel({ permissoes: { leads: ['visualizar'] } }), gerenteA)).toBe(true);
  });
});

describe('alvo das rotas /usuarios/:id*', () => {
  it('usuário de OUTRA empresa → 404 (nem existe pra quem pergunta)', async () => {
    const { client } = banco();
    expect(await conferirAlvoUsuario(client, adminA, 'ub-adm')).toMatchObject({ ok: false, status: 404 });
    expect(await usuarioParaEditar(client, 'ub-adm', A)).toBeNull();
  });
  it('mesma empresa → ok; tela de editar traz os campos', async () => {
    const { client } = banco();
    expect(await conferirAlvoUsuario(client, adminA, 'ua-com')).toMatchObject({ ok: true });
    expect(await usuarioParaEditar(client, 'ua-com', A)).toMatchObject({ id: 'ua-com', nome: 'Comercial A', role_id: 'ra-com' });
  });
  it('não-admin não mexe em quem tem papel acima do dele (admin) → 403', async () => {
    const { client } = banco();
    expect(await conferirAlvoUsuario(client, gerenteA, 'ua-adm')).toMatchObject({ ok: false, status: 403 });
    expect(await conferirAlvoUsuario(client, gerenteA, 'ua-com')).toMatchObject({ ok: true });
  });
  it('papel a dar: da empresa e que caiba no operador', async () => {
    const { client } = banco();
    expect(await conferirPapelParaDar(client, adminA, 'rb-adm')).toBe(false);
    expect(await conferirPapelParaDar(client, adminA, 'ra-adm')).toBe(true);
    expect(await conferirPapelParaDar(client, gerenteA, 'ra-adm')).toBe(false);
    expect(await conferirPapelParaDar(client, gerenteA, 'ra-fin')).toBe(false);
    expect(await conferirPapelParaDar(client, gerenteA, 'ra-com')).toBe(true);
    expect(await conferirPapelParaDar(client, gerenteA, 'nao-existe')).toBe(false);
  });
  it('updateUser com empresa: não altera linha de outra empresa', async () => {
    const { client, tabelas } = banco();
    await updateUser(client, 'ub-adm', { senhaHash: 'hash-do-invasor', ativo: false }, A);
    const b = tabelas.dashboard_users.find((u) => u.id === 'ub-adm')!;
    expect(b.senha_hash).toBeUndefined();
    expect(b.ativo).toBe(true);
    await updateUser(client, 'ua-com', { ativo: false }, A);
    expect(tabelas.dashboard_users.find((u) => u.id === 'ua-com')!.ativo).toBe(false);
  });
  it('excluir transferindo: origem de outra empresa → recusa sem mexer em nada', async () => {
    const { client, ops } = banco();
    const r = await excluirTransferindoHistorico(client, 'ub-adm', 'ub-2', A);
    expect(r).toMatchObject({ ok: false });
    expect(ops.filter((o) => o.tipo === 'update')).toEqual([]);
  });
});

describe('router: as rotas /usuarios/:id* usam a trava', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
  const rota = (sig: string) => {
    const i = fonte.indexOf(sig);
    expect(i, sig).toBeGreaterThan(-1);
    return fonte.slice(i, fonte.indexOf('\n  });', i));
  };
  it('GET /usuarios/:id lê pela empresa da sessão', () => {
    expect(rota("router.get('/usuarios/:id',")).toContain('usuarioParaEditar(supabase, userId, cid)');
  });
  it('POST :id, :id/ativo e :id/excluir conferem o alvo antes de mexer', () => {
    for (const sig of ["router.post('/usuarios/:id',", "router.post('/usuarios/:id/ativo',", "router.post('/usuarios/:id/excluir',"]) {
      const r = rota(sig);
      expect(r, sig).toContain('conferirAlvoUsuario(');
      expect(r.indexOf('conferirAlvoUsuario('), sig).toBeLessThan(Math.max(r.indexOf('updateUser('), r.indexOf('excluirTransferindoHistorico(')));
    }
    expect(rota("router.post('/usuarios/:id/excluir',")).toContain('excluirTransferindoHistorico(supabase, userId, destino, req.dashUser!.companyId)');
    expect(rota("router.post('/usuarios/:id',")).toContain('req.dashUser!.companyId);');
  });
  it('papel novo (criar/editar) passa por conferirPapelParaDar', () => {
    expect(rota("router.post('/usuarios/novo',")).toContain('conferirPapelParaDar(');
    expect(rota("router.post('/usuarios/:id',")).toContain('conferirPapelParaDar(');
  });
});
