// src/modules/aviso-conversa-iniciada.ts
// [28/07 — pedido do Junior] Hoje ele sabe quando o lead ENTRA (aviso do
// webhook) e quando QUALIFICA (dossiê) — mas o momento de ouro, "o lead
// respondeu e a conversa começou", passava em silêncio. Este aviso nasce
// COLADO no estágio lead_respondeu do CAPI (mesma guarda → dispara 1x por
// lead): primeira resposta (texto/foto/PDF) de lead vindo do FORMULÁRIO.
// Opção (a) do Junior: CTWA/orgânico ficam fora de propósito — em dia de
// campanha virava metralhadora de notificação.

import { formatPhoneBR } from './meta-leadgen.js';

export interface LeadParaAviso {
  id?: string;
  name?: string | null;
  phone?: string | null;
  ctwa_clid?: string | null;
  lead_source?: string | null;
  capi_stages_sent?: string[] | null;
}

// MESMA régua do maybeCapiRespondeu (zero-divergência: o index usa esta
// função pros DOIS efeitos — CAPI e aviso): veio de form (lead_source de
// leadform OU estágio 'Lead' carimbado), sem clique CTWA, e ainda sem
// 'lead_respondeu' — ou seja, esta é a PRIMEIRA resposta.
export function deveAvisarConversaIniciada(lead: LeadParaAviso | null | undefined): boolean {
  if (!lead?.id || lead.ctwa_clid) return false;
  const stages = lead.capi_stages_sent ?? [];
  const veioDeForm =
    lead.lead_source === 'ad_ig_leadform' ||
    lead.lead_source === 'ad_fb_leadform' ||
    stages.includes('Lead');
  return veioDeForm && !stages.includes('lead_respondeu');
}

export interface AvisoConversaIniciada {
  texto: string;
  botoes: Array<{ id: string; title: string }>;
  footer: string;
}

export function montarAvisoConversaIniciada(
  lead: LeadParaAviso,
  preview: string | null,
): AvisoConversaIniciada {
  const nome = lead.name?.trim() || 'Lead sem nome';
  const resumo = (preview ?? '').trim().replace(/\s+/g, ' ');
  const resumoCurto = resumo.length > 120 ? `${resumo.slice(0, 117)}…` : resumo;
  const texto = [
    `💬 *${nome} começou a conversar com a Eva*`,
    lead.phone ? `📱 ${formatPhoneBR(lead.phone)}` : '',
    resumoCurto ? `🗨️ "${resumoCurto}"` : '',
    `_A Eva está conduzindo — acompanhe ou assuma quando quiser._`,
  ].filter(Boolean).join('\n');
  return {
    texto,
    botoes: [
      { id: `evabt:lead-view:${lead.id}`, title: '👤 Ver conversa' },
      { id: `evabt:lead-pause:${lead.id}`, title: '✋ Assumir' },
    ],
    footer: 'Toque pra agir',
  };
}
