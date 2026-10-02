import { describe, it, expect } from 'vitest';
import { renderEnergyStudioBody, type DadosEnergyStudio } from '../src/modules/dashboard/energy-studio-views.js';
import { resumirPrevistoFrota } from '../src/modules/dashboard/previsto-frota.js';

const base: DadosEnergyStudio = {
  previsto: null, usinasComPrevisto: 0,
  calibracao: { alta: 0, media: 0, baixa: 0, semCurva: 0 }, alertasAbertos: 0,
  rede: { comMedicao: 0, criticas: 0, desarmes7d: 0, top: [] },
};

describe('Energy Studio (hub)', () => {
  it('sem dados ainda: explica que o previsto roda à noite e não quebra', () => {
    const h = renderEnergyStudioBody(base);
    expect(h).toContain('Energy Studio');
    expect(h).toContain('calculado toda noite');
    expect(h).toContain('/dashboard/rede/mapa');
  });

  it('lista a usina abaixo do previsto com link pro Previsto × Real e a rede crítica', () => {
    const previsto = resumirPrevistoFrota(
      [{ id: 'u1', apelido: 'Casa <Ana>' }, { id: 'u2', apelido: 'Boa' }],
      [{ sistema_id: 'u1', kwh_previsto: 30, clima: 'limpo' }, { sistema_id: 'u2', kwh_previsto: 30, clima: 'limpo' }],
      new Map([['u1', 10], ['u2', 30]]), '2026-10-01');
    const h = renderEnergyStudioBody({
      ...base, previsto, usinasComPrevisto: 2, alertasAbertos: 1,
      rede: { comMedicao: 1, criticas: 1, desarmes7d: 3, top: [{ id: 'u2', nome: 'Boa', vMax: 251, desarmes: 3, diasCriticos: 2 }] },
    });
    expect(h).toContain('/dashboard/monitoramento/u1/previsto');
    expect(h).toContain('Casa &lt;Ana&gt;');
    expect(h).not.toContain('/dashboard/monitoramento/u2/previsto');
    expect(h).toContain('/dashboard/monitoramento/u2/rede');
    expect(h).toContain('01/10');
  });
});
