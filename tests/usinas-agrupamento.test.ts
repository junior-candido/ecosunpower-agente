// tests/usinas-agrupamento.test.ts
import { describe, it, expect } from 'vitest';
import { agruparUsinasPorEtapaObra } from '../src/modules/monitoring/usinas-queries.js';
import { ETAPAS_USINA } from '../src/modules/usina-etapas.js';

type UsinaSimples = { id: number; etapa_obra: string };

describe('agruparUsinasPorEtapaObra', () => {
  it('retorna sempre todas as 6 etapas como chaves, mesmo sem usinas', () => {
    const grupos = agruparUsinasPorEtapaObra([]);
    const chaves = Object.keys(grupos);
    expect(chaves).toEqual(ETAPAS_USINA.map((e) => e.slug));
  });

  it('as chaves estão na ordem de ETAPAS_USINA', () => {
    const grupos = agruparUsinasPorEtapaObra([]);
    const chaves = Object.keys(grupos);
    for (let i = 0; i < ETAPAS_USINA.length; i++) {
      expect(chaves[i]).toBe(ETAPAS_USINA[i].slug);
    }
  });

  it('coloca cada usina na coluna correta', () => {
    const usinas: UsinaSimples[] = [
      { id: 1, etapa_obra: 'projeto' },
      { id: 2, etapa_obra: 'instalacao' },
      { id: 3, etapa_obra: 'operacao' },
      { id: 4, etapa_obra: 'instalacao' },
    ];
    const grupos = agruparUsinasPorEtapaObra(usinas);

    expect(grupos.projeto).toEqual([{ id: 1, etapa_obra: 'projeto' }]);
    expect(grupos.instalacao).toHaveLength(2);
    expect(grupos.operacao).toEqual([{ id: 3, etapa_obra: 'operacao' }]);
  });

  it('etapas sem usinas ficam como arrays vazios', () => {
    const usinas: UsinaSimples[] = [{ id: 1, etapa_obra: 'projeto' }];
    const grupos = agruparUsinasPorEtapaObra(usinas);

    expect(grupos.aprovacao).toEqual([]);
    expect(grupos.instalacao).toEqual([]);
    expect(grupos.vistoria).toEqual([]);
    expect(grupos.homologacao).toEqual([]);
    expect(grupos.operacao).toEqual([]);
  });

  it('ignora usinas com etapa_obra desconhecida', () => {
    const usinas: UsinaSimples[] = [
      { id: 1, etapa_obra: 'projeto' },
      { id: 2, etapa_obra: 'etapa_inventada' },
      { id: 3, etapa_obra: 'cancelado' },
    ];
    const grupos = agruparUsinasPorEtapaObra(usinas);

    expect(grupos.projeto).toHaveLength(1);
    // etapas desconhecidas não viram chave nova
    expect('etapa_inventada' in grupos).toBe(false);
    expect('cancelado' in grupos).toBe(false);
  });

  it('funciona com tipos genéricos além de UsinaSimples', () => {
    type UsinaCompleta = { id: string; nome: string; etapa_obra: string; ativo: boolean };
    const usinas: UsinaCompleta[] = [
      { id: 'abc', nome: 'Casa Silva', etapa_obra: 'homologacao', ativo: true },
      { id: 'def', nome: 'Casa Souza', etapa_obra: 'homologacao', ativo: false },
    ];
    const grupos = agruparUsinasPorEtapaObra(usinas);

    expect(grupos.homologacao).toHaveLength(2);
    expect(grupos.homologacao[0].nome).toBe('Casa Silva');
  });
});
