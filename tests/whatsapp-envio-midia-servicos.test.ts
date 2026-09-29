// W1 — envio de mídia pelos dois canais (dublê do fetch: nada sai de verdade).
//  - Meta (número da Eva): upload → media_id → mensagem com o id (docs Cloud API /media).
//  - Evolution (número pessoal / assistente de tenant): sendMedia em base64 e
//    sendWhatsAppAudio (áudio vira mensagem de voz).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MetaWhatsAppService } from '../src/modules/meta-whatsapp.js';
import { EvolutionService, lerMensagemEvolution } from '../src/modules/evolution.js';
import { comCanal } from '../src/modules/canal-contexto.js';

afterEach(() => vi.unstubAllGlobals());
const cfgMeta = { metaWabaPhoneNumberId: '123', metaWabaAccessToken: 'tok', metaWabaBusinessAccountId: 'biz', metaAppSecret: 'sec', metaWabaVerifyToken: 'vt' } as any;
const cfgEvo = { evolutionApiUrl: 'http://evo:8080', evolutionApiKey: 'k', evolutionInstance: 'eva', webhookToken: 't' };

describe('Meta: sendMediaById', () => {
  it('foto com legenda, documento com nome, áudio sem legenda (a Meta não aceita legenda em áudio)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'wamid.M1' }] }) });
    vi.stubGlobal('fetch', fetchMock);
    const s = new MetaWhatsAppService(cfgMeta);
    expect(await s.sendMediaById('5561999990001', 'image', 'MID1', { caption: 'telhado' })).toEqual({ messageId: 'wamid.M1' });
    await s.sendMediaById('5561999990001', 'document', 'MID2', { caption: 'segue', filename: 'proposta.pdf' });
    await s.sendMediaById('5561999990001', 'audio', 'MID3', { caption: 'ignorada' });
    const corpos = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(corpos[0]).toEqual({ messaging_product: 'whatsapp', to: '5561999990001', type: 'image', image: { id: 'MID1', caption: 'telhado' } });
    expect(corpos[1]).toEqual({ messaging_product: 'whatsapp', to: '5561999990001', type: 'document', document: { id: 'MID2', caption: 'segue', filename: 'proposta.pdf' } });
    expect(corpos[2]).toEqual({ messaging_product: 'whatsapp', to: '5561999990001', type: 'audio', audio: { id: 'MID3' } });
    expect(fetchMock.mock.calls[0][0]).toBe('https://graph.facebook.com/v21.0/123/messages');
  });

  it('documento recebido: o nome do arquivo vem junto', () => {
    const s = new MetaWhatsAppService(cfgMeta);
    const m = s.parseWebhook({ entry: [{ changes: [{ field: 'messages', value: { messages: [{ from: '5561999990001', id: 'w1', timestamp: '1', type: 'document', document: { id: 'D1', mime_type: 'application/pdf', filename: 'conta.pdf' } }] } }] }] });
    expect(m).toMatchObject({ type: 'document', content: 'D1', mimeType: 'application/pdf', nomeArquivo: 'conta.pdf' });
  });
});

describe('Evolution: mídia em base64 pela instância em contexto', () => {
  it('sendMediaBase64: foto/vídeo/documento com mimetype, nome e legenda', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ key: { id: 'E1' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const s = new EvolutionService(cfgEvo);
    const r = await comCanal({ companyId: 'C', evolutionInstance: 'pessoal-abc' },
      () => s.sendMediaBase64('5561999990001', { mediatype: 'image', mimetype: 'image/jpeg', base64: '/9j/', fileName: 'foto.jpg', caption: 'olha' }));
    expect(r).toEqual({ messageId: 'E1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://evo:8080/message/sendMedia/pessoal-abc');
    expect(JSON.parse(init.body)).toEqual({ number: '5561999990001', mediatype: 'image', mimetype: 'image/jpeg', media: '/9j/', fileName: 'foto.jpg', caption: 'olha' });
  });

  it('sendWhatsAppAudio: áudio como mensagem de voz', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ key: { id: 'E2' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const s = new EvolutionService(cfgEvo);
    expect(await s.sendWhatsAppAudio('5561999990001', 'T2dnUw==')).toEqual({ messageId: 'E2' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://evo:8080/message/sendWhatsAppAudio/eva');
    expect(JSON.parse(init.body)).toEqual({ number: '5561999990001', audio: 'T2dnUw==' });
  });

  it('erro da Evolution vira exceção (nunca some)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 413, text: async () => 'grande' }));
    const s = new EvolutionService(cfgEvo);
    await expect(s.sendWhatsAppAudio('5561999990001', 'x')).rejects.toThrow(/sendWhatsAppAudio 413/);
  });

  it('documento recebido pela Evolution: mimetype e nome do arquivo', () => {
    const m = lerMensagemEvolution({ key: { remoteJid: '5561999990001@s.whatsapp.net', id: 'X1' }, messageTimestamp: 1, message: { documentMessage: { mimetype: 'application/pdf', fileName: 'conta.pdf', caption: 'minha conta' } } });
    expect(m).toMatchObject({ type: 'document', mimeType: 'application/pdf', nomeArquivo: 'conta.pdf', caption: 'minha conta' });
    const img = lerMensagemEvolution({ key: { remoteJid: '5561999990001@s.whatsapp.net', id: 'X2' }, messageTimestamp: 1, message: { imageMessage: { mimetype: 'image/jpeg', caption: 'telhado' } } });
    expect(img).toMatchObject({ type: 'image', mimeType: 'image/jpeg', caption: 'telhado' });
  });
});
