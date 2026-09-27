import { describe, it, expect } from 'vitest';
import { canalZapDaEmpresa, noCanalDaEmpresa, EMPRESA_CASA } from '../src/modules/dashboard/canal-envio.js';
import { canalAtual, canalExigeEvolution } from '../src/modules/canal-contexto.js';
import { empresa } from '../src/modules/empresa-config.js';

const TENANT = '22222222-2222-2222-2222-222222222222';

describe('canalZapDaEmpresa', () => {
  it('instância própria → evolution; EcoSun sem instância → casa; tenant sem instância → nenhum', () => {
    expect(canalZapDaEmpresa(TENANT, 'conquista-solar')).toBe('evolution');
    expect(canalZapDaEmpresa(EMPRESA_CASA, null)).toBe('casa');
    expect(canalZapDaEmpresa(TENANT, null)).toBe('nenhum');
    expect(canalZapDaEmpresa(TENANT, undefined)).toBe('nenhum');
  });
});

describe('noCanalDaEmpresa', () => {
  it('tenant: dentro do fn a empresa e o canal são os dele, mesmo depois de await', async () => {
    const visto = await noCanalDaEmpresa(TENANT, 'conquista-solar', async () => {
      await Promise.resolve();
      return { canal: canalAtual(), exige: canalExigeEvolution(), empresa: empresa().companyId };
    });
    expect(visto).toEqual({ canal: { companyId: TENANT, evolutionInstance: 'conquista-solar' }, exige: true, empresa: TENANT });
    expect(canalAtual()).toBeUndefined();
  });
  it('EcoSun: sem instância → canal padrão (não exige Evolution)', async () => {
    const visto = await noCanalDaEmpresa(EMPRESA_CASA, null, async () => ({ exige: canalExigeEvolution(), empresa: empresa().companyId }));
    expect(visto).toEqual({ exige: false, empresa: EMPRESA_CASA });
  });
});
