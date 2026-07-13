import { describe, it, expect } from 'vitest';
import { montarFechamentoAuto, lerRascunho } from '../src/modules/closing/fechamento-auto.js';
import { renderContrato } from '../src/modules/closing/templates/contrato.html.js';

// O formulário da central de contratos salva o que o Junior digitou em
// leads.contrato_dados = { fv: {...}, procuracao: {...} }. Na hora de gerar, esse
// rascunho entra POR CIMA do que veio do cadastro/proposta/IA: a palavra do
// operador é a última ("o que o operador disse, ela faz").

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

const LEAD = {
  id: 'L1', name: 'Fernanda', phone: '5561999', cpf_cnpj: '123.456.789-00',
  uf: 'DF', forma_pagamento: 'à vista',
};
const PROPOSTA = {
  id: 'P1', cliente_nome: 'Fernanda', created_at: '2026-07-07',
  dados_input: {
    potenciaKwp: 19.6, valorTotalRs: 65000,
    modulo: { fabricante: 'DAH', potenciaW: 590, quantidade: 34 },
    inversor: { fabricante: 'GoodWe', modelo: 'GW20K', potenciaW: 20000 },
  },
};

describe('lerRascunho', () => {
  it('sem rascunho → null (não quebra)', () => {
    expect(lerRascunho({}, 'fv')).toBeNull();
    expect(lerRascunho({ contrato_dados: null }, 'fv')).toBeNull();
    expect(lerRascunho({ contrato_dados: 'lixo' }, 'fv')).toBeNull();
  });

  it('pega só o rascunho do tipo pedido', () => {
    const lead = { contrato_dados: { fv: { uc_numero: '111' }, procuracao: { uc_numero: '222' } } };
    expect(lerRascunho(lead, 'fv')).toEqual({ uc_numero: '111' });
    expect(lerRascunho(lead, 'procuracao')).toEqual({ uc_numero: '222' });
    expect(lerRascunho(lead, 'locacao')).toBeNull();
  });
});

describe('montarFechamentoAuto com rascunho do formulário', () => {
  it('sem rascunho → continua exatamente como era (cadastro + proposta)', async () => {
    const r = await montarFechamentoAuto(fakeClient(LEAD, PROPOSTA), 'L1');
    expect(r!.dados.sistema.kwp).toBe(19.6);
    expect(r!.dados.comercial.valor_total_brl).toBe(65000);
  });

  it('o que o Junior digitou GANHA do que veio da proposta', async () => {
    const lead = {
      ...LEAD,
      contrato_dados: {
        fv: {
          titular_uc: { rg: '3.456.789', estado_civil: 'casada' },
          comercial: { valor_total_brl: 61500, forma_pagamento: '12x no cartão' },
        },
      },
    };
    const r = await montarFechamentoAuto(fakeClient(lead, PROPOSTA), 'L1');
    expect(r!.dados.comercial.valor_total_brl).toBe(61500); // digitado venceu
    expect(r!.dados.comercial.forma_pagamento).toBe('12x no cartão');
    expect(r!.dados.titular_uc.rg).toBe('3.456.789'); // era branco, agora tem
    expect(r!.dados.sistema.kwp).toBe(19.6); // não mexeu → segue da proposta
    expect(r!.faltando).not.toContain('RG');
  });

  it('o rascunho de um tipo não vaza pro outro', async () => {
    const lead = { ...LEAD, contrato_dados: { procuracao: { uc_numero: '999' } } };
    const fv = await montarFechamentoAuto(fakeClient(lead, PROPOSTA), 'L1', 'fv');
    const proc = await montarFechamentoAuto(fakeClient(lead, PROPOSTA), 'L1', 'procuracao');
    expect(proc!.dados.uc_numero).toBe('999');
    expect(fv!.dados.uc_numero).toBe('a confirmar');
  });

  it('devolve o CRU (sem placeholder) pra alimentar o formulário', async () => {
    const r = await montarFechamentoAuto(fakeClient(LEAD, PROPOSTA), 'L1');
    expect(JSON.stringify(r!.cru)).not.toContain('___'); // formulário nunca mostra "____"
    expect(r!.dados.titular_uc.rg).toContain('_'); // mas o PDF sai com o branco
  });

  // O contrato imprime o CONTRATANTE (quem assina). Se o rascunho só corrigisse o
  // titular, o operador arrumaria o CPF, salvaria, e o PDF sairia com o CPF velho.
  it('o dado corrigido aparece DE VERDADE no texto do contrato (não só no titular)', async () => {
    const leadCpfErrado = { ...LEAD, cpf_cnpj: '111.111.111-11' };
    const lead = {
      ...leadCpfErrado,
      contrato_dados: { fv: { titular_uc: { cpf: '222.222.222-22', rg: '3.456.789' } } },
    };
    const r = await montarFechamentoAuto(fakeClient(lead, PROPOSTA), 'L1');
    const html = renderContrato(r!.dados);
    expect(html).toContain('222.222.222-22'); // o corrigido está no PDF
    expect(html).not.toContain('111.111.111-11'); // o errado sumiu
    expect(html).toContain('3.456.789');
    expect((r!.dados.contratante as any).cpf).toBe('222.222.222-22');
  });

  it('quando quem assina é OUTRA pessoa (não o titular), o contratante é respeitado', async () => {
    const lead = {
      ...LEAD,
      contrato_dados: {
        fv: {
          contratante_eh_titular: false,
          contratante: { tipo: 'PF', nome: 'Marido da Fernanda', cpf: '999.999.999-99' },
        },
      },
    };
    const r = await montarFechamentoAuto(fakeClient(lead, PROPOSTA), 'L1');
    expect((r!.dados.contratante as any).nome).toBe('Marido da Fernanda');
    expect((r!.dados.titular_uc as any).nome).toBe('Fernanda');
  });

  it('rascunho quebrado não derruba a geração (nunca trava)', async () => {
    const lead = { ...LEAD, contrato_dados: { fv: { sistema: 'isso não é um objeto' } } };
    const r = await montarFechamentoAuto(fakeClient(lead, PROPOSTA), 'L1');
    expect(r).not.toBeNull();
    expect(renderContrato(r!.dados).length).toBeGreaterThan(500);
  });
});
