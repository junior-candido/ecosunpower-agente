import type { PostTopicType } from '../marketing.js';

// Os 6 tipos de post que rotacionamos. Fonte única pra seleção anti-repetição.
export const ALL_TOPIC_TYPES: PostTopicType[] = [
  'objecao_desmistificada',
  'dica_tecnica',
  'economia_antes_depois',
  'curiosidade_setor',
  'lei_regulacao',
  'comparativo',
];

// Escolhe um tipo de post evitando os recentes (excludeTypes). Se a exclusão
// esgotar a lista, usa todos. rng injetável pra teste determinístico.
export function pickTopicType(
  excludeTypes: PostTopicType[] = [],
  rng: () => number = Math.random,
): PostTopicType {
  const candidatos = ALL_TOPIC_TYPES.filter((t) => !excludeTypes.includes(t));
  const pool = candidatos.length > 0 ? candidatos : ALL_TOPIC_TYPES;
  return pool[Math.floor(rng() * pool.length)] ?? pool[0]!;
}
