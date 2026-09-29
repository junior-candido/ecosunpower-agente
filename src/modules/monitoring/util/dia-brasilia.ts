// Calendário de BRASÍLIA pro monitoramento — fonte única.
//
// O servidor roda em UTC. Das 21h às 24h de Brasília o "hoje" em UTC já é
// AMANHÃ: a tela mostrava o dia seguinte vazio, o mês zerava no último dia às
// 21h e o sync pedia (e alguns adapters gravavam 0 kWh em) um dia que ainda não
// existe. Tudo que é "dia" no monitoramento passa por aqui.
//
// Brasília não tem horário de verão desde 2019 → UTC-3 fixo (mesma regra do
// Command Center / demonstrativos-tela).

const OFFSET_MS = 3 * 60 * 60 * 1000;

/** YYYY-MM-DD do dia corrente em Brasília. */
export function hojeBrasilia(agora: Date = new Date()): string {
  return new Date(agora.getTime() - OFFSET_MS).toISOString().slice(0, 10);
}

/** Soma (ou subtrai) dias numa data YYYY-MM-DD — puro calendário, sem fuso. */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** YYYY-MM-01 do mês corrente em Brasília. */
export function inicioMesBrasilia(agora: Date = new Date()): string {
  return `${hojeBrasilia(agora).slice(0, 7)}-01`;
}

/** YYYY-01-01 do ano corrente em Brasília. */
export function inicioAnoBrasilia(agora: Date = new Date()): string {
  return `${hojeBrasilia(agora).slice(0, 4)}-01-01`;
}

/** "23/09" a partir de "2026-09-23". */
export function dataCurtaBr(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * Meia-noite UTC do dia de Brasília — pra funções que leem a data com
 * getUTC*() (ex.: navegacao do calendário) enxergarem o dia certo.
 */
export function dataBrasiliaComoUtc(agora: Date = new Date()): Date {
  return new Date(`${hojeBrasilia(agora)}T00:00:00Z`);
}

/** Janela do sync: [hoje-N, hoje] no calendário de Brasília (nunca amanhã). */
export function janelaSync(agora: Date, dias: number): { dataInicio: string; dataFim: string } {
  const hoje = hojeBrasilia(agora);
  return { dataInicio: somarDias(hoje, -dias), dataFim: hoje };
}

/** Descarta dias depois do hoje de Brasília (portal que devolve dia futuro com 0). */
export function limitarAoHoje<T extends { data: string }>(geracoes: T[], hoje: string): T[] {
  return geracoes.filter((g) => g.data <= hoje);
}
