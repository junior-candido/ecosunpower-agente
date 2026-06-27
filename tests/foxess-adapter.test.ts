// Testa o adapter FoxESS. Cobre parsing das credenciais, a ASSINATURA (MD5 com
// "\r\n" literal — o erro clássico), os meses do intervalo, e o parse do report
// diário (values[] do mês → kWh por dia). A rede ganha teste ao vivo com a key.

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  parseCreds,
  buildSiteCredenciais,
  foxSign,
  mesesNoIntervalo,
  parseReportMes,
  foxessAdapter,
  type ParsedCreds,
} from '../src/modules/monitoring/adapters/foxess.js';

// ============================================================================
// parseCreds
// ============================================================================

describe('parseCreds', () => {
  it('aceita { apiKey }', () => {
    const c = parseCreds({ apiKey: 'KEY123' }) as ParsedCreds;
    expect(c.apiKey).toBe('KEY123');
    expect(c.siteId).toBeUndefined();
  });

  it('aceita aliases (api_key, token) + deviceSN/sn como site', () => {
    expect((parseCreds({ token: 'K' }) as ParsedCreds).apiKey).toBe('K');
    expect((parseCreds({ apiKey: 'K', deviceSN: 'SN9' }) as ParsedCreds).siteId).toBe('SN9');
    expect((parseCreds({ apiKey: 'K', site_id: 'SN1', sn: 'SN2' }) as ParsedCreds).siteId).toBe('SN1');
  });

  it('erro sem apiKey', () => {
    const r = parseCreds({ foo: 'bar' });
    expect('error' in r).toBe(true);
    expect((r as { error: string }).error).toMatch(/apiKey/);
  });
});

// ============================================================================
// foxSign — o "\r\n" tem que ser LITERAL (\ r \ n), não CR/LF de verdade
// ============================================================================

describe('foxSign', () => {
  it('usa o "\\r\\n" LITERAL (não os bytes CR/LF)', () => {
    const esperadoLiteral = crypto
      .createHash('md5')
      .update('/op/v0/device/list\\r\\nTOKEN\\r\\n123', 'utf8')
      .digest('hex');
    expect(foxSign('/op/v0/device/list', 'TOKEN', 123)).toBe(esperadoLiteral);
  });

  it('NÃO bate se alguém usar CR/LF real (prova que o literal importa)', () => {
    const comCrlfReal = crypto
      .createHash('md5')
      .update('/op/v0/device/list\r\nTOKEN\r\n123', 'utf8')
      .digest('hex');
    expect(foxSign('/op/v0/device/list', 'TOKEN', 123)).not.toBe(comCrlfReal);
  });

  it('é hex de 32 chars e muda com o timestamp', () => {
    const a = foxSign('/p', 'T', 1);
    const b = foxSign('/p', 'T', 2);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});

// ============================================================================
// mesesNoIntervalo
// ============================================================================

describe('mesesNoIntervalo', () => {
  it('mês único', () => {
    expect(mesesNoIntervalo('2026-06-01', '2026-06-26')).toEqual([{ year: 2026, month: 6 }]);
  });
  it('cruza meses', () => {
    expect(mesesNoIntervalo('2026-05-20', '2026-07-03')).toEqual([
      { year: 2026, month: 5 }, { year: 2026, month: 6 }, { year: 2026, month: 7 },
    ]);
  });
  it('cruza o ano', () => {
    expect(mesesNoIntervalo('2025-12-15', '2026-02-02')).toEqual([
      { year: 2025, month: 12 }, { year: 2026, month: 1 }, { year: 2026, month: 2 },
    ]);
  });
});

// ============================================================================
// parseReportMes — values[] do mês → kWh por dia
// ============================================================================

describe('parseReportMes', () => {
  it('mapeia índice→dia e ignora null (dias futuros)', () => {
    const result = [{ variable: 'generation', unit: 'kWh', values: [12.5, 8.2, null, 0] }];
    expect(parseReportMes(result, 2026, 6)).toEqual([
      { data: '2026-06-01', geracao_kwh: 12.5 },
      { data: '2026-06-02', geracao_kwh: 8.2 },
      { data: '2026-06-04', geracao_kwh: 0 },
    ]);
  });

  it('acha a série "generation" mesmo com outras no array', () => {
    const result = [
      { variable: 'feedin', values: [99] },
      { variable: 'generation', values: [7.7] },
    ];
    expect(parseReportMes(result, 2026, 1)).toEqual([{ data: '2026-01-01', geracao_kwh: 7.7 }]);
  });

  it('aceita string numérica e zera negativo', () => {
    const result = [{ variable: 'generation', values: ['15.3', -2] }];
    expect(parseReportMes(result, 2026, 12)).toEqual([
      { data: '2026-12-01', geracao_kwh: 15.3 },
      { data: '2026-12-02', geracao_kwh: 0 },
    ]);
  });

  it('vazio quando result não é array', () => {
    expect(parseReportMes(null, 2026, 6)).toEqual([]);
  });
});

// ============================================================================
// buildSiteCredenciais + extractAccountCreds + guardas
// ============================================================================

describe('credenciais por planta e conta', () => {
  it('buildSiteCredenciais grava site_id (deviceSN)', () => {
    const conta = parseCreds({ apiKey: 'K' }) as ParsedCreds;
    expect(buildSiteCredenciais(conta, 'SN123')).toEqual({ apiKey: 'K', site_id: 'SN123' });
  });

  it('extractAccountCreds devolve só a apiKey', () => {
    const acc = foxessAdapter.extractAccountCreds!({ apiKey: 'K', site_id: 'SN' });
    expect(acc).toEqual({ apiKey: 'K' });
  });

  it('extractAccountCreds null sem apiKey', () => {
    expect(foxessAdapter.extractAccountCreds!({ foo: 'x' })).toBeNull();
  });

  it('fetchGeneration exige site_id', async () => {
    const r = await foxessAdapter.fetchGeneration({ apiKey: 'K' }, '2026-06-01', '2026-06-26');
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/site_id|deviceSN/);
  });

  it('listSites rejeita credencial inválida antes da rede', async () => {
    const r = await foxessAdapter.listSites!({ foo: 'bar' });
    expect(r.ok).toBe(false);
    expect((r as { invalidCredentials?: boolean }).invalidCredentials).toBe(true);
  });
});
