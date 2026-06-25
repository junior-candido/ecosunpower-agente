import { dimensionarSistema, type Dimensionamento } from './proposal/calculator.js';
import { PAINEL_PADRAO_W, FATOR_PERDA_CONSERVADOR } from './solar-params.js';

const HSP_BRASILIA = 5.40;

export type SugestaoEquipamento = Dimensionamento;

export function sugerirEquipamento(
  consumoMensalKwh: number,
  hsp: number = HSP_BRASILIA,
): SugestaoEquipamento | null {
  if (consumoMensalKwh <= 0) return null;
  return dimensionarSistema({
    consumoMensalKwh,
    painelPotenciaW: PAINEL_PADRAO_W,
    hsp,
    fatorPerda: FATOR_PERDA_CONSERVADOR,
  });
}
