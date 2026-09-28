import { describe, it, expect } from 'vitest';
import { montarPainel, type DiaMedido, type JanelaPerfil } from '../src/modules/energia/energia-casa.js';
import { somarDias } from '../src/modules/energia/tempo.js';

const HOJE = '2026-09-28';
const dia = (d: string, o: Partial<DiaMedido> = {}): DiaMedido => ({
  dia: d, importadoKwh: 21, exportadoKwh: 14.5, coberturaPct: 100, baseNoturnaW: 1000, demandaMaxW: 5000, ...o,
});

describe('montarPainel — Energia da casa', () => {
  it('período: só dias completos com geração entram na conta', () => {
    const dias = [dia(somarDias(HOJE, -2)), dia(somarDias(HOJE, -1)), dia(HOJE, { coberturaPct: 40, importadoKwh: 5, exportadoKwh: 3 })];
    const geracao = { [somarDias(HOJE, -2)]: 24.75, [somarDias(HOJE, -1)]: 24.75, [HOJE]: 10 };
    const p = montarPainel({ hoje: HOJE, temUsina: true, dias, geracao, janelas: [], mes: null });
    expect(p.serie).toHaveLength(30);
    expect(p.periodo).toMatchObject({ dias: 30, diasComDado: 3, diasCompletos: 2, diasUsados: 2 });
    expect(p.periodo.balanco!.importadoKwh).toBeCloseTo(42);
    expect(p.periodo.balanco!.geradoKwh).toBeCloseTo(49.5);
    expect(p.periodo.balanco!.consumoKwh).toBeCloseTo(49.5 + 42 - 29);
    // hoje parcial aparece na série, mas sem consumo
    const hoje = p.serie.at(-1)!;
    expect(hoje).toMatchObject({ dia: HOJE, completo: false, consumoKwh: null, importadoKwh: 5 });
  });

  it('dia sem linha é null (nunca 0)', () => {
    const p = montarPainel({ hoje: HOJE, temUsina: true, dias: [dia(HOJE)], geracao: {}, janelas: [], mes: null });
    const antes = p.serie[0];
    expect(antes.importadoKwh).toBeNull();
    expect(antes.coberturaPct).toBeNull();
    expect(antes.consumoKwh).toBeNull();
  });

  it('com usina mas sem geração nos dias completos: nenhum dia usável → balanço null', () => {
    const p = montarPainel({ hoje: HOJE, temUsina: true, dias: [dia(somarDias(HOJE, -1))], geracao: {}, janelas: [], mes: null });
    expect(p.periodo.diasUsados).toBe(0);
    expect(p.periodo.balanco).toBeNull();
  });

  it('sem usina: comprado e devolvido, gerado/consumo sem dado', () => {
    const p = montarPainel({ hoje: HOJE, temUsina: false, dias: [dia(somarDias(HOJE, -1))], geracao: { [somarDias(HOJE, -1)]: 99 }, janelas: [], mes: null });
    expect(p.periodo.balanco).toMatchObject({ importadoKwh: 21, exportadoKwh: 14.5, geradoKwh: null, consumoKwh: null, aviso: 'sem_geracao' });
    expect(p.serie.at(-2)!.geradoKwh).toBeNull();
  });

  it('perfil por hora = potência média sobre o tempo coberto', () => {
    const janelas: JanelaPerfil[] = [
      { inicio: '2026-09-27T03:00:00.000Z', importadoWh: 250, exportadoWh: 0, segundosCobertos: 900 }, // 00h BRT
      { inicio: '2026-09-27T03:15:00.000Z', importadoWh: 250, exportadoWh: 0, segundosCobertos: 900 },
      { inicio: '2026-09-27T03:30:00.000Z', importadoWh: 250, exportadoWh: 0, segundosCobertos: 900 },
      { inicio: '2026-09-27T03:45:00.000Z', importadoWh: 125, exportadoWh: 0, segundosCobertos: 450 },
      { inicio: '2026-09-27T15:00:00.000Z', importadoWh: 0, exportadoWh: 500, segundosCobertos: 900 }, // 12h BRT: 1 janela só
    ];
    const p = montarPainel({ hoje: HOJE, temUsina: false, dias: [], geracao: {}, janelas, mes: null });
    expect(p.perfil).toHaveLength(24);
    expect(p.perfil[0].importadoKw).toBeCloseTo(1, 6);
    expect(p.perfil[12].exportadoKw).toBeNull(); // só 15 min cobertos: pouco pra média
    expect(p.perfil[5].importadoKw).toBeNull();
  });

  it('base noturna = mediana dos dias completos; demanda = maior', () => {
    const p = montarPainel({
      hoje: HOJE, temUsina: false, geracao: {}, janelas: [], mes: null,
      dias: [dia('2026-09-20', { baseNoturnaW: 900 }), dia('2026-09-21', { baseNoturnaW: 1100, demandaMaxW: 9800 }), dia('2026-09-22', { baseNoturnaW: 1000 }), dia('2026-09-23', { baseNoturnaW: 5000, coberturaPct: 50 })],
    });
    expect(p.baseNoturnaW).toBe(1000);
    expect(p.demandaMaxW).toBe(9800);
  });

  it('conciliação: mês civil com cobertura baixa → sem dado, dizendo o porquê', () => {
    const p = montarPainel({
      hoje: HOJE, temUsina: true, dias: [], geracao: {}, janelas: [],
      mes: { referencia: '2026-09-01', dias: [dia('2026-09-10'), dia('2026-09-11')], demonstrativo: { injetado_kwh: 400, consumo_kwh: 600 } },
    });
    expect(p.conciliacao!.coberturaPct).toBeCloseTo(200 / 30, 5);
    expect(p.conciliacao!.linhas.every((l) => l.veredito === 'sem_dado')).toBe(true);
  });

  it('conciliação: mês completo compara somas', () => {
    const dias = Array.from({ length: 30 }, (_, i) => dia(`2026-09-${String(i + 1).padStart(2, '0')}`));
    const p = montarPainel({ hoje: HOJE, temUsina: true, dias: [], geracao: {}, janelas: [], mes: { referencia: '2026-09-01', dias, demonstrativo: { injetado_kwh: 440, consumo_kwh: 640 } } });
    const inj = p.conciliacao!.linhas.find((l) => l.grandeza === 'injetado')!;
    expect(inj.medidoKwh).toBeCloseTo(435);
    expect(inj.veredito).toBe('bate');
  });
});
