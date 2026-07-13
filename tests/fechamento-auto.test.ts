import { describe, it, expect } from 'vitest';
import {
  completarComPlaceholders,
  listarFaltando,
  montarFechamentoAuto,
} from '../src/modules/closing/fechamento-auto.js';
import { renderContrato } from '../src/modules/closing/templates/contrato.html.js';
import { renderProcuracao } from '../src/modules/closing/templates/procuracao.html.js';

describe('completarComPlaceholders', () => {
  it('a partir de um objeto VAZIO ainda devolve dados completos e válidos (nunca trava)', () => {
    const dados = completarComPlaceholders({});
    expect(dados.titular_uc.nome).toBeTruthy();
    expect(dados.titular_uc.cpf).toBeTruthy();
    expect(dados.titular_uc.endereco.uf).toBe('DF');
    expect(dados.sistema.kwp).toBe(0);
    expect(dados.comercial.valor_total_brl).toBe(0);
    expect(dados.docs_pedidos).toEqual(['contrato', 'procuracao']);
  });

  it('preserva os dados que vieram e só preenche os buracos', () => {
    const dados = completarComPlaceholders({
      titular_uc: { tipo: 'PF', nome: 'Fernanda', cpf: '123.456.789-00' } as any,
      sistema: { kwp: 19.6, modalidade: 'autoconsumo_local', modulos: { marca: 'DAH', potencia_w: 590, quantidade: 34 }, inversor: { marca: 'GoodWe', modelo: 'GW20K', potencia_kw: 20 } },
      comercial: { valor_total_brl: 65000, forma_pagamento: 'à vista' },
    });
    expect(dados.titular_uc.nome).toBe('Fernanda');
    expect(dados.titular_uc.cpf).toBe('123.456.789-00');
    expect(dados.titular_uc.rg).toContain('_'); // faltava → branco
    expect(dados.sistema.kwp).toBe(19.6);
    expect(dados.comercial.valor_total_brl).toBe(65000);
  });

  it('o contrato e a procuração RENDERIZAM mesmo com dados vazios (o ponto: nunca falha)', () => {
    const dados = completarComPlaceholders({});
    const contrato = renderContrato(dados);
    const procuracao = renderProcuracao(dados);
    expect(contrato).toContain('<'); // gerou HTML
    expect(contrato.length).toBeGreaterThan(500);
    expect(procuracao.length).toBeGreaterThan(300);
  });
});

describe('listarFaltando', () => {
  it('aponta os campos em branco pra o Junior conferir', () => {
    const dados = completarComPlaceholders({});
    const faltando = listarFaltando(dados, false);
    expect(faltando).toContain('CPF');
    expect(faltando).toContain('RG');
    expect(faltando).toContain('valor');
  });

  it('lista vazia quando tudo veio preenchido', () => {
    const dados = completarComPlaceholders({
      titular_uc: { tipo: 'PF', nome: 'Fernanda', cpf: '123.456.789-00', rg: '1234567', estado_civil: 'casada', endereco: { rua: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Brasília', uf: 'DF', cep: '70000-000' } } as any,
      sistema: { kwp: 19.6, modalidade: 'autoconsumo_local', modulos: { marca: 'DAH', potencia_w: 590, quantidade: 34 }, inversor: { marca: 'GoodWe', modelo: 'GW20K', potencia_kw: 20 } },
      comercial: { valor_total_brl: 65000, forma_pagamento: 'à vista' },
    });
    expect(listarFaltando(dados, true)).toEqual([]);
  });
});

describe('montarFechamentoAuto', () => {
  function fakeClient(lead: any, proposta: any) {
    return {
      from(table: string) {
        const b: any = {};
        b.select = () => b;
        b.eq = () => b;
        b.or = () => b;
        b.order = () => b;
        b.limit = () => b;
        b.maybeSingle = async () => ({ data: table === 'leads' ? lead : proposta, error: null });
        return b;
      },
    } as any;
  }

  it('lead inexistente → null', async () => {
    const r = await montarFechamentoAuto(fakeClient(null, null), 'x');
    expect(r).toBeNull();
  });

  it('lead sem proposta → gera assim mesmo, com sistema/valor em branco', async () => {
    const lead = { id: 'L1', name: 'Antonio', phone: '5561999', cpf_cnpj: null, uf: 'DF' };
    const r = await montarFechamentoAuto(fakeClient(lead, null), 'L1');
    expect(r).not.toBeNull();
    expect(r!.nome).toBe('Antonio');
    expect(r!.faltando).toContain('dados do sistema (proposta)');
    // ainda assim renderiza
    expect(renderContrato(r!.dados).length).toBeGreaterThan(500);
  });

  it('lead com cadastro + proposta → puxa valor/kWp da proposta', async () => {
    const lead = { id: 'L1', name: 'Fernanda', phone: '5561999', cpf_cnpj: '123.456.789-00', estado_civil: 'casada', endereco_rua: 'Rua A', endereco_numero: '10', uf: 'DF', forma_pagamento: 'à vista' };
    const proposta = { id: 'P1', cliente_nome: 'Fernanda', dados_input: { potenciaKwp: 19.6, valorTotalRs: 65000, modulo: { fabricante: 'DAH', potenciaW: 590, quantidade: 34 }, inversor: { fabricante: 'GoodWe', modelo: 'GW20K', potenciaW: 20000 } }, created_at: '2026-07-07' };
    const r = await montarFechamentoAuto(fakeClient(lead, proposta), 'L1');
    expect(r!.dados.sistema.kwp).toBe(19.6);
    expect(r!.dados.comercial.valor_total_brl).toBe(65000);
    expect(r!.dados.titular_uc.cpf).toBe('123.456.789-00');
  });
});
