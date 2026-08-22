// tests/tabela-precos-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseComandoTabela } from '../src/modules/vendas/tabela-precos-parser.js';

describe('parseComandoTabela', () => {
  it('ignora o que não é /tabela', () => {
    expect(parseComandoTabela('oi')).toBeNull();
    expect(parseComandoTabela('/tabelao')).toBeNull();
  });
  it('/tabela sozinho lista', () => {
    expect(parseComandoTabela('/tabela')).toEqual({ acao: 'listar' });
    expect(parseComandoTabela('tabela ')).toEqual({ acao: 'listar' });
  });
  it('módulo sem prefixo', () => {
    expect(parseComandoTabela('/tabela JA 625 = 980')).toEqual({
      acao: 'atualizar', item: { tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, modulosPorUnidade: null, precoUnitario: 980, unidade: 'un', fonte: 'junior' },
    });
  });
  it('módulo com prefixo e preço com milhar/vírgula', () => {
    expect(parseComandoTabela('/tabela modulo Risen 715 = 1.050,00')?.item).toMatchObject({ tipo: 'modulo', marca: 'Risen', modelo: '715', potenciaW: 715, precoUnitario: 1050 });
  });
  it('micro com módulos por unidade', () => {
    expect(parseComandoTabela('/tabela micro Hoymiles HMS-2000-4T 4 = 1450')?.item).toEqual({
      tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', potenciaW: null, modulosPorUnidade: 4, precoUnitario: 1450, unidade: 'un', fonte: 'junior',
    });
  });
  it('micro sem módulos por unidade é erro (nunca inferir)', () => {
    expect(parseComandoTabela('/tabela micro GoodWe GW2000-MIS = 1300')).toEqual({ acao: 'erro', erro: 'micro_sem_modulos_por_unidade' });
  });
  it('estrutura por tipo de telhado, preço por módulo', () => {
    expect(parseComandoTabela('/tabela estrutura ceramico = 95')?.item).toEqual({
      tipo: 'estrutura', marca: 'ceramico', modelo: 'ceramico', potenciaW: null, modulosPorUnidade: null, precoUnitario: 95, unidade: 'modulo', fonte: 'junior',
    });
    expect(parseComandoTabela('/tabela estrutura Fibrocimento = 80')?.item).toMatchObject({ marca: 'fibrocimento' });
    expect(parseComandoTabela('/tabela estrutura telha colonial = 95')).toEqual({ acao: 'erro', erro: 'telhado_desconhecido' });
  });
  it('cabos/proteção por kWp', () => {
    expect(parseComandoTabela('/tabela cabos = 420')?.item).toEqual({
      tipo: 'cabos_protecao', marca: 'geral', modelo: 'geral', potenciaW: null, modulosPorUnidade: null, precoUnitario: 420, unidade: 'kwp', fonte: 'junior',
    });
  });
  it('fonte opcional', () => {
    expect(parseComandoTabela('/tabela fonte belenus JA 625 = 980')?.item).toMatchObject({ fonte: 'belenus', marca: 'JA' });
    expect(parseComandoTabela('/tabela fonte solfacil micro Sungrow S2500S-L 4 = 1500')?.item).toMatchObject({ fonte: 'solfacil', tipo: 'micro' });
  });
  it('tira desativa', () => {
    expect(parseComandoTabela('/tabela tira JA 625')).toEqual({ acao: 'desativar', tipo: 'modulo', marca: 'JA', modelo: '625' });
    expect(parseComandoTabela('/tabela tira micro Hoymiles HMS-2000-4T')).toEqual({ acao: 'desativar', tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T' });
  });
  it('preço zero/negativo/ausente é erro', () => {
    expect(parseComandoTabela('/tabela JA 625 = 0')).toEqual({ acao: 'erro', erro: 'preco_invalido' });
    expect(parseComandoTabela('/tabela JA 625')).toEqual({ acao: 'erro', erro: 'formato' });
  });
});
