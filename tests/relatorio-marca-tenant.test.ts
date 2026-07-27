// tests/relatorio-marca-tenant.test.ts
//
// Achado na degustação Sabion 27/07: o "Gerar relatório" da usina do TENANT
// saía com a marca completa da ECOSUN (logo, CNPJ, CTA da Eva). Pedido do
// Junior: "tem que deixar neutro, está com minha logo".
// Regra: com `marca` (tenant) o relatório sai NEUTRO — nome da empresa dele
// no cabeçalho, SEM logo (até o B1c ter upload de logo), SEM CTA da Eva
// (Eva é da casa) e SEM CNPJ/rodapé da EcoSun. Sem `marca` = EcoSun de sempre.

import { describe, it, expect } from 'vitest';
import { renderRelatorioHtml } from '../src/modules/monitoring/relatorio/template.js';
import { resolverMarcaRelatorio } from '../src/modules/monitoring/relatorio/marca.js';
import type { RelatorioData } from '../src/modules/monitoring/relatorio/dados.js';
import type { SupabaseClient } from '@supabase/supabase-js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';

function clientComEmpresa(nome: string | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: nome ? { nome } : null, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const DATA = {
  apelido: 'Antônio Carlos - Fazenda',
  cidade: 'Planaltina',
  uf: 'DF',
  marcaInversor: 'foxess',
  potenciaKwp: 8.2,
  semDados: false,
  economiaEstimadaReais: 1234,
  kpis: { mesKwh: 850, anoKwh: 5200, totalKwh: 12000 },
  serieMensal: [{ mes: '2026-07', kwh: 850 }],
  sinal: { gravidade: null, ratio7d: 1 },
  garantia: {
    idadeTexto: '2 anos',
    ecosun: { status: 'indefinida' },
    fabricanteInversor: 'a confirmar',
    fabricantePainel: 'a confirmar',
  },
} as unknown as RelatorioData;

describe('renderRelatorioHtml — marca neutra pro tenant', () => {
  it('com marca do tenant: nome dele, sem logo, sem CTA da Eva, sem CNPJ da casa', () => {
    const html = renderRelatorioHtml(DATA, 'acompanhamento', undefined, {
      nome: 'Sabion Solar',
      logoBase64: null,
    });
    expect(html).toContain('SABION SOLAR');
    expect(html).not.toMatch(/ecosun/i);
    expect(html).not.toContain('CNPJ');
    expect(html).not.toContain('Agendar visita');
    expect(html).not.toContain('<img class="logo"');
  });

  it('sem marca: relatório EcoSun de sempre (logo + CNPJ + CTA)', () => {
    const html = renderRelatorioHtml(DATA, 'acompanhamento');
    expect(html).toMatch(/ecosun/i);
    expect(html).toContain('CNPJ');
    expect(html).toContain('Agendar visita');
    expect(html).toContain('<img class="logo"');
  });

  it('resolverMarcaRelatorio: EcoSun e legado (null) = sem marca (visual da casa)', async () => {
    expect(await resolverMarcaRelatorio(clientComEmpresa('EcoSun'), ECOSUN)).toBeUndefined();
    expect(await resolverMarcaRelatorio(clientComEmpresa('X'), null)).toBeUndefined();
  });

  it('resolverMarcaRelatorio: tenant = marca neutra com o nome da empresa', async () => {
    const marca = await resolverMarcaRelatorio(clientComEmpresa('Sabion Solar'), 'aaaa-bbbb');
    expect(marca).toEqual({ nome: 'Sabion Solar', logoBase64: null });
  });

  it('marca do tenant COM logo própria (futuro B1c): a logo dele aparece', () => {
    const html = renderRelatorioHtml(DATA, 'acompanhamento', undefined, {
      nome: 'Sabion Solar',
      logoBase64: 'data:image/png;base64,LOGOSABION',
    });
    expect(html).toContain('data:image/png;base64,LOGOSABION');
    expect(html).not.toMatch(/ecosun/i);
  });
});
