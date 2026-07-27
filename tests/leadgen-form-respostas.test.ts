// tests/leadgen-form-respostas.test.ts
//
// TDD da Fase 3 do funil conversacional (spec 2026-07-27):
//  - extrairRespostasForm: acha faixa da conta e tipo de imovel nos slugs do
//    form Meta (nomes variam, com acento e interrogacao) via fragmentos
//  - mesclarEnergyData: chaves do form sobrescrevem, resto preservado
//    (monthly_bill de conversa anterior nao pode sumir)
//  - blocoContinuacaoForm: bloco de prompt do modo continuacao — confirma o
//    que o form ja respondeu, nao re-pergunta, pede foto da conta, e com
//    valor parcial NUNCA crava preco

import { describe, it, expect } from 'vitest';
import {
  extrairRespostasForm,
  mesclarEnergyData,
  blocoContinuacaoForm,
} from '../src/modules/leadgen-form-respostas.js';

// Slugs REAIS do form publicado 26/07 (normalize() ja baixa pra lowercase)
const EXTRA_FIELDS_REAIS = {
  'qual_o_valor_médio_da_sua_conta_de_energia?': 'R$700 a R$1.000',
  'qual_o_tipo_de_imóvel?': 'Casa',
};

describe('extrairRespostasForm', () => {
  it('acha faixa da conta e tipo de imovel nos slugs reais do form', () => {
    const r = extrairRespostasForm(EXTRA_FIELDS_REAIS);
    expect(r).toEqual({ contaFaixa: 'R$700 a R$1.000', tipoImovel: 'Casa' });
  });

  it('extraFields vazio retorna nulls', () => {
    expect(extrairRespostasForm({})).toEqual({ contaFaixa: null, tipoImovel: null });
  });

  it('campo nao relacionado e ignorado', () => {
    const r = extrairRespostasForm({ 'quando_pretende_instalar?': 'Ate 3 meses' });
    expect(r).toEqual({ contaFaixa: null, tipoImovel: null });
  });

  it('variacao de slug (fatura / imovel sem acento) tambem acha', () => {
    const r = extrairRespostasForm({
      'valor_da_fatura': 'R$400 a R$700',
      'tipo_de_imovel': 'Empresa',
    });
    expect(r).toEqual({ contaFaixa: 'R$400 a R$700', tipoImovel: 'Empresa' });
  });
});

describe('mesclarEnergyData', () => {
  it('preserva monthly_bill existente e adiciona os campos do form', () => {
    const resultado = mesclarEnergyData(
      { monthly_bill: 850, group: 'B' },
      { contaFaixa: 'R$700 a R$1.000', tipoImovel: 'Casa' },
    );
    expect(resultado).toEqual({
      monthly_bill: 850,
      group: 'B',
      conta_faixa: 'R$700 a R$1.000',
      tipo_imovel: 'Casa',
      fonte: 'meta_form',
    });
  });

  it('form novo sobrescreve conta_faixa antiga (lead voltou pelo form de novo)', () => {
    const resultado = mesclarEnergyData(
      { conta_faixa: 'R$400 a R$700', fonte: 'meta_form' },
      { contaFaixa: 'Acima de R$1.000', tipoImovel: null },
    );
    expect(resultado?.conta_faixa).toBe('Acima de R$1.000');
  });

  it('sem nenhuma resposta do form retorna null (nao mexe no lead)', () => {
    expect(mesclarEnergyData({ monthly_bill: 850 }, { contaFaixa: null, tipoImovel: null }))
      .toBeNull();
  });

  it('so tipo de imovel tambem grava (sem conta_faixa)', () => {
    const resultado = mesclarEnergyData({}, { contaFaixa: null, tipoImovel: 'Apartamento' });
    expect(resultado).toEqual({ tipo_imovel: 'Apartamento', fonte: 'meta_form' });
  });
});

describe('blocoContinuacaoForm', () => {
  it('com faixa e tipo: bloco cita ambos, nao re-pergunta, pede foto, trava preco', () => {
    const bloco = blocoContinuacaoForm({
      conta_faixa: 'R$700 a R$1.000',
      tipo_imovel: 'Casa',
      fonte: 'meta_form',
    });
    expect(bloco).toBeTruthy();
    expect(bloco).toContain('R$700 a R$1.000');
    expect(bloco).toContain('Casa');
    expect(bloco).toMatch(/NAO (re-)?pergunte/i);
    expect(bloco).toMatch(/foto da conta/i);
    expect(bloco).toMatch(/valor exato/i);
    expect(bloco).toMatch(/NUNCA.*(preco|preço|valor de proposta)/i);
  });

  it('so faixa (sem tipo de imovel): bloco sai sem a linha do tipo', () => {
    const bloco = blocoContinuacaoForm({ conta_faixa: 'Acima de R$1.000', fonte: 'meta_form' });
    expect(bloco).toBeTruthy();
    expect(bloco).toContain('Acima de R$1.000');
    expect(bloco?.toLowerCase()).not.toContain('imóvel:');
  });

  it('sem conta_faixa nem tipo_imovel: null (conversa normal, sem modo continuacao)', () => {
    expect(blocoContinuacaoForm({ monthly_bill: 850 })).toBeNull();
    expect(blocoContinuacaoForm(null)).toBeNull();
    expect(blocoContinuacaoForm(undefined)).toBeNull();
  });

  it('dado completo ja coletado (monthly_bill ou consumo): desliga o modo continuacao', () => {
    // Eva ja conseguiu o valor exato na conversa — nao pode ficar pedindo foto de novo
    expect(blocoContinuacaoForm({ conta_faixa: 'R$700 a R$1.000', monthly_bill: 850 })).toBeNull();
    expect(blocoContinuacaoForm({ conta_faixa: 'R$700 a R$1.000', consumption_kwh: 600 })).toBeNull();
  });
});
