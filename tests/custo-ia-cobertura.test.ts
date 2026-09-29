// Rede de segurança: TODA chamada ao Claude tem que ser medida (custo por
// empresa). Em 28/09/2026 havia 12 arquivos chamando a IA sem medir nada —
// inclusive a leitura de foto e de PDF da conversa (Opus), que o cliente da
// Clara também usa. Arquivo novo que chama messages.create sem medirIa quebra aqui.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', 'src');
// leitor.ts mede pelo gancho `medir` das rotas (index.ts liga o medirIa);
// pdf-guard.ts só cita messages.create num comentário.
const EXCECOES = new Set(['modules/leitor-ia/leitor.ts', 'modules/pdf-guard.ts']);

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('toda chamada de IA é medida', () => {
  it('arquivo com messages.create também chama medirIa', () => {
    const faltando = arquivos(SRC)
      .map((p) => ({ rel: p.slice(SRC.length + 1).replace(/\\/g, '/'), txt: readFileSync(p, 'utf8') }))
      .filter((f) => !EXCECOES.has(f.rel) && /\.messages\s*\.create\(/.test(f.txt))
      .filter((f) => !/medirIa\(/.test(f.txt))
      .map((f) => f.rel);
    expect(faltando).toEqual([]);
  });

  it('origens gravadas no padrão tipo:detalhe', () => {
    const todas = arquivos(SRC)
      .flatMap((p) => [...readFileSync(p, 'utf8').matchAll(/medirIa\(\{[^}]*origem:\s*'([^']+)'/g)].map((m) => m[1]));
    expect(todas.length).toBeGreaterThan(25);
    const ruins = todas.filter((o) => !/^(conversa|midia|resumo|reativacao|escrita|admin):[a-z0-9-]+$/.test(o));
    expect(ruins).toEqual([]);
  });
});
