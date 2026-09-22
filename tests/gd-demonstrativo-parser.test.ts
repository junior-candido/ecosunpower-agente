import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  numeroBr,
  mesParaData,
  parseDemonstrativo,
} from '../src/modules/gd/demonstrativo-parser.js';

// Texto extraido pelo unpdf do PDF REAL (RelatorioResumo.pdf da Neoenergia
// Brasilia, jun/2026), com nome e codigos trocados por ficticios (LGPD).
const REAL = readFileSync(join(__dirname, 'fixtures', 'gd', 'cliente-unico-2026-06.txt'), 'utf-8');

describe('numeroBr', () => {
  it('le inteiro, decimal com virgula e milhar com ponto', () => {
    expect(numeroBr('687')).toBe(687);
    expect(numeroBr('10601,03')).toBe(10601.03);
    expect(numeroBr('10.601,03')).toBe(10601.03);
    expect(numeroBr('1.234.567')).toBe(1234567);
    expect(numeroBr('-12,5')).toBe(-12.5);
  });
  it('devolve null pra lixo', () => {
    expect(numeroBr('')).toBeNull();
    expect(numeroBr('-')).toBeNull();
    expect(numeroBr('abc')).toBeNull();
  });
});

describe('mesParaData', () => {
  it('aceita as tres formas que aparecem no demonstrativo', () => {
    expect(mesParaData('mai/2026')).toBe('2026-05-01');
    expect(mesParaData('06/2026')).toBe('2026-06-01');
    expect(mesParaData('junho de 2026')).toBe('2026-06-01');
    expect(mesParaData('Março de 2025')).toBe('2025-03-01');
    expect(mesParaData('dez/2029')).toBe('2029-12-01');
  });
  it('recusa mes invalido', () => {
    expect(mesParaData('13/2026')).toBeNull();
    expect(mesParaData('xyz/2026')).toBeNull();
    expect(mesParaData('')).toBeNull();
  });
});

describe('parseDemonstrativo — PDF real (cliente sem rateio)', () => {
  const r = parseDemonstrativo(REAL);

  it('le com sucesso e sem inconsistencias', () => {
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.inconsistencias).toEqual([]);
  });

  it('identifica cliente, codigo, instalacao e mes de referencia', () => {
    if (!r.ok) throw new Error(r.motivo);
    const d = r.dados;
    expect(d.clienteNome).toBe('CLIENTE TESTE UM');
    expect(d.codigoCliente).toBe('100001');
    expect(d.instalacao).toBe('200002');
    expect(d.referencia).toBe('2026-06-01');
  });

  it('le o bloco Injetado', () => {
    if (!r.ok) throw new Error(r.motivo);
    const d = r.dados;
    expect(d.medidor).toBe('9000000001');
    expect(d.injetadoKwh).toBe(687);
    expect(d.saldoMesAnteriorKwh).toBe(10601.03);
    expect(d.injetadoAcumuladoKwh).toBe(11572);
  });

  it('le o bloco Consumo', () => {
    if (!r.ok) throw new Error(r.motivo);
    const d = r.dados;
    expect(d.consumoKwh).toBe(362);
    expect(d.creditoUtilizadoKwh).toBe(289.36);
    expect(d.creditoRestanteKwh).toBe(397.64);
    expect(d.creditoExpira).toBe('2031-06-01');
  });

  it('le o historico de 13 meses', () => {
    if (!r.ok) throw new Error(r.motivo);
    expect(r.dados.historico).toEqual([
      { mes: '2026-05-01', codigoCliente: '100001', consumida: 357, injetada: 664, faturada: 100, compensado: 283.97, credito: 380.03 },
      { mes: '2026-06-01', codigoCliente: '100001', consumida: 362, injetada: 687, faturada: 100, compensado: 289.36, credito: 397.64 },
    ]);
  });

  it('le os totais e o proximo vencimento de creditos', () => {
    if (!r.ok) throw new Error(r.motivo);
    const d = r.dados;
    expect(d.totalInjetadoKwh).toBe(11572);
    expect(d.totalCompensadoKwh).toBe(573.33);
    expect(d.saldoAcumuladoKwh).toBe(10998.67);
    expect(d.proximoExpirarKwh).toBe(654);
    expect(d.cicloExpirar).toBe('2029-12-01');
    expect(d.creditosExpiradosKwh).toBe(0);
  });

  it('le as unidades do rateio', () => {
    if (!r.ok) throw new Error(r.motivo);
    expect(r.dados.unidades).toEqual([{ codigoCliente: '100001', percentual: 100, saldo: 10998.67 }]);
  });
});

describe('parseDemonstrativo — conferencias', () => {
  it('aponta quando o saldo nao fecha com injetado - compensado - expirado', () => {
    const t = REAL.replace('11572 573,33 10998,67 654 12/2029 0', '11572 573,33 10000,00 654 12/2029 0');
    const r = parseDemonstrativo(t);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.inconsistencias.some((i) => i.includes('saldo acumulado'))).toBe(true);
  });

  it('aponta quando os percentuais do rateio nao somam 100', () => {
    const t = REAL.replace('100001 100 % 10998,67', '100001 60 % 6599,20\n300003 30 % 4399,47');
    const r = parseDemonstrativo(t);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.unidades).toHaveLength(2);
    expect(r.inconsistencias.some((i) => i.includes('90'))).toBe(true);
  });

  it('le rateio com varias unidades quando fecha certinho', () => {
    const t = REAL.replace('100001 100 % 10998,67', '100001 60 % 6599,20\n300003 40 % 4399,47');
    const r = parseDemonstrativo(t);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.unidades).toEqual([
      { codigoCliente: '100001', percentual: 60, saldo: 6599.2 },
      { codigoCliente: '300003', percentual: 40, saldo: 4399.47 },
    ]);
    expect(r.inconsistencias).toEqual([]);
  });

  it('sem nada a expirar ainda assim le os totais', () => {
    const t = REAL.replace('11572 573,33 10998,67 654 12/2029 0', '11572 573,33 10998,67 0 - 0');
    const r = parseDemonstrativo(t);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.proximoExpirarKwh).toBe(0);
    expect(r.dados.cicloExpirar).toBeNull();
    expect(r.dados.saldoAcumuladoKwh).toBe(10998.67);
  });
});

// Layout do PDF real COM rateio (conferido 22/09/2026 num demonstrativo de
// verdade, geradora + 2 beneficiarias); numeros todos inventados.
const RATEIO = readFileSync(join(__dirname, 'fixtures', 'gd', 'rateio-3-unidades-2026-08.txt'), 'utf-8');

describe('parseDemonstrativo — geradora com 2 beneficiarias', () => {
  const r = parseDemonstrativo(RATEIO);

  it('le sem inconsistencias (a geradora com 0% entra na soma)', () => {
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.inconsistencias).toEqual([]);
    expect(r.dados.unidades).toEqual([
      { codigoCliente: '100001', percentual: 0, saldo: 400 },
      { codigoCliente: '300003', percentual: 60, saldo: 1100 },
      { codigoCliente: '500005', percentual: 40, saldo: 500 },
    ]);
  });

  it('o bloco Consumo e o da GERADORA, mesmo com outras unidades depois', () => {
    if (!r.ok) throw new Error(r.motivo);
    expect(r.dados.consumoKwh).toBe(90);
    expect(r.dados.creditoUtilizadoKwh).toBe(60);
    expect(r.dados.creditoRestanteKwh).toBe(0);
  });

  it('o historico traz as 3 unidades de cada mes', () => {
    if (!r.ok) throw new Error(r.motivo);
    const ago = r.dados.historico.filter((h) => h.mes === '2026-08-01');
    expect(ago.map((h) => [h.codigoCliente, h.consumida, h.compensado])).toEqual([
      ['100001', 90, 60],
      ['300003', 110, 80],
      ['500005', 170, 140],
    ]);
    expect(r.dados.historico).toHaveLength(6);
  });
});

describe('parseDemonstrativo — quando nao da pra ler', () => {
  it('texto vazio', () => {
    const r = parseDemonstrativo('');
    expect(r.ok).toBe(false);
  });
  it('outro documento qualquer', () => {
    const r = parseDemonstrativo('Nota fiscal de servico\nValor total R$ 100,00');
    expect(r.ok).toBe(false);
  });
  it('sem a linha do cliente (codigo e instalacao sao obrigatorios)', () => {
    const r = parseDemonstrativo(REAL.replace(/Cliente:.*\r?\n/, ''));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/cliente/i);
  });
});
