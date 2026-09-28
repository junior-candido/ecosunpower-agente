import { describe, it, expect } from 'vitest';
import { parseEmdataCsv, janelasDoEmdata, sqlBackfill } from '../src/modules/energia/backfill-emdata.js';

// 00:00 BRT de 08/09/2026 = 1788836400 (03:00Z). Fixture sintética.
const T0 = Date.UTC(2026, 8, 8, 3, 0) / 1000;
const csv = (n: number, pular: number[] = []) => [
  'timestamp,a_total_act_energy,a_total_act_ret_energy,c_total_act_energy,c_total_act_ret_energy,c_max_act_power,c_min_voltage,c_max_voltage,c_avg_voltage',
  ...Array.from({ length: n }, (_, i) => i).filter((i) => !pular.includes(i))
    .map((i) => `${T0 + i * 60},0,0,16.667,0,1100,224,${i === 3 ? 243 : 228},226`),
].join('\n');

describe('backfill pela memória do aparelho (EMData)', () => {
  it('lê o CSV e soma a fase C em janelas de 15 min', () => {
    const js = janelasDoEmdata(parseEmdataCsv(csv(30)), 'c', { tensaoNominal: 220 });
    expect(js).toHaveLength(2);
    expect(js[0].inicio).toBe('2026-09-08T03:00:00.000Z');
    expect(js[0].importadoWh).toBeCloseTo(250, 1);
    expect(js[0].segundosCobertos).toBe(900);
    expect(js[0].minAcima242).toBe(1);
    expect(js[0].potenciaMaxW).toBe(1100);
  });
  it('minuto que falta = menos cobertura, nunca zero inventado', () => {
    const js = janelasDoEmdata(parseEmdataCsv(csv(15, [2, 3, 4])), 'c', { tensaoNominal: 220 });
    expect(js[0].segundosCobertos).toBe(720);
    expect(js[0].importadoWh).toBeCloseTo(12 * 16.667, 2);
  });
  it('ignora relógio zerado (1970) e linha lixo', () => {
    const r = parseEmdataCsv('timestamp,c_total_act_energy\n10,5\nabc,1\n' + `${T0},2`);
    expect(r).toHaveLength(1);
  });
  it('SQL só preenche buraco (on conflict do nothing), escapa texto e marca fonte backfill', () => {
    const js = janelasDoEmdata(parseEmdataCsv(csv(15)), 'c', { tensaoNominal: 220 });
    const sql = sqlBackfill(js, { companyId: "00000000-0000-0000-0000-000000000001", deviceId: "007007422d90'; drop table x; --", canal: 2 });
    expect(sql).toContain('on conflict (medidor_id, papel, canal, inicio) do nothing');
    expect(sql).toContain("'backfill'");
    expect(sql).toContain("007007422d90''; drop table x; --'");
  });
});
