import { describe, it, expect } from 'vitest';
import {
  EMPRESA_DEFAULTS, normalizarEmpresaRow, interpolarEmpresa, listaMarcasTexto,
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
