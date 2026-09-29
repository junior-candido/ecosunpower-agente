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
    delete process.env.EMAIL_INBOUND_ADDRESS;
  });
  afterEach(() => {
    delete process.env.EMAIL_REPLY_TO;
    delete process.env.EMAIL_INBOUND_ADDRESS;
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

  // A caixa que a Resend RECEBE tem prioridade sobre a caixa humana: e ela que
  // faz a resposta do cliente entrar no sistema (casa com o lead, avisa no zap)
  // em vez de so cair no Gmail.
  it('prefere EMAIL_INBOUND_ADDRESS sobre EMAIL_REPLY_TO', async () => {
    process.env.EMAIL_REPLY_TO = 'junior@empresa.com.br';
    process.env.EMAIL_INBOUND_ADDRESS = 'respostas@caixa.resend.app';
    const sender = new EmailSender('key', 'Empresa <contato@news.empresa.com.br>');

    await sender.enviar(ENVIO);

    expect(enviadoAoSdk[0].replyTo).toBe('respostas@caixa.resend.app');
  });

  it('usa EMAIL_REPLY_TO quando nao ha caixa de recebimento configurada', async () => {
    process.env.EMAIL_REPLY_TO = 'junior@empresa.com.br';
    const sender = new EmailSender('key', 'Empresa <contato@news.empresa.com.br>');

    await sender.enviar(ENVIO);

    expect(enviadoAoSdk[0].replyTo).toBe('junior@empresa.com.br');
  });
});

describe('EmailSender — anexos (NFS-e: PDF + XML)', () => {
  beforeEach(() => { enviadoAoSdk.length = 0; });
  it('manda os anexos como a Resend espera (filename + content Buffer + contentType)', async () => {
    const sender = new EmailSender('key', 'Empresa <contato@news.empresa.com.br>');
    await sender.enviar({ ...ENVIO, attachments: [
      { filename: 'NFSe-82-GDF.pdf', content: Buffer.from('%PDF'), contentType: 'application/pdf' },
      { filename: 'NFSe-82.xml', content: Buffer.from('<x/>'), contentType: 'application/xml' },
    ] });
    expect(enviadoAoSdk[0].attachments).toHaveLength(2);
    expect(enviadoAoSdk[0].attachments[0]).toMatchObject({ filename: 'NFSe-82-GDF.pdf', contentType: 'application/pdf' });
    expect(Buffer.isBuffer(enviadoAoSdk[0].attachments[0].content)).toBe(true);
  });
  it('sem anexo não manda a chave attachments (payload dos outros e-mails continua igual)', async () => {
    const sender = new EmailSender('key', 'Empresa <contato@news.empresa.com.br>');
    await sender.enviar(ENVIO);
    expect('attachments' in enviadoAoSdk[0]).toBe(false);
  });
});
