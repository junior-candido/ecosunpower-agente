import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { ehComum } from './conhecimento-escopo.js';
import { ehEcosun } from './empresa-config.js';
import { removerBlocosInternos } from './conhecimento-higiene.js';

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
  // [MULTI-TENANT] Recorte COMUM: só o material técnico que vale pra qualquer
  // empresa (ver conhecimento-escopo.ts). A assistente de um tenant lê ISTO —
  // sem os nossos preços, região, casos e processo. A EcoSun continua lendo tudo.
  private coreComum: string = '';
  private specializedComum: Map<string, string> = new Map();

  /** Fora de contexto de tenant = EcoSun = base inteira (comportamento histórico). */
  private soComum(): boolean {
    return !ehEcosun();
  }

  /** Pro tenant, o texto sai sem os nomes da casa e sem os blocos internos.
   *  Pra EcoSun passa intacto — a base é dela e está escrita com o nome dela.
   *  Roda na ENTREGA (não no load) porque a empresa em contexto muda por mensagem. */
  private paraQuemLe(texto: string): string {
    if (!this.soComum() || !texto) return texto;
    return removerBlocosInternos(texto);
  }

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
    this.coreComum = files
      .filter(f => ehComum(f, 'core'))
      .map(f => `[${f.replace('.md', '')}]\n${readFileSync(join(this.directory, f), 'utf-8')}`)
      .join('\n\n---\n\n');

    // Pre-carrega cache de especializados (file system rapido)
    this.specializedCache.clear();
    this.specializedComum.clear();
    if (existsSync(this.specializedDir)) {
      const specFiles = readdirSync(this.specializedDir).filter(f => f.endsWith('.md'));
      for (const f of specFiles) {
        const content = readFileSync(join(this.specializedDir, f), 'utf-8');
        const secao = `[${f.replace('.md', '')}]\n${content}`;
        this.specializedCache.set(f, secao);
        if (ehComum(f, 'especializado')) this.specializedComum.set(f, secao);
      }
    }
  }

  /**
   * Conhecimento sempre injetado (core).
   */
  getCore(): string {
    return this.paraQuemLe(this.soComum() ? this.coreComum : this.coreContent);
  }

  /**
   * Conhecimento especializado por demanda. Recebe lista de filenames
   * (ex: ["dimensionamento.md", "neoenergia-brasilia.md"]) e retorna
   * concatenacao desses arquivos. Arquivos nao encontrados sao ignorados.
   */
  getSpecialized(filenames: string[]): string {
    if (!filenames || filenames.length === 0) return '';
    const fonte = this.soComum() ? this.specializedComum : this.specializedCache;
    const sections: string[] = [];
    for (const f of filenames) {
      const content = fonte.get(f);
      if (content) sections.push(content);
    }
    if (sections.length === 0) return '';
    return this.paraQuemLe('\n\n---\n\n' + sections.join('\n\n---\n\n'));
  }

  /**
   * Compatibilidade legada: usado pelo cadence factory (linha 192) e
   * parsing de canal-solar (linha 2187). Retorna core + TODOS especializados.
   * Caller deve preferir getCore() + getSpecialized(detectTopics(text))
   * sempre que tiver texto do cliente disponivel.
   */
  getContent(): string {
    const core = this.getCore();
    const fonte = this.soComum() ? this.specializedComum : this.specializedCache;
    if (fonte.size === 0) return core;
    const allSpecialized = this.paraQuemLe(Array.from(fonte.values()).join('\n\n---\n\n'));
    return core + '\n\n---\n\n' + allSpecialized;
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
