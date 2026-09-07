import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Captura o payload que o EmailSender entrega ao SDK da Resend.
const enviadoAoSdk: any[] = [];
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (payload: any) => {
        enviadoAoSdk.push(payload);
        return { data: { id: 'msg_teste' }, error: null };
      },
    };
    constructor(public apiKey: string) {}
  },
}));

const { EmailSender } = await import('../src/modules/email/resend-client.js');

const ENVIO = { to: 'cliente@exemplo.com', subject: 'Assunto', html: '<p>corpo</p>' };

describe('EmailSender — endereco de resposta', () => {
  beforeEach(() => {
    enviadoAoSdk.length = 0;
    delete process.env.EMAIL_REPLY_TO;
  });
  afterEach(() => {
    delete process.env.EMAIL_REPLY_TO;
  });

  // O motivo deste teste (auditoria de 07/09/2026): os 6 modelos da jornada
  // pedem "e so responder este e-mail", mas o remetente fica num subdominio de
  // envio (news.<dominio>) que NAO tem MX. Sem replyTo, toda resposta de cliente
  // volta como bounce e o Junior nunca fica sabendo. 800 e-mails sairam assim.
  it('manda replyTo quando EMAIL_REPLY_TO esta configurado', async () => {
    process.env.EMAIL_REPLY_TO = 'junior@empresa.com.br';
    const sender = new EmailSender('key', 'Empresa <contato@news.empresa.com.br>');

    await sender.enviar(ENVIO);

    expect(enviadoAoSdk).toHaveLength(1);
    expect(enviadoAoSdk[0].replyTo).toBe('junior@empresa.com.br');
  });

  it('nao inventa replyTo quando EMAIL_REPLY_TO nao esta configurado', async () => {
    const sender = new EmailSender('key', 'Empresa <contato@news.empresa.com.br>');

    await sender.enviar(ENVIO);

    expect(enviadoAoSdk).toHaveLength(1);
    expect(enviadoAoSdk[0].replyTo).toBeUndefined();
  });

  it('aceita replyTo passado direto no construtor (tem prioridade sobre a env)', async () => {
    process.env.EMAIL_REPLY_TO = 'da-env@empresa.com.br';
    const sender = new EmailSender('key', 'Empresa <contato@news.empresa.com.br>', 'explicito@empresa.com.br');

    await sender.enviar(ENVIO);

    expect(enviadoAoSdk[0].replyTo).toBe('explicito@empresa.com.br');
  });

  it('continua mandando from, to, subject e html', async () => {
    const sender = new EmailSender('key', 'Empresa <contato@news.empresa.com.br>');

    const id = await sender.enviar(ENVIO);

    expect(id).toBe('msg_teste');
    expect(enviadoAoSdk[0]).toMatchObject({
      from: 'Empresa <contato@news.empresa.com.br>',
      to: 'cliente@exemplo.com',
      subject: 'Assunto',
      html: '<p>corpo</p>',
    });
  });
});
