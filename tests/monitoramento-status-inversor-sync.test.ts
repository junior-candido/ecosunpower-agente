// tests/monitoramento-status-inversor-sync.test.ts
// Fatia 1 do "alerta com motivo" (Thiago 28/07): o sync passa a GUARDAR o
// statusInversor que o adapter devolve (antes era descartado) — migration 084.
import { describe, it, expect, vi } from 'vitest';

const fetchGeneration = vi.fn();
vi.mock('../src/modules/monitoring/adapter-registry.js', () => ({
  getAdapter: () => ({ fetchGeneration }),
  marcasSuportadas: () => ['deye'],
}));

import { MonitoringService } from '../src/modules/monitoring/service.js';

function fakeSupabase(sistema: any, updates: any[]) {
  return {
    getClient() {
      return {
        from(tabela: string) {
          const q: any = {
            select() { return q; },
            eq() { return q; },
            in() { return q; },
            gte() { return q; },
            order() { return q; },
            range() { return q; },
            upsert() { return Promise.resolve({ error: null }); },
            update(fields: any) {
              if (tabela === 'sistemas_clientes') updates.push(fields);
              return q;
            },
            maybeSingle() { return Promise.resolve({ data: sistema, error: null }); },
            then(res: any) { return Promise.resolve({ data: null, error: null }).then(res); },
          };
          return q;
        },
      };
    },
  } as any;
}

const sistema = {
  id: 's1', apelido: 'A', marca_inversor: 'deye', ativo: true,
  api_credentials: { k: 'v' }, company_id: null,
};

describe('sync guarda status_inversor (084)', () => {
  it('adapter devolve offline → update grava status_inversor=offline + carimbo', async () => {
    fetchGeneration.mockResolvedValueOnce({ ok: true, geracoes: [], statusInversor: 'offline' });
    const updates: any[] = [];
    const svc = new MonitoringService(fakeSupabase(sistema, updates));
    const r = await svc.syncOne('s1');
    expect(r.ok).toBe(true);
    const comStatus = updates.find((u) => 'status_inversor' in u);
    expect(comStatus?.status_inversor).toBe('offline');
    expect(comStatus?.status_inversor_em).toBeTruthy();
  });

  it('adapter sem o campo → grava desconhecido (não deixa valor velho enganar)', async () => {
    fetchGeneration.mockResolvedValueOnce({ ok: true, geracoes: [] });
    const updates: any[] = [];
    const svc = new MonitoringService(fakeSupabase(sistema, updates));
    await svc.syncOne('s1');
    expect(updates.find((u) => 'status_inversor' in u)?.status_inversor).toBe('desconhecido');
  });
});
