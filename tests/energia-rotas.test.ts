// Rotas da Gestão de Energia com req/res falsos (molde do cc-rotas.test.ts).
// Foco: isolamento por empresa, segredos (chave e token) e "nunca número inventado".
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  rotaListaEnergia, rotaCriarMedidor, rotaSalvarMedidor, rotaNovoToken, rotaTestarConexao, rotaEnergiaDaCasa, rotaEditarMedidor,
  rotaApagarMedidor,
} from '../src/modules/dashboard/energia-rotas.js';
import { cifrarCred, decifrarCred, hashToken } from '../src/modules/energia/credenciais.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';
import type { MedidorAdapter } from '../src/modules/energia/types.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const KEY = 'e'.repeat(64);
const MID = '11111111-2222-3333-4444-555555555555';
const junior: DashUser = { id: 'u', companyId: ECOSUN, nome: 'Junior', login: 'j', isAdmin: true, roleNome: 'Admin', permissoes: {} };
const tenant: DashUser = { id: 't', companyId: TENANT, nome: 'T', login: 't', isAdmin: true, roleNome: 'Admin', permissoes: {}, companyNome: 'Sabion' };
const leitor: DashUser = { ...junior, id: 'l', isAdmin: false, permissoes: { usinas: ['visualizar'] } };
const AGORA = new Date('2026-09-28T15:00:00Z');

type Reg = { tabela: string; op: string; filtros: Array<[string, string, unknown]>; payload?: unknown };

/** Supabase falso: responde por tabela, guarda filtros e payloads. */
function dbFalso(respostas: Record<string, unknown[] | { error: { code?: string; message: string } }> = {}) {
  const chamadas: Reg[] = [];
  const from = vi.fn((tabela: string) => {
    const reg: Reg = { tabela, op: 'select', filtros: [] };
    chamadas.push(reg);
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.insert = (p: unknown) => { reg.op = 'insert'; reg.payload = p; return q; };
    q.update = (p: unknown) => { reg.op = 'update'; reg.payload = p; return q; };
    q.delete = () => { reg.op = 'delete'; return q; };
    for (const op of ['eq', 'gte', 'lte', 'lt', 'in']) q[op] = (c: string, v: unknown) => { reg.filtros.push([op, c, v]); return q; };
    q.or = (v: string) => { reg.filtros.push(['or', '', v]); return q; };
    q.is = (c: string, v: unknown) => { reg.filtros.push(['is', c, v]); return q; };
    q.order = () => q; q.limit = () => q; q.range = () => q;
    q.then = (ok: (r: unknown) => unknown) => {
      const r = respostas[tabela];
      if (r && !Array.isArray(r)) return Promise.resolve({ data: null, error: r.error }).then(ok);
      let dados = (r ?? []) as Array<Record<string, unknown>>;
      // Simula o filtro por empresa do banco (o teste confere que ele foi pedido).
      const emp = reg.filtros.find((f) => f[1] === 'company_id');
      if (emp) dados = dados.filter((x) => !('company_id' in x) || x.company_id === emp[2]);
      if (reg.op === 'insert') dados = [{ id: MID }];
      return Promise.resolve({ data: dados, error: null }).then(ok);
    };
    return q;
  });
  return { from, chamadas } as unknown as SupabaseClient & { chamadas: Reg[] };
}

function resFalso() {
  const res = { redirect: vi.fn(), type: vi.fn(), send: vi.fn(), status: vi.fn(), json: vi.fn(), setHeader: vi.fn(), headersSent: false };
  res.type.mockReturnValue(res); res.status.mockReturnValue(res);
  return res;
}
const req = (user: DashUser, o: Partial<{ params: Record<string, string>; body: Record<string, unknown>; query: Record<string, unknown> }> = {}) =>
  ({ dashUser: user, params: {}, body: {}, query: {}, headers: {}, ...o } as unknown as Request);
const html = (res: ReturnType<typeof resFalso>) => String(res.send.mock.calls[0]?.[0] ?? '');

const MEDIDOR = {
  id: MID, company_id: ECOSUN, apelido: 'Quadro <script>alert(1)</script>', device_id: '007007422d90', modelo: null, modo_coleta: 'push',
  perfil: 'triphase', canais: { rede: 2 }, ligacao: 'mono', tensao_nominal_v: 220, concessionaria: 'Neoenergia', uc_instalacao: '123456',
  codigo_cliente: null, grupo_gd: 'gd1', sistema_id: 'sis-1', lead_id: null, status: 'ok', status_desde: null,
  ultima_leitura_em: '2026-09-28T14:59:00Z', ultimo_erro: null, consentimento_em: null, ativo: true,
  api_credentials_cifrado: cifrarCred({ server_uri: 'https://shelly-77-eu.shelly.cloud', auth_key: 'CHAVE-QUE-NAO-PODE-VAZAR-9z8y' }, KEY, { medidorId: MID, companyId: ECOSUN }),
  token_ingest_hash: 'ab'.repeat(32),
};

beforeEach(() => {
  delete process.env.RLS_TENANT_ROTAS;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const deps = (o = {}) => ({ agora: () => AGORA, keyHex: () => KEY, ...o });

describe('lista e isolamento', () => {
  it('toda consulta leva o company_id da sessão', async () => {
    const db = dbFalso({ medidores_energia: [MEDIDOR] });
    const res = resFalso();
    await rotaListaEnergia(db, deps())(req(tenant), res as unknown as Response);
    expect(db.chamadas.length).toBeGreaterThan(0);
    for (const c of db.chamadas) expect(c.filtros, c.tabela).toContainEqual(['eq', 'company_id', TENANT]);
    expect(html(res)).not.toContain('Quadro'); // o medidor é da EcoSun
  });

  it('medidor de outra empresa → 404 (não vaza que existe)', async () => {
    const db = dbFalso({ medidores_energia: [MEDIDOR] });
    const res = resFalso();
    await rotaEnergiaDaCasa(db, deps())(req(tenant, { params: { id: MID } }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('chave da nuvem recusada aparece à parte do "Recebendo dado" do script', async () => {
    const db = dbFalso({ medidores_energia: [{ ...MEDIDOR, modo_coleta: 'push_nuvem', status: 'ok', nuvem_ok: false }] });
    const res = resFalso();
    await rotaListaEnergia(db, deps())(req(junior), res as unknown as Response);
    expect(html(res)).toContain('Recebendo dado');
    expect(html(res)).toContain('Chave da nuvem recusada');
    // As duas pílulas quebram linha no celular (390 px) em vez de vazar da célula.
    expect(html(res)).toMatch(/<span class="en-pilulas">[\s\S]*Recebendo dado[\s\S]*Chave da nuvem recusada[\s\S]*<\/span>/);
    expect(html(res)).toMatch(/\.en-pilulas\{[^}]*flex-wrap:wrap/);
  });

  it('migrations não aplicadas: a tela explica, não quebra', async () => {
    const db = dbFalso({ medidores_energia: { error: { code: '42P01', message: 'relation "medidores_energia" does not exist' } } });
    const res = resFalso();
    await rotaListaEnergia(db, deps())(req(junior), res as unknown as Response);
    expect(html(res)).toMatch(/migrations 136 e 137/);
  });
});

describe('Energia da casa', () => {
  const diaria = Array.from({ length: 10 }, (_, i) => ({
    company_id: ECOSUN, dia: `2026-09-${String(17 + i).padStart(2, '0')}`, importado_kwh: 21, exportado_kwh: 14.5, cobertura_pct: 100, base_noturna_w: 1000, demanda_max_w: 6000,
  }));
  const geracao = diaria.map((d) => ({ company_id: ECOSUN, data: d.dia, geracao_kwh: 24.75 }));

  it('mostra gerado × comprado × devolvido × consumido, escapa o nome e não vaza a chave', async () => {
    const db = dbFalso({ medidores_energia: [MEDIDOR], energia_diaria: diaria, geracao_diaria: geracao, energia_15min: [], demonstrativos_gd: [], sistemas_clientes: [{ company_id: ECOSUN, apelido: 'Solis casa' }] });
    const res = resFalso();
    await rotaEnergiaDaCasa(db, deps())(req(junior, { params: { id: MID } }), res as unknown as Response);
    const h = html(res);
    expect(h).toContain('Consumido pela casa');
    expect(h).toContain('<div class="cc-val">313<small>kWh</small></div>'); // 10 × (24,75 + 21 − 14,5) = 312,5
    expect(h).not.toContain('<script>alert(1)</script>');
    expect(h).toContain('&lt;script&gt;');
    expect(h).not.toContain('CHAVE-QUE-NAO-PODE-VAZAR');
    expect(h).not.toContain(MEDIDOR.api_credentials_cifrado);
    for (const c of db.chamadas) expect(c.filtros, c.tabela).toContainEqual(['eq', 'company_id', ECOSUN]);
    // 15 min só do canal da rede (usa a ordem da chave primária, não mistura fases)
    expect(db.chamadas.find((c) => c.tabela === 'energia_15min')!.filtros).toContainEqual(['eq', 'canal', 2]);
  });

  it('conferência sem veredito (mês com pouco dado): números apagados e nota, nada de "Bate"', async () => {
    const db = dbFalso({ medidores_energia: [MEDIDOR], energia_diaria: diaria, geracao_diaria: geracao, energia_15min: [], demonstrativos_gd: [{ company_id: ECOSUN, referencia: '2026-09-01', injetado_kwh: 318, consumo_kwh: 471 }] });
    const res = resFalso();
    await rotaEnergiaDaCasa(db, deps())(req(junior, { params: { id: MID } }), res as unknown as Response);
    const h = html(res);
    const conc = h.slice(h.indexOf('Conferência com a Neoenergia'));
    expect(conc).toContain('Sem dado para comparar');
    expect(conc).toMatch(/class="en-conc-num en-apagado"[^>]*>318/);
    expect(conc).toMatch(/só para referência/);
    expect(conc).not.toMatch(/>Bate</);
  });

  it('sem usina: pede para ligar a usina e não inventa consumo', async () => {
    const db = dbFalso({ medidores_energia: [{ ...MEDIDOR, sistema_id: null }], energia_diaria: diaria, energia_15min: [], demonstrativos_gd: [] });
    const res = resFalso();
    await rotaEnergiaDaCasa(db, deps())(req(junior, { params: { id: MID } }), res as unknown as Response);
    expect(html(res)).toMatch(/Ligue a usina a este medidor/);
  });

  it('leitor não vê botões de editar', async () => {
    const db = dbFalso({ medidores_energia: [MEDIDOR], energia_diaria: [], energia_15min: [] });
    const res = resFalso();
    await rotaEnergiaDaCasa(db, deps())(req(leitor, { params: { id: MID } }), res as unknown as Response);
    expect(html(res)).not.toContain('Editar medidor');
  });
});

describe('cadastro', () => {
  const corpo = { apelido: 'Casa', device_id: 'shellypro3em-aabbccddeeff', perfil: 'triphase', canal: '2', modo_coleta: 'push', consentimento: 'on' };

  it('push: grava só o HASH do token, com a empresa da sessão, e mostra o token uma vez (no-store)', async () => {
    const db = dbFalso({ sistemas_clientes: [] });
    const res = resFalso();
    await rotaCriarMedidor(db, deps())(req(tenant, { body: { ...corpo, company_id: ECOSUN } }), res as unknown as Response);
    const ins = db.chamadas.find((c) => c.op === 'insert')!;
    const p = ins.payload as Record<string, unknown>;
    expect(p.company_id).toBe(TENANT); // nunca do corpo do formulário
    const h = html(res);
    const token = /var TOKEN = &quot;([A-Za-z0-9_-]+)&quot;;/.exec(h)?.[1];
    expect(token).toBeTruthy();
    expect(p.token_ingest_hash).toBe(hashToken(token!));
    expect(JSON.stringify(p)).not.toContain(token!);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('nuvem sem ENERGIA_CRED_KEY: erro amigável e nada gravado', async () => {
    const db = dbFalso({ sistemas_clientes: [] });
    const res = resFalso();
    await rotaCriarMedidor(db, deps({ keyHex: () => undefined }))(req(junior, { body: { ...corpo, modo_coleta: 'nuvem', server_uri: 'x.shelly.cloud', auth_key: 'SEGREDO-1' } }), res as unknown as Response);
    expect(db.chamadas.some((c) => c.op === 'insert')).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(html(res)).toContain('ENERGIA_CRED_KEY');
    expect(html(res)).not.toContain('SEGREDO-1');
  });

  it('nuvem: grava a chave cifrada, nunca em claro', async () => {
    const db = dbFalso({ sistemas_clientes: [] });
    const res = resFalso();
    await rotaCriarMedidor(db, deps())(req(junior, { body: { ...corpo, modo_coleta: 'nuvem', server_uri: 'shelly-77-eu.shelly.cloud', auth_key: 'SEGREDO-2' } }), res as unknown as Response);
    const p = db.chamadas.find((c) => c.op === 'insert')!.payload as Record<string, unknown>;
    expect(JSON.stringify(p)).not.toContain('SEGREDO-2');
    expect(p.api_credentials_cifrado).toBeTruthy();
    // cifrada amarrada ao id que o próprio insert leva e à empresa da sessão
    expect(String(p.id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(decifrarCred(String(p.api_credentials_cifrado), KEY, { medidorId: String(p.id), companyId: ECOSUN }).auth_key).toBe('SEGREDO-2');
    expect(res.redirect).toHaveBeenCalledWith(`/dashboard/energia/${MID}`);
  });

  it('aparelho já cadastrado em QUALQUER empresa: recusa com mensagem que não diz de quem é', async () => {
    const db = dbFalso({ sistemas_clientes: [], medidores_energia: { error: { code: '23505', message: 'duplicate key value violates unique constraint "medidores_energia_device_global"' } } });
    const res = resFalso();
    await rotaCriarMedidor(db, deps())(req(tenant, { body: corpo }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(400);
    const h = html(res);
    expect(h).toContain('Este aparelho já está cadastrado. Fale com o suporte.');
    expect(h).not.toMatch(/EcoSun|medidores_energia_device_global|nesta empresa/);
  });

  it('edição que troca pra um aparelho já cadastrado: mesma mensagem', async () => {
    // Medidor que ainda não recebeu dado (trocar o aparelho é permitido).
    const db = dbFalso({ medidores_energia: [{ ...MEDIDOR, ultima_leitura_em: null }], sistemas_clientes: [] });
    // select devolve o medidor; o update bate no índice único global.
    const from = db.from as unknown as ReturnType<typeof vi.fn>;
    const original = from.getMockImplementation()!;
    from.mockImplementation((t: string) => {
      const q = original(t) as Record<string, unknown>;
      if (t === 'medidores_energia') {
        const upd = q.update as (p: unknown) => Record<string, unknown>;
        q.update = (p: unknown) => {
          upd(p);
          q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }).then(ok);
          return q;
        };
      }
      return q;
    });
    const res = resFalso();
    await rotaSalvarMedidor(db, deps())(req(junior, { params: { id: MID }, body: { ...corpo, device_id: 'aabbccddee11' } }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(html(res)).toContain('Este aparelho já está cadastrado. Fale com o suporte.');
  });

  it('trocar o aparelho de um medidor que JÁ recebeu dado: recusa e manda cadastrar um novo (nada gravado)', async () => {
    const db = dbFalso({ medidores_energia: [MEDIDOR], sistemas_clientes: [] });
    const res = resFalso();
    await rotaSalvarMedidor(db, deps())(req(junior, { params: { id: MID }, body: { ...corpo, device_id: 'aabbccddee11', ativo: 'on' } }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(html(res)).toContain('Para trocar o aparelho, cadastre um medidor novo');
    expect(db.chamadas.some((c) => c.op === 'update')).toBe(false);
  });

  it('mesmo aparelho escrito com o prefixo do modelo não conta como troca', async () => {
    const db = dbFalso({ medidores_energia: [MEDIDOR], sistemas_clientes: [], audit_log: [] });
    const res = resFalso();
    await rotaSalvarMedidor(db, deps())(req(junior, { params: { id: MID }, body: { ...corpo, device_id: 'shellypro3em-007007422D90', ativo: 'on' } }), res as unknown as Response);
    expect(res.redirect).toHaveBeenCalledWith(`/dashboard/energia/${MID}`);
  });

  it('edição: mostra só a máscara da chave guardada', async () => {
    const db = dbFalso({ medidores_energia: [MEDIDOR], sistemas_clientes: [] });
    const res = resFalso();
    await rotaEditarMedidor(db, deps())(req(junior, { params: { id: MID } }), res as unknown as Response);
    const h = html(res);
    expect(h).toContain('••••9z8y');
    expect(h).not.toContain('CHAVE-QUE-NAO-PODE-VAZAR');
  });

  it('edição com chave nova da nuvem: zera o problema da chave (a próxima coleta testa de novo)', async () => {
    const db = dbFalso({ medidores_energia: [{ ...MEDIDOR, modo_coleta: 'push_nuvem', nuvem_ok: false }], sistemas_clientes: [] });
    const res = resFalso();
    await rotaSalvarMedidor(db, deps())(req(junior, { params: { id: MID }, body: { apelido: 'Casa', device_id: '007007422d90', perfil: 'triphase', canal: '2', modo_coleta: 'push_nuvem', server_uri: 'shelly-77-eu.shelly.cloud', auth_key: 'NOVA-CHAVE', ativo: 'on' } }), res as unknown as Response);
    const up = db.chamadas.find((c) => c.op === 'update')!.payload as Record<string, unknown>;
    expect(up).toMatchObject({ nuvem_ok: null, nuvem_avisado_em: null, ultimo_erro: null });
    expect(up).not.toHaveProperty('status');
    expect(JSON.stringify(up)).not.toContain('NOVA-CHAVE');
  });

  it('edição de medidor de outra empresa → 404, nada gravado', async () => {
    const db = dbFalso({ medidores_energia: [MEDIDOR] });
    const res = resFalso();
    await rotaSalvarMedidor(db, deps())(req(tenant, { params: { id: MID }, body: corpo }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.chamadas.some((c) => c.op === 'update')).toBe(false);
  });

  it('novo token: troca o hash (escopado) e mostra o token uma vez', async () => {
    const db = dbFalso({ medidores_energia: [MEDIDOR] });
    const res = resFalso();
    await rotaNovoToken(db, deps())(req(junior, { params: { id: MID } }), res as unknown as Response);
    const up = db.chamadas.find((c) => c.op === 'update')!;
    expect(up.filtros).toContainEqual(['eq', 'company_id', ECOSUN]);
    const token = /var TOKEN = &quot;([A-Za-z0-9_-]+)&quot;;/.exec(html(res))?.[1];
    expect((up.payload as Record<string, unknown>).token_ingest_hash).toBe(hashToken(token!));
  });
});

describe('Testar conexão', () => {
  const TRI = { 'em:0': { c_voltage: 227, c_current: 5, c_act_power: 1392, c_aprt_power: 1500, c_pf: 0.9 }, 'emdata:0': { c_total_act_energy: 1, c_total_act_ret_energy: 0 } };
  const adapterCom = (r: Awaited<ReturnType<MedidorAdapter['buscarStatus']>>) => {
    const buscarStatus = vi.fn(async () => r);
    return { buscarStatus, a: { fabricante: 'shelly', buscarStatus, lerCanal: (st: Record<string, unknown>) => (st['em:0'] ? { tensao: 227, corrente: 5, potenciaW: 1392, potenciaVa: 1500, fatorPotencia: 0.9, energiaWh: 1, energiaDevolvidaWh: 0 } : null) } as unknown as MedidorAdapter };
  };
  const json = (res: ReturnType<typeof resFalso>) => res.json.mock.calls[0][0] as { ok: boolean; mensagem: string };

  it('servidor fora de *.shelly.cloud: recusa sem chamar ninguém', async () => {
    const { a, buscarStatus } = adapterCom({ ok: true, devices: [] });
    const res = resFalso();
    await rotaTestarConexao(dbFalso(), deps({ adapter: () => a }))(req(junior, { body: { device_id: '007007422d90', server_uri: 'http://169.254.169.254', auth_key: 'k' } }), res as unknown as Response);
    expect(json(res).ok).toBe(false);
    expect(buscarStatus).not.toHaveBeenCalled();
  });

  it('com a chave guardada (escopada pela empresa): conecta e não devolve a chave', async () => {
    const { a, buscarStatus } = adapterCom({ ok: true, devices: [{ id: '007007422d90', online: true, modelo: 'SPEM-003CEBEU120', status: TRI }] });
    const db = dbFalso({ medidores_energia: [MEDIDOR] });
    const res = resFalso();
    await rotaTestarConexao(db, deps({ adapter: () => a }))(req(junior, { body: { id: MID, device_id: '007007422d90', perfil: 'triphase', canal: '2' } }), res as unknown as Response);
    expect(json(res)).toMatchObject({ ok: true });
    expect(json(res).mensagem).toMatch(/Conectou/);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('CHAVE-QUE-NAO-PODE-VAZAR');
    expect((buscarStatus.mock.calls[0] as unknown[])[0]).toMatchObject({ auth_key: 'CHAVE-QUE-NAO-PODE-VAZAR-9z8y' });
  });

  it('tenant não usa a chave guardada de medidor da EcoSun', async () => {
    const { a, buscarStatus } = adapterCom({ ok: true, devices: [] });
    const res = resFalso();
    await rotaTestarConexao(dbFalso({ medidores_energia: [MEDIDOR] }), deps({ adapter: () => a }))(req(tenant, { body: { id: MID, device_id: '007007422d90' } }), res as unknown as Response);
    expect(json(res).ok).toBe(false);
    expect(buscarStatus).not.toHaveBeenCalled();
  });

  it('chave recusada: mensagem em português', async () => {
    const { a } = adapterCom({ ok: false, reason: 'nuvem Shelly recusou a chave (401)', invalidCredentials: true });
    const res = resFalso();
    await rotaTestarConexao(dbFalso(), deps({ adapter: () => a }))(req(junior, { body: { device_id: '007007422d90', server_uri: 'x.shelly.cloud', auth_key: 'k' } }), res as unknown as Response);
    expect(json(res).mensagem).toMatch(/recusou a chave/);
  });
});

describe('portão do módulo e a aba Medição antiga', () => {
  it('/energia fica atrás do módulo "medicao" (tenant sem ele vê a vitrine "energia")', async () => {
    const { moduloDoCaminho } = await import('../src/modules/dashboard/modulos-contratados.js');
    expect(moduloDoCaminho('/dashboard/energia')).toEqual({ modulo: 'medicao', chave: 'energia' });
    expect(moduloDoCaminho('/dashboard/energia/medidores/testar')).toEqual({ modulo: 'medicao', chave: 'energia' });
  });

  it('aba /medicao: o mesmo aparelho com e sem prefixo aparece UMA vez (linhas antigas continuam legíveis)', async () => {
    const { listarAparelhos, resumoDoAparelho } = await import('../src/modules/dashboard/medicao-queries.js');
    const db = dbFalso({ medicoes_shelly: [
      { company_id: TENANT, device_id: '007007422d90', apelido: 'Quadro', medido_em: '2026-09-28T12:00:00Z' },
      { company_id: TENANT, device_id: 'shellypro3em-007007422d90', apelido: 'Quadro', medido_em: '2026-09-27T12:00:00Z' },
    ] });
    const lista = await listarAparelhos(db, TENANT);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ deviceId: '007007422d90', leituras: 2 });
    db.chamadas.length = 0;
    await resumoDoAparelho(db, 'shellypro3em-007007422D90', TENANT, 24);
    const f = db.chamadas[0].filtros;
    expect(f).toContainEqual(['or', '', 'device_id.eq.007007422d90,device_id.ilike.shelly*-007007422d90']);
  });

  it('a aba /medicao agora lê só os aparelhos da empresa da sessão', async () => {
    const { listarAparelhos, resumoDoAparelho } = await import('../src/modules/dashboard/medicao-queries.js');
    const db = dbFalso({ medicoes_shelly: [] });
    await listarAparelhos(db, TENANT);
    await resumoDoAparelho(db, '007007422d90', TENANT, 24);
    for (const c of db.chamadas) expect(c.filtros, c.tabela).toContainEqual(['eq', 'company_id', TENANT]);
  });
});

describe('LGPD: desligar e apagar o medidor', () => {
  const corpoEdit = { apelido: 'Casa', device_id: '007007422d90', perfil: 'triphase', canal: '2', modo_coleta: 'push' };

  it('a edição mostra o "Medidor ligado" e a ação de apagar', async () => {
    const db = dbFalso({ medidores_energia: [MEDIDOR], sistemas_clientes: [] });
    const res = resFalso();
    await rotaEditarMedidor(db, deps())(req(junior, { params: { id: MID } }), res as unknown as Response);
    const h = html(res);
    expect(h).toMatch(/name="ativo"[^>]*checked/);
    expect(h).toContain('Apagar medidor e todos os dados');
    expect(h).toContain(`/dashboard/energia/medidores/${MID}/apagar`);
  });

  it('desmarcar "Medidor ligado" grava ativo=false (escopado) e registra quem desligou', async () => {
    const db = dbFalso({ medidores_energia: [MEDIDOR], sistemas_clientes: [], audit_log: [] });
    const res = resFalso();
    await rotaSalvarMedidor(db, deps())(req(junior, { params: { id: MID }, body: corpoEdit }), res as unknown as Response);
    const up = db.chamadas.find((c) => c.op === 'update' && c.tabela === 'medidores_energia')!;
    expect(up.payload).toMatchObject({ ativo: false });
    expect(up.filtros).toContainEqual(['eq', 'company_id', ECOSUN]);
    const aud = db.chamadas.find((c) => c.tabela === 'audit_log')!;
    expect(aud.payload).toMatchObject({ company_id: ECOSUN, user_id: junior.id, entidade: 'medidor_energia', entidade_id: MID, acao: 'desligou' });
  });

  it('religar volta a vigiar do zero (aguardando), sem mandar "parou" do tempo desligado', async () => {
    const db = dbFalso({ medidores_energia: [{ ...MEDIDOR, ativo: false }], sistemas_clientes: [], audit_log: [] });
    const res = resFalso();
    await rotaSalvarMedidor(db, deps())(req(junior, { params: { id: MID }, body: { ...corpoEdit, ativo: 'on' } }), res as unknown as Response);
    const up = db.chamadas.find((c) => c.op === 'update' && c.tabela === 'medidores_energia')!;
    expect(up.payload).toMatchObject({ ativo: true, status: 'aguardando' });
  });

  it('apagar exige digitar o nome do medidor; errado → nada apagado', async () => {
    const db = dbFalso({ medidores_energia: [MEDIDOR], sistemas_clientes: [] });
    const res = resFalso();
    await rotaApagarMedidor(db, deps())(req(junior, { params: { id: MID }, body: { confirmacao: 'outro nome' } }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.chamadas.some((c) => c.op === 'delete')).toBe(false);
    expect(html(res)).toMatch(/digite o nome do medidor/i);
  });

  it('apagar com o nome certo: apaga o medidor da empresa (cascata leva bruto, 15 min e dia), as leituras soltas do aparelho, e registra sem consumo', async () => {
    const db = dbFalso({ medidores_energia: [MEDIDOR], audit_log: [] });
    const res = resFalso();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await rotaApagarMedidor(db, deps())(req(junior, { params: { id: MID }, body: { confirmacao: `  ${MEDIDOR.apelido} ` } }), res as unknown as Response);
    const dels = db.chamadas.filter((c) => c.op === 'delete');
    const delMed = dels.find((c) => c.tabela === 'medidores_energia')!;
    expect(delMed.filtros).toContainEqual(['eq', 'company_id', ECOSUN]);
    expect(delMed.filtros).toContainEqual(['eq', 'id', MID]);
    const delSoltas = dels.find((c) => c.tabela === 'medicoes_shelly')!;
    expect(delSoltas.filtros).toContainEqual(['eq', 'company_id', ECOSUN]);
    expect(delSoltas.filtros).toContainEqual(['is', 'medidor_id', null]);
    const aud = db.chamadas.find((c) => c.tabela === 'audit_log')!;
    expect(aud.payload).toMatchObject({ company_id: ECOSUN, user_id: junior.id, entidade: 'medidor_energia', entidade_id: MID, acao: 'apagou_com_dados' });
    const linhaLog = log.mock.calls.map((c) => c.join(' ')).find((l) => l.includes('apagado'))!;
    expect(linhaLog).toContain(MID);
    expect(linhaLog).toContain(junior.id);
    expect(linhaLog).not.toMatch(/kWh|Wh\b/);
    expect(res.redirect).toHaveBeenCalledWith('/dashboard/energia');
  });

  it('apagar medidor de outra empresa → 404, nada apagado', async () => {
    const db = dbFalso({ medidores_energia: [MEDIDOR] });
    const res = resFalso();
    await rotaApagarMedidor(db, deps())(req(tenant, { params: { id: MID }, body: { confirmacao: MEDIDOR.apelido } }), res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.chamadas.some((c) => c.op === 'delete')).toBe(false);
  });
});
