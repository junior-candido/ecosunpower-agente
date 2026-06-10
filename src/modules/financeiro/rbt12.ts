export interface BucketReceita {
  competencia: string; // 'YYYY-MM'
  receita: number;
}

// Os n meses ANTERIORES à competência (não inclui o próprio mês de apuração).
export function mesesAnteriores(competencia: string, n: number): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) {
    throw new Error(`Competência inválida: ${competencia} (esperado YYYY-MM)`);
  }
  const [y, m] = competencia.split('-').map(Number);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    out.push(`${d.getUTCFullYear()}-${mm}`);
  }
  return out;
}

// RBT12 = receita bruta acumulada nos 12 meses anteriores ao período de apuração.
export function calcularRBT12(buckets: BucketReceita[], competenciaRef: string): number {
  const janela = new Set(mesesAnteriores(competenciaRef, 12));
  return buckets
    .filter((b) => janela.has(b.competencia))
    .reduce((soma, b) => soma + b.receita, 0);
}
