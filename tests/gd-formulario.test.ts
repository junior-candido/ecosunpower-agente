import { describe, it, expect } from 'vitest';
import { numeroForm, mesInput, montarDigitado, type CamposDigitados } from '../src/modules/gd/gd-formulario.js';

describe('numeroForm', () => {
  it('aceita o jeito brasileiro e o do teclado numérico', () => {
    expect(numeroForm('1.234,5')).toBe(1234.5);
    expect(numeroForm('612,4')).toBe(612.4);
    expect(numeroForm('612.4')).toBe(612.4);
    expect(numeroForm('1.234')).toBe(1234);      // ponto com 3 casas = milhar
    expect(numeroForm('12.345.678')).toBe(12345678);
    expect(numeroForm(' 700 ')).toBe(700);
    expect(numeroForm('1.234,56')).toBe(1234.56);
    expect(numeroForm('0,5')).toBe(0.5);
  });
  it('vazio ou lixo vira null', () => {
    expect(numeroForm('')).toBeNull();
    expect(numeroForm(undefined)).toBeNull();
    expect(numeroForm('abc')).toBeNull();
    expect(numeroForm('1.2.3')).toBeNull();
    expect(numeroForm('-5')).toBeNull();          // kWh não é negativo
  });
  it('vírgula com pontos fora do lugar de milhar não adivinha — vira null', () => {
    expect(numeroForm('1.2,5')).toBeNull();
    expect(numeroForm('12.34,5')).toBeNull();
    expect(numeroForm('1..2,5')).toBeNull();
  });
});

describe('mesInput', () => {
  it('YYYY-MM do <input type=month> vira YYYY-MM-01', () => {
    expect(mesInput('2026-08')).toBe('2026-08-01');
    expect(mesInput('2026-13')).toBeNull();
    expect(mesInput('')).toBeNull();
  });
  it('ano fora de 2000..2100 vira null', () => {
    expect(mesInput('0000-01')).toBeNull();
  });
});

const ok: CamposDigitados = {
  clienteNome: 'Fulano de Tal', codigoCliente: '100001', instalacao: '200002', mes: '2026-08',
  injetado: '222', consumo: '480', creditoUtilizado: '210', saldoAcumulado: '1.240,5',
  proximoExpirar: '', cicloExpirar: '',
};

describe('montarDigitado', () => {
  it('monta o demonstrativo com os números certos', () => {
    const r = montarDigitado(ok);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.referencia).toBe('2026-08-01');
    expect(r.dados.saldoAcumuladoKwh).toBe(1240.5);
    expect(r.dados.proximoExpirarKwh).toBeNull();
    expect(r.dados.historico).toEqual([]);
  });
  it('lista TODOS os erros de uma vez', () => {
    const r = montarDigitado({ ...ok, clienteNome: ' ', instalacao: 'x', mes: '', injetado: 'abc' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros).toHaveLength(4);
  });
  it('ciclo preenchido sem valor a expirar é erro', () => {
    const r = montarDigitado({ ...ok, cicloExpirar: '2029-12' });
    expect(r.ok).toBe(false);
  });
});
