// tests/lead-estimativa-real.test.ts
// Caso Claudio Lacerda (31/08/2026, Vitória da Conquista-BA): o cliente DISSE
// 238 kWh e a conta de R$297,57. A estimativa do handoff:
//   - jogou fora o 238 e chutou 289 kWh pela tabela de faixa (só olhava o R$);
//   - devolveu R$9.600 pra um sistema de 2,0 kWp (é o preço do de 3 kWp, o piso
//     da tabela) — R$4,80/Wp numa tabela que começa em R$3,20/Wp;
//   - prometeu economia de R$277 (93% fixo), sem Fio B nem custo de disponibilidade;
//   - usou geração de painel de Brasília ("85 kWh") na Bahia.
import { describe, it, expect } from 'vitest';
import { estimarLead, estimarPorConta } from '../src/modules/proposal/lead-estimativa.js';
import { normalizarEmpresaRow } from '../src/modules/empresa-config.js';

const conquista = normalizarEmpresaRow({
  company_id: 'c1a2b3c4-0000-0000-0000-00000000aaaa',
  nome_fantasia: 'Conquista Solar',
  cidade: 'Vitória da Conquista', uf: 'BA',
  hsp_padrao: 5.4, tarifa_kwh_padrao: 1.25,
});

describe('a estimativa usa o kWh que o cliente informou', () => {
  it('238 kWh informado manda mais que o chute pela conta', () => {
    const e = estimarLead({ contaRs: 297.57, consumoKwh: 238, cfg: conquista });
    expect(e.consumoKwh).toBe(238);
    expect(e.consumoOrigem).toBe('informado');
  });

  it('sem kWh informado, ainda estima pela conta (não quebra o fluxo de hoje)', () => {
    const e = estimarLead({ contaRs: 297.57, cfg: conquista });
    expect(e.consumoKwh).toBeGreaterThan(0);
    expect(e.consumoOrigem).toBe('estimado');
  });
});

describe('carga futura entra no dimensionamento', () => {
  it('cliente que vai somar carga leva sistema maior', () => {
    const semCarga = estimarLead({ contaRs: 297.57, consumoKwh: 238, cfg: conquista });
    const comCarga = estimarLead({ contaRs: 297.57, consumoKwh: 238, cargaFuturaKwh: 480, cfg: conquista });
    expect(comCarga.consumoKwh).toBe(480);
    expect(comCarga.paineis).toBeGreaterThan(semCarga.paineis);
    expect(comCarga.kWp).toBeGreaterThan(semCarga.kWp);
  });
});

describe('preço não pode fingir que 2 kWp custa o mesmo que 3 kWp', () => {
  it('abaixo da menor faixa da tabela, avisa que está fora da tabela', () => {
    const e = estimarLead({ contaRs: 297.57, consumoKwh: 238, cfg: conquista });
    expect(e.kWp).toBeLessThan(3);
    expect(e.precoForaDaTabela).toBe(true);
  });

  it('dentro da tabela não levanta a bandeira', () => {
    const e = estimarLead({ contaRs: 600, consumoKwh: 417, cfg: conquista });
    expect(e.precoForaDaTabela).toBe(false);
  });
});

describe('economia é a conta MENOS o que continua sendo pago', () => {
  it('não é mais 93% fixo da conta', () => {
    const e = estimarLead({ contaRs: 297.57, consumoKwh: 238, cfg: conquista });
    expect(e.economiaMensalRs).toBeLessThan(Math.round(297.57 * 0.93));
  });

  it('sobra uma conta residual (Fio B + iluminação pública) — nunca zera', () => {
    const e = estimarLead({ contaRs: 297.57, consumoKwh: 238, cfg: conquista });
    expect(e.contaResidualRs).toBeGreaterThan(0);
    expect(e.economiaMensalRs + e.contaResidualRs).toBeCloseTo(297.57, 0);
  });

  it('economia nunca passa do valor da conta', () => {
    const e = estimarLead({ contaRs: 297.57, consumoKwh: 238, cfg: conquista });
    expect(e.economiaMensalRs).toBeLessThanOrEqual(297.57);
  });
});

describe('a EcoSunPower (DF) não muda de tamanho', () => {
  it('caso Vilma: conta R$600 continua dando sistema pequeno, não R$25k', () => {
    const e = estimarPorConta(600);
    expect(e.kWp).toBeGreaterThanOrEqual(3);
    expect(e.kWp).toBeLessThanOrEqual(5.5);
    expect(e.paineis).toBeGreaterThanOrEqual(5);
    expect(e.paineis).toBeLessThanOrEqual(8);
    expect(e.precoRs).toBeGreaterThanOrEqual(9000);
    expect(e.precoRs).toBeLessThanOrEqual(15000);
  });
});
