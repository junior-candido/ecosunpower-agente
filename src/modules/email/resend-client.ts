// src/modules/email/resend-client.ts
// Wrapper de envio de e-mail via Resend. API key, remetente e endereco de
// resposta vem de config/env (nada fixo no codigo, pra ficar clone-ready).

import { Resend } from 'resend';

export type EnvioEmail = { to: string; subject: string; html: string };

export class EmailSender {
  private resend: Resend;

  /**
   * @param from     remetente (EMAIL_FROM). Fica num subdominio de envio —
   *                 ex. "Empresa <contato@news.empresa.com.br>".
   * @param replyTo  para onde vai a resposta do cliente. Se nao vier, cai na
   *                 env EMAIL_REPLY_TO.
   *
   * Por que o replyTo existe (auditoria de 07/09/2026): o subdominio de envio
   * da Resend NAO tem MX — ele so assina e entrega, nao recebe. Os 6 modelos da
   * jornada terminam pedindo "e so responder este e-mail", entao sem replyTo a
   * resposta do cliente volta como bounce e ninguem fica sabendo. Foram 800
   * e-mails enviados assim antes de isso ser descoberto.
   */
  constructor(apiKey: string, private from: string, private replyTo?: string) {
    this.resend = new Resend(apiKey);
  }

  // devolve o id da mensagem no provider (para casar com os webhooks)
  async enviar(e: EnvioEmail): Promise<string> {
    const responder = (this.replyTo ?? process.env.EMAIL_REPLY_TO ?? '').trim();
    const { data, error } = await this.resend.emails.send({
      from: this.from,
      to: e.to,
      subject: e.subject,
      html: e.html,
      // so manda a chave se houver endereco — evita enviar replyTo vazio
      ...(responder ? { replyTo: responder } : {}),
    });
    if (error) throw new Error(error.message ?? 'resend send error');
    return data?.id ?? '';
  }
}
