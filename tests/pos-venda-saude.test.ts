import { describe, it, expect } from 'vitest';
import {
  saudeUsina, elegivelUpgrade, proximaAcaoPosVenda, ordenarPorAtencao,
} from '../src/modules/dashboard/pos-venda-saude.js';

describe('saudeUsina', () => {
  const ger = (n: number) => Array.from({ length: n }, (_, i) => ({ data: `2026-06-${String(i + 1).padStart(2, '0')}`, geracao_kwh: 20 }));

  it('vermelho quando há alerta de offline aberto', () => {
    expect(saudeUsina([{ tipo: 'sistema_offline', severidade: 'urgente' }], ger(10))).toBe('vermelho');
  });
  it('vermelho quando há falha de inversor aberta', () => {
    expect(saudeUsina([{ tipo: 'falha_inversor', severidade: 'urgente' }], ger(10))).toBe('vermelho');
  });
  it('vermelho quando a usina não gera nada há dias (todas as leituras recentes zeradas)', () => {
    const zerado = ger(8).map((g) => ({ ...g, geracao_kwh: 0 }));
    expect(saudeUsina([], zerado)).toBe('vermelho');
  });
  it('amarelo quando há queda de geração aberta', () => {
    expect(saudeUsina([{ tipo: 'queda_geracao', severidade: 'aviso' }], ger(10))).toBe('amarelo');
  });
  it('amarelo quando manutenção devida está aberta', () => {
    expect(saudeUsina([{ tipo: 'manutencao_devida', severidade: 'info' }], ger(10))).toBe('amarelo');
  });
  it('verde quando gera normal e não há alerta relevante', () => {
    expect(saudeUsina([{ tipo: 'milestone_economia', severidade: 'info' }], ger(10))).toBe('verde');
  });
  it('verde quando não há geração registrada ainda (sem dados ≠ offline)', () => {
    expect(saudeUsina([], [])).toBe('verde');
  });
});

describe('elegivelUpgrade', () => {
  it('elegível quando o consumo médio supera a geração em mais de 15%', () => {
    expect(elegivelUpgrade({ potenciaKwp: 5, dataInstalacao: '2024-01-01', geracaoEstimadaKwhMes: 600 }, { consumoMedioKwh: 800 })).toBe(true);
  });
  it('não elegível quando geração cobre o consumo', () => {
    expect(elegivelUpgrade({ potenciaKwp: 5, dataInstalacao: '2024-01-01', geracaoEstimadaKwhMes: 600 }, { consumoMedioKwh: 580 })).toBe(false);
  });
  it('não elegível quando faltam dados (não chuta)', () => {
    expect(elegivelUpgrade({ potenciaKwp: 5, dataInstalacao: null, geracaoEstimadaKwhMes: null }, { consumoMedioKwh: 800 })).toBe(false);
    expect(elegivelUpgrade({ potenciaKwp: 5, dataInstalacao: null, geracaoEstimadaKwhMes: 600 }, { consumoMedioKwh: null })).toBe(false);
  });
});

describe('proximaAcaoPosVenda', () => {
  const hoje = new Date('2026-06-25T12:00:00Z');
  const base = {
    saude: 'verde' as const,
    dataInstalacao: '2024-06-25',
    ultimoContatoEm: '2026-06-20T12:00:00Z',
    jaTeveDepoimento: false,
    elegivelUpgrade: false,
  };

  it('saúde vermelha → limpeza/atenção com urgência alta', () => {
    const a = proximaAcaoPosVenda({ ...base, saude: 'vermelho' }, hoje);
    expect(a.tipo).toBe('limpeza');
    expect(a.urgencia).toBe('alta');
  });
  it('aniversário da usina em ≤7 dias → parabéns', () => {
    const a = proximaAcaoPosVenda({ ...base, dataInstalacao: '2024-06-30' }, hoje);
    expect(a.tipo).toBe('parabens');
  });
  it('saudável, nunca pediu depoimento e usina já tem ≥3 meses → depoimento', () => {
    const a = proximaAcaoPosVenda({ ...base, dataInstalacao: '2025-01-01', jaTeveDepoimento: false }, hoje);
    expect(a.tipo).toBe('depoimento');
  });
  it('já tem depoimento e é elegível a upgrade → upgrade', () => {
    const a = proximaAcaoPosVenda({ ...base, dataInstalacao: '2025-01-01', jaTeveDepoimento: true, elegivelUpgrade: true }, hoje);
    expect(a.tipo).toBe('upgrade');
  });
  it('tudo em dia → registrar contato (urgência baixa)', () => {
    const a = proximaAcaoPosVenda({ ...base, dataInstalacao: '2025-01-01', jaTeveDepoimento: true, elegivelUpgrade: false }, hoje);
    expect(a.tipo).toBe('contato');
    expect(a.urgencia).toBe('baixa');
  });
});

describe('ordenarPorAtencao', () => {
  it('vermelho antes de amarelo antes de verde; dentro do mesmo, mais tempo sem contato primeiro', () => {
    const linhas = [
      { id: 'a', saude: 'verde' as const, ultimoContatoEm: '2026-06-01T00:00:00Z' },
      { id: 'b', saude: 'vermelho' as const, ultimoContatoEm: '2026-06-24T00:00:00Z' },
      { id: 'c', saude: 'verde' as const, ultimoContatoEm: '2026-01-01T00:00:00Z' },
      { id: 'd', saude: 'amarelo' as const, ultimoContatoEm: '2026-06-20T00:00:00Z' },
    ];
    expect(ordenarPorAtencao(linhas).map((l) => l.id)).toEqual(['b', 'd', 'c', 'a']);
  });
});
