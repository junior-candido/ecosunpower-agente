import { describe, it, expect } from 'vitest';
import { mapServicosFromClaude, resumoServicosParaJunior, isPropostaSoServico, buildServiceOnlyData, buildServiceImagePrompt, buildComparacaoOpcao, hydrarOpcaoPrincipalDaComparacao, montarInputOpcaoComparacao, buildMensagemClienteProposta, ProposalAssistant, buildSystemPrompt } from '../src/modules/proposal-assistant.js';

describe('buildMensagemClienteProposta', () => {
  it('mensagem limpa pro cliente: saudação (1º nome) + link, SEM nada interno', () => {
    const m = buildMensagemClienteProposta('Marcelo Ferraz', 'https://propostas.test/p/abc', false);
    expect(m).toContain('Marcelo');
    expect(m).not.toContain('Ferraz'); // só o primeiro nome
    expect(m).toContain('https://propostas.test/p/abc');
    expect(m.toLowerCase()).toContain('energia solar');
    // NADA interno pode vazar pro cliente:
    expect(m).not.toContain('R$/Wp');
    expect(m.toLowerCase()).not.toContain('greener');
    expect(m.toLowerCase()).not.toContain('drive');
    expect(m.toLowerCase()).not.toContain('preview');
    expect(m.toLowerCase()).not.toContain('payback');
    expect(m).not.toContain('?eu='); // nunca o link rastreado de revisão
    // balão 100% limpo: a instrução "copia e manda" NÃO pode estar aqui (vazaria pro cliente)
    expect(m.toLowerCase()).not.toContain('copia');
    expect(m.toLowerCase()).not.toContain('revisão');
    expect(m).not.toContain('───');
  });
  it('serviço: texto adapta (não fala "energia solar")', () => {
    const m = buildMensagemClienteProposta('Edmilson', 'https://x/p/y', true);
    expect(m).toContain('Edmilson');
    expect(m).toContain('proposta da EcoSunPower');
    expect(m.toLowerCase()).not.toContain('energia solar');
  });
  it('sem nome: saudação genérica + link', () => {
    const m = buildMensagemClienteProposta(undefined, 'https://x/p/y', false);
    expect(m).toContain('Olá!');
    expect(m).toContain('https://x/p/y');
  });
});

describe('buildComparacaoOpcao', () => {
  const dados = { potenciaKwp: 8.4, moduloFabricante: 'Trina', inversorFabricante: 'Sungrow', valorTotalRs: 38500 };
  it('monta a opção com payback formatado, geração e economia arredondadas', () => {
    const o = buildComparacaoOpcao('Opção A', dados,
      { geracaoMensalKwh: 1080.6, paybackAnos: 4, paybackMeses: 2, paybackInviavel: false, economiaVidaUtil: 320000.4 } as any);
    expect(o.rotulo).toBe('Opção A');
    expect(o.geracaoMensalKwh).toBe(1081);
    expect(o.paybackTexto).toBe('4 anos e 2 meses');
    expect(o.economia25AnosRs).toBe(320000);
    expect(o.moduloFabricante).toBe('Trina');
    expect(o.inversorFabricante).toBe('Sungrow');
  });
  it('payback inviável vira "> 25 anos"', () => {
    const o = buildComparacaoOpcao('B', dados,
      { geracaoMensalKwh: 500, paybackAnos: 25, paybackMeses: 0, paybackInviavel: true, economiaVidaUtil: 10000 } as any);
    expect(o.paybackTexto).toMatch(/25 anos/);
  });
  it('usa singular em "1 ano e 1 mês"', () => {
    const o = buildComparacaoOpcao('C', dados,
      { geracaoMensalKwh: 200, paybackAnos: 1, paybackMeses: 1, paybackInviavel: false, economiaVidaUtil: 5000 } as any);
    expect(o.paybackTexto).toBe('1 ano e 1 mês');
  });
  it('payback abaixo de 1 ano não mostra "0 anos" — só os meses', () => {
    const o = buildComparacaoOpcao('D', dados,
      { geracaoMensalKwh: 300, paybackAnos: 0, paybackMeses: 5, paybackInviavel: false, economiaVidaUtil: 8000 } as any);
    expect(o.paybackTexto).toBe('5 meses');
  });
  it('payback exato em anos não mostra meses', () => {
    const o = buildComparacaoOpcao('E', dados,
      { geracaoMensalKwh: 300, paybackAnos: 4, paybackMeses: 0, paybackInviavel: false, economiaVidaUtil: 8000 } as any);
    expect(o.paybackTexto).toBe('4 anos');
  });
  it('carrega créditos, curva mês a mês e consumo do cenário pro card', () => {
    const curva = [1180, 1150, 1100, 1040, 980, 950, 1000, 1060, 1120, 1160, 1170, 1190];
    const o = buildComparacaoOpcao('Opção A',
      { ...dados, consumoMensalKwh: 1200 } as any,
      { geracaoMensalKwh: 2152, paybackAnos: 2, paybackMeses: 9, paybackInviavel: false,
        economiaVidaUtil: 920120, economiaMensal: 1141,
        contaComDetalhada: { creditosKwh: 952.3 },
        geracaoMensalDistribuida: curva } as any);
    expect(o.creditosMensalKwh).toBe(952);
    expect(o.geracaoMensalDistribuida).toEqual(curva);
    expect(o.consumoMensalKwh).toBe(1200);
  });

  it('sem créditos/curva/consumo: campos ficam undefined (card omite)', () => {
    const o = buildComparacaoOpcao('B', dados,
      { geracaoMensalKwh: 300, paybackAnos: 4, paybackMeses: 0, paybackInviavel: false, economiaVidaUtil: 8000 } as any);
    expect(o.creditosMensalKwh).toBeUndefined();
    expect(o.geracaoMensalDistribuida).toBeUndefined();
    expect(o.consumoMensalKwh).toBeUndefined();
  });

  it('carrega quantidade/modelo dos equipamentos e a economia mensal arredondada', () => {
    const dadosCompletos = {
      potenciaKwp: 8.4, valorTotalRs: 38500,
      moduloFabricante: 'Trina', moduloModelo: 'Vertex', moduloPotenciaW: 700, moduloQuantidade: 12,
      inversorFabricante: 'Sungrow', inversorModelo: 'SG5.0RS-L', inversorQuantidade: 1,
    };
    const o = buildComparacaoOpcao('Opção A', dadosCompletos,
      { geracaoMensalKwh: 1080, paybackAnos: 4, paybackMeses: 2, paybackInviavel: false, economiaVidaUtil: 320000, economiaMensal: 849.6 } as any);
    expect(o.moduloQuantidade).toBe(12);
    expect(o.moduloModelo).toBe('Vertex');
    expect(o.moduloPotenciaW).toBe(700);
    expect(o.inversorQuantidade).toBe(1);
    expect(o.inversorModelo).toBe('SG5.0RS-L');
    expect(o.economiaMensalRs).toBe(850);
  });
});

describe('montarInputOpcaoComparacao', () => {
  // data.* É a Opção A. O override de geração do topo é da Opção A — não pode vazar
  // pras outras opções, senão as duas saíam com a MESMA geração (bug reportado).
  const data = { potenciaKwp: 8.4, consumoMensalKwh: 1000, geracaoMensalKwh: 1080, concessionaria: 'Neoenergia DF' };

  it('Opção A (índice 0) mantém o override de geração do topo', () => {
    const op = { potenciaKwp: 8.4, valorTotalRs: 38500 };
    const out = montarInputOpcaoComparacao(data, op, 0);
    expect(out.geracaoMensalKwh).toBe(1080);
  });

  it('Opção B (índice 1) NÃO herda a geração do topo — calcula pela própria potência', () => {
    const op = { potenciaKwp: 10.5, valorTotalRs: 48000 };
    const out = montarInputOpcaoComparacao(data, op, 1);
    expect(out.geracaoMensalKwh).toBeUndefined();
    expect(out.geracaoKwh).toBeUndefined();
    expect(out.geracao).toBeUndefined();
    expect(out.potenciaKwp).toBe(10.5); // veio da opção
    expect(out.consumoMensalKwh).toBe(1000); // consumo do cliente é o mesmo nas duas
  });

  it('se a própria Opção B trouxer geração (PVSol dela), essa manda', () => {
    const op = { potenciaKwp: 10.5, valorTotalRs: 48000, geracaoMensalKwh: 1350 };
    const out = montarInputOpcaoComparacao(data, op, 1);
    expect(out.geracaoMensalKwh).toBe(1350);
  });

  // Bug real (proposta 21/07): estudo PVSol veio como os 12 MESES (geracaoMensalKwhDistribuido).
  // A Opção B herdava o array do topo e saía com a MESMA geração da A (2.152 kWh/mês nas duas,
  // mesmo a B tendo metade da potência). O array do estudo é da Opção A, igual ao número único.
  it('Opção B NÃO herda os 12 meses do estudo (geracaoMensalKwhDistribuido) do topo', () => {
    const doze = [2200, 2180, 2150, 2100, 2050, 2000, 2080, 2150, 2200, 2220, 2240, 2254];
    const dataComEstudo = { ...data, geracaoMensalKwhDistribuido: doze };
    const out = montarInputOpcaoComparacao(dataComEstudo, { potenciaKwp: 8.5, valorTotalRs: 18837 }, 1);
    expect(out.geracaoMensalKwhDistribuido).toBeUndefined();
    expect(out.geracaoMensal12Meses).toBeUndefined();
  });

  it('Opção B NÃO herda o alias geracaoMensal12Meses do topo', () => {
    const doze = [2200, 2180, 2150, 2100, 2050, 2000, 2080, 2150, 2200, 2220, 2240, 2254];
    const dataComEstudo = { ...data, geracaoMensal12Meses: doze };
    const out = montarInputOpcaoComparacao(dataComEstudo, { potenciaKwp: 8.5, valorTotalRs: 18837 }, 1);
    expect(out.geracaoMensal12Meses).toBeUndefined();
  });

  it('Opção A (índice 0) mantém os 12 meses do estudo', () => {
    const doze = [2200, 2180, 2150, 2100, 2050, 2000, 2080, 2150, 2200, 2220, 2240, 2254];
    const dataComEstudo = { ...data, geracaoMensalKwhDistribuido: doze };
    const out = montarInputOpcaoComparacao(dataComEstudo, { potenciaKwp: 17, valorTotalRs: 32290 }, 0);
    expect(out.geracaoMensalKwhDistribuido).toEqual(doze);
  });

  it('topo com array + Opção B com número único próprio: o número da B manda, o array não vaza', () => {
    const dataComEstudo = { ...data, geracaoMensalKwhDistribuido: [2200, 2180, 2150, 2100, 2050, 2000, 2080, 2150, 2200, 2220, 2240, 2254] };
    const op = { potenciaKwp: 8.5, valorTotalRs: 18837, geracaoMensalKwh: 1076 };
    const out = montarInputOpcaoComparacao(dataComEstudo, op, 1);
    expect(out.geracaoMensalKwh).toBe(1076);
    expect(out.geracaoMensalKwhDistribuido).toBeUndefined();
  });

  it('se a Opção B trouxer os 12 meses dela pelo ALIAS (geracaoMensal12Meses), o dela manda', () => {
    const dozeDaB = [1100, 1090, 1075, 1050, 1025, 1000, 1040, 1075, 1100, 1110, 1120, 1127];
    const dataComEstudo = { ...data, geracaoMensal12Meses: [2200, 2180, 2150, 2100, 2050, 2000, 2080, 2150, 2200, 2220, 2240, 2254] };
    const op = { potenciaKwp: 8.5, valorTotalRs: 18837, geracaoMensal12Meses: dozeDaB };
    const out = montarInputOpcaoComparacao(dataComEstudo, op, 1);
    expect(out.geracaoMensal12Meses).toEqual(dozeDaB);
  });

  it('se a própria Opção B trouxer os 12 meses dela (estudo próprio), esses mandam', () => {
    const dozeDaB = [1100, 1090, 1075, 1050, 1025, 1000, 1040, 1075, 1100, 1110, 1120, 1127];
    const dataComEstudo = { ...data, geracaoMensalKwhDistribuido: [2200, 2180, 2150, 2100, 2050, 2000, 2080, 2150, 2200, 2220, 2240, 2254] };
    const op = { potenciaKwp: 8.5, valorTotalRs: 18837, geracaoMensalKwhDistribuido: dozeDaB };
    const out = montarInputOpcaoComparacao(dataComEstudo, op, 1);
    expect(out.geracaoMensalKwhDistribuido).toEqual(dozeDaB);
  });

  it('cenário: se a Opção B trouxer consumo próprio (ex: 800 kWh), o cálculo dela usa esse', () => {
    const op = { potenciaKwp: 8.5, valorTotalRs: 18837, consumoMensalKwh: 800 };
    const out = montarInputOpcaoComparacao(data, op, 1);
    expect(out.consumoMensalKwh).toBe(800);
  });

  it('consumo inválido na opção (0/negativo/lixo) NÃO sobrescreve o consumo do cliente', () => {
    for (const invalido of [0, -10, NaN, 'abc']) {
      const op = { potenciaKwp: 8.5, valorTotalRs: 18837, consumoMensalKwh: invalido };
      const out = montarInputOpcaoComparacao(data, op, 1);
      expect(out.consumoMensalKwh).toBe(1000); // consumo do topo preservado
    }
  });

  it('não muta o data original', () => {
    const snapshot = { ...data };
    montarInputOpcaoComparacao(data, { potenciaKwp: 9 }, 1);
    expect(data).toEqual(snapshot);
  });
});

describe('hydrarOpcaoPrincipalDaComparacao', () => {
  const opcaoA = { rotulo: 'Opção A', potenciaKwp: 8.4, valorTotalRs: 38500, modulo: { fabricante: 'Trina' }, inversor: { fabricante: 'Sungrow' } };
  const opcaoB = { rotulo: 'Opção B', potenciaKwp: 8.0, valorTotalRs: 44000, modulo: { fabricante: 'LONGi' }, inversor: { fabricante: 'SolarEdge' } };

  it('hidrata potência e valor do topo a partir de comparacao[0] quando o extrator esquece (causa do NaN)', () => {
    // O LLM preencheu só comparacao[] e deixou o topo vazio → antes estourava "potenciaKwp inválido: NaN"
    const data = { nomeCliente: 'X', comparacao: [opcaoA, opcaoB] };
    const out = hydrarOpcaoPrincipalDaComparacao(data);
    expect(out.potenciaKwp).toBe(8.4);
    expect(out.valorTotalRs).toBe(38500);
    expect(out.modulo).toEqual({ fabricante: 'Trina' });
    expect(out.inversor).toEqual({ fabricante: 'Sungrow' });
  });

  it('NÃO sobrescreve o topo quando já veio preenchido (idempotente / topo manda)', () => {
    const data = { nomeCliente: 'X', potenciaKwp: 10, valorTotalRs: 50000, modulo: { fabricante: 'JA' }, inversor: { fabricante: 'Deye' }, comparacao: [opcaoA, opcaoB] };
    const out = hydrarOpcaoPrincipalDaComparacao(data);
    expect(out.potenciaKwp).toBe(10);
    expect(out.valorTotalRs).toBe(50000);
    expect(out.modulo).toEqual({ fabricante: 'JA' });
  });

  it('sem comparacao: devolve os dados sem mexer', () => {
    const data = { nomeCliente: 'X', potenciaKwp: 8.4 };
    expect(hydrarOpcaoPrincipalDaComparacao(data)).toEqual(data);
  });

  it('hidrata só o que falta (topo tem valor mas não potência)', () => {
    const data = { nomeCliente: 'X', valorTotalRs: 99000, comparacao: [opcaoA, opcaoB] };
    const out = hydrarOpcaoPrincipalDaComparacao(data);
    expect(out.potenciaKwp).toBe(8.4); // veio do A
    expect(out.valorTotalRs).toBe(99000); // topo manda, não sobrescreve
  });
});

describe('buildServiceImagePrompt', () => {
  it('monta prompt fotorrealista a partir do título e descrição do serviço', () => {
    const p = buildServiceImagePrompt({ titulo: 'Carregador EV', descricao: 'Wallbox 7,4 kW em garagem residencial', valorRs: 4500 });
    expect(p.toLowerCase()).toContain('carregador ev');
    expect(p.toLowerCase()).toContain('wallbox 7,4 kw em garagem residencial');
    expect(p.toLowerCase()).toMatch(/photoreal|realistic|professional/);
  });
  it('pede sem texto e sem marca dágua (imagem limpa)', () => {
    const p = buildServiceImagePrompt({ titulo: 'Projeto elétrico', descricao: '', valorRs: 3200 });
    expect(p.toLowerCase()).toContain('no text');
    expect(p.toLowerCase()).toContain('no watermark');
  });
});

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

describe('isProposalTrigger — proposta de serviço', () => {
  const t = (s: string) => ProposalAssistant.isProposalTrigger(s);

  it('"proposta de serviço ..." solto (sem barra) dispara', () => {
    expect(t('proposta de serviço pro Thiago — desmontagem, transporte, total R$ 7.800')).toBe(true);
  });
  it('"Proposta de serviço" sozinho dispara (case/acento indiferente)', () => {
    expect(t('Proposta de serviço')).toBe(true);
    expect(t('proposta de servico')).toBe(true);
  });
  it('"/proposta de serviço" (do botão do menu) dispara', () => {
    expect(t('/proposta de serviço')).toBe(true);
  });
  it('"proposta de serviços" (plural) dispara', () => {
    expect(t('proposta de serviços pro condomínio')).toBe(true);
  });
  it('frase com o termo no MEIO não dispara', () => {
    expect(t('a proposta de serviço do concorrente chegou')).toBe(false);
  });
  it('lançamento financeiro não dispara', () => {
    expect(t('recebi 5000 do João')).toBe(false);
  });
  it('gatilhos antigos seguem valendo', () => {
    expect(t('/proposta')).toBe(true);
    expect(t('proposta')).toBe(true);
    expect(t('quero gerar proposta pro Marcio')).toBe(true);
  });
  it('espaços duplicados não quebram o gatilho', () => {
    expect(t('proposta  de  serviço pro João, padrão 2500')).toBe(true);
  });
});

describe('buildSystemPrompt — regra da proposta de serviço', () => {
  const prompt = buildSystemPrompt('', '');

  it('preço POR ITEM é caminho oficial (sistema soma, Eva não)', () => {
    expect(prompt).toContain('POR ITEM');
    expect(prompt).toContain('O SISTEMA SOMA');
  });
  it('trava: tarefa sem preço numa precificação por item → perguntar', () => {
    expect(prompt).toContain('pergunte o preço DELA');
  });
  it('trava: total que não bate com a soma → perguntar qual vale', () => {
    expect(prompt).toContain('pergunte qual vale');
  });
  it('resumo de conferência itemizado no só-serviço', () => {
    expect(prompt).toContain('liste CADA serviço com o preço');
  });
  it('a instrução antiga de "quase sempre valor único" saiu', () => {
    expect(prompt).not.toContain('quase sempre é orçado por UM VALOR ÚNICO');
  });
  it('no caminho por item, valorTotalRs não é obrigatório nem entra em missing', () => {
    expect(prompt).toContain("valorTotalRs` NÃO é obrigatório");
    expect(prompt).toContain("NUNCA o liste em `missing`");
  });
  it('CAMPOS OBRIGATÓRIOS tem a exceção do só-serviço', () => {
    expect(prompt).toContain('Exceção — proposta SÓ de serviço');
  });
});
