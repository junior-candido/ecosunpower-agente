// Histórico do WhatsApp pessoal — o que as 3 revisões (correção; LGPD e
// multi-tenant; desempenho) pediram, cada item com a sua prova.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarImportadorHistorico, receberHistoricoNoWebhook, MAX_FILA } from '../src/modules/numero-pessoal-historico.js';
import { criarResolverNumeroPessoal, receberNoNumeroPessoal, horaDaMensagem, definirNumerosInternos, limparCacheInternos } from '../src/modules/numero-pessoal.js';
import { linhasPessoaisDaLista, listarConversas } from '../src/modules/dashboard/conversas-queries.js';
import { criarRotasNumeroPessoal } from '../src/modules/dashboard/numero-pessoal-rotas.js';
import { bancoMemoria } from './helpers/supabase-memoria.js';
import { USER_CASA } from './fixtures/miolo-leads.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const agora = Date.parse('2026-09-28T17:00:00Z');
const NP = { id: 'np1', company_id: CASA, dono_user_id: 'u-junior', dono_nome: 'Junior', instancia: 'pessoal-junior', numero: '5561998805002', ativo: true };
let n = 0;
const msg = (o: { jid?: string; id?: string; dias?: number } = {}) => ({
  key: { remoteJid: o.jid ?? '5561999990001@s.whatsapp.net', fromMe: false, id: o.id ?? `R${++n}` },
  pushName: 'Ana', message: { conversation: 'oi' }, messageTimestamp: Math.floor((agora - (o.dias ?? 1) * 86_400_000) / 1000),
});

beforeEach(() => { limparCacheInternos(); definirNumerosInternos(['5561993077140', '5561998805002']); });

describe('desempenho — fila enxuta', () => {
  it('evento ENORME não estoura (nada de push(...spread)) e a fila tem teto', () => {
    const b = bancoMemoria({ mensagens_whatsapp: [], leads: [], contatos_internos: [] });
    const imp = criarImportadorHistorico({ client: b.client, agora: () => agora, pausa: () => new Promise(() => {}) });
    const grande = Array.from({ length: MAX_FILA + 20_000 }, (_, i) => msg({ id: `G${i}` }));
    let aceitas = 0;
    expect(() => { aceitas = imp.enfileirar(NP, grande); }).not.toThrow();
    expect(aceitas).toBe(MAX_FILA);
    const p = imp.progresso('pessoal-junior')!;
    expect(p.recebidas).toBe(MAX_FILA + 20_000);
    expect(p.ignoradas).toBe(20_000);
    imp.cancelar('pessoal-junior');
    expect(imp.progresso('pessoal-junior')!.naFila).toBe(0);
  });

  it('o que fica na fila é a linha enxuta (sem a mensagem crua / miniatura da mídia)', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: [], leads: [], contatos_internos: [] });
    const imp = criarImportadorHistorico({ client: b.client, agora: () => agora, pausa: async () => {} });
    const comMiniatura = { ...msg({ id: 'IMG1' }), message: { imageMessage: { url: 'https://mmg/x', caption: 'telhado', jpegThumbnail: 'A'.repeat(20_000) } } };
    imp.enfileirar(NP, [comMiniatura]);
    await imp.esperar();
    const l = b.tabelas.mensagens_whatsapp[0];
    expect(l.texto).toBe('[imagem] telhado');
    expect(JSON.stringify(l)).not.toContain('AAAA');
  });

  it('desligou o número: a fila é jogada fora e nada mais é gravado', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: [], leads: [], contatos_internos: [] });
    let soltar!: () => void;
    const imp = criarImportadorHistorico({ client: b.client, agora: () => agora, lote: 1, pausa: () => new Promise<void>((ok) => { soltar = ok; }) });
    imp.enfileirar(NP, [msg({ id: 'C1' }), msg({ id: 'C2' }), msg({ id: 'C3' })]);
    await new Promise((r) => setTimeout(r, 0));
    imp.cancelar('pessoal-junior');
    soltar();
    await imp.esperar();
    expect(b.tabelas.mensagens_whatsapp.map((x) => x.wamid)).toEqual(['C1']);
  });

  it('busca no servidor usa a MESMA fila (um gravador só) e o `.in()` de ids vai em pedaços de 100', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: [], leads: [], contatos_internos: [] });
    const imp = criarImportadorHistorico({ client: b.client, agora: () => agora, pausa: async () => {} });
    const selects: number[] = [];
    const inOriginal = b.client.from;
    b.client.from = (t: string) => {
      const q = inOriginal(t);
      const inFn = q.in;
      q.in = (c: string, vs: unknown[]) => { if (c === 'wamid') selects.push(vs.length); return inFn(c, vs); };
      return q;
    };
    const pagina = Array.from({ length: 250 }, (_, i) => msg({ id: `S${i}` }));
    const f = vi.fn(async () => new Response(JSON.stringify({ messages: { pages: 1, records: pagina } }), { status: 200 }));
    await imp.puxarDoServidor(NP, { baseUrl: 'https://evo.exemplo', apiKey: 'k', fetchImpl: f as any }, 250);
    expect(b.tabelas.mensagens_whatsapp).toHaveLength(250);
    expect(Math.max(...selects)).toBeLessThanOrEqual(100);
  });
});

describe('LGPD / multi-tenant', () => {
  it('histórico vindo da instância da EVA nunca entra na caixa pessoal (mesmo com nome parecido)', async () => {
    const importador = { enfileirar: vi.fn(() => 1) };
    const r = await receberHistoricoNoWebhook({ body: { event: 'messages.set', instance: 'Eva-Principal', data: [msg()] }, porInstancia: async () => NP, companyDaInstancia: async () => undefined, importador, instanciaDaEva: 'eva-principal' });
    expect(r.status).toBe('historico_ignorado');
    expect(importador.enfileirar).not.toHaveBeenCalled();
  });

  it('"_" no nome da instância não vira curinga do ILIKE', async () => {
    const b = bancoMemoria({ whatsapp_numeros_pessoais: [{ ...NP, instancia: 'pessoal_x' }] });
    const chamadas: string[] = [];
    const from = b.client.from;
    b.client.from = (t: string) => { const q = from(t); const il = q.ilike; q.ilike = (c: string, v: string) => { chamadas.push(v); return il(c, v); }; return q; };
    await criarResolverNumeroPessoal(b.client).porInstancia('pessoal_x');
    expect(chamadas[0]).toBe('pessoal\\_x');
  });

  it('Desligar do painel cancela o histórico na fila', async () => {
    const b = bancoMemoria({ whatsapp_numeros_pessoais: [NP], audit_log: [] });
    const historico = { progresso: vi.fn(() => null), puxarDoServidor: vi.fn(), recomecar: vi.fn(), cancelar: vi.fn() };
    const rotas = criarRotasNumeroPessoal({ supabase: b.client, instanciaDaEva: 'eva', historico });
    const res: any = { redirect: vi.fn(), status: () => res, send: () => res };
    await rotas.desligar({ headers: {}, body: {}, query: {}, dashUser: { id: 'u-junior', companyId: CASA, nome: 'Junior', isAdmin: true, permissoes: {} } } as any, res);
    expect(historico.cancelar).toHaveBeenCalledWith('pessoal-junior');
  });

  it('lista: o próprio número do dono ("mensagem para mim") some; RPC devolvendo linha de outra empresa/dono é descartada', async () => {
    const linha = (tel: string, extra: Record<string, unknown> = {}) => ({ id: tel, company_id: CASA, lead_id: null, contato_telefone: tel, contato_nome: null, direcao: 'entrada', autor: 'cliente', canal: 'whatsapp_business', numero: 'pessoal-junior', tipo: 'texto', texto: 'oi', status: 'recebida', visivel_so_para: USER_CASA.id, criado_em: new Date().toISOString(), ...extra });
    const b = bancoMemoria({
      conversations: [], leads: [], contatos_internos: [],
      whatsapp_numeros_pessoais: [{ ...NP, dono_user_id: USER_CASA.id, numero: '5561977770000' }],
    });
    const rpc = vi.fn(async () => ({ data: [linha('5561977770000'), linha('5562955554444'), linha('5563911112222', { visivel_so_para: 'u-outro' })], error: null }));
    b.client.rpc = rpc;
    const lista = await listarConversas(b.client, USER_CASA as any, {}, b.client);
    expect(rpc).toHaveBeenCalledWith('conversas_pessoais_recentes', { p_company: CASA, p_dono: USER_CASA.id, p_limite: 400 });
    expect(lista.itens.map((i) => i.telefone)).toEqual(['5562955554444']);
  });

  it('sem a migration 140 (RPC ausente): cai no modo antigo', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: [{ id: 'x', company_id: CASA, visivel_so_para: 'u', contato_telefone: '5562955554444', direcao: 'entrada', texto: 'oi', criado_em: '2026-09-01' }] });
    b.client.rpc = async () => ({ data: null, error: { message: 'function conversas_pessoais_recentes does not exist', code: 'PGRST202' } });
    expect((await linhasPessoaisDaLista(b.client, CASA, 'u')).map((r) => r.id)).toEqual(['x']);
  });
});

describe('correção — ordem das mensagens no tempo real', () => {
  it('horaDaMensagem: usa a hora da mensagem; futuro/ inválida → a do banco', () => {
    expect(horaDaMensagem(new Date('2026-08-01T10:00:00Z'), agora)).toBe('2026-08-01T10:00:00.000Z');
    expect(horaDaMensagem(new Date(agora + 3_600_000), agora)).toBeNull();
    expect(horaDaMensagem(new Date('x'), agora)).toBeNull();
  });
  it('mensagem antiga reentregue ao reconectar grava com a data ORIGINAL', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: [], leads: [], contatos_internos: [] });
    await receberNoNumeroPessoal(b.client, NP, { type: 'text', from: '5562955554444', content: 'oi de agosto', timestamp: new Date('2026-08-01T10:00:00Z'), messageId: 'OLD1', fromMe: false }, agora);
    expect(b.tabelas.mensagens_whatsapp[0].criado_em).toBe('2026-08-01T10:00:00.000Z');
  });
});
