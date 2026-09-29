// Comparador de Lojas (/dashboard/lojas) — faxina pós-renovação (29/09/2026).
// A rota era a única do grupo Comercial sem `exigir(...)`: qualquer usuário
// logado (até o papel "Campo", que só vê Serviços) abria os preços de custo
// das distribuidoras. Agora segue os vizinhos do grupo sem área no menu
// (Fechou!, Contratos): exige Propostas › visualizar. O catálogo já era lido
// pela empresa da SESSÃO (CatalogoLojaService com companyId) — continua.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Request, Response } from 'express';
import { exigirPermissao, type DashUser } from '../src/modules/dashboard/permissions.js';

const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');

const base = { id: 'u', companyId: '00000000-0000-0000-0000-000000000001', nome: 'X', login: 'x', isAdmin: false, roleNome: 'Papel' };
const campo: DashUser = { ...base, roleNome: 'Campo', permissoes: { servicos: ['visualizar', 'criar'] } };
const comercial: DashUser = { ...base, roleNome: 'Comercial', permissoes: { leads: ['visualizar'], propostas: ['visualizar'] } };
const admin: DashUser = { ...base, isAdmin: true, roleNome: 'Administrador', permissoes: {} };

function chamar(u: DashUser | undefined) {
  const res = { status: vi.fn(), send: vi.fn() };
  res.status.mockReturnValue(res);
  const next = vi.fn();
  exigirPermissao('propostas', 'visualizar')({ dashUser: u } as unknown as Request, res as unknown as Response, next);
  return { res, next };
}

describe('exigirPermissao — a fechadura das rotas do painel', () => {
  it('papel sem a área → 403 "Sem permissão" (não chama a rota)', () => {
    const { res, next } = chamar(campo);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Sem permissão'));
  });
  it('sem usuário → 403', () => {
    expect(chamar(undefined).res.status).toHaveBeenCalledWith(403);
  });
  it('papel com Propostas › visualizar e admin passam', () => {
    expect(chamar(comercial).next).toHaveBeenCalled();
    expect(chamar(admin).next).toHaveBeenCalled();
  });
});

describe('GET /lojas', () => {
  it('exige Propostas › visualizar (igual Fechou! e Contratos)', () => {
    expect(fonte).toContain("router.get('/lojas', exigir('propostas', 'visualizar'), async");
  });
  it('o exigir do router é a mesma fechadura testada acima', () => {
    expect(fonte).toMatch(/function exigir\([^)]*\)[^{]*\{\s*return exigirPermissao\(area, nivel\);/);
  });
  it('lê o catálogo da empresa da SESSÃO (nunca de parâmetro)', () => {
    const i = fonte.indexOf("router.get('/lojas'");
    const trecho = fonte.slice(i, fonte.indexOf('res.send(renderLojasPage', i));
    expect(trecho).toContain('const companyId = req.dashUser!.companyId;');
    expect(trecho).toContain('new CatalogoLojaService({ client: supabase, companyId })');
    expect(trecho).not.toMatch(/req\.(query|body|params)\.(company|empresa)/i);
  });
});
