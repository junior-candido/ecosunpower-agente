import { describe, it, expect } from 'vitest';
import { parseStatusShelly, criarClienteShellyCloud, perfilDetectado, instanteDoStatus } from '../src/modules/energia/adapters/shelly-cloud.js';
import { getMedidorAdapter, fabricantesSuportados } from '../src/modules/energia/medidor-registry.js';

// Fixture montada a partir da documentação (componentes em:0/emdata:0 e em1:N/em1data:N).
// TODO: trocar pela captura real do piloto (anonimizada), ver plano Tarefa 10 passo 0.
const TRI = {
  'em:0': { c_voltage: 227.6, c_current: 6.72, c_act_power: 1392, c_aprt_power: 1530.4, c_pf: 0.91 },
  'emdata:0': { c_total_act_energy: 7620, c_total_act_ret_energy: 120 },
  sys: { unixtime: 1790000000 },
};
const MONO = {
  'em1:2': { voltage: 227.6, current: 6.72, act_power: 1392, aprt_power: 1530.4, pf: 0.91 },
  'em1data:2': { total_act_energy: 7620, total_act_ret_energy: 120 },
};
const CRED = { server_uri: 'https://shelly-77-eu.shelly.cloud', auth_key: 'CHAVE-SECRETA-123' };

describe('parseStatusShelly', () => {
  it('trifásico, fase C', () => {
    expect(parseStatusShelly(TRI, 'triphase', 2)).toEqual({
      tensao: 227.6, corrente: 6.72, potenciaW: 1392, potenciaVa: 1530.4, fatorPotencia: 0.91, energiaWh: 7620, energiaDevolvidaWh: 120,
    });
  });
  it('monofásico, canal 2', () => expect(parseStatusShelly(MONO, 'monophase', 2)!.potenciaW).toBe(1392));
  it('componente ausente = null (nunca morre calado)', () => {
    expect(parseStatusShelly({}, 'triphase', 2)).toBeNull();
    expect(parseStatusShelly(TRI, 'monophase', 2)).toBeNull();
    expect(parseStatusShelly(TRI, 'triphase', 7)).toBeNull();
  });
  it('perfil detectado pelo status', () => {
    expect(perfilDetectado(TRI)).toBe('triphase');
    expect(perfilDetectado(MONO)).toBe('monophase');
    expect(perfilDetectado({})).toBeNull();
  });
  it('instante do status: relógio do aparelho se plausível, senão agora', () => {
    const agora = 1790000100_000;
    expect(instanteDoStatus(TRI, agora)).toBe(new Date(1790000000_000).toISOString());
    expect(instanteDoStatus({ sys: { unixtime: 10 } }, agora)).toBe(new Date(agora).toISOString());
    expect(instanteDoStatus({}, agora)).toBe(new Date(agora).toISOString());
  });
});

function relogio() {
  let agora = 0;
  return { agora: () => agora, dormir: async (ms: number) => { agora += ms; } };
}

describe('cliente da Cloud Control API', () => {
  it('respeita 1 req/s por chave e lotes de 10', async () => {
    const chamadas: Array<{ t: number; url: string; body: { ids: string[]; select: string[] } }> = [];
    const r0 = relogio();
    const fetchFalso = async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      chamadas.push({ t: r0.agora(), url, body });
      return new Response(JSON.stringify(body.ids.map((id: string) => ({ id, code: 'SPEM-003CEBEU120', online: 1, status: TRI }))), { status: 200 });
    };
    const c = criarClienteShellyCloud({ fetch: fetchFalso as never, ...r0 });
    const ids = Array.from({ length: 23 }, (_, i) => `dev${i}`);
    const r = await c.buscarStatus(CRED, ids);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.devices).toHaveLength(23);
    expect(chamadas).toHaveLength(3);
    expect(chamadas.map((x) => x.body.ids.length)).toEqual([10, 10, 3]);
    expect(chamadas[1].t - chamadas[0].t).toBeGreaterThanOrEqual(1100);
    expect(chamadas[2].t - chamadas[1].t).toBeGreaterThanOrEqual(1100);
    expect(chamadas[0].url).toBe('https://shelly-77-eu.shelly.cloud/v2/devices/api/get?auth_key=CHAVE-SECRETA-123');
    expect(chamadas[0].body.select).toEqual(['status']);
  });

  it('chaves diferentes não esperam uma pela outra', async () => {
    const r0 = relogio();
    const ts: number[] = [];
    const f = async () => { ts.push(r0.agora()); return new Response('[]', { status: 200 }); };
    const c = criarClienteShellyCloud({ fetch: f as never, ...r0 });
    await c.buscarStatus(CRED, ['a']);
    await c.buscarStatus({ ...CRED, auth_key: 'outra' }, ['b']);
    expect(ts).toEqual([0, 0]);
  });

  it('401 vira invalidCredentials, sem vazar a chave', async () => {
    const c = criarClienteShellyCloud({ fetch: (async () => new Response('{"error":"UNAUTHORIZED"}', { status: 401 })) as never, ...relogio() });
    const r = await c.buscarStatus(CRED, ['a']);
    expect(r).toMatchObject({ ok: false, invalidCredentials: true });
    expect(JSON.stringify(r)).not.toContain('CHAVE-SECRETA-123');
  });

  it('{error} vira ok:false com a mensagem, sem vazar a chave', async () => {
    const c = criarClienteShellyCloud({
      fetch: (async () => new Response(JSON.stringify({ error: 'DEVICE_NOT_FOUND CHAVE-SECRETA-123', data: { messages: ['x'] } }), { status: 400 })) as never,
      ...relogio(),
    });
    const r = await c.buscarStatus(CRED, ['a']);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/DEVICE_NOT_FOUND/);
      expect(r.reason).not.toContain('CHAVE-SECRETA-123');
    }
  });

  it('erro de auth no corpo (200 com error) também vira invalidCredentials', async () => {
    const c = criarClienteShellyCloud({ fetch: (async () => new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 200 })) as never, ...relogio() });
    expect(await c.buscarStatus(CRED, ['a'])).toMatchObject({ ok: false, invalidCredentials: true });
  });

  it('online: 0 → device offline e sem status', async () => {
    const c = criarClienteShellyCloud({ fetch: (async () => new Response(JSON.stringify([{ id: 'a', online: 0 }]), { status: 200 })) as never, ...relogio() });
    const r = await c.buscarStatus(CRED, ['a']);
    expect(r.ok && r.devices[0]).toEqual({ id: 'a', online: false, modelo: null, status: null });
  });

  it('rede caiu: ok:false, nunca lança, sem vazar a URL com a chave', async () => {
    const c = criarClienteShellyCloud({
      fetch: (async (url: string) => { throw new Error(`fetch failed ${url}`); }) as never, ...relogio(),
    });
    const r = await c.buscarStatus(CRED, ['a']);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain('CHAVE-SECRETA-123');
  });

  it('lista vazia não chama a nuvem', async () => {
    let n = 0;
    const c = criarClienteShellyCloud({ fetch: (async () => { n++; return new Response('[]'); }) as never, ...relogio() });
    expect(await c.buscarStatus(CRED, [])).toEqual({ ok: true, devices: [] });
    expect(n).toBe(0);
  });
});

describe('registro de medidores (irmão do adapter-registry)', () => {
  it('shelly registrado', () => {
    expect(fabricantesSuportados()).toContain('shelly');
    expect(getMedidorAdapter('shelly')).not.toBeNull();
    expect(getMedidorAdapter('xyz')).toBeNull();
  });
});

describe('fila por chave não cresce sem fim', () => {
  it('muitas chaves diferentes ao longo do tempo: os mapas internos ficam limitados', async () => {
    let agora = 0;
    const c = criarClienteShellyCloud({ fetch: (async () => new Response('[]')) as never, agora: () => agora, dormir: async (ms: number) => { agora += ms; } });
    for (let i = 0; i < 500; i++) {
      await c.buscarStatus({ server_uri: 'https://x.shelly.cloud', auth_key: `chave-${i}` }, ['a']);
      agora += 5_000; // a chave anterior já não precisa de espaçamento
    }
    await new Promise((ok) => setTimeout(ok, 0));
    const t = c._tamanhos();
    expect(t.ultimas).toBeLessThanOrEqual(2);
    expect(t.filas).toBeLessThanOrEqual(2);
  });
});

