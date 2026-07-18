import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailSequenceService } from '../src/modules/email/email-sequence.js';
import { _limparCacheNoticias } from '../src/modules/email/blog-noticias.js';

describe('EmailSequenceService.processSequence', () => {
  beforeEach(() => {
    _limparCacheNoticias();
    // A moldura busca noticias do blog 1x por ciclo (best-effort) — evita bater
    // na rede de verdade durante o teste, simulando o blog indisponivel.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sem rede no teste')));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('envia um step due e marca como enviado', async () => {
    const supa = {
      getDueEmailSteps: vi.fn().mockResolvedValue([
        { id: 'S1', step: 1, leads: { id: 'L1', name: 'Joao', city: 'Bsb', email: 'j@x.com', email_opt_out: false } },
      ]),
      lockEmailForSending: vi.fn().mockResolvedValue(true),
      isEmailDescadastrado: vi.fn().mockResolvedValue(false),
      getModeloEmail: vi.fn().mockResolvedValue({ step: 1, assunto_padrao: 'Oi', corpo_html: '<p>{nome}</p>{link_descadastro}' }),
      markEmailSent: vi.fn().mockResolvedValue(undefined),
      getClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
    };
    const anthropic = { messages: { create: async () => ({ content: [{ type: 'text', text: 'ASSUNTO: Oi Joao\nABERTURA: Ola' }] }) } };
    const sender = { enviar: vi.fn().mockResolvedValue('msg-1') };

    const svc = new EmailSequenceService(supa as any, anthropic as any, sender as any, {
      from: 'x', baseUrl: 'https://e', hotOpens: 3, now: () => new Date('2026-07-15T15:00:00Z'),
    });
    const n = await svc.processSequence();
    expect(n).toBe(1);
    expect(sender.enviar).toHaveBeenCalledOnce();
    expect(supa.markEmailSent).toHaveBeenCalledWith('S1', 'msg-1', expect.any(String));
  });

  it('nao envia fora de dia util (sabado)', async () => {
    const supa = { getDueEmailSteps: vi.fn() } as any;
    const svc = new EmailSequenceService(supa, {} as any, { enviar: vi.fn() } as any, {
      from: 'x', baseUrl: 'https://e', hotOpens: 3, now: () => new Date('2026-07-18T15:00:00Z'),
    });
    expect(await svc.processSequence()).toBe(0);
    expect(supa.getDueEmailSteps).not.toHaveBeenCalled();
  });
});
