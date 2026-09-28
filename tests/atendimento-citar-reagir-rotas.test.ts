// W2 — rotas de responder CITANDO e REAGIR (banco em memória, dublês da Meta/
// Evolution: nada sai de verdade). A citada tem que ser DESTA conversa, visível
// para quem envia e do MESMO número da resposta. Reação sai pelo número da
// mensagem reagida; na Meta, só com a janela de 24 h aberta.
import { describe, it, expect, vi } from 'vitest';
import { criarRotasAtendimento } from '../src/modules/dashboard/atendimento-rotas.js';
import { LimiteDeEnvio } from '../src/modules/dashboard/atendimento-envio.js';
import { canalAtual } from '../src/modules/canal-contexto.js';
import { registrarTextoDaAssistente } from '../src/modules/reacoes-citacoes.js';
import { historicoDoLead } from '../src/modules/dashboard/conversas-queries.js';
import { bancoMemoria } from './helpers/supabase-memoria.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const LEAD = '11111111-1111-1111-1111-111111111111';
const OUTRO = '22222222-2222-2222-2222-222222222222';
const CHAVE = '8f3c2c55-1d2e-4c3b-9a55-0e2d7c1b9f00';
const M_EVA = '33333333-3333-4333-8333-333333333333';
const M_PES = '44444444-4444-4444-8444-444444444444';
const M_OUT = '55555555-5555-4555-8555-555555555555';
const agora = Date.parse('2026-09-28T17:00:00Z');
const hAtras = (h: number) => new Date(agora - h * 3600_000).toISOString();
const junior = { id: 'u-junior', companyId: CASA, nome: 'Junior', login: 'junior', isAdmin: true, roleNome: 'Admin', permissoes: {} };
const vendedor = { id: 'u-vend', companyId: CASA, nome: 'Vend', login: 'v', isAdmin: false, roleNome: 'Vendedor', permissoes: { leads: 'editar' } };
const bia = { id: 'u-bia', companyId: TENANT, nome: 'Bia', login: 'bia', isAdmin: true, roleNome: 'Admin', permissoes: {} };
const NP = { id: 'np1', company_id: CASA, dono_user_id: 'u-junior', dono_nome: 'Junior', instancia: 'pessoal-junior', numero: '5561998805002', ativo: true };

function cenario(o: { company?: string; ultimaDoCliente?: number; instancia?: string | null } = {}) {
  const company = o.company ?? CASA;
  const canalAssist = company === CASA ? 'eva_oficial' : 'qr_code';
  const b = bancoMemoria({
    leads: [
      { id: LEAD, company_id: company, name: 'Ana Exemplo', phone: '61999990001', eva_active: true, opt_out: false, claimed_by: null },
      { id: OUTRO, company_id: company, name: 'Outro', phone: '61988887777', eva_active: true, opt_out: false, claimed_by: null },
    ],
    conversations: [{ id: 'cv1', company_id: company, lead_id: LEAD, created_at: hAtras(30), messages: [{ role: 'user', content: 'Oi', timestamp: hAtras(o.ultimaDoCliente ?? 2) }] }],
    mensagens_whatsapp: [
      { id: M_EVA, company_id: company, lead_id: LEAD, contato_telefone: '5561999990001', direcao: 'entrada', autor: 'cliente', canal: canalAssist, tipo: 'texto', texto: 'Pode ser sábado?', wamid: 'wamid.EVA', visivel_so_para: null, criado_em: hAtras(1) },
      { id: M_PES, company_id: company, lead_id: LEAD, contato_telefone: '5561999990001', direcao: 'entrada', autor: 'cliente', canal: 'whatsapp_business', tipo: 'texto', texto: 'Oi Junior', wamid: 'PES1', visivel_so_para: 'u-junior', criado_em: hAtras(1) },
      { id: M_OUT, company_id: company, lead_id: OUTRO, contato_telefone: '5561988887777', direcao: 'entrada', autor: 'cliente', canal: canalAssist, tipo: 'texto', texto: 'de outro', wamid: 'wamid.OUT', visivel_so_para: null, criado_em: hAtras(1) },
    ],
    eva_cadence: [], lead_atividades: [], audit_log: [], whatsapp_numeros_pessoais: [NP],
  }, { mensagens_whatsapp: [['company_id', 'chave_envio'], ['company_id', 'wamid']] });
  const waba = {
    sendText: vi.fn(async () => ({ messageId: 'wamid.T' })),
    sendTemplate: vi.fn(async () => ({ messageId: 'wamid.M' })),
    sendTextReply: vi.fn(async () => ({ messageId: 'wamid.R' })),
    sendReaction: vi.fn(async () => ({ messageId: 'wamid.RE' })),
  };
  let canalNoEnvio: unknown = null;
  const sendTextEvolutionCitando = vi.fn(async () => { canalNoEnvio = canalAtual(); });
  const enviarPessoal = vi.fn(async () => ({ messageId: 'P1' }));
  const reagirEvolution = vi.fn(async () => ({ messageId: 'ER' }));
  const rotas = criarRotasAtendimento({
    supabase: b.client, banco: () => b.client, waba, sendTextEvolution: vi.fn(async () => {}), sendTextEvolutionCitando,
    instanciaDaEmpresa: async () => o.instancia ?? null, engineerPhone: '5561998805002',
    copiarParaMemoria: vi.fn(async () => {}), limite: new LimiteDeEnvio(100, 0), agora: () => agora,
    enviarPessoal, numeroPessoal: async (_c, u) => (u === 'u-junior' ? NP : null), reagirEvolution,
  });
  return { b, waba, rotas, enviarPessoal, sendTextEvolutionCitando, reagirEvolution, canalNoEnvio: () => canalNoEnvio };
}
function req(body: Record<string, unknown>, user: any = junior, id = LEAD) {
  return { params: { id }, body, query: {}, dashUser: user, headers: { accept: 'application/json' } } as any;
}
function res() {
  const r: any = { statusCode: 200, corpo: '', destino: '' };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.send = (x: string) => { r.corpo = x; return r; };
  r.json = (x: unknown) => { r.corpo = x; return r; };
  r.setHeader = () => {};
  r.redirect = (a: number | string, b?: string) => { r.destino = typeof a === 'string' ? a : b; return r; };
  return r;
}

describe('responder CITANDO', () => {
  it('número da Eva: sai com context (sendTextReply) e a linha guarda a citada', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.responder(req({ chave: CHAVE, texto: 'Sábado às 9h!', citando: M_EVA }), r);
    expect(r.corpo).toMatchObject({ ok: true });
    expect(c.waba.sendTextReply).toHaveBeenCalledWith('5561999990001', 'Sábado às 9h!', 'wamid.EVA');
    expect(c.waba.sendText).not.toHaveBeenCalled();
    const s = c.b.tabelas.mensagens_whatsapp.find((m) => m.direcao === 'saida')!;
    expect(s).toMatchObject({ citando_wamid: 'wamid.EVA', citando_texto: 'Pode ser sábado?' });
  });
  it('número pessoal: citada do número pessoal sai "quoted" pela instância do dono', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.responder(req({ chave: CHAVE, texto: 'Oi!', canal: 'whatsapp_business', citando: M_PES }), r);
    expect(r.corpo).toMatchObject({ ok: true });
    expect(c.enviarPessoal).toHaveBeenCalledWith('pessoal-junior', '5561999990001', 'Oi!', { id: 'PES1', texto: 'Oi Junior', fromMe: false });
  });
  it('citada do OUTRO número: recusa com o motivo (o WhatsApp não acharia a mensagem)', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.responder(req({ chave: CHAVE, texto: 'Oi!', citando: M_PES }), r);
    expect(r.corpo).toMatchObject({ ok: false, resultado: 'citacao_outro_numero' });
    expect(c.waba.sendTextReply).not.toHaveBeenCalled();
  });
  it('citada de OUTRO lead (id trocado na página): recusa, nada sai', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.responder(req({ chave: CHAVE, texto: 'x', citando: M_OUT }), r);
    expect(r.corpo).toMatchObject({ ok: false, resultado: 'citacao_invalida' });
    expect(c.waba.sendText).not.toHaveBeenCalled();
  });
  it('citada pessoal do dono, pedida por outra pessoa da empresa: inválida (LGPD)', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.responder(req({ chave: CHAVE, texto: 'x', citando: M_PES }, vendedor), r);
    expect(r.corpo).toMatchObject({ ok: false });
    expect(['citacao_invalida', 'citacao_outro_numero']).toContain((r.corpo as { resultado: string }).resultado);
  });
  it('tenant: citação sai pela instância DELE, dentro do canal da empresa', async () => {
    const c = cenario({ company: TENANT, instancia: 'solar-aurora' });
    const r = res();
    await c.rotas.responder(req({ chave: CHAVE, texto: 'Pode!', citando: M_EVA }, bia), r);
    expect(r.corpo).toMatchObject({ ok: true });
    expect(c.sendTextEvolutionCitando).toHaveBeenCalledWith('5561999990001', 'Pode!', { id: 'wamid.EVA', texto: 'Pode ser sábado?', fromMe: false });
    expect(c.canalNoEnvio()).toMatchObject({ companyId: TENANT, evolutionInstance: 'solar-aurora' });
  });
});

describe('REAGIR', () => {
  it('número da Eva: sendReaction com o id do WhatsApp e a reação fica gravada (não assume a conversa)', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.reagir(req({ alvo: M_EVA, emoji: '👍' }), r);
    expect(r.corpo).toMatchObject({ ok: true, resultado: 'reacao_enviada' });
    expect(c.waba.sendReaction).toHaveBeenCalledWith('5561999990001', 'wamid.EVA', '👍');
    expect(c.b.tabelas.mensagens_whatsapp.find((m) => m.tipo === 'reacao')).toMatchObject({ texto: '👍', citando_wamid: 'wamid.EVA', direcao: 'saida', autor: 'humano', user_id: 'u-junior' });
    expect(c.b.tabelas.leads[0].eva_active).toBe(true);
  });
  it('janela de 24 h fechada na Meta: não reage', async () => {
    const c = cenario({ ultimaDoCliente: 30 });
    c.b.tabelas.mensagens_whatsapp[0].criado_em = hAtras(30);
    c.b.tabelas.mensagens_whatsapp[1].criado_em = hAtras(30);
    const r = res();
    await c.rotas.reagir(req({ alvo: M_EVA, emoji: '👍' }), r);
    expect(r.corpo).toMatchObject({ ok: false, resultado: 'janela_fechada' });
    expect(c.waba.sendReaction).not.toHaveBeenCalled();
  });
  it('emoji fora da lista: recusado', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.reagir(req({ alvo: M_EVA, emoji: 'olá' }), r);
    expect(r.corpo).toMatchObject({ ok: false, resultado: 'reacao_invalida' });
  });
  it('mensagem do número pessoal: sai pela instância do dono (Evolution); outra pessoa não reage', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.reagir(req({ alvo: M_PES, emoji: '❤️' }), r);
    expect(r.corpo).toMatchObject({ ok: true });
    expect(c.reagirEvolution).toHaveBeenCalledWith('pessoal-junior', CASA, '5561999990001', { id: 'PES1', fromMe: false }, '❤️');
    const r2 = res();
    await c.rotas.reagir(req({ alvo: M_PES, emoji: '❤️' }, vendedor), r2);
    expect(r2.statusCode).toBe(404);
  });
  it('mensagem de outro lead / de outra empresa: 404', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.reagir(req({ alvo: M_OUT, emoji: '👍' }), r);
    expect(r.statusCode).toBe(404);
    const t = cenario({ company: TENANT, instancia: 'x' });
    const r2 = res();
    await t.rotas.reagir(req({ alvo: M_EVA, emoji: '👍' }), r2);
    expect(r2.statusCode).toBe(404);
  });
  it('emoji vazio TIRA a reação', async () => {
    const c = cenario();
    await c.rotas.reagir(req({ alvo: M_EVA, emoji: '👍' }), res());
    await c.rotas.reagir(req({ alvo: M_EVA, emoji: '' }), res());
    expect(c.b.tabelas.mensagens_whatsapp.filter((m) => m.tipo === 'reacao')).toHaveLength(0);
    expect(c.waba.sendReaction).toHaveBeenLastCalledWith('5561999990001', 'wamid.EVA', '');
  });
});

describe('texto do cliente no número da assistente: entra no painel com o id do WhatsApp (sem duplicar no chat)', () => {
  it('registra e o chat mostra UMA vez (a cópia da memória da Eva sai)', async () => {
    const b = bancoMemoria({
      conversations: [{ id: 'cv', company_id: CASA, lead_id: LEAD, created_at: hAtras(2), messages: [{ role: 'user', content: 'Quero orçamento', timestamp: new Date(agora - 3600_000 + 5000).toISOString() }, { role: 'assistant', content: 'Claro!', timestamp: new Date(agora - 3600_000 + 9000).toISOString() }] }],
      mensagens_whatsapp: [],
    });
    expect(await registrarTextoDaAssistente(b.client, { companyId: CASA, telefone: '5561999990001', lead: { id: LEAD }, wamid: 'wamid.Q', texto: 'Quero orçamento', recebidaEm: new Date(agora - 3600_000).toISOString(), citandoId: 'wamid.ANT' })).toBe(true);
    expect(b.tabelas.mensagens_whatsapp[0]).toMatchObject({ wamid: 'wamid.Q', citando_wamid: 'wamid.ANT', canal: 'eva_oficial', direcao: 'entrada' });
    const chat = await historicoDoLead(b.client, LEAD, CASA, 'u-junior');
    expect(chat.map((m) => m.content)).toEqual(['Quero orçamento', 'Claro!']);
    expect(chat[0].wamid).toBe('wamid.Q');
    expect(await registrarTextoDaAssistente(b.client, { companyId: CASA, telefone: '1', lead: null, wamid: 'w', texto: 'x', recebidaEm: null })).toBe(false);
  });
});
