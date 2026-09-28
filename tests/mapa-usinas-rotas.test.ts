// Rotas do Mapa das Usinas: /command-center/mapa.json (company_id da SESSÃO,
// módulo contratado, papel, cache curto), Localizar (em lote, por usina) e
// salvar o alfinete arrastado. Banco falso que aplica os filtros.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { bancoFalso, type Linha } from './helpers/banco-falso.js';
import {
  rotaMapaJson, rotaLocalizarPagina, rotaLocalizarUma, rotaSalvarPosicao, _limparCacheMapa,
} from '../src/modules/dashboard/mapa-usinas-rotas.js';
import { Geocodificador } from '../src/modules/monitoring/geocodificacao.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const CONQ = 'c0c0c0c0-2222-3333-4444-555566667777';
const AGORA = new Date('2026-09-28T15:00:00Z');
const ID_E = '11111111-1111-4111-8111-111111111111';
const ID_C = '22222222-2222-4222-8222-222222222222';

const junior: DashUser = { id: 'u', companyId: ECOSUN, nome: 'Junior', login: 'j', isAdmin: true, roleNome: 'Administrador', permissoes: {} };
const jimena: DashUser = { id: 'j', companyId: CONQ, nome: 'Jimena', login: 'ji', isAdmin: true, roleNome: 'Administradora', permissoes: {}, companyNome: 'Conquista Solar' };
const soLeitura: DashUser = { id: 'v', companyId: ECOSUN, nome: 'Vendedor', login: 'v', isAdmin: false, roleNome: 'Vendas', permissoes: { usinas: ['visualizar'] } };
const semUsinas: DashUser = { id: 'x', companyId: ECOSUN, nome: 'Fulano', login: 'x', isAdmin: false, roleNome: 'Marketing', permissoes: { marketing: ['editar'] } };

const usina = (id: string, company: string, extra: Linha = {}): Linha => ({
  id, company_id: company, apelido: `Usina ${id.slice(0, 4)}`, potencia_kwp: 8, cidade: 'Gama', uf: 'DF', ativo: true,
  ultima_sincronizacao: '2026-09-28T14:50:00Z', ultimo_erro: null, status_inversor: 'ok', acompanhamento: 'api',
  marca_inversor: 'deye', lead_id: null, lat: -16.02, lng: -48.06, geo_fonte: 'endereco', ...extra,
});

function banco(modulosConq: string[] = ['eva', 'monitoramento']): Record<string, Linha[]> {
  return {
    sistemas_clientes: [
      usina(ID_E, ECOSUN, { apelido: 'Chácara do Junior' }),
      usina(ID_C, CONQ, { apelido: 'Fazenda Boa Esperança', cidade: 'Vitória da Conquista', uf: 'BA', lat: -14.86, lng: -40.84 }),
      usina('33333333-3333-4333-8333-333333333333', ECOSUN, { apelido: 'Sem ponto EcoSun', lat: null, lng: null, geo_fonte: null }),
    ],
    geracao_diaria: [],
    leads: [],
    empresa_modulos: modulosConq.map((modulo) => ({ company_id: CONQ, modulo, ativo: true })),
  };
}

function resFalso() {
  const r = {
    statusCode: 200, corpo: undefined as unknown, headers: {} as Record<string, string>, redirecionou: null as string | null,
    status(n: number) { r.statusCode = n; return r; },
    json(b: unknown) { r.corpo = b; return r; },
    send(b: unknown) { r.corpo = b; return r; },
    type() { return r; },
    setHeader(k: string, v: string) { r.headers[k.toLowerCase()] = v; return r; },
    redirect(u: string) { r.redirecionou = u; return r; },
  };
  return r;
}
const req = (user: DashUser | undefined, extra: Record<string, unknown> = {}) => ({ dashUser: user, query: {}, params: {}, body: {}, ...extra }) as unknown as Request;

beforeEach(() => {
  delete process.env.RLS_TENANT_ROTAS;
  _limparCacheMapa();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('GET /command-center/mapa.json', () => {
  it('tenant só recebe os alfinetes DELE', async () => {
    const { client } = bancoFalso(banco());
    const res = resFalso();
    await rotaMapaJson(client, () => AGORA)(req(jimena), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    const texto = JSON.stringify(res.corpo);
    expect(texto).toContain('Fazenda Boa Esperança');
    expect(texto).not.toContain('Chácara do Junior');
    expect(texto).not.toContain('Sem ponto EcoSun');
    expect(res.headers['cache-control']).toMatch(/private/);
  });

  it('a casa vê as dela (e o aviso das sem posição), nunca as do tenant', async () => {
    const { client } = bancoFalso(banco());
    const res = resFalso();
    await rotaMapaJson(client, () => AGORA)(req(junior), res as unknown as Response);
    const d = res.corpo as { usinas: Array<{ nome: string }>; semPosicao: number; podeLocalizar: boolean };
    expect(d.usinas.map((u) => u.nome)).toEqual(['Chácara do Junior']);
    expect(d.semPosicao).toBe(1);
    expect(d.podeLocalizar).toBe(true);
    expect(JSON.stringify(d)).not.toContain('Fazenda');
  });

  it('empresa sem o módulo de usinas: 403 "trancado", sem ler usinas', async () => {
    const { client, ops } = bancoFalso(banco(['eva']));
    const res = resFalso();
    await rotaMapaJson(client, () => AGORA)(req(jimena), res as unknown as Response);
    expect(res.statusCode).toBe(403);
    expect(res.corpo).toMatchObject({ trancado: true });
    expect(ops.some((o) => o.tabela === 'sistemas_clientes')).toBe(false);
  });

  it('papel sem usinas: 403; sem sessão: 401', async () => {
    const { client } = bancoFalso(banco());
    const r1 = resFalso();
    await rotaMapaJson(client, () => AGORA)(req(semUsinas), r1 as unknown as Response);
    expect(r1.statusCode).toBe(403);
    const r2 = resFalso();
    await rotaMapaJson(client, () => AGORA)(req(undefined), r2 as unknown as Response);
    expect(r2.statusCode).toBe(401);
  });

  it('só leitura: vê o mapa mas não o "Localizar"', async () => {
    const { client } = bancoFalso(banco());
    const res = resFalso();
    await rotaMapaJson(client, () => AGORA)(req(soLeitura), res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect((res.corpo as { podeLocalizar: boolean }).podeLocalizar).toBe(false);
  });

  it('cache curto por EMPRESA: 2ª chamada não relê; outra empresa não pega o cache da primeira', async () => {
    const { client, ops } = bancoFalso(banco());
    await rotaMapaJson(client, () => AGORA)(req(junior), resFalso() as unknown as Response);
    const n = ops.filter((o) => o.tabela === 'sistemas_clientes').length;
    await rotaMapaJson(client, () => AGORA)(req(junior), resFalso() as unknown as Response);
    expect(ops.filter((o) => o.tabela === 'sistemas_clientes').length).toBe(n);
    const res = resFalso();
    await rotaMapaJson(client, () => AGORA)(req(jimena), res as unknown as Response);
    expect(JSON.stringify(res.corpo)).not.toContain('Chácara do Junior');
  });

  it('falha de leitura: 503 "sem dado", nunca um mapa vazio', async () => {
    const { client } = bancoFalso(banco(), { erroEm: { sistemas_clientes: 'timeout' } });
    const res = resFalso();
    await rotaMapaJson(client, () => AGORA)(req(junior), res as unknown as Response);
    expect(res.statusCode).toBe(503);
  });
});

describe('Localizar usinas sem posição', () => {
  const geo = () => {
    const f = vi.fn(async () => new Response(JSON.stringify([{ lat: '-16.0123', lon: '-48.0555' }]), { status: 200 }));
    return { g: new Geocodificador({ fetch: f as unknown as typeof fetch, esperar: async () => {}, intervaloMs: 0 }), f };
  };

  it('página lista só as pendentes da empresa; exige poder editar usinas', async () => {
    const { client } = bancoFalso(banco());
    const res = resFalso();
    await rotaLocalizarPagina(client)(req(junior), res as unknown as Response);
    expect(String(res.corpo)).toContain('Sem ponto EcoSun');
    expect(String(res.corpo)).not.toContain('Fazenda');
    const r2 = resFalso();
    await rotaLocalizarPagina(client)(req(soLeitura), r2 as unknown as Response);
    expect(r2.statusCode).toBe(403);
  });

  it('lista não carregou: diz "sem dado", nunca "todas no mapa"', async () => {
    const { client } = bancoFalso(banco(), { erroEm: { sistemas_clientes: 'timeout' } });
    const res = resFalso();
    await rotaLocalizarPagina(client)(req(junior), res as unknown as Response);
    expect(res.statusCode).toBe(503);
    expect(String(res.corpo)).toContain('Sem dado agora');
    expect(String(res.corpo)).not.toContain('já estão no mapa');
  });

  it('POST por usina: grava e responde JSON; usina de outra empresa = 404', async () => {
    const b = banco();
    const { client } = bancoFalso(b);
    const { g } = geo();
    const id = '33333333-3333-4333-8333-333333333333';
    const res = resFalso();
    await rotaLocalizarUma(client, g)(req(junior, { params: { id } }), res as unknown as Response);
    expect(res.corpo).toMatchObject({ ok: true });
    expect(b.sistemas_clientes[2].lat).not.toBeNull();
    const r2 = resFalso();
    await rotaLocalizarUma(client, g)(req(jimena, { params: { id } }), r2 as unknown as Response);
    expect(r2.statusCode).toBe(404);
    const r3 = resFalso();
    await rotaLocalizarUma(client, g)(req(soLeitura, { params: { id } }), r3 as unknown as Response);
    expect(r3.statusCode).toBe(403);
    const r4 = resFalso();
    await rotaLocalizarUma(client, g)(req(junior, { params: { id: 'nao-e-uuid' } }), r4 as unknown as Response);
    expect(r4.statusCode).toBe(400);
  });
});

describe('POST /monitoramento/:id/posicao (alfinete arrastado)', () => {
  it('salva como manual na usina da empresa; outra empresa não mexe', async () => {
    const b = banco();
    const { client } = bancoFalso(b);
    const res = resFalso();
    await rotaSalvarPosicao(client)(req(junior, { params: { id: ID_E }, body: { lat: '-16.0301', lng: '-48.0702' } }), res as unknown as Response);
    expect(res.corpo).toMatchObject({ ok: true });
    expect(b.sistemas_clientes[0]).toMatchObject({ lat: -16.0301, lng: -48.0702, geo_fonte: 'manual' });

    const r2 = resFalso();
    await rotaSalvarPosicao(client)(req(jimena, { params: { id: ID_E }, body: { lat: '-15', lng: '-47' } }), r2 as unknown as Response);
    expect(r2.statusCode).toBe(404);
    expect(b.sistemas_clientes[0].lat).toBe(-16.0301);
  });

  it('valida: sem permissão de editar = 403; número inválido = 400', async () => {
    const { client } = bancoFalso(banco());
    const r1 = resFalso();
    await rotaSalvarPosicao(client)(req(soLeitura, { params: { id: ID_E }, body: { lat: '-16', lng: '-48' } }), r1 as unknown as Response);
    expect(r1.statusCode).toBe(403);
    const r2 = resFalso();
    await rotaSalvarPosicao(client)(req(junior, { params: { id: ID_E }, body: { lat: 'abc', lng: '-48' } }), r2 as unknown as Response);
    expect(r2.statusCode).toBe(400);
    const r3 = resFalso();
    await rotaSalvarPosicao(client)(req(junior, { params: { id: ID_E }, body: { lat: '48.8', lng: '2.3' } }), r3 as unknown as Response);
    expect(r3.statusCode).toBe(400);
  });
});
