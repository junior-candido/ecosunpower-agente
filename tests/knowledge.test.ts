import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('KnowledgeBase', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'kb-test-'));
    writeFileSync(join(tempDir, 'empresa.md'), '# Ecosunpower\nEmpresa de energia solar.');
    writeFileSync(join(tempDir, 'faq.md'), '# FAQ\nPergunta: Quanto custa?\nResposta: Depende do consumo.');
  });

  it('should load all markdown files', async () => {
    const { KnowledgeBase } = await import('../src/modules/knowledge.js');
    const kb = new KnowledgeBase(tempDir);
    kb.load();
    const content = kb.getContent();
    expect(content).toContain('Ecosunpower');
    expect(content).toContain('FAQ');
  });

  it('should report token estimate', async () => {
    const { KnowledgeBase } = await import('../src/modules/knowledge.js');
    const kb = new KnowledgeBase(tempDir);
    kb.load();
    const estimate = kb.getTokenEstimate();
    expect(estimate).toBeGreaterThan(0);
    expect(estimate).toBeLessThan(15000);
  });

  it('should detect over limit', async () => {
    const { KnowledgeBase } = await import('../src/modules/knowledge.js');
    const kb = new KnowledgeBase(tempDir);
    kb.load();
    expect(kb.isOverLimit()).toBe(false);
  });

  it('should reload when content changes', async () => {
    const { KnowledgeBase } = await import('../src/modules/knowledge.js');
    const kb = new KnowledgeBase(tempDir);
    kb.load();
    expect(kb.getContent()).not.toContain('Novo conteudo');
    writeFileSync(join(tempDir, 'empresa.md'), '# Ecosunpower\nNovo conteudo.');
    kb.load();
    expect(kb.getContent()).toContain('Novo conteudo');
  });
});
