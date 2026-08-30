// src/modules/agenda/executor.ts
// Executor da Eva Agenda A1: marca/desfaz/substitui compromissos no Google
// Agenda e formata as listagens (dia/semana) pro zap. AgendaEscrita é a
// interface estreita injetada — os métodos e assinaturas batem 1:1 com os
// já existentes em CalendarService (src/modules/calendar.ts): createEvent,
// deleteEvent, listarEventos. O CalendarService real satisfaz ela
// estruturalmente, sem precisar importar nada daqui; os testes injetam um
// mock puro, sem nunca bater no Google Calendar de verdade — mesmo padrão
// de LeitorAgenda em conflito.ts.

import type { Interpretacao } from './interpretar.js';
import type { EventoAgenda } from './conflito.js';

export const COR_EMPRESA = '9';  // azul (blueberry)
export const COR_PESSOAL = '10'; // verde (basil)

export interface EventoCriado {
  eventId: string;
  htmlLink: string;
}

// Evento listado com a colorId — CalendarService.listarEventos já devolve
// esse campo hoje; EventoAgenda (conflito.ts) não o expõe porque acharConflitos/
// sugerirHorario não precisam dele.
export interface EventoAgendaListado extends EventoAgenda {
  colorId?: string;
}

export interface CriarEventoInput {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  location?: string;
  colorId?: string;
}

export interface AgendaEscrita {
  createEvent(input: CriarEventoInput): Promise<EventoCriado>;
  deleteEvent(eventId: string): Promise<void>;
  listarEventos(inicioISO: string, fimISO: string): Promise<EventoAgendaListado[]>;
  // Update parcial (patch) de um evento existente — hoje só usado pra anexar
  // location (ver anexarLocalizacao abaixo). Assinatura estreita (só o que a
  // Eva Agenda precisa) mas bate estruturalmente com CalendarService.updateEvent
  // (src/modules/calendar.ts, Partial<CreateEventInput>) sem precisar importar
  // nada de lá — mesmo padrão de createEvent/deleteEvent/listarEventos.
  updateEvent(eventId: string, updates: { location?: string }): Promise<{ eventId: string; htmlLink: string }>;
}

const MARCA_EVA = 'Compromisso criado pela Eva.';

// Cria o evento no Google Agenda com a cor certa pelo âmbito (empresa=azul,
// pessoal=verde) e a marca "criado pela Eva" na descrição — é essa marca que
// CalendarService.listarEventos usa (via criadoPelaEva) pra saber que o
// evento veio da Eva e não foi criado manualmente pelo Junior. A1.1: quando
// a frase trouxe contexto além do básico (tarefas/materiais/valores — ex.:
// "levar a escada, trocar o disjuntor, cobrar a segunda parcela"), esse
// `interp.detalhes` vira o corpo da descrição — a marca da Eva NUNCA some,
// só é sempre o ÚLTIMO parágrafo (listarEventos depende dela pra existir).
export async function marcar(
  cal: AgendaEscrita,
  interp: Interpretacao,
  ambito: 'empresa' | 'pessoal',
  opts?: { location?: string; descricaoExtra?: string },
): Promise<EventoCriado> {
  // Guarda defensiva (belt+braces — interpretar.ts já rejeita isso ANTES de
  // devolver confiança alta): nunca manda um evento com fim <= início pro
  // Google. Se chegou até aqui mesmo assim, é bug de outra camada — melhor
  // um erro claro em PT do que um evento invertido/de duração zero criado
  // silenciosamente na agenda do Junior.
  if (!interp.diaInteiro && Date.parse(interp.fimISO) <= Date.parse(interp.inicioISO)) {
    throw new Error(
      `Horário inválido: o fim (${interp.fimISO}) não pode ser igual ou antes do início (${interp.inicioISO}) — não marquei nada.`,
    );
  }

  const colorId = ambito === 'empresa' ? COR_EMPRESA : COR_PESSOAL;
  const marca = interp.diaInteiro ? `${MARCA_EVA} (dia inteiro)` : MARCA_EVA;
  const description = [interp.detalhes, opts?.descricaoExtra, marca]
    .filter((parte): parte is string => typeof parte === 'string' && parte.trim().length > 0)
    .join('\n\n');

  return cal.createEvent({
    summary: interp.titulo,
    description,
    startISO: interp.inicioISO,
    endISO: interp.fimISO,
    location: opts?.location,
    colorId,
  });
}

export interface ResultadoDesfazer {
  jaEstava: boolean; // true = o evento já não existia (404/410) — idempotente, tratado como sucesso
}

// Erros de "não existe mais" do Google Calendar (double-press no botão
// Desfazer, evento apagado manualmente na agenda, etc.) — a googleapis expõe
// isso ora em err.code, ora em err.status, ora em err.response.status
// dependendo da versão/transporte. Qualquer uma delas com 404/410 significa
// "o evento já sumiu", que é exatamente o resultado que "desfazer" queria.
function eventoJaSumiu(err: unknown): boolean {
  const e = err as { code?: number | string; status?: number | string; response?: { status?: number | string } };
  const status = e?.code ?? e?.status ?? e?.response?.status;
  return status === 404 || status === 410 || status === '404' || status === '410';
}

// Desfaz um compromisso marcado pela Eva (comando "cancela"/"desfaz" no zap,
// botão "Desfazer"). Idempotente: se o Google já não tem mais esse evento
// (404/410 — já foi desfeito antes, ou apagado manualmente), NÃO é erro —
// desfazer duas vezes o mesmo compromisso dá no mesmo resultado (evento
// ausente), então devolve jaEstava:true em vez de lançar. Qualquer OUTRO
// erro (rede fora do ar, permissão, etc.) continua propagando normalmente.
export async function desfazer(cal: AgendaEscrita, eventId: string): Promise<ResultadoDesfazer> {
  try {
    await cal.deleteEvent(eventId);
    return { jaEstava: false };
  } catch (err) {
    if (eventoJaSumiu(err)) return { jaEstava: true };
    throw err;
  }
}

// Substitui um evento em conflito pelo novo compromisso: exclui o conflitante
// e SÓ DEPOIS cria o novo (nessa ordem — nunca cria antes de excluir, senão o
// próprio novo evento contaria como conflito dele mesmo). A exclusão usa
// desfazer() por baixo — 404/410 (conflitante já sumiu por algum motivo) não
// impede a criação do novo, é tratado como sucesso idempotente igual ao botão
// Desfazer. Se a CRIAÇÃO falhar depois da exclusão já ter acontecido, propaga
// um erro com mensagem clara em PT avisando que o conflitante já foi removido
// (pro Junior não achar que nada mudou).
export async function substituir(
  cal: AgendaEscrita,
  eventIdConflitante: string,
  interp: Interpretacao,
  ambito: 'empresa' | 'pessoal',
  opts?: { location?: string },
): Promise<EventoCriado> {
  await desfazer(cal, eventIdConflitante);
  try {
    return await marcar(cal, interp, ambito, opts);
  } catch (err) {
    throw new Error(
      `O compromisso conflitante foi excluído, mas não consegui criar o novo — tenta marcar de novo. Detalhe: ${(err as Error).message}`,
    );
  }
}

// Anexa uma localização (pin do WhatsApp) a um evento JÁ CRIADO — usado
// quando o pin chega DEPOIS do compromisso (ex.: Junior marca "visita
// amanhã 9h" e só alguns minutos depois manda o pin) em vez de virar um
// compromisso novo. Patch parcial: só o campo location muda, o resto do
// evento (título/horário/cor/descrição) fica intacto.
export async function anexarLocalizacao(cal: AgendaEscrita, eventId: string, location: string): Promise<void> {
  await cal.updateEvent(eventId, { location });
}

// ---------------------------------------------------------------------------
// LISTAGENS FORMATADAS (PT-BR, prontas pro zap)
// ---------------------------------------------------------------------------

const DIAS_ABREV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// Rótulo "dom 31/08" a partir de uma data pura (YYYY-MM-DD). Usa Date.UTC
// pra calcular o dia da semana sem depender do TZ do host (mesma técnica de
// interpretar.ts/conflito.ts).
function rotuloDia(dataISO: string): string {
  const [y, m, d] = dataISO.slice(0, 10).split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${DIAS_ABREV[wd]} ${pad(d)}/${pad(m)}`;
}

// Soma `dias` a uma data pura (YYYY-MM-DD), devolvendo outra data pura.
function somarDias(dataISO: string, dias: number): string {
  const [y, m, d] = dataISO.slice(0, 10).split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) + dias * 86_400_000;
  const dt = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

interface PartsBRT { year: number; month: number; day: number; hour: number; minute: number }

// Lê ano/mês/dia/hora/minuto de um instante ISO em America/Sao_Paulo
// (timezone-safe, não depende do TZ do host) — mesma técnica de
// interpretar.ts. Precisamos da data (não só hora/minuto) pra reconhecer o
// formato all-day NATIVO do Google, cujo fim exclusivo cai em 00:00 de um
// dia POSTERIOR (não é só "hora 23:59" no mesmo dia, como no padrão da Eva).
function partsEmSaoPaulo(iso: string): PartsBRT {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const o: Record<string, string> = {};
  for (const p of parts) o[p.type] = p.value;
  return {
    year: parseInt(o.year, 10),
    month: parseInt(o.month, 10),
    day: parseInt(o.day, 10),
    hour: parseInt(o.hour, 10) % 24,
    minute: parseInt(o.minute, 10),
  };
}

function diaMs(p: PartsBRT): number {
  return Date.UTC(p.year, p.month - 1, p.day);
}

// Um evento é "dia inteiro" em um de dois formatos possíveis:
//   (a) padrão da Eva (ver `marcar` acima): começa 00:00 e termina 23:59 do
//       MESMO dia (diaInteiro em interpretar.ts);
//   (b) padrão NATIVO do Google pra evento all-day: calendar.ts normaliza
//       start.date/end.date pra dateTime, e o fim do Google é EXCLUSIVO — o
//       evento começa 00:00 de um dia e "termina" 00:00 do dia SEGUINTE (ou
//       mais, se durar vários dias), nunca 23:59.
// Guarda defensiva: inicioISO/fimISO vazios, ausentes ou sem "T" (formato
// inesperado) NUNCA classificam como dia inteiro — cai no formato de horário
// normal em vez de arriscar um falso positivo.
export function ehDiaInteiro(e: EventoAgendaListado): boolean {
  if (!e.inicioISO || !e.fimISO || !e.inicioISO.includes('T') || !e.fimISO.includes('T')) return false;

  const ini = partsEmSaoPaulo(e.inicioISO);
  const fim = partsEmSaoPaulo(e.fimISO);
  if (ini.hour !== 0 || ini.minute !== 0) return false;

  if (fim.hour === 23 && fim.minute === 59 && diaMs(fim) === diaMs(ini)) return true; // padrão da Eva
  if (fim.hour === 0 && fim.minute === 0 && diaMs(fim) > diaMs(ini)) return true;     // padrão nativo do Google

  return false;
}

function formatarHorario(e: EventoAgendaListado): string {
  if (ehDiaInteiro(e)) return 'dia todo';
  const pad = (n: number) => String(n).padStart(2, '0');
  const ini = partsEmSaoPaulo(e.inicioISO);
  const fim = partsEmSaoPaulo(e.fimISO);
  return `${pad(ini.hour)}:${pad(ini.minute)}–${pad(fim.hour)}:${pad(fim.minute)}`;
}

// Bolinha 🔵 empresa / 🟢 pessoal, pela colorId gravada em `marcar`. Qualquer
// outra cor (ou ausência dela — evento criado manualmente) cai no azul
// default.
function bolinha(colorId?: string): string {
  return colorId === COR_PESSOAL ? '🟢' : '🔵';
}

function ordenarPorInicio(eventos: EventoAgendaListado[]): EventoAgendaListado[] {
  return [...eventos].sort((a, b) => new Date(a.inicioISO).getTime() - new Date(b.inicioISO).getTime());
}

function formatarLinhasDoDia(eventos: EventoAgendaListado[]): string[] {
  return ordenarPorInicio(eventos).map((e) => `${bolinha(e.colorId)} ${formatarHorario(e)} ${e.titulo}`);
}

// Lista os compromissos de UM dia, formatados pro zap. `rotulo` é o texto que
// o Junior reconhece ("Hoje", "Amanhã"...); o dia da semana + dd/mm é
// calculado aqui a partir de `dataISO` (YYYY-MM-DD).
export async function listarDiaFormatado(
  cal: AgendaEscrita,
  dataISO: string,
  rotulo: string,
): Promise<string> {
  const inicioDia = `${dataISO}T00:00:00-03:00`;
  const fimDia = `${dataISO}T23:59:59-03:00`;
  const eventos = await cal.listarEventos(inicioDia, fimDia);

  const cabecalho = `📅 *${rotulo} (${rotuloDia(dataISO)})*`;
  if (eventos.length === 0) return `${cabecalho}\nNada marcado 🎉`;

  return [cabecalho, ...formatarLinhasDoDia(eventos)].join('\n');
}

// Lista os compromissos de 7 dias a partir de `inicioISO` (data pura
// YYYY-MM-DD, ou um ISO completo — só a parte da data é usada), agrupados
// por dia. Dias sem nenhum compromisso são omitidos (não polui o zap com
// "nada marcado" repetido 7x).
export async function listarSemanaFormatado(
  cal: AgendaEscrita,
  inicioISO: string,
): Promise<string> {
  const blocos: string[] = [];

  for (let i = 0; i < 7; i++) {
    const dataISO = somarDias(inicioISO, i);
    const inicioDia = `${dataISO}T00:00:00-03:00`;
    const fimDia = `${dataISO}T23:59:59-03:00`;
    const eventos = await cal.listarEventos(inicioDia, fimDia);
    if (eventos.length === 0) continue;

    blocos.push([`📅 *${rotuloDia(dataISO)}*`, ...formatarLinhasDoDia(eventos)].join('\n'));
  }

  return blocos.length > 0 ? blocos.join('\n\n') : 'Nada marcado essa semana 🎉';
}
