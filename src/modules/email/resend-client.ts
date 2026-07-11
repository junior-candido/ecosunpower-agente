// src/modules/email/resend-client.ts
// Wrapper de envio de e-mail via Resend. API key e remetente vem de config/env
// (nada fixo no codigo, pra ficar clone-ready).

import { Resend } from 'resend';

export type EnvioEmail = { to: string; subject: string; html: string };

export class EmailSender {
  private resend: Resend;

  constructor(apiKey: string, private from: string) {
    this.resend = new Resend(apiKey);
  }

  // devolve o id da mensagem no provider (para casar com os webhooks)
  async enviar(e: EnvioEmail): Promise<string> {
    const { data, error } = await this.resend.emails.send({
      from: this.from,
      to: e.to,
      subject: e.subject,
      html: e.html,
    });
    if (error) throw new Error(error.message ?? 'resend send error');
    return data?.id ?? '';
  }
}
