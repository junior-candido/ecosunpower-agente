// Testa o adapter FoxESS (granularidade = USINA, somando os micros). Cobre
// parsing das credenciais, a ASSINATURA (MD5 com "\r\n" literal — o erro
// clássico), capacidade por deviceType, os meses do intervalo, e o parse do
// report diário (values[] do mês → kWh por dia). A rede ganha teste ao vivo.

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  parseCreds,
  buildSiteCredenciais,
  capacidadeKw,
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
  it('aceita { apiKey } + site_id (stationID) + deviceSNs (array)', () => {
    const c = parseCreds({ apiKey: 'KEY123', site_id: 'STATION-1', deviceSNs: ['SNA', 'SNB'] }) as ParsedCreds;
    expect(c.apiKey).toBe('KEY123');
    expect(c.siteId).toBe('STATION-1');
    expect(c.deviceSNs).toEqual(['SNA', 'SNB']);
  });

  it('aceita deviceSNs como string separada por vírgula', () => {
    const c = parseCreds({ apiKey: 'K', site_id: 'S', deviceSNs: 'SN1, SN2 ,SN3' }) as ParsedCreds;
    expect(c.deviceSNs).toEqual(['SN1', 'SN2', 'SN3']);
  });

  it('compat: entrada antiga (só site_id = deviceSN) vira deviceSNs=[site_id]', () => {
    const c = parseCreds({ apiKey: 'K', site_id: '60Q12520' }) as ParsedCreds;
    expect(c.deviceSNs).toEqual(['60Q12520']);
  });

  it('erro sem apiKey', () => {
    const r = parseCreds({ foo: 'bar' });
    expect('error' in r).toBe(true);
    expect((r as { error: string }).error).toMatch(/apiKey/);
  });
});

// ============================================================================
// capacidadeKw — deviceType "Q1-2500-E" → 2.5 kW
// ============================================================================

describe('capacidadeKw', () => {
  it('Q1-2500-E → 2.5 kW', () => expect(capacidadeKw('Q1-2500-E')).toBe(2.5));
  it('T10-G3 (sem watts de 3-5 dígitos plausível) usa o número achado', () => {
    // garante que pega o 1o grupo numérico de 3-5 dígitos; "T10-G3" não casa → 0
    expect(capacidadeKw('T10-G3')).toBe(0);
  });
  it('vazio/desconhecido → 0', () => {
    expect(capacidadeKw(undefined)).toBe(0);
    expect(capacidadeKw('abc')).toBe(0);
  });
});

// ============================================================================
// foxSign — o "\r\n" tem que ser LITERAL (\ r \ n), não CR/LF de verdade
// ============================================================================

describe('foxSign', () => {
  it('usa o "\\r\\n" LITERAL (não os bytes CR/LF)', () => {
    const esperadoLiteral = crypto.createHash('md5').update('/op/v0/device/list\\r\\nTOKEN\\r\\n123', 'utf8').digest('hex');
    expect(foxSign('/op/v0/device/list', 'TOKEN', 123)).toBe(esperadoLiteral);
  });

  it('NÃO bate se alguém usar CR/LF real (prova que o literal importa)', () => {
    const comCrlfReal = crypto.createHash('md5').update('/op/v0/device/list\r\nTOKEN\r\n123', 'utf8').digest('hex');
    expect(foxSign('/op/v0/device/list', 'TOKEN', 123)).not.toBe(comCrlfReal);
  });

  it('é hex de 32 chars e muda com o timestamp', () => {
    expect(foxSign('/p', 'T', 1)).toMatch(/^[0-9a-f]{32}$/);
    expect(foxSign('/p', 'T', 1)).not.toBe(foxSign('/p', 'T', 2));
  });
});

// ============================================================================
// mesesNoIntervalo
// ============================================================================

describe('mesesNoIntervalo', () => {
  it('mês único', () => {
    expect(mesesNoIntervalo('2026-06-01', '2026-06-26')).toEqual([{ year: 2026, month: 6 }]);
  });
  it('cruza meses e ano', () => {
    expect(mesesNoIntervalo('2025-12-15', '2026-02-02')).toEqual([
      { year: 2025, month: 12 }, { year: 2026, month: 1 }, { year: 2026, month: 2 },
    ]);
  });
});

// ============================================================================
// parseReportMes — values[] do mês → kWh por dia (1 micro)
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

  it('acha a série "generation" mesmo com outras no array; aceita string', () => {
    const result = [{ variable: 'feedin', values: [99] }, { variable: 'generation', values: ['7.7'] }];
    expect(parseReportMes(result, 2026, 1)).toEqual([{ data: '2026-01-01', geracao_kwh: 7.7 }]);
  });

  it('vazio quando result não é array', () => {
    expect(parseReportMes(null, 2026, 6)).toEqual([]);
  });
});

// ============================================================================
// buildSiteCredenciais + extractAccountCreds + guardas
// ============================================================================

describe('credenciais por usina e conta', () => {
  it('buildSiteCredenciais grava site_id (stationID) + deviceSNs', () => {
    const conta = parseCreds({ apiKey: 'K' }) as ParsedCreds;
    expect(buildSiteCredenciais(conta, 'STATION-9', ['SN1', 'SN2'])).toEqual({
      apiKey: 'K', site_id: 'STATION-9', deviceSNs: ['SN1', 'SN2'],
    });
  });

  it('credenciais por usina reparseiam com os deviceSNs', () => {
    const conta = parseCreds({ apiKey: 'K' }) as ParsedCreds;
    const re = parseCreds(buildSiteCredenciais(conta, 'ST', ['A', 'B', 'C'])) as ParsedCreds;
    expect(re.siteId).toBe('ST');
    expect(re.deviceSNs).toEqual(['A', 'B', 'C']);
  });

  it('extractAccountCreds devolve só a apiKey', () => {
    expect(foxessAdapter.extractAccountCreds!({ apiKey: 'K', site_id: 'ST', deviceSNs: ['A'] })).toEqual({ apiKey: 'K' });
  });

  it('extractAccountCreds null sem apiKey', () => {
    expect(foxessAdapter.extractAccountCreds!({ foo: 'x' })).toBeNull();
  });

  it('fetchGeneration exige deviceSNs (usina sem micro)', async () => {
    const r = await foxessAdapter.fetchGeneration({ apiKey: 'K' }, '2026-06-01', '2026-06-26');
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/deviceSNs|micros/);
  });

  it('listSites rejeita credencial inválida antes da rede', async () => {
    const r = await foxessAdapter.listSites!({ foo: 'bar' });
    expect(r.ok).toBe(false);
    expect((r as { invalidCredentials?: boolean }).invalidCredentials).toBe(true);
  });
});
