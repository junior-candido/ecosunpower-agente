// BSUID fase 1 no banco:
// - telefone vazio NUNCA vira/acha lead (antes: todo mundo sem telefone caia no
//   MESMO lead phone '' — vazamento LGPD).
// - backfill do wa_user_id no lead achado pelo telefone (best-effort).
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Chamada = { tabela: string; op: string; args: unknown[] };
let chamadas: Chamada[] = [];
let leadsExistentes: Record<string, unknown>[] = [];
let erroUpdate: { message: string } | null = null;
let porWaUserId: Record<string, unknown> | null = null;

function cadeia(tabela: string) {
  const reg = (op: string, ...args: unknown[]) => chamadas.push({ tabela, op, args });
  const q: Record<string, unknown> = {};
  const self = () => q;
  q.select = (...a: unknown[]) => { reg('select', ...a); return q; };
  q.in = (...a: unknown[]) => { reg('in', ...a); return q; };
  q.eq = (...a: unknown[]) => { reg('eq', ...a); return q; };
  q.order = (...a: unknown[]) => { reg('order', ...a); return q; };
  q.limit = async (...a: unknown[]) => { reg('limit', ...a); return { data: leadsExistentes, error: null }; };
  q.maybeSingle = async () => { reg('maybeSingle'); return { data: porWaUserId, error: null }; };
  q.single = async () => { reg('single'); return { data: { id: 'x' }, error: null }; };
  q.update = (...a: unknown[]) => {
    reg('update', ...a);
    const u: Record<string, unknown> = {};
    u.eq = (...b: unknown[]) => { reg('eq', ...b); return u; };
    u.then = (res: (v: unknown) => void) => res({ error: erroUpdate });
    return u;
  };
  q.upsert = (...a: unknown[]) => { reg('upsert', ...a); return q; };
  q.insert = (...a: unknown[]) => { reg('insert', ...a); return q; };
  void self;
  return q;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: (t: string) => cadeia(t) })),
}));

async function svc() {
  const { SupabaseService } = await import('../src/modules/supabase.js');
  return new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });
}

beforeEach(() => {
  chamadas = [];
  leadsExistentes = [];
  erroUpdate = null;
  porWaUserId = null;
});

describe('telefone vazio nunca vira lead', () => {
  it('getLeadByPhone("") → null sem consultar o banco', async () => {
    const s = await svc();
    expect(await s.getLeadByPhone('')).toBeNull();
    expect(await s.getLeadByPhone('   ')).toBeNull();
    expect(chamadas).toHaveLength(0);
  });

  it('upsertLead com phone vazio/em branco lanca e NAO grava', async () => {
    const s = await svc();
    await expect(s.upsertLead({ phone: '' })).rejects.toThrow(/telefone/i);
    await expect(s.upsertLead({ phone: '   ' })).rejects.toThrow(/telefone/i);
    await expect(s.upsertLead({ phone: 'BR.123' })).rejects.toThrow(/telefone/i);
    expect(chamadas.filter((c) => c.op === 'upsert' || c.op === 'update')).toHaveLength(0);
  });

  it('getOrCreateLeadByPhone com phone sem digitos lanca e NAO insere', async () => {
    const s = await svc();
    await expect(s.getOrCreateLeadByPhone('BR.123', 'Foo')).rejects.toThrow(/telefone/i);
    expect(chamadas.filter((c) => c.op === 'insert')).toHaveLength(0);
  });

  it('upsertLead com telefone normal segue igual (cria)', async () => {
    const s = await svc();
    const r = await s.upsertLead({ phone: '5561999999999', status: 'novo' });
    expect(r.id).toBe('x');
    expect(chamadas.some((c) => c.op === 'upsert')).toBe(true);
  });

  // Regressao: telefone FORMATADO (com +, espaco, parenteses, traco) e coisa
  // corriqueira (usuario digita, formulario formata) — tem que continuar
  // consultando/gravando igual ao telefone so-digitos.
  it('upsertLead/getLeadByPhone com telefone formatado ("+55 (61) 99999-9999") ainda consulta e grava', async () => {
    const s = await svc();
    expect(await s.getLeadByPhone('+55 (61) 99999-9999')).toBeNull(); // sem lead existente, mas CONSULTOU
    expect(chamadas.some((c) => c.op === 'in')).toBe(true);

    chamadas = [];
    const r = await s.upsertLead({ phone: '+55 (61) 99999-9999', status: 'novo' });
    expect(r.id).toBe('x');
    expect(chamadas.some((c) => c.op === 'upsert')).toBe(true);
  });

  // Documentado: JID do WhatsApp (com "@s.whatsapp.net") tem letra -> nao e
  // telefone utilizavel. getLeadByPhone nao pode casar isso com ninguem.
  it('getLeadByPhone com JID completo ("...@s.whatsapp.net") -> null sem consultar', async () => {
    const s = await svc();
    expect(await s.getLeadByPhone('5561999999999@s.whatsapp.net')).toBeNull();
    expect(chamadas).toHaveLength(0);
  });
});

describe('getLeadByWaUserId', () => {
  it('busca por empresa + wa_user_id', async () => {
    porWaUserId = { id: 'lead-9', phone: '5561999999999' };
    const s = await svc();
    const lead = await s.getLeadByWaUserId('empresa-1', 'BR.123');
    expect(lead?.id).toBe('lead-9');
    expect(chamadas).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'eq', args: ['company_id', 'empresa-1'] }),
      expect.objectContaining({ op: 'eq', args: ['wa_user_id', 'BR.123'] }),
    ]));
  });

  it('vazio → null sem consultar', async () => {
    const s = await svc();
    expect(await s.getLeadByWaUserId('empresa-1', '')).toBeNull();
    expect(await s.getLeadByWaUserId('', 'BR.1')).toBeNull();
    expect(chamadas).toHaveLength(0);
  });
});

describe('vincularWaUserId (backfill)', () => {
  const lead = (over: Record<string, unknown> = {}) => ({
    id: 'lead-1', phone: '5561999999999', company_id: 'empresa-1', wa_user_id: null, wa_username: null, ...over,
  });
  const updates = () => chamadas.filter((c) => c.op === 'update').map((c) => c.args[0]);

  it('lead sem wa_user_id → grava id e username, escopado por empresa', async () => {
    leadsExistentes = [lead()];
    const s = await svc();
    const r = await s.vincularWaUserId('5561999999999', 'empresa-1', 'BR.1', '@ana');
    expect(r).toBe('gravado');
    expect(updates()).toEqual([{ wa_user_id: 'BR.1', wa_username: '@ana' }]);
    expect(chamadas).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'eq', args: ['id', 'lead-1'] }),
      expect.objectContaining({ op: 'eq', args: ['company_id', 'empresa-1'] }),
    ]));
  });

  it('mesmo wa_user_id e mesmo username → nada a fazer', async () => {
    leadsExistentes = [lead({ wa_user_id: 'BR.1', wa_username: '@ana' })];
    const s = await svc();
    expect(await s.vincularWaUserId('5561999999999', 'empresa-1', 'BR.1', '@ana')).toBe('igual');
    expect(updates()).toHaveLength(0);
  });

  it('mesmo wa_user_id, username novo → so atualiza o username', async () => {
    leadsExistentes = [lead({ wa_user_id: 'BR.1', wa_username: '@velho' })];
    const s = await svc();
    expect(await s.vincularWaUserId('5561999999999', 'empresa-1', 'BR.1', '@novo')).toBe('gravado');
    expect(updates()).toEqual([{ wa_username: '@novo' }]);
  });

  it('sem username na mensagem → nao apaga o salvo', async () => {
    leadsExistentes = [lead({ wa_user_id: 'BR.1', wa_username: '@ana' })];
    const s = await svc();
    expect(await s.vincularWaUserId('5561999999999', 'empresa-1', 'BR.1')).toBe('igual');
    expect(updates()).toHaveLength(0);
  });

  it('wa_user_id diferente → troca e avisa no log', async () => {
    leadsExistentes = [lead({ wa_user_id: 'BR.ANTIGO' })];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = await svc();
    expect(await s.vincularWaUserId('5561999999999', 'empresa-1', 'BR.NOVO')).toBe('trocado');
    expect(updates()).toEqual([{ wa_user_id: 'BR.NOVO' }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('BR.ANTIGO'));
    warn.mockRestore();
  });

  it('lead de OUTRA empresa → nao mexe', async () => {
    leadsExistentes = [lead({ company_id: 'empresa-2' })];
    const s = await svc();
    expect(await s.vincularWaUserId('5561999999999', 'empresa-1', 'BR.1')).toBe('outra-empresa');
    expect(updates()).toHaveLength(0);
  });

  it('lead nao existe → sem-lead', async () => {
    const s = await svc();
    expect(await s.vincularWaUserId('5561999999999', 'empresa-1', 'BR.1')).toBe('sem-lead');
  });

  it('sem telefone ou sem BSUID → sem-dados, sem consultar', async () => {
    const s = await svc();
    expect(await s.vincularWaUserId('', 'empresa-1', 'BR.1')).toBe('sem-dados');
    expect(await s.vincularWaUserId('5561999999999', 'empresa-1', '')).toBe('sem-dados');
    expect(chamadas).toHaveLength(0);
  });

  it('erro do banco (ex.: indice unico, coluna nao existe) → "erro", nunca lanca', async () => {
    leadsExistentes = [lead()];
    erroUpdate = { message: 'duplicate key value violates unique constraint' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = await svc();
    expect(await s.vincularWaUserId('5561999999999', 'empresa-1', 'BR.1')).toBe('erro');
    warn.mockRestore();
  });
});
