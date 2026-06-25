// usinas-queries.ts
// Consultas e agrupamentos puros para usinas/sistemas_clientes.
// Sem rede, sem DB — só lógica sobre arrays recebidos de fora.

import { ETAPAS_USINA, type EtapaUsinaSlug } from '../usina-etapas.js';

// Agrupa usinas por etapa_obra na ordem de ETAPAS_USINA. PURA. Retorna SEMPRE
// todas as 6 chaves (mesmo vazias), na ordem. Usinas com etapa_obra fora de
// ETAPAS_USINA são ignoradas — não viram coluna.
export function agruparUsinasPorEtapaObra<T extends { etapa_obra: string }>(
  usinas: T[],
): Record<EtapaUsinaSlug, T[]> {
  const grupos = {} as Record<EtapaUsinaSlug, T[]>;
  for (const etapa of ETAPAS_USINA) grupos[etapa.slug] = [];
  for (const usina of usinas) {
    const arr = grupos[usina.etapa_obra as EtapaUsinaSlug];
    if (arr) arr.push(usina); // ignora etapa_obra fora de ETAPAS_USINA
  }
  return grupos;
}
