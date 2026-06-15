// tests/resgatar-dados-input.test.ts
import { describe, it, expect, vi } from 'vitest';
import { resgatarDadosInput, contarPropostasSemDados } from '../src/modules/proposal/resgatar-dados-input.js';

// Query builder fake: todo método encadeável retorna o próprio objeto, que é
// "thenable" e resolve { data, count, error }.
function fakeQuery(rows: any[]) {
  const q: any = {
    from: () => q,
    select: () => q,
    eq: () => q,
    order: () => q,
    is: () => q,
    ilike: () => q,
    then: (resolve: (v: any) => void) => resolve({ data: rows, count: rows.length, error: null }),
  };
  return q;
}

const fakeSupabase = (rows: any[]): any => ({
  getClient: () => ({ from: () => fakeQuery(rows) }),
  updatePropostaPublica: vi.fn().mockResolvedValue(undefined),
});

const row = (over: Partial<any> = {}) => ({
  slug: 's1', numero_proposta: 'P-1', cliente_nome: 'Olavo', created_at: '2026-06-10T00:00:00Z', ...over,
});

const driveComJsonPara = (numerosComJson: string[]): any => ({
  fetchInputDataJson: vi.fn().mockImplementation(({ numeroProposta }: { numeroProposta: string }) =>
    numerosComJson.includes(numeroProposta)
      ? JSON.stringify({ data: { nomeCliente: 'Olavo Drumond', valorTotalRs: 38500 } })
      : null,
  ),
});

describe('resgatarDadosInput', () => {
  it('apply=true → grava só as que têm JSON no Drive, conta o resto como semJson', async () => {
    const rows = [row({ slug: 's1', numero_proposta: 'P-1' }), row({ slug: 's2', numero_proposta: 'P-2' })];
    const supabase = fakeSupabase(rows);
    const drive = driveComJsonPara(['P-1']); // só a P-1 tem backup

    const res = await resgatarDadosInput({ supabase, drive, apply: true });

    expect(res.candidatas).toBe(2);
    expect(res.resgatadas).toBe(1);
    expect(res.semJson).toBe(1);
    expect(res.falhas).toBe(0);
    expect(supabase.updatePropostaPublica).toHaveBeenCalledTimes(1);
    expect(supabase.updatePropostaPublica).toHaveBeenCalledWith('s1', expect.objectContaining({
      dadosInput: expect.objectContaining({ nomeCliente: 'Olavo Drumond' }),
    }));
  });

  it('dry-run (apply=false) → não grava nada, mas conta as resgatáveis', async () => {
    const rows = [row({ numero_proposta: 'P-1' })];
    const supabase = fakeSupabase(rows);
    const drive = driveComJsonPara(['P-1']);

    const res = await resgatarDadosInput({ supabase, drive, apply: false });

    expect(res.resgatadas).toBe(1);
    expect(supabase.updatePropostaPublica).not.toHaveBeenCalled();
  });

  it('tenta o ano vizinho quando não acha no ano do created_at', async () => {
    const rows = [row({ created_at: '2026-01-01T01:00:00Z' })];
    const supabase = fakeSupabase(rows);
    // só responde JSON quando ano = 2025 (virada de ano por fuso)
    const drive: any = {
      fetchInputDataJson: vi.fn().mockImplementation(({ ano }: { ano: string }) =>
        ano === '2025' ? JSON.stringify({ data: { nomeCliente: 'X', valorTotalRs: 1 } }) : null,
      ),
    };
    const res = await resgatarDadosInput({ supabase, drive, apply: false });
    expect(res.resgatadas).toBe(1);
    expect(drive.fetchInputDataJson).toHaveBeenCalled();
  });
});

describe('contarPropostasSemDados', () => {
  it('retorna o count do banco', async () => {
    const supabase = fakeSupabase([{}, {}, {}]);
    expect(await contarPropostasSemDados(supabase)).toBe(3);
  });
});
