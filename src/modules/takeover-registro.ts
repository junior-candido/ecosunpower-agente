// src/modules/takeover-registro.ts
//
// REGISTRA SEMPRE, RESPONDE NUNCA.
//
// Quando alguém da equipe digita numa conversa pelo celular, a assistente é
// pausada pra aquele contato (takeover). Isso está certo: o cliente não pode
// receber duas respostas diferentes ao mesmo tempo.
//
// O que estava errado era ONDE a pausa era conferida. O `isPaused` vinha antes
// de `getLeadByPhone`, então o `return` acontecia antes de o lead nascer — e a
// mensagem do cliente não era respondida E também não era registrada. Sumia do
// painel. Conquista Solar, 09/09/2026: "Clara não fez os atendimentos e não
// consta no dashboard".
//
// O agravante daquele caso: o número da assistente é o celular da vendedora,
// que digita o dia inteiro. Cada mensagem dela renova a pausa de 24 h, então a
// assistente vivia calada e o painel vivia vazio.
//
// Aqui a assistente continua calada — muda só o que fica gravado.
//
// FALHA FECHADA DE PROPÓSITO: qualquer erro aqui é engolido e vira log. Este
// caminho roda dentro do webhook; derrubar o webhook por causa de um registro
// seria trocar um problema pequeno por um grande.
import type { MessageEntry } from './supabase.js';

/** O que a assistente recebeu enquanto estava calada. */
export type TipoDeEntrada = 'texto' | 'audio' | 'imagem' | 'video' | 'documento';

/** Como cada tipo aparece no histórico de quem for ler depois. */
const MARCADOR: Record<TipoDeEntrada, string> = {
  texto: '',
  audio: '[áudio]',
  imagem: '[imagem]',
  video: '[vídeo]',
  documento: '[documento]',
};

export interface DepsRegistro {
  getLeadByPhone(phone: string): Promise<{ id: string } | null>;
  upsertLead(dados: { phone: string; status?: string; company_id?: string }): Promise<{ id: string }>;
  getOrCreateConversation(
    leadId: string,
    companyId?: string,
  ): Promise<{ id: string; messages: MessageEntry[]; message_count: number }>;
  updateConversation(
    conversationId: string,
    updates: { messages: MessageEntry[]; message_count: number },
  ): Promise<void>;
}

export interface EntradaParaRegistrar {
  telefone: string;
  /** Empresa dona do canal. Sem ela o lead cairia na empresa errada. */
  companyId?: string;
  /** Texto da mensagem, ou a legenda da mídia. Pode vir vazio. */
  texto: string;
  tipo: TipoDeEntrada;
}

/**
 * 'registrado' = lead e mensagem guardados.
 * 'parcial'    = o lead existe (o cliente aparece no painel), mas a conversa
 *                não pôde ser gravada.
 * 'falhou'     = nem o lead deu — o banco não respondeu.
 */
export type ResultadoRegistro = 'registrado' | 'parcial' | 'falhou';

/** O que vai ficar escrito no histórico. Mídia sem legenda vira só o marcador. */
export function textoDoHistorico(tipo: TipoDeEntrada, texto: string): string {
  const limpo = (texto ?? '').trim();
  const marcador = MARCADOR[tipo] ?? '';
  if (!marcador) return limpo;
  return limpo ? `${marcador} ${limpo}` : marcador;
}

/**
 * Guarda o lead e a mensagem sem responder nada. Chamado no lugar do `return`
 * seco que existia quando a assistente está pausada.
 */
export async function registrarSemResponder(
  deps: DepsRegistro,
  entrada: EntradaParaRegistrar,
): Promise<ResultadoRegistro> {
  const { telefone, companyId, texto, tipo } = entrada;

  let leadId: string;
  try {
    const existente = await deps.getLeadByPhone(telefone);
    if (existente?.id) {
      leadId = existente.id;
    } else {
      // Carimba a empresa do canal na CRIAÇÃO. Sem isso o cliente da Conquista
      // nasceria como lead da EcoSunPower — o vazamento que custou o dia 08/09.
      const criado = await deps.upsertLead({
        phone: telefone,
        status: 'novo',
        ...(companyId ? { company_id: companyId } : {}),
      });
      leadId = criado.id;
    }
  } catch (err) {
    console.warn(`[takeover-registro] lead de ${telefone} não entrou: ${(err as Error).message}`);
    return 'falhou';
  }

  try {
    const conversa = await deps.getOrCreateConversation(leadId, companyId);
    const nova: MessageEntry = {
      role: 'user',
      content: textoDoHistorico(tipo, texto),
      timestamp: new Date().toISOString(),
    };
    const messages = [...(conversa.messages ?? []), nova];
    await deps.updateConversation(conversa.id, {
      messages,
      message_count: (conversa.message_count ?? 0) + 1,
    });
  } catch (err) {
    // O lead já entrou — que é o que faz o cliente aparecer no painel. Perder
    // só o histórico é bem menos grave do que perder o cliente.
    console.warn(`[takeover-registro] conversa de ${telefone} não gravou: ${(err as Error).message}`);
    return 'parcial';
  }

  return 'registrado';
}
