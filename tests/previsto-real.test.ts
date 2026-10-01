// 01/10/2026 — Previsto × Real (Energy Studio, Marco 1).
import { describe, it, expect, vi } from 'vitest';
import { azimuteDeOrientacao, montarPremissas, tipoInstalacao } from '../src/modules/monitoring/previsto/premissas.js';
import { situacaoDoDia, diferencaPct, precisaAlertar, desvioPeriodo } from '../src/modules/monitoring/previsto/situacao.js';
import { previstoDoDia, configMotorDoAmbiente } from '../src/modules/monitoring/previsto/motor-cliente.js';
import { calcularPrevistos, ultimosDias } from '../src/modules/monitoring/previsto/rotina.js';

const USINA = {
  id: 's1', company_id: 'c1', potencia_kwp: '10.65', lat: -15.83, lng: -47.97,
  telhado_tipo: 'ceramica', telhado_orientacao: 'N', telhado_inclinacao_graus: 15, sombreamento_pct: 5,
};

describe('premissas da usina', () => {
  it('letras do telhado viram graus (L = leste, O = oeste)', () => {
    expect(['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'].map(azimuteDeOrientacao)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
    expect(azimuteDeOrientacao('x')).toBeNull();
    expect(azimuteDeOrientacao(null)).toBeNull();
  });
  it('tipo de telhado → montagem do motor', () => {
    expect(tipoInstalacao('laje')).toBe('laje');
    expect(tipoInstalacao('solo')).toBe('solo');
    expect(tipoInstalacao('ceramica')).toBe('telhado_ventilado');
  });
  it('cadastro completo: nada estimado, sombra em fração', () => {
    const p = montarPremissas(USINA);
    expect(p).toMatchObject({ kwp: 10.65, azimute: 0, inclinacao: 15, sombreamento: 0.05, estimados: [] });
  });
  it('sem orientação/inclinação: Norte 15° e avisa "estimado"', () => {
    const p = montarPremissas({ ...USINA, telhado_orientacao: null, telhado_inclinacao_graus: null });
    expect(p).toMatchObject({ azimute: 0, inclinacao: 15 });
    expect('estimados' in p && p.estimados.length).toBe(2);
  });
  it('sem posição ou sem kWp: não calcula (nunca chuta)', () => {
    expect(montarPremissas({ ...USINA, lat: null })).toEqual({ erro: 'sem_posicao' });
    expect(montarPremissas({ ...USINA, potencia_kwp: 0 })).toEqual({ erro: 'sem_kwp' });
  });
});

describe('situação do dia', () => {
  it('faixas: normal / abaixo / muito abaixo', () => {
    expect(situacaoDoDia({ previsto: 40, real: 38, clima: 'limpo' })).toBe('normal');
    expect(situacaoDoDia({ previsto: 40, real: 34, clima: 'limpo' })).toBe('abaixo');
    expect(situacaoDoDia({ previsto: 40, real: 28, clima: 'parcial' })).toBe('muito_abaixo');
  });
  it('sem leitura = sem comunicação (não é defeito); sem previsto = sem previsto', () => {
    expect(situacaoDoDia({ previsto: 40, real: null, clima: 'limpo' })).toBe('sem_comunicacao');
    expect(situacaoDoDia({ previsto: null, real: 30, clima: null })).toBe('sem_previsto');
  });
  it('dia de chuva nunca vira "muito abaixo" (rebaixa um degrau)', () => {
    expect(situacaoDoDia({ previsto: 12, real: 11.5, clima: 'chuva' })).toBe('dia_fraco');
    expect(situacaoDoDia({ previsto: 12, real: 10, clima: 'nublado' })).toBe('dia_fraco');
    expect(situacaoDoDia({ previsto: 12, real: 6, clima: 'chuva' })).toBe('abaixo');
  });
  it('diferença % e desvio do período', () => {
    expect(diferencaPct(41, 38.2)).toBe(-6.8);
    expect(diferencaPct(0.2, 0.1)).toBeNull();
    expect(desvioPeriodo([{ previsto: 50, real: 45 }, { previsto: 50, real: null }, { previsto: 50, real: 50 }])).toBe(-5);
  });
  it('alerta só com 2 dias seguidos muito abaixo', () => {
    expect(precisaAlertar(['normal', 'muito_abaixo'])).toBe(false);
    expect(precisaAlertar(['muito_abaixo', 'sem_comunicacao', 'muito_abaixo'])).toBe(false);
    expect(precisaAlertar(['normal', 'muito_abaixo', 'muito_abaixo'])).toBe(true);
  });
});

describe('cliente do motor', () => {
  const resp = { data: '2026-09-30', kwh: 48.31, kwh_hora: Array(24).fill(2), ghi_kwh_m2: 6.3, poa_kwh_m2: 6.4, indice_ceu: 0.83, clima: 'limpo', horas_sem_dado: 0, fonte_clima: 'open-meteo:forecast', versao_modelo: 'dia-1' };
  it('manda premissas + data com o token e devolve o previsto', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(resp), { status: 200 }));
    const p = montarPremissas(USINA);
    if ('erro' in p) throw new Error('premissa');
    const r = await previstoDoDia({ url: 'http://motor:8000', token: 'T', fetchImpl: f }, p, '2026-09-30');
    expect(r.kwh).toBe(48.31);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('http://motor:8000/simular-dia');
    expect(init.headers.Authorization).toBe('Bearer T');
    expect(JSON.parse(init.body)).toMatchObject({ data: '2026-09-30', kwp: 10.65, azimute: 0, sombreamento: 0.05 });
  });
  it('erro do motor vira exceção com o motivo', async () => {
    const f = vi.fn().mockResolvedValue(new Response('token do motor inválido', { status: 401 }));
    const p = montarPremissas(USINA);
    if ('erro' in p) throw new Error('premissa');
    await expect(previstoDoDia({ url: 'http://m', fetchImpl: f }, p, '2026-09-30')).rejects.toThrow(/401/);
  });
  it('sem MOTOR_URL = recurso desligado', () => {
    expect(configMotorDoAmbiente({})).toBeNull();
    expect(configMotorDoAmbiente({ MOTOR_URL: 'http://m/', MOTOR_TOKEN: 'x' })).toEqual({ url: 'http://m', token: 'x' });
  });
});

describe('rotina diária', () => {
  function bancoFalso(usinas: unknown[]) {
    const gravados: Record<string, unknown>[] = [];
    const db = {
      from: (t: string) => t === 'sistemas_clientes'
        ? { select: () => ({ eq: () => ({ order: () => ({ range: async (a: number, b: number) => ({ data: usinas.slice(a, b + 1), error: null }) }) }) }) }
        : { upsert: async (row: Record<string, unknown>) => { gravados.push(row); return { error: null }; } },
    };
    return { db: db as never, gravados };
  }
  const motorOk = vi.fn().mockImplementation(async (_u: string, init: { body: string }) =>
    new Response(JSON.stringify({ data: JSON.parse(init.body).data, kwh: 40, kwh_hora: Array(24).fill(0), ghi_kwh_m2: 6, poa_kwh_m2: 6.1, indice_ceu: 0.8, clima: 'limpo', horas_sem_dado: 0, fonte_clima: 'open-meteo:forecast', versao_modelo: 'dia-1' }), { status: 200 }));

  it('só calcula empresa com o módulo; grava com company_id; conta quem não tem posição', async () => {
    const { db, gravados } = bancoFalso([
      USINA,
      { ...USINA, id: 's2', lat: null, lng: null },
      { ...USINA, id: 's3', company_id: 'c2' },
    ]);
    const r = await calcularPrevistos(db, ['2026-09-29', '2026-09-30'], {
      motor: { url: 'http://m', fetchImpl: motorOk },
      empresaTemModulo: async (cid) => cid === 'c1',
      log: () => {},
    });
    expect(r).toMatchObject({ usinas: 2, calculados: 2, semModulo: 1, falhas: 0 });
    expect(r.semPremissa.sem_posicao).toBe(1);
    expect(gravados.map((g) => [g.sistema_id, g.company_id, g.data])).toEqual(
      expect.arrayContaining([['s1', 'c1', '2026-09-29'], ['s1', 'c1', '2026-09-30']]));
    expect(gravados.some((g) => g.company_id === 'c2')).toBe(false);
  });

  it('falha do motor não derruba a rotina: conta e segue', async () => {
    const { db } = bancoFalso([USINA, { ...USINA, id: 's2' }]);
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('fora', { status: 502 }))
      .mockImplementation(motorOk);
    const r = await calcularPrevistos(db, ['2026-09-30'], {
      motor: { url: 'http://m', fetchImpl: f }, empresaTemModulo: async () => true, concorrencia: 1, log: () => {},
    });
    expect(r.falhas).toBe(1);
    expect(r.calculados).toBe(1);
    expect(r.primeiraFalha).toMatch(/502/);
  });

  it('motor fora do ar: disjuntor abre, rodada NÃO fica ok (repete depois)', async () => {
    const muitas = Array.from({ length: 30 }, (_, k) => ({ ...USINA, id: `s${k}` }));
    const { db } = bancoFalso(muitas);
    const f = vi.fn().mockResolvedValue(new Response('token do motor inválido', { status: 401 }));
    const r = await calcularPrevistos(db, ['2026-09-30'], {
      motor: { url: 'http://m', fetchImpl: f }, empresaTemModulo: async () => true, concorrencia: 1, log: () => {},
    });
    expect(r.falhas).toBe(15);
    expect(r.puladas).toBe(15);
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(15);
  });

  it('rodada boa fica ok; usina sem empresa é da casa', async () => {
    const { db, gravados } = bancoFalso([{ ...USINA, company_id: null }]);
    const r = await calcularPrevistos(db, ['2026-09-30'], {
      motor: { url: 'http://m', fetchImpl: motorOk },
      empresaTemModulo: async (cid) => cid === '00000000-0000-0000-0000-000000000001', log: () => {},
    });
    expect(r.ok).toBe(true);
    expect(gravados[0].company_id).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('ultimosDias em horário de Brasília (23h UTC-3 ainda é o mesmo dia)', () => {
    expect(ultimosDias(2, new Date('2026-10-02T02:30:00Z'))).toEqual(['2026-09-30', '2026-10-01']);
  });
});

describe('tela Previsto × Real', async () => {
  const { renderPrevistoBody, curvaPorHora, montarLinhas } = await import('../src/modules/dashboard/previsto-views.js');
  const dia = (data: string, kwh: number, clima = 'limpo') => ({
    data, kwh_previsto: kwh, kwh_hora: Array.from({ length: 24 }, (_, h) => (h >= 7 && h <= 17 ? kwh / 11 : 0)),
    irradiacao_kwh_m2: 6.3, indice_ceu: 0.83, clima: clima as never,
    premissas: { kwp: 10.65, inclinacao: 15, azimute: 0, sombreamento: 0, estimados: [] as string[] },
  });
  const base = {
    sistemaId: '11111111-1111-1111-1111-111111111111', nome: 'Usina <Chico>', kwp: 10.65, local: 'Guará · DF',
    previstos: [dia('2026-09-24', 52.4), dia('2026-09-25', 51.8), dia('2026-09-26', 41, 'parcial')],
    reais: { '2026-09-24': 39.1, '2026-09-26': 38.2 },
  };
  it('cartões do dia mais recente, diferença e situação', () => {
    const h = renderPrevistoBody(base);
    expect(h).toContain('38,2 kWh');
    expect(h).toContain('41,0 kWh');
    expect(h).toContain('−6,8%'.replace('−', '-'));
    expect(h).toContain('✅ Normal');
    expect(h).toContain('Usina &lt;Chico&gt;'); // escapado
  });
  it('dia sem leitura = sem comunicação; dia muito abaixo aparece na lista', () => {
    const l = montarLinhas(base);
    expect(l.map((x) => x.situacao)).toEqual(['muito_abaixo', 'sem_comunicacao', 'normal']);
    expect(renderPrevistoBody(base)).toContain('🔴 Muito abaixo');
  });
  it('sem previsto ainda: explica o que falta (posição e kWp)', () => {
    const h = renderPrevistoBody({ ...base, previstos: [] });
    expect(h).toContain('ainda não foi calculado');
    expect(h).toContain('posição no mapa');
  });
  it('cadastro estimado: avisa e leva para corrigir', () => {
    const p = dia('2026-09-26', 41);
    p.premissas.estimados = ['inclinação (15°)'];
    expect(renderPrevistoBody({ ...base, previstos: [p] })).toContain('Corrigir cadastro');
  });
  it('curva do inversor vira kWh por hora (média dos pontos de cada hora)', () => {
    const c = curvaPorHora([{ hora: '10:00', kw: 5 }, { hora: '10:30', kw: 7 }, { hora: '11:15', kw: 6 }]);
    expect(c?.[10]).toBe(6);
    expect(c?.[11]).toBe(6);
    expect(curvaPorHora([])).toBeNull();
  });
});
