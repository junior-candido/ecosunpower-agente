// src/modules/email/email-sequence.ts
// Envia so em dias uteis (seg-sex), das 9h as 20h BRT (UTC-3).
export function podeEnviarAgora(now: Date = new Date()): boolean {
  const brtMs = now.getTime() - 3 * 60 * 60 * 1000;
  const brt = new Date(brtMs);
  const dia = brt.getUTCDay();          // 0=domingo ... 6=sabado
  const hora = brt.getUTCHours();
  if (dia === 0 || dia === 6) return false;
  return hora >= 9 && hora < 20;
}

import { renderTemplate, STEPS_JORNADA } from './templates.js';
import { gerarAssuntoAbertura } from './email-writer.js';
import { registrarEvento } from '../elo/eventos.js';
import { montarMolduraEmail } from './email-moldura.js';
import { buscarNoticiasBlog } from './blog-noticias.js';
import { dicaDoDia } from './dicas-de-ouro.js';
import type { EmailSender } from './resend-client.js';

const RSS_URL_PADRAO = 'https://www.ecosunpower.eng.br/rss.xml';

export type SeqOpts = {
  from: string; baseUrl: string; hotOpens: number;
  empresa?: string;              // CLONE-READY: nome da empresa vem da config
  now?: () => Date; batchLimit?: number;
  rssUrl?: string;                // feed do blog pra secao "Novidades" da moldura
};

// Motor da sequencia de e-mail: espelha CadenceService.processCadence (src/modules/cadence.ts)
// mas pro canal e-mail. Devido: CAS lock -> template -> IA escreve assunto/abertura ->
// renderiza -> envia -> marca enviado -> registra evento na espinha do Elo.
export class EmailSequenceService {
  constructor(private supa: any, private anthropic: any, private sender: EmailSender, private opts: SeqOpts) {}

  async processSequence(): Promise<number> {
    const now = (this.opts.now ?? (() => new Date()))();
    if (!podeEnviarAgora(now)) return 0;
    // Botão ligar/pausar do dashboard (aba E-mail Marketing). Flag ausente =
    // permitido (compatibilidade); só um pause explícito interrompe o envio.
    if ((await this.supa.getFlag?.('email_seq_ligado')) === false) return 0;
    const due = await this.supa.getDueEmailSteps(this.opts.batchLimit ?? 50);
    if (due.length === 0) return 0;
    // Busca as noticias do blog UMA vez por ciclo (nao por e-mail) — best-effort,
    // se o blog estiver fora do ar a jornada segue normal sem a secao.
    const noticias = await buscarNoticiasBlog(this.opts.rssUrl ?? RSS_URL_PADRAO).catch(() => []);
    let enviados = 0;
    for (const row of due) {
      const lead = row.leads;
      if (!lead?.email || lead.email_opt_out) continue;
      if (await this.supa.isEmailDescadastrado(lead.email)) continue;
      const locked = await this.supa.lockEmailForSending(row.id);
      if (!locked) continue;
      try {
        const modelo = await this.supa.getModeloEmail(row.step);
        if (!modelo) { await this.supa.markEmailFailed(row.id, 'sem modelo'); continue; }
        const tema = STEPS_JORNADA.find((s) => s.step === row.step)?.tema ?? '';
        const { assunto, abertura } = await gerarAssuntoAbertura(
          this.anthropic,
          { step: row.step, tema, nome: lead.name, cidade: lead.city, oQuePediu: lead.profile, empresa: this.opts.empresa },
          modelo.assunto_padrao,
        );
        const link = `${this.opts.baseUrl}/e/descadastro?lid=${lead.id}`;
        const conteudoHtml = (abertura ? `<p>${abertura}</p>` : '') +
          renderTemplate(modelo.corpo_html, { nome: lead.name, cidade: lead.city, o_que_pediu: lead.profile, link_descadastro: link });
        const html = montarMolduraEmail({ conteudoHtml, linkDescadastro: link, noticias, empresa: this.opts.empresa, dica: dicaDoDia(now) });
        const msgId = await this.sender.enviar({ to: lead.email, subject: assunto, html });
        await this.supa.markEmailSent(row.id, msgId, assunto);
        await registrarEvento(this.supa.getClient(), {
          tipo: 'email_enviado', leadId: lead.id, canal: 'email', departamento: 'marketing',
          origem: 'email-sequence', payload: { step: row.step, provider_message_id: msgId, subject: assunto },
        });
        enviados++;
      } catch (err) {
        await this.supa.markEmailFailed(row.id, (err as Error)?.message ?? 'erro');
      }
    }
    return enviados;
  }
}
