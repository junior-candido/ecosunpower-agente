import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';

/**
 * KnowledgeBase com 2 tiers:
 *   - Core: arquivos *.md na raiz da pasta. Sempre injetado em cada
 *     mensagem (empresa, produtos, processo, FAQ, qualificacao, objecoes,
 *     mercado, etc).
 *   - Especializado: arquivos *.md na subpasta `especializado/`. Carregados
 *     sob demanda via getSpecialized(filenames) — caller decide quais
 *     baseado em deteccao de topicos no texto do cliente.
 *
 * Reduz tokens injetados em ~50-65% comparado a injetar tudo sempre.
 */
export class KnowledgeBase {
  private directory: string;
  private specializedDir: string;
  private coreContent: string = '';
  private coreTokenEstimate: number = 0;
  private specializedCache: Map<string, string> = new Map();
  private watcher: FSWatcher | null = null;

  constructor(directory: string) {
    this.directory = directory;
    this.specializedDir = join(directory, 'especializado');
  }

  load(): void {
    // Core: arquivos *.md so na raiz (nao recursivo)
    const files = readdirSync(this.directory)
      .filter(f => f.endsWith('.md'))
      .filter(f => {
        const full = join(this.directory, f);
        return statSync(full).isFile();
      })
      .sort();

    const sections = files.map(file => {
      const filePath = join(this.directory, file);
      const fileContent = readFileSync(filePath, 'utf-8');
      return `[${file.replace('.md', '')}]\n${fileContent}`;
    });

    this.coreContent = sections.join('\n\n---\n\n');
    this.coreTokenEstimate = Math.ceil(this.coreContent.length / 4);

    // Pre-carrega cache de especializados (file system rapido)
    this.specializedCache.clear();
    if (existsSync(this.specializedDir)) {
      const specFiles = readdirSync(this.specializedDir).filter(f => f.endsWith('.md'));
      for (const f of specFiles) {
        const content = readFileSync(join(this.specializedDir, f), 'utf-8');
        this.specializedCache.set(f, `[${f.replace('.md', '')}]\n${content}`);
      }
    }
  }

  /**
   * Conhecimento sempre injetado (core).
   */
  getCore(): string {
    return this.coreContent;
  }

  /**
   * Conhecimento especializado por demanda. Recebe lista de filenames
   * (ex: ["dimensionamento.md", "neoenergia-brasilia.md"]) e retorna
   * concatenacao desses arquivos. Arquivos nao encontrados sao ignorados.
   */
  getSpecialized(filenames: string[]): string {
    if (!filenames || filenames.length === 0) return '';
    const sections: string[] = [];
    for (const f of filenames) {
      const content = this.specializedCache.get(f);
      if (content) sections.push(content);
    }
    if (sections.length === 0) return '';
    return '\n\n---\n\n' + sections.join('\n\n---\n\n');
  }

  /**
   * Compatibilidade legada: usado pelo cadence factory (linha 192) e
   * parsing de canal-solar (linha 2187). Retorna core + TODOS especializados.
   * Caller deve preferir getCore() + getSpecialized(detectTopics(text))
   * sempre que tiver texto do cliente disponivel.
   */
  getContent(): string {
    if (this.specializedCache.size === 0) return this.coreContent;
    const allSpecialized = Array.from(this.specializedCache.values()).join('\n\n---\n\n');
    return this.coreContent + '\n\n---\n\n' + allSpecialized;
  }

  getTokenEstimate(): number {
    return this.coreTokenEstimate;
  }

  getSpecializedTokenEstimate(filenames: string[]): number {
    return Math.ceil(this.getSpecialized(filenames).length / 4);
  }

  isOverLimit(): boolean {
    return this.coreTokenEstimate > 15000;
  }

  startWatching(onReload?: () => void): void {
    this.watcher = chokidar.watch(this.directory, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500 },
    });

    this.watcher.on('change', () => {
      this.load();
      onReload?.();
    });

    this.watcher.on('add', () => {
      this.load();
      onReload?.();
    });

    this.watcher.on('unlink', () => {
      this.load();
      onReload?.();
    });
  }

  stopWatching(): void {
    this.watcher?.close();
    this.watcher = null;
  }
}
