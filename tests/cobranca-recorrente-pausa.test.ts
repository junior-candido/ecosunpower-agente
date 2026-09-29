// "Se não pagar, a assistente para" (28/09/2026) — regra PURA da pausa por
// inadimplência. Só a assistente de um TENANT pausa; a casa (EcoSun) e cliente
// avulso nunca. D+3 (configurável), "dar mais prazo", "nunca pausar", e volta
// sozinha quando não há mais fatura vencida em aberto.
import { describe, it, expect } from 'vitest';
import { decidirPausa, dataDaPausa, podePausar, empresaPausadaNoCache, criarCachePausa } from '../src/modules/cobranca-recorrente/pausa.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const base = {
  companyId: TENANT, status: 'ativa' as const, pausaAutomatica: true, diasPausa: 3,
  pausaAdiadaAte: null as string | null, assistentePausadaEm: null as string | null,
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
  it('já pausada e ainda devendo → nada (idempotente)', () => {
    expect(decidirPausa({ ...base, assistentePausadaEm: '2026-10-13T12:00:00Z' }, [aberta('2026-10-10')], '2026-10-20', CASA)).toBeNull();
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
