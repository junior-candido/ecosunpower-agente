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

export interface ResultadoImposto {
  imposto: number;
  efetiva: number;
  faixa: number;
}

export function impostoDaVenda(valor: number, rbt12: number, anexo: Anexo): ResultadoImposto {
  const a = aliquotaEfetiva(rbt12, anexo);
  return { imposto: valor * a.efetiva, efetiva: a.efetiva, faixa: a.faixa };
}

export function proximoSalto(rbt12: number): { limite: number; distancia: number } | null {
  // Só faz sentido mostrar próximo salto até a penúltima faixa.
  // Na faixa 6 (última do Simples) não há próxima faixa interna a escalar.
  const limitesSemUltimo = LIMITES_FAIXA.slice(0, -1); // exclui 4.800.000
  for (const limite of limitesSemUltimo) {
    if (rbt12 < limite) return { limite, distancia: limite - rbt12 };
  }
  return null;
}

export const FATOR_R_MINIMO = 0.28;

export function fatorR(folha12: number, receita12: number): { ratio: number; anexo: 'III' | 'V' } {
  const ratio = receita12 <= 0 ? 0 : folha12 / receita12;
  return { ratio, anexo: ratio >= FATOR_R_MINIMO ? 'III' : 'V' };
}

export function resolverAnexo(
  anexoPadrao: Anexo,
  sujeitoFatorR: boolean,
  folha12: number,
  receita12: number,
): Anexo {
  if (!sujeitoFatorR) return anexoPadrao;
  return fatorR(folha12, receita12).anexo;
}

// Pró-labore mensal mínimo pra manter Fator R >= 28% (folha = proLabore12 + outras).
export function proLaboreMinimoParaAnexoIII(receita12: number, outrasFolhas12: number): number {
  const folha12Min = FATOR_R_MINIMO * receita12;
  const proLabore12 = Math.max(0, folha12Min - outrasFolhas12);
  return proLabore12 / 12;
}
