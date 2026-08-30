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
}

const MARCA_EVA = 'Compromisso criado pela Eva.';

// Cria o evento no Google Agenda com a cor certa pelo âmbito (empresa=azul,
// pessoal=verde) e a marca "criado pela Eva" na descrição — é essa marca que
// CalendarService.listarEventos usa (via criadoPelaEva) pra saber que o
// evento veio da Eva e não foi criado manualmente pelo Junior.
export async function marcar(
  cal: AgendaEscrita,
  interp: Interpretacao,
  ambito: 'empresa' | 'pessoal',
  opts?: { location?: string; descricaoExtra?: string },
): Promise<EventoCriado> {
  const colorId = ambito === 'empresa' ? COR_EMPRESA : COR_PESSOAL;
  const partesDescricao = [MARCA_EVA];
  if (interp.diaInteiro) partesDescricao.push('(dia inteiro)');
  if (opts?.descricaoExtra) partesDescricao.push(opts.descricaoExtra);

  return cal.createEvent({
    summary: interp.titulo,
    description: partesDescricao.join(' '),
    startISO: interp.inicioISO,
    endISO: interp.fimISO,
    location: opts?.location,
    colorId,
  });
}

// Desfaz um compromisso marcado pela Eva (comando "cancela"/"desfaz" no zap).
export async function desfazer(cal: AgendaEscrita, eventId: string): Promise<void> {
  await cal.deleteEvent(eventId);
}

// Substitui um evento em conflito pelo novo compromisso: exclui o conflitante
// e SÓ DEPOIS cria o novo (nessa ordem — nunca cria antes de excluir, senão o
// próprio novo evento contaria como conflito dele mesmo). Se a criação falhar
// depois da exclusão já ter acontecido, propaga um erro com mensagem clara em
// PT avisando que o conflitante já foi removido (pro Junior não achar que nada
// mudou).
export async function substituir(
  cal: AgendaEscrita,
  eventIdConflitante: string,
  interp: Interpretacao,
  ambito: 'empresa' | 'pessoal',
): Promise<EventoCriado> {
  await cal.deleteEvent(eventIdConflitante);
  try {
    return await marcar(cal, interp, ambito);
  } catch (err) {
    throw new Error(
      `O compromisso conflitante foi excluído, mas não consegui criar o novo — tenta marcar de novo. Detalhe: ${(err as Error).message}`,
    );
  }
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

// Lê hora/minuto de um instante ISO em America/Sao_Paulo (timezone-safe, não
// depende do TZ do host) — mesma técnica de interpretar.ts.
function horaMinutoEmSaoPaulo(iso: string): { hour: number; minute: number } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const o: Record<string, string> = {};
  for (const p of parts) o[p.type] = p.value;
  return { hour: parseInt(o.hour, 10) % 24, minute: parseInt(o.minute, 10) };
}

// Um evento é "dia inteiro" quando: (a) veio do Google como data pura, sem
// horário (formato nativo de evento all-day, sem "T"), ou (b) foi criado pela
// Eva com o padrão 00:00–23:59 (ver `marcar` acima / diaInteiro em
// interpretar.ts).
function ehDiaInteiro(e: EventoAgendaListado): boolean {
  if (!e.inicioISO.includes('T')) return true;
  const ini = horaMinutoEmSaoPaulo(e.inicioISO);
  const fim = horaMinutoEmSaoPaulo(e.fimISO);
  return ini.hour === 0 && ini.minute === 0 && fim.hour === 23 && fim.minute === 59;
}

function formatarHorario(e: EventoAgendaListado): string {
  if (ehDiaInteiro(e)) return 'dia todo';
  const pad = (n: number) => String(n).padStart(2, '0');
  const ini = horaMinutoEmSaoPaulo(e.inicioISO);
  const fim = horaMinutoEmSaoPaulo(e.fimISO);
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
