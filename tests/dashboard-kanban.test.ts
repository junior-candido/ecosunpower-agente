import { describe, it, expect } from 'vitest';
import { agruparLeadsPorEtapa } from '../src/modules/dashboard/leads-queries.js';

describe('agruparLeadsPorEtapa', () => {
  it('agrupa por status na ordem das etapas e ignora perdido', () => {
    const leads = [
      { id: '1', status: 'novo' }, { id: '2', status: 'proposta_enviada' },
      { id: '3', status: 'novo' }, { id: '4', status: 'perdido' },
    ];
    const g = agruparLeadsPorEtapa(leads as any);
    expect(g.novo.map((l: any) => l.id)).toEqual(['1', '3']);
    expect(g.proposta_enviada.map((l: any) => l.id)).toEqual(['2']);
    expect(g.perdido).toBeUndefined(); // perdido não é coluna do kanban
    expect(Object.keys(g)).toEqual(['novo','qualificando','qualificado','proposta_enviada','negociacao','agendado','transferido','ganho']);
  });
});
