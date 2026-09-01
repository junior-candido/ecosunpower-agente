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
