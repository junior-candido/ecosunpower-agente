import { describe, it, expect } from 'vitest';
import { formatAlertMessage } from '../src/modules/monitoring/proactive-alerts/format.js';

const sistema = { id: 'sistema-uuid-1234', apelido: 'Casa do Henrique', potencia_kwp: 8.2, marca_inversor: 'Deye' };
const alerta = { tipo: 'sistema_offline', texto: 'Sem geração há 2 dias' } as any;

describe('formatAlertMessage — usina órfã (lead null)', () => {
  it('mostra aviso de SEM dono e botões de cadastro', () => {
    const out = formatAlertMessage(alerta, sistema, null);
    expect(out.texto).toContain('SEM dono vinculado');
    const ids = out.botoes.map((b) => b.id);
    expect(ids).toContain(`evabt:dono-cad:${sistema.id}`);
    expect(ids).toContain(`evabt:alert-ver:${sistema.id}`);
    expect(ids.some((i) => i.includes('snooze'))).toBe(false);
    expect(ids.some((i) => i.includes('eva-offline'))).toBe(false);
    expect(out.botoes.length).toBeLessThanOrEqual(3);
  });

  it('usina COM dono mantém comportamento atual (sem botão de cadastro)', () => {
    const lead = { id: 'lead-1', name: 'Henrique Souza', phone: '5561999990000' };
    const out = formatAlertMessage(alerta, sistema, lead);
    const ids = out.botoes.map((b) => b.id);
    expect(ids).toContain(`evabt:alert-eva-offline:${sistema.id}`);
    expect(ids.some((i) => i.startsWith('evabt:dono-cad'))).toBe(false);
    expect(out.texto).toContain('Henrique Souza');
  });
});
