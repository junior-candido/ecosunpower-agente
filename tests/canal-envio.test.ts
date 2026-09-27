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

import { bloqueioZapPasta } from '../src/modules/dashboard/canal-envio.js';
import { normalizarEmpresaRow } from '../src/modules/empresa-config.js';

// 27/09/2026: a trava LGPD do sendText descarta EM SILÊNCIO — a tela mostrava ✅.
// O envio da pasta pergunta antes e mostra o motivo.
describe('bloqueioZapPasta — decide antes de mandar a pasta', () => {
  const tenant = normalizarEmpresaRow({ company_id: TENANT, nome_fantasia: 'Conquista Solar' });
  const ecosun = normalizarEmpresaRow({ company_id: EMPRESA_CASA, nome_fantasia: 'EcoSunPower' });
  const ENG = '5561999990000';

  it('tenant sem WhatsApp → sem_canal', () => {
    expect(bloqueioZapPasta({ canal: 'nenhum', phone: '61999991111', engineerPhone: ENG, cfg: tenant }))
      .toEqual({ ok: false, reason: 'sem_canal' });
  });
  it('tenant mandando pro número da EcoSun (cadastro sem 55) → bloqueado_lgpd, sem enviar', () => {
    expect(bloqueioZapPasta({ canal: 'evolution', phone: '(61) 99999-0000', engineerPhone: ENG, cfg: tenant }))
      .toEqual({ ok: false, reason: 'bloqueado_lgpd' });
  });
  it('tenant pro cliente dele → segue (null)', () => {
    expect(bloqueioZapPasta({ canal: 'evolution', phone: '61999991111', engineerPhone: ENG, cfg: tenant })).toBeNull();
  });
  it('EcoSun nunca é barrada pela trava', () => {
    expect(bloqueioZapPasta({ canal: 'casa', phone: ENG, engineerPhone: ENG, cfg: ecosun })).toBeNull();
  });
  it('telefone vazio/inválido → segue (o serviço devolve sem_phone/telefone_invalido)', () => {
    expect(bloqueioZapPasta({ canal: 'evolution', phone: null, engineerPhone: ENG, cfg: tenant })).toBeNull();
    expect(bloqueioZapPasta({ canal: 'evolution', phone: '123', engineerPhone: ENG, cfg: tenant })).toBeNull();
  });
  // 27/09/2026 (review): getClienteByLeadId(...).catch(() => null) falhava
  // ABERTO — erro de busca virava "sem telefone" e a trava LGPD nem rodava.
  // erroBusca é o motivo de falha; nunca deve ser confundido com "sem telefone".
  it('erro na busca do cliente → falha_envio, mesmo sem telefone (fecha, não abre)', () => {
    expect(bloqueioZapPasta({ canal: 'evolution', phone: null, engineerPhone: ENG, cfg: tenant, erroBusca: true }))
      .toEqual({ ok: false, reason: 'falha_envio' });
  });
  it('erro na busca do cliente prevalece mesmo com canal sem_canal (mensagem certa continua saindo)', () => {
    expect(bloqueioZapPasta({ canal: 'nenhum', phone: null, engineerPhone: ENG, cfg: tenant, erroBusca: true }))
      .toEqual({ ok: false, reason: 'sem_canal' });
  });
  it('sem erro de busca (default) → comportamento de antes, intacto', () => {
    expect(bloqueioZapPasta({ canal: 'evolution', phone: '61999991111', engineerPhone: ENG, cfg: tenant })).toBeNull();
  });
});
