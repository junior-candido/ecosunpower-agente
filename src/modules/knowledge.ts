import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';

export class KnowledgeBase {
  private directory: string;
  private content: string = '';
  private tokenEstimate: number = 0;
  private watcher: FSWatcher | null = null;

  constructor(directory: string) {
    this.directory = directory;
  }

  load(): void {
    const files = readdirSync(this.directory)
      .filter(f => f.endsWith('.md'))
      .sort();

    const sections = files.map(file => {
      const filePath = join(this.directory, file);
      const fileContent = readFileSync(filePath, 'utf-8');
      return `[${file.replace('.md', '')}]\n${fileContent}`;
    });

    this.content = sections.join('\n\n---\n\n');
    this.tokenEstimate = Math.ceil(this.content.length / 4);
  }

  getContent(): string {
    return this.content;
  }

  getTokenEstimate(): number {
    return this.tokenEstimate;
  }

  isOverLimit(): boolean {
    return this.tokenEstimate > 15000;
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
  }

  stopWatching(): void {
    this.watcher?.close();
    this.watcher = null;
  }
}
