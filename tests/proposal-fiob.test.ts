import { describe, it, expect } from 'vitest';
import {
  percentualFioBPorAno,
  percentualInjetadoSugerido,
  calcularContaMensalDetalhada,
  calcular,
  tipoSistemaDeDados,
  perfilDeTipoCliente,
  temCarregadorNosServicos,
  tabelaSimultaneidade,
  tabelaFioBPorAno,
  type ProposalInput,
} from '../src/modules/proposal/calculator.js';

// Base on-grid pinada (geracao override = consumo, sem CIP, sem reajuste) pra
// isolar o efeito do Fio B na projecao. valorTotal alto evita payback no ano 1.
function baseInput(over: Partial<ProposalInput> = {}): ProposalInput {
  return {
    potenciaKwp: 4,
    fatorPerda: 0.8,
    hsp: 5.4,
    consumoMensalKwh: 500,
    tarifaRsKwh: 1.0,
    reajusteAnualEnergia: 0,
    tusdFioBRsKwh: 0.30,
    percentualFioBVigente: 0.60,
    percentualGeracaoInjetada: 0.75,
    custoIluminacaoPublica: 0,
    valorTotalRs: 20000,
    vidaUtilAnos: 5,
    geracaoMensalKwhOverride: 500,
    anoInicial: 2026,
    tipoSistema: 'on_grid',
    ...over,
  };
}

describe('percentualFioBPorAno — cronograma Lei 14.300 art. 27', () => {
  it('segue o cronograma oficial', () => {
    expect(percentualFioBPorAno(2023)).toBeCloseTo(0.15);
    expect(percentualFioBPorAno(2024)).toBeCloseTo(0.30);
    expect(percentualFioBPorAno(2025)).toBeCloseTo(0.45);
    expect(percentualFioBPorAno(2026)).toBeCloseTo(0.60);
    expect(percentualFioBPorAno(2027)).toBeCloseTo(0.75);
    expect(percentualFioBPorAno(2028)).toBeCloseTo(0.90);
    expect(percentualFioBPorAno(2029)).toBeCloseTo(1.00);
  });
  it('antes de 2023 trava no piso e depois de 2029 trava em 100%', () => {
    expect(percentualFioBPorAno(2020)).toBeCloseTo(0.15);
    expect(percentualFioBPorAno(2035)).toBeCloseTo(1.00);
  });
});

describe('percentualInjetadoSugerido — fração da geração que vai pra rede (paga Fio B)', () => {
  it('off-grid não injeta nada', () => {
    expect(percentualInjetadoSugerido({ tipoSistema: 'off_grid' })).toBe(0);
  });

  it('on-grid varia por perfil (residencial injeta mais que indústria)', () => {
    const res = percentualInjetadoSugerido({ tipoSistema: 'on_grid', perfil: 'residencial' });
    const ind = percentualInjetadoSugerido({ tipoSistema: 'on_grid', perfil: 'industrial' });
    expect(res).toBeGreaterThan(ind);
    expect(res).toBeGreaterThan(0);
    expect(res).toBeLessThanOrEqual(1);
  });

  it('carregador usado de dia reduz a injeção (mais autoconsumo)', () => {
    const sem = percentualInjetadoSugerido({ tipoSistema: 'on_grid', perfil: 'residencial' });
    const com = percentualInjetadoSugerido({ tipoSistema: 'on_grid', perfil: 'residencial', temCarregador: true });
    expect(com).toBeLessThan(sem);
    expect(com).toBeGreaterThanOrEqual(0);
  });

  it('híbrido no modo Backup injeta como on-grid (bateria reservada)', () => {
    const onGrid = percentualInjetadoSugerido({ tipoSistema: 'on_grid', perfil: 'residencial' });
    const backup = percentualInjetadoSugerido({ tipoSistema: 'hibrido', modoBateria: 'backup', perfil: 'residencial' });
    expect(backup).toBeCloseTo(onGrid);
  });

  it('híbrido no modo Autoconsumo injeta bem pouco (Fio B despenca)', () => {
    const onGrid = percentualInjetadoSugerido({ tipoSistema: 'on_grid', perfil: 'residencial' });
    const auto = percentualInjetadoSugerido({ tipoSistema: 'hibrido', modoBateria: 'autoconsumo', perfil: 'residencial' });
    expect(auto).toBeLessThan(onGrid);
    expect(auto).toBeLessThanOrEqual(0.25);
  });
});

describe('calcularContaMensalDetalhada — breakdown por tipo de sistema', () => {
  const base = {
    consumoKwh: 500,
    geracaoKwh: 500,
    tarifaRsKwh: 1.0,
    tusdFioBRsKwh: 0.30,
    percentualFioBVigente: 0.60,
    custoIluminacaoPublica: 0,
  };

  it('on-grid: Fio B sobre o injetado (exemplo da proposta = R$ 67,50)', () => {
    const c = calcularContaMensalDetalhada({ ...base, percentualGeracaoInjetada: 0.75, tipoSistema: 'on_grid' });
    expect(c.injetadoKwh).toBeCloseTo(375);
    expect(c.autoconsumoKwh).toBeCloseTo(125);
    expect(c.fioB).toBeCloseTo(67.5);
    expect(c.consumoRede).toBeCloseTo(0);
    expect(c.total).toBeCloseTo(67.5);
  });

  it('off-grid: zera tudo (sem rede)', () => {
    const c = calcularContaMensalDetalhada({ ...base, percentualGeracaoInjetada: 0, tipoSistema: 'off_grid', custoIluminacaoPublica: 50 });
    expect(c.total).toBe(0);
    expect(c.fioB).toBe(0);
    expect(c.cip).toBe(0);
  });

  it('híbrido autoconsumo: injeta menos -> Fio B bem menor que on-grid', () => {
    const onGrid = calcularContaMensalDetalhada({ ...base, percentualGeracaoInjetada: 0.75, tipoSistema: 'on_grid' });
    const hib = calcularContaMensalDetalhada({ ...base, percentualGeracaoInjetada: 0.15, tipoSistema: 'hibrido' });
    expect(hib.fioB).toBeLessThan(onGrid.fioB);
    expect(hib.fioB).toBeCloseTo(500 * 0.15 * 0.30 * 0.60); // 13,5
  });

  it('inclui iluminação pública quando há (on-grid)', () => {
    const c = calcularContaMensalDetalhada({ ...base, percentualGeracaoInjetada: 0.75, tipoSistema: 'on_grid', custoIluminacaoPublica: 30 });
    expect(c.cip).toBe(30);
    expect(c.total).toBeCloseTo(97.5);
  });
});

describe('calcularContaMensalDetalhada — sistema superdimensionado (Fio B só sobre a energia COMPENSADA)', () => {
  // Lei 14.300 art. 27: o Fio B incide sobre a energia injetada e COMPENSADA na
  // fatura, não sobre tudo que entra na rede. O excedente vira CRÉDITO (60 meses)
  // e só paga Fio B quando for consumido. Caso real 21/07: sistema 2× o consumo
  // saía com Fio B sobre 1.614 kWh quando o cliente só compensa 662.
  const casoReal = {
    consumoKwh: 1200,
    geracaoKwh: 2152,
    tarifaRsKwh: 1.05,
    tusdFioBRsKwh: 0.30,
    percentualFioBVigente: 0.60,
    percentualGeracaoInjetada: 0.75,
    custoIluminacaoPublica: 35,
    tipoSistema: 'on_grid' as const,
  };

  it('caso real: Fio B sobre os 662 kWh compensados, não sobre os 1.614 injetados', () => {
    const c = calcularContaMensalDetalhada(casoReal);
    // autoconsumo simultâneo: 25% de 2.152 = 538 (menor que o consumo, ok)
    expect(c.autoconsumoKwh).toBeCloseTo(538);
    // da rede o cliente puxa 1.200 - 538 = 662 → tudo compensado pelos créditos
    expect(c.compensadaKwh).toBeCloseTo(662);
    expect(c.fioB).toBeCloseTo(662 * 0.30 * 0.60, 1); // ~119, não ~290
    expect(c.consumoRede).toBeCloseTo(0); // nada fica sem cobertura
    expect(c.total).toBeCloseTo(662 * 0.30 * 0.60 + 35, 1); // ~154
  });

  it('caso real: o excedente vira crédito (injetado - compensado = ~952 kWh)', () => {
    const c = calcularContaMensalDetalhada(casoReal);
    expect(c.injetadoKwh).toBeCloseTo(1614);
    expect(c.creditosKwh).toBeCloseTo(1614 - 662);
  });

  it('caso real: economia mensal do calcular() sai ~R$ 1.141 (teto = conta do cliente)', () => {
    const r = calcular({
      potenciaKwp: 17,
      fatorPerda: 0.78,
      hsp: 5.4,
      consumoMensalKwh: 1200,
      tarifaRsKwh: 1.05,
      reajusteAnualEnergia: 0,
      tusdFioBRsKwh: 0.30,
      percentualFioBVigente: 0.60,
      percentualGeracaoInjetada: 0.75,
      custoIluminacaoPublica: 35,
      valorTotalRs: 32290,
      vidaUtilAnos: 25,
      geracaoMensalKwhOverride: 2152,
      anoInicial: 2026,
      tipoSistema: 'on_grid',
    });
    // conta hoje: 1200×1,05 + 35 = 1.295 · conta com solar: ~154 → economia ~1.141
    expect(r.economiaMensal).toBeCloseTo(1295 - (662 * 0.30 * 0.60 + 35), 0);
    expect(r.contaComDetalhada.creditosKwh).toBeCloseTo(952);
  });

  it('autoconsumo simultâneo não passa do consumo (comercial gerando muito): sobra vai pra injeção', () => {
    const c = calcularContaMensalDetalhada({
      consumoKwh: 300, geracaoKwh: 2000, tarifaRsKwh: 1.0, tusdFioBRsKwh: 0.30,
      percentualFioBVigente: 0.60, percentualGeracaoInjetada: 0.45,
      custoIluminacaoPublica: 0, tipoSistema: 'on_grid',
    });
    // autoconsumo teórico 55% de 2000 = 1100, mas o cliente só consome 300
    expect(c.autoconsumoKwh).toBeCloseTo(300);
    expect(c.injetadoKwh).toBeCloseTo(1700); // o resto TODO vai pra rede
    expect(c.compensadaKwh).toBeCloseTo(0);  // não puxa nada da rede → nada a compensar
    expect(c.fioB).toBeCloseTo(0);
    expect(c.creditosKwh).toBeCloseTo(1700);
  });

  it('autoconsumo remoto: créditos abatem a OUTRA unidade (economia real, com Fio B de lá)', () => {
    // caso real 21/07 completo: casa principal 1200, outra casa consome 900 dos créditos
    const r = calcular({
      potenciaKwp: 17, fatorPerda: 0.78, hsp: 5.4,
      consumoMensalKwh: 1200, tarifaRsKwh: 1.05, reajusteAnualEnergia: 0,
      tusdFioBRsKwh: 0.30, percentualFioBVigente: 0.60, percentualGeracaoInjetada: 0.75,
      custoIluminacaoPublica: 35, valorTotalRs: 32290, vidaUtilAnos: 25,
      geracaoMensalKwhOverride: 2152, anoInicial: 2026, tipoSistema: 'on_grid',
      consumoRemotoMensalKwh: 900,
    });
    // créditos brutos 952 → 900 vão pra outra unidade, 52 ficam guardados
    expect(r.creditosUsadosRemotoKwh).toBeCloseTo(900);
    expect(r.creditosGuardadosKwh).toBeCloseTo(52);
    // economia remota: 900×1,05 − 900×0,30×60% = 945 − 162 = 783
    expect(r.economiaRemotaMensal).toBeCloseTo(783, 0);
    // economia total = 1.141 (casa) + 783 (outra) ≈ 1.924
    expect(r.economiaMensal).toBeCloseTo(1141 + 783, 0);
  });

  it('remoto maior que os créditos: abate só o que sobrou de verdade', () => {
    const r = calcular({
      potenciaKwp: 17, fatorPerda: 0.78, hsp: 5.4,
      consumoMensalKwh: 1200, tarifaRsKwh: 1.05, reajusteAnualEnergia: 0,
      tusdFioBRsKwh: 0.30, percentualFioBVigente: 0.60, percentualGeracaoInjetada: 0.75,
      custoIluminacaoPublica: 35, valorTotalRs: 32290, vidaUtilAnos: 25,
      geracaoMensalKwhOverride: 2152, anoInicial: 2026, tipoSistema: 'on_grid',
      consumoRemotoMensalKwh: 5000, // outra casa consome mais do que sobra
    });
    expect(r.creditosUsadosRemotoKwh).toBeCloseTo(952); // teto = créditos
    expect(r.creditosGuardadosKwh).toBeCloseTo(0);
  });

  it('sem consumo remoto: tudo igual a antes (campos novos zerados)', () => {
    const r = calcular(baseInput());
    expect(r.creditosUsadosRemotoKwh).toBe(0);
    expect(r.creditosGuardadosKwh).toBe(0);
    expect(r.economiaRemotaMensal).toBe(0);
  });

  it('remoto entra na projeção de 25 anos (payback melhora de verdade)', () => {
    const base = {
      potenciaKwp: 17, fatorPerda: 0.78, hsp: 5.4,
      consumoMensalKwh: 1200, tarifaRsKwh: 1.05, reajusteAnualEnergia: 0,
      tusdFioBRsKwh: 0.30, percentualFioBVigente: 0.60, percentualGeracaoInjetada: 0.75,
      custoIluminacaoPublica: 35, valorTotalRs: 32290, vidaUtilAnos: 25,
      geracaoMensalKwhOverride: 2152, anoInicial: 2026, tipoSistema: 'on_grid' as const,
    };
    const sem = calcular(base);
    const com = calcular({ ...base, consumoRemotoMensalKwh: 900 });
    expect(com.economiaVidaUtil).toBeGreaterThan(sem.economiaVidaUtil);
    const paybackSem = sem.paybackAnos * 12 + sem.paybackMeses;
    const paybackCom = com.paybackAnos * 12 + com.paybackMeses;
    expect(paybackCom).toBeLessThan(paybackSem);
    // fluxo do ano 1 inclui a economia remota (×12)
    expect(com.fluxoCaixaAnual[1]).toBeCloseTo(sem.fluxoCaixaAnual[1] + 783 * 12, -1);
  });

  it('sistema justo (geração ≤ consumo): números idênticos ao modelo antigo, créditos zero', () => {
    const c = calcularContaMensalDetalhada({
      consumoKwh: 1200, geracaoKwh: 1000, tarifaRsKwh: 1.05, tusdFioBRsKwh: 0.30,
      percentualFioBVigente: 0.60, percentualGeracaoInjetada: 0.75,
      custoIluminacaoPublica: 35, tipoSistema: 'on_grid',
    });
    // igual ao print da Opção B: fioB 135 + não coberto 200×1,05 + CIP 35 → economia 915
    expect(c.fioB).toBeCloseTo(1000 * 0.75 * 0.30 * 0.60);
    expect(c.consumoRede).toBeCloseTo(200 * 1.05);
    expect(c.creditosKwh).toBeCloseTo(0);
    expect(c.total).toBeCloseTo(135 + 210 + 35);
  });
});

describe('calcular() — Fio B crescente ano a ano na projeção', () => {
  it('a conta com sistema sobe nos anos seguintes (Fio B 60%→100%)', () => {
    // sem reajuste de energia: a única coisa que muda é o % do Fio B.
    const r = calcular(baseInput());
    // ano 1 = 2026 (60%): injetado 375 × 0,30 × 0,60 = 67,5/mês → 810/ano
    expect(r.contaComSistemaAnual[0]).toBeCloseTo(810, 1);
    // ano 4 = 2029 (100%): 375 × 0,30 × 1,00 = 112,5/mês → 1350/ano
    expect(r.contaComSistemaAnual[3]).toBeCloseTo(1350, 1);
    expect(r.contaComSistemaAnual[3]).toBeGreaterThan(r.contaComSistemaAnual[0]);
  });

  it('o headline (mês 1) usa o % vigente do ano inicial', () => {
    const r = calcular(baseInput());
    expect(r.contaComSistemaMensal).toBeCloseTo(67.5, 1);
  });

  it('payback sai do MESMO fluxo de caixa (com ramp), coerente com ROI/economia', () => {
    // sem reajuste: a economia CAI ano a ano só por causa do Fio B subindo.
    // consumo=geracao -> contaSem=6000/ano; fioB sobe 810→1350; econ cai 5190→4650.
    const r = calcular(baseInput({ valorTotalRs: 15000, vidaUtilAnos: 25 }));
    const fluxo = r.contaSemSistemaAnual.map((s, i) => s - r.contaComSistemaAnual[i]); // econ por ano
    // GROUND TRUTH: o investimento só é coberto DENTRO do ano 4 (3 anos cheios = 14.962,50 < 15.000).
    expect(fluxo.slice(0, 3).reduce((a, b) => a + b, 0)).toBeLessThan(15000);
    expect(fluxo.slice(0, 4).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(15000);
    // O payback tem que refletir isso: 3 anos cheios + fração. O cálculo INGÊNUO
    // (economia do ano 1 constante) daria 2 anos — subestimando.
    expect(r.paybackAnos).toBe(3);
  });
});

describe('calcular() — breakdown detalhado exposto pro template', () => {
  it('expõe contaComDetalhada com Fio B/consumo/CIP do mês 1', () => {
    const r = calcular(baseInput({ custoIluminacaoPublica: 30 }));
    expect(r.contaComDetalhada.injetadoKwh).toBeCloseTo(375, 1);
    expect(r.contaComDetalhada.autoconsumoKwh).toBeCloseTo(125, 1);
    expect(r.contaComDetalhada.fioB).toBeCloseTo(67.5, 1);
    expect(r.contaComDetalhada.cip).toBe(30);
    expect(r.contaComDetalhada.total).toBeCloseTo(97.5, 1);
  });

  it('expõe o tipo de sistema, a simultaneidade usada e o ano inicial', () => {
    const r = calcular(baseInput());
    expect(r.tipoSistema).toBe('on_grid');
    expect(r.percentualGeracaoInjetadaUsado).toBeCloseTo(0.75);
    expect(r.anoInicial).toBe(2026);
  });

  it('monta as 2 tabelinhas da ilustração (simultaneidade + Fio B por ano)', () => {
    const r = calcular(baseInput());
    expect(r.tabelaSimultaneidade).toHaveLength(3);
    expect(r.tabelaSimultaneidade[0].fioB).toBeGreaterThan(r.tabelaSimultaneidade[2].fioB);
    expect(r.tabelaFioBAnos.map(l => l.ano)).toContain(2029);
    expect(r.tabelaFioBAnos[r.tabelaFioBAnos.length - 1].percentualFioB).toBeCloseTo(1.0);
  });

  it('off-grid: tabelinhas vazias (não há Fio B pra ilustrar)', () => {
    const r = calcular(baseInput({ tipoSistema: 'off_grid' }));
    expect(r.tabelaSimultaneidade).toEqual([]);
    expect(r.tabelaFioBAnos).toEqual([]);
  });
});

describe('calcular() — off-grid sai da conta de luz', () => {
  it('conta com sistema = 0 e economia = a conta inteira', () => {
    const r = calcular(baseInput({ tipoSistema: 'off_grid', custoIluminacaoPublica: 40 }));
    expect(r.contaComSistemaMensal).toBe(0);
    expect(r.economiaMensal).toBeCloseTo(r.contaSemSistemaMensal, 5);
    expect(r.contaComSistemaAnual.every(v => v === 0)).toBe(true);
    expect(r.contaComDetalhada.total).toBe(0);
  });
});

describe('calcular() — simultaneidade sugerida por perfil quando não há override', () => {
  it('residencial injeta mais que indústria → paga mais Fio B', () => {
    const res = calcular(baseInput({ percentualGeracaoInjetada: undefined, perfilCliente: 'residencial' }));
    const ind = calcular(baseInput({ percentualGeracaoInjetada: undefined, perfilCliente: 'industrial' }));
    expect(res.percentualGeracaoInjetadaUsado).toBeGreaterThan(ind.percentualGeracaoInjetadaUsado);
    expect(res.contaComSistemaMensal).toBeGreaterThan(ind.contaComSistemaMensal);
  });

  it('override explícito de simultaneidade vence a sugestão', () => {
    const r = calcular(baseInput({ percentualGeracaoInjetada: 0.50, perfilCliente: 'residencial' }));
    expect(r.percentualGeracaoInjetadaUsado).toBeCloseTo(0.50);
  });
});

describe('classificadores de dados da proposta', () => {
  it('tipoSistemaDeDados: bateria presente → híbrido', () => {
    expect(tipoSistemaDeDados({ temBateria: true })).toBe('hibrido');
    expect(tipoSistemaDeDados({ tipoCliente: 'residencial híbrido' })).toBe('hibrido');
  });
  it('tipoSistemaDeDados: off-grid/isolado → off_grid', () => {
    expect(tipoSistemaDeDados({ tipoCliente: 'off-grid' })).toBe('off_grid');
    expect(tipoSistemaDeDados({ modalidade: 'sistema isolado' })).toBe('off_grid');
    expect(tipoSistemaDeDados({ tipoCliente: 'offgrid rural' })).toBe('off_grid');
  });
  it('tipoSistemaDeDados: default on_grid', () => {
    expect(tipoSistemaDeDados({ tipoCliente: 'residencial' })).toBe('on_grid');
    expect(tipoSistemaDeDados({})).toBe('on_grid');
  });

  it('perfilDeTipoCliente: mapeia indústria/rural/comércio/residencial', () => {
    expect(perfilDeTipoCliente('industrial')).toBe('industrial');
    expect(perfilDeTipoCliente('indústria')).toBe('industrial');
    expect(perfilDeTipoCliente('fazenda agro')).toBe('rural');
    expect(perfilDeTipoCliente('comércio')).toBe('comercial');
    expect(perfilDeTipoCliente('residencial')).toBe('residencial');
    expect(perfilDeTipoCliente(undefined)).toBe('residencial');
  });

  it('temCarregadorNosServicos: detecta carregador/wallbox/EV', () => {
    expect(temCarregadorNosServicos([{ titulo: 'Carregador EV', descricao: '' }])).toBe(true);
    expect(temCarregadorNosServicos([{ titulo: 'Wallbox 7,4 kW', descricao: '' }])).toBe(true);
    expect(temCarregadorNosServicos([{ titulo: 'Adequação de padrão', descricao: 'troca' }])).toBe(false);
    expect(temCarregadorNosServicos(undefined)).toBe(false);
    expect(temCarregadorNosServicos([])).toBe(false);
  });
});

describe('tabelaSimultaneidade — quanto mais usa de dia, menos paga Fio B', () => {
  const p = {
    consumoKwh: 500, geracaoKwh: 500, tarifaRsKwh: 1.0,
    tusdFioBRsKwh: 0.30, custoIluminacaoPublica: 0,
    tipoSistema: 'on_grid' as const, percentualFioBVigente: 0.60,
  };
  it('mais autoconsumo → menos Fio B (monotônico decrescente)', () => {
    const t = tabelaSimultaneidade(p);
    expect(t.map(r => r.autoconsumoPct)).toEqual([0.10, 0.25, 0.50]);
    // autoconsumo 10% → injeta 90% (450) → 450×0,30×0,60 = 81
    expect(t[0].fioB).toBeCloseTo(81, 1);
    // autoconsumo 50% → injeta 50% (250) → 250×0,30×0,60 = 45
    expect(t[2].fioB).toBeCloseTo(45, 1);
    expect(t[0].fioB).toBeGreaterThan(t[1].fioB);
    expect(t[1].fioB).toBeGreaterThan(t[2].fioB);
  });
});

describe('tabelaFioBPorAno — o Fio B sobe com os anos', () => {
  const p = {
    consumoKwh: 500, geracaoKwh: 500, tarifaRsKwh: 1.0,
    tusdFioBRsKwh: 0.30, custoIluminacaoPublica: 0,
    tipoSistema: 'on_grid' as const, percentualGeracaoInjetada: 0.75,
  };
  it('mesma simultaneidade, % do Fio B crescente ano a ano', () => {
    const t = tabelaFioBPorAno(p, [2026, 2027, 2029]);
    expect(t.map(r => r.ano)).toEqual([2026, 2027, 2029]);
    expect(t[0].percentualFioB).toBeCloseTo(0.60);
    expect(t[2].percentualFioB).toBeCloseTo(1.00);
    // 2026: 375×0,30×0,60 = 67,5 ; 2029: 375×0,30×1,0 = 112,5
    expect(t[0].fioB).toBeCloseTo(67.5, 1);
    expect(t[2].fioB).toBeCloseTo(112.5, 1);
    expect(t[2].fioB).toBeGreaterThan(t[0].fioB);
  });
});
