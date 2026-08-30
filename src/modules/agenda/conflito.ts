// src/modules/agenda/conflito.ts
// Detector de conflito de horário + sugestão do primeiro slot livre (Eva
// Agenda A1). LeitorAgenda é a interface estreita injetada — o
// CalendarService real (src/modules/calendar.ts, método listarEventos)
// satisfaz ela estruturalmente, mas os testes injetam um mock puro, sem
// nunca bater no Google Calendar de verdade.

export interface EventoAgenda {
  id: string;
  titulo: string;
  inicioISO: string;
  fimISO: string;
  criadoPelaEva: boolean;
}

export interface LeitorAgenda {
  listarEventos(inicioISO: string, fimISO: string): Promise<EventoAgenda[]>;
}

// Dois intervalos conflitam quando se sobrepõem de verdade — bordas
// encostando (fim de um == início do outro) NÃO é conflito.
function sobrepoe(existenteInicio: number, existenteFim: number, novoInicio: number, novoFim: number): boolean {
  return existenteInicio < novoFim && existenteFim > novoInicio;
}

// Lista os eventos existentes que chocam com o período [inicioISO, fimISO).
export async function acharConflitos(cal: LeitorAgenda, inicioISO: string, fimISO: string): Promise<EventoAgenda[]> {
  const eventos = await cal.listarEventos(inicioISO, fimISO);
  const novoInicio = new Date(inicioISO).getTime();
  const novoFim = new Date(fimISO).getTime();
  return eventos.filter((e) =>
    sobrepoe(new Date(e.inicioISO).getTime(), new Date(e.fimISO).getTime(), novoInicio, novoFim),
  );
}

// Monta um instante ISO com offset -03:00 fixo pra uma data (YYYY-MM-DD) e
// hora local — mesma técnica de interpretar.ts (construirISO), reimplementada
// aqui localmente pra não criar dependência entre os dois módulos.
function construirISO(dataISO: string, hour: number, minute: number): string {
  const [y, m, d] = dataISO.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}T${pad(hour)}:${pad(minute)}:00-03:00`;
}

const HORA_INICIO_VARREDURA = 7; // 07:00
const HORA_FIM_VARREDURA = 20;   // 20:00 — nenhum slot pode terminar depois disso
const PASSO_MIN = 30;

// Acha o primeiro slot livre de `duracaoMin` minutos no dia `dataISO`
// (YYYY-MM-DD), varrendo de 07:00 a 20:00 em passos de 30min. O slot
// precisa TERMINAR até 20:00. Devolve null se nada couber no dia.
export async function sugerirHorario(
  cal: LeitorAgenda,
  dataISO: string,
  duracaoMin: number,
): Promise<{ inicioISO: string; fimISO: string } | null> {
  const inicioDia = construirISO(dataISO, 0, 0);
  const fimDia = construirISO(dataISO, 23, 59);
  const eventos = await cal.listarEventos(inicioDia, fimDia);
  const ocupados = eventos.map((e) => ({
    inicio: new Date(e.inicioISO).getTime(),
    fim: new Date(e.fimISO).getTime(),
  }));

  const minutoInicioVarredura = HORA_INICIO_VARREDURA * 60;
  const minutoFimVarredura = HORA_FIM_VARREDURA * 60; // 20:00 em minutos desde 00:00
  const fimVarreduraMs = new Date(construirISO(dataISO, HORA_FIM_VARREDURA, 0)).getTime();

  for (let minutos = minutoInicioVarredura; minutos <= minutoFimVarredura; minutos += PASSO_MIN) {
    const hour = Math.floor(minutos / 60);
    const minute = minutos % 60;

    const slotInicioISO = construirISO(dataISO, hour, minute);
    const slotInicioMs = new Date(slotInicioISO).getTime();
    const slotFimMs = slotInicioMs + duracaoMin * 60_000;

    if (slotFimMs > fimVarreduraMs) break; // slot terminaria depois das 20h → não cabe mais nada hoje

    const conflita = ocupados.some((o) => sobrepoe(o.inicio, o.fim, slotInicioMs, slotFimMs));
    if (!conflita) {
      return { inicioISO: slotInicioISO, fimISO: isoComOffset(slotFimMs) };
    }
  }

  return null;
}

// Converte um timestamp (ms) de volta pra string ISO com offset -03:00 fixo
// (sem depender do TZ do host, igual construirISO em interpretar.ts).
function isoComOffset(ms: number): string {
  const dt = new Date(ms - 3 * 3_600_000); // desloca pra "wall clock" -03:00 e lê como UTC
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:00-03:00`;
}
