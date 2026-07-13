import { describe, it, expect } from 'vitest';
import { listarPropostasAbertas } from '../src/modules/vendas/propostas-abertas.js';

// Fake client: propostas_publicas devolve as linhas configuradas; leads devolve
// o installation_status por id. Chainable simples.
function makeClient(props: any[] | 'error', leadStatus: Record<string, string | null>) {
  const client: any = {
    from(table: string) {
      const b: any = {};
      b.select = () => b;
      b.not = () => b;
      b.order = () => b;
      b.limit = async () => (props === 'error' ? { data: null, error: { message: 'boom' } } : { data: props, error: null });
      b.in = async () => ({
        data: Object.entries(leadStatus).map(([id, installation_status]) => ({ id, installation_status })),
        error: null,
      });
      return b;
    },
  };
  return client;
}

describe('listarPropostasAbertas', () => {
  it('lista propostas em aberto (não vendidas), uma por cliente, id fechei_pick:<leadId>', async () => {
    const props = [
      { id: 'p1', lead_id: 'L1', cliente_nome: 'Fernanda', numero_proposta: '100', revoked: false },
      { id: 'p2', lead_id: 'L2', cliente_nome: 'Antonio', numero_proposta: '101', revoked: false },
      { id: 'p3', lead_id: 'L3', cliente_nome: 'Joana (já vendida)', numero_proposta: '102', revoked: false },
    ];
    const rows = await listarPropostasAbertas(makeClient(props, { L1: 'qualificado', L2: null, L3: 'operando' }));
    // L3 (operando = venda) sai; L1 e L2 ficam
    expect(rows.map((r) => r.leadId)).toEqual(['L1', 'L2']);
    expect(rows[0].id).toBe('fechei_pick:L1');
    expect(rows[0].title).toBe('Fernanda');
    expect(rows[0].description).toBe('Proposta 100');
  });

  it('dedupe: uma linha por cliente (a mais recente vem primeiro no array de entrada)', async () => {
    const props = [
      { id: 'p1', lead_id: 'L1', cliente_nome: 'Fernanda nova', numero_proposta: '200', revoked: false },
      { id: 'p0', lead_id: 'L1', cliente_nome: 'Fernanda antiga', numero_proposta: '199', revoked: false },
    ];
    const rows = await listarPropostasAbertas(makeClient(props, { L1: null }));
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('Proposta 200');
  });

  it('ignora revogadas e sem lead_id', async () => {
    const props = [
      { id: 'p1', lead_id: 'L1', cliente_nome: 'Ok', numero_proposta: '1', revoked: false },
      { id: 'p2', lead_id: 'L2', cliente_nome: 'Revogada', numero_proposta: '2', revoked: true },
      { id: 'p3', lead_id: null, cliente_nome: 'Sem lead', numero_proposta: '3', revoked: false },
    ];
    const rows = await listarPropostasAbertas(makeClient(props, { L1: null, L2: null }));
    expect(rows.map((r) => r.leadId)).toEqual(['L1']);
  });

  it('respeita o limite de linhas', async () => {
    const props = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`, lead_id: `L${i}`, cliente_nome: `C${i}`, numero_proposta: String(i), revoked: false,
    }));
    const status: Record<string, null> = {};
    props.forEach((p) => (status[p.lead_id] = null));
    const rows = await listarPropostasAbertas(makeClient(props, status), 5);
    expect(rows).toHaveLength(5);
  });

  it('best-effort: erro na query → lista vazia', async () => {
    const rows = await listarPropostasAbertas(makeClient('error', {}));
    expect(rows).toEqual([]);
  });

  it('trunca nome > 24 chars pro limite do WhatsApp', async () => {
    const props = [{ id: 'p1', lead_id: 'L1', cliente_nome: 'Nome Muito Grande Que Passa De Vinte E Quatro', numero_proposta: '1', revoked: false }];
    const rows = await listarPropostasAbertas(makeClient(props, { L1: null }));
    expect(rows[0].title.length).toBeLessThanOrEqual(24);
  });
});
