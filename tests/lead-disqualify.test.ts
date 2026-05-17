import { describe, it, expect } from 'vitest';
import { buildDisqualifyPlan } from '../src/modules/lead-disqualify.js';

// Caso real: lead "Ivan Silva" — on-topic (conta de luz) mas inviavel
// (baixa renda / tarifa social / conta << R$700). Eva tem que encerrar com
// UMA mensagem digna + action terminal REAL que para a Eva de vez.
// Diferente de mark_off_topic (troll/numero errado) — Junior nao pode
// confundir lead vulneravel com troll no painel.
describe('buildDisqualifyPlan', () => {
  const now = new Date('2026-05-17T08:56:09.000Z');

  it('patch para a Eva de vez: eva_active=false + opt_out + status/contact_type distintos', () => {
    const { leadPatch } = buildDisqualifyPlan({
      reason: 'baixa renda / elegivel tarifa social, conta inviavel pra solar',
      leadName: 'Ivan Silva',
      phone: '5561999999999',
      now,
    });

    expect(leadPatch.eva_active).toBe(false); // gate index.ts:2299 para a Eva
    expect(leadPatch.opt_out).toBe(true); // fora de cadencia/reengajamento
    expect(leadPatch.status).toBe('descartado');
    expect(leadPatch.contact_type).toBe('inviavel'); // distingue de troll ('perdido')
    expect(leadPatch.updated_at).toBe('2026-05-17T08:56:09.000Z');
  });

  it('notificacao do Junior tem enquadramento CERTO (nao confunde com troll)', () => {
    const { notifyBody } = buildDisqualifyPlan({
      reason: 'tarifa social',
      leadName: 'Ivan Silva',
      phone: '5561999999999',
      now,
    });

    expect(notifyBody).toContain('Ivan Silva');
    expect(notifyBody).toContain('5561999999999');
    expect(notifyBody).toContain('tarifa social');
    expect(notifyBody.toLowerCase()).toContain('inviável');
    // NAO pode usar o texto do mark_off_topic (troll/numero errado)
    expect(notifyBody.toLowerCase()).not.toContain('fora de escopo');
    expect(notifyBody.toLowerCase()).not.toContain('fora do escopo');
  });

  it('degrada com graca: sem nome -> "Sem nome", sem quebrar', () => {
    const { notifyBody, leadPatch } = buildDisqualifyPlan({
      reason: 'conta < R$700',
      phone: '5561988887777',
      now,
    });
    expect(notifyBody).toContain('Sem nome');
    expect(leadPatch.eva_active).toBe(false);
  });
});
