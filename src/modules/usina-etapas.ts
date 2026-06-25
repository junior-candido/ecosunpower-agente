// src/modules/usina-etapas.ts
// Módulo puro: etapas do ciclo de vida de uma usina solar.
// Sem banco, sem tela — só lógica e tipos exportáveis.

export type EtapaUsinaSlug =
  | 'projeto'
  | 'aprovacao'
  | 'instalacao'
  | 'vistoria'
  | 'homologacao'
  | 'operacao';

export interface EtapaUsina {
  readonly slug: EtapaUsinaSlug;
  readonly label: string;
  readonly ordem: number; // 0–5, direto para progress bar na UI
}

export const ETAPAS_USINA: readonly EtapaUsina[] = [
  { slug: 'projeto',     label: 'Projeto',     ordem: 0 },
  { slug: 'aprovacao',   label: 'Aprovação',   ordem: 1 },
  { slug: 'instalacao',  label: 'Instalação',  ordem: 2 },
  { slug: 'vistoria',    label: 'Vistoria',    ordem: 3 },
  { slug: 'homologacao', label: 'Homologação', ordem: 4 },
  { slug: 'operacao',    label: 'Operação',    ordem: 5 },
];

// Índice O(1) — evita percorrer o array a cada chamada
const IDX: Record<EtapaUsinaSlug, number> = Object.fromEntries(
  ETAPAS_USINA.map(e => [e.slug, e.ordem]),
) as Record<EtapaUsinaSlug, number>;

/** Retorna o índice numérico (0–5) da etapa — útil para progress bars. */
export function ordemEtapa(slug: EtapaUsinaSlug): number {
  return IDX[slug];
}

/** Próxima etapa sequencial. Na última, permanece na última. */
export function proximaEtapaUsina(atual: EtapaUsinaSlug): EtapaUsinaSlug {
  return ETAPAS_USINA[IDX[atual] + 1]?.slug ?? atual;
}

/** Etapa anterior sequencial. Na primeira, permanece na primeira. */
export function etapaAnteriorUsina(atual: EtapaUsinaSlug): EtapaUsinaSlug {
  return ETAPAS_USINA[IDX[atual] - 1]?.slug ?? atual;
}

/** Verdadeiro se destino está à frente de atual (saltos permitidos). */
export function podeAvancarPara(
  atual: EtapaUsinaSlug,
  destino: EtapaUsinaSlug,
): boolean {
  return IDX[destino] > IDX[atual];
}

/** Verdadeiro se destino está atrás de atual (saltos permitidos). */
export function podeRetrocederPara(
  atual: EtapaUsinaSlug,
  destino: EtapaUsinaSlug,
): boolean {
  return IDX[destino] < IDX[atual];
}

/** Direção da transição — útil para UI (ícone/cor da seta). */
export function direcaoTransicao(
  atual: EtapaUsinaSlug,
  destino: EtapaUsinaSlug,
): 'avanco' | 'retrocesso' | 'mesmo' {
  const diff = IDX[destino] - IDX[atual];
  if (diff > 0) return 'avanco';
  if (diff < 0) return 'retrocesso';
  return 'mesmo';
}
