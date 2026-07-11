// src/modules/email/resend-events.ts
// Mapeamento puro: payload de webhook do Resend -> evento da espinha do Elo.
// Sem I/O aqui — so transformacao de dados.

import type { EventoInput } from '../elo/eventos.js';

const MAPA: Record<string, string> = {
  'email.delivered': 'email_entregue',
  'email.opened': 'email_aberto',
  'email.clicked': 'email_clicado',
  'email.bounced': 'email_bounce',
  'email.complained': 'email_descadastro',
};

export function mapResendEvento(body: any): EventoInput | null {
  const tipo = MAPA[body?.type];
  if (!tipo) return null;
  return {
    tipo,
    canal: 'email',
    origem: 'resend-webhook',
    payload: {
      provider_message_id: body?.data?.email_id ?? null,
      to: body?.data?.to ?? null,
      link: body?.data?.link ?? null,
    },
  };
}
