// 2ª trava — na volta, os disparos que ficaram na fila são reagendados de
// onde pararam, com espaçamento. Só PENDENTES e só da empresa certa.
import { describe, it, expect } from 'vitest';
import { bancoFalso } from './helpers/banco-falso.js';
import { reagendarDisparosDaEmpresa, FILAS_DE_DISPARO } from '../src/modules/cobranca-recorrente/disparos-repo.js';

const T = 'aaaa1111-2222-3333-4444-555566667777';
const OUTRA = 'bbbb1111-2222-3333-4444-555566667777';
const desde = '2026-10-17T12:00:00.000Z';
const agora = '2026-10-27T12:00:00.000Z';

describe('reagendarDisparosDaEmpresa', () => {
  it('anda o tempo parado, só pendentes da empresa; outra empresa e enviados não mudam', async () => {
    const b = bancoFalso({
      eva_cadence: [
        { id: 'c1', company_id: T, status: 'pending', scheduled_for: '2026-10-18T12:00:00.000Z' },
        { id: 'c2', company_id: T, status: 'sent', scheduled_for: '2026-10-18T12:00:00.000Z' },
        { id: 'c3', company_id: OUTRA, status: 'pending', scheduled_for: '2026-10-18T12:00:00.000Z' },
      ],
      proposta_followup_vivo: [{ id: 'f1', company_id: T, status: 'pending', scheduled_for: '2026-10-19T12:00:00.000Z' }],
      maintenance_reminders: [{ id: 'm1', company_id: T, status: 'pending', scheduled_date: '2026-10-20' }],
    });
    const n = await reagendarDisparosDaEmpresa(b.client, T, desde, agora);
    expect(n).toBe(3);
    const t = b.tabelas;
    expect(t.eva_cadence.find((r) => r.id === 'c1')!.scheduled_for).toBe('2026-10-28T12:00:00.000Z');
    expect(t.eva_cadence.find((r) => r.id === 'c2')!.scheduled_for).toBe('2026-10-18T12:00:00.000Z');
    expect(t.eva_cadence.find((r) => r.id === 'c3')!.scheduled_for).toBe('2026-10-18T12:00:00.000Z');
    expect(t.proposta_followup_vivo[0]!.scheduled_for).toBe('2026-10-29T12:00:00.000Z');
    expect(t.maintenance_reminders[0]!.scheduled_date).toBe('2026-10-30');
  });
  it('as filas cobertas (nova fila de disparo entra aqui)', () => {
    expect(FILAS_DE_DISPARO.map((f) => f.tabela)).toEqual(['eva_cadence', 'eva_intro_pending', 'proposta_followup_vivo', 'post_install_touches', 'reengagement_touches', 'email_sequencia', 'maintenance_reminders']);
  });
});
