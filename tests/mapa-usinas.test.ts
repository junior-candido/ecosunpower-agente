// Mapa das Usinas (Command Center): dados dos alfinetes. Estado pela MESMA
// régua do Command Center/Central de Atenção; tudo escopado pela empresa.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bancoFalso, type Linha } from './helpers/banco-falso.js';
import { carregarMapaUsinas, montarDadosMapa, type LinhaMapa } from '../src/modules/dashboard/mapa-usinas.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const OUTRA = 'c0c0c0c0-2222-3333-4444-555566667777';
const AGORA = new Date('2026-09-28T15:00:00Z'); // 12:00 em Brasília

const linha = (id: string, extra: Partial<LinhaMapa> = {}): LinhaMapa => ({
  id, apelido: `Usina ${id}`, potencia_kwp: 10, cidade: 'Gama', uf: 'DF', ativo: true,
  ultima_sincronizacao: '2026-09-28T14:45:00Z', ultimo_erro: null, status_inversor: 'ok', acompanhamento: 'api',
  marca_inversor: 'sungrow', lead_id: null, lat: -16.02, lng: -48.06, geo_fonte: 'endereco', ...extra,
});

/** 7 dias completos (21..27/09) + hoje, todos com `kwh`. */
function geracao(id: string, kwh: number) {
  const dias = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'];
  return dias.map((data) => ({ sistema_id: id, data, geracao_kwh: kwh }));
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('montarDadosMapa', () => {
  it('um alfinete por usina com posição; sem posição vai pro aviso', () => {
    const d = montarDadosMapa(
      [linha('a'), linha('b', { lat: null, lng: null, geo_fonte: null, apelido: 'Sem ponto' })],
      [...geracao('a', 40), ...geracao('b', 40)], new Map(), { agora: AGORA, corteAtencao: 0.7 },
    );
    expect(d.total).toBe(2);
    expect(d.usinas.map((u) => u.id)).toEqual(['a']);
    expect(d.semPosicao).toBe(1);
    expect(d.semPosicaoNomes).toEqual(['Sem ponto']);
  });

  it('cartão: nome, cliente, cidade, kWp, hoje, mês, % do esperado (7 dias), última comunicação, marca e link', () => {
    const d = montarDadosMapa([linha('a', { lead_id: 'L1' })], geracao('a', 40), new Map([['L1', 'Maria de Fátima']]), { agora: AGORA, corteAtencao: 0.7 });
    const u = d.usinas[0];
    expect(u).toMatchObject({
      nome: 'Usina a', cliente: 'Maria de Fátima', cidade: 'Gama', uf: 'DF', kwp: 10,
      hojeKwh: 40, marca: 'Sungrow', ultimaComunicacao: '2026-09-28T14:45:00Z', href: '/dashboard/monitoramento/a',
      aproximada: false, lat: -16.02, lng: -48.06,
    });
    // Mês = 21..28/09 (8 dias × 40)
    expect(u.mesKwh).toBe(320);
    expect(u.pctEsperado).toBeGreaterThan(0);
    expect(u.estado).toBe('normal');
  });

  it('estado vem da régua do Command Center (sem comunicação, parada, leitura manual)', () => {
    const d = montarDadosMapa([
      linha('ok'),
      linha('mudo', { ultima_sincronizacao: '2026-09-25T10:00:00Z' }),
      linha('parada'),
      linha('manual', { acompanhamento: 'manual' }),
    ], [...geracao('ok', 40), ...geracao('mudo', 40), ...geracao('parada', 0)], new Map(), { agora: AGORA, corteAtencao: 0.7 });
    const est = Object.fromEntries(d.usinas.map((u) => [u.id, u.estado]));
    expect(est).toEqual({ ok: 'normal', mudo: 'sem_comunicacao', parada: 'critico', manual: 'sem_monitoramento' });
    expect(d.porEstado).toMatchObject({ normal: 1, sem_comunicacao: 1, critico: 1, sem_monitoramento: 1 });
  });

  it('sem geração nos 7 dias: % do esperado fica null (nunca 0 inventado); ponto da cidade = aproximado', () => {
    const d = montarDadosMapa([linha('a', { geo_fonte: 'cidade' })], [], new Map(), { agora: AGORA, corteAtencao: 0.7 });
    expect(d.usinas[0].pctEsperado).toBeNull();
    expect(d.usinas[0].hojeKwh).toBeNull();
    expect(d.usinas[0].mesKwh).toBeNull();
    expect(d.usinas[0].aproximada).toBe(true);
  });

  it('usina inativa não entra no mapa', () => {
    const d = montarDadosMapa([linha('a', { ativo: false })], [], new Map(), { agora: AGORA, corteAtencao: 0.7 });
    expect(d.total).toBe(0);
    expect(d.usinas).toEqual([]);
  });
});

describe('carregarMapaUsinas — multi-tenant', () => {
  const banco = (): Record<string, Linha[]> => ({
    sistemas_clientes: [
      { ...linha('e1', { lead_id: 'LE' }), company_id: ECOSUN, apelido: 'Chácara do Junior' },
      { ...linha('o1', { lead_id: 'LO', cidade: 'Vitória da Conquista', uf: 'BA', lat: -14.86, lng: -40.84 }), company_id: OUTRA, apelido: 'Fazenda Boa Esperança' },
    ],
    geracao_diaria: [
      ...geracao('e1', 30).map((g) => ({ ...g, company_id: ECOSUN })),
      ...geracao('o1', 50).map((g) => ({ ...g, company_id: OUTRA })),
    ],
    leads: [
      { id: 'LE', company_id: ECOSUN, name: 'Cliente EcoSun' },
      { id: 'LO', company_id: OUTRA, name: 'Cliente Conquista' },
    ],
  });

  it('a outra empresa não vê NENHUM alfinete da EcoSun (e vice-versa)', async () => {
    const { client, ops } = bancoFalso(banco());
    const d = await carregarMapaUsinas(client, OUTRA, AGORA, 0.7);
    const texto = JSON.stringify(d);
    expect(d.usinas.map((u) => u.id)).toEqual(['o1']);
    expect(texto).toContain('Fazenda Boa Esperança');
    expect(texto).toContain('Cliente Conquista');
    expect(texto).not.toContain('Chácara do Junior');
    expect(texto).not.toContain('Cliente EcoSun');
    for (const o of ops) expect(o.filtros, o.tabela).toContainEqual(['eq', 'company_id', OUTRA]);

    const { client: c2 } = bancoFalso(banco());
    const e = await carregarMapaUsinas(c2, ECOSUN, AGORA, 0.7);
    expect(e.usinas.map((u) => u.id)).toEqual(['e1']);
    expect(JSON.stringify(e)).not.toContain('Fazenda Boa Esperança');
  });

  it('migration 145 ainda não aplicada: não quebra — todas viram "sem localização"', async () => {
    const { client } = bancoFalso(banco(), { colunaFaltando: { tabela: 'sistemas_clientes', coluna: 'lat' } });
    const d = await carregarMapaUsinas(client, ECOSUN, AGORA, 0.7);
    expect(d.migracaoPendente).toBe(true);
    expect(d.usinas).toEqual([]);
    expect(d.semPosicao).toBe(1);
  });

  it('erro de leitura das usinas lança (a rota responde "sem dado", nunca mapa vazio de mentira)', async () => {
    const { client } = bancoFalso(banco(), { erroEm: { sistemas_clientes: 'timeout' } });
    await expect(carregarMapaUsinas(client, ECOSUN, AGORA, 0.7)).rejects.toThrow();
  });
});
