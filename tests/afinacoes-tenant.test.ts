// tests/afinacoes-tenant.test.ts
//
// AS TRÊS COISAS QUE SOBRARAM DO DIA 09/09/2026 (Conquista Solar).
//
// Nenhuma delas é grande sozinha; juntas são a diferença entre a assistente do
// cliente parecer profissional e parecer defeituosa.
//
// 1. A pausa de 24 h foi desenhada pro número da própria casa. No número de um
//    cliente o celular é de uma PESSOA, que digita o dia inteiro — e cada
//    mensagem dela renovava o silêncio.
// 2. "/recarregar-config" recarregava só metade do que o nome promete, e a
//    metade que faltava era justamente a que o Junior mexe por SQL.
// 3. O "modo dono" valia dentro da casa do cliente. A Clara respondeu ao Junior
//    "quer que eu monte uma mensagem pronta pra você enviar pro cliente?" — na
//    frente da marca da Conquista.
import { describe, it, expect, vi } from 'vitest';
import {
  TakeoverService,
  PAUSE_TTL_SECONDS,
  PAUSE_TTL_TENANT_SECONDS,
} from '../src/modules/takeover.js';
import { ehComandoRecarregar, textoDaRecarga } from '../src/modules/comando-recarregar.js';
import { donoValeNesteCanal } from '../src/modules/admin-canal.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const CONQUISTA = '99fd46d7-60fc-49fe-918f-66587ffa3829';

// ---------------------------------------------------------------------
// 1. A pausa dura o que o canal pede
// ---------------------------------------------------------------------
describe('takeover — quanto tempo a assistente fica calada', () => {
  function fazServico() {
    const redis = { setex: vi.fn(async () => 'OK'), get: vi.fn(), del: vi.fn() };
    return { redis, takeover: new TakeoverService('localhost', 6379, undefined, redis) };
  }

  it('sem dizer nada, pausa as 24 h de sempre', async () => {
    const { redis, takeover } = fazServico();
    await takeover.pauseFor('5561999990000');
    expect(redis.setex).toHaveBeenCalledWith(
      'takeover:5561999990000',
      PAUSE_TTL_SECONDS,
      expect.any(String),
    );
  });

  it('no canal de um cliente, pausa só 2 h', async () => {
    const { redis, takeover } = fazServico();
    await takeover.pauseFor('5577999998888', PAUSE_TTL_TENANT_SECONDS);
    expect(redis.setex).toHaveBeenCalledWith(
      'takeover:5577999998888',
      PAUSE_TTL_TENANT_SECONDS,
      expect.any(String),
    );
  });

  it('2 h é bem menos que 24 h — e não é zero', () => {
    expect(PAUSE_TTL_TENANT_SECONDS).toBe(7200);
    expect(PAUSE_TTL_TENANT_SECONDS).toBeLessThan(PAUSE_TTL_SECONDS);
    expect(PAUSE_TTL_TENANT_SECONDS).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------
// 2. Recarregar de verdade, e pelos dois nomes
// ---------------------------------------------------------------------
describe('comando de recarregar — o nome não pode mentir', () => {
  it('atende pelos nomes que a pessoa lembra', () => {
    expect(ehComandoRecarregar('/recarregar-config')).toBe(true);
    expect(ehComandoRecarregar('recarregar-base')).toBe(true);
    expect(ehComandoRecarregar('/recarregar')).toBe(true);
    expect(ehComandoRecarregar('  RECARREGAR-BASE  ')).toBe(true);
  });

  it('não confunde com conversa normal', () => {
    expect(ehComandoRecarregar('recarregar o quê?')).toBe(false);
    expect(ehComandoRecarregar('preciso recarregar a base amanhã')).toBe(false);
    expect(ehComandoRecarregar('')).toBe(false);
  });

  it('a resposta diz as DUAS coisas, não só a config', () => {
    const txt = textoDaRecarga({
      configOk: true,
      nomeFantasia: 'Conquista Solar',
      nomeAtendente: 'Clara',
      baseOk: true,
      empresasNaBase: 2,
    });
    expect(txt).toContain('Conquista Solar');
    expect(txt).toContain('Clara');
    expect(txt).toContain('Base de conhecimento');
    expect(txt).toContain('2 empresa(s)');
  });

  it('avisa qual das duas falhou, em vez de dizer "ok" no geral', () => {
    const txt = textoDaRecarga({
      configOk: true,
      nomeFantasia: 'EcoSunPower',
      nomeAtendente: 'Eva',
      baseOk: false,
      empresasNaBase: 0,
    });
    expect(txt).toContain('⚙️ Config: EcoSunPower');
    expect(txt).toContain('Base de conhecimento NÃO recarregou');
  });
});

// ---------------------------------------------------------------------
// 3. Dono é dono na própria casa
// ---------------------------------------------------------------------
describe('modo dono — vale só no canal da própria empresa', () => {
  it('vale no número da EcoSunPower', () => {
    expect(donoValeNesteCanal(ECOSUN, ECOSUN)).toBe(true);
  });

  it('NÃO vale no número da Conquista Solar', () => {
    expect(donoValeNesteCanal(CONQUISTA, ECOSUN)).toBe(false);
  });

  it('fora de canal (cron, boot, script) continua como sempre foi', () => {
    expect(donoValeNesteCanal(undefined, ECOSUN)).toBe(true);
  });
});
