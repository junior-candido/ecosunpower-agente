// "Atualizar senha da integração" na tela da usina (29/09): só quem edita
// usinas, só a empresa dona, senha nunca volta no HTML, opção de aplicar a
// todas as usinas do mesmo login DA MESMA EMPRESA, limpa o erro e dispara sync.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { bancoFalso, type Linha } from './helpers/banco-falso.js';
import {
  loginAtual, aplicarNovaSenha, validarNovaSenha, camposSenhaDaMarca,
} from '../src/modules/monitoring/credenciais-integracao.js';
import { blocoAtualizarSenha, rotaAtualizarSenha } from '../src/modules/dashboard/monitoramento-credenciais.js';
import { nepAdapter } from '../src/modules/monitoring/adapters/nep.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const CONQ = 'c0c0c0c0-2222-3333-4444-555566667777';
const ID_E1 = '11111111-1111-4111-8111-111111111111';
const ID_E2 = '11111111-1111-4111-8111-222222222222';
const ID_E3 = '11111111-1111-4111-8111-333333333333';
const ID_C1 = '22222222-2222-4222-8222-111111111111';
const SENHA_VELHA = 'SenhaVelha#123';
const SENHA_NOVA = 'NovaSenha!987';

const junior: DashUser = { id: 'u', companyId: ECOSUN, nome: 'Junior', login: 'j', isAdmin: true, roleNome: 'Administrador', permissoes: {} };
const jimena: DashUser = { id: 'j', companyId: CONQ, nome: 'Jimena', login: 'ji', isAdmin: true, roleNome: 'Administradora', permissoes: {}, companyNome: 'Conquista Solar' };
const soLeitura: DashUser = { id: 'v', companyId: ECOSUN, nome: 'Vendedor', login: 'v', isAdmin: false, roleNome: 'Vendas', permissoes: { usinas: ['visualizar'] } };

const gw = (id: string, company: string, email: string, site: string, extra: Linha = {}): Linha => ({
  id, company_id: company, marca_inversor: 'goodwe', apelido: `Usina ${site}`, ativo: true,
  ultimo_erro: 'GoodWe: senha inválida', api_credentials: { email, password: SENHA_VELHA, site_id: site }, ...extra,
});

function banco(): Record<string, Linha[]> {
  return {
    sistemas_clientes: [
      gw(ID_E1, ECOSUN, 'inst@ecosun.com', 'S1'),
      gw(ID_E2, ECOSUN, 'INST@ecosun.com ', 'S2'),            // mesmo login (maiúsc./espaço)
      gw(ID_E3, ECOSUN, 'outro@ecosun.com', 'S3'),            // outro login
      gw(ID_C1, CONQ, 'inst@ecosun.com', 'S9'),               // mesmo login, OUTRA empresa
    ],
  };
}

function resFalso() {
  const r = {
    statusCode: 200, corpo: undefined as unknown, redirecionou: null as string | null,
    status(n: number) { r.statusCode = n; return r; },
    json(b: unknown) { r.corpo = b; return r; },
    send(b: unknown) { r.corpo = b; return r; },
    type() { return r; },
    redirect(u: string) { r.redirecionou = u; return r; },
  };
  return r;
}
const req = (user: DashUser | undefined, id: string, body: Record<string, unknown>) =>
  ({ dashUser: user, params: { id }, body, query: {} }) as unknown as Request;

const credsDe = (t: Record<string, Linha[]>, id: string) => t.sistemas_clientes.find((l) => l.id === id)!.api_credentials as Record<string, unknown>;

beforeEach(() => {
  delete process.env.RLS_TENANT_ROTAS;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('credenciais-integracao (puro)', () => {
  it('só marcas de login + senha', () => {
    expect(camposSenhaDaMarca('goodwe')).not.toBeNull();
    expect(camposSenhaDaMarca('saj')).not.toBeNull();
    expect(camposSenhaDaMarca('deye')).not.toBeNull();
    expect(camposSenhaDaMarca('solaredge')).toBeNull();
    expect(camposSenhaDaMarca('sungrow')).toBeNull();
  });

  it('aplicar mantém o resto das credenciais (site_id, appId...) e troca só login/senha', () => {
    const novo = aplicarNovaSenha('deye', { appId: 'A', appSecret: 'B', email: 'x@y.com', password: 'velha', site_id: '9' }, { login: 'x@y.com', senha: 'nova' });
    expect(novo).toEqual({ appId: 'A', appSecret: 'B', email: 'x@y.com', password: 'nova', site_id: '9' });
  });

  it('NEP: sai o token antigo (jwt) — com e-mail + senha o adapter renova sozinho', () => {
    const novo = aplicarNovaSenha('nep', { jwt: 'vencido', site_id: 'BR_1' }, { login: 'a@b.com', senha: 'nova' });
    expect(novo).toEqual({ site_id: 'BR_1', email: 'a@b.com', password: 'nova' });
  });

  it('validar: senha obrigatória; login em branco mantém o atual', () => {
    expect(validarNovaSenha('goodwe', { email: 'a@b.com' }, { senha: '' }).ok).toBe(false);
    expect(validarNovaSenha('goodwe', { email: 'a@b.com' }, { senha: 'x' })).toEqual({ ok: true, login: 'a@b.com', senha: 'x' });
    expect(validarNovaSenha('goodwe', {}, { senha: 'x' }).ok).toBe(false);
    expect(validarNovaSenha('goodwe', {}, { login: 'nao-e-email', senha: 'x' }).ok).toBe(false);
    expect(loginAtual('abb', { email: 'u@b.com' })).toBe('u@b.com');
  });

  it('NEP no modo e-mail + senha também entra na descoberta de usinas novas', () => {
    expect(nepAdapter.extractAccountCreds!({ email: 'a@b.com', password: 'p', site_id: 'X' })).toEqual({ email: 'a@b.com', password: 'p' });
    expect(nepAdapter.extractAccountCreds!({ jwt: 'T', site_id: 'X' })).toEqual({ jwt: 'T' });
  });
});

describe('blocoAtualizarSenha (HTML)', () => {
  const sis = { id: ID_E1, marca_inversor: 'goodwe', api_credentials: { email: 'inst@ecosun.com', password: SENHA_VELHA, site_id: 'S1' } };

  it('mostra o login, campo de senha tipo password vazio — e NUNCA a senha guardada', () => {
    const html = blocoAtualizarSenha(sis as any, { podeEditar: true });
    expect(html).toContain('inst@ecosun.com');
    expect(html).toMatch(/<input[^>]*type="password"[^>]*name="senha"|<input[^>]*name="senha"[^>]*type="password"/);
    expect(html).not.toContain(SENHA_VELHA);
    expect(html).toContain(`/dashboard/monitoramento/${ID_E1}/credenciais`);
    expect(html).toContain('name="aplicar_todas"');
  });

  it('sem permissão de editar ou marca sem senha → nada', () => {
    expect(blocoAtualizarSenha(sis as any, { podeEditar: false })).toBe('');
    expect(blocoAtualizarSenha({ ...sis, marca_inversor: 'solaredge' } as any, { podeEditar: true })).toBe('');
  });
});

describe('POST /monitoramento/:id/credenciais', () => {
  it('tenant NÃO atualiza usina de outra empresa (404, nada muda, sem sync)', async () => {
    const { client, tabelas } = bancoFalso(banco());
    const sync = vi.fn();
    const res = resFalso();
    await rotaAtualizarSenha(client, sync)(req(jimena, ID_E1, { senha: SENHA_NOVA }), res as unknown as Response);
    expect(res.statusCode).toBe(404);
    expect(credsDe(tabelas, ID_E1).password).toBe(SENHA_VELHA);
    expect(sync).not.toHaveBeenCalled();
  });

  it('sem permissão de editar usinas → 403', async () => {
    const { client, tabelas } = bancoFalso(banco());
    const sync = vi.fn();
    const res = resFalso();
    await rotaAtualizarSenha(client, sync)(req(soLeitura, ID_E1, { senha: SENHA_NOVA }), res as unknown as Response);
    expect(res.statusCode).toBe(403);
    expect(credsDe(tabelas, ID_E1).password).toBe(SENHA_VELHA);
  });

  it('só esta usina: troca a senha, limpa o erro, dispara o sync e não devolve a senha', async () => {
    const { client, tabelas } = bancoFalso(banco());
    const sync = vi.fn();
    const res = resFalso();
    await rotaAtualizarSenha(client, sync)(req(junior, ID_E1, { senha: SENHA_NOVA }), res as unknown as Response);
    expect(res.redirecionou).toMatch(new RegExp(`/dashboard/monitoramento/${ID_E1}\\?senha=ok&n=1`));
    expect(res.redirecionou).not.toContain(SENHA_NOVA);
    expect(credsDe(tabelas, ID_E1)).toEqual({ email: 'inst@ecosun.com', password: SENHA_NOVA, site_id: 'S1' });
    expect(tabelas.sistemas_clientes.find((l) => l.id === ID_E1)!.ultimo_erro).toBeNull();
    expect(credsDe(tabelas, ID_E2).password).toBe(SENHA_VELHA);
    expect(sync).toHaveBeenCalledWith([ID_E1]);
  });

  it('"aplicar a todas do mesmo login": só as da MESMA empresa com o mesmo e-mail', async () => {
    const { client, tabelas } = bancoFalso(banco());
    const sync = vi.fn();
    const res = resFalso();
    await rotaAtualizarSenha(client, sync)(req(junior, ID_E1, { senha: SENHA_NOVA, aplicar_todas: '1' }), res as unknown as Response);
    expect(credsDe(tabelas, ID_E1).password).toBe(SENHA_NOVA);
    expect(credsDe(tabelas, ID_E2).password).toBe(SENHA_NOVA);
    expect(credsDe(tabelas, ID_E2).site_id).toBe('S2');
    expect(credsDe(tabelas, ID_E3).password).toBe(SENHA_VELHA);   // outro login
    expect(credsDe(tabelas, ID_C1).password).toBe(SENHA_VELHA);   // outra empresa
    expect(tabelas.sistemas_clientes.find((l) => l.id === ID_C1)!.ultimo_erro).toBe('GoodWe: senha inválida');
    expect([...sync.mock.calls[0][0]].sort()).toEqual([ID_E1, ID_E2].sort());
    expect(res.redirecionou).toContain('n=2');
  });

  it('senha em branco → 400 e nada muda', async () => {
    const { client, tabelas } = bancoFalso(banco());
    const sync = vi.fn();
    const res = resFalso();
    await rotaAtualizarSenha(client, sync)(req(junior, ID_E1, { senha: '   ' }), res as unknown as Response);
    expect(res.statusCode).toBe(400);
    expect(credsDe(tabelas, ID_E1).password).toBe(SENHA_VELHA);
    expect(sync).not.toHaveBeenCalled();
    expect(String(res.corpo)).not.toContain(SENHA_VELHA);
  });
});
