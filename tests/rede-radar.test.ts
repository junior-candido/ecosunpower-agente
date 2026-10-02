// 02/10/2026 — Radar da Rede: cor do alfinete = qualidade da tensão (7 dias).
import { describe, it, expect } from 'vitest';
import { aplicarCamadaRede } from '../src/modules/monitoring/rede/camada-mapa.js';

const pino = (id: string) => ({ id, nome: id, cliente: null, cidade: 'Planaltina', uf: 'DF', kwp: 10, estado: 'normal' as const, alerta: null,
  hojeKwh: 30, mesKwh: 300, pctEsperado: 95, ultimaComunicacao: null, marca: null, lat: -15.6, lng: -47.6, aproximada: false, fonte: null, href: `/dashboard/monitoramento/${id}` });
const base = { geradoEm: '', total: 3, porEstado: { normal: 3, atencao: 0, critico: 0, sem_comunicacao: 0, sem_monitoramento: 0 },
  porEstadoNoMapa: { normal: 3, atencao: 0, critico: 0, sem_comunicacao: 0, sem_monitoramento: 0 }, usinas: [pino('a'), pino('b'), pino('c')],
  semPosicao: 0, semPosicaoNomes: [], migracaoPendente: false };
const r = (id: string, dia: string, nivel: 'ok' | 'atencao' | 'critico', v: number, desarmes = 0, acima = 0) =>
  ({ sistema_id: id, dia, v_max: v, min_critica: nivel === 'critico' ? 30 : 0, min_acima_desarme: acima, desarmes, nivel });

describe('Radar da Rede', () => {
  const d = aplicarCamadaRede(base, [r('a', '2026-09-30', 'ok', 229), r('a', '2026-10-01', 'critico', 246, 2, 45), r('b', '2026-10-01', 'atencao', 240)]);
  it('cor = pior dia; sem medição = cinza (nunca verde)', () => {
    expect(d.usinas.map((u) => u.estado)).toEqual(['critico', 'atencao', 'sem_monitoramento']);
    expect(d.usinas[2].alerta).toContain('Sem medição de tensão');
    expect(d.porEstadoNoMapa).toMatchObject({ critico: 1, atencao: 1, sem_monitoramento: 1 });
  });
  it('alfinete leva para a aba Rede e ranking põe o pior primeiro', () => {
    expect(d.usinas[0].href).toBe('/dashboard/monitoramento/a/rede');
    expect(d.ranking.map((x) => x.id)).toEqual(['a', 'b']);
    expect(d.ranking[0]).toMatchObject({ desarmes: 2, minAcima: 45, vMax: 246, diasCriticos: 1, dias: 2 });
  });
});
