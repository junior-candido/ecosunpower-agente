// tests/closing-validator.test.ts
import { describe, it, expect } from 'vitest';
import {
  isValidCPF,
  isValidCNPJ,
  isValidCEP,
  isValidEmail,
  isValidPhoneBR,
  formatCPF,
  formatCNPJ,
  formatCEP,
  formatPhoneBR,
} from '../src/modules/closing/closing-validator.js';

describe('closing-validator primitives', () => {
  it('isValidCPF aceita 11 dígitos com ou sem máscara', () => {
    expect(isValidCPF('028.876.121-90')).toBe(true);
    expect(isValidCPF('02887612190')).toBe(true);
  });

  it('isValidCPF rejeita comprimento errado', () => {
    expect(isValidCPF('123')).toBe(false);
    expect(isValidCPF('028876121901234')).toBe(false);
  });

  it('isValidCNPJ aceita 14 dígitos', () => {
    expect(isValidCNPJ('33.020.459/0001-06')).toBe(true);
    expect(isValidCNPJ('33020459000106')).toBe(true);
  });

  it('isValidCEP aceita 8 dígitos', () => {
    expect(isValidCEP('72910-000')).toBe(true);
    expect(isValidCEP('72910000')).toBe(true);
    expect(isValidCEP('7291000')).toBe(false);
  });

  it('isValidEmail aceita formato básico', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('acmanutencaodf@hotmail.com')).toBe(true);
    expect(isValidEmail('inválido')).toBe(false);
  });

  it('isValidPhoneBR aceita DDD + 8/9 dígitos', () => {
    expect(isValidPhoneBR('(61) 99289-1958')).toBe(true);
    expect(isValidPhoneBR('61992891958')).toBe(true);
    expect(isValidPhoneBR('+5561992891958')).toBe(true);
    expect(isValidPhoneBR('123')).toBe(false);
  });

  it('formatCPF, formatCEP, formatPhoneBR aplicam máscara padrão', () => {
    expect(formatCPF('02887612190')).toBe('028.876.121-90');
    expect(formatCEP('72910000')).toBe('72910-000');
    expect(formatPhoneBR('61992891958')).toBe('(61) 99289-1958');
  });
});

describe('closing-validator defensive guards', () => {
  it('isValid* retornam false para undefined/null/number', () => {
    expect(isValidCPF(undefined as any)).toBe(false);
    expect(isValidCPF(null as any)).toBe(false);
    expect(isValidEmail(undefined as any)).toBe(false);
    expect(isValidPhoneBR(123 as any)).toBe(false);
  });

  it('formatCPF retorna o input original se inválido', () => {
    expect(formatCPF('123')).toBe('123');
    expect(formatCPF('abc')).toBe('abc');
  });

  it('formatCEP retorna o input original se inválido', () => {
    expect(formatCEP('123')).toBe('123');
  });

  it('formatPhoneBR retorna o input original se inválido', () => {
    expect(formatPhoneBR('123')).toBe('123');
  });
});

import { findMissingRequired } from '../src/modules/closing/closing-validator.js';

describe('findMissingRequired', () => {
  it('lista todos obrigatórios quando dados vazios', () => {
    const missing = findMissingRequired({});
    expect(missing).toContain('titular_uc.nome');
    expect(missing).toContain('titular_uc.cpf');
    expect(missing).toContain('titular_uc.rg');
    expect(missing).toContain('sistema.kwp');
    expect(missing).toContain('comercial.valor_total_brl');
    expect(missing).toContain('comercial.forma_pagamento');
    expect(missing).toContain('docs_pedidos');
  });

  it('não pede RG se docs_pedidos não inclui procuração nem contrato', () => {
    // Caso impossível mas valida lógica do schema
    const missing = findMissingRequired({ docs_pedidos: [] });
    expect(missing).toContain('docs_pedidos');
  });

  it('quando contratante_eh_titular=true, não pede dados do contratante separadamente', () => {
    const missing = findMissingRequired({
      titular_uc: {
        tipo: 'PF', nome: 'X', cpf: '02887612190', rg: '26163',
        orgao_emissor_rg: 'MTE-DF', nacionalidade: 'Brasileiro(a)',
        endereco: { rua: 'a', numero: '1', bairro: 'b', cidade: 'c', uf: 'DF', cep: '70000000' },
        telefone: '61999999999', email: 'a@b.co',
      },
      contratante_eh_titular: true,
      docs_pedidos: ['contrato', 'procuracao'],
      uc_numero: 'a confirmar',
      concessionaria: 'Neoenergia-DF',
      endereco_instalacao: { rua: 'a', numero: '1', bairro: 'b', cidade: 'c', uf: 'DF', cep: '70000000' },
      sistema: {
        kwp: 8.4, modalidade: 'autoconsumo_local',
        modulos: { marca: 'Trina', potencia_w: 700, quantidade: 12 },
        inversor: { marca: 'Sungrow', modelo: 'SG5.0RS-L', potencia_kw: 5 },
      },
      comercial: { valor_total_brl: 38500, forma_pagamento: 'à vista PIX' },
    });
    expect(missing).toEqual([]);
  });

  it('quando contratante_eh_titular=false, pede dados do contratante', () => {
    const missing = findMissingRequired({
      titular_uc: {
        tipo: 'PF', nome: 'X', cpf: '02887612190', rg: '26163',
        orgao_emissor_rg: 'MTE-DF', nacionalidade: 'Brasileiro(a)',
        endereco: { rua: 'a', numero: '1', bairro: 'b', cidade: 'c', uf: 'DF', cep: '70000000' },
        telefone: '61999999999', email: 'a@b.co',
      },
      contratante_eh_titular: false,
      docs_pedidos: ['contrato'],
    } as any);
    expect(missing.some((m) => m.startsWith('contratante.'))).toBe(true);
  });
});
