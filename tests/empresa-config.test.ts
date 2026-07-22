import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import {
  EMPRESA_DEFAULTS, normalizarEmpresaRow, interpolarEmpresa, listaMarcasTexto,
  carregarEmpresaConfig, empresa, empresaDe, _resetEstadoParaTeste, nomeTituloCase,
} from '../src/modules/empresa-config.js';

describe('empresa-config: defaults EcoSun (fallback sem banco)', () => {
  it('defaults têm os dados reais da EcoSunPower', () => {
    expect(EMPRESA_DEFAULTS.cnpj).toBe('33.020.459/0001-06');
    expect(EMPRESA_DEFAULTS.nomeAtendente).toBe('Eva');
    expect(EMPRESA_DEFAULTS.criterioLeadValor).toBe(700);
    expect(EMPRESA_DEFAULTS.marcasBloqueadas).toContain('Growatt');
    expect(EMPRESA_DEFAULTS.rtNome).toContain('ANTONIO CANDIDO');
  });
});

describe('empresa-config: normalização de row do banco', () => {
  it('row completa vira EmpresaConfig camelCase', () => {
    const e = normalizarEmpresaRow({
      razao_social: 'SOLARCORP LTDA', nome_fantasia: 'SolarCorp', cnpj: '11.111.111/0001-11',
      endereco: 'Rua X', cidade: 'Uberlândia', uf: 'MG', cep: null,
      email: 'a@b.com', site_url: 'https://solarcorp.com.br', atuacao_desde: 2021,
      descricao_curta: 'empresa de MG', regiao_atuacao: 'Triângulo Mineiro',
      nome_atendente: 'Marina', telefone_atendente: '5534999999999',
      rt_nome: 'FULANO', rt_titulo: 'Responsável Técnico CREA', rt_cpf: null, rt_rg: null, rt_registro: null,
      pix_chave: null, criterio_lead_valor: 400, criterio_lead_kwh: 350,
      marcas_permitidas: ['Trina Solar'], marcas_bloqueadas: [],
      garantia_instalacao_meses: 12, fator_perda_padrao: 0.78, belenus_ativo: false,
      logo_storage_path: null,
      hsp_padrao: null, tarifa_kwh_padrao: null, concessionaria_padrao: null,
    });
    expect(e.nomeAtendente).toBe('Marina');
    expect(e.criterioLeadValor).toBe(400);
    expect(e.belenusAtivo).toBe(false);
  });
  it('campos null/ausentes caem no default (nunca undefined no template)', () => {
    const e = normalizarEmpresaRow({ razao_social: 'X' } as never);
    expect(e.nomeAtendente).toBe('Eva');
    expect(e.rtTitulo).toBe('Responsável Técnico CREA/CFT');
    expect(e.razaoSocial).toBe('X');
  });
  it('campos regionais ficam null quando ausentes', () => {
    const e = normalizarEmpresaRow({ razao_social: 'Y' } as never);
    expect(e.hspPadrao).toBeNull();
    expect(e.tarifaPadrao).toBeNull();
    expect(e.concessionariaPadrao).toBeNull();
  });
});

describe('empresa-config: interpolação de placeholders', () => {
  it('substitui todos os {{...}} de empresa num texto', () => {
    const out = interpolarEmpresa(
      'Sou a {{nome_atendente}} da {{empresa_nome}} ({{empresa_descricao}}). RT: {{rt_nome}}, {{rt_titulo}}. Região: {{empresa_regiao}}. Critério: R$ {{criterio_lead_valor}} ou {{criterio_lead_kwh}} kWh. Site: {{empresa_site}}.',
      EMPRESA_DEFAULTS,
    );
    expect(out).toContain('Sou a Eva da EcoSunPower');
    expect(out).toContain('700');
    expect(out).not.toContain('{{');
  });
  it('placeholder desconhecido fica intacto (não explode)', () => {
    expect(interpolarEmpresa('{{nao_existe}}', EMPRESA_DEFAULTS)).toBe('{{nao_existe}}');
  });
  it('rt_nome interpola em Title Case (Eva não grita o nome do RT)', () => {
    const out = interpolarEmpresa('RT: {{rt_nome}}', EMPRESA_DEFAULTS);
    expect(out).toBe('RT: Antonio Candido Rodrigues Junior');
  });
  it('I2: valor com "$&" é interpolado literalmente sem expand de regex', () => {
    // Se replaceAll usasse string em vez de função, "$&" viraria o padrão encontrado.
    const config = { ...EMPRESA_DEFAULTS, descricaoCurta: 'US$ 100 $&' };
    const out = interpolarEmpresa('Desc: {{empresa_descricao}}', config);
    expect(out).toBe('Desc: US$ 100 $&');
  });
});

describe('empresa-config: lista de marcas pro prompt', () => {
  it('monta texto com permitidas e bloqueio', () => {
    const t = listaMarcasTexto(EMPRESA_DEFAULTS);
    expect(t).toContain('Trina Solar');
    expect(t).toContain('Não trabalhamos com');
    expect(t).toContain('Growatt');
  });
  it('sem bloqueadas, sem frase de bloqueio', () => {
    expect(listaMarcasTexto({ ...EMPRESA_DEFAULTS, marcasBloqueadas: [] })).not.toContain('Não trabalhamos');
  });
});

describe('system-prompt: placeholders resolvem com o seed EcoSun (paridade)', () => {
  it('nenhum {{placeholder de empresa}} fica sem resolver', () => {
    const prompt = readFileSync('src/prompts/system-prompt.md', 'utf-8');
    const out = interpolarEmpresa(prompt, EMPRESA_DEFAULTS);
    const sobras = out.match(/\{\{(?!review_link)[a-z_]+\}\}/g) ?? [];
    expect(sobras).toEqual([]);
  });
  it('com defaults, o prompt volta a falar Eva/EcoSunPower/700', () => {
    const prompt = readFileSync('src/prompts/system-prompt.md', 'utf-8');
    const out = interpolarEmpresa(prompt, EMPRESA_DEFAULTS);
    expect(out).toContain('Eva');
    expect(out).toContain('EcoSunPower'); // grafia do nomeFantasia do seed
    expect(out).toContain('700');
    // identidade central resolvida
    expect(out).toContain('Voce e a Eva, **consultora de energia solar** da EcoSunPower');
    // rt_nome interpola em Title Case no prompt (Eva não grita o nome pro cliente)
    expect(out).toContain('Antonio Candido Rodrigues Junior');
    expect(out).not.toContain('ANTONIO CANDIDO RODRIGUES JUNIOR');
  });
});

describe('solar-params: fallback regional pela empresa_config (Step 1c)', () => {
  beforeEach(() => { _resetEstadoParaTeste(); });

  it('sem hsp/tarifa padrão na config (EcoSun), UF desconhecida usa o DEFAULT conservador de sempre', async () => {
    const { hspPorConcessionaria, tarifaPorConcessionaria } = await import('../src/modules/solar-params.js');
    expect(hspPorConcessionaria('Cuiabá-MT')).toBe(5.40);
    expect(tarifaPorConcessionaria('Cuiabá-MT')).toBe(1.03);
    // DF continua resolvendo pelo mapa
    expect(tarifaPorConcessionaria('Brasília')).toBe(1.05);
  });

  it('com hsp/tarifa padrão setados no banco, UF desconhecida usa o fallback do clone (mapa DF/GO intacto)', async () => {
    const client = {
      from: () => ({
        // [B1a] loader novo: select('*') direto (todas as linhas)
        select: async () => ({
              data: [{
                razao_social: 'SOLARCORP', nome_fantasia: 'SolarCorp', cnpj: '1',
                endereco: 'x', cidade: 'Uberlândia', uf: 'MG', cep: null,
                email: 'a@b.com', site_url: 'https://x', atuacao_desde: 2021,
                descricao_curta: 'd', regiao_atuacao: 'r',
                nome_atendente: 'Marina', telefone_atendente: null,
                rt_nome: 'F', rt_titulo: 'RT', rt_cpf: null, rt_rg: null, rt_registro: null,
                pix_chave: null, criterio_lead_valor: 400, criterio_lead_kwh: 350,
                marcas_permitidas: [], marcas_bloqueadas: [],
                garantia_instalacao_meses: 12, fator_perda_padrao: 0.78, belenus_ativo: false,
                logo_storage_path: null,
                hsp_padrao: 4.8, tarifa_kwh_padrao: 0.95, concessionaria_padrao: 'CEMIG-MG',
              }],
              error: null,
        }),
      }),
    } as unknown as Parameters<typeof carregarEmpresaConfig>[0];
    await carregarEmpresaConfig(client);

    const { hspPorConcessionaria, tarifaPorConcessionaria, concessionariaPadraoEmpresa } = await import('../src/modules/solar-params.js');
    expect(hspPorConcessionaria('Uberlândia-MG')).toBe(4.8);
    expect(tarifaPorConcessionaria('Uberlândia-MG')).toBe(0.95);
    expect(concessionariaPadraoEmpresa()).toBe('CEMIG-MG');
    // mapa DF/GO continua tendo prioridade sobre o fallback do clone
    expect(tarifaPorConcessionaria('Brasília')).toBe(1.05);

    _resetEstadoParaTeste();
  });
});

describe('empresa-config: I1 — reload com erro mantém config anterior', () => {
  beforeEach(() => {
    // Reseta estado interno do módulo (cache + carregadaDoBanco) entre testes.
    _resetEstadoParaTeste();
  });

  it('reload com erro mantém config customizada anterior — não rebaixa pra defaults EcoSun', async () => {
    // 1) Primeiro carregamento: sucesso com row de cliente customizado
    const successClient = {
      from: () => ({
        select: async () => ({
              data: [{
                razao_social: 'SOLARCORP LTDA',
                nome_fantasia: 'SolarCorp',
                cnpj: '11.111.111/0001-11',
                endereco: 'Rua X', cidade: 'Uberlândia', uf: 'MG', cep: null,
                email: 'a@b.com', site_url: 'https://solarcorp.com.br', atuacao_desde: 2021,
                descricao_curta: 'empresa MG', regiao_atuacao: 'Triângulo',
                nome_atendente: 'Marina', telefone_atendente: '5534999',
                rt_nome: 'FULANO', rt_titulo: 'RT CREA', rt_cpf: null, rt_rg: null, rt_registro: null,
                pix_chave: null, criterio_lead_valor: 400, criterio_lead_kwh: 350,
                marcas_permitidas: ['Trina Solar'], marcas_bloqueadas: [],
                garantia_instalacao_meses: 12, fator_perda_padrao: 0.78, belenus_ativo: false,
                logo_storage_path: null, hsp_padrao: null, tarifa_kwh_padrao: null, concessionaria_padrao: null,
              }],
              error: null,
        }),
      }),
    } as unknown as Parameters<typeof carregarEmpresaConfig>[0];

    const r1 = await carregarEmpresaConfig(successClient);
    expect(r1.ok).toBe(true);
    expect(r1.config.nomeFantasia).toBe('SolarCorp');
    expect(empresa().nomeFantasia).toBe('SolarCorp');

    // 2) Segundo carregamento: banco retorna erro
    const errorClient = {
      from: () => ({
        select: async () => ({ data: null, error: { message: 'connection refused' } }),
      }),
    } as unknown as Parameters<typeof carregarEmpresaConfig>[0];

    const r2 = await carregarEmpresaConfig(errorClient);
    expect(r2.ok).toBe(false);
    // Deve manter SolarCorp, NÃO regredir para EcoSunPower
    expect(r2.config.nomeFantasia).toBe('SolarCorp');
    expect(empresa().nomeFantasia).toBe('SolarCorp');
    expect(r2.config.nomeFantasia).not.toBe(EMPRESA_DEFAULTS.nomeFantasia);
  });

  it('reload com throw mantém config customizada anterior — não rebaixa pra defaults EcoSun', async () => {
    // 1) Carregamento inicial bem-sucedido
    const successClient = {
      from: () => ({
        select: async () => ({
              data: [{
                razao_social: 'ACME SOLAR', nome_fantasia: 'AcmeSolar', cnpj: '22.222.222/0001-22',
                endereco: 'Av Y', cidade: 'Goiânia', uf: 'GO', cep: null,
                email: 'b@c.com', site_url: 'https://acme.com', atuacao_desde: 2022,
                descricao_curta: 'empresa GO', regiao_atuacao: 'Centro-Oeste',
                nome_atendente: 'Ana', telefone_atendente: null,
                rt_nome: 'BELTRANO', rt_titulo: 'RT CFT', rt_cpf: null, rt_rg: null, rt_registro: null,
                pix_chave: null, criterio_lead_valor: 500, criterio_lead_kwh: 450,
                marcas_permitidas: ['Jinko Solar'], marcas_bloqueadas: [],
                garantia_instalacao_meses: 12, fator_perda_padrao: 0.80, belenus_ativo: false,
                logo_storage_path: null, hsp_padrao: null, tarifa_kwh_padrao: null, concessionaria_padrao: null,
              }],
              error: null,
        }),
      }),
    } as unknown as Parameters<typeof carregarEmpresaConfig>[0];

    const r1 = await carregarEmpresaConfig(successClient);
    expect(r1.ok).toBe(true);
    expect(r1.config.nomeFantasia).toBe('AcmeSolar');

    // 2) Segundo carregamento lança exceção
    const throwClient = {
      from: () => ({
        select: async () => { throw new Error('network error'); },
      }),
    } as unknown as Parameters<typeof carregarEmpresaConfig>[0];

    const r2 = await carregarEmpresaConfig(throwClient);
    expect(r2.ok).toBe(false);
    // Deve manter AcmeSolar, NÃO regredir para EcoSunPower
    expect(r2.config.nomeFantasia).toBe('AcmeSolar');
    expect(empresa().nomeFantasia).toBe('AcmeSolar');
    expect(r2.config.nomeFantasia).not.toBe(EMPRESA_DEFAULTS.nomeFantasia);
  });
});

// [Fase 2 B1a] O cofre virou multi-empresa por baixo (migration 082):
// carrega TODAS as linhas; empresaDe(companyId) devolve a config do tenant;
// miss NUNCA devolve a marca de outro tenant (cai nos defaults EcoSun).
describe('empresa-config: B1a multi-empresa (empresaDe)', () => {
  const ECOSUN = '00000000-0000-0000-0000-000000000001';
  const SABION = '33333333-3333-4333-8333-333333333333';
  const OUTRA = '44444444-4444-4444-8444-444444444444';
  beforeEach(() => { _resetEstadoParaTeste(); });

  const linhaEcoSun = { nome_fantasia: 'EcoSunPower', razao_social: 'ECOSUNPOWER ENERGIA SOLAR LTDA', cnpj: '33.020.459/0001-06', company_id: ECOSUN };
  const linhaSabion = { nome_fantasia: 'Sabion Solar', razao_social: 'SABION LTDA', cnpj: '99.999.999/0001-99', pix_chave: 'pix-do-sabion', company_id: SABION };

  it('duas linhas: empresa() segue EcoSun; empresaDe(tenant) devolve a do tenant', async () => {
    const client = {
      from: () => ({ select: async () => ({ data: [linhaEcoSun, linhaSabion], error: null }) }),
    } as unknown as Parameters<typeof carregarEmpresaConfig>[0];
    const r = await carregarEmpresaConfig(client);
    expect(r.ok).toBe(true);
    expect(empresa().nomeFantasia).toBe('EcoSunPower');
    expect(empresaDe(SABION).nomeFantasia).toBe('Sabion Solar');
    expect(empresaDe(SABION).pixChave).toBe('pix-do-sabion');
    expect(empresaDe(ECOSUN).nomeFantasia).toBe('EcoSunPower');
    expect(empresaDe(undefined).nomeFantasia).toBe('EcoSunPower');
  });

  it('miss (tenant sem linha) = defaults EcoSun, NUNCA a linha de outro tenant', async () => {
    const client = {
      from: () => ({ select: async () => ({ data: [linhaEcoSun, linhaSabion], error: null }) }),
    } as unknown as Parameters<typeof carregarEmpresaConfig>[0];
    await carregarEmpresaConfig(client);
    const cfg = empresaDe(OUTRA);
    expect(cfg.nomeFantasia).toBe(EMPRESA_DEFAULTS.nomeFantasia);
    expect(cfg.pixChave).not.toBe('pix-do-sabion');
  });

  it('linha legada SEM company_id (pre-082 / clone EcoSof) segue sendo a empresa da instalacao', async () => {
    const client = {
      from: () => ({ select: async () => ({ data: [{ nome_fantasia: 'CloneCorp', razao_social: 'CLONE', cnpj: '1' }], error: null }) }),
    } as unknown as Parameters<typeof carregarEmpresaConfig>[0];
    await carregarEmpresaConfig(client);
    expect(empresa().nomeFantasia).toBe('CloneCorp');
  });
});

// [Fase 2 B1b] comEmpresaDe: contexto assincrono — empresa() responde pela
// empresa do contexto (awaits inclusos); fora do contexto, cache global.
describe('empresa-config: B1b comEmpresaDe (contexto assincrono)', () => {
  const ECOSUN = '00000000-0000-0000-0000-000000000001';
  const SABION = '33333333-3333-4333-8333-333333333333';
  beforeEach(() => { _resetEstadoParaTeste(); });

  async function carregaDuas() {
    const client = {
      from: () => ({ select: async () => ({ data: [
        { nome_fantasia: 'EcoSunPower', razao_social: 'ECOSUN', cnpj: '33', company_id: ECOSUN },
        { nome_fantasia: 'Sabion Solar', razao_social: 'SABION', cnpj: '99', company_id: SABION },
      ], error: null }) }),
    } as unknown as Parameters<typeof carregarEmpresaConfig>[0];
    await carregarEmpresaConfig(client);
  }

  it('dentro do contexto do tenant, empresa() vira o tenant; fora, EcoSun', async () => {
    await carregaDuas();
    const { comEmpresaDe } = await import('../src/modules/empresa-config.js');
    expect(empresa().nomeFantasia).toBe('EcoSunPower');
    const dentro = comEmpresaDe(SABION, () => empresa().nomeFantasia);
    expect(dentro).toBe('Sabion Solar');
    expect(empresa().nomeFantasia).toBe('EcoSunPower'); // fora: intacto
  });

  it('o contexto atravessa awaits (e o EcoSun/ausente e identico ao global)', async () => {
    await carregaDuas();
    const { comEmpresaDe } = await import('../src/modules/empresa-config.js');
    const nome = await comEmpresaDe(SABION, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return empresa().nomeFantasia;
    });
    expect(nome).toBe('Sabion Solar');
    const eco = await comEmpresaDe(undefined, async () => empresa().nomeFantasia);
    expect(eco).toBe('EcoSunPower');
    const eco2 = await comEmpresaDe(ECOSUN, async () => empresa().nomeFantasia);
    expect(eco2).toBe('EcoSunPower');
  });

  it('contextos concorrentes nao se contaminam', async () => {
    await carregaDuas();
    const { comEmpresaDe } = await import('../src/modules/empresa-config.js');
    const [a, b] = await Promise.all([
      comEmpresaDe(SABION, async () => { await new Promise((r) => setTimeout(r, 10)); return empresa().nomeFantasia; }),
      comEmpresaDe(undefined, async () => { await new Promise((r) => setTimeout(r, 3)); return empresa().nomeFantasia; }),
    ]);
    expect(a).toBe('Sabion Solar');
    expect(b).toBe('EcoSunPower');
  });
});
