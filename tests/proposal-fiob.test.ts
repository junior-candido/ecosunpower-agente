import { describe, it, expect } from 'vitest';
import {
  percentualFioBPorAno,
  percentualInjetadoSugerido,
  calcularContaMensalDetalhada,
  calcular,
  tipoSistemaDeDados,
  perfilDeTipoCliente,
  temCarregadorNosServicos,
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
