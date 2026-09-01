// tests/conhecimento-higiene.test.ts
//
// Varredura de 01/09/2026: vários arquivos da base que o tenant lê trazem
// blocos marcados "⚠️ ALERTA INTERNO PARA O JUNIOR (não mostrar ao cliente)" —
// margem real, fornecedor que atrasa, orientação de negociação. Estavam indo
// pro cliente do tenant.
import { describe, it, expect } from 'vitest';
import { removerBlocosInternos } from '../src/modules/conhecimento-higiene.js';

describe('corte dos blocos internos da base', () => {
  it('corta o bloco marcado e mantém o resto do arquivo', () => {
    const md = [
      '# Inversor X',
      '',
      '## ⚠️ ALERTA INTERNO PARA O JUNIOR (não mostrar ao cliente)',
      'Margem real é 40%. Fornecedor atrasa.',
      '',
      '## 1. O que é',
      'Inversor de rede trifásico.',
    ].join('\n');
    const limpo = removerBlocosInternos(md);
    expect(limpo).not.toMatch(/margem real/i);
    expect(limpo).not.toMatch(/alerta interno/i);
    expect(limpo).toContain('# Inversor X');
    expect(limpo).toContain('Inversor de rede trifásico.');
  });

  it('pega as variações de escrita do cabeçalho', () => {
    for (const titulo of [
      '## ⚠️ ALERTA INTERNO PRO JUNIOR (NÃO MOSTRAR AO CLIENTE)',
      '## ALERTA INTERNO (não mostrar ao cliente)',
      '### ⚠️ Alerta interno para o Junior',
      '## Uso interno',
    ]) {
      const md = `${titulo}\nsegredo da casa\n\n## Público\nconteudo bom`;
      const limpo = removerBlocosInternos(md);
      expect(limpo, titulo).not.toMatch(/segredo da casa/);
      expect(limpo, titulo).toContain('conteudo bom');
    }
  });

  it('o corte termina no próximo cabeçalho de nível igual ou maior', () => {
    const md = [
      '# Doc',
      '## Interno (não mostrar ao cliente)',
      'segredo',
      '### detalhe do segredo',
      'mais segredo',
      '## Público',
      'pode ler',
    ].join('\n');
    const limpo = removerBlocosInternos(md);
    expect(limpo).not.toMatch(/segredo/);          // o sub-nível vai junto
    expect(limpo).toContain('pode ler');
    expect(limpo).toContain('# Doc');
  });

  it('arquivo sem bloco interno passa intacto', () => {
    const md = '# Specs\n\n## Potência\n5 kW trifásico.';
    expect(removerBlocosInternos(md)).toBe(md);
  });

  it('não confunde cabeçalho que só fala de outra coisa', () => {
    const md = '## Instalação interna do disjuntor\ntexto técnico';
    expect(removerBlocosInternos(md)).toContain('texto técnico');
  });
});
