// Tabelas do Simples Nacional (LC 123/2006, vigentes 2026). Anexo III + fórmula
// confirmados por deep-research 07/06/2026; Anexos I/II/IV/V de fonte secundária
// convergente com a lei (confirmar I e V com contador). Espelhadas na migration 046.

export type Anexo = 'I' | 'II' | 'III' | 'IV' | 'V';

export interface LinhaAnexo {
  faixa: number;   // 1..6
  nominal: number; // decimal (ex.: 0.112 = 11,2%)
  deduzir: number; // R$
}

// Limites de RBT12 por faixa (iguais pra todos os anexos).
export const LIMITES_FAIXA: number[] = [180000, 360000, 720000, 1800000, 3600000, 4800000];

// nominal/deduzir por anexo, faixa 1..6 em ordem.
export const ANEXOS: Record<Anexo, LinhaAnexo[]> = {
  I: [
    { faixa: 1, nominal: 0.04, deduzir: 0 },
    { faixa: 2, nominal: 0.073, deduzir: 5940 },
    { faixa: 3, nominal: 0.095, deduzir: 13860 },
    { faixa: 4, nominal: 0.107, deduzir: 22500 },
    { faixa: 5, nominal: 0.143, deduzir: 87300 },
    { faixa: 6, nominal: 0.19, deduzir: 378000 },
  ],
  II: [
    { faixa: 1, nominal: 0.045, deduzir: 0 },
    { faixa: 2, nominal: 0.078, deduzir: 5940 },
    { faixa: 3, nominal: 0.10, deduzir: 13860 },
    { faixa: 4, nominal: 0.112, deduzir: 22500 },
    { faixa: 5, nominal: 0.147, deduzir: 85500 },
    { faixa: 6, nominal: 0.30, deduzir: 720000 },
  ],
  III: [
    { faixa: 1, nominal: 0.06, deduzir: 0 },
    { faixa: 2, nominal: 0.112, deduzir: 9360 },
    { faixa: 3, nominal: 0.135, deduzir: 17640 },
    { faixa: 4, nominal: 0.16, deduzir: 35640 },
    { faixa: 5, nominal: 0.21, deduzir: 125640 },
    { faixa: 6, nominal: 0.33, deduzir: 648000 },
  ],
  IV: [
    { faixa: 1, nominal: 0.045, deduzir: 0 },
    { faixa: 2, nominal: 0.09, deduzir: 8100 },
    { faixa: 3, nominal: 0.102, deduzir: 12420 },
    { faixa: 4, nominal: 0.14, deduzir: 39780 },
    { faixa: 5, nominal: 0.22, deduzir: 183780 },
    { faixa: 6, nominal: 0.33, deduzir: 828000 },
  ],
  V: [
    { faixa: 1, nominal: 0.155, deduzir: 0 },
    { faixa: 2, nominal: 0.18, deduzir: 4500 },
    { faixa: 3, nominal: 0.195, deduzir: 9900 },
    { faixa: 4, nominal: 0.205, deduzir: 17100 },
    { faixa: 5, nominal: 0.23, deduzir: 62100 },
    { faixa: 6, nominal: 0.305, deduzir: 540000 },
  ],
};
