// Lead on-topic (energia/conta de luz) mas economicamente INVIAVEL ou em
// vulnerabilidade (baixa renda, tarifa social, conta << criterio R$700/700kWh).
//
// Diferente de mark_off_topic, que e troll / numero errado / produto fora do
// escopo (faca, comida). Aqui o lead E sobre solar — so nao fecha. Junior nao
// pode confundir os dois no painel, entao status/contact_type/notificacao sao
// distintos. O efeito funcional e o mesmo: eva_active=false (gate em
// index.ts para a Eva), opt_out=true (fora de cadencia), cancela toques.

export interface DisqualifyLeadPatch {
  opt_out: true;
  eva_active: false;
  status: 'descartado';
  contact_type: 'inviavel';
  updated_at: string;
}

export interface DisqualifyPlan {
  leadPatch: DisqualifyLeadPatch;
  notifyBody: string;
}

export function buildDisqualifyPlan(input: {
  reason: string;
  leadName?: string | null;
  phone: string;
  now?: Date;
}): DisqualifyPlan {
  const now = input.now ?? new Date();
  const name = input.leadName?.trim() || 'Sem nome';

  const leadPatch: DisqualifyLeadPatch = {
    opt_out: true,
    eva_active: false,
    status: 'descartado',
    contact_type: 'inviavel',
    updated_at: now.toISOString(),
  };

  const notifyBody = [
    `🛑 *Eva encerrou lead inviável*`,
    ``,
    `${name} — ${input.phone}`,
    `Motivo: ${input.reason}`,
    ``,
    `Lead on-topic mas fora do critério (R$700/700kWh) ou em vulnerabilidade.`,
    `Eva encerrou com dignidade e não fala mais com ele (sem queimar token).`,
    `Se foi engano, clica em Desfazer.`,
  ].join('\n');

  return { leadPatch, notifyBody };
}
