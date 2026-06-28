// tests/pos-venda-sugestao.test.ts
import { describe, it, expect } from 'vitest';
import { sugestaoProativa, type LinhaSugestao } from '../src/modules/dashboard/pos-venda-sugestao.js';

const HOJE = new Date('2026-06-28T12:00:00Z');
const diasAtras = (n: number) => new Date(HOJE.getTime() - n * 86400000).toISOString();
const base: LinhaSugestao = {
  saude: 'verde', ultimoContatoEm: diasAtras(10), jaTeveDepoimento: true,
  elegivelUpgrade: false, dataInstalacao: '2026-06-01',
};

describe('sugestaoProativa', () => {
  it('saúde vermelha tem prioridade: oferece revisão', () => {
    const s = sugestaoProativa({ ...base, saude: 'vermelho' }, HOJE);
    expect(s?.texto).toMatch(/revis/i);
    expect(s?.pedidoEva).toMatch(/revis/i);
  });
  it('mais de 90 dias sem falar: sugere reativar', () => {
    const s = sugestaoProativa({ ...base, ultimoContatoEm: diasAtras(120) }, HOJE);
    expect(s?.texto).toMatch(/sem falar/i);
  });
  it('elegível a upgrade: sonda ampliação', () => {
    const s = sugestaoProativa({ ...base, elegivelUpgrade: true }, HOJE);
    expect(s?.texto).toMatch(/upgrade|crescer/i);
  });
  it('sem depoimento + verde + instalado há 2+ meses: pede depoimento', () => {
    const s = sugestaoProativa({ ...base, jaTeveDepoimento: false, dataInstalacao: '2026-03-01' }, HOJE);
    expect(s?.texto).toMatch(/depoimento/i);
  });
  it('nada a sugerir agora retorna null', () => {
    const s = sugestaoProativa(base, HOJE);
    expect(s).toBeNull();
  });
});
