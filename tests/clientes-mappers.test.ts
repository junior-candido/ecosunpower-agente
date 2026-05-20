// tests/clientes-mappers.test.ts
import { describe, it, expect } from 'vitest';
import {
  instalacaoFase,
  statusLabel,
  statusCorChip,
  isCliente,
  faseConcluida,
} from '../src/modules/clientes/mappers.js';

describe('instalacaoFase (installation_status → fase da jornada)', () => {
  it('null/novo/qualificando → lead', () => {
    expect(instalacaoFase(null)).toBe('lead');
    expect(instalacaoFase('novo')).toBe('lead');
    expect(instalacaoFase('qualificando')).toBe('lead');
  });
  it('qualificado → proposta', () => {
    expect(instalacaoFase('qualificado')).toBe('proposta');
  });
  it('proposta_aceita/contrato_assinado → contrato', () => {
    expect(instalacaoFase('proposta_aceita')).toBe('contrato');
    expect(instalacaoFase('contrato_assinado')).toBe('contrato');
  });
  it('instalado/medidor_trocado → instalado', () => {
    expect(instalacaoFase('instalado')).toBe('instalado');
    expect(instalacaoFase('medidor_trocado')).toBe('instalado');
  });
  it('operando → operando', () => {
    expect(instalacaoFase('operando')).toBe('operando');
  });
  it('pos_venda_concluido → pos_venda', () => {
    expect(instalacaoFase('pos_venda_concluido')).toBe('pos_venda');
  });
});

describe('isCliente (filtro de quem aparece em /clientes)', () => {
  it('instalado em diante = cliente', () => {
    expect(isCliente('contrato_assinado')).toBe(true);
    expect(isCliente('instalado')).toBe(true);
    expect(isCliente('medidor_trocado')).toBe(true);
    expect(isCliente('operando')).toBe(true);
    expect(isCliente('pos_venda_concluido')).toBe(true);
  });
  it('lead/qualificando/qualificado/proposta_aceita = NÃO cliente', () => {
    expect(isCliente(null)).toBe(false);
    expect(isCliente('novo')).toBe(false);
    expect(isCliente('qualificando')).toBe(false);
    expect(isCliente('qualificado')).toBe(false);
    expect(isCliente('proposta_aceita')).toBe(false);
  });
});

describe('statusLabel (PT-BR)', () => {
  it('mapeia todos os status', () => {
    expect(statusLabel('operando')).toBe('Operando');
    expect(statusLabel('instalado')).toBe('Instalado');
    expect(statusLabel('contrato_assinado')).toBe('Contrato assinado');
    expect(statusLabel(null)).toBe('—');
  });
});

describe('statusCorChip (CSS class tailwind)', () => {
  it('verde pra operando/pos_venda', () => {
    expect(statusCorChip('operando')).toContain('green');
    expect(statusCorChip('pos_venda_concluido')).toContain('green');
  });
  it('azul pra instalado/contrato', () => {
    expect(statusCorChip('instalado')).toContain('sky');
  });
});

describe('faseConcluida', () => {
  it('lead em qualquer fase >= lead → true', () => {
    expect(faseConcluida('lead', 'operando')).toBe(true);
  });
  it('operando em lead → false', () => {
    expect(faseConcluida('operando', 'lead')).toBe(false);
  });
});
