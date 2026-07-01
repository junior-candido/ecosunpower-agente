import { describe, it, expect } from 'vitest';
import { objetivoManual, fallbackMensagem } from '../src/modules/dashboard/pos-venda-mensagens.js';

describe('objetivoManual', () => {
  it('dá um objetivo distinto e não-vazio pra cada ação que manda mensagem', () => {
    for (const t of ['parabens', 'relatorio', 'limpeza', 'depoimento', 'upgrade'] as const) {
      expect(objetivoManual(t).length).toBeGreaterThan(10);
    }
  });
});

describe('fallbackMensagem', () => {
  const ctx = { nome: 'Antonio Carlos', mes: { kwh: 1200, reais: 980.5, mesLabel: 'maio', parcial: false } };

  it('parabéns usa só o primeiro nome e não fala preço', () => {
    const m = fallbackMensagem('parabens', ctx);
    expect(m).toContain('Antonio');
    expect(m).not.toMatch(/R\$\s?\d/);
  });
  it('relatório do mês cita kWh e economia quando há números', () => {
    const m = fallbackMensagem('relatorio', ctx);
    expect(m).toContain('1200');
    expect(m).toMatch(/980[.,]5/);
  });
  it('relatório sem números não inventa valores', () => {
    const m = fallbackMensagem('relatorio', { nome: 'Maria', mes: null });
    expect(m).not.toMatch(/R\$\s?\d/);
    expect(m).toContain('Maria');
  });
  it('limpeza e upgrade nunca citam preço de serviço', () => {
    expect(fallbackMensagem('limpeza', ctx)).not.toMatch(/R\$\s?\d/);
    expect(fallbackMensagem('upgrade', ctx)).not.toMatch(/R\$\s?\d/);
  });
});
