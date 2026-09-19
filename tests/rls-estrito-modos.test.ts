import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Fake minimo do supabase-js: so precisamos saber QUAL client voltou, entao
// cada createClient devolve um objeto marcado com a chave e o Authorization.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((_url: string, key: string, opts?: any) => ({
    __chave: key,
    __auth: opts?.global?.headers?.Authorization ?? null,
    from: vi.fn(),
  })),
}));

const CFG = {
  supabaseUrl: 'https://x.supabase.co',
  supabaseServiceKey: 'service-role-key',
  supabaseAnonKey: 'anon-key',
  supabaseJwtSecret: 'segredo-de-teste',
};

const CONQUISTA = '99fd46d7-60fc-49fe-918f-66587ffa3829';

function payload(token: string): Record<string, unknown> {
  const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(p, 'base64').toString());
}

describe('RLS estrito — os tres modos do getClient()', () => {
  beforeEach(() => { vi.resetModules(); delete process.env.RLS_ESTRITO; });
  afterEach(() => { delete process.env.RLS_ESTRITO; vi.restoreAllMocks(); });

  it('off (padrao): devolve a chave mestra, exatamente como sempre foi', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const c = new SupabaseService(CFG).getClient() as any;
    expect(c.__chave).toBe('service-role-key');
    expect(c.__auth).toBeNull();
  });

  it('aviso: nao muda o client, mas ANOTA quem consultou sem dono', async () => {
    process.env.RLS_ESTRITO = 'aviso';
    const { SupabaseService, relatorioConsultasSemDono, limparRelatorioConsultasSemDono } =
      await import('../src/modules/supabase.js');
    limparRelatorioConsultasSemDono();
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const sb = new SupabaseService(CFG);
    const c = sb.getClient() as any;

    // O comportamento pro usuario e IDENTICO — e isso que torna a fatia 2 segura.
    expect(c.__chave).toBe('service-role-key');
    expect(avisos).toHaveBeenCalled();

    const relatorio = relatorioConsultasSemDono();
    expect(relatorio.length).toBeGreaterThan(0);
    expect(relatorio[0].vezes).toBeGreaterThan(0);
  });

  it('aviso: o mesmo ponto nao inunda o log — avisa uma vez e conta o resto', async () => {
    process.env.RLS_ESTRITO = 'aviso';
    const { SupabaseService, relatorioConsultasSemDono, limparRelatorioConsultasSemDono } =
      await import('../src/modules/supabase.js');
    limparRelatorioConsultasSemDono();
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const sb = new SupabaseService(CFG);
    for (let i = 0; i < 10; i++) sb.getClient();

    expect(avisos).toHaveBeenCalledTimes(1);          // so a primeira vez
    expect(relatorioConsultasSemDono()[0].vezes).toBe(10); // mas contou todas
  });

  it('on + contexto de empresa: cracha com o company_id dela, nunca a chave mestra', async () => {
    process.env.RLS_ESTRITO = 'on';
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const { comEmpresaDe } = await import('../src/modules/empresa-config.js');
    const { limparCacheDeCrachas } = await import('../src/modules/tenant-db.js');
    limparCacheDeCrachas();

    const sb = new SupabaseService(CFG);
    const c = comEmpresaDe(CONQUISTA, () => sb.getClient()) as any;

    expect(c.__chave).toBe('anon-key');
    expect(c.__auth).toMatch(/^Bearer /);
    const p = payload(String(c.__auth).replace('Bearer ', ''));
    expect(p.company_id).toBe(CONQUISTA);
    // `authenticated` e o que faz o PostgREST APLICAR a RLS. service_role pula.
    expect(p.role).toBe('authenticated');
  });

  it('on SEM contexto: cracha de NINGUEM — a consulta volta vazia em vez de vazar', async () => {
    process.env.RLS_ESTRITO = 'on';
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const { limparCacheDeCrachas } = await import('../src/modules/tenant-db.js');
    limparCacheDeCrachas();

    const c = new SupabaseService(CFG).getClient() as any;
    const p = payload(String(c.__auth).replace('Bearer ', ''));
    expect(p.company_id).toBe('00000000-0000-0000-0000-000000000000');
    expect(c.__chave).not.toBe('service-role-key');
  });

  it('getClientGlobal: passa nas declaradas e RECLAMA nas que nao sao', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sb = new SupabaseService(CFG);

    sb.getClientGlobal('coletarTelemetria');
    expect(erros).not.toHaveBeenCalled();

    sb.getClientGlobal('runEmailSeq');   // toca dado de cliente — nao e global
    expect(erros).toHaveBeenCalled();
  });
});

describe('modo aviso — a origem tem que ser QUEM CHAMOU, nao o getClient', () => {
  beforeEach(() => { vi.resetModules(); delete process.env.RLS_ESTRITO; });
  afterEach(() => { delete process.env.RLS_ESTRITO; vi.restoreAllMocks(); });

  it('nao reporta o proprio mecanismo — nem compilado em .js', async () => {
    // [19/09/2026] No primeiro deploy do modo aviso o log saiu assim:
    //   [rls][aviso] consulta sem dono (1x) — SupabaseService.getClient (.../supabase.js:79:32)
    // Inutil: apontava pra si mesmo. O filtro so olhava por `supabase.ts`, e em
    // producao o arquivo e `supabase.js`. Sem isso a fatia 2 nao colhe nada.
    process.env.RLS_ESTRITO = 'aviso';
    const { SupabaseService, relatorioConsultasSemDono, limparRelatorioConsultasSemDono } =
      await import('../src/modules/supabase.js');
    limparRelatorioConsultasSemDono();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    new SupabaseService(CFG).getClient();

    const [primeiro] = relatorioConsultasSemDono();
    expect(primeiro).toBeDefined();
    expect(primeiro.origem).not.toMatch(/supabase\.(ts|js)/);
    expect(primeiro.origem).not.toMatch(/tenant-db\.(ts|js)/);
    expect(primeiro.origem).not.toBe('origem desconhecida');
    // Tem que ser o arquivo de teste, que e quem de fato chamou.
    expect(primeiro.origem).toMatch(/rls-estrito-modos/);
  });
});

describe('validarModoRls — nao subir fingindo que protege', () => {
  beforeEach(() => { vi.resetModules(); delete process.env.RLS_ESTRITO; });
  afterEach(() => { delete process.env.RLS_ESTRITO; });

  it('off e aviso sobem sem as chaves', async () => {
    const { validarModoRls } = await import('../src/modules/tenant-db.js');
    expect(() => validarModoRls({ supabaseUrl: 'u' })).not.toThrow();
    process.env.RLS_ESTRITO = 'aviso';
    expect(() => validarModoRls({ supabaseUrl: 'u' })).not.toThrow();
  });

  it('on sem as chaves BARRA o boot, dizendo onde pegar', async () => {
    process.env.RLS_ESTRITO = 'on';
    const { validarModoRls } = await import('../src/modules/tenant-db.js');
    expect(() => validarModoRls({ supabaseUrl: 'u' }))
      .toThrow(/SUPABASE_ANON_KEY e SUPABASE_JWT_SECRET/);
    expect(() => validarModoRls({ supabaseUrl: 'u', supabaseAnonKey: 'a' }))
      .toThrow(/SUPABASE_JWT_SECRET/);
  });

  it('on com as duas chaves sobe', async () => {
    process.env.RLS_ESTRITO = 'on';
    const { validarModoRls } = await import('../src/modules/tenant-db.js');
    expect(() => validarModoRls({ supabaseUrl: 'u', supabaseAnonKey: 'a', supabaseJwtSecret: 's' }))
      .not.toThrow();
  });
});

describe('empresaDe — a identidade do tenant nunca vira a da EcoSunPower', () => {
  beforeEach(() => vi.resetModules());

  it('tenant sem config carregada mantem o PROPRIO company_id', async () => {
    // Regressao encontrada em 19/09/2026 pelo teste do modo `on`: o miss de
    // cache devolvia os defaults INTEIROS, company_id da EcoSun incluso. Com o
    // RLS estrito isso mintaria um cracha da EcoSunPower para uma requisicao da
    // Conquista — vazamento criado pela peca que deveria impedir vazamento.
    const { empresaDe, _resetEstadoParaTeste } = await import('../src/modules/empresa-config.js');
    _resetEstadoParaTeste();

    const cfg = empresaDe(CONQUISTA);
    expect(cfg.companyId).toBe(CONQUISTA);
  });

  it('ehEcosun diz NAO para tenant sem config carregada', async () => {
    const { empresaDe, ehEcosun, _resetEstadoParaTeste } = await import('../src/modules/empresa-config.js');
    _resetEstadoParaTeste();
    expect(ehEcosun(empresaDe(CONQUISTA))).toBe(false);
  });

  it('sem companyId segue caindo na casa, como sempre foi', async () => {
    const { empresaDe, ehEcosun, _resetEstadoParaTeste } = await import('../src/modules/empresa-config.js');
    _resetEstadoParaTeste();
    expect(ehEcosun(empresaDe(null))).toBe(true);
    expect(ehEcosun(empresaDe(undefined))).toBe(true);
  });
});
