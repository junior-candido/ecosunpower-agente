// tests/lgpd-isolamento-tenant.test.ts
// TRAVA LGPD (31/08/2026). Bug real: um lead da Conquista Solar (tenant) caiu no
// WhatsApp PESSOAL do dono da EcoSunPower — dado pessoal de cliente de outro
// controlador. Duas causas:
//   1) transfer_to_human mandava pro config.engineerPhone fixo (global);
//   2) normalizarEmpresaRow fazia o tenant HERDAR telefone/e-mail/site da EcoSun
//      quando a coluna estava vazia.
// Este arquivo trava as duas e o fail-closed do envio.
import { describe, it, expect } from 'vitest';
import { normalizarEmpresaRow, EMPRESA_DEFAULTS } from '../src/modules/empresa-config.js';
import { destinoAdminDaEmpresa, envioProibido, avisoAdminPermitido } from '../src/modules/tenant-admin-guard.js';

const JUNIOR = '5561996978781';
const TENANT_ID = 'c1a2b3c4-0000-0000-0000-00000000aaaa';

const conquista = normalizarEmpresaRow({
  company_id: TENANT_ID,
  nome_fantasia: 'Conquista Solar',
  nome_atendente: 'Clara',
  rt_nome: 'MARIA JIMENA SOUZA', rt_apelido: 'Jimena', rt_genero: 'f',
  telefone_atendente: '5577999483357',
});

const tenantSemCadastro = normalizarEmpresaRow({
  company_id: TENANT_ID,
  nome_fantasia: 'Tenant Novo',
});

describe('tenant NÃO herda a identidade da EcoSunPower', () => {
  it('telefone vazio vira null — nunca o número do Junior', () => {
    expect(tenantSemCadastro.telefoneAtendente).toBeNull();
    expect(tenantSemCadastro.telefoneAtendente).not.toBe(JUNIOR);
  });

  it('e-mail vazio não vira o e-mail da EcoSunPower', () => {
    expect(tenantSemCadastro.email).not.toBe(EMPRESA_DEFAULTS.email);
  });

  it('site vazio não vira o site da EcoSunPower', () => {
    expect(tenantSemCadastro.siteUrl).not.toBe(EMPRESA_DEFAULTS.siteUrl);
  });

  it('CNPJ/Pix vazios não viram os da EcoSunPower', () => {
    expect(tenantSemCadastro.cnpj).not.toBe(EMPRESA_DEFAULTS.cnpj);
    expect(tenantSemCadastro.pixChave).not.toBe(EMPRESA_DEFAULTS.pixChave);
  });

  it('dados do RT (CPF/RG/registro) não vazam da EcoSunPower', () => {
    expect(tenantSemCadastro.rtCpf).not.toBe(EMPRESA_DEFAULTS.rtCpf);
    expect(tenantSemCadastro.rtRg).not.toBe(EMPRESA_DEFAULTS.rtRg);
    expect(tenantSemCadastro.rtRegistro).not.toBe(EMPRESA_DEFAULTS.rtRegistro);
  });

  it('a própria EcoSunPower (row sem company_id) continua com tudo dela', () => {
    const ecosun = normalizarEmpresaRow({ nome_fantasia: 'EcoSunPower' });
    expect(ecosun.telefoneAtendente).toBe(EMPRESA_DEFAULTS.telefoneAtendente);
    expect(ecosun.email).toBe(EMPRESA_DEFAULTS.email);
    expect(ecosun.rtCpf).toBe(EMPRESA_DEFAULTS.rtCpf);
  });
});

describe('destino do aviso administrativo (lead, dossiê, alerta)', () => {
  it('lead da EcoSunPower continua indo pro Junior', () => {
    expect(destinoAdminDaEmpresa(JUNIOR, EMPRESA_DEFAULTS)).toBe(JUNIOR);
  });

  // telefone_atendente é a linha PÚBLICA, onde a própria assistente atende os
  // clientes (Clara = 5577999610038). Mandar o aviso de lead pra lá faria o robô
  // mandar mensagem pra ele mesmo. E o modelo combinado com a Jimena em 19/08 é
  // "lead cai no dashboard, sem transferir pro zap pessoal".
  it('tenant NÃO recebe aviso por zap — o lead fica no dashboard', () => {
    expect(destinoAdminDaEmpresa(JUNIOR, conquista)).toBeNull();
    expect(destinoAdminDaEmpresa(JUNIOR, tenantSemCadastro)).toBeNull();
  });

  it('nunca devolve a linha pública da assistente como destino de aviso', () => {
    expect(destinoAdminDaEmpresa(JUNIOR, conquista)).not.toBe(conquista.telefoneAtendente);
  });

  it('tenant que cadastrou o número do Junior por engano também é bloqueado', () => {
    const errado = normalizarEmpresaRow({ company_id: TENANT_ID, telefone_atendente: JUNIOR });
    expect(destinoAdminDaEmpresa(JUNIOR, errado)).toBeNull();
  });
});

describe('fail-closed: envio de tenant pro número do dono da EcoSun é proibido', () => {
  it('bloqueia envio do tenant pro Junior', () => {
    expect(envioProibido(JUNIOR, JUNIOR, conquista)).toBe(true);
  });

  it('bloqueia mesmo com máscara diferente (+55 61 99697-8781)', () => {
    expect(envioProibido('+55 61 99697-8781', JUNIOR, conquista)).toBe(true);
  });

  it('não atrapalha o tenant falando com o cliente dele', () => {
    expect(envioProibido('5577997993958', JUNIOR, conquista)).toBe(false);
  });

  it('não atrapalha a EcoSunPower falando com o Junior', () => {
    expect(envioProibido(JUNIOR, JUNIOR, EMPRESA_DEFAULTS)).toBe(false);
  });
});

describe('defesa em profundidade: aviso admin de um tenant só vai pro número DELE', () => {
  it('nenhum número é autorizado pra um tenant — nem o dele, nem o do Junior', () => {
    expect(avisoAdminPermitido(JUNIOR, conquista)).toBe(false);
    expect(avisoAdminPermitido('5511999999999', conquista)).toBe(false);
    // a própria linha da Clara: mandaria o aviso pro robô dela mesma
    expect(avisoAdminPermitido('5577999610038', conquista)).toBe(false);
    expect(avisoAdminPermitido(conquista.telefoneAtendente ?? '', conquista)).toBe(false);
  });

  it('empresa sem telefone cadastrado também não autoriza ninguém', () => {
    expect(avisoAdminPermitido(JUNIOR, tenantSemCadastro)).toBe(false);
  });

  it('a EcoSunPower não é restringida (ela tem telefones admin extras)', () => {
    expect(avisoAdminPermitido(JUNIOR, EMPRESA_DEFAULTS)).toBe(true);
    expect(avisoAdminPermitido('5561988887777', EMPRESA_DEFAULTS)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 08/09/2026 — O PONTO QUE ESCAPOU DA TRAVA DE 31/08.
// A Clara (Conquista Solar) fechou uma visita técnica de um lead de Vitória da
// Conquista-BA. O aviso caiu no WhatsApp do dono da EcoSunPower E o evento foi
// criado no Google Calendar pessoal dele. Causa: o `schedule_visit` chamava o
// metaWaba CRU com engineerPhone fixo (a trava só cobria sendText e
// sendAdminWithButtons) e existia UMA agenda só, vinda do env global.
// ─────────────────────────────────────────────────────────────────────────────
import { agendaDaEmpresa } from '../src/modules/tenant-admin-guard.js';
import { visitasQuePodemDisparar } from '../src/modules/vendas/visitas.js';

const AGENDA_ECOSUN = 'junior@ecosunpower.eng.br';
const ECOSUN_ID = EMPRESA_DEFAULTS.companyId;

const conquistaComAdmin = normalizarEmpresaRow({
  company_id: TENANT_ID,
  nome_fantasia: 'Conquista Solar',
  telefone_atendente: '5577999610038',
  telefone_admin: '5577991112222',
  google_calendar_id: 'agenda@conquistasolar.com.br',
});

describe('agenda do Google não é herdada entre empresas', () => {
  it('tenant SEM agenda própria não agenda em lugar nenhum', () => {
    expect(agendaDaEmpresa(AGENDA_ECOSUN, conquista)).toBeNull();
  });

  it('tenant sem agenda NUNCA cai na agenda da EcoSunPower', () => {
    expect(agendaDaEmpresa(AGENDA_ECOSUN, conquista)).not.toBe(AGENDA_ECOSUN);
    expect(agendaDaEmpresa(AGENDA_ECOSUN, tenantSemCadastro)).not.toBe(AGENDA_ECOSUN);
  });

  it('tenant COM agenda própria usa a dele', () => {
    expect(agendaDaEmpresa(AGENDA_ECOSUN, conquistaComAdmin)).toBe('agenda@conquistasolar.com.br');
  });

  it('a EcoSunPower continua usando a agenda do ambiente', () => {
    expect(agendaDaEmpresa(AGENDA_ECOSUN, EMPRESA_DEFAULTS)).toBe(AGENDA_ECOSUN);
  });

  it('sem agenda no ambiente, nem a EcoSunPower cria evento', () => {
    expect(agendaDaEmpresa(null, EMPRESA_DEFAULTS)).toBeNull();
  });
});

describe('telefone_admin: tenant recebe aviso, mas só no número dele', () => {
  it('tenant com telefone_admin recebe o aviso ali', () => {
    expect(destinoAdminDaEmpresa(JUNIOR, conquistaComAdmin)).toBe('5577991112222');
    expect(avisoAdminPermitido('5577991112222', conquistaComAdmin)).toBe(true);
  });

  it('o aviso do tenant NUNCA vai pro zap do dono da EcoSunPower', () => {
    expect(destinoAdminDaEmpresa(JUNIOR, conquistaComAdmin)).not.toBe(JUNIOR);
    expect(avisoAdminPermitido(JUNIOR, conquistaComAdmin)).toBe(false);
  });

  it('telefone_admin não pode ser a linha pública da assistente (robô falaria consigo)', () => {
    const errado = normalizarEmpresaRow({
      company_id: TENANT_ID, nome_fantasia: 'Conquista Solar',
      telefone_atendente: '5577999610038', telefone_admin: '5577999610038',
    });
    expect(destinoAdminDaEmpresa(JUNIOR, errado)).toBeNull();
  });

  it('telefone_admin apontando pro dono da EcoSunPower é recusado', () => {
    const errado = normalizarEmpresaRow({
      company_id: TENANT_ID, nome_fantasia: 'Conquista Solar', telefone_admin: JUNIOR,
    });
    expect(destinoAdminDaEmpresa(JUNIOR, errado)).toBeNull();
  });

  it('tenant sem telefone_admin segue no modelo dashboard (nada por zap)', () => {
    expect(destinoAdminDaEmpresa(JUNIOR, conquista)).toBeNull();
    expect(avisoAdminPermitido('5577991112222', conquista)).toBe(false);
  });

  it('telefone_admin não é herdado da EcoSunPower quando a coluna está vazia', () => {
    expect(tenantSemCadastro.telefoneAdmin).toBeNull();
    expect(tenantSemCadastro.googleCalendarId).toBeNull();
  });
});

describe('toque pós-visita não sai pra visita de outra empresa', () => {
  const linha = (id: string, company_id: string | null) => ({
    id, lead_id: 'L1', phone: '5577991968581', fim: '2026-09-09T18:00:00Z', resultado: null, company_id,
  });
  const pode = (c: string | null | undefined) => c === ECOSUN_ID;

  it('visita de tenant é ignorada — fica no dashboard dele', () => {
    const rows = [linha('v1', ECOSUN_ID), linha('v2', TENANT_ID)];
    expect(visitasQuePodemDisparar(rows, pode).map(r => r.id)).toEqual(['v1']);
  });

  it('visita sem carimbo de empresa não dispara por acidente', () => {
    expect(visitasQuePodemDisparar([linha('v3', null)], pode)).toEqual([]);
  });
});
