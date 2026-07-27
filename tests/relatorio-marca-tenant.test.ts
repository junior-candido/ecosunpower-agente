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
  dataInstalacao: null,
  semDados: false,
  economiaEstimadaReais: 1234,
  kpis: { mesKwh: 850, anoKwh: 5200, totalKwh: 12000 },
  serieMensal: [{ mes: '2026-06', kwh: 119 }, { mes: '2026-07', kwh: 745 }],
  sinal: { gravidade: null, ratio7d: 1 },
  garantia: {
    idadeTexto: '2 anos',
    ecosun: { status: 'indefinida' },
    fabricanteInversor: 'a confirmar',
    fabricantePainel: 'a confirmar',
  },
} as unknown as RelatorioData;

const MARCA_SABION = { nome: 'Sabion Solar', logoBase64: null };

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

  // Folha do tenant (pedidos do Thiago 27/07): grafico com valores, garantia
  // com vigencia. SOMENTE na folha do tenant — EcoSun fica byte a byte igual.
  it('folha do tenant tem GRAFICO de barras com os valores mensais', () => {
    const html = renderRelatorioHtml(DATA, 'acompanhamento', undefined, MARCA_SABION);
    expect(html).toContain('barra-mes');
    expect(html).toContain('745');
    expect(html).toContain('119');
  });

  it('relatorio EcoSun (sem marca) NAO ganha o grafico — visual de sempre', () => {
    const html = renderRelatorioHtml(DATA, 'acompanhamento');
    expect(html).not.toContain('barra-mes');
  });

  it('tenant com data de instalacao: mostra instalada em + garantia ate (12 meses)', () => {
    const comData = { ...DATA, dataInstalacao: '2025-08-15' } as unknown as RelatorioData;
    const html = renderRelatorioHtml(comData, 'acompanhamento', undefined, MARCA_SABION);
    expect(html).toContain('Instalada em 15/08/2025');
    expect(html).toContain('até 15/08/2026');
  });

  it('tenant sem data de instalacao: garantia continua "a confirmar"', () => {
    const html = renderRelatorioHtml(DATA, 'acompanhamento', undefined, MARCA_SABION);
    expect(html).toContain('a confirmar');
    expect(html).not.toContain('Instalada em');
  });

  it('resolverMarcaRelatorio: EcoSun e legado (null) = sem marca (visual da casa)', async () => {
    expect(await resolverMarcaRelatorio(clientComEmpresa('EcoSun'), ECOSUN)).toBeUndefined();
    expect(await resolverMarcaRelatorio(clientComEmpresa('X'), null)).toBeUndefined();
  });

  it('resolverMarcaRelatorio: tenant = marca neutra com o nome da empresa', async () => {
    const marca = await resolverMarcaRelatorio(clientComEmpresa('Sabion Solar'), 'aaaa-bbbb');
    expect(marca).toEqual({ nome: 'Sabion Solar', logoBase64: null });
  });

  // Logo do TENANT (pedido do Thiago 27/07): se existir
  // branding/tenants/<companyId>/logo.png no Storage, ela entra na folha.
  it('resolverMarcaRelatorio: com logo no Storage, a marca vem com a logo', async () => {
    const client = clientComEmpresa('Sabion Solar');
    (client as any).storage = {
      from: () => ({
        download: async () => ({
          data: { arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer, type: 'image/png' },
          error: null,
        }),
      }),
    };
    const marca = await resolverMarcaRelatorio(client, 'aaaa-bbbb');
    expect(marca?.nome).toBe('Sabion Solar');
    expect(marca?.logoBase64).toMatch(/^data:image\/png;base64,/);
  });

  it('resolverMarcaRelatorio: Storage sem a logo = segue neutro (logo null)', async () => {
    const client = clientComEmpresa('Sabion Solar');
    (client as any).storage = {
      from: () => ({ download: async () => ({ data: null, error: { message: 'not found' } }) }),
    };
    // companyId DIFERENTE do teste anterior — o cache de logo é por empresa
    const marca = await resolverMarcaRelatorio(client, 'cccc-dddd');
    expect(marca?.logoBase64).toBeNull();
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
