import { describe, it, expect } from 'vitest';
import { CORE_FILES, isCoreFile } from '../../src/modules/rag/core-files.js';

describe('core-files', () => {
  it('tem exatamente os 6 core', () => {
    expect([...CORE_FILES].sort()).toEqual(
      ['empresa.md','faq.md','indicacao.md','objecoes.md','perguntas-qualificacao.md','processo.md'].sort());
  });
  it('isCoreFile reconhece core e ignora resto', () => {
    expect(isCoreFile('empresa.md')).toBe(true);
    expect(isCoreFile('especializado/dimensionamento.md')).toBe(false);
    expect(isCoreFile('faq.md')).toBe(true);
  });
});
