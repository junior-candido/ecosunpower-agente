// Import/descoberta de plantas: quando a marca informa a posição da planta,
// ela vai pro mapa como geo_fonte='api' — nunca por cima de ponto manual.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bancoFalso } from './helpers/banco-falso.js';

const listSites = vi.fn();
vi.mock('../src/modules/monitoring/adapter-registry.js', () => ({
  getAdapter: () => ({ marca: 'sungrow', fetchGeneration: vi.fn(), listSites }),
  marcasSuportadas: () => ['sungrow'],
}));

import { MonitoringService } from '../src/modules/monitoring/service.js';

const CONQ = 'c0c0c0c0-2222-3333-4444-555566667777';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('importarSitesEmMassa — posição da API', () => {
  it('grava lat/lng (fonte api) na usina da empresa dona, e respeita o ponto manual', async () => {
    const banco = bancoFalso({
      sistemas_clientes: [
        { id: 's1', company_id: CONQ, marca_inversor: 'sungrow', 'api_credentials->>site_id': '11', apelido: 'A', lat: -16, lng: -48, geo_fonte: 'cidade' },
        { id: 's2', company_id: CONQ, marca_inversor: 'sungrow', 'api_credentials->>site_id': '12', apelido: 'B', lat: -15.1, lng: -47.1, geo_fonte: 'manual' },
      ],
      leads: [],
    });
    listSites.mockResolvedValue({ ok: true, sites: [
      { externalId: '11', apelido: 'A', potencia_kwp: null, cidade: null, uf: null, data_instalacao: null, credenciais: { site_id: '11' }, lat: -15.83, lng: -48.05 },
      { externalId: '12', apelido: 'B', potencia_kwp: null, cidade: null, uf: null, data_instalacao: null, credenciais: { site_id: '12' }, lat: -15.9, lng: -47.9 },
    ] });
    const svc = new MonitoringService({ getClient: () => banco.client } as never);
    const r = await svc.importarSitesEmMassa('sungrow', { appkey: 'x' }, CONQ);
    expect(r.ok).toBe(true);
    const [s1, s2] = banco.tabelas.sistemas_clientes;
    expect(s1).toMatchObject({ lat: -15.83, lng: -48.05, geo_fonte: 'api' });
    expect(s2).toMatchObject({ lat: -15.1, lng: -47.1, geo_fonte: 'manual' });
    const gravacoes = banco.ops.filter((o) => o.tipo === 'update' && o.patch && 'geo_fonte' in o.patch);
    for (const g of gravacoes) expect(g.filtros).toContainEqual(['eq', 'company_id', CONQ]);
  });
});
