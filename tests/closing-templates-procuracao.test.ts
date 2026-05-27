import { describe, it, expect } from 'vitest';
import { renderProcuracao } from '../src/modules/closing/templates/procuracao.html.js';
import type { DadosFechamento } from '../src/modules/closing/index.js';

const dadosFernanda: DadosFechamento = {
  titular_uc: {
    tipo: 'PF',
    nome: 'Fernanda Silva Almeida Araujo de Melo',
    cpf: '831.347.431-91',
    rg: '1.830.813',
    orgao_emissor_rg: 'SSP-DF',
    nacionalidade: 'brasileira',
    estado_civil: 'casada',
    profissao: 'empresária',
    endereco: {
      rua: 'SMPW Quadra 15, Conjunto 1, Lote 05',
      numero: 's/n',
      bairro: 'Park Way',
      cidade: 'Brasilia', uf: 'DF', cep: '71.741-501',
    },
    telefone: '5561900000000',
    email: 'fernanda@example.com',
  },
  uc_numero: '3098127',
  concessionaria: 'Neoenergia-DF',
  endereco_instalacao: {
    rua: 'SMPW Quadra 15, Conjunto 1, Lote 05',
    numero: 's/n', bairro: 'Park Way',
    cidade: 'Brasilia', uf: 'DF', cep: '71.741-501',
  },
  contratante: undefined as any,
  contratante_eh_titular: true,
  sistema: { kwp: 0, modalidade: 'autoconsumo_local', modulos: { marca: '', potencia_w: 0, quantidade: 0 }, inversor: { marca: '', modelo: '', potencia_kw: 0 } },
  comercial: { valor_total_brl: 0, forma_pagamento: '' },
  docs_pedidos: ['procuracao'],
};

describe('renderProcuracao — modelo Fernanda', () => {
  it('titulo e PROCURACAO PARTICULAR (nao mais INSTRUMENTO)', () => {
    const html = renderProcuracao(dadosFernanda);
    expect(html).toContain('PROCURAÇÃO PARTICULAR');
    expect(html).not.toContain('INSTRUMENTO PARTICULAR');
  });

  it('validade 12 meses (nao mais 180 dias)', () => {
    const html = renderProcuracao(dadosFernanda);
    expect(html).toMatch(/12\s*\(doze\)\s*meses/i);
    expect(html).not.toMatch(/180.*dias/);
  });

  it('outorgado e Antonio em nome da PJ (nao mais PJ representada)', () => {
    const html = renderProcuracao(dadosFernanda);
    expect(html).toMatch(/ANTONIO CANDIDO RODRIGUES JUNIOR/);
    expect(html).toMatch(/atuando em nome da empresa.*ECOSUNPOWER/i);
  });

  it('contem dados do titular (cpf, RG, endereco, UC)', () => {
    const html = renderProcuracao(dadosFernanda);
    expect(html).toContain('FERNANDA SILVA ALMEIDA');
    expect(html).toContain('831.347.431-91');
    expect(html).toContain('1.830.813 SSP-DF');
    expect(html).toMatch(/SMPW Quadra 15/);
    expect(html).toContain('71.741-501');
    expect(html).toContain('3098127');
    expect(html).toContain('NEOENERGIA');
  });

  it('rodape com email junior@ (NUNCA contato@ nem gmail legado)', () => {
    const html = renderProcuracao(dadosFernanda);
    expect(html).toContain('junior@ecosunpower.eng.br');
    expect(html).not.toContain('contato@');
    expect(html).not.toContain('ecosunpower2032@gmail.com');
  });

  it('NAO menciona ANEEL formal (escopo simplificado)', () => {
    const html = renderProcuracao(dadosFernanda);
    expect(html).not.toMatch(/ANEEL/i);
  });

  it('header EcoSunPower + CNPJ 33.020.459', () => {
    const html = renderProcuracao(dadosFernanda);
    expect(html).toContain('ECOSUNPOWER ENERGIA SOLAR');
    expect(html).toContain('33.020.459/0001-06');
  });

  it('credita Responsavel Tecnico CREA/CFT (nao engenheiro)', () => {
    const html = renderProcuracao(dadosFernanda);
    expect(html).toMatch(/Respons[áa]vel T[ée]cnico/);
    expect(html).toContain('98940457153');
    expect(html).not.toMatch(/\bengenheiro\b/i);
  });

  it('inclui 6 alineas de poderes (a) a (f)', () => {
    const html = renderProcuracao(dadosFernanda);
    const lis = html.match(/<li>/g) ?? [];
    expect(lis.length).toBeGreaterThanOrEqual(6);
  });

  it('uc fallback "(a confirmar)" quando vazio', () => {
    const sem = { ...dadosFernanda, uc_numero: '' };
    const html = renderProcuracao(sem);
    expect(html).toMatch(/a confirmar/i);
  });
});
