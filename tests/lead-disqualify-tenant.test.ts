// tests/lead-disqualify-tenant.test.ts
// 08/09/2026 — dois leads da Conquista Solar (DDD 77) chegaram no WhatsApp do dono
// da EcoSunPower: "🛑 Eva encerrou lead inviável — Diego Lima Moraes / Stefhani".
// O SELECT em produção mostrou DOIS defeitos de uma vez:
//   1) o aviso vazou de controlador (mesma falha do schedule_visit, PR #289);
//   2) o encerramento NAO foi gravado — os leads seguiam 'novo'/'qualificando'.
//      Causa: a LEITURA usa variantesTelefone (tolera o 9º dígito) e a ESCRITA
//      usava `.eq('phone', from)` exato. No DDD 77 o WhatsApp usa o número SEM
//      o 9 extra → a leitura achava, a escrita não.
// E o texto trazia "Eva" e "R$700/700kWh" escritos na unha — da EcoSunPower.
import { describe, it, expect } from 'vitest';
import { buildDisqualifyPlan } from '../src/modules/lead-disqualify.js';
import { variantesTelefone } from '../src/modules/phone.js';
import { normalizarEmpresaRow, EMPRESA_DEFAULTS } from '../src/modules/empresa-config.js';
import { destinoAdminDaEmpresa } from '../src/modules/tenant-admin-guard.js';

const JUNIOR = '5561998805002';
const TENANT_ID = '99fd46d7-60fc-49fe-918f-66587ffa3829';

describe('aviso de lead inviável não leva o nome da assistente de outra empresa', () => {
  it('sem nomeAtendente, o texto fica neutro — nunca "Eva"', () => {
    const { notifyBody } = buildDisqualifyPlan({
      reason: 'conta de R$150/mês', leadName: 'Diego Lima Moraes', phone: '557799174347',
    });
    expect(notifyBody).not.toContain('Eva');
    expect(notifyBody).toContain('A assistente encerrou lead inviável');
  });

  it('com a assistente do tenant, sai o nome DELA', () => {
    const { notifyBody } = buildDisqualifyPlan({
      reason: 'conta de R$150/mês', leadName: 'Diego Lima Moraes', phone: '557799174347',
      nomeAtendente: 'Clara',
    });
    expect(notifyBody).toContain('Clara encerrou lead inviável');
    expect(notifyBody).not.toContain('Eva');
  });

  it('o critério vem da empresa, não fixo em R$700/700kWh', () => {
    const { notifyBody } = buildDisqualifyPlan({
      reason: 'x', leadName: 'y', phone: '55779', nomeAtendente: 'Clara',
      criterioValor: 500, criterioKwh: 400,
    });
    expect(notifyBody).toContain('R$500/400kWh');
    expect(notifyBody).not.toContain('700');
  });

  it('sem critério configurado, não inventa número nenhum', () => {
    const { notifyBody } = buildDisqualifyPlan({ reason: 'x', leadName: 'y', phone: '55779' });
    expect(notifyBody).toContain('fora do critério mínimo');
    expect(notifyBody).not.toMatch(/R\$\d/);
  });

  it('a EcoSunPower continua vendo "Eva"', () => {
    const { notifyBody } = buildDisqualifyPlan({
      reason: 'x', leadName: 'y', phone: '5561',
      nomeAtendente: EMPRESA_DEFAULTS.nomeAtendente,
      criterioValor: EMPRESA_DEFAULTS.criterioLeadValor,
      criterioKwh: EMPRESA_DEFAULTS.criterioLeadKwh,
    });
    expect(notifyBody).toContain('Eva encerrou lead inviável');
    expect(notifyBody).toContain('R$700/700kWh');
  });

  it('o aviso do tenant não vai pro zap do dono da EcoSunPower', () => {
    const conquista = normalizarEmpresaRow({
      company_id: TENANT_ID, nome_fantasia: 'Conquista Solar', nome_atendente: 'Clara',
    });
    expect(destinoAdminDaEmpresa(JUNIOR, conquista)).toBeNull();
  });
});

describe('telefone do DDD 77 (sem o 9 extra) — leitura e escrita têm que casar', () => {
  // O caso real: lead gravado como 557799174347 (12 dígitos, sem o 9 extra).
  const gravado = '557799174347';

  it('as variantes do número recebido incluem a forma gravada', () => {
    const v = variantesTelefone('5577999174347'); // com o 9, como pode chegar
    expect(v).toContain(gravado);
  });

  it('e o contrário também — quem chega sem o 9 acha quem foi salvo com ele', () => {
    const v = variantesTelefone(gravado);
    expect(v).toContain('5577999174347');
  });

  it('igualdade exata NÃO casaria — é o bug que isso conserta', () => {
    expect('5577999174347').not.toBe(gravado);
  });

  it('vale pro DDD 61 também (não quebrou o caso da EcoSunPower)', () => {
    expect(variantesTelefone('5561998805002')).toContain('556198805002');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 08/09/2026 — a empresa decide se a assistente pode descartar (migration 125).
// Pedido da Conquista Solar: lead pequeno NAO se perde. A assistente argumenta;
// se nao convencer, passa pra equipe. A decisao e de gente, nao do robo.
// ─────────────────────────────────────────────────────────────────────────────
import { buildHandoffEmVezDeDescarte } from '../src/modules/lead-disqualify.js';

describe('permiteDescarteLead — a empresa decide', () => {
  it('EcoSunPower continua podendo descartar (comportamento historico)', () => {
    expect(EMPRESA_DEFAULTS.permiteDescarteLead).toBe(true);
  });

  it('coluna ausente (banco antigo, antes da migration 125) = pode descartar', () => {
    const antiga = normalizarEmpresaRow({ company_id: TENANT_ID, nome_fantasia: 'Tenant' });
    expect(antiga.permiteDescarteLead).toBe(true);
  });

  it('coluna nula tambem = pode descartar — so `false` explicito desliga', () => {
    const nula = normalizarEmpresaRow({ company_id: TENANT_ID, permite_descarte_lead: null });
    expect(nula.permiteDescarteLead).toBe(true);
  });

  it('false desliga o descarte', () => {
    const conquista = normalizarEmpresaRow({
      company_id: TENANT_ID, nome_fantasia: 'Conquista Solar', permite_descarte_lead: false,
    });
    expect(conquista.permiteDescarteLead).toBe(false);
  });
});

describe('aviso de handoff no lugar do descarte', () => {
  const body = buildHandoffEmVezDeDescarte({
    reason: 'conta de R$150/mês', leadName: 'Diego Lima Moraes',
    phone: '557799174347', nomeAtendente: 'Clara',
  });

  it('diz que foi passado pra equipe, nao que encerrou', () => {
    expect(body).toContain('passado pra equipe');
    expect(body).not.toContain('encerrou lead inviável');
  });

  it('deixa claro que o lead segue vivo', () => {
    expect(body).toContain('O lead segue vivo');
  });

  it('usa o nome da assistente da empresa, nunca "Eva"', () => {
    expect(body).toContain('Clara não encerrou');
    expect(body).not.toContain('Eva');
  });

  it('sem nome configurado, fica neutro', () => {
    const b = buildHandoffEmVezDeDescarte({ reason: 'x', leadName: 'y', phone: '55' });
    expect(b).toContain('A assistente não encerrou');
    expect(b).not.toContain('Eva');
  });
});
