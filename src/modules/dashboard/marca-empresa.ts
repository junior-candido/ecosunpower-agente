// src/modules/dashboard/marca-empresa.ts
// A marca de cada empresa no painel: logo e cor.
//
// Junior 01/09/2026: "a dashboard pode ficar com a cara da logo deles...
// personalizado e os botões, top" e "queria que amanhã, quando ela abrisse o
// dashboard, já encontrasse de cara nova".
//
// O painel importava `LOGO_ECOSUNPOWER_*` fixa do código e usava âmbar em
// classes Tailwind cravadas — a Conquista Solar via a marca da EcoSunPower no
// painel dela. É o mesmo vazamento de marca que passamos o dia inteiro caçando
// no atendimento, só que na tela.
//
// POR QUE URL E NÃO SÓ BUCKET: o painel monta HTML de forma SÍNCRONA, e baixar
// do bucket é assíncrono. Aceitando URL, o cliente entra com a marca no ar sem
// depender de upload e sem reescrever o render. Quem tem caminho de bucket
// continua sendo atendido pela proposta (que é async e já resolve isso).
import type { EmpresaConfig } from '../empresa-config.js';
import { LOGO_ECOSUNPOWER_BRANCO_BASE64 } from '../proposal/assets/logo-base64.js';

/** Cor da casa (âmbar do painel de sempre) — o que a EcoSun continua vendo. */
export const COR_PADRAO_CASA = '#fbbf24';

/** Logo da casa, embutida no código. */
export const LOGO_PADRAO_CASA = LOGO_ECOSUNPOWER_BRANCO_BASE64;

/** #RRGGBB, e só. Cor inválida vai direto pro CSS e quebra a tela — pior que
 *  cor errada. Na dúvida, a da casa. */
const HEX = /^#[0-9a-f]{6}$/i;

export function corDaMarca(e: EmpresaConfig): string {
  const c = (e.corMarca ?? '').trim();
  return HEX.test(c) ? c : COR_PADRAO_CASA;
}

/** Só http(s). Nada de `javascript:` ou `data:` chegando no src de uma imagem. */
export function logoDaEmpresa(e: EmpresaConfig): string {
  const v = (e.logoStoragePath ?? '').trim();
  if (!/^https?:\/\//i.test(v)) return LOGO_PADRAO_CASA;
  return v;
}
