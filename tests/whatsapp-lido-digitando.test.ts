// W3 — ✓ enviada / ✓✓ entregue / ✓✓ azul lida (Meta statuses; Evolution
// messages.update), "digitando…" (Evolution presence.update) e marcar como
// lida ao abrir a conversa (só número pessoal, respeitando a opção do dono).
// Banco em memória e dublês: nada sai de verdade.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  statusAvanca, statusDaMeta, statusDaEvolution, lerStatusEvolution, aplicarStatus,
  marcarPresenca, estaDigitando, limparDigitando, lerPresencaEvolution,
} from '../src/modules/status-whatsapp.js';
import { marcarLidasAoAbrir } from '../src/modules/status-whatsapp.js';
import { MetaWhatsAppService } from '../src/modules/meta-whatsapp.js';
import { EvolutionService } from '../src/modules/evolution.js';
import { blocoMensagens } from '../src/modules/dashboard/atendimento-views.js';
import { linhaDoPainelParaChat, type MensagemChat } from '../src/modules/dashboard/conversas-queries.js';
import { bancoMemoria } from './helpers/supabase-memoria.js';

afterEach(() => { vi.unstubAllGlobals(); limparDigitando(); });
const CASA = '00000000-0000-0000-0000-000000000001';

describe('status só anda para frente', () => {
  it('enviada → entregue → lida; nunca volta; falhou só antes de entregar', () => {
    expect(statusAvanca('enviada', 'entregue')).toBe(true);
    expect(statusAvanca('entregue', 'lida')).toBe(true);
    expect(statusAvanca('lida', 'entregue')).toBe(false);
    expect(statusAvanca('enviando', 'lida')).toBe(true);
    expect(statusAvanca('enviada', 'falhou')).toBe(true);
    expect(statusAvanca('entregue', 'falhou')).toBe(false);
    expect(statusAvanca('recebida', 'lida')).toBe(false);
  });
  it('tradução Meta / Evolution (texto e número do Baileys)', () => {
    expect([statusDaMeta('sent'), statusDaMeta('delivered'), statusDaMeta('read'), statusDaMeta('failed'), statusDaMeta('x')]).toEqual(['enviada', 'entregue', 'lida', 'falhou', null]);
    expect([statusDaEvolution('SERVER_ACK'), statusDaEvolution('DELIVERY_ACK'), statusDaEvolution('READ'), statusDaEvolution('PLAYED'), statusDaEvolution(3), statusDaEvolution('PENDING')]).toEqual(['enviada', 'entregue', 'lida', 'lida', 'entregue', null]);
  });
  it('messages.update da Evolution (objeto ou lista; keyId ou key.id)', () => {
    expect(lerStatusEvolution({ event: 'messages.update', data: { keyId: 'K1', remoteJid: '5561@s.whatsapp.net', fromMe: true, status: 'READ' } })).toMatchObject([{ wamid: 'K1', status: 'lida', fromMe: true }]);
    expect(lerStatusEvolution({ event: 'messages.update', data: [{ key: { id: 'K2', fromMe: true }, update: { status: 3 } }] })).toMatchObject([{ wamid: 'K2', status: 'entregue' }]);
    expect(lerStatusEvolution({ event: 'messages.upsert', data: { keyId: 'K3', status: 'READ' } })).toEqual([]);
  });
});

describe('aplicarStatus', () => {
  const b0 = () => bancoMemoria({ mensagens_whatsapp: [
    { id: 'm1', company_id: CASA, wamid: 'wamid.1', direcao: 'saida', status: 'enviada' },
    { id: 'm2', company_id: CASA, wamid: 'wamid.2', direcao: 'entrada', status: 'recebida' },
    { id: 'm3', company_id: 'outra', wamid: 'wamid.3', direcao: 'saida', status: 'enviada' },
  ] });
  it('marca entregue e depois lida (com a hora); fora de ordem não volta', async () => {
    const b = b0();
    expect(await aplicarStatus(b.client, CASA, { wamid: 'wamid.1', status: 'lida', em: new Date('2026-09-28T15:00:00Z') })).toBe(true);
    expect(await aplicarStatus(b.client, CASA, { wamid: 'wamid.1', status: 'entregue', em: new Date() })).toBe(false);
    expect(b.tabelas.mensagens_whatsapp[0]).toMatchObject({ status: 'lida', lida_em: '2026-09-28T15:00:00.000Z' });
  });
  it('mensagem recebida ou de outra empresa: não mexe', async () => {
    const b = b0();
    expect(await aplicarStatus(b.client, CASA, { wamid: 'wamid.2', status: 'lida', em: new Date() })).toBe(false);
    expect(await aplicarStatus(b.client, CASA, { wamid: 'wamid.3', status: 'lida', em: new Date() })).toBe(false);
    expect(b.tabelas.mensagens_whatsapp[2].status).toBe('enviada');
  });
  it('falhou depois de enviada: guarda o motivo sem o telefone', async () => {
    const b = b0();
    await aplicarStatus(b.client, CASA, { wamid: 'wamid.1', status: 'falhou', em: new Date(), erro: 'Re-engagement message to 5561999990001' });
    expect(b.tabelas.mensagens_whatsapp[0].status).toBe('falhou');
    expect(String(b.tabelas.mensagens_whatsapp[0].erro)).not.toContain('5561999990001');
  });
});

describe('Meta: status traz o número que enviou (empresa certa)', () => {
  it('parseStatusUpdates inclui phone_number_id', () => {
    const s = new MetaWhatsAppService({ metaWabaPhoneNumberId: '123', metaWabaAccessToken: 't', metaWabaBusinessAccountId: 'b', metaAppSecret: 's', metaWabaVerifyToken: 'v' } as any);
    const r = s.parseStatusUpdates({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '999' }, statuses: [{ id: 'wamid.1', status: 'read', timestamp: '1759071600', recipient_id: '5561999990001' }] } }] }] });
    expect(r[0]).toMatchObject({ messageId: 'wamid.1', status: 'read', phoneNumberId: '999' });
  });
});

describe('digitando…', () => {
  it('composing aparece por alguns segundos; paused apaga; só na conversa certa (empresa + dono)', () => {
    const t0 = Date.now();
    marcarPresenca(CASA, 'u-junior', '5561999990001', 'composing', t0);
    expect(estaDigitando(CASA, 'u-junior', ['5561999990001'], t0 + 3000)).toBe('digitando');
    expect(estaDigitando(CASA, 'u-outro', ['5561999990001'], t0 + 3000)).toBeNull();
    expect(estaDigitando(CASA, 'u-junior', ['5561999990001'], t0 + 20_000)).toBeNull();
    marcarPresenca(CASA, 'u-junior', '5561999990001', 'recording', t0);
    expect(estaDigitando(CASA, 'u-junior', ['5561999990001'], t0 + 1000)).toBe('gravando');
    marcarPresenca(CASA, 'u-junior', '5561999990001', 'paused', t0 + 1500);
    expect(estaDigitando(CASA, 'u-junior', ['5561999990001'], t0 + 2000)).toBeNull();
  });
  it('presence.update: lê os jids (sem grupo)', () => {
    expect(lerPresencaEvolution({ event: 'presence.update', data: { id: 'x', presences: { '556199990001@s.whatsapp.net': { lastKnownPresence: 'composing' }, '1203@g.us': { lastKnownPresence: 'composing' } } } }))
      .toEqual([{ jid: '556199990001@s.whatsapp.net', presenca: 'composing' }]);
  });
  it('no chat: "digitando…" no fim da conversa', () => {
    const h = blocoMensagens([{ role: 'user', content: 'oi', timestamp: '2026-09-28T15:00:00Z' }], 'Eva', 'Ana', false, null, false, false, 'digitando');
    expect(h).toContain('cc-at-digitando');
    expect(h).toContain('digitando…');
  });
});

describe('risquinhos no balão da equipe', () => {
  const msg = (status: string): MensagemChat => ({ role: 'assistant', content: 'Oi', timestamp: '2026-09-28T15:00:00Z', autor: 'humano', autorNome: 'Junior', status, origem: 'painel' });
  it('✓ enviada · ✓✓ entregue · ✓✓ azul lida', () => {
    expect(blocoMensagens([msg('enviada')], 'Eva', 'Ana', false, null)).toMatch(/cc-at-tick[^"]*"[^>]*>✓</);
    expect(blocoMensagens([msg('entregue')], 'Eva', 'Ana', false, null)).toContain('>✓✓<');
    const lida = blocoMensagens([msg('lida')], 'Eva', 'Ana', false, null);
    expect(lida).toContain('cc-at-tick-lida');
    expect(lida).toContain('title="Lida"');
  });
  it('linha do painel com status entregue/lida vira status do chat', () => {
    const m = linhaDoPainelParaChat({ id: 'a', company_id: CASA, lead_id: 'L', contato_telefone: '1', contato_nome: null, direcao: 'saida', autor: 'humano', user_id: 'u', autor_nome: 'J', canal: 'eva_oficial', numero: null, tipo: 'texto', texto: 'oi', modelo: null, evento: null, origem: 'painel', wamid: 'w', status: 'lida', erro: null, visivel_so_para: null, criado_em: '2026-09-28T15:00:00Z', enviada_em: '2026-09-28T15:00:00Z' } as any);
    expect(m?.status).toBe('lida');
  });
});

describe('marcar como lida ao abrir (número pessoal, respeitando a opção)', () => {
  const NP = { id: 'np1', company_id: CASA, dono_user_id: 'u-junior', dono_nome: 'Junior', instancia: 'pessoal-j', numero: '5561998805002', ativo: true, marcar_lida_ao_abrir: true };
  const linhas = () => [
    { id: 'e1', company_id: CASA, lead_id: 'L1', contato_telefone: '5561999990001', direcao: 'entrada', canal: 'whatsapp_business', visivel_so_para: 'u-junior', wamid: 'W1', lida_em: null, criado_em: new Date().toISOString() },
    { id: 'e2', company_id: CASA, lead_id: 'L1', contato_telefone: '5561999990001', direcao: 'entrada', canal: 'whatsapp_business', visivel_so_para: 'u-junior', wamid: 'W2', lida_em: '2026-09-28T10:00:00Z', criado_em: new Date().toISOString() },
    { id: 'e3', company_id: CASA, lead_id: 'L1', contato_telefone: '5561999990001', direcao: 'entrada', canal: 'eva_oficial', visivel_so_para: null, wamid: 'W3', lida_em: null, criado_em: new Date().toISOString() },
  ];
  it('manda ler só as não lidas do número pessoal e marca lida_em', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: linhas() });
    const ler = vi.fn(async () => {});
    expect(await marcarLidasAoAbrir(b.client, { np: NP, viewerId: 'u-junior', leadId: 'L1', telefone: '5561999990001' }, ler)).toBe(1);
    expect(ler).toHaveBeenCalledWith('pessoal-j', CASA, '5561999990001', ['W1']);
    expect(b.tabelas.mensagens_whatsapp[0].lida_em).toBeTruthy();
    expect(b.tabelas.mensagens_whatsapp[2].lida_em).toBeNull();
  });
  it('opção desligada, ou quem abre não é o dono: nada', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: linhas() });
    const ler = vi.fn(async () => {});
    expect(await marcarLidasAoAbrir(b.client, { np: { ...NP, marcar_lida_ao_abrir: false }, viewerId: 'u-junior', leadId: 'L1', telefone: '5561999990001' }, ler)).toBe(0);
    expect(await marcarLidasAoAbrir(b.client, { np: NP, viewerId: 'u-outro', leadId: 'L1', telefone: '5561999990001' }, ler)).toBe(0);
    expect(ler).not.toHaveBeenCalled();
  });
  it('WhatsApp não aceitou: não marca como lida no painel', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: linhas() });
    await marcarLidasAoAbrir(b.client, { np: NP, viewerId: 'u-junior', leadId: 'L1', telefone: '5561999990001' }, async () => { throw new Error('caiu'); });
    expect(b.tabelas.mensagens_whatsapp[0].lida_em).toBeNull();
  });
});

describe('Evolution: marcar como lida', () => {
  it('markMessageAsRead com o JID certo', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ([{ exists: true, jid: '556199990001@s.whatsapp.net' }]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ read: 'success' }) });
    vi.stubGlobal('fetch', fetchMock);
    const s = new EvolutionService({ evolutionApiUrl: 'http://evo:8080', evolutionApiKey: 'k', evolutionInstance: 'eva', webhookToken: 't' });
    await s.marcarComoLidas('5561999990001', ['W1', 'W2']);
    expect(fetchMock.mock.calls[1][0]).toBe('http://evo:8080/chat/markMessageAsRead/eva');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ readMessages: [
      { remoteJid: '556199990001@s.whatsapp.net', fromMe: false, id: 'W1' },
      { remoteJid: '556199990001@s.whatsapp.net', fromMe: false, id: 'W2' },
    ] });
  });
});

describe('tela "Meu WhatsApp": ligar/desligar a confirmação de leitura (só o dono)', async () => {
  const { criarRotasNumeroPessoal } = await import('../src/modules/dashboard/numero-pessoal-rotas.js');
  const { cartaoLeitura } = await import('../src/modules/dashboard/whatsapp-pessoal-views.js');
  const junior = { id: 'u-junior', companyId: CASA, nome: 'Junior', isAdmin: true, permissoes: {} };
  const NP = { id: 'np1', company_id: CASA, dono_user_id: 'u-junior', dono_nome: 'Junior', instancia: 'pessoal-j', numero: null, ativo: true, marcar_lida_ao_abrir: true };
  const res = () => { const r: any = { statusCode: 200, destino: '' }; r.status = (c: number) => { r.statusCode = c; return r; }; r.send = () => r; r.redirect = (a: any, b?: any) => { r.destino = typeof a === 'string' ? a : b; return r; }; return r; };
  it('desliga, reaponta os avisos da instância (✓✓ e digitando) e registra quem mudou', async () => {
    const b = bancoMemoria({ whatsapp_numeros_pessoais: [{ ...NP }], audit_log: [] });
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const rotas = criarRotasNumeroPessoal({ supabase: b.client, evolution: { baseUrl: 'https://evo.exemplo', apiKey: 'k', fetchImpl: f as any }, instanciaDaEva: 'eva', webhookUrl: 'https://painel/webhook', webhookToken: 'tok' });
    const r = res();
    await rotas.leitura({ body: { marcar: '0' }, headers: {}, dashUser: junior, query: {} } as any, r);
    expect(r.destino).toBe('/dashboard/whatsapp/pessoal?ok=leitura_desligada');
    expect(b.tabelas.whatsapp_numeros_pessoais[0].marcar_lida_ao_abrir).toBe(false);
    const wh = JSON.parse((f.mock.calls[0] as any)[1].body).webhook;
    expect(wh.events).toContain('MESSAGES_UPDATE');
    expect(wh.events).toContain('PRESENCE_UPDATE');
  });
  it('outra empresa: 404', async () => {
    const b = bancoMemoria({ whatsapp_numeros_pessoais: [{ ...NP }] });
    const rotas = criarRotasNumeroPessoal({ supabase: b.client, instanciaDaEva: 'eva' });
    const r = res();
    await rotas.leitura({ body: { marcar: '0' }, headers: {}, dashUser: { ...junior, companyId: 'aaaa1111-2222-3333-4444-555566667777' }, query: {} } as any, r);
    expect(r.statusCode).toBe(404);
    expect(b.tabelas.whatsapp_numeros_pessoais[0].marcar_lida_ao_abrir).toBe(true);
  });
  it('cartão diz o estado e oferece o contrário', () => {
    expect(cartaoLeitura(true)).toContain('name="marcar" value="0"');
    expect(cartaoLeitura(false)).toContain('name="marcar" value="1"');
  });
});

describe('conversa aberta: "digitando…" só para quem pode ver', async () => {
  const { criarRotasAtendimento } = await import('../src/modules/dashboard/atendimento-rotas.js');
  const LEAD = '11111111-1111-1111-1111-111111111111';
  const NP = { id: 'np1', company_id: CASA, dono_user_id: 'u-junior', dono_nome: 'Junior', instancia: 'pessoal-j', numero: null, ativo: true };
  function montar() {
    const b = bancoMemoria({ leads: [{ id: LEAD, company_id: CASA, name: 'Ana', phone: '5561999990001', eva_active: true, opt_out: false, claimed_by: null }], conversations: [], mensagens_whatsapp: [], lead_anexos: [] });
    const marcarLidasEvolution = vi.fn(async () => {});
    const rotas = criarRotasAtendimento({ supabase: b.client, banco: () => b.client, waba: null, instanciaDaEmpresa: async () => null, engineerPhone: '', enviarPessoal: vi.fn(async () => ({})), numeroPessoal: async (_c, u) => (u === 'u-junior' ? NP as any : null), marcarLidasEvolution });
    return { rotas, marcarLidasEvolution };
  }
  const pedir = (u: any) => ({ params: { id: LEAD }, query: {}, dashUser: u, headers: {} }) as any;
  const res = () => { const r: any = { statusCode: 200 }; r.status = (c: number) => { r.statusCode = c; return r; }; r.json = (x: any) => { r.corpo = x; return r; }; r.setHeader = () => {}; return r; };
  it('o dono vê "digitando…" do contato no número pessoal; outra pessoa da empresa não', async () => {
    const { rotas } = montar();
    marcarPresenca(CASA, 'u-junior', '5561999990001', 'composing');
    const r1 = res();
    await rotas.conversaJson(pedir({ id: 'u-junior', companyId: CASA, nome: 'J', isAdmin: true, permissoes: {} }), r1);
    expect(r1.corpo.msgs).toContain('está digitando…');
    const r2 = res();
    await rotas.conversaJson(pedir({ id: 'u-bia', companyId: CASA, nome: 'B', isAdmin: true, permissoes: {} }), r2);
    expect(r2.corpo.msgs).not.toContain('digitando');
  });
});
