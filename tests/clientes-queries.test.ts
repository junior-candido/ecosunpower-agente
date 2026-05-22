// tests/clientes-queries.test.ts
import { describe, it, expect, vi } from 'vitest';
import { listClientes, getClienteDetail } from '../src/modules/dashboard/clientes-queries.js';

function fakeSupabase(o: any = {}) {
  return {
    listClientesByStatus: vi.fn().mockResolvedValue([]),
    countClientesByStatus: vi.fn().mockResolvedValue(0),
    listSistemasOrfaos: vi.fn().mockResolvedValue([]),
    getClienteByLeadId: vi.fn().mockResolvedValue(null),
    listAnexos: vi.fn().mockResolvedValue([]),
    listPropostasByLeadId: vi.fn().mockResolvedValue([]),
    listAlertasAtivosByLeadId: vi.fn().mockResolvedValue([]),
    listManutencoesFuturasByLeadId: vi.fn().mockResolvedValue([]),
    getClient: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrls: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      },
    }),
    ...o,
  };
}
function fakeMonitoring(sistemas: any[] = []) {
  return {
    listarParaDashboard: vi.fn().mockResolvedValue(sistemas),
  };
}

describe('listClientes', () => {
  it('filtra apenas statuses de cliente e retorna { clientes, sistemasOrfaos }', async () => {
    const sb = fakeSupabase();
    const r = await listClientes(sb as any, {});
    expect(sb.listClientesByStatus).toHaveBeenCalled();
    const [statuses] = sb.listClientesByStatus.mock.calls[0];
    expect(statuses).toContain('operando');
    expect(statuses).toContain('instalado');
    expect(statuses).not.toContain('novo');
    expect(statuses).not.toContain('qualificando');
    expect(r).toHaveProperty('clientes');
    expect(r).toHaveProperty('sistemasOrfaos');
    expect(Array.isArray(r.clientes)).toBe(true);
    expect(Array.isArray(r.sistemasOrfaos)).toBe(true);
  });

  it('mapeia sistemas órfãos do supabase para o card shape', async () => {
    const sb = fakeSupabase({
      listSistemasOrfaos: vi.fn().mockResolvedValue([
        { id: 's1', apelido: 'Casa X', marca_inversor: 'deye', potencia_kwp: 5, cidade: 'BSB', uf: 'DF', data_instalacao: '2025-01-01' },
      ]),
    });
    const r = await listClientes(sb as any, {});
    expect(r.sistemasOrfaos).toHaveLength(1);
    expect(r.sistemasOrfaos[0].sistema_id).toBe('s1');
    expect(r.sistemasOrfaos[0].apelido).toBe('Casa X');
  });
});

describe('getClienteDetail', () => {
  it('retorna null se lead não existe', async () => {
    const sb = fakeSupabase();
    const r = await getClienteDetail(sb as any, fakeMonitoring() as any, 'lead-x');
    expect(r).toBeNull();
  });

  it('agrega sistemas/propostas/alertas/anexos do lead em paralelo', async () => {
    const sb = fakeSupabase({
      getClienteByLeadId: vi.fn().mockResolvedValue({ id: 'lead-1', name: 'X', phone: '11', installation_status: 'operando' }),
      listAnexos: vi.fn().mockResolvedValue([{ id: 'a1', tipo: 'contrato', storage_path: 'p/x.pdf', mime_type: 'application/pdf' }]),
      listPropostasByLeadId: vi.fn().mockResolvedValue([{ id: 'p1', slug: 's1', numero_proposta: 'N1', created_at: '2026-01-01', acessos: 1, cliente_respondeu_at: null, dados_input: { investimento: { total: 1000 } } }]),
      listAlertasAtivosByLeadId: vi.fn().mockResolvedValue([{ id: 'al1' }]),
    });
    const ms = fakeMonitoring([{ id: 's1', lead_id: 'lead-1', apelido: 'Casa', potencia_kwp: 5, uf: 'DF', geracao_7d_kwh: 0 }]);
    const r = await getClienteDetail(sb as any, ms as any, 'lead-1');
    expect(r).not.toBeNull();
    expect(r?.propostas.length).toBe(1);
    expect(r?.propostas[0].valor_total_brl).toBe(1000);
    expect(r?.alertas_ativos.length).toBe(1);
    expect(r?.anexos.length).toBe(1);
    expect(r?.sistema?.apelido).toBe('Casa');
  });
});
