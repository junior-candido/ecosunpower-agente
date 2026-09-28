// Posição das usinas no banco (Mapa das Usinas): localizar pelo endereço,
// salvar alfinete arrastado (manual), gravar ponto vindo da API do inversor.
// Sempre escopado pela empresa da sessão; 'manual' nunca é sobrescrito.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bancoFalso, type Linha } from './helpers/banco-falso.js';
import {
  listarSemPosicao, localizarUsina, salvarPosicaoManual, gravarPosicaoDaApi,
} from '../src/modules/monitoring/usinas-posicao.js';
import { Geocodificador } from '../src/modules/monitoring/geocodificacao.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const OUTRA = 'c0c0c0c0-2222-3333-4444-555566667777';

const usina = (id: string, company: string, extra: Linha = {}): Linha => ({
  id, company_id: company, apelido: `Usina ${id}`, cidade: 'Ceilândia', uf: 'DF', ativo: true, lead_id: null,
  lat: null, lng: null, geo_fonte: null, geo_em: null, ...extra,
});

function geoFalso(resposta: unknown[] = [{ lat: '-15.8201', lon: '-48.1102' }]) {
  const fetchFalso = vi.fn(async () => new Response(JSON.stringify(resposta), { status: 200 }));
  const g = new Geocodificador({ fetch: fetchFalso as unknown as typeof fetch, esperar: async () => {}, intervaloMs: 0 });
  return { g, fetchFalso };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('listarSemPosicao', () => {
  it('só as usinas ATIVAS e SEM ponto da empresa da sessão', async () => {
    const { client } = bancoFalso({
      sistemas_clientes: [
        usina('a', ECOSUN), usina('b', ECOSUN, { lat: -15.8, lng: -47.9, geo_fonte: 'endereco' }),
        usina('c', ECOSUN, { ativo: false }), usina('x', OUTRA),
      ],
    });
    const r = await listarSemPosicao(client, ECOSUN);
    expect(r.map((u) => u.id)).toEqual(['a']);
  });
});

describe('localizarUsina', () => {
  it('usa o endereço do dono (lead da MESMA empresa) e grava fonte "endereco"', async () => {
    const { client, tabelas, ops } = bancoFalso({
      sistemas_clientes: [usina('a', ECOSUN, { lead_id: 'L1' })],
      leads: [{ id: 'L1', company_id: ECOSUN, endereco_rua: 'QNM 36 Conjunto K', endereco_numero: '12', cep: '72215-110', city: 'Ceilândia', uf: 'DF' }],
    });
    const { g, fetchFalso } = geoFalso();
    const r = await localizarUsina(client, ECOSUN, 'a', g, () => new Date('2026-09-28T12:00:00Z'));
    expect(r).toMatchObject({ ok: true, fonte: 'endereco' });
    const u = tabelas.sistemas_clientes[0];
    expect(u).toMatchObject({ lat: -15.8201, lng: -48.1102, geo_fonte: 'endereco', geo_em: '2026-09-28T12:00:00.000Z' });
    const url = new URL(String((fetchFalso.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('street')).toBe('12 QNM 36 Conjunto K');
    for (const o of ops) expect(o.filtros, o.tabela).toContainEqual(['eq', 'company_id', ECOSUN]);
  });

  it('sem endereço: centro da cidade, deslocado um pouco, fonte "cidade"', async () => {
    const { client, tabelas } = bancoFalso({ sistemas_clientes: [usina('a', ECOSUN, { cidade: 'Gama' })] });
    const { g, fetchFalso } = geoFalso([]);
    const r = await localizarUsina(client, ECOSUN, 'a', g);
    expect(r).toMatchObject({ ok: true, fonte: 'cidade' });
    expect(fetchFalso).not.toHaveBeenCalled();
    const u = tabelas.sistemas_clientes[0];
    expect(u.geo_fonte).toBe('cidade');
    expect(Math.abs((u.lat as number) - -16.019)).toBeLessThan(0.006);
    expect(u.lat).not.toBe(-16.019);
  });

  it('usina de OUTRA empresa: não acha, não grava', async () => {
    const { client, tabelas } = bancoFalso({ sistemas_clientes: [usina('x', OUTRA)] });
    const { g } = geoFalso();
    const r = await localizarUsina(client, ECOSUN, 'x', g);
    expect(r.ok).toBe(false);
    expect(tabelas.sistemas_clientes[0].lat).toBeNull();
  });

  it('endereço do lead de OUTRA empresa nunca é usado', async () => {
    const { client } = bancoFalso({
      sistemas_clientes: [usina('a', ECOSUN, { lead_id: 'L9', cidade: 'Gama' })],
      leads: [{ id: 'L9', company_id: OUTRA, endereco_rua: 'Rua Secreta', endereco_numero: '1', city: 'Gama', uf: 'DF' }],
    });
    const { g, fetchFalso } = geoFalso();
    await localizarUsina(client, ECOSUN, 'a', g);
    for (const c of fetchFalso.mock.calls) expect(String((c as unknown[])[0])).not.toContain('Secreta');
  });

  it('ponto MANUAL não é tocado pela localização automática', async () => {
    const { client, tabelas } = bancoFalso({ sistemas_clientes: [usina('a', ECOSUN, { lat: -15.1, lng: -47.1, geo_fonte: 'manual' })] });
    const { g, fetchFalso } = geoFalso();
    const r = await localizarUsina(client, ECOSUN, 'a', g);
    expect(r).toMatchObject({ ok: true, pulada: true });
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(tabelas.sistemas_clientes[0]).toMatchObject({ lat: -15.1, lng: -47.1, geo_fonte: 'manual' });
  });

  it('a gravação também se protege: só grava onde o ponto não é manual', async () => {
    const { client, ops } = bancoFalso({ sistemas_clientes: [usina('a', ECOSUN)] });
    const { g } = geoFalso();
    await localizarUsina(client, ECOSUN, 'a', g);
    const up = ops.find((o) => o.tipo === 'update')!;
    expect(up.filtros).toContainEqual(['or', 'geo_fonte.is.null,geo_fonte.neq.manual', null]);
  });

  it('sem cidade nem endereço: devolve o motivo, não grava', async () => {
    const { client, tabelas } = bancoFalso({ sistemas_clientes: [usina('a', ECOSUN, { cidade: null, uf: null })] });
    const { g } = geoFalso();
    const r = await localizarUsina(client, ECOSUN, 'a', g);
    expect(r).toMatchObject({ ok: false });
    expect(tabelas.sistemas_clientes[0].lat).toBeNull();
  });
});

describe('salvarPosicaoManual', () => {
  it('grava lat/lng com fonte "manual" só na usina da empresa', async () => {
    const { client, tabelas } = bancoFalso({ sistemas_clientes: [usina('a', ECOSUN, { geo_fonte: 'cidade', lat: -16, lng: -48 }), usina('x', OUTRA)] });
    expect(await salvarPosicaoManual(client, ECOSUN, 'a', -15.83, -48.05)).toMatchObject({ ok: true });
    expect(tabelas.sistemas_clientes[0]).toMatchObject({ lat: -15.83, lng: -48.05, geo_fonte: 'manual' });
    expect(await salvarPosicaoManual(client, ECOSUN, 'x', -15.83, -48.05)).toMatchObject({ ok: false });
    expect(tabelas.sistemas_clientes[1].lat).toBeNull();
  });

  it('recusa ponto fora do Brasil ou lixo', async () => {
    const { client } = bancoFalso({ sistemas_clientes: [usina('a', ECOSUN)] });
    expect((await salvarPosicaoManual(client, ECOSUN, 'a', 48.8, 2.3)).ok).toBe(false);
    expect((await salvarPosicaoManual(client, ECOSUN, 'a', Number.NaN, -47)).ok).toBe(false);
    expect((await salvarPosicaoManual(client, ECOSUN, 'a', 0, 0)).ok).toBe(false);
  });
});

describe('gravarPosicaoDaApi', () => {
  it('grava com fonte "api" quando não há ponto manual', async () => {
    const { client, tabelas } = bancoFalso({ sistemas_clientes: [usina('a', ECOSUN, { geo_fonte: 'cidade', lat: -16, lng: -48 })] });
    await gravarPosicaoDaApi(client, ECOSUN, 'a', -15.9, -47.95);
    expect(tabelas.sistemas_clientes[0]).toMatchObject({ lat: -15.9, lng: -47.95, geo_fonte: 'api' });
  });

  it('não mexe no ponto manual e ignora coordenada inválida', async () => {
    const { client, tabelas } = bancoFalso({ sistemas_clientes: [usina('a', ECOSUN, { geo_fonte: 'manual', lat: -15.1, lng: -47.1 }), usina('b', ECOSUN)] });
    await gravarPosicaoDaApi(client, ECOSUN, 'a', -15.9, -47.95);
    await gravarPosicaoDaApi(client, ECOSUN, 'b', 0, 0);
    expect(tabelas.sistemas_clientes[0]).toMatchObject({ lat: -15.1, geo_fonte: 'manual' });
    expect(tabelas.sistemas_clientes[1].lat).toBeNull();
  });

  it('nunca lança (coluna ainda não existe no banco = só loga)', async () => {
    const { client } = bancoFalso({ sistemas_clientes: [usina('a', ECOSUN)] }, { colunaFaltando: { tabela: 'sistemas_clientes', coluna: 'lat' } });
    await expect(gravarPosicaoDaApi(client, ECOSUN, 'a', -15.9, -47.95)).resolves.toBeUndefined();
  });
});
