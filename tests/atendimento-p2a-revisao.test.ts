// Atendimento Parte 2a — o que as 3 revisões pegaram (correção, segurança/
// multi-tenant/LGPD). Cada teste é um achado.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { assumirAtendimento, devolverParaEva } from '../src/modules/assumir-atendimento.js';
import { reservarEnvio, statusDaChave, semTelefone, mensagensDoPainel } from '../src/modules/mensagens-whatsapp.js';
import { criarRotasAtendimento, mesmaOrigem } from '../src/modules/dashboard/atendimento-rotas.js';
import { LimiteDeEnvio } from '../src/modules/dashboard/atendimento-envio.js';
import { montarLista, linhaDoPainelParaChat } from '../src/modules/dashboard/conversas-queries.js';
import { parametroNome } from '../src/modules/dashboard/modelos-atendimento.js';
import { bancoMemoria } from './helpers/supabase-memoria.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const LEAD = '11111111-1111-1111-1111-111111111111';
const CHAVE = '8f3c2c55-1d2e-4c3b-9a55-0e2d7c1b9f00';

describe('lead legado sem company_id (= da casa)', () => {
  it('Assumir/Devolver mexem mesmo no lead com company_id nulo', async () => {
    const b = bancoMemoria({ leads: [{ id: LEAD, company_id: null, phone: '5561999990001', eva_active: true, opt_out: false }], eva_cadence: [], mensagens_whatsapp: [] });
    expect(await assumirAtendimento(b.client, { leadId: LEAD, companyId: CASA, origem: 'whatsapp', autorNome: 'Junior' })).toEqual({ ok: true, jaEstava: false });
    expect(b.tabelas.leads[0].eva_active).toBe(false);
    expect(b.tabelas.mensagens_whatsapp[0].company_id).toBe(CASA);
    expect((await devolverParaEva(b.client, { leadId: LEAD, companyId: CASA, origem: 'painel', autorNome: 'Junior' })).ok).toBe(true);
    expect(b.tabelas.leads[0].eva_active).toBe(true);
  });
  it('update que não mudou nenhuma linha NÃO diz que pausou', async () => {
    const b = bancoMemoria({ leads: [{ id: LEAD, company_id: CASA, phone: '5561999990001', eva_active: true, opt_out: false }], eva_cadence: [], mensagens_whatsapp: [] });
    const client = { from: (t: string) => {
      const q = b.client.from(t);
      if (t !== 'leads') return q;
      const orig = q.update.bind(q);
      q.update = (d: any) => { orig(d); q.eq = () => q; q.is = () => q; q.select = () => Promise.resolve({ data: [], error: null }); return q; };
      return q;
    } };
    expect(await assumirAtendimento(client as any, { leadId: LEAD, companyId: CASA, origem: 'painel', autorNome: 'Junior' })).toEqual({ ok: false, motivo: 'erro' });
    expect(b.tabelas.mensagens_whatsapp).toHaveLength(0);
  });
});

describe('anti envio duplo', () => {
  it('clique repetido de um envio que FALHOU não diz "já enviada"', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: [{ id: 'm1', company_id: CASA, chave_envio: CHAVE, status: 'falhou' }] }, { mensagens_whatsapp: [['company_id', 'chave_envio']] });
    const r = await reservarEnvio(b.client, { company_id: CASA, direcao: 'saida', autor: 'humano', chave_envio: CHAVE });
    expect(r).toEqual({ ok: false, motivo: 'ja_falhou' });
    expect(await statusDaChave(b.client, CASA, CHAVE)).toBe('falhou');
    expect(await statusDaChave(b.client, TENANT, CHAVE)).toBeNull();
  });
  it('o 2º clique responde "duplicado" antes do freio de tempo', async () => {
    const b = bancoMemoria({
      leads: [{ id: LEAD, company_id: CASA, name: 'Ana', phone: '61999990001', eva_active: true, opt_out: false }],
      conversations: [{ id: 'c', company_id: CASA, lead_id: LEAD, created_at: 'a', messages: [{ role: 'user', content: 'oi', timestamp: new Date(Date.now() - 3600_000).toISOString() }] }],
      eva_cadence: [], mensagens_whatsapp: [], lead_atividades: [], audit_log: [],
    }, { mensagens_whatsapp: [['company_id', 'chave_envio']] });
    const waba = { sendText: vi.fn(async () => ({ messageId: 'w1' })), sendTemplate: vi.fn() };
    const rotas = criarRotasAtendimento({ supabase: b.client, banco: () => b.client, waba: waba as any, instanciaDaEmpresa: async () => null, engineerPhone: '', limite: new LimiteDeEnvio(100, 60_000) });
    const res = () => { const r: any = {}; r.redirect = (_c: number, d: string) => { r.d = d; }; r.status = () => r; r.send = () => r; return r; };
    const req = { params: { id: LEAD }, body: { chave: CHAVE, texto: 'Oi' }, query: {}, headers: {}, dashUser: { id: 'u', companyId: CASA, nome: 'Junior', isAdmin: true, permissoes: {} } } as any;
    const r1 = res(); await rotas.responder(req, r1);
    const r2 = res(); await rotas.responder(req, r2);
    expect(r1.d).toContain('resp=enviada');
    expect(r2.d).toContain('resp=duplicado');
    expect(waba.sendText).toHaveBeenCalledTimes(1);
  });
});

describe('segurança', () => {
  it('Origin de outro site é recusada; sem Origin (form antigo) passa', () => {
    expect(mesmaOrigem({ headers: { origin: 'https://dashboard.ecosunpower.eng.br', host: 'dashboard.ecosunpower.eng.br' } } as any)).toBe(true);
    expect(mesmaOrigem({ headers: { origin: 'https://mau.exemplo', host: 'dashboard.ecosunpower.eng.br' } } as any)).toBe(false);
    expect(mesmaOrigem({ headers: { origin: 'null', host: 'x' } } as any)).toBe(false);
    expect(mesmaOrigem({ headers: { host: 'x' } } as any)).toBe(true);
    expect(mesmaOrigem({ headers: { origin: 'https://painel.ex', host: 'interno:3000', 'x-forwarded-host': 'painel.ex' } } as any)).toBe(true);
  });
  it('Devolver no TENANT não apaga a pausa do Redis (a chave é só o telefone, sem empresa)', async () => {
    const b = bancoMemoria({ leads: [{ id: LEAD, company_id: TENANT, phone: '61999990001', eva_active: false, opt_out: false }], mensagens_whatsapp: [], audit_log: [] });
    const retomar = vi.fn(async () => {});
    const rotas = criarRotasAtendimento({ supabase: b.client, banco: () => b.client, instanciaDaEmpresa: async () => 'x', engineerPhone: '', retomarTakeover: retomar });
    const r: any = { redirect: () => {}, status: () => r, send: () => r };
    await rotas.devolver({ params: { id: LEAD }, body: {}, headers: {}, dashUser: { id: 'u', companyId: TENANT, nome: 'Bia' } } as any, r);
    expect(b.tabelas.leads[0].eva_active).toBe(true);
    expect(retomar).not.toHaveBeenCalled();
  });
  it('Devolver na casa limpa a pausa em TODOS os formatos do telefone', async () => {
    const b = bancoMemoria({ leads: [{ id: LEAD, company_id: CASA, phone: '61999990001', eva_active: false, opt_out: false }], mensagens_whatsapp: [], audit_log: [] });
    const retomar = vi.fn(async () => {});
    const rotas = criarRotasAtendimento({ supabase: b.client, banco: () => b.client, instanciaDaEmpresa: async () => null, engineerPhone: '', retomarTakeover: retomar });
    const r: any = { redirect: () => {}, status: () => r, send: () => r };
    await rotas.devolver({ params: { id: LEAD }, body: {}, headers: {}, dashUser: { id: 'u', companyId: CASA, nome: 'Junior' } } as any, r);
    const chamados = retomar.mock.calls.map((c: any) => c[0]);
    expect(chamados).toContain('5561999990001');
    expect(chamados).toContain('61999990001');
  });
  it('erro da Meta/Evolution não leva o telefone do cliente pro banco/log', () => {
    expect(semTelefone('Evolution sendText failed: 400 {"number":"5561999990001@s.whatsapp.net"}')).toBe('Evolution sendText failed: 400 {"number":"[número]@s.whatsapp.net"}');
    expect(semTelefone('(#131047) Re-engagement')).toBe('(#131047) Re-engagement');
  });
  it('{{1}} do modelo aceita só nome de gente (nada de link ou número)', () => {
    expect(parametroNome('Ana https://x.co/1')).toBe('Ana https x.co');
    expect(parametroNome("D'Ávila-Souza 123")).toBe("D'Ávila-Souza");
  });
  it('conversa PESSOAL de outra pessoa nunca entra no chat de quem está vendo', async () => {
    const linhas = [
      { id: 'a', company_id: CASA, lead_id: LEAD, direcao: 'saida', autor: 'humano', texto: 'da empresa', visivel_so_para: null, criado_em: '2026-09-28T10:00:00Z', status: 'enviada' },
      { id: 'b', company_id: CASA, lead_id: LEAD, direcao: 'entrada', autor: 'cliente', texto: 'pessoal do Junior', visivel_so_para: 'u-junior', criado_em: '2026-09-28T11:00:00Z', status: 'recebida' },
    ];
    const b = bancoMemoria({ mensagens_whatsapp: linhas });
    expect((await mensagensDoPainel(b.client, CASA, LEAD, 'u-bia', 500, b.client)).map((l) => l.id)).toEqual(['a']);
    expect((await mensagensDoPainel(b.client, CASA, LEAD, 'u-junior', 500, b.client)).map((l) => l.id)).toEqual(['a', 'b']);
    // sem o client de serviço, nem o dono lê linha pessoal (a RLS da 138 também esconde)
    expect((await mensagensDoPainel(b.client, CASA, LEAD, 'u-junior')).map((l) => l.id)).toEqual(['a']);
  });
  it('RLS da 138: isolamento por empresa + linha pessoal só pro dono (restritiva)', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '138_mensagens_whatsapp.sql'), 'utf-8');
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/CREATE POLICY so_o_dono_ve_pessoal ON public\.mensagens_whatsapp\s+AS RESTRICTIVE/);
  });
});

describe('tela', () => {
  it('quem pediu para parar não fica em "aguardando resposta"', () => {
    const leads = [{ id: 'L1', name: 'Ana', phone: '5561999990001', status: 'perdido', city: null, eva_active: false, opt_out: true, claimed_by: null }];
    const l = montarLista([{ lead_id: 'L1', messages: [{ role: 'user', content: 'para', timestamp: 't' }] }], leads, {}, 'u');
    expect(l.itens[0].aguardandoResposta).toBe(false);
    expect(l.contagem.aguardando).toBe(0);
  });
  it('envio que ficou "enviando" há mais de 5 min aparece como não confirmado', () => {
    const velho = new Date(Date.now() - 10 * 60_000).toISOString();
    const m = linhaDoPainelParaChat({ id: 'x', company_id: CASA, lead_id: LEAD, direcao: 'saida', autor: 'humano', texto: 'oi', status: 'enviando', criado_em: velho, enviada_em: null } as any);
    expect(m!.status).toBe('sem_confirmacao');
  });
});
