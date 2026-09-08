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
  /** Nome da assistente DESTA empresa. Sem valor, texto neutro — nunca "Eva",
   *  que e a assistente da EcoSunPower e vazaria pro tenant (08/09/2026). */
  nomeAtendente?: string | null;
  /** Criterio DESTA empresa. O texto tinha "R$700/700kWh" fixo, que e da EcoSun. */
  criterioValor?: number | null;
  criterioKwh?: number | null;
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

  const quem = input.nomeAtendente?.trim() || 'A assistente';
  const criterio = input.criterioValor && input.criterioKwh
    ? `R$${input.criterioValor}/${input.criterioKwh}kWh`
    : 'do critério mínimo';

  const notifyBody = [
    `🛑 *${quem} encerrou lead inviável*`,
    ``,
    `${name} — ${input.phone}`,
    `Motivo: ${input.reason}`,
    ``,
    `Lead on-topic mas fora ${criterio} ou em vulnerabilidade.`,
    `${quem} encerrou com dignidade e não fala mais com ele (sem queimar token).`,
    `Se foi engano, clica em Desfazer.`,
  ].join('\n');

  return { leadPatch, notifyBody };
}

/**
 * Empresa que NAO permite descarte (migration 125): a assistente pediu
 * disqualify_lead, mas o lead nao pode morrer. Vira handoff — a equipe decide.
 * O texto e o de um lead QUENTE que precisa de gente, nao o de um enterro.
 */
export function buildHandoffEmVezDeDescarte(input: {
  reason: string;
  leadName?: string | null;
  phone: string;
  nomeAtendente?: string | null;
}): string {
  const name = input.leadName?.trim() || 'Sem nome';
  const quem = input.nomeAtendente?.trim() || 'A assistente';
  return [
    `🤝 *Lead abaixo do critério — passado pra equipe*`,
    ``,
    `${name} — ${input.phone}`,
    `Motivo: ${input.reason}`,
    ``,
    `${quem} não encerrou: nesta empresa lead pequeno não se descarta.`,
    `Ela argumentou, não fechou, e passou pra vocês. O lead segue vivo.`,
    `A assistente ficou em pausa nesse chat — quem responder assume.`,
  ].join('\n');
}
