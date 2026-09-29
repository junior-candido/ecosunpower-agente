// tests/posvenda-medidor-por-empresa.test.ts
//
// VAZAMENTO LGPD (28/09/2026, achado na branch feat/custo-ia-por-empresa):
// as rotinas de PÓS-INSTALAÇÃO e de DETECÇÃO DE MEDIDOR rodam por relógio
// (setInterval), fora do contexto de qualquer empresa. Sem contexto, empresa()
// responde "EcoSunPower", as travas de saída veem "é a casa" e liberam. Um
// cliente de tenant (ex.: Conquista Solar) instalado:
//   - recebia o pedido de avaliação / convite de indicação pelo número da
//     CASA (Eva/WABA), falando em nome da EcoSunPower;
//   - tinha o nome enviado pro zap do Junior ("medidor trocado", "hora do
//     relatório", "pasta pronta").
//
// Regra: cada rotina processa só a empresa certa e envia pelo canal DA empresa
// do lead. Casa → Eva/WABA; tenant → instância própria dele, e só se a
// assistente estiver contratada e a empresa não estiver pausada. Aviso
// administrativo vai pro admin DA empresa do lead, nunca pro Junior.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { carregarEmpresaConfig, _resetEstadoParaTeste, empresa } from '../src/modules/empresa-config.js';
import { canalAtual } from '../src/modules/canal-contexto.js';
import {
  decidirCanalDaEmpresa,
  criarRotasAutomaticas,
  avisoAdminSoDaCasa,
  leadSoDaCasa,
  empresaDoLead,
  type DepsCanalAutomatico,
} from '../src/modules/canal-automatico.js';
import { runPosInstalacaoNotifCycle } from '../src/modules/relatorios/pos-instalacao/cron.js';
import { tickEnvioAutoPasta, empresaDaPasta, criarEnvioAutoDb, type PastaCandidata } from '../src/modules/relatorios/pasta/envio-auto.js';
import { criarAoMarcarMedidor, type LeadComUsina } from '../src/modules/monitoring/detectar-medidor.js';
import { PostInstallService } from '../src/modules/post-install.js';
import { MaintenanceService } from '../src/modules/maintenance.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const CONQUISTA = '99fd46d7-60fc-49fe-918f-66587ffa3829';
const SEM_ADMIN = 'cccc1111-2222-3333-4444-555566667777';
const JUNIOR = '5561996978781';
const EVA = '5561990000001'; // linha pública da casa (irrelevante aqui)
const CLARA = '5577999610038';
const JIMENA = '5577988887777';
const CLIENTE_BA = '5577991968581';
const CLIENTE_DF = '5561999990000';

async function semearEmpresas() {
  const rows = [
    { company_id: CASA, nome_fantasia: 'EcoSunPower', nome_atendente: 'Eva', telefone_atendente: EVA },
    {
      company_id: CONQUISTA, nome_fantasia: 'Conquista Solar', nome_atendente: 'Clara',
      telefone_atendente: CLARA, telefone_admin: JIMENA, rt_nome: 'Jimena Souza', rt_apelido: 'Jimena',
      google_review_url: 'https://g.page/r/conquista/review',
    },
    { company_id: SEM_ADMIN, nome_fantasia: 'Sem Admin', nome_atendente: 'Ana', telefone_atendente: '5577999610000', telefone_admin: null },
  ];
  const client = { from: () => ({ select: () => Promise.resolve({ data: rows, error: null }) }) };
  await carregarEmpresaConfig(client as never);
}

/** Tenant liberado: instância própria + assistente contratada. */
function depsLiberado(o: Partial<DepsCanalAutomatico> = {}): DepsCanalAutomatico {
  return {
    instanciaDaEmpresa: vi.fn(async (cid: string) => (cid === CASA ? undefined : `inst-${cid.slice(0, 4)}`)),
    modulosAtivos: vi.fn(async () => new Set(['eva', 'pasta_digital', 'monitoramento', 'medicao'])),
    empresaPausada: vi.fn(async () => false),
    ...o,
  };
}

/** Grava pra quem foi, por qual canal e em nome de qual empresa. */
function gravador() {
  const envios: Array<{ to: string; texto: string; empresa: string; instancia: string | undefined }> = [];
  const sendText = vi.fn(async (to: string, texto: string) => {
    envios.push({ to, texto, empresa: empresa().companyId, instancia: canalAtual()?.evolutionInstance });
  });
  return { envios, sendText };
}

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  _resetEstadoParaTeste();
  await semearEmpresas();
});
afterEach(() => {
  _resetEstadoParaTeste();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. A decisão do canal
// ---------------------------------------------------------------------------
describe('decidirCanalDaEmpresa — por onde uma rotina automática pode falar', () => {
  it('lead sem empresa (legado) é da casa', () => {
    expect(empresaDoLead(null)).toBe(CASA);
    expect(empresaDoLead(undefined)).toBe(CASA);
    expect(empresaDoLead('')).toBe(CASA);
    expect(empresaDoLead(CONQUISTA)).toBe(CONQUISTA);
  });

  it('casa: canal padrão (Eva/WABA), sem ler nada', async () => {
    const deps = depsLiberado();
    const d = await decidirCanalDaEmpresa(CASA, deps);
    expect(d).toEqual({ ok: true, companyId: CASA, instancia: null });
    expect(deps.modulosAtivos).not.toHaveBeenCalled();
  });

  it('tenant liberado: instância própria', async () => {
    const d = await decidirCanalDaEmpresa(CONQUISTA, depsLiberado());
    expect(d).toEqual({ ok: true, companyId: CONQUISTA, instancia: 'inst-99fd' });
  });

  it('tenant sem instância própria: NUNCA cai no número da casa', async () => {
    const d = await decidirCanalDaEmpresa(CONQUISTA, depsLiberado({ instanciaDaEmpresa: async () => undefined }));
    expect(d).toEqual({ ok: false, companyId: CONQUISTA, motivo: 'sem_canal_proprio' });
  });

  it('tenant sem a assistente contratada: não fala', async () => {
    const d = await decidirCanalDaEmpresa(CONQUISTA, depsLiberado({ modulosAtivos: async () => new Set(['financeiro']) }));
    expect(d).toMatchObject({ ok: false, motivo: 'assistente_desligada' });
  });

  it('tenant pausado (cobrança): não fala', async () => {
    const d = await decidirCanalDaEmpresa(CONQUISTA, depsLiberado({ empresaPausada: async () => true }));
    expect(d).toMatchObject({ ok: false, motivo: 'empresa_pausada' });
  });

  it('erro ao decidir: falha FECHADO', async () => {
    const d = await decidirCanalDaEmpresa(CONQUISTA, depsLiberado({ instanciaDaEmpresa: async () => { throw new Error('rede'); } }));
    expect(d).toMatchObject({ ok: false, motivo: 'erro_ao_decidir' });
  });

  it('módulo pedido pela rotina é conferido (ex.: medicao)', async () => {
    const deps = depsLiberado({ modulosAtivos: async () => new Set(['eva']) });
    expect(await decidirCanalDaEmpresa(CONQUISTA, deps, 'medicao')).toMatchObject({ ok: false, motivo: 'assistente_desligada' });
  });
});

describe('rotas automáticas — aviso admin e mensagem ao lead', () => {
  it('aviso de lead da casa vai pro Junior, no canal padrão', async () => {
    const { envios, sendText } = gravador();
    const rotas = criarRotasAutomaticas(depsLiberado(), JUNIOR);
    const r = await rotas.avisoAdmin(CASA, (to) => sendText(to, 'x'));
    expect(r).toBe('enviado');
    expect(envios).toEqual([{ to: JUNIOR, texto: 'x', empresa: CASA, instancia: undefined }]);
  });

  it('aviso de lead de tenant vai pro admin DELE, pela instância DELE — nunca pro Junior', async () => {
    const { envios, sendText } = gravador();
    const rotas = criarRotasAutomaticas(depsLiberado(), JUNIOR);
    const r = await rotas.avisoAdmin(CONQUISTA, (to) => sendText(to, 'x'));
    expect(r).toBe('enviado');
    expect(envios).toEqual([{ to: JIMENA, texto: 'x', empresa: CONQUISTA, instancia: 'inst-99fd' }]);
  });

  it('tenant sem telefone_admin: ninguém recebe (lead fica no painel)', async () => {
    const { envios, sendText } = gravador();
    const rotas = criarRotasAutomaticas(depsLiberado(), JUNIOR);
    expect(await rotas.avisoAdmin(SEM_ADMIN, (to) => sendText(to, 'x'))).toBe('sem_admin');
    expect(envios).toEqual([]);
  });

  it('mensagem ao lead de tenant sai pela instância dele, em nome dele', async () => {
    const { envios, sendText } = gravador();
    const rotas = criarRotasAutomaticas(depsLiberado(), JUNIOR);
    expect(await rotas.lead(CONQUISTA, () => sendText(CLIENTE_BA, 'oi'))).toBe('enviado');
    expect(envios).toEqual([{ to: CLIENTE_BA, texto: 'oi', empresa: CONQUISTA, instancia: 'inst-99fd' }]);
  });

  it('padrões "só da casa" (quando ninguém liga as rotas) barram tenant', async () => {
    const { envios, sendText } = gravador();
    expect(await avisoAdminSoDaCasa(JUNIOR)(CONQUISTA, (to) => sendText(to, 'x'))).toBe('sem_canal_proprio');
    expect(await leadSoDaCasa(CONQUISTA, () => sendText(CLIENTE_BA, 'x'))).toBe('sem_canal_proprio');
    expect(envios).toEqual([]);
    expect(await avisoAdminSoDaCasa(JUNIOR)(null, (to) => sendText(to, 'x'))).toBe('enviado');
    expect(envios[0].to).toBe(JUNIOR);
  });
});

// ---------------------------------------------------------------------------
// 2. Cron "hora do relatório pós-instalação" (A5)
// ---------------------------------------------------------------------------
const HORA_JANELA = new Date('2026-09-25T13:00:00Z'); // sex 10h BRT

describe('runPosInstalacaoNotifCycle — por empresa', () => {
  function ctx(leads: unknown[], rotas = criarRotasAutomaticas(depsLiberado(), JUNIOR)) {
    const g = gravador();
    return {
      g,
      c: {
        supabase: { getLeadsMedidorTrocadoSemRelatorio: vi.fn().mockResolvedValue(leads) },
        sendText: g.sendText,
        adminPhone: JUNIOR,
        dashboardBaseUrl: 'https://dashboard.ecosunpower.eng.br',
        avisarAdmin: rotas.avisoAdmin,
      },
    };
  }

  it('lead de tenant NÃO gera aviso pro Junior (nem pro admin dele: a tela do relatório ainda é só da casa)', async () => {
    const { g, c } = ctx([
      { id: 'l-ba', name: 'Mari De Sá', phone: CLIENTE_BA, company_id: CONQUISTA },
      { id: 'l-df', name: 'Tatiane', phone: CLIENTE_DF, company_id: CASA },
    ]);
    const r = await runPosInstalacaoNotifCycle(HORA_JANELA, c as never);
    expect(r.notificados).toBe(1);
    expect(g.envios.map((e) => e.to)).toEqual([JUNIOR]);
    expect(g.envios[0].texto).toContain('Tatiane');
    expect(g.envios.map((e) => e.texto).join()).not.toContain('Mari');
  });

  it('sem rotas ligadas (padrão), tenant é barrado — casa segue igual', async () => {
    const g = gravador();
    const r = await runPosInstalacaoNotifCycle(HORA_JANELA, {
      supabase: { getLeadsMedidorTrocadoSemRelatorio: vi.fn().mockResolvedValue([
        { id: 'l-ba', name: 'Mari', company_id: CONQUISTA },
        { id: 'l-df', name: 'Tatiane', company_id: null },
      ]) },
      sendText: g.sendText, adminPhone: JUNIOR, dashboardBaseUrl: 'https://x',
    } as never);
    expect(r.notificados).toBe(1);
    expect(g.envios.map((e) => e.to)).toEqual([JUNIOR]);
    expect(g.envios[0].texto).toContain('Tatiane');
  });
});

// ---------------------------------------------------------------------------
// 3. Pasta pós-obra — aviso "pasta pronta + medidor trocado" (#276)
// ---------------------------------------------------------------------------
describe('tickEnvioAutoPasta — por empresa', () => {
  const AGORA = new Date('2026-09-25T14:00:00Z');
  const cand = (o: Partial<PastaCandidata>): PastaCandidata => ({
    id: 'p1', lead_id: 'l1', slug: 's', aviso_envio_em: null, aviso_segurado_ate: null, avisos_enviados: 0,
    lead: { name: 'Fulano', phone: CLIENTE_DF, meter_swapped_at: '2026-09-24T13:00:00Z' }, company_id: CASA, ...o,
  });

  function montar(cands: PastaCandidata[], deps = depsLiberado()) {
    const envios: Array<{ to: string; body: string; botoes: number; empresa: string; instancia?: string }> = [];
    const db = { listarCandidatas: vi.fn().mockResolvedValue(cands), marcarAvisado: vi.fn(), segurar: vi.fn() };
    const enviarComBotoes = vi.fn(async (to: string, body: string, buttons: unknown[]) => {
      envios.push({ to, body, botoes: buttons.length, empresa: empresa().companyId, instancia: canalAtual()?.evolutionInstance });
    });
    return { envios, db, ctx: { db, adminPhone: JUNIOR, enviarComBotoes, agora: () => AGORA, avisarAdmin: criarRotasAutomaticas(deps, JUNIOR).avisoAdmin } };
  }

  it('pasta de tenant: aviso pro admin do tenant, sem botões da casa, nada pro Junior', async () => {
    const m = montar([
      cand({ id: 'p-ba', lead: { name: 'Mari De Sá', phone: CLIENTE_BA, meter_swapped_at: null }, company_id: CONQUISTA }),
      cand({ id: 'p-df' }),
    ]);
    const r = await tickEnvioAutoPasta(m.ctx);
    expect(r.avisados).toBe(2);
    const junior = m.envios.filter((e) => e.to === JUNIOR);
    expect(junior).toHaveLength(1);
    expect(junior[0].body).not.toContain('Mari');
    expect(junior[0].botoes).toBe(3); // casa segue igual
    const jimena = m.envios.find((e) => e.to === JIMENA)!;
    expect(jimena).toMatchObject({ empresa: CONQUISTA, instancia: 'inst-99fd', botoes: 0 });
    expect(jimena.body).toContain('/dashboard/pastas/p-ba');
    expect(m.db.marcarAvisado).toHaveBeenCalledTimes(2);
  });

  it('tenant sem canal: não avisa ninguém e NÃO marca (avisa quando ligar)', async () => {
    const m = montar([cand({ id: 'p-ba', company_id: CONQUISTA })], depsLiberado({ instanciaDaEmpresa: async () => undefined }));
    const r = await tickEnvioAutoPasta(m.ctx);
    expect(r.avisados).toBe(0);
    expect(m.envios).toEqual([]);
    expect(m.db.marcarAvisado).not.toHaveBeenCalled();
  });
});

describe('empresaDaPasta / listarCandidatas — dona da pasta', () => {
  it('pasta OU lead de tenant = tenant (o mais restritivo); os dois da casa = casa', () => {
    expect(empresaDaPasta(CASA, CONQUISTA)).toBe(CONQUISTA);
    expect(empresaDaPasta(CONQUISTA, CASA)).toBe(CONQUISTA);
    expect(empresaDaPasta(CONQUISTA, null)).toBe(CONQUISTA);
    expect(empresaDaPasta(null, null)).toBeNull();
    expect(empresaDaPasta(CASA, CASA)).toBe(CASA);
  });

  it('listarCandidatas lê a empresa do lead e da pasta', async () => {
    const linhas = [
      { id: 'p1', lead_id: 'l1', slug: 's', company_id: CASA, avisos_enviados: 0, leads: { name: 'Mari', phone: CLIENTE_BA, meter_swapped_at: null, company_id: CONQUISTA } },
    ];
    let colunas = '';
    const cadeia: Record<string, unknown> = {};
    for (const m of ['eq', 'is']) cadeia[m] = () => cadeia;
    cadeia.limit = () => Promise.resolve({ data: linhas, error: null });
    const client = { from: () => ({ select: (c: string) => { colunas = c; return cadeia; } }) };
    const [p] = await criarEnvioAutoDb(client).listarCandidatas();
    expect(colunas).toContain('company_id');
    expect(p.company_id).toBe(CONQUISTA);
  });
});

// ---------------------------------------------------------------------------
// 4. Detecção automática do medidor
// ---------------------------------------------------------------------------
describe('criarAoMarcarMedidor — aviso "medidor trocado" por empresa', () => {
  const lead = (companyId: string | null): LeadComUsina => ({ leadId: 'l1', nome: 'Mari De Sá', sistemaId: 's1', apelido: null, companyId });

  it('lead de tenant: agenda os toques, avisa o admin DELE e nada pro Junior', async () => {
    const g = gravador();
    const agendarToques = vi.fn().mockResolvedValue(undefined);
    const aoMarcar = criarAoMarcarMedidor({ agendarToques, avisarAdmin: criarRotasAutomaticas(depsLiberado(), JUNIOR).avisoAdmin, sendText: g.sendText });
    await aoMarcar(lead(CONQUISTA), [10, 12, 11]);
    expect(agendarToques).toHaveBeenCalledWith('l1');
    expect(g.envios.map((e) => e.to)).toEqual([JIMENA]);
    expect(g.envios[0]).toMatchObject({ empresa: CONQUISTA, instancia: 'inst-99fd' });
  });

  it('lead da casa: Junior recebe como sempre', async () => {
    const g = gravador();
    const aoMarcar = criarAoMarcarMedidor({ agendarToques: vi.fn(), avisarAdmin: criarRotasAutomaticas(depsLiberado(), JUNIOR).avisoAdmin, sendText: g.sendText });
    await aoMarcar(lead(null), [10, 12, 11]);
    expect(g.envios.map((e) => e.to)).toEqual([JUNIOR]);
  });

  it('falha no agendamento não impede o aviso', async () => {
    const g = gravador();
    const aoMarcar = criarAoMarcarMedidor({ agendarToques: vi.fn().mockRejectedValue(new Error('db')), avisarAdmin: avisoAdminSoDaCasa(JUNIOR), sendText: g.sendText });
    await aoMarcar(lead(CASA), [10, 12, 11]);
    expect(g.envios.map((e) => e.to)).toEqual([JUNIOR]);
  });
});

// ---------------------------------------------------------------------------
// 5. Toques pós-instalação ao CLIENTE (avaliação Google / indicação)
// ---------------------------------------------------------------------------
type Touch = { id: string; touch_type: string; leads: Record<string, unknown> | null };

function fakeSupabaseTouches(touches: Touch[]) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const client = {
    from: (tabela: string) => {
      expect(tabela).toBe('post_install_touches');
      return {
        select: () => ({ eq: () => ({ lte: () => ({ limit: () => Promise.resolve({ data: touches, error: null }) }) }) }),
        update: (patch: Record<string, unknown>) => ({ eq: (_c: string, id: string) => { updates.push({ id, patch }); return Promise.resolve({ error: null }); } }),
      };
    },
  };
  return { client, updates };
}

function fakeAnthropic() {
  const prompts: string[] = [];
  return {
    prompts,
    client: {
      messages: {
        create: vi.fn(async (req: { messages: Array<{ content: string }> }) => {
          prompts.push(req.messages[0].content);
          return { content: [{ type: 'text', text: 'mensagem gerada' }], usage: { input_tokens: 1, output_tokens: 1 } };
        }),
      },
    },
  };
}

describe('PostInstallService.processDueTouches — por empresa', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout'] }); });
  afterEach(() => { vi.useRealTimers(); });

  async function rodar(svc: PostInstallService): Promise<number> {
    const p = svc.processDueTouches();
    await vi.runAllTimersAsync();
    return p;
  }

  const leadBA = { id: 'l-ba', phone: CLIENTE_BA, name: 'Mari De Sá', city: 'Vitória da Conquista', energy_data: null, opt_out: false, company_id: CONQUISTA };
  const leadDF = { id: 'l-df', phone: CLIENTE_DF, name: 'Tatiane', city: 'Brasília', energy_data: null, opt_out: false, company_id: CASA };

  it('sem rotas (padrão): cliente de tenant NÃO recebe pelo número da casa — toque cancelado', async () => {
    const { client, updates } = fakeSupabaseTouches([{ id: 't1', touch_type: 'review_request', leads: leadBA }]);
    const g = gravador();
    const ai = fakeAnthropic();
    const svc = new PostInstallService(client as never, ai.client as never, g.sendText, 'https://g.page/r/ecosun/review');
    expect(await rodar(svc)).toBe(0);
    expect(g.envios).toEqual([]);
    expect(ai.prompts).toEqual([]); // nem gasta IA
    expect(updates).toEqual([{ id: 't1', patch: { status: 'canceled' } }]);
  });

  it('com rotas: cliente de tenant recebe pela instância DELE, em nome dele, com o link de avaliação DELE', async () => {
    const { client, updates } = fakeSupabaseTouches([{ id: 't1', touch_type: 'review_request', leads: leadBA }]);
    const g = gravador();
    const ai = fakeAnthropic();
    const rotas = criarRotasAutomaticas(depsLiberado(), JUNIOR);
    const svc = new PostInstallService(client as never, ai.client as never, g.sendText, 'https://g.page/r/ecosun/review', rotas.lead);
    expect(await rodar(svc)).toBe(1);
    expect(g.envios).toEqual([{ to: CLIENTE_BA, texto: 'mensagem gerada', empresa: CONQUISTA, instancia: 'inst-99fd' }]);
    expect(ai.prompts[0]).toContain('Conquista Solar');
    expect(ai.prompts[0]).toContain('https://g.page/r/conquista/review');
    expect(ai.prompts[0]).not.toContain('EcoSunPower');
    expect(ai.prompts[0]).not.toContain('ecosun/review');
    expect(updates[0].patch).toMatchObject({ status: 'sent' });
  });

  it('tenant sem link de avaliação: pedido de avaliação cancelado (não usa o link da casa)', async () => {
    const semLink = { ...leadBA, company_id: SEM_ADMIN };
    const { client, updates } = fakeSupabaseTouches([{ id: 't1', touch_type: 'review_nudge', leads: semLink }]);
    const g = gravador();
    const svc = new PostInstallService(client as never, fakeAnthropic().client as never, g.sendText, 'https://g.page/r/ecosun/review', criarRotasAutomaticas(depsLiberado(), JUNIOR).lead);
    expect(await rodar(svc)).toBe(0);
    expect(g.envios).toEqual([]);
    expect(updates).toEqual([{ id: 't1', patch: { status: 'canceled' } }]);
  });

  it('convite de indicação (programa R$ 300 da casa) não vai pra cliente de tenant', async () => {
    const { client, updates } = fakeSupabaseTouches([{ id: 't1', touch_type: 'indication_invite', leads: leadBA }]);
    const g = gravador();
    const svc = new PostInstallService(client as never, fakeAnthropic().client as never, g.sendText, 'https://g.page/r/ecosun/review', criarRotasAutomaticas(depsLiberado(), JUNIOR).lead);
    expect(await rodar(svc)).toBe(0);
    expect(g.envios).toEqual([]);
    expect(updates).toEqual([{ id: 't1', patch: { status: 'canceled' } }]);
  });

  it('erro ao decidir o canal: toque fica pendente (tenta de novo), nada sai', async () => {
    const { client, updates } = fakeSupabaseTouches([{ id: 't1', touch_type: 'review_request', leads: leadBA }]);
    const g = gravador();
    const deps = depsLiberado({ modulosAtivos: async () => { throw new Error('rede'); } });
    const svc = new PostInstallService(client as never, fakeAnthropic().client as never, g.sendText, 'https://g.page/r/ecosun/review', criarRotasAutomaticas(deps, JUNIOR).lead);
    expect(await rodar(svc)).toBe(0);
    expect(g.envios).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('casa segue igual: Eva manda pelo canal padrão com o link da casa', async () => {
    const { client, updates } = fakeSupabaseTouches([{ id: 't1', touch_type: 'review_request', leads: leadDF }]);
    const g = gravador();
    const ai = fakeAnthropic();
    const svc = new PostInstallService(client as never, ai.client as never, g.sendText, 'https://g.page/r/ecosun/review', criarRotasAutomaticas(depsLiberado(), JUNIOR).lead);
    expect(await rodar(svc)).toBe(1);
    expect(g.envios).toEqual([{ to: CLIENTE_DF, texto: 'mensagem gerada', empresa: CASA, instancia: undefined }]);
    expect(ai.prompts[0]).toContain('https://g.page/r/ecosun/review');
    expect(updates[0].patch).toMatchObject({ status: 'sent' });
  });
});

describe('PostInstallService.scheduleOnMeterSwap — evento do Elo com a empresa do lead', () => {
  it('cliente de tenant: evento carimbado com a empresa DELE (não cai na linha do tempo da casa)', async () => {
    const eventos: Array<Record<string, unknown>> = [];
    const client = {
      from: (tabela: string) => {
        if (tabela === 'leads') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { installation_status: 'instalado', company_id: CONQUISTA } }) }) }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          };
        }
        if (tabela === 'post_install_touches') {
          return {
            update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
            insert: () => Promise.resolve({ error: null }),
          };
        }
        if (tabela === 'eventos_elo') return { insert: (row: Record<string, unknown>) => { eventos.push(row); return Promise.resolve({ error: null }); } };
        throw new Error(`tabela inesperada ${tabela}`);
      },
    };
    const svc = new PostInstallService(client as never, fakeAnthropic().client as never, vi.fn(), 'x');
    await svc.scheduleOnMeterSwap('l-ba');
    expect(eventos).toHaveLength(1);
    expect(eventos[0].company_id).toBe(CONQUISTA);
  });
});

// ---------------------------------------------------------------------------
// 6. Lembretes de manutenção / aniversário da usina (pós-venda)
// ---------------------------------------------------------------------------
describe('MaintenanceService.processMaintenanceReminders — por empresa', () => {
  function fakeSupa(reminders: unknown[]) {
    const falhas: Array<{ id: string; msg: string }> = [];
    const enviados: string[] = [];
    const svc = {
      getDueMaintenanceReminders: vi.fn().mockResolvedValue(reminders),
      markMaintenanceReminderSent: vi.fn(async (id: string) => { enviados.push(id); }),
      markMaintenanceReminderFailed: vi.fn(async (id: string, msg: string) => { falhas.push({ id, msg }); }),
      getClient: () => ({ from: () => ({ upsert: () => Promise.resolve({ error: null }) }) }),
    };
    return { svc, falhas, enviados };
  }
  const rem = (id: string, phone: string, company_id: string | null) =>
    ({ id, lead_id: `lead-${id}`, topic: 'aniversario_1a', scheduled_date: '2026-09-25', phone, name: 'Fulano', company_id });

  it('sem rotas (padrão): lembrete de cliente de tenant não sai pelo número da casa', async () => {
    const f = fakeSupa([rem('r-ba', CLIENTE_BA, CONQUISTA), rem('r-df', CLIENTE_DF, CASA)]);
    const g = gravador();
    const m = new MaintenanceService(f.svc as never, fakeAnthropic().client as never, g.sendText);
    expect(await m.processMaintenanceReminders()).toBe(1);
    expect(g.envios.every((e) => e.to === CLIENTE_DF)).toBe(true);
    expect(f.falhas.map((x) => x.id)).toEqual(['r-ba']);
    expect(f.enviados).toEqual(['r-df']);
  });

  it('com rotas: cliente de tenant recebe pela instância dele, em nome dele', async () => {
    const f = fakeSupa([rem('r-ba', CLIENTE_BA, CONQUISTA)]);
    const g = gravador();
    const ai = fakeAnthropic();
    const m = new MaintenanceService(f.svc as never, ai.client as never, g.sendText, criarRotasAutomaticas(depsLiberado(), JUNIOR).lead);
    expect(await m.processMaintenanceReminders()).toBe(1);
    expect(g.envios.length).toBeGreaterThan(0);
    expect(g.envios.every((e) => e.empresa === CONQUISTA && e.instancia === 'inst-99fd' && e.to === CLIENTE_BA)).toBe(true);
    expect(ai.prompts[0]).toContain('Clara');
    expect(ai.prompts[0]).toContain('Conquista Solar');
  });
});
