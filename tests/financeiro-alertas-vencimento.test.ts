import { describe, it, expect } from 'vitest';
import { alertasDoDia, escalonarDas } from '../src/modules/financeiro/alertas-vencimento.js';

const contas = [
  // 'a' já tem um lembrete de atraso registrado em 04/09 (simula "já avisado hoje, não repete" — mesma regra do teste de dedupe abaixo).
  { id: 'a', descricao: 'LATAM', valor: 7739, vencimento: '2026-09-01', mundo: 'PF' as const, lembretes: [{ tipo: 'atraso', em: '2026-09-04' }] as Array<{tipo:string; em:string}> },
  { id: 'b', descricao: 'Sicoob cartão', valor: 6453.46, vencimento: '2026-09-07', mundo: 'PJ' as const, lembretes: [] },
  { id: 'c', descricao: 'DAS 08/2026', valor: 900, vencimento: '2026-09-20', mundo: 'PJ' as const, lembretes: [] },
];
describe('alertasDoDia', () => {
  it('3 dias antes avisa uma vez', () => { expect(alertasDoDia(contas, '2026-09-04').map((x) => [x.contaId, x.tipo])).toEqual([['b', '3d']]); });
  it('no dia avisa', () => { expect(alertasDoDia(contas, '2026-09-01').map((x) => x.tipo)).toEqual(['hoje']); });
  it('atrasada avisa todo dia até pagar', () => { expect(alertasDoDia(contas, '2026-09-03')[0]).toMatchObject({ contaId: 'a', tipo: 'atraso', dias: 2 }); });
  it('lembrete já enviado no dia não repete', () => {
    const c = [{ ...contas[1], lembretes: [{ tipo: '3d', em: '2026-09-04' }] }];
    expect(alertasDoDia(c, '2026-09-04')).toEqual([]);
  });
});
describe('escalonarDas', () => {
  it('dia 12, 18, 20 e depois todo dia', () => {
    expect(escalonarDas('2026-09-12', '2026-09-20')).toBe('previa');
    expect(escalonarDas('2026-09-18', '2026-09-20')).toBe('faltam2');
    expect(escalonarDas('2026-09-20', '2026-09-20')).toBe('hoje');
    expect(escalonarDas('2026-09-25', '2026-09-20')).toBe('atraso');
    expect(escalonarDas('2026-09-15', '2026-09-20')).toBeNull();
  });
});
