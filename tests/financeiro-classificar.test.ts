import { describe, it, expect } from 'vitest';
import { classificar } from '../src/modules/financeiro/classificar.js';
import type { Favorecido } from '../src/modules/financeiro/favorecidos.js';

const kelvyn: Favorecido = { id: 'k', nome: 'Kelvyn', doc_mascarado: null, padroes: ['kelvyn'], categoria_slug: 'mao_de_obra', mundo_padrao: 'PJ', tipo_padrao: 'despesa' };
const base = { tipo: 'despesa' as const, valor: 800, contraparte: 'Kelvyn', categoria_slug: null, pf_pj: null as null, descricao: 'kelvyn loja 305' };

describe('classificar', () => {
  it('favorecido conhecido → categoria e mundo do dicionário, confiança alta', () => {
    const r = classificar(base, [kelvyn]);
    expect(r).toMatchObject({ categoria_slug: 'mao_de_obra', mundo: 'PJ', confianca: 'alta', favorecido_id: 'k' });
  });
  it('sem favorecido mas com categoria e PF/PJ da extração → média', () => {
    const r = classificar({ ...base, contraparte: 'Posto Shell', descricao: null, categoria_slug: 'combustivel', pf_pj: 'PJ' }, [kelvyn]);
    expect(r).toMatchObject({ categoria_slug: 'combustivel', mundo: 'PJ', confianca: 'media', favorecido_id: null });
  });
  it('sem favorecido e sem PF/PJ → assume PJ (admin) com confiança baixa, nunca bloqueia', () => {
    const r = classificar({ ...base, contraparte: 'Fulano', descricao: null, pf_pj: null }, []);
    expect(r).toMatchObject({ mundo: 'PJ', confianca: 'baixa' });
  });
  it('PF explícito na extração vence o dicionário', () => {
    expect(classificar({ ...base, pf_pj: 'PF' }, [kelvyn]).mundo).toBe('PF');
  });
  it('categoria explícita da extração vence o dicionário (Eva leu a nota)', () => {
    expect(classificar({ ...base, categoria_slug: 'ferramenta' }, [kelvyn]).categoria_slug).toBe('ferramenta');
  });
});
