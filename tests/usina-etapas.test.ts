// tests/usina-etapas.test.ts
import { describe, it, expect } from 'vitest';
import {
  ETAPAS_USINA,
  ordemEtapa,
  proximaEtapaUsina,
  etapaAnteriorUsina,
  podeAvancarPara,
  podeRetrocederPara,
  direcaoTransicao,
} from '../src/modules/usina-etapas.js';

describe('ETAPAS_USINA', () => {
  it('tem 6 etapas na ordem certa', () => {
    const slugs = ETAPAS_USINA.map(e => e.slug);
    expect(slugs).toEqual([
      'projeto', 'aprovacao', 'instalacao', 'vistoria', 'homologacao', 'operacao',
    ]);
  });

  it('cada etapa tem label legível e ordem 0–5', () => {
    ETAPAS_USINA.forEach((e, i) => {
      expect(typeof e.label).toBe('string');
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.ordem).toBe(i);
    });
  });
});

describe('ordemEtapa', () => {
  it('retorna o índice correto de cada etapa', () => {
    expect(ordemEtapa('projeto')).toBe(0);
    expect(ordemEtapa('aprovacao')).toBe(1);
    expect(ordemEtapa('instalacao')).toBe(2);
    expect(ordemEtapa('vistoria')).toBe(3);
    expect(ordemEtapa('homologacao')).toBe(4);
    expect(ordemEtapa('operacao')).toBe(5);
  });
});

describe('proximaEtapaUsina', () => {
  it('avança uma etapa sequencialmente', () => {
    expect(proximaEtapaUsina('projeto')).toBe('aprovacao');
    expect(proximaEtapaUsina('aprovacao')).toBe('instalacao');
    expect(proximaEtapaUsina('instalacao')).toBe('vistoria');
    expect(proximaEtapaUsina('vistoria')).toBe('homologacao');
    expect(proximaEtapaUsina('homologacao')).toBe('operacao');
  });

  it('na última etapa, continua na última', () => {
    expect(proximaEtapaUsina('operacao')).toBe('operacao');
  });
});

describe('etapaAnteriorUsina', () => {
  it('recua uma etapa sequencialmente', () => {
    expect(etapaAnteriorUsina('aprovacao')).toBe('projeto');
    expect(etapaAnteriorUsina('instalacao')).toBe('aprovacao');
    expect(etapaAnteriorUsina('vistoria')).toBe('instalacao');
    expect(etapaAnteriorUsina('homologacao')).toBe('vistoria');
    expect(etapaAnteriorUsina('operacao')).toBe('homologacao');
  });

  it('na primeira etapa, continua na primeira', () => {
    expect(etapaAnteriorUsina('projeto')).toBe('projeto');
  });
});

describe('podeAvancarPara', () => {
  it('aceita qualquer destino à frente, incluindo saltos', () => {
    expect(podeAvancarPara('projeto', 'aprovacao')).toBe(true);
    expect(podeAvancarPara('projeto', 'operacao')).toBe(true);   // salto longo
    expect(podeAvancarPara('instalacao', 'homologacao')).toBe(true); // salto médio
  });

  it('rejeita retrocesso e mesma etapa', () => {
    expect(podeAvancarPara('instalacao', 'aprovacao')).toBe(false);
    expect(podeAvancarPara('operacao', 'projeto')).toBe(false);
    expect(podeAvancarPara('vistoria', 'vistoria')).toBe(false);
  });
});

describe('podeRetrocederPara', () => {
  it('aceita qualquer destino atrás, incluindo saltos', () => {
    expect(podeRetrocederPara('operacao', 'homologacao')).toBe(true);
    expect(podeRetrocederPara('operacao', 'projeto')).toBe(true);  // salto longo
    expect(podeRetrocederPara('vistoria', 'aprovacao')).toBe(true);
  });

  it('rejeita avanço e mesma etapa', () => {
    expect(podeRetrocederPara('aprovacao', 'instalacao')).toBe(false);
    expect(podeRetrocederPara('projeto', 'operacao')).toBe(false);
    expect(podeRetrocederPara('instalacao', 'instalacao')).toBe(false);
  });
});

describe('direcaoTransicao', () => {
  it('identifica avanço', () => {
    expect(direcaoTransicao('projeto', 'operacao')).toBe('avanco');
    expect(direcaoTransicao('instalacao', 'vistoria')).toBe('avanco');
  });

  it('identifica retrocesso', () => {
    expect(direcaoTransicao('operacao', 'projeto')).toBe('retrocesso');
    expect(direcaoTransicao('homologacao', 'instalacao')).toBe('retrocesso');
  });

  it('identifica mesma etapa', () => {
    expect(direcaoTransicao('vistoria', 'vistoria')).toBe('mesmo');
    expect(direcaoTransicao('projeto', 'projeto')).toBe('mesmo');
  });
});
