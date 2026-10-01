// 02/10/2026 — Calibração automática (orientação/inclinação pela curva real).
import { describe, it, expect, vi } from 'vitest';
import { montarPremissas } from '../src/modules/monitoring/previsto/premissas.js';
import { calibrarUsinas } from '../src/modules/monitoring/previsto/rotina-calibracao.js';
import { renderPrevistoBody, rosaCalibracao } from '../src/modules/dashboard/previsto-views.js';

const USINA = {
  id: 's1', company_id: 'c1', potencia_kwp: 10, lat: -15.8, lng: -47.9, marca_inversor: 'goodwe',
  telhado_tipo: 'ceramica', telhado_orientacao: null as string | null, telhado_inclinacao_graus: null as number | null, sombreamento_pct: 0,
};

describe('premissas com calibração', () => {
  it('cadastro vazio + calibração alta → usa a curva e marca "calibrado"', () => {
    const p = montarPremissas(USINA, { azimute: 90, inclinacao: 20, confianca: 'alta' });
    expect(p).toMatchObject({ azimute: 90, inclinacao: 20, estimados: [], calibrados: ['orientação', 'inclinação'] });
  });
  it('calibração média/baixa não substitui (segue estimado)', () => {
    const p = montarPremissas(USINA, { azimute: 90, inclinacao: 20, confianca: 'media' });
    expect(p).toMatchObject({ azimute: 0, inclinacao: 15 });
    expect('calibrados' in p && p.calibrados).toBeFalsy();
  });
  it('cadastro manda; curva muito diferente vira aviso de divergência', () => {
    const p = montarPremissas({ ...USINA, telhado_orientacao: 'N', telhado_inclinacao_graus: 10 }, { azimute: 270, inclinacao: 20, confianca: 'alta' });
    expect(p).toMatchObject({ azimute: 0, inclinacao: 10, divergencia: { cadastro: 0, curva: 270 } });
  });
});

// Banco falso encadeável: qualquer cadeia de .eq/.order/... termina num thenable com os dados da tabela.
function bancoFalso(tabelas: Record<string, unknown[]>) {
  const gravados: Record<string, unknown>[] = [];
  const cadeia = (dados: unknown[]): unknown => new Proxy({}, {
    get: (_t, k) => {
      if (k === 'then') return (ok: (v: unknown) => unknown) => ok({ data: dados, error: null });
      if (k === 'range') return (a: number, b: number) => cadeia(dados.slice(a, b + 1));
      return () => cadeia(dados);
    },
  });
  const db = {
    from: (t: string) => ({
      select: () => cadeia(tabelas[t] ?? []),
      upsert: async (row: Record<string, unknown>) => { gravados.push({ tabela: t, ...row }); return { error: null }; },
    }),
  };
  return { db: db as never, gravados };
}

const motorOk = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
  azimute: 90, inclinacao: 20, fator: 0.87, erro_forma: 0.05, erro_referencia: 0.2, confianca: 'alta',
  dias_usados: 3, horas_usadas: 30, mapa: [], versao_modelo: 'calib-1',
}), { status: 200 }));
const curva = Array.from({ length: 24 }, (_, h) => (h >= 7 && h <= 17 ? 3 : 0));

describe('rotina de calibração', () => {
  const base = { motor: { url: 'http://m', fetchImpl: motorOk }, empresaTemModulo: async () => true, pausa: async () => {}, log: () => {} };

  it('calibra com dias limpos + curva do portal e grava status ok', async () => {
    const { db, gravados } = bancoFalso({
      sistemas_clientes: [USINA],
      previsto_calibracao: [],
      geracao_esperada: [{ data: '2026-09-29', indice_ceu: 0.9 }, { data: '2026-09-28', indice_ceu: 0.85 }, { data: '2026-09-27', indice_ceu: 0.8 }],
    });
    const buscar = vi.fn().mockResolvedValue(curva);
    const r = await calibrarUsinas(db, { ...base, buscarCurva: buscar });
    expect(r).toMatchObject({ tentadas: 1, ok: 1, calibradas: ['s1'] });
    expect(buscar).toHaveBeenCalledTimes(3);
    expect(gravados[0]).toMatchObject({ tabela: 'previsto_calibracao', sistema_id: 's1', company_id: 'c1', status: 'ok', azimute: 90 });
  });

  it('poucos dias limpos → grava "sem_dias_limpos" e não chama o portal', async () => {
    const { db, gravados } = bancoFalso({ sistemas_clientes: [USINA], previsto_calibracao: [], geracao_esperada: [{ data: '2026-09-29', indice_ceu: 0.9 }] });
    const buscar = vi.fn();
    const r = await calibrarUsinas(db, { ...base, buscarCurva: buscar });
    expect(r.semDias).toBe(1);
    expect(buscar).not.toHaveBeenCalled();
    expect(gravados[0].status).toBe('sem_dias_limpos');
  });

  it('portal sem curva → "sem_curva"; calibrada há pouco → nem entra na fila', async () => {
    const recente = new Date().toISOString();
    const { db } = bancoFalso({
      sistemas_clientes: [USINA, { ...USINA, id: 's2' }],
      previsto_calibracao: [{ sistema_id: 's2', status: 'ok', calculado_em: recente }],
      geracao_esperada: [{ data: '2026-09-29', indice_ceu: 0.9 }, { data: '2026-09-28', indice_ceu: 0.9 }],
    });
    const r = await calibrarUsinas(db, { ...base, buscarCurva: async () => null });
    expect(r).toMatchObject({ tentadas: 1, semCurva: 1, ok: 0 });
  });

  it('empresa sem o módulo não é calibrada', async () => {
    const { db } = bancoFalso({ sistemas_clientes: [USINA], previsto_calibracao: [], geracao_esperada: [] });
    const r = await calibrarUsinas(db, { ...base, empresaTemModulo: async () => false, buscarCurva: async () => curva });
    expect(r.tentadas).toBe(0);
  });
});

describe('tela: calibração', () => {
  const mapa = Array.from({ length: 24 }, (_, k) => ({ azimute: k * 15, inclinacao: 20, erro: Math.abs(((k * 15 - 90 + 540) % 360) - 180) / 1000 + 0.05 }));
  const cal = { azimute: 90, inclinacao: 20, fator: 0.87, confianca: 'alta' as const, dias_usados: 3, calculado_em: '2026-10-02T04:00:00Z', mapa };
  it('rosa dos ventos com a seta na melhor direção', () => {
    const svg = rosaCalibracao(cal);
    expect(svg).toContain('<polygon');
    expect(svg).toContain('>L<');
  });
  it('caixa mostra telhado descoberto, "rende X%" e confiança', () => {
    const h = renderPrevistoBody({
      sistemaId: 's1', nome: 'X', kwp: 10, local: 'DF', reais: {}, calibracao: cal,
      previstos: [{ data: '2026-09-30', kwh_previsto: 40, kwh_hora: Array(24).fill(0), irradiacao_kwh_m2: 6, indice_ceu: 0.9, clima: 'limpo',
        premissas: { kwp: 10, azimute: 90, inclinacao: 20, estimados: [], calibrados: ['orientação'] } }],
    });
    expect(h).toContain('Calibração automática — o que a curva real revelou');
    expect(h).toContain('Rende <b>87%</b>');
    expect(h).toContain('DESCOBERTO PELA CURVA');
    expect(h).toContain('Leste');
  });
});
