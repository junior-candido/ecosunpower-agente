// src/modules/energia/vigia.ts
//
// Vigia de silêncio do medidor (spec §4.6). Olha a CHEGADA de dado
// (ultima_leitura_em), NUNCA o "online" da nuvem — lição da memória: o painel
// mostrava "Conectado" enquanto a assistente estava muda havia 5 dias.
//
// Função pura: o status já é o estado; a TRANSIÇÃO é o gatilho de UMA mensagem
// ao admin. O problema da chave da nuvem Shelly fica em campos SEPARADOS
// (nuvem_ok, migration 136): chave recusada num medidor "script + nuvem de
// reserva" não pode travar o vigia do script.

import type { ModoColeta, StatusMedidor } from './types.js';

/**
 * Minutos sem dado até "parou". Nunca menos de 30: uma queda curta de Wi-Fi
 * não vira mensagem (e a volta dela, outra).
 */
export const MUDO_APOS_MIN: Record<ModoColeta, number> = { push: 30, nuvem: 45, push_nuvem: 30 };

/** No máximo isto de mensagens por medidor por dia de Brasília (freio de "pisca-pisca"). */
export const MAX_AVISOS_POR_DIA = 4;

export interface MedidorVigiado {
  status: string;
  modo_coleta: ModoColeta;
  ultima_leitura_em: string | null;
  ativo: boolean;
}

export function proximoStatus(m: MedidorVigiado, agora: Date): { status: StatusMedidor; mudou: boolean } {
  const atual = (['aguardando', 'ok', 'mudo'].includes(m.status) ? m.status : 'aguardando') as StatusMedidor;
  if (!m.ativo) return { status: atual, mudou: false };
  if (!m.ultima_leitura_em) return { status: atual === 'ok' ? 'mudo' : atual, mudou: atual === 'ok' };
  const minutos = (agora.getTime() - Date.parse(m.ultima_leitura_em)) / 60_000;
  const limite = Math.max(30, MUDO_APOS_MIN[m.modo_coleta] ?? 30);
  const novo: StatusMedidor = minutos > limite ? (atual === 'aguardando' ? 'aguardando' : 'mudo') : 'ok';
  return { status: novo, mudou: novo !== atual };
}

const horaBrasilia = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const dataBrasilia = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });

/**
 * Texto da mensagem ao admin numa transição de chegada de dado. `anterior`
 * separa "começou" (1º dado de um medidor novo) de "voltou". Sem número de
 * consumo (LGPD: só o necessário).
 */
export function textoAvisoStatus(
  m: { apelido: string; status: StatusMedidor; anterior?: string; ultima_leitura_em: string | null },
  agora: Date,
): string {
  const nome = `"${m.apelido}"`;
  if (m.status === 'mudo') {
    if (!m.ultima_leitura_em) return `🔌 Medidor ${nome} parou de mandar dado. Confira o Wi-Fi e a energia do quadro.`;
    const min = Math.round((agora.getTime() - Date.parse(m.ultima_leitura_em)) / 60_000);
    const tempo = min >= 120 ? `${Math.round(min / 60)} h` : `${min} min`;
    return `🔌 Medidor ${nome} sem dado desde ${horaBrasilia(m.ultima_leitura_em)} de ${dataBrasilia(m.ultima_leitura_em)} (${tempo}). Confira o Wi-Fi e a energia do quadro, e se o script está ligado com "Executar na inicialização".`;
  }
  if (m.status === 'ok') {
    if (m.anterior === 'aguardando') return `📶 Medidor ${nome} começou a mandar dado. A partir de agora a plataforma acompanha.`;
    return `✅ Medidor ${nome} voltou a mandar dado.`;
  }
  return `ℹ️ Medidor ${nome} aguardando o primeiro dado.`;
}

/** Aviso (uma vez) de que a nuvem Shelly recusou a chave guardada — ou que ela não abre mais. */
export function textoAvisoNuvem(apelido: string): string {
  return `🔑 A nuvem Shelly recusou a chave do medidor "${apelido}" (a senha da conta pode ter mudado). Cadastre a chave nova pela plataforma, em Editar medidor — nunca pelo WhatsApp.`;
}
