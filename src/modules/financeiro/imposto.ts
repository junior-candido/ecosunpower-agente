import { ANEXOS, LIMITES_FAIXA, type Anexo } from './anexos.js';

export interface ResultadoAliquota {
  faixa: number;
  nominal: number;
  deduzir: number;
  efetiva: number; // decimal
}

export function faixaPorRBT12(rbt12: number): number {
  for (let i = 0; i < LIMITES_FAIXA.length; i++) {
    if (rbt12 <= LIMITES_FAIXA[i]) return i + 1;
  }
  return 6; // acima do teto, trata como 6ª (fora do Simples é outro problema)
}

export function aliquotaEfetiva(rbt12: number, anexo: Anexo): ResultadoAliquota {
  const faixa = faixaPorRBT12(rbt12);
  const linha = ANEXOS[anexo][faixa - 1];
  const efetiva =
    rbt12 <= 0 ? ANEXOS[anexo][0].nominal : (rbt12 * linha.nominal - linha.deduzir) / rbt12;
  return { faixa, nominal: linha.nominal, deduzir: linha.deduzir, efetiva };
}
