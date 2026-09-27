import { describe, it, expect, vi, afterEach } from 'vitest';
import { EvolutionService } from '../src/modules/evolution.js';
import { comCanal } from '../src/modules/canal-contexto.js';

const cfg = { evolutionApiUrl: 'http://evo:8080', evolutionApiKey: 'k', evolutionInstance: 'eva', webhookToken: 't' };
afterEach(() => vi.unstubAllGlobals());

describe('EvolutionService.sendDocument', () => {
  it('manda o PDF em base64 como documento pela instância do tenant em contexto', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ key: { id: 'doc-1' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const s = new EvolutionService(cfg);
    const r = await comCanal({ companyId: 'T1', evolutionInstance: 'conquista-solar' },
      () => s.sendDocument('5561991718505', 'JVBERg==', 'relatorio.pdf', 'Relatório de agosto de 2026'));
    expect(r.messageId).toBe('doc-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://evo:8080/message/sendMedia/conquista-solar');
    expect(init.headers).toMatchObject({ apikey: 'k' });
    expect(JSON.parse(init.body)).toEqual({
      number: '5561991718505', mediatype: 'document', mimetype: 'application/pdf',
      media: 'JVBERg==', fileName: 'relatorio.pdf', caption: 'Relatório de agosto de 2026',
    });
  });
  it('erro da Evolution vira exceção com o status (nunca some)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad' }));
    const s = new EvolutionService(cfg);
    await expect(s.sendDocument('5561991718505', 'JVBERg==', 'r.pdf', 'x')).rejects.toThrow(/sendDocument 400/);
  });
  it('PDF acima de 10 MB não é enviado: erro claro pdf_grande_demais, sem chamar a Evolution', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const s = new EvolutionService(cfg);
    const grande = Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64');
    await expect(s.sendDocument('5561991718505', grande, 'r.pdf', 'x')).rejects.toThrow(/pdf_grande_demais/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
