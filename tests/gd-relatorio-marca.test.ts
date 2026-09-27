import { describe, it, expect, vi } from 'vitest';
import { marcaDoRelatorio } from '../src/modules/gd/relatorio-marca.js';
import { EMPRESA_DEFAULTS } from '../src/modules/empresa-config.js';
import { LOGO_ECOSUNPOWER_BRANCO_BASE64 } from '../src/modules/proposal/assets/logo-base64.js';

const ecosun = { ...EMPRESA_DEFAULTS };
const tenant = { ...EMPRESA_DEFAULTS, companyId: 'T1', nomeFantasia: 'Conquista Solar', email: 'c@x.com',
  siteUrl: 'https://conquista.com', telefoneAtendente: '5571999990000', rtNome: 'JIMENA X', rtTitulo: 'Responsável Técnico', rtRegistro: '123', logoStoragePath: null, corMarca: '#112233' };

describe('marcaDoRelatorio', () => {
  it('EcoSun sem logo configurada usa a logo da casa', async () => {
    const m = await marcaDoRelatorio(ecosun as any, { baixarLogo: vi.fn() });
    expect(m.logoSrc).toBe(LOGO_ECOSUNPOWER_BRANCO_BASE64);
    expect(m.nomeFantasia).toBe('EcoSunPower');
  });
  it('tenant sem logo NAO herda a logo da EcoSun', async () => {
    const m = await marcaDoRelatorio(tenant as any, { baixarLogo: vi.fn() });
    expect(m.logoSrc).toBeNull();
    expect(m.nomeFantasia).toBe('Conquista Solar');
    expect(m.cor).toBe('#112233');
  });
  it('logo em URL http(s) vai direto; javascript: e recusado', async () => {
    expect((await marcaDoRelatorio({ ...tenant, logoStoragePath: 'https://cdn.x/logo.png' } as any, { baixarLogo: vi.fn() })).logoSrc)
      .toBe('https://cdn.x/logo.png');
    const baixar = vi.fn().mockResolvedValue(null);
    expect((await marcaDoRelatorio({ ...tenant, logoStoragePath: 'javascript:alert(1)' } as any, { baixarLogo: baixar })).logoSrc)
      .toBeNull();
  });
  it('caminho de bucket: baixa; falha no tenant vira null (nunca a logo da EcoSun)', async () => {
    const ok = vi.fn().mockResolvedValue('data:image/png;base64,AAA');
    expect((await marcaDoRelatorio({ ...tenant, logoStoragePath: 't1/logo.png' } as any, { baixarLogo: ok })).logoSrc)
      .toBe('data:image/png;base64,AAA');
    expect(ok).toHaveBeenCalledWith('t1/logo.png');
    const falha = vi.fn().mockResolvedValue(LOGO_ECOSUNPOWER_BRANCO_BASE64);
    expect((await marcaDoRelatorio({ ...tenant, logoStoragePath: 't1/logo.png' } as any, { baixarLogo: falha })).logoSrc)
      .toBeNull();
  });
  it('contato e RT do tenant', async () => {
    const m = await marcaDoRelatorio(tenant as any, { baixarLogo: vi.fn() });
    expect(m.telefone).toBe('(71) 99999-0000');
    expect(m.rodapeRt).toBe('JIMENA X — Responsável Técnico — registro 123');
  });
});
