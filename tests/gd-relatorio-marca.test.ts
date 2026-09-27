import { describe, it, expect, vi } from 'vitest';
import { marcaDoRelatorio } from '../src/modules/gd/relatorio-marca.js';
import { EMPRESA_DEFAULTS } from '../src/modules/empresa-config.js';
import { LOGO_ECOSUNPOWER_BRANCO_BASE64 } from '../src/modules/proposal/assets/logo-base64.js';
import { LOGO_PASTA_BASE64 } from '../src/modules/relatorios/pasta/logo-pasta.js';

const ecosun = { ...EMPRESA_DEFAULTS };
const tenant = { ...EMPRESA_DEFAULTS, companyId: 'T1', nomeFantasia: 'Conquista Solar', email: 'c@x.com',
  siteUrl: 'https://conquista.com', telefoneAtendente: '5571999990000', rtNome: 'JIMENA X', rtTitulo: 'Responsável Técnico', rtRegistro: '123', logoStoragePath: null, corMarca: '#112233' };

describe('marcaDoRelatorio', () => {
  it('EcoSun sem logo configurada usa a logo nova (ecosun png)', async () => {
    const m = await marcaDoRelatorio(ecosun as any, { baixarLogo: vi.fn() });
    expect(m.logoSrc).toBe(LOGO_PASTA_BASE64);
    expect(m.nomeFantasia).toBe('EcoSunPower');
    expect(m.ehCasa).toBe(true);
  });
  it('tenant sem logo NAO herda nenhuma logo da EcoSun', async () => {
    const m = await marcaDoRelatorio(tenant as any, { baixarLogo: vi.fn() });
    expect(m.logoSrc).toBeNull();
    expect(m.nomeFantasia).toBe('Conquista Solar');
    expect(m.cor).toBe('#112233');
    expect(m.ehCasa).toBe(false);
  });
  it('logo so em http:// (sem TLS) vira null — o Puppeteer busca a URL no servidor', async () => {
    const baixar = vi.fn();
    expect((await marcaDoRelatorio({ ...tenant, logoStoragePath: 'http://cdn.x/logo.png' } as any, { baixarLogo: baixar })).logoSrc)
      .toBeNull();
    expect((await marcaDoRelatorio({ ...ecosun, logoStoragePath: 'http://cdn.x/logo.png' } as any, { baixarLogo: baixar })).logoSrc)
      .toBeNull();
    expect(baixar).not.toHaveBeenCalled();
  });
  it('logo em URL https vai direto; javascript: e recusado', async () => {
    expect((await marcaDoRelatorio({ ...tenant, logoStoragePath: 'https://cdn.x/logo.png' } as any, { baixarLogo: vi.fn() })).logoSrc)
      .toBe('https://cdn.x/logo.png');
    const baixar = vi.fn().mockResolvedValue(null);
    expect((await marcaDoRelatorio({ ...tenant, logoStoragePath: 'javascript:alert(1)' } as any, { baixarLogo: baixar })).logoSrc)
      .toBeNull();
  });
  it('caminho de bucket: baixa; falha no tenant vira null (nunca a logo da EcoSun, nem a antiga nem a nova)', async () => {
    const ok = vi.fn().mockResolvedValue('data:image/png;base64,AAA');
    expect((await marcaDoRelatorio({ ...tenant, logoStoragePath: 't1/logo.png' } as any, { baixarLogo: ok })).logoSrc)
      .toBe('data:image/png;base64,AAA');
    expect(ok).toHaveBeenCalledWith('t1/logo.png');
    const falhaAntiga = vi.fn().mockResolvedValue(LOGO_ECOSUNPOWER_BRANCO_BASE64);
    expect((await marcaDoRelatorio({ ...tenant, logoStoragePath: 't1/logo.png' } as any, { baixarLogo: falhaAntiga })).logoSrc)
      .toBeNull();
    const falhaNova = vi.fn().mockResolvedValue(LOGO_PASTA_BASE64);
    expect((await marcaDoRelatorio({ ...tenant, logoStoragePath: 't1/logo.png' } as any, { baixarLogo: falhaNova })).logoSrc)
      .toBeNull();
  });
  it('contato e RT do tenant', async () => {
    const m = await marcaDoRelatorio(tenant as any, { baixarLogo: vi.fn() });
    expect(m.telefone).toBe('(71) 99999-0000');
    expect(m.rodapeRt).toBe('JIMENA X — Responsável Técnico — registro 123');
  });
});
