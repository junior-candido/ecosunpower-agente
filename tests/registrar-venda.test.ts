import { describe, it, expect } from 'vitest';
import { registrarVenda, normalizarData } from '../src/modules/vendas/registrar-venda.js';

// Fake client: .from('leads').select().eq().maybeSingle() devolve o estado
// configurado; .from(...).update().eq() registra o patch; .from('eventos_elo')
// .insert() registra o evento. Chainable simples.
type Estado = { installation_status: string | null; contract_signed_at: string | null } | null;

function makeClient(estado: Estado, opts?: { updateError?: string; readError?: string }) {
  const updates: any[] = [];
  const eventos: any[] = [];
  const client: any = {
    from(table: string) {
      const b: any = {};
      b._table = table;
      b.select = () => b;
      b.eq = () => b;
      b.maybeSingle = async () => {
        if (opts?.readError) return { data: null, error: { message: opts.readError } };
        return { data: estado, error: null };
      };
      b.update = (patch: any) => {
        updates.push({ table, patch });
        return { eq: async () => ({ error: opts?.updateError ? { message: opts.updateError } : null }) };
      };
      b.insert = async (row: any) => {
        eventos.push({ table, row });
        return { error: null };
      };
      return b;
    },
  };
  return { client, updates, eventos };
}

describe('registrarVenda (coração da venda)', () => {
  it('lead novo: promove pra contrato_assinado, carimba data, grava valor/tipo/kwp e avisa o Elo', async () => {
    const { client, updates, eventos } = makeClient({ installation_status: 'qualificado', contract_signed_at: null });

    const r = await registrarVenda(client, {
      leadId: 'lead-1', tipo: 'sistema', valorCents: 1960000, kwp: 19.6, data: '2026-07-10', origem: 'dashboard',
    });

    expect(r.ok).toBe(true);
    expect(r.jaEraVenda).toBe(false);
    const patch = updates[0].patch;
    expect(patch.installation_status).toBe('contrato_assinado');
    expect(patch.contract_signed_at).toBe('2026-07-10T12:00:00.000Z'); // meio-dia UTC
    expect(patch.venda_valor_cents).toBe(1960000);
    expect(patch.venda_tipo).toBe('sistema');
    expect(patch.venda_kwp).toBe(19.6);
    // Evento pro Elo
    const ev = eventos.find((e) => e.table === 'eventos_elo');
    expect(ev.row.tipo).toBe('comercial:venda');
    expect(ev.row.lead_id).toBe('lead-1');
    expect(ev.row.origem).toBe('dashboard');
  });

  it('lead que JÁ é venda (operando): não rebaixa o status nem re-carimba a data', async () => {
    const { client, updates } = makeClient({ installation_status: 'operando', contract_signed_at: '2026-01-05T12:00:00.000Z' });

    const r = await registrarVenda(client, { leadId: 'lead-2', data: '2026-07-10' });

    expect(r.ok).toBe(true);
    expect(r.jaEraVenda).toBe(true);
    const patch = updates[0].patch;
    expect(patch.installation_status).toBeUndefined(); // não rebaixa operando → contrato_assinado
    expect(patch.contract_signed_at).toBeUndefined(); // já tinha data, não sobrescreve
  });

  it('sem data informada: usa agora (ISO) e ainda assim marca a venda', async () => {
    const { client, updates } = makeClient({ installation_status: 'qualificado', contract_signed_at: null });
    const r = await registrarVenda(client, { leadId: 'lead-3', tipo: 'servico' });
    expect(r.ok).toBe(true);
    expect(typeof updates[0].patch.contract_signed_at).toBe('string');
    expect(updates[0].patch.venda_tipo).toBe('servico');
  });

  it('lead inexistente → ok:false com erro claro, sem update', async () => {
    const { client, updates } = makeClient(null);
    const r = await registrarVenda(client, { leadId: 'nao-existe' });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/não encontrado/i);
    expect(updates).toHaveLength(0);
  });

  it('leadId vazio → ok:false sem tocar no banco', async () => {
    const { client, updates } = makeClient({ installation_status: 'novo', contract_signed_at: null });
    const r = await registrarVenda(client, { leadId: '   ' });
    expect(r.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it('erro no update → propaga ok:false', async () => {
    const { client } = makeClient({ installation_status: 'qualificado', contract_signed_at: null }, { updateError: 'boom' });
    const r = await registrarVenda(client, { leadId: 'lead-4', tipo: 'sistema' });
    expect(r.ok).toBe(false);
    expect(r.erro).toBe('boom');
  });
});

describe('normalizarData', () => {
  it('yyyy-mm-dd vira meio-dia UTC', () => {
    expect(normalizarData('2026-07-10')).toBe('2026-07-10T12:00:00.000Z');
  });
  it('vazio/null → null', () => {
    expect(normalizarData(null)).toBeNull();
    expect(normalizarData('')).toBeNull();
  });
  it('data inválida → null', () => {
    expect(normalizarData('abacaxi')).toBeNull();
  });
});
