// tests/assinaturas-motor.test.ts
// Motor de mensalidades — régua do Junior: 8d antes avisa com link, 2d antes
// lembra, venceu tem 3 dias de tolerância com último aviso, depois trava.
import { describe, it, expect } from 'vitest';
import { acaoDoDia, processarAssinaturas } from '../src/modules/assinaturas-motor.js';
import type { MotorDeps } from '../src/modules/assinaturas-motor.js';

describe('acaoDoDia (régua 8d / 2d / venceu+3d)', () => {
  const venceEm = '2026-08-20';
  const semAvisos = new Set<string>();
  it('longe do vencimento → nada', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-01', semAvisos)).toBeNull();
  });
  it('faltando 8 dias → aviso8 (gera link)', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-12', semAvisos)).toBe('aviso8');
  });
  it('cron perdeu o dia 8? faltando 5 ainda manda o aviso8 (janela, não data exata)', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-15', semAvisos)).toBe('aviso8');
  });
  it('aviso8 já enviado → não repete; faltando 2 dias → aviso2', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-15', new Set(['aviso8']))).toBeNull();
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-18', new Set(['aviso8']))).toBe('aviso2');
  });
  it('venceu (até 3 dias) → ultimo aviso, uma vez só', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-21', new Set(['aviso8', 'aviso2']))).toBe('ultimo');
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-23', new Set(['aviso8', 'aviso2', 'ultimo']))).toBeNull();
  });
  it('venceu + 4 dias → travar', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-24', new Set(['aviso8', 'aviso2', 'ultimo']))).toBe('travar');
  });
  it('travada/cancelada → motor não mexe', () => {
    expect(acaoDoDia({ status: 'travada', venceEm }, '2026-08-24', semAvisos)).toBeNull();
    expect(acaoDoDia({ status: 'cancelada', venceEm }, '2026-08-24', semAvisos)).toBeNull();
  });
});

function deps(over: Partial<MotorDeps> = {}) {
  const chamadas: Record<string, any[]> = { link: [], email: [], zap: [], junior: [], travadas: [], avisos: [] };
  const d: MotorDeps = {
    listarAtivas: async () => [],
    avisosDoCiclo: async () => new Set(),
    registrarAviso: async (id, tipo, ciclo) => { chamadas.avisos!.push([id, tipo, ciclo]); },
    linkDaCobranca: async (a) => { chamadas.link!.push(a.id); return 'https://checkout.infinitepay.io/x'; },
    travar: async (id) => { chamadas.travadas!.push(id); },
    enviarEmail: async (to, assunto) => { chamadas.email!.push([to, assunto]); },
    enviarZap: async (tel, texto) => { chamadas.zap!.push([tel, texto]); },
    avisarJunior: async (texto) => { chamadas.junior!.push(texto); },
    ...over,
  };
  return { d, chamadas };
}

const SABION = {
  id: 'a1', nome: 'Sabion', email: 't@x.com', telefone: '5521999998888',
  zapConfirmado: true, valorCentavos: 29700, venceEm: '2026-08-20',
  status: 'ativa' as const, produtoNome: 'Monitoramento', produtoId: 'monitoramento', limite: 110,
};

describe('processarAssinaturas', () => {
  it('aviso8: gera link, manda e-mail E zap (confirmado), registra o aviso', async () => {
    const { d, chamadas } = deps({ listarAtivas: async () => [SABION] });
    const r = await processarAssinaturas(d, '2026-08-12');
    expect(chamadas.link).toEqual(['a1']);
    expect(chamadas.email!.length).toBe(1);
    expect(chamadas.zap!.length).toBe(1);
    expect(chamadas.avisos).toEqual([['a1', 'aviso8', '2026-08-20']]);
    expect(r).toEqual({ avisos: 1, travadas: 0 });
  });
  it('zap NÃO confirmado → só e-mail', async () => {
    const { d, chamadas } = deps({ listarAtivas: async () => [{ ...SABION, zapConfirmado: false }] });
    await processarAssinaturas(d, '2026-08-12');
    expect(chamadas.email!.length).toBe(1);
    expect(chamadas.zap!.length).toBe(0);
  });
  it('venceu +4d: trava, registra e avisa o Junior', async () => {
    const { d, chamadas } = deps({
      listarAtivas: async () => [SABION],
      avisosDoCiclo: async () => new Set(['aviso8', 'aviso2', 'ultimo']),
    });
    const r = await processarAssinaturas(d, '2026-08-24');
    expect(chamadas.travadas).toEqual(['a1']);
    expect(chamadas.junior!.length).toBe(1);
    expect(chamadas.avisos).toEqual([['a1', 'travou', '2026-08-20']]);
    expect(r).toEqual({ avisos: 0, travadas: 1 });
  });
  it('erro numa assinatura não derruba as outras', async () => {
    const { d, chamadas } = deps({
      listarAtivas: async () => [{ ...SABION, id: 'quebra' }, SABION],
      linkDaCobranca: async (a) => { if (a.id === 'quebra') throw new Error('boom'); return 'https://x'; },
    });
    await processarAssinaturas(d, '2026-08-12');
    expect(chamadas.avisos!.some((x: any[]) => x[0] === 'a1')).toBe(true);
  });
});
