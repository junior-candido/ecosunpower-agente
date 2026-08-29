import { describe, it, expect } from 'vitest';
import { normalizarTexto, casarFavorecido, type Favorecido } from '../src/modules/financeiro/favorecidos.js';

const kelvyn: Favorecido = { id: 'k', nome: 'Kelvyn', doc_mascarado: '***.680.951-**', padroes: ['kelvyn', '680.951'], categoria_slug: 'mao_de_obra', mundo_padrao: 'PJ', tipo_padrao: 'despesa' };
const edilene: Favorecido = { id: 'e', nome: 'Edilene (sócia)', doc_mascarado: '***.119.741-**', padroes: ['edilene'], categoria_slug: 'outros', mundo_padrao: 'FRONTEIRA', tipo_padrao: 'entrada' };
const cft: Favorecido = { id: 'c', nome: 'CFT (TRT)', doc_mascarado: '32.489.209/0001-57', padroes: ['32.489.209', 'conselho regional dos tecnic'], categoria_slug: 'outros', mundo_padrao: 'PJ', tipo_padrao: 'despesa' };
const lista = [kelvyn, edilene, cft];

describe('favorecidos: normalizar', () => {
  it('tira acento, caixa e espaços repetidos', () => {
    expect(normalizarTexto('  Pagamento Pix ***.680.951-**  ')).toBe('pagamento pix ***.680.951-**');
    expect(normalizarTexto('ÉDILENE Rodrigues')).toBe('edilene rodrigues');
  });
});
describe('favorecidos: casar', () => {
  it('acha por CPF mascarado no texto do extrato', () => { expect(casarFavorecido('Pagamento Pix ***.680.951-**', lista)?.id).toBe('k'); });
  it('acha por nome em áudio transcrito', () => { expect(casarFavorecido('paguei 800 pro kelvyn da loja 305', lista)?.id).toBe('k'); });
  it('acha CNPJ com ou sem barra/espaço', () => { expect(casarFavorecido('Pagamento Pix 32.489.209 0001-57 Boleto', lista)?.id).toBe('c'); });
  it('não acha → null (nunca chuta)', () => { expect(casarFavorecido('pix 10.198.309/0001-91', lista)).toBeNull(); });
  it('CNPJ completo no dicionÃ¡rio casa texto com espaÃ§o no lugar da barra (raiz)', () => {
    const full: Favorecido = { ...cft, id: 'f', padroes: ['32.489.209/0001-57'] };
    expect(casarFavorecido('Pagamento Pix 32.489.209 0001-57 Boleto', [full])?.id).toBe('f');
    expect(casarFavorecido('Pix 32.489.209/0001-57', [full])?.id).toBe('f');
  });
  it('padrão mais longo ganha quando dois casam', () => {
    const a: Favorecido = { ...kelvyn, id: 'a', padroes: ['lucas'] };
    const b: Favorecido = { ...kelvyn, id: 'b', padroes: ['lucas rodrigues leite'] };
    expect(casarFavorecido('pix lucas rodrigues leite 252', [a, b])?.id).toBe('b');
  });
});
