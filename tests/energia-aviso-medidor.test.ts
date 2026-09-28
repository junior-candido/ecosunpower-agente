// Aviso do vigia do medidor (Gestão de Energia). Trava LGPD entre controladores:
// o aviso de medidor de um tenant vai SÓ pro admin DAQUELA empresa — nunca pro
// zap do dono da EcoSun. Tenant sem o módulo "medicao" não recebe nada.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarAvisoMedidor } from '../src/modules/energia/aviso-medidor.js';
import { carregarEmpresaConfig, _resetEstadoParaTeste } from '../src/modules/empresa-config.js';
import type { MedidorRow } from '../src/modules/energia/energia-service.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const TENANT_SEM_ADMIN = 'cccc1111-2222-3333-4444-555566667777';
const JUNIOR = '5561996978781';

const medidor = (company_id: string) => ({ id: 'm1', company_id, apelido: 'Quadro' }) as unknown as MedidorRow;

async function semearEmpresas() {
  const rows = [
    { company_id: ECOSUN, nome_fantasia: 'EcoSunPower', telefone_atendente: '5561999990000', telefone_admin: null },
    { company_id: TENANT, nome_fantasia: 'Conquista Solar', telefone_atendente: '5577999610038', telefone_admin: '5577991112222' },
    { company_id: TENANT_SEM_ADMIN, nome_fantasia: 'Sem Admin', telefone_atendente: '5577999610000', telefone_admin: null },
  ];
  const client = { from: () => ({ select: () => Promise.resolve({ data: rows, error: null }) }) };
  await carregarEmpresaConfig(client as never);
}

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  _resetEstadoParaTeste();
  await semearEmpresas();
});
afterEach(() => _resetEstadoParaTeste());

const deps = (o: Partial<Parameters<typeof criarAvisoMedidor>[0]> = {}) => {
  const enviar = vi.fn(async () => {});
  return {
    enviar,
    d: {
      modulosAtivos: async (cid: string) => new Set(cid === ECOSUN || cid === TENANT || cid === TENANT_SEM_ADMIN ? ['medicao'] : []),
      engineerPhone: JUNIOR,
      enviar,
      dryRun: () => false,
      ...o,
    },
  };
};

describe('aviso do medidor', () => {
  it('tenant com o módulo: manda SÓ pro admin dele, nunca pro zap do dono da EcoSun', async () => {
    const { d, enviar } = deps();
    const r = await criarAvisoMedidor(d)(medidor(TENANT), 'parou');
    expect(r).toBe('enviado');
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith('5577991112222', 'parou');
    expect(enviar.mock.calls.every((c) => c[0] !== JUNIOR)).toBe(true);
  });

  it('tenant sem telefone_admin: ninguém recebe (não cai no Junior)', async () => {
    const { d, enviar } = deps();
    expect(await criarAvisoMedidor(d)(medidor(TENANT_SEM_ADMIN), 'parou')).toBe('sem_destino');
    expect(enviar).not.toHaveBeenCalled();
  });

  it('tenant SEM o módulo "medicao" (vê a vitrine): nada sai', async () => {
    const { d, enviar } = deps({ modulosAtivos: async (cid: string) => new Set(cid === ECOSUN ? ['medicao'] : []) });
    expect(await criarAvisoMedidor(d)(medidor(TENANT), 'parou')).toBe('sem_destino');
    expect(enviar).not.toHaveBeenCalled();
  });

  it('EcoSun: vai pro Junior, como sempre', async () => {
    const { d, enviar } = deps();
    expect(await criarAvisoMedidor(d)(medidor(ECOSUN), 'parou')).toBe('enviado');
    expect(enviar).toHaveBeenCalledWith(JUNIOR, 'parou');
  });

  it('dry-run: não envia e diz que foi dry-run (o vigia não grava a transição)', async () => {
    const { d, enviar } = deps({ dryRun: () => true });
    expect(await criarAvisoMedidor(d)(medidor(TENANT), 'parou')).toBe('dry_run');
    expect(enviar).not.toHaveBeenCalled();
  });
});
