// Atendimento Parte 2 — rotas de responder pelo painel, com banco em memória e
// dublês do WhatsApp (NADA sai de verdade). Cobre: janela de 24 h no servidor,
// modelo fora da janela, anti envio duplo, limite, opt-out/LGPD, trava de
// empresa, canal do tenant, "responder = assumir" e o evento na conversa.
import { describe, it, expect, vi } from 'vitest';
import { criarRotasAtendimento } from '../src/modules/dashboard/atendimento-rotas.js';
import { LimiteDeEnvio } from '../src/modules/dashboard/atendimento-envio.js';
import { canalAtual } from '../src/modules/canal-contexto.js';
import { bancoMemoria } from './helpers/supabase-memoria.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const LEAD = '11111111-1111-1111-1111-111111111111';
const CHAVE = '8f3c2c55-1d2e-4c3b-9a55-0e2d7c1b9f00';
const CHAVE2 = '8f3c2c55-1d2e-4c3b-9a55-0e2d7c1b9f01';
const agora = Date.parse('2026-09-28T17:00:00Z');
const hAtras = (h: number) => new Date(agora - h * 3600_000).toISOString();

const junior = { id: 'u-junior', companyId: CASA, nome: 'Junior', login: 'junior', isAdmin: true, roleNome: 'Admin', permissoes: {} };
const bia = { id: 'u-bia', companyId: TENANT, nome: 'Bia', login: 'bia', isAdmin: true, roleNome: 'Admin', permissoes: {} };

function cenario(o: { company?: string; lead?: Record<string, unknown>; ultimaDoCliente?: number | null; semWaba?: boolean; instancia?: string | null; limite?: LimiteDeEnvio } = {}) {
  const company = o.company ?? CASA;
  const b = bancoMemoria({
    leads: [{ id: LEAD, company_id: company, name: 'Ana Exemplo', phone: '61999990001', eva_active: true, opt_out: false, ...o.lead }],
    conversations: o.ultimaDoCliente === null ? [] : [{
      id: 'cv1', company_id: company, lead_id: LEAD, created_at: hAtras(30),
      messages: [{ role: 'user', content: 'Oi, quero orçamento', timestamp: hAtras(o.ultimaDoCliente ?? 2) }],
    }],
    eva_cadence: [{ id: 'c1', lead_id: LEAD, status: 'pending' }],
    mensagens_whatsapp: [],
    lead_atividades: [],
    audit_log: [],
  }, { mensagens_whatsapp: [['company_id', 'chave_envio'], ['company_id', 'wamid']] });
  const waba = {
    sendText: vi.fn(async () => ({ messageId: 'wamid.T1' })),
    sendTemplate: vi.fn(async () => ({ messageId: 'wamid.M1' })),
    listTemplates: vi.fn(async () => [
      { name: 'reativacao_lead_v1', status: 'APPROVED', language: 'pt_BR', category: 'MARKETING', components: [{ type: 'BODY', text: 'Oi {{1}}! Posso te ajudar?' }] },
    ]),
  };
  let canalNoEnvio: unknown = null;
  const sendTextEvolution = vi.fn(async () => { canalNoEnvio = canalAtual(); });
  const copiarParaMemoria = vi.fn(async () => {});
  const retomarTakeover = vi.fn(async () => {});
  const rotas = criarRotasAtendimento({
    supabase: b.client,
    banco: () => b.client,
    waba: o.semWaba ? null : waba,
    sendTextEvolution,
    instanciaDaEmpresa: async () => o.instancia ?? null,
    engineerPhone: '5561998805002',
    copiarParaMemoria,
    retomarTakeover,
    limite: o.limite ?? new LimiteDeEnvio(100, 0),
    agora: () => agora,
  });
  return { b, waba, sendTextEvolution, copiarParaMemoria, retomarTakeover, rotas, canalNoEnvio: () => canalNoEnvio };
}

function req(body: Record<string, unknown>, user: any = junior, id = LEAD) {
  return { params: { id }, body, query: {}, dashUser: user } as any;
}
function res() {
  const r: any = { statusCode: 200, corpo: '', destino: '' };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.send = (x: string) => { r.corpo = x; return r; };
  r.redirect = (a: number | string, b?: string) => { r.destino = typeof a === 'string' ? a : b; r.statusCode = typeof a === 'number' ? a : 302; return r; };
  return r;
}
const resp = (r: any) => new URL(`http://x${r.destino}`).searchParams.get('resp');

describe('POST /leads/:id/responder — número da Eva (WABA)', () => {
  it('janela aberta: envia pelo número oficial, grava com autor/canal, assume e copia pra memória da Eva', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.responder(req({ chave: CHAVE, texto: '  Oi Ana! Aqui é o Junior.  ' }), r);
    expect(resp(r)).toBe('enviada');
    expect(r.destino).toBe(`/dashboard/leads/${LEAD}?resp=enviada#responder`);
    expect(c.waba.sendText).toHaveBeenCalledWith('5561999990001', 'Oi Ana! Aqui é o Junior.');
    const saida = c.b.tabelas.mensagens_whatsapp.find((m) => m.direcao === 'saida')!;
    expect(saida).toMatchObject({ company_id: CASA, lead_id: LEAD, autor: 'humano', user_id: 'u-junior', autor_nome: 'Junior', canal: 'eva_oficial', tipo: 'texto', status: 'enviada', wamid: 'wamid.T1', chave_envio: CHAVE });
    // responder = assumir: o MESMO estado do botão do WhatsApp
    expect(c.b.tabelas.leads[0].eva_active).toBe(false);
    expect(c.b.tabelas.mensagens_whatsapp.find((m) => m.direcao === 'evento')).toMatchObject({ evento: 'assumiu', origem: 'painel', autor_nome: 'Junior' });
    expect(c.b.tabelas.eva_cadence[0].status).toBe('cancelled');
    expect(c.copiarParaMemoria).toHaveBeenCalledWith(expect.objectContaining({ leadId: LEAD, companyId: CASA, texto: 'Oi Ana! Aqui é o Junior.' }));
    expect(c.b.tabelas.lead_atividades[0]).toMatchObject({ tipo: 'whatsapp', titulo: 'Mensagem enviada pelo painel', user_id: 'u-junior' });
    expect(c.b.tabelas.audit_log[0]).toMatchObject({ acao: 'whatsapp_enviado', campo: 'eva_oficial', valor_novo: 'texto' });
  });

  it('janela FECHADA: texto livre é recusado no SERVIDOR (nada sai, nada é gravado)', async () => {
    const c = cenario({ ultimaDoCliente: 30 });
    const r = res();
    await c.rotas.responder(req({ chave: CHAVE, texto: 'Oi' }), r);
    expect(resp(r)).toBe('janela_fechada');
    expect(c.waba.sendText).not.toHaveBeenCalled();
    expect(c.b.tabelas.mensagens_whatsapp).toHaveLength(0);
    expect(c.b.tabelas.leads[0].eva_active).toBe(true);
  });

  it('sem nenhuma mensagem do cliente: janela fechada', async () => {
    const c = cenario({ ultimaDoCliente: null });
    const r = res();
    await c.rotas.responder(req({ chave: CHAVE, texto: 'Oi' }), r);
    expect(resp(r)).toBe('janela_fechada');
  });

  it('clique duplo (mesma chave): a 2ª NÃO sai', async () => {
    const c = cenario();
    await c.rotas.responder(req({ chave: CHAVE, texto: 'Oi' }), res());
    const r2 = res();
    await c.rotas.responder(req({ chave: CHAVE, texto: 'Oi' }), r2);
    expect(resp(r2)).toBe('duplicado');
    expect(c.waba.sendText).toHaveBeenCalledTimes(1);
  });

  it('freio: muitas mensagens seguidas pro mesmo contato → espera', async () => {
    const c = cenario({ limite: new LimiteDeEnvio(100, 5000) });
    await c.rotas.responder(req({ chave: CHAVE, texto: 'Oi' }), res());
    const r2 = res();
    await c.rotas.responder(req({ chave: CHAVE2, texto: 'Oi de novo' }), r2);
    expect(resp(r2)).toBe('limite');
    expect(c.waba.sendText).toHaveBeenCalledTimes(1);
  });

  it('pediu para parar (opt-out): bloqueia', async () => {
    const c = cenario({ lead: { opt_out: true, eva_active: false } });
    const r = res();
    await c.rotas.responder(req({ chave: CHAVE, texto: 'Oi' }), r);
    expect(resp(r)).toBe('opt_out');
    expect(c.waba.sendText).not.toHaveBeenCalled();
  });

  it('lead de OUTRA empresa: 404, nada sai', async () => {
    const c = cenario({ company: TENANT });
    const r = res();
    await c.rotas.responder(req({ chave: CHAVE, texto: 'Oi' }, junior), r);
    expect(r.statusCode).toBe(404);
    expect(c.waba.sendText).not.toHaveBeenCalled();
    expect(c.b.escritas).toHaveLength(0);
  });

  it('o WhatsApp recusou: fica "falhou" no histórico com o motivo', async () => {
    const c = cenario();
    c.waba.sendText.mockRejectedValueOnce(new Error('(#131047) Re-engagement message'));
    const r = res();
    await c.rotas.responder(req({ chave: CHAVE, texto: 'Oi' }), r);
    expect(resp(r)).toBe('falhou');
    expect(c.b.tabelas.mensagens_whatsapp.find((m) => m.direcao === 'saida')).toMatchObject({ status: 'falhou', erro: '(#131047) Re-engagement message' });
    expect(c.copiarParaMemoria).not.toHaveBeenCalled();
  });

  it('texto vazio / chave velha / número oficial não configurado', async () => {
    const c = cenario();
    const r1 = res(); await c.rotas.responder(req({ chave: CHAVE, texto: '   ' }), r1); expect(resp(r1)).toBe('vazio');
    const r2 = res(); await c.rotas.responder(req({ chave: 'x', texto: 'Oi' }), r2); expect(resp(r2)).toBe('chave_invalida');
    const s = cenario({ semWaba: true });
    const r3 = res(); await s.rotas.responder(req({ chave: CHAVE, texto: 'Oi' }), r3); expect(resp(r3)).toBe('whatsapp_nao_configurado');
    expect(c.waba.sendText).not.toHaveBeenCalled();
  });
});

describe('POST /leads/:id/responder-modelo — modelo aprovado', () => {
  it('fora da janela: envia o modelo com {{1}} = nome, grava a prévia como texto', async () => {
    const c = cenario({ ultimaDoCliente: 40 });
    const r = res();
    await c.rotas.responderModelo(req({ chave: CHAVE, modelo: 'reativacao_lead_v1', nome: 'Ana\n' }), r);
    expect(resp(r)).toBe('enviada');
    expect(c.waba.sendTemplate).toHaveBeenCalledWith('5561999990001', 'reativacao_lead_v1', 'pt_BR', [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }] }]);
    expect(c.b.tabelas.mensagens_whatsapp.find((m) => m.direcao === 'saida')).toMatchObject({ tipo: 'modelo', modelo: 'reativacao_lead_v1', texto: 'Oi Ana! Posso te ajudar?', status: 'enviada' });
  });

  it('modelo fora da lista aprovada: recusa', async () => {
    const c = cenario({ ultimaDoCliente: 40 });
    const r = res();
    await c.rotas.responderModelo(req({ chave: CHAVE, modelo: 'qualquer_coisa', nome: 'Ana' }), r);
    expect(resp(r)).toBe('modelo_invalido');
    expect(c.waba.sendTemplate).not.toHaveBeenCalled();
  });
});

describe('tenant (número próprio por QR)', () => {
  it('sem WhatsApp conectado: não envia (nunca pelo número da casa)', async () => {
    const c = cenario({ company: TENANT });
    const r = res();
    await c.rotas.responder(req({ chave: CHAVE, texto: 'Oi' }, bia), r);
    expect(resp(r)).toBe('sem_canal');
    expect(c.waba.sendText).not.toHaveBeenCalled();
    expect(c.sendTextEvolution).not.toHaveBeenCalled();
  });

  it('com instância: sai pela instância DELE (contexto da empresa), sem regra de 24 h', async () => {
    const c = cenario({ company: TENANT, instancia: 'solar-aurora', ultimaDoCliente: 40 });
    const r = res();
    await c.rotas.responder(req({ chave: CHAVE, texto: 'Oi' }, bia), r);
    expect(resp(r)).toBe('enviada');
    expect(c.waba.sendText).not.toHaveBeenCalled();
    expect(c.sendTextEvolution).toHaveBeenCalledWith('5561999990001', 'Oi');
    expect(c.canalNoEnvio()).toEqual({ companyId: TENANT, evolutionInstance: 'solar-aurora' });
    expect(c.b.tabelas.mensagens_whatsapp.find((m) => m.direcao === 'saida')).toMatchObject({ canal: 'qr_code', numero: 'solar-aurora', company_id: TENANT });
  });

  it('LGPD: tenant nunca manda pro celular do dono da EcoSun', async () => {
    const c = cenario({ company: TENANT, instancia: 'solar-aurora', lead: { phone: '5561998805002' } });
    const r = res();
    await c.rotas.responder(req({ chave: CHAVE, texto: 'Oi' }, bia), r);
    expect(resp(r)).toBe('bloqueado_lgpd');
    expect(c.sendTextEvolution).not.toHaveBeenCalled();
  });

  it('modelo só existe no número oficial', async () => {
    const c = cenario({ company: TENANT, instancia: 'solar-aurora' });
    const r = res();
    await c.rotas.responderModelo(req({ chave: CHAVE, modelo: 'reativacao_lead_v1', nome: 'Ana' }, bia), r);
    expect(resp(r)).toBe('modelo_so_no_oficial');
  });
});

describe('Assumir / Devolver pela tela', () => {
  it('Assumir grava o evento; Devolver reativa, limpa a pausa curta e grava "devolveu"', async () => {
    const c = cenario();
    const r1 = res();
    await c.rotas.assumir(req({}), r1);
    expect(r1.destino).toBe(`/dashboard/leads/${LEAD}`);
    expect(c.b.tabelas.leads[0].eva_active).toBe(false);
    const r2 = res();
    await c.rotas.devolver(req({}), r2);
    expect(c.b.tabelas.leads[0].eva_active).toBe(true);
    expect(c.retomarTakeover).toHaveBeenCalledWith('61999990001');
    expect(c.b.tabelas.mensagens_whatsapp.map((m) => m.evento)).toEqual(['assumiu', 'devolveu']);
    expect(c.b.tabelas.audit_log.map((a) => a.acao)).toEqual(['assumiu', 'devolveu_para_eva']);
  });

  it('Devolver quem pediu para parar: recusa', async () => {
    const c = cenario({ lead: { opt_out: true, eva_active: false } });
    const r = res();
    await c.rotas.devolver(req({}), r);
    expect(resp(r)).toBe('opt_out');
    expect(c.b.tabelas.leads[0].eva_active).toBe(false);
  });

  it('lead de outra empresa: 404', async () => {
    const c = cenario({ company: TENANT });
    const r = res();
    await c.rotas.assumir(req({}, junior), r);
    expect(r.statusCode).toBe(404);
    expect(c.b.tabelas.leads[0].eva_active).toBe(true);
  });
});

describe('envioDaTela (o que o campo de resposta mostra)', () => {
  it('casa: número oficial, modelos conferidos na Meta, chave nova a cada tela, resultado só se conhecido', async () => {
    const c = cenario();
    const e = await c.rotas.envioDaTela({ ...req({}), query: { resp: 'enviada' } }, { phone: '61999990001' });
    expect(e).toMatchObject({ via: 'waba', canal: 'eva_oficial', resultado: 'enviada', lgpdBloqueado: false });
    expect(e!.modelos.map((m) => m.nome)).toEqual(['reativacao_lead_v1']);
    const e2 = await c.rotas.envioDaTela({ ...req({}), query: { resp: '<script>' } }, { phone: '61999990001' });
    expect(e2!.resultado).toBeNull();
    expect(e2!.chave).not.toBe(e!.chave);
  });
  it('casa sem número oficial: não sai, com o motivo certo', async () => {
    const c = cenario({ semWaba: true });
    const e = await c.rotas.envioDaTela(req({}), { phone: '61999990001' });
    expect(e).toMatchObject({ via: 'nenhum', semCanalMotivo: 'whatsapp_nao_configurado', modelos: [] });
  });
});
