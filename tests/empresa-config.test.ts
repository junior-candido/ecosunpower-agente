import { describe, it, expect, beforeEach } from 'vitest';
import {
  EMPRESA_DEFAULTS, normalizarEmpresaRow, interpolarEmpresa, listaMarcasTexto,
  carregarEmpresaConfig, empresa, _resetEstadoParaTeste,
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

describe('empresa-config: I1 — reload com erro mantém config anterior', () => {
  beforeEach(() => {
    // Reseta estado interno do módulo (cache + carregadaDoBanco) entre testes.
    _resetEstadoParaTeste();
  });

  it('reload com erro mantém config customizada anterior — não rebaixa pra defaults EcoSun', async () => {
    // 1) Primeiro carregamento: sucesso com row de cliente customizado
    const successClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
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
              },
              error: null,
            }),
          }),
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
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'connection refused' } }),
          }),
        }),
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
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
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
              },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof carregarEmpresaConfig>[0];

    const r1 = await carregarEmpresaConfig(successClient);
    expect(r1.ok).toBe(true);
    expect(r1.config.nomeFantasia).toBe('AcmeSolar');

    // 2) Segundo carregamento lança exceção
    const throwClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => { throw new Error('network error'); },
          }),
        }),
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
