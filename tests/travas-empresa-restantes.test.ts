import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Travas de empresa que sobraram das Ondas 3 e 4 (29/09/2026): campanha de e-mail,
// triagem do RH, /google, UC geradora do rateio e o "último acesso" do Prédio Vivo.

type CallLog = { table: string; method: string; args: any[] };
let fromResults: Record<string, { data: any; error: any }> = {};
let callLog: CallLog[] = [];

function makeBuilder(table: string, result: { data: any; error: any } | undefined) {
  const methods = ['select', 'eq', 'neq', 'is', 'not', 'in', 'or', 'order', 'limit', 'update', 'maybeSingle'];
  const resolved = result ?? { data: null, error: null };
  const builder: any = {};
  for (const m of methods) {
    builder[m] = vi.fn((...args: any[]) => { callLog.push({ table, method: m, args }); return builder; });
  }
  builder.then = (ok: any, err: any) => Promise.resolve(resolved).then(ok, err);
  return builder;
}
const fakeClient = () => ({ from: vi.fn((t: string) => makeBuilder(t, fromResults[t])) });

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => fakeClient()) }));

const EMPRESA_A = '11111111-1111-1111-1111-111111111111';
const EMPRESA_B = '22222222-2222-2222-2222-222222222222';
const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

describe('campanha de e-mail: só a base da empresa que dispara', () => {
  beforeEach(() => { fromResults = {}; callLog = []; vi.resetModules(); });

  it('filtra as leads pela empresa (eq company_id), nunca pela lista de empresas com o módulo', async () => {
    fromResults['empresa_modulos'] = { data: [{ company_id: EMPRESA_A }, { company_id: EMPRESA_B }], error: null };
    fromResults['leads'] = { data: [], error: null };
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const sb = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'k' });
    await sb.listarDestinatariosCampanha(EMPRESA_A, 100);
    const leads = callLog.filter((c) => c.table === 'leads');
    expect(leads).toContainEqual(expect.objectContaining({ method: 'eq', args: ['company_id', EMPRESA_A] }));
    expect(leads.some((c) => c.method === 'in' && c.args[0] === 'company_id')).toBe(false);
  });

  it('empresa sem o módulo de e-mail: nenhum destinatário (nem consulta as leads)', async () => {
    fromResults['empresa_modulos'] = { data: [{ company_id: EMPRESA_B }], error: null };
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const sb = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'k' });
    expect(await sb.listarDestinatariosCampanha(EMPRESA_A, 100)).toEqual([]);
    expect(callLog.some((c) => c.table === 'leads')).toBe(false);
  });

  it('o index prende os 3 pontos da campanha à EcoSun (marca e remetente são dela)', () => {
    const idx = src('src/index.ts');
    expect(idx).not.toMatch(/listarDestinatariosCampanha\((max|1000)\)/);
    expect(idx.match(/listarDestinatariosCampanha\(ECOSUN_COMPANY_ID, /g)?.length).toBe(3);
  });
});

describe('triagem do RH: só candidatos da empresa do aviso', () => {
  beforeEach(() => { fromResults = {}; callLog = []; vi.resetModules(); });

  it('tenant: a busca de pendentes filtra eq company_id', async () => {
    fromResults['rh_candidatos'] = { data: [], error: null };
    const { TriagemService } = await import('../src/modules/rh/triagem.js');
    const t = new TriagemService(fakeClient() as any, {} as any, EMPRESA_A, async () => {});
    await t.triarPendentes(5);
    expect(callLog).toContainEqual(expect.objectContaining({ table: 'rh_candidatos', method: 'eq', args: ['company_id', EMPRESA_A] }));
  });

  it('EcoSun: a busca inclui os candidatos sem empresa (legado = EcoSun), igual ao resto do RH', async () => {
    fromResults['rh_candidatos'] = { data: [], error: null };
    const { TriagemService } = await import('../src/modules/rh/triagem.js');
    const t = new TriagemService(fakeClient() as any, {} as any, '00000000-0000-0000-0000-000000000001', async () => {});
    await t.triarPendentes(5);
    expect(callLog).toContainEqual(expect.objectContaining({
      table: 'rh_candidatos', method: 'or', args: ['company_id.is.null,company_id.eq.00000000-0000-0000-0000-000000000001'],
    }));
  });

  it('o index cria a triagem presa à EcoSun (o aviso vai pro zap do dono da EcoSun)', () => {
    expect(src('src/index.ts')).toMatch(/new TriagemService\(\s*supabase\.getClient\(\),\s*new Anthropic\([^)]*\),\s*ECOSUN_COMPANY_ID,/);
  });
});

describe('/google no zap: só o Google Ads da empresa do canal', () => {
  it('as 2 consultas passam a empresa', () => {
    const idx = src('src/index.ts');
    expect(idx).toContain('fetchGoogleAdsSummary(client, dias, empresaDoAdmin())');
    expect(idx).toContain('fetchGoogleAdsSummary(client, 30, empresaDoAdmin())');
    expect(idx).not.toMatch(/fetchGoogleAdsSummary\(client, (dias|30)\)/);
  });
});

describe('ficha do cliente: UC geradora tem de ser cliente da mesma empresa', () => {
  it('o edit confere a geradora com clienteDaEmpresa antes de gravar', () => {
    const r = src('src/modules/dashboard/router.ts');
    const i = r.indexOf("router.post('/clientes/:id/edit'");
    const trecho = r.slice(i, r.indexOf('updateClienteFields', i));
    expect(trecho).toContain('fields.uc_geradora_lead_id != null');
    expect(trecho).toMatch(/clienteDaEmpresa\(dbClientes\(req\), geradora, empresaDaSessao\(req\)\)/);
  });
});

describe('Prédio Vivo: último acesso', () => {
  it('lê last_login_at (a coluna que existe); last_login derrubava a consulta e zerava os assentos', () => {
    const r = src('src/modules/dashboard/router.ts');
    expect(r).not.toMatch(/select\('last_login'\)/);
    expect(r).toContain(".select('last_login_at').eq('company_id', c.id).order('last_login_at', { ascending: false, nullsFirst: false })");
  });
});
