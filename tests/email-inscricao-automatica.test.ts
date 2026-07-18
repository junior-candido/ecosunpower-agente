import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mesmo fake de query builder chainable de tests/email-supabase-methods.test.ts:
// cada metodo de chain retorna o proprio builder e resolve pro resultado
// configurado por tabela (nao aplica filtro de verdade — quem garante a
// elegibilidade final e o codigo em JS, testado abaixo linha a linha).
type CallLog = { table: string; method: string; args: any[] };

let fromResults: Record<string, { data: any; error: any }> = {};
let callLog: CallLog[] = [];

function makeBuilder(table: string, result: { data: any; error: any } | undefined) {
  const methods = [
    'select', 'eq', 'neq', 'lte', 'lt', 'gt', 'in', 'not', 'is', 'or', 'order', 'limit',
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

describe('SupabaseService.inscreverLeadsElegiveisEmail', () => {
  beforeEach(() => {
    fromResults = {};
    callLog = [];
    vi.resetModules();
  });

  it('inscreve so o lead aberto e elegivel, excluindo cliente/sem-email/ja-inscrito/descadastrado', async () => {
    fromResults['leads'] = {
      data: [
        // A: lead aberto, com e-mail — deve ENTRAR
        { id: 'A', email: 'a@x.com', status: 'novo', installation_status: null, archived_at: null, email_opt_out: false },
        // B: ja virou cliente (installation_status em CLIENTE_STATUSES) — NAO entra
        { id: 'B', email: 'b@x.com', status: 'novo', installation_status: 'operando', archived_at: null, email_opt_out: false },
        // C: sem e-mail — NAO entra
        { id: 'C', email: null, status: 'novo', installation_status: null, archived_at: null, email_opt_out: false },
        // D: ja inscrito na sequencia — NAO entra (dedup contra email_sequencia)
        { id: 'D', email: 'd@x.com', status: 'novo', installation_status: null, archived_at: null, email_opt_out: false },
        // E: descadastrado (email_descadastro) — NAO entra
        { id: 'E', email: 'e@x.com', status: 'novo', installation_status: null, archived_at: null, email_opt_out: false },
      ],
      error: null,
    };
    fromResults['email_sequencia'] = { data: [{ lead_id: 'D' }], error: null };
    fromResults['email_descadastro'] = { data: [{ email: 'e@x.com' }], error: null };

    const { SupabaseService } = await import('../src/modules/supabase.js');
    const sb = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });

    const n = await sb.inscreverLeadsElegiveisEmail();

    expect(n).toBe(1);

    const upsertCalls = callLog.filter((c) => c.table === 'email_sequencia' && c.method === 'upsert');
    expect(upsertCalls).toHaveLength(1);
    const rows = upsertCalls[0].args[0];
    expect(rows.every((r: any) => r.lead_id === 'A')).toBe(true);
  });

  it('nao explode e continua o sweep quando um lead falha ao agendar (try/catch por lead)', async () => {
    fromResults['leads'] = {
      data: [
        { id: 'A', email: 'a@x.com', status: 'novo', installation_status: null, archived_at: null, email_opt_out: false },
        { id: 'F', email: 'f@x.com', status: 'novo', installation_status: null, archived_at: null, email_opt_out: false },
      ],
      error: null,
    };
    fromResults['email_sequencia'] = { data: [], error: null };
    fromResults['email_descadastro'] = { data: [], error: null };

    const { SupabaseService } = await import('../src/modules/supabase.js');
    const sb = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });

    const original = sb.scheduleEmailSequence.bind(sb);
    let calls = 0;
    vi.spyOn(sb, 'scheduleEmailSequence').mockImplementation(async (leadId: string) => {
      calls++;
      if (leadId === 'A') throw new Error('boom');
      return original(leadId);
    });

    const n = await sb.inscreverLeadsElegiveisEmail();

    expect(calls).toBe(2);
    expect(n).toBe(1);
  });

  it('respeita o teto max de inscricoes por chamada', async () => {
    fromResults['leads'] = {
      data: [
        { id: 'A', email: 'a@x.com', status: 'novo', installation_status: null, archived_at: null, email_opt_out: false },
        { id: 'B', email: 'b@x.com', status: 'novo', installation_status: null, archived_at: null, email_opt_out: false },
        { id: 'C', email: 'c@x.com', status: 'novo', installation_status: null, archived_at: null, email_opt_out: false },
      ],
      error: null,
    };
    fromResults['email_sequencia'] = { data: [], error: null };
    fromResults['email_descadastro'] = { data: [], error: null };

    const { SupabaseService } = await import('../src/modules/supabase.js');
    const sb = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });

    const n = await sb.inscreverLeadsElegiveisEmail(2);

    expect(n).toBe(2);
  });

  it('retorna 0 sem quebrar quando a busca de leads falha', async () => {
    fromResults['leads'] = { data: null, error: { message: 'boom' } };

    const { SupabaseService } = await import('../src/modules/supabase.js');
    const sb = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });

    const n = await sb.inscreverLeadsElegiveisEmail();

    expect(n).toBe(0);
  });
});
