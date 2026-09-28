// W2 — responder CITANDO e REAGIR com emoji (Meta Cloud API: context /
// type=reaction; Evolution: quoted / sendReaction / reactionMessage).
// Dublês do fetch e banco em memória: nada sai de verdade.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MetaWhatsAppService } from '../src/modules/meta-whatsapp.js';
import { EvolutionService, lerMensagemEvolution, lerReacaoEvolution } from '../src/modules/evolution.js';
import { gravarReacao, EMOJIS_REACAO, emojiDeReacaoValido, anexarReacoesECitacoes } from '../src/modules/reacoes-citacoes.js';
import { linhaDoPainelParaChat, juntarComPainel, type MensagemChat } from '../src/modules/dashboard/conversas-queries.js';
import type { LinhaMensagemWhatsapp } from '../src/modules/mensagens-whatsapp.js';
import { bancoMemoria } from './helpers/supabase-memoria.js';

afterEach(() => vi.unstubAllGlobals());
const CASA = '00000000-0000-0000-0000-000000000001';
const cfgMeta = { metaWabaPhoneNumberId: '123', metaWabaAccessToken: 'tok', metaWabaBusinessAccountId: 'biz', metaAppSecret: 'sec', metaWabaVerifyToken: 'vt' } as any;
const cfgEvo = { evolutionApiUrl: 'http://evo:8080', evolutionApiKey: 'k', evolutionInstance: 'eva', webhookToken: 't' };
const wabaMsg = (m: Record<string, unknown>) => ({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '999' }, messages: [{ from: '5561999990001', id: 'wamid.X', timestamp: '1759071600', ...m }] } }] }] });

describe('Meta: citação e reação recebidas', () => {
  it('mensagem que responde outra traz o id da citada', () => {
    const s = new MetaWhatsAppService(cfgMeta);
    expect(s.parseWebhook(wabaMsg({ type: 'text', text: { body: 'Pode ser sábado' }, context: { from: '556130000000', id: 'wamid.ORIG' } }))).toMatchObject({ content: 'Pode ser sábado', citandoId: 'wamid.ORIG' });
  });
  it('reação: sai no parseReacoes (e NÃO vira mensagem para a Eva)', () => {
    const s = new MetaWhatsAppService(cfgMeta);
    const p = wabaMsg({ type: 'reaction', reaction: { message_id: 'wamid.ORIG', emoji: '👍' } });
    expect(s.parseWebhook(p)).toBeNull();
    expect(s.parseReacoes(p)).toEqual([{ from: '5561999990001', wamid: 'wamid.X', alvo: 'wamid.ORIG', emoji: '👍', phoneNumberId: '999', timestamp: new Date(1759071600 * 1000) }]);
    const tirou = wabaMsg({ type: 'reaction', reaction: { message_id: 'wamid.ORIG' } });
    expect(s.parseReacoes(tirou)[0].emoji).toBe('');
  });
});

describe('Meta: enviar resposta citando e reação', () => {
  it('texto com context.message_id; reação com type=reaction', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'wamid.R' }] }) });
    vi.stubGlobal('fetch', fetchMock);
    const s = new MetaWhatsAppService(cfgMeta);
    await s.sendTextReply('5561999990001', 'Pode sim!', 'wamid.ORIG');
    await s.sendReaction('5561999990001', 'wamid.ORIG', '❤️');
    const corpos = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(corpos[0]).toEqual({ messaging_product: 'whatsapp', to: '5561999990001', type: 'text', text: { body: 'Pode sim!', preview_url: false }, context: { message_id: 'wamid.ORIG' } });
    expect(corpos[1]).toEqual({ messaging_product: 'whatsapp', recipient_type: 'individual', to: '5561999990001', type: 'reaction', reaction: { message_id: 'wamid.ORIG', emoji: '❤️' } });
  });
});

describe('Evolution: citação e reação', () => {
  const base = { key: { remoteJid: '556199990001@s.whatsapp.net', id: 'E1', fromMe: false }, messageTimestamp: 1759071600 };
  it('texto citando (contextInfo.stanzaId + o texto citado)', () => {
    const m = lerMensagemEvolution({ ...base, message: { extendedTextMessage: { text: 'sim', contextInfo: { stanzaId: 'ORIG', quotedMessage: { conversation: 'Pode ser sábado?' } } } } });
    expect(m).toMatchObject({ type: 'text', content: 'sim', citandoId: 'ORIG', citandoTexto: 'Pode ser sábado?' });
  });
  it('reação recebida: lerReacaoEvolution (e lerMensagemEvolution ignora)', () => {
    const d = { ...base, message: { reactionMessage: { key: { id: 'ORIG', fromMe: true }, text: '😂' } } };
    expect(lerMensagemEvolution(d)).toBeNull();
    expect(lerReacaoEvolution(d)).toMatchObject({ from: '556199990001', fromMe: false, alvo: 'ORIG', emoji: '😂', wamid: 'E1' });
  });
  it('enviar citando (quoted) e reagir (key com o jid do WhatsApp)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ key: { id: 'S1' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ([{ exists: true, jid: '556199990001@s.whatsapp.net', number: '5561999990001' }]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ key: { id: 'R1' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const s = new EvolutionService(cfgEvo);
    await s.sendTextQuoted('5561999990001', 'sim', { id: 'ORIG', texto: 'Pode ser sábado?' });
    await s.sendReactionTo('5561999990001', { id: 'ORIG', fromMe: false }, '👍');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ number: '5561999990001', text: 'sim', quoted: { key: { id: 'ORIG' }, message: { conversation: 'Pode ser sábado?' } } });
    expect(fetchMock.mock.calls[1][0]).toBe('http://evo:8080/chat/whatsappNumbers/eva');
    expect(fetchMock.mock.calls[2][0]).toBe('http://evo:8080/message/sendReaction/eva');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ key: { remoteJid: '556199990001@s.whatsapp.net', fromMe: false, id: 'ORIG' }, reaction: '👍' });
  });
});

describe('gravarReacao — uma por pessoa por mensagem', () => {
  const r = { companyId: CASA, leadId: 'L1', telefone: '5561999990001', alvoWamid: 'wamid.ORIG', canal: 'eva_oficial' as const, numero: null, visivelSoPara: null };
  it('reagir, trocar e tirar', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: [] }, { mensagens_whatsapp: [['company_id', 'wamid']] });
    await gravarReacao(b.client, { ...r, emoji: '👍', de: 'cliente', wamid: 'w1' });
    await gravarReacao(b.client, { ...r, emoji: '❤️', de: 'cliente', wamid: 'w2' });
    expect(b.tabelas.mensagens_whatsapp).toHaveLength(1);
    expect(b.tabelas.mensagens_whatsapp[0]).toMatchObject({ tipo: 'reacao', texto: '❤️', citando_wamid: 'wamid.ORIG', direcao: 'entrada', autor: 'cliente' });
    await gravarReacao(b.client, { ...r, emoji: '👍', de: 'humano', userId: 'u1', autorNome: 'Junior', wamid: 'w3' });
    expect(b.tabelas.mensagens_whatsapp).toHaveLength(2);
    await gravarReacao(b.client, { ...r, emoji: '', de: 'cliente', wamid: 'w4' });
    expect(b.tabelas.mensagens_whatsapp).toHaveLength(1);
    expect(b.tabelas.mensagens_whatsapp[0]).toMatchObject({ autor: 'humano', texto: '👍' });
  });
  it('só emojis da lista (nada de texto disfarçado de reação)', () => {
    expect(EMOJIS_REACAO).toContain('👍');
    expect(emojiDeReacaoValido('👍')).toBe(true);
    expect(emojiDeReacaoValido('')).toBe(true); // tirar
    expect(emojiDeReacaoValido('<script>')).toBe(false);
    expect(emojiDeReacaoValido('👍👍')).toBe(false);
  });
});

describe('no chat: citação dentro do balão e reações embaixo', () => {
  const linha = (o: Partial<LinhaMensagemWhatsapp>): LinhaMensagemWhatsapp => ({
    id: 'x', company_id: CASA, lead_id: 'L1', contato_telefone: '5561999990001', contato_nome: 'Ana', direcao: 'entrada', autor: 'cliente',
    user_id: null, autor_nome: null, canal: 'eva_oficial', numero: null, tipo: 'texto', texto: 'oi', modelo: null, evento: null, origem: 'webhook',
    wamid: null, status: 'recebida', erro: null, visivel_so_para: null, criado_em: '2026-09-28T15:00:00.000Z', enviada_em: null, ...o,
  });
  it('reações vão para a mensagem certa; reação a mensagem fora do painel vira uma linha curta', () => {
    const rows = [
      linha({ id: 'a', wamid: 'wA', texto: 'Pode ser sábado?', direcao: 'saida', autor: 'humano', autor_nome: 'Junior', status: 'enviada' }),
      linha({ id: 'b', wamid: 'wB', texto: 'sim', citando_wamid: 'wA', criado_em: '2026-09-28T15:01:00.000Z' }),
      linha({ id: 'c', wamid: 'wC', tipo: 'reacao', texto: '👍', citando_wamid: 'wA', criado_em: '2026-09-28T15:02:00.000Z' }),
      linha({ id: 'd', wamid: 'wD', tipo: 'reacao', texto: '❤️', citando_wamid: 'wFora', criado_em: '2026-09-28T15:03:00.000Z' }),
    ];
    const msgs = juntarComPainel([], rows, 'eva_oficial');
    expect(msgs).toHaveLength(3);
    expect(msgs[0].reacoes).toEqual([{ emoji: '👍', de: 'cliente', nome: 'Ana' }]);
    expect(msgs[1].citando).toEqual({ wamid: 'wA', texto: 'Pode ser sábado?', autor: 'Junior' });
    expect(msgs[2]).toMatchObject({ role: 'evento', evento: 'reagiu', content: '❤️' });
  });
  it('linha de reação sozinha vira {role: reacao}; mensagem com wamid pode ser citada', () => {
    expect(linhaDoPainelParaChat(linha({ tipo: 'reacao', texto: '👍', citando_wamid: 'w' }))).toMatchObject({ role: 'reacao', content: '👍' });
    expect(linhaDoPainelParaChat(linha({ id: 'k', wamid: 'wK' }))).toMatchObject({ wamid: 'wK', painelId: 'k' });
  });
  it('anexarReacoesECitacoes é pura e aceita lista vazia', () => {
    expect(anexarReacoesECitacoes([])).toEqual([]);
  });
});
