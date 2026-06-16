// tests/eva-vitrine-knowledge.test.ts
// Pega o bug que o code review achou: no modo vitrine, a base de conhecimento
// injetada tem de ser a do EcoSof (conhecimento-ecosof/), não a do solar.
import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { KnowledgeBase } from '../src/modules/knowledge.js';
import { conhecimentoDirDoModo } from '../src/modules/eva-modo.js';

afterEach(() => { delete process.env.EVA_MODO; });

describe('Eva vitrine — base de conhecimento', () => {
  it('a pasta do modo vitrine é conhecimento-ecosof', () => {
    process.env.EVA_MODO = 'vitrine_ecosof';
    expect(conhecimentoDirDoModo()).toBe('conhecimento-ecosof');
  });

  it('conhecimento-ecosof carrega produto/planos do EcoSof (não solar)', () => {
    const kb = new KnowledgeBase(join(process.cwd(), 'conhecimento-ecosof'));
    kb.load();
    const c = kb.getContent();
    expect(c).toContain('297');                  // plano Essencial
    expect(c).toContain('597');                  // plano Completo
    expect(c.toLowerCase()).toContain('garantia'); // garantia 30 dias
    expect(c).toMatch(/assistente|EcoSof/i);     // é conhecimento de produto, não de painel solar
  });
});
