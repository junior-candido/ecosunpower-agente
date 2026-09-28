// src/modules/energia/tempo.ts
//
// Relógio da Gestão de Energia. Brasília = UTC−3 fixo (sem horário de verão
// desde 2019). Tudo que é "dia" ou "horário de ponta" é LOCAL — igual
// geracao_diaria.data. Nunca usar o dia UTC: 21h de Brasília já é o dia
// seguinte em UTC, e o consumo da noite cairia no dia errado.

const OFFSET_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 86_400_000;

/** "Relógio de parede" de Brasília guardado num Date (ler só com getUTC*). */
const local = (iso: string | number | Date): Date => new Date(new Date(iso).getTime() - OFFSET_MS);

/** Dia de Brasília (YYYY-MM-DD) de um instante. */
export const diaBrt = (iso: string | number | Date): string => local(iso).toISOString().slice(0, 10);

/** Hora de Brasília (0–23). */
export const horaBrt = (iso: string | number | Date): number => local(iso).getUTCHours();

/** Minuto do dia de Brasília (0–1439). */
export const minutoDoDiaBrt = (iso: string | number | Date): number => {
  const d = local(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

/** Meia-noite de Brasília do dia (YYYY-MM-DD) em ISO UTC. */
export const inicioDoDiaBrtIso = (dia: string): string =>
  new Date(Date.parse(`${dia}T00:00:00.000Z`) + OFFSET_MS).toISOString();

/** Soma n dias a um dia YYYY-MM-DD. */
export const somarDias = (dia: string, n: number): string =>
  new Date(Date.parse(`${dia}T00:00:00.000Z`) + n * DIA_MS).toISOString().slice(0, 10);

function pascoa(ano: number): Date { // algoritmo de Meeus/Jones/Butcher
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}
const somaDiasData = (d: Date, n: number) => new Date(d.getTime() + n * DIA_MS).toISOString().slice(0, 10);

/**
 * Feriados nacionais tratados como fora de ponta. Fixos + móveis (Carnaval,
 * Sexta-feira Santa, Corpus Christi). Consciência Negra (20/11) é nacional desde
 * a Lei 14.759/2023 — CONFERIR se a distribuidora já aplica no posto tarifário.
 */
export function feriadosNacionais(ano: number): Set<string> {
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map((md) => `${ano}-${md}`);
  const p = pascoa(ano);
  return new Set([...fixos, somaDiasData(p, -48), somaDiasData(p, -47), somaDiasData(p, -2), somaDiasData(p, 60)]);
}

export type Posto = 'ponta' | 'intermediario' | 'fora_ponta';
/** Minutos do dia de Brasília, intervalo [inicio, fim). */
export interface HorarioPonta { inicioMin: number; fimMin: number }
/** Neoenergia Brasília: 18h–21h (CONFERIR na resolução homologatória vigente). */
export const PONTA_PADRAO: HorarioPonta = { inicioMin: 18 * 60, fimMin: 21 * 60 };

/** Posto tarifário de um instante. Fim de semana e feriado nacional = fora de ponta. */
export function postoTarifario(iso: string, ponta: HorarioPonta = PONTA_PADRAO): Posto {
  const d = local(iso);
  const dow = d.getUTCDay();
  const dia = d.toISOString().slice(0, 10);
  if (dow === 0 || dow === 6 || feriadosNacionais(d.getUTCFullYear()).has(dia)) return 'fora_ponta';
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (m >= ponta.inicioMin && m < ponta.fimMin) return 'ponta';
  if ((m >= ponta.inicioMin - 60 && m < ponta.inicioMin) || (m >= ponta.fimMin && m < ponta.fimMin + 60)) return 'intermediario';
  return 'fora_ponta';
}
