// tests/proactive-alerts-detect.test.ts
import { describe, it, expect } from 'vitest';
import { detectarAlertasPendentes } from '../src/modules/monitoring/proactive-alerts/detect.js';
import type { MonitoringAlertRow, SistemaParaDetect } from '../src/modules/monitoring/proactive-alerts/types.js';

const hoje = new Date('2026-05-20T12:00:00Z');

function sistema(o: Partial<SistemaParaDetect> = {}): SistemaParaDetect {
  return {
    id: 'sid-1',
    lead_id: 'lid-1',
    ativo: true,
    ultimo_erro: null,
    potencia_kwp: 5,
    uf: 'DF',
    diasSemGeracao: 0,
    realUltimos7: 5 * 5.2 * 0.80 * 7, // exato esperado (ratio=1)
    ...o,
  };
}
function aberto(o: Partial<MonitoringAlertRow> = {}): MonitoringAlertRow {
  return {
    id: 'aid-1',
    sistema_id: 'sid-1',
    tipo: 'queda_geracao',
    severidade: 'aviso',
    texto: '...',
    primeiro_visto_em: '2026-05-15T00:00:00Z',
    last_sent_at: '2026-05-15T00:00:00Z',
    next_send_at: '2026-05-18T00:00:00Z', // já no passado em 2026-05-20
    snoozed_until: null,
    resolved_at: null,
    resolved_reason: null,
    acao_disparada: null,
    acao_disparada_em: null,
    created_at: '2026-05-15T00:00:00Z',
    ...o,
  };
}

describe('detectarAlertasPendentes', () => {
  it('sistema OK + sem aberto -> nada', () => {
    const r = detectarAlertasPendentes([sistema()], [], hoje);
    expect(r.novos).toEqual([]);
    expect(r.resolvidos).toEqual([]);
    expect(r.persistentes_devidos).toEqual([]);
  });

  it('sistema OK + aberto do mesmo tipo -> resolvido', () => {
    const r = detectarAlertasPendentes([sistema()], [aberto()], hoje);
    expect(r.resolvidos).toEqual(['aid-1']);
    expect(r.novos).toEqual([]);
  });

  // Régua relativa (29/07): a mediana da carteira chega até o classificador
  // — usina saudável em julho nublado não pode virar alerta novo no zap.
  it('mediana da carteira repassada: queda pela régua HSP mas saudável vs carteira -> nada', () => {
    const s = sistema({
      realUltimos7: 5 * 5.2 * 0.80 * 7 * 0.5, // 50% do esperado HSP -> quedaria
      medianaCarteira7d: (5 * 5.2 * 0.80 * 7 * 0.5) / 5, // = exatamente a mediana -> ok
    });
    const r = detectarAlertasPendentes([s], [], hoje);
    expect(r.novos).toEqual([]);
  });

  it('sistema com queda + sem aberto -> novo', () => {
    const s = sistema({ realUltimos7: 5 * 5.2 * 0.80 * 7 * 0.5 }); // 50% do esperado -> queda
    const r = detectarAlertasPendentes([s], [], hoje);
    expect(r.novos).toHaveLength(1);
    expect(r.novos[0].sistema_id).toBe('sid-1');
    expect(r.novos[0].alerta.tipo).toBe('queda_geracao');
  });

  it('queda + aberto com next_send_at futuro -> nada', () => {
    const s = sistema({ realUltimos7: 5 * 5.2 * 0.80 * 7 * 0.5 });
    const a = aberto({ next_send_at: '2026-05-25T00:00:00Z' });
    const r = detectarAlertasPendentes([s], [a], hoje);
    expect(r.persistentes_devidos).toEqual([]);
    expect(r.novos).toEqual([]);
    expect(r.resolvidos).toEqual([]);
  });

  it('queda + aberto com next_send_at passado -> persistente_devido', () => {
    const s = sistema({ realUltimos7: 5 * 5.2 * 0.80 * 7 * 0.5 });
    const r = detectarAlertasPendentes([s], [aberto()], hoje);
    expect(r.persistentes_devidos).toEqual(['aid-1']);
  });

  it('queda + aberto snoozed (futuro) -> nada', () => {
    const s = sistema({ realUltimos7: 5 * 5.2 * 0.80 * 7 * 0.5 });
    const a = aberto({ snoozed_until: '2026-05-25T00:00:00Z' });
    const r = detectarAlertasPendentes([s], [a], hoje);
    expect(r.persistentes_devidos).toEqual([]);
  });

  it('sistema ativo=false -> nada', () => {
    const r = detectarAlertasPendentes([sistema({ ativo: false })], [], hoje);
    expect(r.novos).toEqual([]);
  });

  it('transição queda -> offline: resolve queda + cria offline', () => {
    const s = sistema({ diasSemGeracao: 5, realUltimos7: 0 });
    const r = detectarAlertasPendentes([s], [aberto({ tipo: 'queda_geracao' })], hoje);
    expect(r.resolvidos).toEqual(['aid-1']);
    expect(r.novos).toHaveLength(1);
    expect(r.novos[0].alerta.tipo).toBe('sistema_offline');
  });

  it('múltiplos sistemas independentes', () => {
    const s1 = sistema({ id: 'sid-1', diasSemGeracao: 5, realUltimos7: 0 });
    const s2 = sistema({ id: 'sid-2', lead_id: 'lid-2' });
    const r = detectarAlertasPendentes([s1, s2], [], hoje);
    expect(r.novos).toHaveLength(1);
    expect(r.novos[0].sistema_id).toBe('sid-1');
  });
});
