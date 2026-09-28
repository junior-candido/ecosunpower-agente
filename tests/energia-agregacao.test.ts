import { describe, it, expect } from 'vitest';
import { agregar15min, resumirDia, type LeituraBruta, type Janela15 } from '../src/modules/energia/agregacao.js';

// Fixture sintética com a forma do piloto (00:00 BRT = 03:00Z). Sem dado real.
const L = (min: number, imp: number | null, exp: number | null, p = 1000, v: number | null = 225): LeituraBruta => ({
  medidoEm: new Date(Date.UTC(2026, 8, 8, 3, 0) + min * 60_000).toISOString(),
  potenciaW: p, tensao: v, fatorPotencia: 0.9, energiaWh: imp, energiaDevolvidaWh: exp,
});
const soma = (js: Janela15[], k: 'importadoWh' | 'exportadoWh') => js.reduce((s, x) => s + x[k], 0);

describe('agregar15min', () => {
  it('1 kW constante por 30 min = 250 Wh em cada janela', () => {
    const ls = Array.from({ length: 31 }, (_, i) => L(i, 10_000 + i * (1000 / 60), 500));
    const j = agregar15min(ls, { tensaoNominal: 220 }).filter((x) => x.segundosCobertos > 0);
    expect(j).toHaveLength(2);
    expect(j[0].inicio).toBe('2026-09-08T03:00:00.000Z');
    expect(j[0].importadoWh).toBeCloseTo(250, 1);
    expect(j[1].importadoWh).toBeCloseTo(250, 1);
    expect(j[0].segundosCobertos).toBe(900);
    expect(j[0].exportadoWh).toBe(0);
  });

  it('intervalo que atravessa a fronteira é repartido pelo tempo', () => {
    const j = agregar15min([L(14, 0, 0), L(16, 100, 0)], { tensaoNominal: 220 });
    expect(j.find((x) => x.inicio.endsWith('03:00:00.000Z'))!.importadoWh).toBeCloseTo(50, 5);
    expect(j.find((x) => x.inicio.endsWith('03:15:00.000Z'))!.importadoWh).toBeCloseTo(50, 5);
  });

  it('buraco de 40 min não inventa energia (push): nada coberto', () => {
    const j = agregar15min([L(0, 0, 0), L(40, 700, 0)], { tensaoNominal: 220 });
    expect(soma(j, 'importadoWh')).toBe(0);
    expect(j.every((x) => x.segundosCobertos === 0)).toBe(true);
  });

  it('modo nuvem aceita 15 min entre fotos pelos contadores', () => {
    const j = agregar15min([L(0, 0, 0), L(15, 250, 0)], { tensaoNominal: 220, gapMaxContadorS: 1800 });
    expect(j[0].importadoWh).toBeCloseTo(250, 5);
    expect(j[0].segundosCobertos).toBe(900);
  });

  it('contador que volta (aparelho reiniciado) cai na integração da potência', () => {
    const j = agregar15min([L(0, 5000, 0, 1200), L(1, 10, 0, 1200)], { tensaoNominal: 220 });
    expect(j[0].importadoWh).toBeCloseTo(20, 5); // 1,2 kW × 1 min
  });

  it('contador que volta com buraco longo = buraco (não integra)', () => {
    const j = agregar15min([L(0, 5000, 0, 1200), L(30, 10, 0, 1200)], { tensaoNominal: 220 });
    expect(soma(j, 'importadoWh')).toBe(0);
  });

  it('sem contador: integra a potência só em intervalo curto', () => {
    const j = agregar15min([L(0, null, null, 600), L(1, null, null, 600)], { tensaoNominal: 220 });
    expect(j[0].importadoWh).toBeCloseTo(10, 5);
  });

  it('injeção solar vai para exportado', () => {
    const j = agregar15min([L(0, 0, 0, -2000), L(15, 0, 500, -2000)], { tensaoNominal: 220, gapMaxContadorS: 1800 });
    expect(j[0].exportadoWh).toBeCloseTo(500, 5);
    expect(j[0].importadoWh).toBe(0);
  });

  it('conta minutos de tensão precária, crítica e acima de 242 V', () => {
    const j = agregar15min([L(0, 0, 0, 0, 232), L(1, 0, 0, 0, 236), L(2, 0, 0, 0, 243)], { tensaoNominal: 220 });
    expect(j[0]).toMatchObject({ minTensaoPrecaria: 1, minTensaoCritica: 2, minAcima242: 1, tensaoMaxV: 243, tensaoMinV: 232 });
  });

  it('leituras fora de ordem e duplicadas não contam duas vezes', () => {
    const a = agregar15min([L(0, 0, 0), L(1, 20, 0), L(2, 40, 0)], { tensaoNominal: 220 });
    const b = agregar15min([L(2, 40, 0), L(0, 0, 0), L(1, 20, 0), L(1, 20, 0)], { tensaoNominal: 220 });
    expect(soma(b, 'importadoWh')).toBeCloseTo(soma(a, 'importadoWh'), 6);
  });
});

// Janelas sintéticas de um dia (terça 08/09/2026, BRT): base noturna 1 kW,
// exportação de dia, ponta 18–21h importando 1,6 kW.
function diaSintetico(dia = '2026-09-08', semCobertura: number[] = []): Janela15[] {
  const base = Date.parse(`${dia}T03:00:00.000Z`);
  return Array.from({ length: 96 }, (_, i) => {
    const h = Math.floor(i / 4);
    let imp = 0, exp = 0;
    if (h < 5) imp = 250;                 // 1 kW
    else if (h >= 7 && h < 15) exp = 450; // 1,8 kW injetando
    else if (h >= 18 && h < 21) imp = 400; // 1,6 kW
    else imp = 150;
    const coberto = !semCobertura.includes(i);
    return {
      inicio: new Date(base + i * 900_000).toISOString(), importadoWh: coberto ? imp : 0, exportadoWh: coberto ? exp : 0,
      potenciaMaxW: null, tensaoMinV: 220, tensaoMaxV: 236, tensaoMedV: 226, fpMedio: 0.9,
      minTensaoPrecaria: 0, minTensaoCritica: 0, minAcima242: 0, segundosCobertos: coberto ? 900 : 0,
    };
  }).filter((j) => j.segundosCobertos > 0);
}

describe('resumirDia', () => {
  it('dia útil completo', () => {
    const r = resumirDia('2026-09-08', diaSintetico());
    expect(r).not.toBeNull();
    expect(r!.coberturaPct).toBeCloseTo(100, 5);
    expect(r!.baseNoturnaW).toBeCloseTo(1000, 5);
    expect(r!.impPontaKwh).toBeCloseTo(4.8, 5);
    expect(r!.demandaMaxW).toBeCloseTo(1600, 5);
    expect(r!.demandaMaxInicio).toBe('2026-09-08T21:00:00.000Z'); // 18:00 BRT
    expect(r!.exportadoKwh).toBeCloseTo(32 * 0.45, 5);
    const postos = r!.impPontaKwh + r!.impIntermediarioKwh + r!.impForaPontaKwh;
    expect(postos).toBeCloseTo(r!.importadoKwh, 6);
    expect(r!.tensaoMaxV).toBe(236);
  });

  it('janela sem cobertura baixa a cobertura (não vira zero escondido)', () => {
    const r = resumirDia('2026-09-08', diaSintetico('2026-09-08', [0, 1, 2, 3]));
    expect(r!.coberturaPct).toBeCloseTo(92 / 96 * 100, 5);
  });

  it('sábado: ponta = 0', () => {
    const r = resumirDia('2026-09-12', diaSintetico('2026-09-12'));
    expect(r!.impPontaKwh).toBe(0);
    expect(r!.impIntermediarioKwh).toBe(0);
  });

  it('só janelas do próprio dia de Brasília', () => {
    const js = [...diaSintetico('2026-09-08'), ...diaSintetico('2026-09-09')];
    const r = resumirDia('2026-09-08', js);
    expect(r!.coberturaPct).toBeCloseTo(100, 5);
  });

  it('sem nenhuma janela = null (dia sem dado não existe)', () => {
    expect(resumirDia('2026-09-08', [])).toBeNull();
  });

  it('base noturna sem janela boa de madrugada = null', () => {
    const r = resumirDia('2026-09-08', diaSintetico('2026-09-08', Array.from({ length: 20 }, (_, i) => i)));
    expect(r!.baseNoturnaW).toBeNull();
  });
});
