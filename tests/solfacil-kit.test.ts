import { describe, it, expect, vi } from 'vitest';
import { parseBRL, parseRsPorWp } from '../src/modules/vendas/lojas/kit-oferta.js';
import {
  variaveisKitSolfacil, normalizarKitsSolfacil, puxarKitsSolfacil,
} from '../src/modules/vendas/lojas/solfacil-kit-client.js';

describe('kit-oferta parsers', () => {
  it('parseBRL entende "R$ 10.467,97"', () => {
    expect(parseBRL('R$ 10.467,97')).toBe(10467.97);
    expect(parseBRL('6.908,00')).toBe(6908);
    expect(parseBRL(1234.5)).toBe(1234.5);
    expect(parseBRL('sem preço')).toBeNull();
  });
  it('parseRsPorWp entende "R$ 1,74/Wp"', () => {
    expect(parseRsPorWp('R$ 1,74/Wp')).toBe(1.74);
    expect(parseRsPorWp('1,15')).toBe(1.15);
    expect(parseRsPorWp(null)).toBeNull();
  });
});

describe('variaveisKitSolfacil', () => {
  it('preenche TODA string (nunca undefined — senão o resolver deles quebra)', () => {
    const v = variaveisKitSolfacil({ power: 5 });
    expect(v.channel).toBe('autoservico');
    expect(v.region).toBe('DF');
    expect(v.power).toBe(5);
    for (const k of ['zipcode', 'inverter_manufacturer', 'inverter_nominal_power',
      'network_type', 'structure_installation', 'inverter_type', 'segmentation_id']) {
      expect(v[k], `${k} deve ser string`).toBeTypeOf('string');
    }
  });
  it('passa os filtros escolhidos', () => {
    const v = variaveisKitSolfacil({ power: 8, region: 'GO', inverterType: 'micro', inverterManufacturer: 'DEYE' });
    expect(v.region).toBe('GO');
    expect(v.inverter_type).toBe('micro');
    expect(v.inverter_manufacturer).toBe('DEYE');
  });
});

const respostaFake = {
  getCustomKitOffersV2: {
    alert: null,
    offers: [
      {
        tag: { type: 'best', text: 'Mais barato' },
        inverter_manufacturer: 'SOFAR', module_manufacturer: 'LEAPTON', description: 'Kit 5 kWp',
        total_value: 'R$ 6.908,00', value_per_wp: 'R$ 1,15/Wp',
        items: [{ category: 'inversor', details: [{ label: 'Inversor SOFAR 5kW', value: '1un' }] }],
        request: { items: [{ sku: 'INV1', amount: 1 }], dc_id: 3, region: 'DF' },
        payment_conditions: [
          { enabled: true, discount_percent: 6, final_price: 'R$ 6.493,52', payment_name: 'Pix', installments: [{ has_interest: false }] },
        ],
      },
      {
        tag: null, inverter_manufacturer: 'GOODWE', module_manufacturer: 'LEAPTON', description: 'Kit 5 kWp',
        total_value: 'R$ 7.282,76', value_per_wp: 'R$ 1,21/Wp',
        items: [], request: { region: 'DF' }, payment_conditions: [],
      },
    ],
  },
};

describe('normalizarKitsSolfacil', () => {
  it('vira KitOferta[] com preço parseado', () => {
    const kits = normalizarKitsSolfacil(respostaFake, 'DF');
    expect(kits).toHaveLength(2);
    const k = kits[0];
    expect(k.fonte).toBe('solfacil');
    expect(k.inversorMarca).toBe('SOFAR');
    expect(k.moduloMarca).toBe('LEAPTON');
    expect(k.precoTotal).toBe(6908);
    expect(k.rsPorWp).toBe(1.15);
    expect(k.region).toBe('DF');
    expect(k.itens[0].label).toBe('Inversor SOFAR 5kW');
    expect(k.pagamentos[0].nome).toBe('Pix');
    expect(k.pagamentos[0].precoFinal).toBe(6493.52);
    expect(k.pagamentos[0].semJuros).toBe(true);
    expect(k.ehAlternativa).toBe(false);
  });

  it('marca ehAlternativa quando a loja devolve alerta', () => {
    const comAlerta = { getCustomKitOffersV2: { alert: { message: 'não temos, veja alternativa' }, offers: [respostaFake.getCustomKitOffersV2.offers[0]] } };
    const kits = normalizarKitsSolfacil(comAlerta, 'DF');
    expect(kits[0].ehAlternativa).toBe(true);
    expect(kits[0].alerta).toContain('alternativa');
  });

  it('resposta vazia → []', () => {
    expect(normalizarKitsSolfacil({}, 'DF')).toEqual([]);
    expect(normalizarKitsSolfacil({ getCustomKitOffersV2: { offers: [] } }, 'DF')).toEqual([]);
  });
});

describe('puxarKitsSolfacil', () => {
  it('chama o endpoint certo, manda todas as vars e ordena do mais barato', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ data: respostaFake }) })) as any;
    const kits = await puxarKitsSolfacil('TOKEN', { power: 5 }, fetchFn);
    expect(kits[0].precoTotal).toBeLessThanOrEqual(kits[1].precoTotal); // ordenado
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toContain('kong.solfacil.com.br');
    expect(opts.headers.Authorization).toBe('Bearer TOKEN');
    const body = JSON.parse(opts.body);
    expect(body.operationName).toBe('getCustomKitOffersV2');
    expect(body.variables.inverter_type).toBe(''); // string vazia, não undefined
  });

  it('erro GraphQL vira exceção', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ errors: [{ message: 'boom' }] }) })) as any;
    await expect(puxarKitsSolfacil('T', { power: 5 }, fetchFn)).rejects.toThrow('boom');
  });

  it('HTTP != ok vira exceção', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as any;
    await expect(puxarKitsSolfacil('T', { power: 5 }, fetchFn)).rejects.toThrow('HTTP 500');
  });
});
