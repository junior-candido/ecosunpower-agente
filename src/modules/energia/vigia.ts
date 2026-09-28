// src/modules/energia/vigia.ts
//
// Vigia de silêncio do medidor (spec §4.6). Olha a CHEGADA de dado
// (ultima_leitura_em), NUNCA o "online" da nuvem — lição da memória: o painel
// mostrava "Conectado" enquanto a assistente estava muda havia 5 dias.
//
// Função pura: o status já é o estado; a TRANSIÇÃO é o gatilho de UMA mensagem
// ao admin. credencial_invalida e erro só saem por ação humana (editar o medidor).

import type { ModoColeta, StatusMedidor } from './types.js';

export const MUDO_APOS_MIN: Record<ModoColeta, number> = { push: 30, nuvem: 45, push_nuvem: 30 };

export interface MedidorVigiado {
  status: string;
  modo_coleta: ModoColeta;
  ultima_leitura_em: string | null;
  ativo: boolean;
}

export function proximoStatus(m: MedidorVigiado, agora: Date): { status: StatusMedidor; mudou: boolean } {
  const atual = (['aguardando', 'ok', 'mudo', 'erro', 'credencial_invalida'].includes(m.status) ? m.status : 'aguardando') as StatusMedidor;
  if (!m.ativo) return { status: atual, mudou: false };
  if (atual === 'credencial_invalida' || atual === 'erro') return { status: atual, mudou: false };
  if (!m.ultima_leitura_em) return { status: atual === 'ok' ? 'mudo' : atual, mudou: atual === 'ok' };
  const minutos = (agora.getTime() - Date.parse(m.ultima_leitura_em)) / 60_000;
  const limite = MUDO_APOS_MIN[m.modo_coleta] ?? 30;
  const novo: StatusMedidor = minutos > limite ? (atual === 'aguardando' ? 'aguardando' : 'mudo') : 'ok';
  return { status: novo, mudou: novo !== atual };
}

const horaBrasilia = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const dataBrasilia = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });

/** Texto da mensagem ao admin numa transição. Sem número de consumo (LGPD: só o necessário). */
export function textoAvisoStatus(m: { apelido: string; status: StatusMedidor; ultima_leitura_em: string | null }, agora: Date): string {
  const nome = `"${m.apelido}"`;
  if (m.status === 'mudo') {
    if (!m.ultima_leitura_em) return `🔌 Medidor ${nome} parou de mandar dado. Confira o Wi-Fi e a energia do quadro.`;
    const min = Math.round((agora.getTime() - Date.parse(m.ultima_leitura_em)) / 60_000);
    const tempo = min >= 120 ? `${Math.round(min / 60)} h` : `${min} min`;
    return `🔌 Medidor ${nome} sem dado desde ${horaBrasilia(m.ultima_leitura_em)} de ${dataBrasilia(m.ultima_leitura_em)} (${tempo}). Confira o Wi-Fi e a energia do quadro, e se o script está ligado com "Executar na inicialização".`;
  }
  if (m.status === 'ok') return `✅ Medidor ${nome} voltou a mandar dado.`;
  if (m.status === 'credencial_invalida') {
    return `🔑 A nuvem Shelly recusou a chave do medidor ${nome} (a senha da conta pode ter mudado). Cadastre a chave nova pela plataforma, na tela do medidor — nunca pelo WhatsApp.`;
  }
  if (m.status === 'erro') return `⚠️ Medidor ${nome} com erro na coleta. Veja a tela do medidor na plataforma.`;
  return `ℹ️ Medidor ${nome} aguardando o primeiro dado.`;
}
