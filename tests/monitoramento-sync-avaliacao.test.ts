// tests/monitoramento-sync-avaliacao.test.ts
// O sync marcava "sincronizado agora" mesmo quando o portal não devolvia NADA
// (GoodWe desde 23/09, várias Deye/NEP/SolarEdge por dias). Regra nova (pura):
//   - parte da busca falhou            → erro (não é sucesso)
//   - 0 dias na janela, e já teve dado → erro "o portal não devolveu geração desde DD/MM"
//   - último dia devolvido < ontem     → erro (dado parado há mais de 24 h)
//   - usina nova sem dado nenhum ainda → segue como antes (sucesso)
import { describe, it, expect } from 'vitest';
import { avaliarSync } from '../src/modules/monitoring/sync-avaliacao.js';

const HOJE = '2026-09-29';

describe('avaliarSync', () => {
  it('dias completos até hoje → sucesso', () => {
    const r = avaliarSync({
      marca: 'deye', hoje: HOJE, ultimaDataComGeracao: '2026-09-28',
      geracoes: [{ data: '2026-09-28', geracao_kwh: 20 }, { data: '2026-09-29', geracao_kwh: 5 }],
    });
    expect(r).toEqual({ ok: true });
  });

  it('até ontem (hoje ainda não chegou) → sucesso', () => {
    const r = avaliarSync({
      marca: 'nep', hoje: HOJE, ultimaDataComGeracao: '2026-09-28',
      geracoes: [{ data: '2026-09-28', geracao_kwh: 20 }],
    });
    expect(r.ok).toBe(true);
  });

  it('GoodWe: janela vazia e usina já teve dado → erro com a data e sem "sucesso"', () => {
    const r = avaliarSync({ marca: 'goodwe', hoje: HOJE, ultimaDataComGeracao: '2026-09-23', geracoes: [] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/^GoodWe: o portal não devolveu geração desde 23\/09/);
    expect(r.erro).toMatch(/inversor sem internet ou a integração/);
  });

  it('Deye: último dia devolvido é anteontem → dado parado, erro', () => {
    const r = avaliarSync({
      marca: 'deye', hoje: HOJE, ultimaDataComGeracao: '2026-09-20',
      geracoes: [{ data: '2026-09-25', geracao_kwh: 12 }, { data: '2026-09-27', geracao_kwh: 11 }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/^Deye: o portal não devolveu geração desde 27\/09/);
  });

  it('usina nova, nunca teve dado e portal vazio → segue sucesso (nada a acusar ainda)', () => {
    const r = avaliarSync({ marca: 'solaredge', hoje: HOJE, ultimaDataComGeracao: null, geracoes: [] });
    expect(r.ok).toBe(true);
  });

  it('falha parcial → erro com a marca na frente, mesmo com dias válidos', () => {
    const r = avaliarSync({
      marca: 'foxess', hoje: HOJE, ultimaDataComGeracao: '2026-09-28',
      geracoes: [{ data: '2026-09-29', geracao_kwh: 3 }],
      falhaParcial: '3 de 30 micros não responderam',
    });
    expect(r).toEqual({ ok: false, erro: 'FoxESS: 3 de 30 micros não responderam' });
  });
});
