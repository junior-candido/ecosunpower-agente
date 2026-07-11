import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fake do query builder do Supabase: cada metodo de chain (eq, lte, limit, ...)
// retorna o proprio builder (chainable) e registra a chamada num log global pra
// asserção; o builder e "thenable" — resolve pro resultado configurado por
// tabela em qualquer ponto da chain, igual o client real do supabase-js.
type CallLog = { table: string; method: string; args: any[] };

let fromResults: Record<string, { data: any; error: any }> = {};
let callLog: CallLog[] = [];

function makeBuilder(table: string, result: { data: any; error: any } | undefined) {
  const methods = [
    'select', 'eq', 'lte', 'lt', 'gt', 'in', 'order', 'limit',
    'update', 'upsert', 'insert', 'maybeSingle', 'single',
  ];
  const resolved = result ?? { data: null, error: null };
  const builder: any = {};
  for (const m of methods) {
    builder[m] = vi.fn((...args: any[]) => {
      callLog.push({ table, method: m, args });
      return builder;
    });
  }
  builder.then = (resolve: any, reject: any) => Promise.resolve(resolved).then(resolve, reject);
  builder.catch = (reject: any) => Promise.resolve(resolved).catch(reject);
  return builder;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => makeBuilder(table, fromResults[table])),
  })),
}));

describe('SupabaseService — metodos da sequencia de e-mail', () => {
  beforeEach(() => {
    fromResults = {};
    callLog = [];
    vi.resetModules();
  });

  it('lockEmailForSending retorna true quando update-select retorna uma linha, aplicando os filtros CAS', async () => {
    fromResults['email_sequencia'] = { data: [{ id: 'es-1' }], error: null };
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const sb = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });

    const ok = await sb.lockEmailForSending('es-1');

    expect(ok).toBe(true);

    const updateCall = callLog.find((c) => c.table === 'email_sequencia' && c.method === 'update');
    expect(updateCall?.args[0]).toEqual({ status: 'sending' });

    const eqCalls = callLog.filter((c) => c.table === 'email_sequencia' && c.method === 'eq');
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ args: ['id', 'es-1'] }),
        expect.objectContaining({ args: ['status', 'pending'] }),
      ]),
    );
  });

  it('lockEmailForSending retorna false quando nao ha linha pendente pra travar', async () => {
    fromResults['email_sequencia'] = { data: [], error: null };
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const sb = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });

    const ok = await sb.lockEmailForSending('es-2');

    expect(ok).toBe(false);
  });

  it('lockEmailForSending retorna false quando o client devolve erro', async () => {
    fromResults['email_sequencia'] = { data: null, error: { message: 'boom' } };
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const sb = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });

    const ok = await sb.lockEmailForSending('es-3');

    expect(ok).toBe(false);
  });

  it('isEmailDescadastrado retorna true quando existe registro pro e-mail', async () => {
    fromResults['email_descadastro'] = { data: [{ email: 'a@b.com' }], error: null };
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const sb = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });

    const result = await sb.isEmailDescadastrado('A@B.com');

    expect(result).toBe(true);
    const eqCall = callLog.find((c) => c.table === 'email_descadastro' && c.method === 'eq');
    expect(eqCall?.args).toEqual(['email', 'a@b.com']); // normaliza pra lowercase
  });

  it('isEmailDescadastrado retorna false quando nao ha registro', async () => {
    fromResults['email_descadastro'] = { data: [], error: null };
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const sb = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });

    const result = await sb.isEmailDescadastrado('nao@existe.com');

    expect(result).toBe(false);
  });

  it('scheduleEmailSequence monta 6 linhas com steps 1..6 pro lead, via upsert idempotente', async () => {
    fromResults['email_sequencia'] = { data: null, error: null };
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const sb = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });

    await sb.scheduleEmailSequence('lead-1');

    const upsertCall = callLog.find((c) => c.table === 'email_sequencia' && c.method === 'upsert');
    expect(upsertCall).toBeDefined();

    const rows = upsertCall!.args[0];
    expect(rows).toHaveLength(6);
    expect(rows.map((r: any) => r.step)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows.every((r: any) => r.lead_id === 'lead-1' && r.status === 'pending')).toBe(true);
    expect(rows.every((r: any) => typeof r.scheduled_for === 'string')).toBe(true);

    expect(upsertCall!.args[1]).toEqual({ onConflict: 'lead_id,step', ignoreDuplicates: true });
  });
});
