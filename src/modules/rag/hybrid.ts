// src/modules/rag/hybrid.ts
export function buildHybridKnowledge(coreContent: string, chunks: string[]): string {
  if (chunks.length === 0) return coreContent;
  return `${coreContent}\n\n## CONHECIMENTO RELEVANTE (RAG)\n\n${chunks.join('\n\n---\n\n')}`;
}
