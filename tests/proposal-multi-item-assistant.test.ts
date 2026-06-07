import { describe, it, expect } from 'vitest';
import { mapServicosFromClaude, resumoServicosParaJunior, isPropostaSoServico, buildServiceOnlyData } from '../src/modules/proposal-assistant.js';

describe('buildServiceOnlyData', () => {
  const empresa = { nome: 'EcoSunPower', cnpj: '00', cidade: 'Brasília-DF', telefone: '(61) 99697-8781', site: 'ecosunpower.eng.br' };
  it('soma TODOS os serviços pro pagamento padrão e aplica validade default 5', () => {
    let totalRecebido = -1;
    const out = buildServiceOnlyData({
      numeroProposta: '2026-ABC', dataProposta: '06/06/2026',
      data: { nomeCliente: 'Edmilson' },
      servicos: [{ titulo: 'A', descricao: '', valorRs: 2800 }, { titulo: 'B', descricao: '', valorRs: 1000 }],
      empresa,
      criarPagamentoPadrao: (t) => { totalRecebido = t; return [{ tipo: 'À Vista', titulo: 'PIX', valorPrincipal: `R$ ${t}`, valorSecundario: 'único', bullets: [] }]; },
    });
    expect(out.nomeCliente).toBe('Edmilson');
    expect(out.validadeDias).toBe(5);
    expect(out.servicos).toHaveLength(2);
    expect(totalRecebido).toBe(3800); // só-serviço: TODOS contam (não tem solar pra estar "incluso dentro")
    expect(out.empresa).toBe(empresa);
  });
  it('respeita formasPagamento e validadeDias mandados pelo Junior', () => {
    const fp = [{ tipo: 'À Vista', titulo: 'PIX', valorPrincipal: 'R$ 2.800', valorSecundario: 'único', bullets: [] }];
    const out = buildServiceOnlyData({
      numeroProposta: '2026-XYZ', dataProposta: '06/06/2026',
      data: { nomeCliente: 'X', validadeDias: 10, formasPagamento: fp },
      servicos: [{ titulo: 'A', descricao: '', valorRs: 2800 }],
      empresa, criarPagamentoPadrao: () => { throw new Error('não deveria chamar'); },
    });
    expect(out.validadeDias).toBe(10);
    expect(out.formasPagamento).toBe(fp);
  });
});

describe('isPropostaSoServico', () => {
  it('true: sem potência solar mas com serviço (caso Edmilson)', () => {
    expect(isPropostaSoServico({ nomeCliente: 'Edmilson', servicos: [{ titulo: 'Adequação', descricao: 'x', valorRs: 2800 }] })).toBe(true);
  });
  it('false: tem potência solar (proposta solar normal, serviço só soma)', () => {
    expect(isPropostaSoServico({ potenciaKwp: 8.4, servicos: [{ titulo: 'Carregador', descricao: 'x', valorRs: 1000 }] })).toBe(false);
  });
  it('false: sem solar E sem serviço (não dá pra montar proposta)', () => {
    expect(isPropostaSoServico({ nomeCliente: 'X' })).toBe(false);
    expect(isPropostaSoServico({ nomeCliente: 'X', servicos: [] })).toBe(false);
  });
  it('true: potenciaKwp 0 conta como sem solar, desde que haja serviço', () => {
    expect(isPropostaSoServico({ potenciaKwp: 0, servicos: [{ titulo: 'A', descricao: '', valorRs: 500 }] })).toBe(true);
  });
});

describe('resumoServicosParaJunior', () => {
  it('serviço "a mais": mostra + R$ e o total geral somado', () => {
    const linhas = resumoServicosParaJunior(
      [{ titulo: 'Adequação', descricao: '', valorRs: 2800, jaIncluso: false }], 38500).join('\n');
    expect(linhas).toContain('2.800');
    expect(linhas).toContain('41.300'); // 38.500 + 2.800
  });
  it('serviço "já incluso": aparece à parte e NÃO soma ao total', () => {
    const linhas = resumoServicosParaJunior(
      [{ titulo: 'Carregador EV', descricao: '', valorRs: 1000, jaIncluso: true }], 38500).join('\n');
    expect(linhas.toLowerCase()).toContain('já incluso');
    expect(linhas).toContain('Carregador EV');
    expect(linhas).not.toContain('39.500'); // não somou
  });
  it('mistura: total geral = solar + extras; incluso fica à parte', () => {
    const linhas = resumoServicosParaJunior([
      { titulo: 'Adequação', descricao: '', valorRs: 2800, jaIncluso: false },
      { titulo: 'Carregador EV', descricao: '', valorRs: 1000, jaIncluso: true },
    ], 38500).join('\n');
    expect(linhas).toContain('41.300');
    expect(linhas).not.toContain('42.300');
    expect(linhas.toLowerCase()).toContain('já incluso');
  });
  it('sem serviços = nenhuma linha', () => {
    expect(resumoServicosParaJunior([], 38500)).toEqual([]);
    expect(resumoServicosParaJunior(undefined, 38500)).toEqual([]);
  });
});

describe('mapServicosFromClaude', () => {
  it('mapeia lista de serviços do JSON da Eva', () => {
    const out = mapServicosFromClaude([
      { titulo: 'Carregador EV', descricao: 'Wallbox 7,4 kW', valorRs: 4500 },
    ]);
    expect(out).toEqual([{ titulo: 'Carregador EV', descricao: 'Wallbox 7,4 kW', valorRs: 4500, jaIncluso: false }]);
  });
  it('ignora itens sem título ou sem valor', () => {
    const out = mapServicosFromClaude([
      { titulo: '', descricao: 'x', valorRs: 100 },
      { titulo: 'Y', descricao: 'z', valorRs: 0 },
      { titulo: 'Ok', descricao: 'd', valorRs: 200 },
    ]);
    expect(out).toEqual([{ titulo: 'Ok', descricao: 'd', valorRs: 200, jaIncluso: false }]);
  });
  it('retorna undefined quando não há serviços (mantém proposta solar-only)', () => {
    expect(mapServicosFromClaude(undefined)).toBeUndefined();
    expect(mapServicosFromClaude([])).toBeUndefined();
  });
  it('aceita valorRs como string (a Eva pode mandar string)', () => {
    const out = mapServicosFromClaude([{ titulo: 'Projeto elétrico', descricao: 'SPDA + laudo', valorRs: ('3200' as unknown as number) }]);
    expect(out).toEqual([{ titulo: 'Projeto elétrico', descricao: 'SPDA + laudo', valorRs: 3200, jaIncluso: false }]);
  });
  it('passa jaIncluso=true quando a Eva marca o serviço como já incluso no total', () => {
    const out = mapServicosFromClaude([
      { titulo: 'Carregador EV', descricao: 'wallbox 7,4kW', valorRs: 1000, jaIncluso: true },
    ]);
    expect(out).toEqual([{ titulo: 'Carregador EV', descricao: 'wallbox 7,4kW', valorRs: 1000, jaIncluso: true }]);
  });
  it('jaIncluso vira false quando a Eva não marca (default = serviço que soma)', () => {
    const out = mapServicosFromClaude([
      { titulo: 'Adequação', descricao: 'troca padrão', valorRs: 2800 },
    ]);
    expect(out?.[0].jaIncluso).toBe(false);
  });
});
