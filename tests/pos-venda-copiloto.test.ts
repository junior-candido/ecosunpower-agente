import { describe, it, expect } from 'vitest';
import { montarSystemPromptPosVenda, montarContextoPosVenda } from '../src/modules/dashboard/pos-venda-copiloto.js';

describe('montarSystemPromptPosVenda', () => {
  it('proíbe asterisco e colchete (mensagem limpa)', () => {
    const p = montarSystemPromptPosVenda({ nome: 'João' });
    expect(p).toMatch(/NUNCA use asterisco/i);
    expect(p).toMatch(/NUNCA use colchete/i);
  });
  it('inclui os dados do cliente quando existem', () => {
    const p = montarSystemPromptPosVenda({ nome: 'João', cidade: 'Brasília', potenciaKwp: 8 });
    expect(p).toContain('João');
    expect(p).toContain('Brasília');
    expect(p).toContain('8 kWp');
  });
  it('prepende a base de conhecimento quando fornecida', () => {
    const p = montarSystemPromptPosVenda({ nome: 'João' }, 'CONHECIMENTO PÓS-VENDA AQUI');
    expect(p.startsWith('CONHECIMENTO PÓS-VENDA AQUI')).toBe(true);
  });
});

describe('montarContextoPosVenda', () => {
  it('mapeia os campos e troca null por undefined', () => {
    const ctx = montarContextoPosVenda({
      nome: 'Maria', cidade: null, potenciaKwp: 10, marcaInversor: 'Deye',
      dataInstalacao: '2025-01-10', saude: 'boa', jaTeveDepoimento: false,
    });
    expect(ctx).toEqual({
      nome: 'Maria', cidade: undefined, potenciaKwp: 10, marcaInversor: 'Deye',
      dataInstalacao: '2025-01-10', saude: 'boa', jaTeveDepoimento: false,
    });
  });
});
