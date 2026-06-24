import { describe, it, expect } from 'vitest';
import { calcular, type ProposalInput } from '../src/modules/proposal/calculator.js';
import { renderEconomiaAnimada } from '../src/modules/proposal/economia-animada-render.js';

function input(over: Partial<ProposalInput> = {}): ProposalInput {
  return {
    potenciaKwp: 8.58, fatorPerda: 0.8, hsp: 5.2,
    consumoMensalKwh: 1000, tarifaRsKwh: 1.05, reajusteAnualEnergia: 0.10,
    tusdFioBRsKwh: 0.30, percentualFioBVigente: 0.60, percentualGeracaoInjetada: 0.75,
    custoIluminacaoPublica: 35, valorTotalRs: 28500, vidaUtilAnos: 25,
    geracaoMensalKwhOverride: 1071, anoInicial: 2026, tipoSistema: 'on_grid',
    ...over,
  };
}

describe('renderEconomiaAnimada', () => {
  it('on-grid: cena com painel→casa (autoconsumo) e painel→rede (injeção/Fio B)', () => {
    const html = renderEconomiaAnimada(calcular(input()), { temCarregador: false });
    expect(html.toLowerCase()).toContain('autoconsumo');
    expect(html.toLowerCase()).toContain('rede'); // injeção pra rede
    expect(html).toContain('Fio B');
    // contadores trazem os valores ALVO reais do cliente (fallback estático = valor final)
    expect(html).toContain('data-target'); // animação de contador
    // valor da geração (1.071) aparece como alvo
    expect(html).toMatch(/data-target="1071"/);
  });

  it('off-grid: sem poste/rede e sem Fio B (você sai da conta)', () => {
    const html = renderEconomiaAnimada(calcular(input({ tipoSistema: 'off_grid' })), {});
    expect(html).not.toContain('Fio B');
    expect(html.toLowerCase()).not.toContain('injeç'); // sem injeção pra rede
  });

  it('híbrido: mostra a bateria na cena', () => {
    const html = renderEconomiaAnimada(calcular(input({ tipoSistema: 'hibrido', modoBateria: 'autoconsumo' })), {});
    expect(html.toLowerCase()).toContain('bateria');
  });

  it('carregador: mostra o carro carregando na cena', () => {
    const html = renderEconomiaAnimada(calcular(input()), { temCarregador: true });
    expect(html.toLowerCase()).toContain('carro');
  });

  it('inclui o IntersectionObserver pra disparar a animação ao rolar até a seção', () => {
    const html = renderEconomiaAnimada(calcular(input()), { temCarregador: false });
    expect(html).toContain('IntersectionObserver');
  });
});
