// Atendimento Parte 2b — rotas e tela do número PESSOAL do dono (QR/Evolution).
// Dublês: nada é enviado, nenhuma instância é criada de verdade.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { criarRotasAtendimento } from '../src/modules/dashboard/atendimento-rotas.js';
import { criarRotasNumeroPessoal } from '../src/modules/dashboard/numero-pessoal-rotas.js';
import { LimiteDeEnvio } from '../src/modules/dashboard/atendimento-envio.js';
import { renderAtendimentoPage } from '../src/modules/dashboard/atendimento-views.js';
import { montarLista, resumosPessoais } from '../src/modules/dashboard/conversas-queries.js';
import { bancoMemoria } from './helpers/supabase-memoria.js';
import { USER_CASA, USER_TENANT, LISTA_CONVERSAS } from './fixtures/miolo-leads.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const LEAD = '11111111-1111-1111-1111-111111111111';
const CHAVE = '8f3c2c55-1d2e-4c3b-9a55-0e2d7c1b9f00';
const agora = Date.parse('2026-09-28T17:00:00Z');
const hAtras = (h: number) => new Date(agora - h * 3600_000).toISOString();
const junior = { id: 'u-junior', companyId: CASA, nome: 'Junior Silva', isAdmin: true, permissoes: {} };
const bia = { id: 'u-bia', companyId: CASA, nome: 'Bia', isAdmin: true, permissoes: {} };
const NP = { id: 'np1', company_id: CASA, dono_user_id: 'u-junior', dono_nome: 'Junior', instancia: 'junior-business', numero: null, ativo: true };

function cenario(extra: Record<string, any[]> = {}) {
  const b = bancoMemoria({
    leads: [{ id: LEAD, company_id: CASA, name: 'Ana Exemplo', phone: '5561999990001', eva_active: true, opt_out: false, created_at: '1' }],
    conversations: [{ id: 'cv', company_id: CASA, lead_id: LEAD, created_at: '1', messages: [{ role: 'user', content: 'oi Eva', timestamp: hAtras(5) }] }],
    mensagens_whatsapp: [], eva_cadence: [], lead_atividades: [], audit_log: [],
    whatsapp_numeros_pessoais: [NP],
    ...extra,
  }, { mensagens_whatsapp: [['company_id', 'chave_envio'], ['company_id', 'wamid']] });
  const enviarPessoal = vi.fn(async () => ({ messageId: 'EVO1' }));
  const waba = { sendText: vi.fn(async () => ({ messageId: 'W' })), sendTemplate: vi.fn() };
  const copiarParaMemoria = vi.fn(async () => {});
  const rotas = criarRotasAtendimento({
    supabase: b.client, banco: () => b.client, waba: waba as any, instanciaDaEmpresa: async () => null,
    engineerPhone: '5561998805002', enviarPessoal, copiarParaMemoria, limite: new LimiteDeEnvio(100, 0), agora: () => agora,
  });
  return { b, rotas, enviarPessoal, waba, copiarParaMemoria };
}
const req = (o: Record<string, unknown>) => ({ params: {}, body: {}, query: {}, headers: {}, dashUser: junior, ...o }) as any;
function res() {
  const r: any = { statusCode: 200, destino: '' };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.send = (x: string) => { r.corpo = x; return r; };
  r.json = (x: unknown) => { r.corpo = x; return r; };
  r.type = () => r;
  r.setHeader = () => r;
  r.redirect = (a: number | string, b?: string) => { r.destino = typeof a === 'string' ? a : b; return r; };
  return r;
}
const q = (r: any, k: string) => new URL(`http://x${r.destino}`).searchParams.get(k);

describe('responder um LEAD pelo número pessoal', () => {
  it('a linha do tempo da EMPRESA não leva o texto do que saiu pelo pessoal', async () => {
    const c = cenario();
    await c.rotas.responder(req({ params: { id: LEAD }, body: { chave: CHAVE, texto: 'segredo pessoal', canal: 'whatsapp_business' } }), res());
    expect(c.b.tabelas.lead_atividades[0]).toMatchObject({ titulo: 'Mensagem enviada pelo WhatsApp pessoal' });
    expect(JSON.stringify(c.b.tabelas.lead_atividades)).not.toContain('segredo pessoal');
  });

  it('canal=whatsapp_business: sai pela instância do dono, só o dono vê, NÃO entra na memória da Eva, e assume', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.responder(req({ params: { id: LEAD }, body: { chave: CHAVE, texto: 'Oi Ana, é o Junior', canal: 'whatsapp_business' } }), r);
    expect(q(r, 'resp')).toBe('enviada');
    expect(q(r, 'canal')).toBe('whatsapp_business');
    expect(c.enviarPessoal).toHaveBeenCalledWith('junior-business', '5561999990001', 'Oi Ana, é o Junior');
    expect(c.waba.sendText).not.toHaveBeenCalled();
    expect(c.copiarParaMemoria).not.toHaveBeenCalled();
    expect(c.b.tabelas.mensagens_whatsapp.find((m) => m.direcao === 'saida')).toMatchObject({ canal: 'whatsapp_business', numero: 'junior-business', visivel_so_para: 'u-junior', wamid: 'EVO1', status: 'enviada' });
    expect(c.b.tabelas.leads[0].eva_active).toBe(false);
  });
  it('quem NÃO é o dono (ou sem número conectado) não manda pelo pessoal', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.responder(req({ dashUser: bia, params: { id: LEAD }, body: { chave: CHAVE, texto: 'Oi', canal: 'whatsapp_business' } }), r);
    expect(q(r, 'resp')).toBe('sem_canal');
    expect(c.enviarPessoal).not.toHaveBeenCalled();
    const d = cenario({ whatsapp_numeros_pessoais: [{ ...NP, ativo: false }] });
    const r2 = res();
    await d.rotas.responder(req({ params: { id: LEAD }, body: { chave: CHAVE, texto: 'Oi', canal: 'whatsapp_business' } }), r2);
    expect(q(r2, 'resp')).toBe('sem_canal');
  });
  it('modelo não existe no número pessoal', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.responderModelo(req({ params: { id: LEAD }, body: { chave: CHAVE, modelo: 'reativacao_lead_v1', nome: 'Ana', canal: 'whatsapp_business' } }), r);
    expect(q(r, 'resp')).toBe('modelo_so_no_oficial');
  });
});

describe('envioDaTela: resposta sai pelo número em que o cliente escreveu por ÚLTIMO', () => {
  const msgs = (ultPessoal: number, ultEva: number) => [
    { role: 'user', content: 'eva', timestamp: hAtras(ultEva), canal: 'eva_oficial' as const },
    { role: 'user', content: 'pessoal', timestamp: hAtras(ultPessoal), canal: 'whatsapp_business' as const },
  ];
  it('última no pessoal → padrão 👤; última na Eva → 🤖; ?canal troca; os dois botões aparecem', async () => {
    const c = cenario();
    const e1 = await c.rotas.envioDaTela(req({}), { id: LEAD, phone: '5561999990001' }, msgs(1, 3));
    expect(e1).toMatchObject({ canal: 'whatsapp_business', via: 'evolution', donoPessoal: 'Junior', modelos: [] });
    expect(e1!.alternativas).toEqual([
      { canal: 'eva_oficial', ativo: false, href: `/dashboard/leads/${LEAD}?canal=eva_oficial#responder` },
      { canal: 'whatsapp_business', ativo: true, href: `/dashboard/leads/${LEAD}?canal=whatsapp_business#responder` },
    ]);
    expect((await c.rotas.envioDaTela(req({}), { id: LEAD, phone: '5561999990001' }, msgs(3, 1)))!.canal).toBe('eva_oficial');
    expect((await c.rotas.envioDaTela(req({ query: { canal: 'eva_oficial' } }), { id: LEAD, phone: '5561999990001' }, msgs(1, 3)))!.canal).toBe('eva_oficial');
  });
  it('quem não tem número pessoal: só o da Eva, sem botões de troca', async () => {
    const c = cenario();
    const e = await c.rotas.envioDaTela(req({ dashUser: bia, query: { canal: 'whatsapp_business' } }), { id: LEAD, phone: '5561999990001' }, msgs(1, 3));
    expect(e).toMatchObject({ canal: 'eva_oficial', via: 'waba' });
    expect(e!.alternativas).toBeUndefined();
  });
});

describe('contato que ainda não é lead', () => {
  const conversa = [{ id: 'x1', company_id: CASA, lead_id: null, contato_telefone: '5561977776666', contato_nome: 'Carlos', direcao: 'entrada', autor: 'cliente', canal: 'whatsapp_business', texto: 'E aí, Junior!', status: 'recebida', visivel_so_para: 'u-junior', criado_em: hAtras(1) }];
  it('só o DONO abre a conversa; já virou lead → manda pro lead', async () => {
    const c = cenario({ mensagens_whatsapp: conversa });
    const t = await c.rotas.contatoDaTela(req({ query: { contato: '61977776666' } }));
    expect(t && 'contato' in t && t.contato).toMatchObject({ telefone: '5561977776666', nome: 'Carlos' });
    expect(t && 'contato' in t && t.contato.mensagens[0]).toMatchObject({ role: 'user', content: 'E aí, Junior!' });
    expect(await c.rotas.contatoDaTela(req({ dashUser: bia, query: { contato: '61977776666' } }))).toBeNull();
    const d = cenario({ mensagens_whatsapp: [{ ...conversa[0], lead_id: LEAD }] });
    expect(await d.rotas.contatoDaTela(req({ query: { contato: '61977776666' } }))).toEqual({ leadId: LEAD });
  });
  it('responder o contato: sai pela instância do dono, sem lead, só o dono vê', async () => {
    const c = cenario({ mensagens_whatsapp: [...conversa] });
    const r = res();
    await c.rotas.responderContato(req({ body: { telefone: '61977776666', chave: CHAVE, texto: 'Opa Carlos!' } }), r);
    expect(r.destino).toBe('/dashboard/leads/conversas?contato=5561977776666&resp=enviada#responder');
    expect(c.enviarPessoal).toHaveBeenCalledWith('junior-business', '5561977776666', 'Opa Carlos!');
    expect(c.b.tabelas.mensagens_whatsapp.find((m) => m.direcao === 'saida')).toMatchObject({ lead_id: null, visivel_so_para: 'u-junior', canal: 'whatsapp_business' });
    const r2 = res();
    await c.rotas.responderContato(req({ dashUser: bia, body: { telefone: '61977776666', chave: '8f3c2c55-1d2e-4c3b-9a55-0e2d7c1b9f09', texto: 'x' } }), r2);
    expect(q(r2, 'resp')).toBe('sem_canal');
    const r3 = res();
    await c.rotas.responderContato(req({ body: { telefone: '61955554444', chave: '8f3c2c55-1d2e-4c3b-9a55-0e2d7c1b9f08', texto: 'x' } }), r3);
    expect(r3.statusCode).toBe(404);
    expect(c.enviarPessoal).toHaveBeenCalledTimes(1);
  });
  it('virar lead: cria na casa e abre o lead no número pessoal', async () => {
    const c = cenario({ mensagens_whatsapp: [...conversa] });
    const r = res();
    await c.rotas.virarLeadDoContato(req({ body: { telefone: '5561977776666' } }), r);
    const novo = c.b.tabelas.leads.find((l) => l.phone === '5561977776666')!;
    expect(r.destino).toBe(`/dashboard/leads/${novo.id}?canal=whatsapp_business#responder`);
    expect(novo).toMatchObject({ company_id: CASA, eva_active: false, name: 'Carlos' });
    expect(c.b.tabelas.audit_log[0]).toMatchObject({ acao: 'virou_lead_whatsapp_pessoal' });
  });
  it('tenant não vira lead por aqui', async () => {
    const c = cenario({ mensagens_whatsapp: [...conversa] });
    const r = res();
    await c.rotas.virarLeadDoContato(req({ dashUser: { ...USER_TENANT, companyId: TENANT }, body: { telefone: '5561977776666' } }), r);
    expect(r.statusCode).toBe(404);
  });
});

describe('Meu WhatsApp no painel (QR)', () => {
  function qr(extra: Record<string, any[]> = {}, fetchImpl?: any) {
    const b = bancoMemoria({ whatsapp_numeros_pessoais: [], companies: [{ id: TENANT, evolution_instance: 'solar-aurora' }], audit_log: [], ...extra });
    const f = fetchImpl ?? vi.fn(async () => new Response('{}', { status: 201 }));
    const rotas = criarRotasNumeroPessoal({ supabase: b.client, evolution: { baseUrl: 'https://evo.exemplo', apiKey: 'k', fetchImpl: f }, instanciaDaEva: 'eva-principal', webhookUrl: 'https://painel.exemplo/webhook', webhookToken: 'tok' });
    return { b, rotas, f };
  }
  it('tenant: 404 (só a EcoSun tem número pessoal)', async () => {
    const { rotas } = qr();
    const r = res();
    await rotas.pagina(req({ dashUser: USER_TENANT }), r);
    expect(r.statusCode).toBe(404);
  });
  it('preparar: cria a instância na Evolution + webhook e guarda o número como DE QUEM CONECTOU', async () => {
    const { b, rotas, f } = qr();
    const r = res();
    await rotas.criar(req({ body: { instancia: 'qualquer-coisa-digitada' } }), r);
    expect(r.destino).toBe('/dashboard/whatsapp/pessoal?ok=criada');
    expect(f.mock.calls[0][0]).toBe('https://evo.exemplo/instance/create');
    // nome escolhido pelo SERVIDOR (nunca o digitado)
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ instanceName: 'pessoal-ujunior', qrcode: true, integration: 'WHATSAPP-BAILEYS' });
    expect(f.mock.calls[1][0]).toBe('https://evo.exemplo/webhook/set/pessoal-ujunior');
    // token no cabeçalho, nunca na URL
    const wh = JSON.parse(f.mock.calls[1][1].body).webhook;
    expect(wh.url).toBe('https://painel.exemplo/webhook');
    expect(wh.headers).toEqual({ 'x-webhook-token': 'tok' });
    expect(b.tabelas.whatsapp_numeros_pessoais[0]).toMatchObject({ company_id: CASA, dono_user_id: 'u-junior', dono_nome: 'Junior', instancia: 'pessoal-ujunior', ativo: true });
  });
  it('não "adota" instância de outro: nome já de um tenant (maiúsculas não enganam) ou já existente na Evolution', async () => {
    const t = qr({ companies: [{ id: TENANT, evolution_instance: 'PESSOAL-UJUNIOR' }] });
    const r1 = res();
    await t.rotas.criar(req({}), r1);
    expect(r1.destino).toBe('/dashboard/whatsapp/pessoal?erro=instancia_ocupada');
    expect(t.f).not.toHaveBeenCalled();
    const e = qr({}, vi.fn(async () => new Response('{"error":"This name is already in use"}', { status: 403 })));
    const r2 = res();
    await e.rotas.criar(req({}), r2);
    expect(r2.destino).toBe('/dashboard/whatsapp/pessoal?erro=instancia_ocupada');
    expect(e.b.tabelas.whatsapp_numeros_pessoais).toHaveLength(0);
  });
  it('Origin de outro site: recusa', async () => {
    const { rotas, f } = qr();
    const r = res();
    await rotas.criar(req({ headers: { origin: 'https://mau.exemplo', host: 'painel.exemplo' } }), r);
    expect(r.statusCode).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });
  it('QR e estado são SEMPRE do número de quem está logado', async () => {
    const f = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('connectionState') ? { instance: { state: 'connecting' } } : { base64: 'data:image/png;base64,AAAA' }), { status: 200 }));
    const { rotas } = qr({ whatsapp_numeros_pessoais: [NP] }, f);
    const r = res();
    await rotas.qr(req({}), r);
    expect(r.corpo).toMatchObject({ estado: 'connecting', base64: 'data:image/png;base64,AAAA' });
    expect(String(f.mock.calls[0][0])).toContain('/junior-business');
    const r2 = res();
    await rotas.qr(req({ dashUser: bia }), r2);
    expect(r2.corpo).toEqual({ estado: 'desconhecido' });
  });
  it('desligar: para de gravar (ativo=false)', async () => {
    const { b, rotas } = qr({ whatsapp_numeros_pessoais: [{ ...NP }] });
    const r = res();
    await rotas.desligar(req({}), r);
    expect(b.tabelas.whatsapp_numeros_pessoais[0].ativo).toBe(false);
    expect(r.destino).toBe('/dashboard/whatsapp/pessoal?ok=desligado');
  });
});

describe('lista: um cliente = um item; quem não é lead aparece com "Não é lead"', () => {
  const leads = [{ id: 'L1', name: 'Ana', phone: '5561999990001', status: 'novo', city: null, eva_active: true, opt_out: false, claimed_by: null }];
  const rows: any[] = [
    { id: 'a', lead_id: 'L1', contato_telefone: '5561999990001', direcao: 'entrada', texto: 'no pessoal', criado_em: '2026-09-28T12:00:00Z', canal: 'whatsapp_business' },
    { id: 'b', lead_id: null, contato_telefone: '5561977776666', contato_nome: 'Carlos', direcao: 'entrada', texto: 'e aí', criado_em: '2026-09-28T11:00:00Z', canal: 'whatsapp_business' },
  ];
  it('mesmo lead nos dois números: 1 item, com o número da conversa mais nova', () => {
    const l = montarLista([{ lead_id: 'L1', messages: [{ role: 'user', content: 'na Eva', timestamp: '2026-09-28T10:00:00Z' }] }], leads, {}, 'u', 'eva_oficial', resumosPessoais(rows, leads));
    expect(l.itens.map((i) => i.nome)).toEqual(['Ana', 'Carlos']);
    expect(l.itens[0]).toMatchObject({ canal: 'whatsapp_business', ultimaTexto: 'no pessoal', aguardandoResposta: true });
    expect(l.itens[1]).toMatchObject({ leadId: '', contato: '5561977776666', etapa: '' });
  });
  it('tela: item sem lead leva pra ?contato=, com "Não é lead" e o selo 👤', () => {
    const lista = { itens: resumosPessoais(rows, leads), contagem: { todas: 2, aguardando: 2, meus: 0, porEtapa: {} } };
    const h = renderAtendimentoPage({ user: USER_CASA as any, lista, filtros: {}, lead: null, donoPessoal: 'Junior' });
    expect(h).toContain('href="/dashboard/leads/conversas?contato=5561977776666"');
    expect(h).toContain('<span class="cc-at-naolead">Não é lead</span>');
    expect(h).toContain('👤 Junior</span>');
    expect(h).toContain('href="/dashboard/whatsapp/pessoal"');
  });
});

describe('tela do contato (sem lead)', () => {
  it('conversa, "Virar lead", responder pelo pessoal, "só você vê"; tenant não vê atalho de número pessoal', () => {
    const h = renderAtendimentoPage({
      user: USER_CASA as any, lista: LISTA_CONVERSAS, filtros: {}, lead: null, donoPessoal: 'Junior',
      contato: {
        telefone: '5561977776666', nome: 'Carlos <b>', mensagens: [{ role: 'user', content: 'E aí', timestamp: hAtras(1), canal: 'whatsapp_business' }],
        envio: { via: 'evolution', canal: 'whatsapp_business', modelos: [], chave: CHAVE, donoPessoal: 'Junior', empresaNome: 'EcoSunPower', euNome: 'Junior' },
      },
    });
    expect(h).toContain('action="/dashboard/leads/conversas/contato/virar-lead"');
    expect(h).toContain('action="/dashboard/leads/conversas/contato/responder"');
    expect(h).toContain('name="telefone" value="5561977776666"');
    expect(h).toContain('só você vê esta conversa');
    expect(h).toContain('Carlos &lt;b&gt;');
    expect(h).toContain('A Eva não responde aqui');
    expect(renderAtendimentoPage({ user: USER_TENANT as any, lista: LISTA_CONVERSAS, filtros: {}, lead: null })).not.toContain('/dashboard/whatsapp/pessoal');
  });
});

describe('webhook da Evolution', () => {
  it('a instância pessoal é desviada ANTES de tudo da Eva (tenant, grupo, fromMe/takeover, fila)', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf-8');
    const ini = fonte.indexOf("app.post('/webhook', async (req, res) => {");
    const trecho = fonte.slice(ini);
    const desvio = trecho.indexOf('numerosPessoais.porInstancia(instanciaOrigem)');
    expect(desvio).toBeGreaterThan(0);
    for (const depois of ['evolutionTenant.companyDaInstancia(instanciaOrigem)', 'if (parsed.deGrupo)', 'if (parsed.fromMe)', 'await queue.addMessage(']) {
      expect(trecho.indexOf(depois), depois).toBeGreaterThan(desvio);
    }
    const bloco = trecho.slice(desvio, desvio + 2000);
    expect(bloco).toMatch(/pessoal === 'erro'[\s\S]*status\(503\)/);
    expect(bloco).toMatch(/!pessoal\.ativo[\s\S]*numero_pessoal_desligado/);
    expect(bloco).toMatch(/numero_pessoal_conflito/);
    expect(bloco).toMatch(/receberNoNumeroPessoal[\s\S]*return;/);
  });
});
