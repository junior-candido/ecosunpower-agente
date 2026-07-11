// email-reacao.ts
// "Reacao" do Elo: lead quente por e-mail (abriu >=N vezes ou clicou) vira
// alerta imediato no WhatsApp do Junior — mesmo canal/botoes dos alertas de
// eva-alerts.ts (sendAdminWithButtons + lock idempotente via app_flags).
// Best-effort: o caller (webhook do Resend) SEMPRE envolve em try/catch —
// esta funcao pode lancar se a query falhar, mas nunca deve derrubar o
// fluxo principal.

import { isLeadQuentePorEmail } from './hot-email.js';
import { registrarEvento } from '../elo/eventos.js';

export interface ChecarLeadQuenteDeps {
  client: any;
  leadId: string;
  nome: string;
  adminPhone: string;
  sendAdminWithButtons: (
    ctx: { metaWaba: any; sendText: (to: string, text: string) => Promise<void> },
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
    footer?: string,
  ) => Promise<void>;
  metaWaba: any;
  sendText: (to: string, text: string) => Promise<void>;
  acquireAlertLock: (client: any, key: string) => Promise<boolean>;
  minAberturas: number;
}

/**
 * Checa o comportamento de e-mail de um lead (aberturas/cliques em
 * eventos_elo). Se estiver quente pela regra de negocio (isLeadQuentePorEmail)
 * e ainda nao tiver sido alertado (lock via app_flags), dispara alerta pro
 * admin com botoes e registra o evento `lead_quente_email` na espinha.
 */
export async function checarLeadQuente(deps: ChecarLeadQuenteDeps): Promise<void> {
  const { data } = await deps.client
    .from('eventos_elo')
    .select('tipo')
    .eq('lead_id', deps.leadId)
    .in('tipo', ['email_aberto', 'email_clicado']);

  const eventos = (data ?? []) as Array<{ tipo: string }>;
  const aberturas = eventos.filter((e) => e.tipo === 'email_aberto').length;
  const cliques = eventos.filter((e) => e.tipo === 'email_clicado').length;

  if (!isLeadQuentePorEmail({ aberturas, cliques }, { minAberturas: deps.minAberturas })) return;

  const lockKey = `email-quente:${deps.leadId}`;
  const travou = await deps.acquireAlertLock(deps.client, lockKey);
  if (!travou) return; // ja alertado antes

  const nome = deps.nome || 'Lead sem nome';
  const text = `🔥 ${nome} está quente: abriu ${aberturas}x / clicou ${cliques}x no e-mail. Falar agora?`;

  await deps.sendAdminWithButtons(
    { metaWaba: deps.metaWaba ?? null, sendText: deps.sendText },
    deps.adminPhone,
    text,
    [
      { id: `evabt:email-quente:${deps.leadId}`, title: '👤 Ver lead' },
      { id: `evabt:lead-pause:${deps.leadId}`, title: '✋ Assumir' },
    ],
  );

  await registrarEvento(deps.client, {
    tipo: 'lead_quente_email',
    leadId: deps.leadId,
    canal: 'sistema',
    departamento: 'comercial',
    origem: 'email-reacao',
  });
}
