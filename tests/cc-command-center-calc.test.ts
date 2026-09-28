// Cálculo PURO do Command Center (fase B): janelas de Brasília, estado de cada
// usina (mesma régua do Monitoramento), resumo da frota e "o que mudou desde ontem".
import { describe, it, expect } from 'vitest';
import {
  janelaBrasilia, somarDias, estadoDaUsina, resumirFrota, mudancasDesdeOntem, energiaLegivel,
  type UsinaLinha, type GeracaoLinha,
} from '../src/modules/dashboard/command-center-calc.js';

// 27/09/2026 14:42Z = 11:42 em Brasília
const AGORA = new Date('2026-09-27T14:42:00Z');

describe('janelaBrasilia', () => {
  it('datas pelo relógio de Brasília', () => {
    expect(janelaBrasilia(AGORA)).toMatchObject({
      hoje: '2026-09-27', ontem: '2026-09-26', inicioMes: '2026-09-01', ha7: '2026-09-20', ha30: '2026-08-28',
    });
  });
  it('30/09 às 22h em Brasília (01/10 01:00Z) ainda é setembro', () => {
    const j = janelaBrasilia(new Date('2026-10-01T01:00:00Z'));
    expect(j.hoje).toBe('2026-09-30');
    expect(j.inicioMes).toBe('2026-09-01');
  });
  it('virada de ano: 31/12 23h fica em dezembro', () => {
    const j = janelaBrasilia(new Date('2027-01-01T02:00:00Z'));
    expect(j).toMatchObject({ hoje: '2026-12-31', inicioMes: '2026-12-01' });
  });
  it('somarDias atravessa mês e ano', () => {
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
  });
});

const base: UsinaLinha = {
  id: 's1', apelido: 'Chácara VP', potencia_kwp: 10, cidade: 'Vicente Pires', uf: 'DF', ativo: true,
  ultima_sincronizacao: '2026-09-27T14:30:00Z', ultimo_erro: null, status_inversor: 'ok', acompanhamento: 'api',
};
const opts = { agoraMs: AGORA.getTime(), corteAtencao: 0.7, medianaCarteira7d: null };

describe('estadoDaUsina', () => {
  it('gerando dentro do esperado → normal', () => {
    // esperado/dia = 10 × 5,2 × 0,8 = 41,6 → 7 dias = 291
    expect(estadoDaUsina(base, { real7Kwh: 290, hojeKwh: 20 }, opts).estado).toBe('normal');
  });
  it('bem abaixo do esperado → atenção (mesma régua do Monitoramento)', () => {
    const r = estadoDaUsina(base, { real7Kwh: 100, hojeKwh: 10 }, opts);
    expect(r.estado).toBe('atencao');
    expect(r.alertaTexto).toContain('ABAIXO do esperado');
  });
  it('sem gerar há 7 dias mas comunicando → crítico', () => {
    expect(estadoDaUsina(base, { real7Kwh: 0, hojeKwh: null }, opts).estado).toBe('critico');
  });
  it('estreou/voltou hoje (7 dias zerados, hoje > 0) não é parada', () => {
    expect(estadoDaUsina(base, { real7Kwh: 0, hojeKwh: 5 }, opts).estado).not.toBe('critico');
  });
  it('erro de integração → sem comunicação', () => {
    const r = estadoDaUsina({ ...base, ultimo_erro: 'token expirado' }, { real7Kwh: 290, hojeKwh: 1 }, opts);
    expect(r.estado).toBe('sem_comunicacao');
    expect(r.alertaTexto).toContain('token expirado');
  });
  it('sem sincronizar há mais de 24 h → sem comunicação', () => {
    const r = estadoDaUsina({ ...base, ultima_sincronizacao: '2026-09-25T10:00:00Z' }, { real7Kwh: 290, hojeKwh: null }, opts);
    expect(r.estado).toBe('sem_comunicacao');
    expect(r.alertaTexto).toContain('há 2 dias');
  });
  it('nunca sincronizou → sem comunicação', () => {
    expect(estadoDaUsina({ ...base, ultima_sincronizacao: null }, { real7Kwh: 0, hojeKwh: null }, opts).estado).toBe('sem_comunicacao');
  });
  it('inversor "offline" à noite mas gerando nos últimos dias NÃO é sem comunicação', () => {
    expect(estadoDaUsina({ ...base, status_inversor: 'offline' }, { real7Kwh: 290, hojeKwh: null }, opts).estado).toBe('normal');
  });
  it('parada com inversor offline → sem comunicação', () => {
    expect(estadoDaUsina({ ...base, status_inversor: 'offline' }, { real7Kwh: 0, hojeKwh: null }, opts).estado).toBe('sem_comunicacao');
  });
  it('acompanhamento manual → sem monitoramento (fica fora das contas de comunicação)', () => {
    expect(estadoDaUsina({ ...base, acompanhamento: 'manual' }, { real7Kwh: 0, hojeKwh: null }, opts).estado).toBe('sem_monitoramento');
  });
});

function ger(sistema: string, data: string, kwh: number | string): GeracaoLinha {
  return { sistema_id: sistema, data, geracao_kwh: kwh };
}

describe('resumirFrota', () => {
  const usinas: UsinaLinha[] = [
    base,
    { ...base, id: 's2', apelido: 'Casa Gama', potencia_kwp: 5, cidade: 'Gama', ultimo_erro: 'caiu' },
    { ...base, id: 's3', apelido: 'Sítio', potencia_kwp: null, cidade: null, acompanhamento: 'manual' },
    { ...base, id: 's4', apelido: 'Inativa', ativo: false },
  ];
  const geracoes: GeracaoLinha[] = [
    // s1: 7 dias bons (41 kWh/dia) + hoje 20 + dia 1º do mês
    ...['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'].map((d) => ger('s1', d, 41)),
    ger('s1', '2026-09-27', '20'),
    ger('s1', '2026-09-01', 40),
    ger('s1', '2026-08-30', 39), // mês passado: entra na curva, não no mês
    ger('s2', '2026-09-26', 10),
    ger('s4', '2026-09-26', 999), // inativa: ignorada
    ger('zz', '2026-09-26', 999), // usina de fora da lista: ignorada
  ];
  const tel = [
    { sistema_id: 's1', device_key: 'inv1', valor: 3.2, ts: '2026-09-27T14:35:00Z' },
    { sistema_id: 's1', device_key: 'inv1', valor: 2.9, ts: '2026-09-27T14:20:00Z' }, // mais velho do mesmo inversor
    { sistema_id: 's1', device_key: 'inv2', valor: 1.1, ts: '2026-09-27T14:30:00Z' },
    { sistema_id: 's2', device_key: 'x', valor: 9, ts: '2026-09-27T13:00:00Z' },       // velho demais (> 30 min)
  ];
  const r = resumirFrota(usinas, geracoes, tel, { agora: AGORA, corteAtencao: 0.7 });

  it('conta só usinas ativas; potência soma quem tem kWp', () => {
    expect(r.total).toBe(3);
    expect(r.potenciaKwp).toBe(15);
  });
  it('estados', () => {
    expect(r.porEstado).toEqual({ normal: 1, atencao: 0, critico: 0, sem_comunicacao: 1, sem_monitoramento: 1 });
    expect(r.monitoradas).toBe(2);
    expect(r.comunicando).toBe(1);
  });
  it('energia hoje e do mês (Brasília), só de usinas ativas da lista', () => {
    expect(r.energiaHojeKwh).toBe(20);
    expect(r.usinasComDadoHoje).toBe(1);
    expect(r.energiaMesKwh).toBe(41 * 7 + 20 + 40 + 10);
  });
  it('geração agora: último valor de cada inversor nos últimos 30 min', () => {
    expect(r.geracaoAgora).toEqual({ kw: 4.3, usinas: 1 });
  });
  it('curva: 30 dias até ontem; esperada das mesmas usinas que mandaram dado no dia', () => {
    expect(r.curva).toHaveLength(30);
    expect(r.curva[0].data).toBe('2026-08-28');
    expect(r.curva[29].data).toBe('2026-09-26');
    const ontem = r.curva[29];
    expect(ontem.realKwh).toBe(51);
    expect(ontem.esperadoKwh).toBeCloseTo(41.6 + 20.8);
    const semDado = r.curva.find((d) => d.data === '2026-09-10')!;
    expect(semDado).toEqual({ data: '2026-09-10', realKwh: null, esperadoKwh: null });
  });
  it('usina SEM kWp mandou dado no dia → real aparece, esperada não (não compara pela metade)', () => {
    const v = resumirFrota(
      [base, { ...base, id: 'nk', potencia_kwp: null }],
      [ger('s1', '2026-09-26', 41), ger('nk', '2026-09-26', 7), ger('s1', '2026-09-25', 40)],
      [], { agora: AGORA, corteAtencao: 0.7 },
    );
    expect(v.curva[29]).toEqual({ data: '2026-09-26', realKwh: 48, esperadoKwh: null });
    expect(v.curva[28]).toEqual({ data: '2026-09-25', realKwh: 40, esperadoKwh: 41.6 });
  });
  it('por cidade, pior estado primeiro', () => {
    expect(r.porCidade[0]).toEqual({ cidade: 'Gama', total: 1, pior: 'sem_comunicacao' });
    expect(r.porCidade.map((c) => c.cidade)).toContain('Sem cidade');
  });
  it('sem dado nenhum → null (nunca 0 inventado)', () => {
    const v = resumirFrota([base], [], [], { agora: AGORA, corteAtencao: 0.7 });
    expect(v.energiaHojeKwh).toBeNull();
    expect(v.energiaMesKwh).toBeNull();
    expect(v.geracaoAgora).toBeNull();
    const nada = resumirFrota([], [], [], { agora: AGORA, corteAtencao: 0.7 });
    expect(nada.potenciaKwp).toBeNull();
    expect(nada.total).toBe(0);
  });
});

describe('mudancasDesdeOntem', () => {
  it('só entra chip com número real e maior que zero', () => {
    const r = mudancasDesdeOntem({ leads: 14, propostas: 0, vendas: 2, geracaoOntemPct: 96 });
    expect(r.semDado).toBe(false);
    expect(r.chips.map((c) => c.texto)).toEqual(['+14 leads novos', '2 vendas fechadas', 'Ontem: 96% do esperado']);
    expect(r.chips.find((c) => c.texto.startsWith('2 vendas'))?.tom).toBe('ok');
  });
  it('geração bem abaixo → chip de alerta', () => {
    expect(mudancasDesdeOntem({ leads: null, propostas: null, vendas: null, geracaoOntemPct: 71 }).chips[0].tom).toBe('warn');
  });
  it('singular', () => {
    expect(mudancasDesdeOntem({ leads: 1, propostas: 1, vendas: 1, geracaoOntemPct: null }).chips.map((c) => c.texto))
      .toEqual(['+1 lead novo', '1 proposta feita', '1 venda fechada']);
  });
  it('tudo zero = nada de novo; tudo null = sem dado', () => {
    expect(mudancasDesdeOntem({ leads: 0, propostas: 0, vendas: 0, geracaoOntemPct: null })).toEqual({ chips: [], semDado: false });
    expect(mudancasDesdeOntem({ leads: null, propostas: null, vendas: null, geracaoOntemPct: null })).toEqual({ chips: [], semDado: true });
  });
});

describe('energiaLegivel', () => {
  it('kWh até 999, MWh a partir de 1.000', () => {
    expect(energiaLegivel(812.4)).toEqual({ valor: 812, unidade: 'kWh', casas: 0 });
    expect(energiaLegivel(4120)).toEqual({ valor: 4.12, unidade: 'MWh', casas: 2 });
    expect(energiaLegivel(186400)).toEqual({ valor: 186.4, unidade: 'MWh', casas: 1 });
    expect(energiaLegivel(null)).toEqual({ valor: null, unidade: 'kWh', casas: 0 });
  });
});
