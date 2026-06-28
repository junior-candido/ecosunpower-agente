import { describe, it, expect } from 'vitest';
import { agruparAgenda, type TarefaAgenda } from '../src/modules/dashboard/pos-venda-agenda.js';

const HOJE = new Date('2026-06-28T12:00:00Z');
const t = (id: string, dueAt: string | null): TarefaAgenda => ({ id, leadId: 'l' + id, nomeCliente: 'Cliente ' + id, titulo: 'Ligar', dueAt });

describe('agruparAgenda', () => {
  it('separa atrasados, hoje e próximos 7 dias', () => {
    const r = agruparAgenda([
      t('a', '2026-06-20T00:00:00Z'), // atrasado
      t('b', '2026-06-28T09:00:00Z'), // hoje
      t('c', '2026-07-02T00:00:00Z'), // dentro de 7 dias
    ], HOJE);
    expect(r.atrasados.map((x) => x.id)).toEqual(['a']);
    expect(r.hoje.map((x) => x.id)).toEqual(['b']);
    expect(r.semana.map((x) => x.id)).toEqual(['c']);
  });
  it('tarefa sem data entra em "próximos" sem urgência', () => {
    const r = agruparAgenda([t('z', null)], HOJE);
    expect(r.semana.map((x) => x.id)).toEqual(['z']);
  });
  it('tarefa além de 7 dias fica fora da janela', () => {
    const r = agruparAgenda([t('f', '2026-07-20T00:00:00Z')], HOJE);
    expect(r.atrasados).toHaveLength(0);
    expect(r.hoje).toHaveLength(0);
    expect(r.semana).toHaveLength(0);
  });
  it('ordena cada grupo por data crescente', () => {
    const r = agruparAgenda([t('a2', '2026-06-15T00:00:00Z'), t('a1', '2026-06-10T00:00:00Z')], HOJE);
    expect(r.atrasados.map((x) => x.id)).toEqual(['a1', 'a2']);
  });
});
