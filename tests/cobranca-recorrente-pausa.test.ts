// "Se não pagar, a assistente para" (28/09/2026) — regra PURA da pausa por
// inadimplência. Só a assistente de um TENANT pausa; a casa (EcoSun) e cliente
// avulso nunca. D+3 (configurável), "dar mais prazo", "nunca pausar", e volta
// sozinha quando não há mais fatura vencida em aberto.
import { describe, it, expect } from 'vitest';
import {
  decidirPausa, dataDaPausa, dataDaTravaDisparos, diasTravaDisparosValidos, podePausar, empresaPausadaNoCache, criarCachePausa,
  novosHorarios, configurarTravaDisparos, filtrarDisparosLiberados, disparoLiberado, limparCacheDisparos,
} from '../src/modules/cobranca-recorrente/pausa.js';
import { readFileSync } from 'fs';

const CASA = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const base = {
  companyId: TENANT, status: 'ativa' as const, pausaAutomatica: true, diasPausa: 3,
  pausaAdiadaAte: null as string | null, assistentePausadaEm: null as string | null,
  diasTravaDisparos: 7, disparosPausadosEm: null as string | null,
};
const aberta = (venceEm: string) => ({ status: 'aberta' as const, venceEm });

describe('podePausar (quem PODE ter a assistente pausada)', () => {
  it('só tenant; nunca a casa nem cliente avulso', () => {
    expect(podePausar({ companyId: TENANT }, CASA)).toBe(true);
    expect(podePausar({ companyId: CASA }, CASA)).toBe(false);
    expect(podePausar({ companyId: null }, CASA)).toBe(false);
  });
});

describe('decidirPausa', () => {
  it('D+2 nada; D+3 pausa', () => {
    expect(decidirPausa(base, [aberta('2026-10-10')], '2026-10-12', CASA)).toBeNull();
    expect(decidirPausa(base, [aberta('2026-10-10')], '2026-10-13', CASA)).toBe('pausar');
  });
  it('a CASA nunca pausa, nem com fatura vencida há meses', () => {
    expect(decidirPausa({ ...base, companyId: CASA }, [aberta('2026-01-10')], '2026-10-13', CASA)).toBeNull();
  });
  it('cliente avulso (sem painel) nunca pausa', () => {
    expect(decidirPausa({ ...base, companyId: null }, [aberta('2026-01-10')], '2026-10-13', CASA)).toBeNull();
  });
  it('"nunca pausar automaticamente" → não pausa', () => {
    expect(decidirPausa({ ...base, pausaAutomatica: false }, [aberta('2026-10-10')], '2026-10-20', CASA)).toBeNull();
  });
  it('"dar mais prazo": pausa só DEPOIS da data combinada', () => {
    const adiada = { ...base, pausaAdiadaAte: '2026-10-16' };
    expect(decidirPausa(adiada, [aberta('2026-10-10')], '2026-10-16', CASA)).toBeNull();
    expect(decidirPausa(adiada, [aberta('2026-10-10')], '2026-10-17', CASA)).toBe('pausar');
  });
  it('dias da pausa configuráveis (5 → D+5)', () => {
    expect(decidirPausa({ ...base, diasPausa: 5 }, [aberta('2026-10-10')], '2026-10-14', CASA)).toBeNull();
    expect(decidirPausa({ ...base, diasPausa: 5 }, [aberta('2026-10-10')], '2026-10-15', CASA)).toBe('pausar');
  });
  it('assinatura pausada/cancelada (sem cobrança) não pausa a assistente', () => {
    expect(decidirPausa({ ...base, status: 'pausada' }, [aberta('2026-10-10')], '2026-10-20', CASA)).toBeNull();
    expect(decidirPausa({ ...base, status: 'cancelada' }, [aberta('2026-10-10')], '2026-10-20', CASA)).toBeNull();
  });
  it('já pausada e ainda devendo → nada até a 2ª trava (idempotente)', () => {
    expect(decidirPausa({ ...base, assistentePausadaEm: '2026-10-13T12:00:00Z' }, [aberta('2026-10-10')], '2026-10-16', CASA)).toBeNull();
  });
  it('pausada e sem fatura vencida em aberto (pagou) → reativar', () => {
    const p = { ...base, assistentePausadaEm: '2026-10-13T12:00:00Z' };
    expect(decidirPausa(p, [], '2026-10-20', CASA)).toBe('reativar');
    expect(decidirPausa(p, [{ status: 'paga', venceEm: '2026-10-10' }, aberta('2026-11-10')], '2026-10-20', CASA)).toBe('reativar');
  });
  it('pausada à mão e pagou → reativa também; casa pausada por engano → reativa', () => {
    expect(decidirPausa({ ...base, companyId: CASA, assistentePausadaEm: 'x' }, [], '2026-10-20', CASA)).toBe('reativar');
  });
  it('fatura mais antiga em aberto é que manda', () => {
    expect(decidirPausa(base, [aberta('2026-11-10'), aberta('2026-10-10')], '2026-10-13', CASA)).toBe('pausar');
  });
});

describe('dataDaPausa (o que o aviso e a tela dizem)', () => {
  it('vencimento + dias; com prazo dado, o dia seguinte ao prazo', () => {
    expect(dataDaPausa('2026-10-10', 3, null)).toBe('2026-10-13');
    expect(dataDaPausa('2026-10-10', 3, '2026-10-16')).toBe('2026-10-17');
    expect(dataDaPausa('2026-10-10', 3, '2026-10-11')).toBe('2026-10-13'); // prazo menor não antecipa
  });
});

describe('cache da pausa (a pergunta é feita a cada mensagem que chega)', () => {
  it('guarda por 60 s; a casa nunca consulta', async () => {
    let consultas = 0; let agora = 0;
    const c = criarCachePausa(async (cid) => { consultas++; return cid === TENANT; }, () => agora);
    expect(await empresaPausadaNoCache(c, TENANT, CASA)).toBe(true);
    expect(await empresaPausadaNoCache(c, TENANT, CASA)).toBe(true);
    expect(consultas).toBe(1);
    expect(await empresaPausadaNoCache(c, CASA, CASA)).toBe(false);
    expect(await empresaPausadaNoCache(c, undefined, CASA)).toBe(false);
    expect(consultas).toBe(1);
    agora = 61_000;
    await empresaPausadaNoCache(c, TENANT, CASA);
    expect(consultas).toBe(2);
    c.limpar(TENANT);
    await empresaPausadaNoCache(c, TENANT, CASA);
    expect(consultas).toBe(3);
  });
  it('erro no banco → NÃO pausa (na dúvida a assistente atende)', async () => {
    const c = criarCachePausa(async () => { throw new Error('db'); });
    expect(await empresaPausadaNoCache(c, TENANT, CASA)).toBe(false);
  });
});

describe('2ª trava — disparos automáticos (padrão D+7)', () => {
  const p1 = { ...base, assistentePausadaEm: '2026-10-13T12:00:00Z' };
  it('D+6 nada; D+7 pausa os disparos (só com a 1ª já ligada)', () => {
    expect(decidirPausa(p1, [aberta('2026-10-10')], '2026-10-16', CASA)).toBeNull();
    expect(decidirPausa(p1, [aberta('2026-10-10')], '2026-10-17', CASA)).toBe('pausar_disparos');
    expect(decidirPausa(base, [aberta('2026-10-10')], '2026-10-17', CASA)).toBe('pausar');
  });
  it('as duas ligadas e ainda devendo → nada; pagou → reativar (desfaz as duas)', () => {
    const p2 = { ...p1, disparosPausadosEm: '2026-10-17T12:00:00Z' };
    expect(decidirPausa(p2, [aberta('2026-10-10')], '2026-10-30', CASA)).toBeNull();
    expect(decidirPausa(p2, [], '2026-10-30', CASA)).toBe('reativar');
    expect(decidirPausa({ ...base, disparosPausadosEm: 'x' }, [], '2026-10-30', CASA)).toBe('reativar');
  });
  it('casa, avulso e "nunca pausar" nunca travam os disparos', () => {
    expect(decidirPausa({ ...p1, companyId: CASA }, [aberta('2026-10-10')], '2026-10-30', CASA)).toBe('reativar'); // casa travada por engano → desfaz
    expect(decidirPausa({ ...base, companyId: null }, [aberta('2026-10-10')], '2026-10-30', CASA)).toBeNull();
    expect(decidirPausa({ ...p1, pausaAutomatica: false }, [aberta('2026-10-10')], '2026-10-30', CASA)).toBeNull();
  });
  it('configurável (10) e "dar mais prazo" empurra as duas mantendo a distância', () => {
    expect(decidirPausa({ ...p1, diasTravaDisparos: 10 }, [aberta('2026-10-10')], '2026-10-19', CASA)).toBeNull();
    expect(decidirPausa({ ...p1, diasTravaDisparos: 10 }, [aberta('2026-10-10')], '2026-10-20', CASA)).toBe('pausar_disparos');
    expect(dataDaTravaDisparos('2026-10-10', 3, 7, null)).toBe('2026-10-17');
    expect(dataDaTravaDisparos('2026-10-10', 3, 7, '2026-10-16')).toBe('2026-10-21');
    expect(decidirPausa({ ...p1, pausaAdiadaAte: '2026-10-16' }, [aberta('2026-10-10')], '2026-10-20', CASA)).toBeNull();
  });
  it('2ª trava sempre depois da 1ª', () => {
    expect(diasTravaDisparosValidos(2, 3)).toBe(4);
    expect(diasTravaDisparosValidos(undefined, 3)).toBe(7);
    expect(diasTravaDisparosValidos(999, 3)).toBe(60);
  });
});

describe('novosHorarios — volta de onde parou, sem enxurrada', () => {
  const desde = '2026-10-17T12:00:00.000Z';
  const agora = '2026-10-27T12:00:00.000Z'; // 10 dias parado
  it('cada disparo anda o tempo que ficou parado (mantém a distância entre toques)', () => {
    const r = novosHorarios([{ id: 'a', quando: '2026-10-18T12:00:00.000Z' }, { id: 'b', quando: '2026-10-21T12:00:00.000Z' }], desde, agora);
    expect(r).toEqual([{ id: 'a', quando: '2026-10-28T12:00:00.000Z' }, { id: 'b', quando: '2026-10-31T12:00:00.000Z' }]);
  });
  it('nada sai colado: 20 disparos vencidos juntos saem espaçados (>= 5 min), a partir de agora + 30 min', () => {
    const itens = Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, quando: '2026-10-17T12:00:00.000Z' }));
    const r = novosHorarios(itens, desde, '2026-10-17T13:00:00.000Z');
    const ts = r.map((x) => Date.parse(x.quando));
    expect(ts[0]).toBeGreaterThanOrEqual(Date.parse('2026-10-17T13:30:00.000Z'));
    for (let i = 1; i < ts.length; i++) expect(ts[i]! - ts[i - 1]!).toBeGreaterThanOrEqual(5 * 60_000);
  });
  it('o que já estava atrasado antes da trava vai pra agora + 30 min (não pro passado)', () => {
    const r = novosHorarios([{ id: 'v', quando: '2026-10-01T12:00:00.000Z' }], desde, agora);
    expect(r[0]!.quando).toBe('2026-10-27T12:30:00.000Z');
  });
});

describe('ponto ÚNICO dos disparos automáticos', () => {
  const OUTRO = 'bbbb1111-2222-3333-4444-555566667777';
  it('segura só as empresas travadas; a casa e lead sem empresa passam; cache de 60 s', async () => {
    let consultas = 0; let t = 0;
    configurarTravaDisparos(async () => { consultas++; return new Set([TENANT]); }, () => t);
    try {
      const itens = [{ c: TENANT }, { c: OUTRO }, { c: CASA }, { c: null }];
      expect((await filtrarDisparosLiberados(itens, (i) => i.c)).map((i) => i.c)).toEqual([OUTRO, CASA, null]);
      expect(await disparoLiberado(TENANT)).toBe(false);
      expect(await disparoLiberado(CASA)).toBe(true);
      expect(await disparoLiberado(OUTRO)).toBe(true);
      expect(consultas).toBe(1);
      t = 61_000; await disparoLiberado(TENANT);
      expect(consultas).toBe(2);
      limparCacheDisparos(); await disparoLiberado(TENANT);
      expect(consultas).toBe(3);
    } finally { configurarTravaDisparos(null); }
  });
  it('sem configuração ou com erro no banco → libera (comportamento de antes)', async () => {
    configurarTravaDisparos(null);
    expect(await disparoLiberado(TENANT)).toBe(true);
    configurarTravaDisparos(async () => { throw new Error('db'); });
    try { expect(await disparoLiberado(TENANT)).toBe(true); } finally { configurarTravaDisparos(null); }
  });
  it('as filas de disparo automático usam o ponto único (teste estático)', () => {
    const ler = (f: string) => readFileSync(f, 'utf-8');
    const sb = ler('src/modules/supabase.ts');
    for (const fn of ['getDueCadenceSteps', 'getDueEvaIntros', 'getDueMaintenanceReminders', 'getDueEmailSteps']) {
      const i = sb.indexOf(`async ${fn}(`);
      const corpo = sb.slice(i, sb.indexOf('\n  async ', i + 10));
      expect(corpo, fn).toContain('filtrarDisparosLiberados(');
    }
    expect(ler('src/modules/post-install.ts')).toContain('filtrarDisparosLiberados(');
    expect(ler('src/modules/reengagement-cadence.ts')).toContain('filtrarDisparosLiberados(');
    expect(ler('src/modules/vendas/followup-vivo.ts')).toContain('filtrarDisparosLiberados(');
    expect(ler('src/index.ts')).toContain('configurarTravaDisparos(');
  });
});

describe('podePausar — produto da assinatura', () => {
  it('só a Assistente virtual (produto) pausa; monitoramento/outro nunca', () => {
    expect(podePausar({ companyId: TENANT, produtoId: 'assistente_virtual' }, CASA)).toBe(true);
    expect(podePausar({ companyId: TENANT, produtoId: 'monitoramento' }, CASA)).toBe(false);
    expect(podePausar({ companyId: TENANT, produtoId: 'outro' }, CASA)).toBe(false);
    expect(decidirPausa({ ...base, produtoId: 'monitoramento' }, [aberta('2026-10-10')], '2026-10-20', CASA)).toBeNull();
  });
});
