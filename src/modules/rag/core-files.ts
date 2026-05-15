import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const CORE_FILES: ReadonlySet<string> = new Set([
  'empresa.md', 'faq.md', 'objecoes.md',
  'perguntas-qualificacao.md', 'processo.md', 'indicacao.md',
]);

export function isCoreFile(relPath: string): boolean {
  return CORE_FILES.has(relPath.replace(/\\/g, '/'));
}

/** Concatena os 6 core lidos do disco (sempre injetados no brain). */
export function loadCoreContent(conhecimentoDir: string): string {
  const parts: string[] = [];
  for (const f of CORE_FILES) {
    const p = join(conhecimentoDir, f);
    if (existsSync(p)) parts.push(`[${f.replace('.md','')}]\n${readFileSync(p, 'utf-8')}`);
  }
  return parts.join('\n\n');
}
