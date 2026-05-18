// tests/relatorio-gravidade.test.ts
import { describe, it, expect } from 'vitest';
import { classificarGravidade } from '../src/modules/monitoring/relatorio/gravidade.js';

describe('classificarGravidade', () => {
  it('offline -> grave', () => {
    const r = classificarGravidade({ apelido: 'Casa Silva', offline: true, diasSemGeracao: 5, erro: false, ratio7d: 0 });
    expect(r.gravidade).toBe('grave');
    expect(r.descritivo).toBe('Casa Silva: parada há 5 dias, sem geração. Provável inversor desligado / sem internet.');
  });
  it('erro de integração -> grave', () => {
    const r = classificarGravidade({ apelido: 'Ana C', offline: false, diasSemGeracao: 0, erro: true, ratio7d: 0.9 });
    expect(r.gravidade).toBe('grave');
    expect(r.descritivo).toBe('Ana C: falha de integração com a API — não estamos lendo os dados da usina.');
  });
  it('ratio <= 0.50 -> grave', () => {
    const r = classificarGravidade({ apelido: 'Bar', offline: false, diasSemGeracao: 0, erro: false, ratio7d: 0.50 });
    expect(r.gravidade).toBe('grave');
    expect(r.descritivo).toBe('Bar: gerando só 50% do esperado (últimos 7 dias) — queda forte.');
  });
  it('0.50 < ratio < 0.70 -> medio', () => {
    const r = classificarGravidade({ apelido: 'Ana C', offline: false, diasSemGeracao: 0, erro: false, ratio7d: 0.62 });
    expect(r.gravidade).toBe('medio');
    expect(r.descritivo).toBe('Ana C: gerando ~62% do esperado (últimos 7 dias). Possível sujeira/sombra — candidata a limpeza.');
  });
  it('0.70 <= ratio < 0.85 -> leve', () => {
    const r = classificarGravidade({ apelido: 'Bar Rota', offline: false, diasSemGeracao: 0, erro: false, ratio7d: 0.80 });
    expect(r.gravidade).toBe('leve');
    expect(r.descritivo).toBe('Bar Rota: levemente abaixo (~80% do esperado, 7 dias). Só acompanhar, sem ação.');
  });
  it('ratio >= 0.85 -> null (não incomoda)', () => {
    expect(classificarGravidade({ apelido: 'X', offline: false, diasSemGeracao: 0, erro: false, ratio7d: 0.85 }).gravidade).toBeNull();
    expect(classificarGravidade({ apelido: 'X', offline: false, diasSemGeracao: 0, erro: false, ratio7d: 1.2 }).gravidade).toBeNull();
  });
});
