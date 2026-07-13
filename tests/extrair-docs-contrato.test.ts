import { describe, it, expect } from 'vitest';
import { parseDadosDoc } from '../src/modules/closing/extrair-docs-contrato.js';

describe('parseDadosDoc', () => {
  it('extrai o JSON limpo', () => {
    const r = parseDadosDoc('{"nome":"Fernanda Silva","cpf":"123.456.789-00","rg":"1234567","orgao_emissor_rg":"SSP/DF"}');
    expect(r.nome).toBe('Fernanda Silva');
    expect(r.cpf).toBe('123.456.789-00');
    expect(r.rg).toBe('1234567');
    expect(r.orgao_emissor_rg).toBe('SSP/DF');
  });

  it('tolera cerca de código e texto em volta', () => {
    const r = parseDadosDoc('Aqui estão os dados:\n```json\n{"nome":"Antonio","uc_numero":"9988776655"}\n```\npronto!');
    expect(r.nome).toBe('Antonio');
    expect(r.uc_numero).toBe('9988776655');
  });

  it('extrai endereço aninhado e normaliza UF pra maiúscula', () => {
    const r = parseDadosDoc('{"endereco":{"rua":"Rua A","numero":"10","cidade":"Brasília","uf":"df","cep":"70000-000"}}');
    expect(r.endereco?.rua).toBe('Rua A');
    expect(r.endereco?.uf).toBe('DF');
  });

  it('mapeia a concessionária pela distribuidora', () => {
    expect(parseDadosDoc('{"concessionaria":"Neoenergia Distribuição"}').concessionaria).toBe('Neoenergia-DF');
    expect(parseDadosDoc('{"concessionaria":"Equatorial Goiás"}').concessionaria).toBe('Equatorial-GO');
    expect(parseDadosDoc('{"concessionaria":"CEB"}').concessionaria).toBe('Neoenergia-DF');
  });

  it('ignora strings vazias (não vira campo preenchido com "")', () => {
    const r = parseDadosDoc('{"nome":"  ","cpf":"","rg":"123"}');
    expect(r.nome).toBeUndefined();
    expect(r.cpf).toBeUndefined();
    expect(r.rg).toBe('123');
  });

  it('resposta sem JSON → objeto vazio (nunca lança)', () => {
    expect(parseDadosDoc('desculpa, não consegui ler os documentos')).toEqual({});
    expect(parseDadosDoc('')).toEqual({});
    expect(parseDadosDoc('{ isso não é json }')).toEqual({});
  });
});
