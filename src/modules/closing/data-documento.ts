// src/modules/closing/data-documento.ts
//
// 📅 A data que sai impressa no contrato/procuração.
//
// Duas regras:
//  1. É a data de BRASÍLIA, nunca a do servidor. O servidor roda em UTC: às 22:30
//     em Brasília ele já está no dia seguinte, e o documento saía datado de amanhã.
//  2. Documento CONGELADO ("este é o contrato que vale") imprime a data do
//     congelamento — reimprimir amanhã não pode mudar a data de um contrato.

const FUSO = 'America/Sao_Paulo';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** "YYYY-MM-DD" de um instante, no calendário de Brasília. */
function isoNoFuso(d: Date): string {
  // en-CA formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** A data de HOJE em Brasília ("YYYY-MM-DD"). */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return isoNoFuso(agora);
}

/**
 * Converte o que o banco guardou numa data de Brasília ("YYYY-MM-DD").
 * Data pura ("2026-07-13") passa direto — o `new Date()` a leria como meia-noite
 * UTC e, em Brasília, ela viraria o dia anterior. Timestamp com hora é convertido
 * pro fuso. Lixo → null.
 */
export function dataIsoEmBrasilia(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return isoNoFuso(d);
}

/** "2026-09-27" → "27 de setembro de 2026" (sem passar por fuso nenhum). */
export function dataPorExtenso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return String(iso ?? '');
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

/** "2026-09-27" → "27/09/2026". */
export function dataCurtaBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso ?? '');
}
