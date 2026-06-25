const HSP_BRASILIA = 5.40;
const FATOR_PERDA_DEFAULT = 0.80;

export function calcularGeracaoMensal(
  potenciaKwp: number,
  hsp: number = HSP_BRASILIA,
  fatorPerda: number = FATOR_PERDA_DEFAULT,
): number {
  if (potenciaKwp <= 0) return 0;
  return potenciaKwp * hsp * 30 * fatorPerda;
}

export function calcularGeracaoAnual(
  potenciaKwp: number,
  hsp: number = HSP_BRASILIA,
  fatorPerda: number = FATOR_PERDA_DEFAULT,
): number {
  return calcularGeracaoMensal(potenciaKwp, hsp, fatorPerda) * 12;
}
