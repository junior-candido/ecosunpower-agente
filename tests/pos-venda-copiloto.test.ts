import { describe, it, expect } from 'vitest';
import { montarSystemPromptPosVenda, montarContextoPosVenda, limparMensagem } from '../src/modules/dashboard/pos-venda-copiloto.js';

describe('limparMensagem (rede de segurança: sem asterisco/colchete)', () => {
  it('remove asteriscos e colchetes mantendo o conteúdo', () => {
    expect(limparMensagem('Oi *João*, tá [tudo bem]?')).toBe('Oi João, tá tudo bem?');
  });
  it('não estraga texto já limpo', () => {
    expect(limparMensagem('Oi João, tudo certo com sua usina?')).toBe('Oi João, tudo certo com sua usina?');
  });
});

describe('montarSystemPromptPosVenda', () => {
  it('proíbe asterisco e colchete (mensagem limpa)', () => {
    const p = montarSystemPromptPosVenda({ nome: 'João', temMonitoramento: true });
    expect(p).toMatch(/NUNCA use asterisco/i);
    expect(p).toMatch(/NUNCA use colchete/i);
  });
  it('regra de veracidade: nunca inventar geração/economia', () => {
    const p = montarSystemPromptPosVenda({ nome: 'João', temMonitoramento: true });
    expect(p).toMatch(/NUNCA invente/i);
  });
  it('SEM monitoramento: orienta o operador a ver no monitoramento nativo e colar', () => {
    const p = montarSystemPromptPosVenda({ nome: 'João', temMonitoramento: false });
    expect(p).toMatch(/sem monitoramento/i);
    expect(p).toMatch(/monitoramento nativo/i);
  });
  it('COM monitoramento: usa a geração real fornecida', () => {
    const p = montarSystemPromptPosVenda({ nome: 'João', temMonitoramento: true, geracaoResumo: 'Últimos 30 dias: 450 kWh' });
    expect(p).toContain('450 kWh');
  });
  it('COM monitoramento mas SEM dado recente: orienta o operador (não parabeniza às cegas)', () => {
    const p = montarSystemPromptPosVenda({ nome: 'João', temMonitoramento: true });
    expect(p).toMatch(/monitoramento nativo/i);
    expect(p).toMatch(/NÃO tem os números reais/i);
  });
  it('inclui os dados do cliente quando existem', () => {
    const p = montarSystemPromptPosVenda({ nome: 'João', cidade: 'Brasília', potenciaKwp: 8, temMonitoramento: true });
    expect(p).toContain('João');
    expect(p).toContain('Brasília');
    expect(p).toContain('8 kWp');
  });
  it('prepende a base de conhecimento quando fornecida', () => {
    const p = montarSystemPromptPosVenda({ nome: 'João', temMonitoramento: true }, 'CONHECIMENTO PÓS-VENDA AQUI');
    expect(p.startsWith('CONHECIMENTO PÓS-VENDA AQUI')).toBe(true);
  });
});

describe('montarContextoPosVenda', () => {
  it('mapeia os campos e troca null por undefined', () => {
    const ctx = montarContextoPosVenda({
      nome: 'Maria', cidade: null, potenciaKwp: 10, marcaInversor: 'Deye',
      dataInstalacao: '2025-01-10', temMonitoramento: true, geracaoResumo: 'Últimos 30 dias: 300 kWh', jaTeveDepoimento: false,
    });
    expect(ctx).toEqual({
      nome: 'Maria', cidade: undefined, potenciaKwp: 10, marcaInversor: 'Deye',
      dataInstalacao: '2025-01-10', temMonitoramento: true, geracaoResumo: 'Últimos 30 dias: 300 kWh', jaTeveDepoimento: false,
    });
  });
  it('sem monitoramento: temMonitoramento=false e geracaoResumo undefined', () => {
    const ctx = montarContextoPosVenda({ nome: 'Ana', temMonitoramento: false });
    expect(ctx.temMonitoramento).toBe(false);
    expect(ctx.geracaoResumo).toBeUndefined();
  });
});
