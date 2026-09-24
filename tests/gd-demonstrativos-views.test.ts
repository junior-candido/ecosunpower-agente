import { describe, it, expect } from 'vitest';
import {
  renderDemonstrativosLista, renderDemonstrativoCliente, renderConferenciaPdf, renderDigitar,
} from '../src/modules/dashboard/demonstrativos-views.js';
import type { ItemLista } from '../src/modules/gd/demonstrativos-tela.js';

const item = (over: Partial<ItemLista> = {}): ItemLista => ({
  instalacao: '200002', clienteNome: 'JOAO <b>TESTE</b>', leadId: 'L1', referencia: '2026-08-01',
  geracaoKwh: 612, saldoKwh: 1240, estado: 'pronto', motivo: null, alertaVencimento: null, ...over,
});

describe('renderDemonstrativosLista', () => {
  it('escapa o nome, mostra a situacao e os botoes de entrada', () => {
    const h = renderDemonstrativosLista({ itens: [item()], meses: ['2026-08-01'], mes: '2026-08-01', filtro: {} });
    expect(h).toContain('JOAO &lt;b&gt;TESTE&lt;/b&gt;');
    expect(h).toContain('/dashboard/demonstrativos/200002?mes=2026-08-01');
    expect(h).toContain('/dashboard/demonstrativos/enviar-pdf');
    expect(h).toContain('/dashboard/demonstrativos/digitar');
    expect(h).toMatch(/Pronto/);
  });
  it('lista vazia explica o que fazer', () => {
    expect(renderDemonstrativosLista({ itens: [], meses: [], mes: null, filtro: {} })).toMatch(/Nenhum demonstrativo/);
  });
});

describe('renderDemonstrativoCliente', () => {
  it('mostra os numeros, a origem e o formulario de geracao quando falta', () => {
    const h = renderDemonstrativoCliente({
      instalacao: '200002', clienteNome: 'JOAO', leadId: 'L1', meses: ['2026-08-01', '2026-07-01'], mes: '2026-08-01',
      consumoKwh: 480, injetadoKwh: 222, saldoKwh: 1240, compensadoKwh: 380, economiaRs: 376.2,
      proximoExpirar: null, historico: [{ mes: '2026-08-01', consumida: 480, injetada: 222, compensado: 380 }],
      unidades: [], origemDemonstrativo: 'email', verificado: true,
      validacao: { estado: 'falta_dado', bloqueios: [], pendencias: ['falta a geração do mês'], avisos: [], geracaoKwh: null, origemGeracao: null, esperadoMesKwh: 600 },
      candidatos: [], msg: null,
    });
    expect(h).toContain('R$');
    expect(h).toMatch(/e-mail da concessionária/);
    expect(h).toContain('action="/dashboard/demonstrativos/200002/geracao"');
    expect(h).toMatch(/falta a geração/);
  });
  it('UC sem cliente mostra a busca de cliente', () => {
    const h = renderDemonstrativoCliente({
      instalacao: '999', clienteNome: 'X', leadId: null, meses: ['2026-08-01'], mes: '2026-08-01',
      consumoKwh: null, injetadoKwh: null, saldoKwh: null, compensadoKwh: null, economiaRs: null,
      proximoExpirar: null, historico: [], unidades: [], origemDemonstrativo: 'pdf_manual', verificado: false,
      validacao: { estado: 'sem_cliente', bloqueios: [], pendencias: ['UC sem cliente'], avisos: [], geracaoKwh: null, origemGeracao: null, esperadoMesKwh: null },
      candidatos: [{ id: 'L2', nome: 'Maria', uc: '999' }], msg: null,
    });
    expect(h).toContain('action="/dashboard/demonstrativos/999/ligar"');
    expect(h).toContain('value="L2"');
  });
});

describe('renderConferenciaPdf', () => {
  it('cada PDF lido vira um formulario de confirmacao com o texto; o ilegivel mostra o motivo', () => {
    const h = renderConferenciaPdf([
      { arquivo: 'a.pdf', ok: true, textoB64: 'dGV4dG8=', assinatura: 'abc"<x', clienteNome: 'JOAO', instalacao: '200002', referencia: '2026-08-01',
        injetadoKwh: 222, consumoKwh: 480, saldoKwh: 1240, inconsistencias: [] },
      { arquivo: 'b.pdf', ok: false, motivo: 'nao parece um demonstrativo' },
    ]);
    expect(h).toContain('action="/dashboard/demonstrativos/confirmar"');
    expect(h).toContain('name="texto_b64" value="dGV4dG8="');
    expect(h).toContain('name="assinatura_texto" value="abc&quot;&lt;x"');
    expect(h).toMatch(/nao parece um demonstrativo/);
  });
});

describe('renderDigitar', () => {
  it('mostra os erros e devolve o que foi digitado', () => {
    const h = renderDigitar({ clienteNome: 'Ana' }, ['Mês de referência inválido.']);
    expect(h).toMatch(/Mês de referência inválido/);
    expect(h).toContain('value="Ana"');
    expect(h).toContain('action="/dashboard/demonstrativos/digitar"');
  });
});
