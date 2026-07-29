// tests/monitoramento-saj.test.ts
// Adapter SAJ (elekeeper) — partes PURAS: assinatura, cifra da senha,
// credenciais, janela de meses, parse do gráfico e mapa de status.
// Vetores gerados com a conta real do Thiago em 29/07 (sonda no scratchpad):
// login iop (região internacional) ✔, 85 plantas ✔, série diária de julho ✔.
import { describe, it, expect } from 'vitest';
import {
  sajSignature, sajEncryptPassword, parseCreds, mesesNoIntervalo,
  parseCommonChart, statusSaj, parseDataInstalacaoSaj, buildSiteCredenciais,
} from '../src/modules/monitoring/adapters/saj.js';

describe('sajSignature (MD5 ordenado + chave → SHA1 upper)', () => {
  it('bate com o vetor extraído do app elekeeper (validado ao vivo 29/07)', () => {
    const signed = sajSignature({ b: '2', a: '1', timeStamp: 1690000000000, random: 'abc123' });
    expect(signed.signature).toBe('C6E1FC475A7EA4BBABDDC3C18E6F280F66F5E55F');
    // signParams preserva a ORDEM DE INSERÇÃO (não a ordenada) — o backend confere
    expect(signed.signParams).toBe('b,a,timeStamp,random');
  });
});

describe('sajEncryptPassword (AES-128-ECB, chave fixa do app)', () => {
  it('vetor determinístico validado contra o login real', () => {
    expect(sajEncryptPassword('teste')).toBe('c898989f64fd54cf739ec3cc9dba907d');
  });
});

describe('parseCreds', () => {
  it('username+password ok, região padrão internacional (in)', () => {
    const c = parseCreds({ username: 'u', password: 'p' });
    expect('error' in c).toBe(false);
    if (!('error' in c)) {
      expect(c.region).toBe('in');
      expect(c.siteId).toBeUndefined();
    }
  });
  it('aceita site_id da planta e região explícita', () => {
    const c = parseCreds({ username: 'u', password: 'p', site_id: 'UID1', region: 'eu' });
    if (!('error' in c)) {
      expect(c.siteId).toBe('UID1');
      expect(c.region).toBe('eu');
    }
  });
  it('sem username/password → erro claro', () => {
    const c = parseCreds({});
    expect('error' in c).toBe(true);
  });
});

describe('mesesNoIntervalo', () => {
  it('mesmo mês → 1 item', () => {
    expect(mesesNoIntervalo('2026-07-22', '2026-07-28')).toEqual(['2026-07']);
  });
  it('cruzando o ano', () => {
    expect(mesesNoIntervalo('2025-11-20', '2026-01-05')).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('parseCommonChart (série PV_PRODUCTION do mês → geração diária)', () => {
  // Shape REAL da resposta do getCommonChartData (sonda 29/07, planta 13,93 kWp)
  const resposta = {
    showType: 'bar',
    totalEnergy: '77.65',
    xAxis: { coordinateList: ['1', '2', '3', '4'], name: 'Day' },
    yAxis: [
      { legendKey: 'PV_PRODUCTION', dataList: ['24.12', '23.96', '23.57', '6.00'], unit: 'kWh' },
      { legendKey: 'GRID_SELL', dataList: ['1.0', '2.0', '3.0', '4.0'], unit: 'kWh' },
    ],
  };
  it('vira {data, geracao_kwh} com as datas do mês, filtrado pelo range', () => {
    const g = parseCommonChart(resposta, '2026-07', '2026-07-02', '2026-07-03');
    expect(g).toEqual([
      { data: '2026-07-02', geracao_kwh: 23.96 },
      { data: '2026-07-03', geracao_kwh: 23.57 },
    ]);
  });
  it('sem série PV_PRODUCTION → vazio (não inventa número da série errada)', () => {
    const g = parseCommonChart({ xAxis: { coordinateList: ['1'] }, yAxis: [{ legendKey: 'GRID_SELL', dataList: ['9'] }] }, '2026-07', '2026-07-01', '2026-07-31');
    expect(g).toEqual([]);
  });
  it('valor não-numérico é pulado', () => {
    const g = parseCommonChart({ xAxis: { coordinateList: ['1', '2'] }, yAxis: [{ legendKey: 'PV_PRODUCTION', dataList: ['abc', '5.5'] }] }, '2026-07', '2026-07-01', '2026-07-31');
    expect(g).toEqual([{ data: '2026-07-02', geracao_kwh: 5.5 }]);
  });
  it('kWh negativo (lixo do portal) é pulado — geração nunca é negativa', () => {
    const g = parseCommonChart({ xAxis: { coordinateList: ['1', '2'] }, yAxis: [{ legendKey: 'PV_PRODUCTION', dataList: ['-3.2', '5.5'] }] }, '2026-07', '2026-07-01', '2026-07-31');
    expect(g).toEqual([{ data: '2026-07-02', geracao_kwh: 5.5 }]);
  });
  it('data/xAxis ausente → vazio (resposta malformada não quebra)', () => {
    expect(parseCommonChart({ yAxis: [{ legendKey: 'PV_PRODUCTION', dataList: ['5'] }] }, '2026-07', '2026-07-01', '2026-07-31')).toEqual([]);
    expect(parseCommonChart(null, '2026-07', '2026-07-01', '2026-07-31')).toEqual([]);
    expect(parseCommonChart({}, '2026-07', '2026-07-01', '2026-07-31')).toEqual([]);
  });
});

describe('statusSaj (censo real 29/07: 1=ok·73, 2=falha·1, 3=offline·11)', () => {
  it('mapeia runningState', () => {
    expect(statusSaj(1, 'Y')).toBe('ok');
    expect(statusSaj(2, 'Y')).toBe('falha');
    expect(statusSaj(3, 'N')).toBe('offline');
  });
  it('sem runningState cai no isOnline; sem nada → desconhecido', () => {
    expect(statusSaj(null, 'N')).toBe('offline');
    expect(statusSaj(null, 'Y')).toBe('ok');
    expect(statusSaj(undefined, undefined)).toBe('desconhecido');
  });
});

describe('parseDataInstalacaoSaj (createDate dd/MM/yyyy HH:mm:ss → ISO)', () => {
  it('converte', () => {
    expect(parseDataInstalacaoSaj('12/05/2026 16:22:29')).toBe('2026-05-12');
  });
  it('lixo → null', () => {
    expect(parseDataInstalacaoSaj('')).toBeNull();
    expect(parseDataInstalacaoSaj('2026-05-12')).toBeNull();
  });
});

describe('buildSiteCredenciais (padrão site_id do registry — dedupe)', () => {
  it('conta + site_id da planta', () => {
    const c = parseCreds({ username: 'u', password: 'p' });
    if (!('error' in c)) {
      expect(buildSiteCredenciais(c, 'UID9')).toEqual({
        username: 'u', password: 'p', region: 'in', site_id: 'UID9',
      });
    }
  });
});
