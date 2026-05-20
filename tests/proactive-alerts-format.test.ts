// tests/proactive-alerts-format.test.ts
import { describe, it, expect } from 'vitest';
import { formatAlertMessage } from '../src/modules/monitoring/proactive-alerts/format.js';
import type { MonitoringAlertRow } from '../src/modules/monitoring/proactive-alerts/types.js';

function alertaBase(o: Partial<MonitoringAlertRow> = {}): MonitoringAlertRow {
  return {
    id: 'aid-1',
    sistema_id: 'sid-1',
    tipo: 'sistema_offline',
    severidade: 'urgente',
    texto: 'Sem geração há 5 dias. Verificar inversor / conexão WiFi.',
    primeiro_visto_em: '2026-05-20T08:00:00Z',
    last_sent_at: null,
    next_send_at: '2026-05-20T08:00:00Z',
    snoozed_until: null,
    resolved_at: null,
    resolved_reason: null,
    acao_disparada: null,
    acao_disparada_em: null,
    created_at: '2026-05-20T08:00:00Z',
    ...o,
  };
}

const sistema = {
  id: 'sid-1',
  apelido: 'Casa Silva',
  potencia_kwp: 5.5,
  marca_inversor: 'deye' as const,
};
const lead = { id: 'lid-1', name: 'João Silva', phone: '5561999990000' };

describe('formatAlertMessage', () => {
  it('sistema_offline: emoji 🔴, nome, kWp, marca, botões eva-offline / ligar / snooze3d', () => {
    const r = formatAlertMessage(alertaBase({ tipo: 'sistema_offline' }), sistema, lead);
    expect(r.texto).toContain('🔴 OFFLINE');
    expect(r.texto).toContain('João Silva');
    expect(r.texto).toContain('5.5 kWp');
    expect(r.texto).toContain('deye');
    expect(r.botoes.map((b) => b.id)).toEqual([
      'evabt:alert-eva-offline:sid-1',
      'evabt:alert-ligar:sid-1',
      'evabt:alert-snooze3d:sid-1',
    ]);
  });

  it('queda_geracao: emoji 🟡 + botões eva-limpeza / ligar / snooze3d', () => {
    const r = formatAlertMessage(alertaBase({
      tipo: 'queda_geracao',
      severidade: 'aviso',
      texto: 'Geração últimos 7 dias 35% ABAIXO do esperado.',
    }), sistema, lead);
    expect(r.texto).toContain('🟡 QUEDA');
    expect(r.botoes[0].id).toBe('evabt:alert-eva-limpeza:sid-1');
    expect(r.botoes[1].id).toBe('evabt:alert-ligar:sid-1');
    expect(r.botoes[2].id).toBe('evabt:alert-snooze3d:sid-1');
  });

  it('erro_integracao: emoji 🔴 INTEGRAÇÃO + botões ver / snooze3d / resolvido', () => {
    const r = formatAlertMessage(alertaBase({
      tipo: 'erro_integracao',
      severidade: 'urgente',
      texto: 'Erro de integração: token Deye expirado',
    }), sistema, lead);
    expect(r.texto).toContain('🔴 INTEGRAÇÃO');
    expect(r.botoes.map((b) => b.id)).toEqual([
      'evabt:alert-ver:sid-1',
      'evabt:alert-snooze3d:sid-1',
      'evabt:alert-resolvido:sid-1',
    ]);
  });

  it('milestone_economia: emoji 🟢 + botões depoimento / snooze7d / ignorar', () => {
    const r = formatAlertMessage(alertaBase({
      tipo: 'milestone_economia',
      severidade: 'info',
      texto: 'Geração últimos 7 dias 15% ACIMA do esperado.',
    }), sistema, lead);
    expect(r.texto).toContain('🟢 BOMBANDO');
    expect(r.botoes.map((b) => b.id)).toEqual([
      'evabt:alert-eva-depoimento:sid-1',
      'evabt:alert-snooze7d:sid-1',
      'evabt:alert-ignorar:sid-1',
    ]);
  });

  it('lead null (sistema sem vínculo): usa apelido como nome', () => {
    const r = formatAlertMessage(alertaBase({ tipo: 'queda_geracao' }), sistema, null);
    expect(r.texto).toContain('Casa Silva');
  });

  it('cliente sem nome no lead: fallback "Cliente sem nome cadastrado"', () => {
    const r = formatAlertMessage(alertaBase(), sistema, { id: 'lid-1', name: null, phone: '5561999990000' });
    expect(r.texto).toContain('Cliente sem nome cadastrado');
  });

  it('todos os botões cabem em 20 chars (limite WABA)', () => {
    const tipos: Array<MonitoringAlertRow['tipo']> = [
      'sistema_offline', 'queda_geracao', 'erro_integracao', 'milestone_economia',
    ];
    for (const tipo of tipos) {
      const r = formatAlertMessage(alertaBase({ tipo }), sistema, lead);
      for (const b of r.botoes) {
        expect(b.title.length, `botão "${b.title}" tem ${b.title.length} chars`).toBeLessThanOrEqual(20);
      }
    }
  });
});
