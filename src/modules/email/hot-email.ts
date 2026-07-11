export type EmailComportamento = { aberturas: number; cliques: number };

export function isLeadQuentePorEmail(
  c: EmailComportamento,
  opts: { minAberturas: number }
): boolean {
  return c.cliques >= 1 || c.aberturas >= opts.minAberturas;
}
