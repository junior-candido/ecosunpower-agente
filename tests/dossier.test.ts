import { describe, it, expect } from 'vitest';

describe('DossierBuilder', () => {
  it('should format a complete dossier', async () => {
    const { DossierBuilder } = await import('../src/modules/dossier.js');

    const dossier = DossierBuilder.format({
      leadNumber: 42,
      name: 'Joao Silva',
      phone: '5561999999999',
      city: 'Brasilia - Asa Norte',
      profile: 'residencial',
      origin: 'Instagram Ads',
      energyData: {
        group: 'B',
        consumption_kwh: 450,
        monthly_bill: 800,
        tariff_type: 'convencional',
      },
      opportunities: {
        solar: true,
        battery: true,
        bess: false,
        free_market: false,
        diesel_replacement: false,
        ev_charging: true,
      },
      futureDemand: 'Pretende comprar carro eletrico em 2026',
      conversationSummary: [
        'Cliente demonstrou forte interesse em reducao de custos',
        'Mencionou quedas frequentes de energia no bairro',
        'Interesse alto',
      ],
      recommendation: 'Agendar visita tecnica. Potencial para solar + bateria residencial.',
    });

    expect(dossier).toContain('DOSSIE - Lead #42');
    expect(dossier).toContain('Joao Silva');
    expect(dossier).toContain('RESIDENCIAL');
    expect(dossier).toContain('Instagram Ads');
    expect(dossier).toContain('R$ 800');
    expect(dossier).toContain('[x] Sistema fotovoltaico');
    expect(dossier).toContain('[x] Bateria residencial');
    expect(dossier).toContain('[ ] BESS');
    expect(dossier).toContain('carro eletrico');
  });

  it('should handle missing optional fields', async () => {
    const { DossierBuilder } = await import('../src/modules/dossier.js');

    const dossier = DossierBuilder.format({
      leadNumber: 1,
      name: 'Maria',
      phone: '5562988888888',
      city: 'Goiania',
      profile: 'residencial',
      origin: 'Organico',
      energyData: { monthly_bill: 500 },
      opportunities: { solar: true },
      conversationSummary: ['Interesse moderado'],
      recommendation: 'Ligar para apresentar opcoes.',
    });

    expect(dossier).toContain('Maria');
    expect(dossier).toContain('Goiania');
    expect(dossier).toContain('R$ 500');
  });
});
