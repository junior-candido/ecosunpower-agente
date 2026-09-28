import { describe, it, expect } from 'vitest';
import { balancoEnergia } from '../src/modules/energia/balanco.js';
import { conciliarComDemonstrativo } from '../src/modules/energia/conciliacao.js';

describe('balancoEnergia', () => {
  it('casa do piloto (geração ilustrativa 27 kWh)', () => {
    const b = balancoEnergia({ geradoKwh: 27, importadoKwh: 21, exportadoKwh: 14.5 });
    expect(b.consumoKwh).toBeCloseTo(33.5);
    expect(b.autoconsumoPct).toBeCloseTo(46.3, 1);      // (27 − 14,5) / 27
    expect(b.autossuficienciaPct).toBeCloseTo(37.3, 1); // (27 − 14,5) / 33,5
    expect(b.aviso).toBeNull();
  });
  it('sem geração: só o que o medidor sabe', () => {
    const b = balancoEnergia({ geradoKwh: null, importadoKwh: 21, exportadoKwh: 14.5 });
    expect(b.consumoKwh).toBeNull();
    expect(b.autoconsumoPct).toBeNull();
    expect(b.autossuficienciaPct).toBeNull();
    expect(b.aviso).toBe('sem_geracao');
  });
  it('gerou menos do que devolveu → conferir cadastro, não calcula', () => {
    const b = balancoEnergia({ geradoKwh: 5, importadoKwh: 3, exportadoKwh: 9 });
    expect(b.aviso).toBe('conferir_cadastro');
    expect(b.consumoKwh).toBeNull();
  });
  it('geração zero (noite/usina parada) não divide por zero', () => {
    const b = balancoEnergia({ geradoKwh: 0, importadoKwh: 10, exportadoKwh: 0 });
    expect(b.consumoKwh).toBe(10);
    expect(b.autoconsumoPct).toBeNull();
    expect(b.autossuficienciaPct).toBe(0);
  });
});

describe('conciliarComDemonstrativo', () => {
  const base = { referencia: '2026-10-01', coberturaMesPct: 97 };
  const linha = (r: ReturnType<typeof conciliarComDemonstrativo>, g: 'injetado' | 'consumo') => r.find((x) => x.grandeza === g)!;

  it('(a) exportado 430 × injetado 435 → bate', () => {
    const r = conciliarComDemonstrativo({ ...base, exportadoMesKwh: 430, importadoMesKwh: 630, demonstrativo: { injetado_kwh: 435, consumo_kwh: 630 } });
    expect(linha(r, 'injetado').veredito).toBe('bate');
    expect(linha(r, 'injetado').difPct).toBeCloseTo(-1.15, 1);
    expect(linha(r, 'injetado').texto).toMatch(/ciclo de leitura/);
  });
  it('(b) importado 630 × consumo 700 → atenção', () => {
    const r = conciliarComDemonstrativo({ ...base, exportadoMesKwh: 430, importadoMesKwh: 630, demonstrativo: { injetado_kwh: 430, consumo_kwh: 700 } });
    expect(linha(r, 'consumo').veredito).toBe('atencao');
  });
  it('(c) 630 × 800 → diverge', () => {
    const r = conciliarComDemonstrativo({ ...base, exportadoMesKwh: 430, importadoMesKwh: 630, demonstrativo: { injetado_kwh: 430, consumo_kwh: 800 } });
    expect(linha(r, 'consumo').veredito).toBe('diverge');
  });
  it('(d) cobertura 80% → sem_dado com motivo, sem número de diferença', () => {
    const r = conciliarComDemonstrativo({ ...base, coberturaMesPct: 80, exportadoMesKwh: 300, importadoMesKwh: 400, demonstrativo: { injetado_kwh: 430, consumo_kwh: 630 } });
    for (const l of r) {
      expect(l.veredito).toBe('sem_dado');
      expect(l.difPct).toBeNull();
      expect(l.texto).toMatch(/80%/);
    }
  });
  it('(e) demonstrativo com injetado nulo → linha sem_dado', () => {
    const r = conciliarComDemonstrativo({ ...base, exportadoMesKwh: 430, importadoMesKwh: 630, demonstrativo: { injetado_kwh: null, consumo_kwh: 630 } });
    expect(linha(r, 'injetado').veredito).toBe('sem_dado');
    expect(linha(r, 'consumo').veredito).toBe('bate');
  });
  it('(f) diferença pequena em kWh mas grande em % (8 × 12) → bate pela regra max(5%, 10 kWh)', () => {
    const r = conciliarComDemonstrativo({ ...base, exportadoMesKwh: 8, importadoMesKwh: 630, demonstrativo: { injetado_kwh: 12, consumo_kwh: 630 } });
    expect(linha(r, 'injetado').veredito).toBe('bate');
  });
  it('sem demonstrativo → sem_dado', () => {
    const r = conciliarComDemonstrativo({ ...base, exportadoMesKwh: 8, importadoMesKwh: 630, demonstrativo: null });
    expect(r.every((l) => l.veredito === 'sem_dado')).toBe(true);
  });
});
