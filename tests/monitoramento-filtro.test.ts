// tests/monitoramento-filtro.test.ts
import { describe, it, expect } from 'vitest';
import { filtrarOrdenarSistemas } from '../src/modules/monitoring/filtro.js';

const rows = [
  { apelido: 'Casa Silva', cidade: 'Brasília', marca_inversor: 'deye',      nivel: 'urgente', geracao_hoje_kwh: 0 },
  { apelido: 'Bar Rota',   cidade: 'Correntina', marca_inversor: 'solaredge', nivel: 'ok',     geracao_hoje_kwh: 30 },
  { apelido: 'Ana C',      cidade: 'Brasília', marca_inversor: 'deye',      nivel: 'aviso',   geracao_hoje_kwh: 5 },
] as any[];

describe('filtrarOrdenarSistemas', () => {
  it('busca por nome/cidade (case-insensitive)', () => {
    expect(filtrarOrdenarSistemas(rows, { q: 'silva' }).map(r => r.apelido)).toEqual(['Casa Silva']);
    expect(filtrarOrdenarSistemas(rows, { q: 'brasil' }).map(r => r.apelido).sort()).toEqual(['Ana C', 'Casa Silva']);
  });
  it('filtra por marca e por status(nivel)', () => {
    expect(filtrarOrdenarSistemas(rows, { marca: 'deye' }).length).toBe(2);
    expect(filtrarOrdenarSistemas(rows, { status: 'urgente' }).map(r => r.apelido)).toEqual(['Casa Silva']);
  });
  it('ordena por severidade (urgente>aviso>info>ok) por padrão', () => {
    expect(filtrarOrdenarSistemas(rows, {}).map(r => r.nivel)).toEqual(['urgente', 'aviso', 'ok']);
  });
  it('ord=geracao_desc ordena por geração de hoje desc', () => {
    expect(filtrarOrdenarSistemas(rows, { ord: 'geracao_desc' }).map(r => r.geracao_hoje_kwh)).toEqual([30, 5, 0]);
  });
});
