import { describe, it, expect } from 'vitest';
import {
  ETAPAS_FIXAS, planejarEtapas, proximoHorarioValido, dentroDoHorario,
  elegivelParaFollowup, proximaEtapaMensal, argumentoDaEtapa,
} from '../src/modules/vendas/followup-vivo-plano.js';

// 2026-08-24 é segunda-feira. 12:00 BRT = 15:00Z
const SEG_12H_BRT = Date.UTC(2026, 7, 24, 15, 0, 0);

describe('planejarEtapas', () => {
  it('gera as etapas fixas a partir do envio, todas em horário válido', () => {
    const etapas = planejarEtapas(SEG_12H_BRT);
    expect(etapas.map(e => e.etapa)).toEqual(['NA24', 'D3', 'D5', 'D8', 'D12', 'D20', 'D35', 'D60', 'D90', 'M1']);
    for (const e of etapas) expect(dentroDoHorario(e.scheduledForMs)).toBe(true);
  });
  it('D3 cai 3 dias depois do envio (mesmo horário, se válido)', () => {
    const d3 = planejarEtapas(SEG_12H_BRT).find(e => e.etapa === 'D3')!;
    expect(d3.scheduledForMs).toBe(SEG_12H_BRT + 3 * 86_400_000);
  });
  it('M1 é 30 dias após D90; proximaEtapaMensal encadeia M2, M3…', () => {
    const m1 = planejarEtapas(SEG_12H_BRT).find(e => e.etapa === 'M1')!;
    expect(m1.scheduledForMs).toBe(proximoHorarioValido(SEG_12H_BRT + 120 * 86_400_000));
    expect(proximaEtapaMensal('M1')).toBe('M2');
    expect(proximaEtapaMensal('M7')).toBe('M8');
    expect(proximaEtapaMensal('D90')).toBe('M1');
  });
});

describe('dentroDoHorario / proximoHorarioValido (8h–20h BRT, nunca domingo)', () => {
  it('21h BRT de segunda → empurra pra terça 8h', () => {
    const seg21 = Date.UTC(2026, 7, 25, 0, 0, 0); // 24/08 21:00 BRT
    expect(dentroDoHorario(seg21)).toBe(false);
    expect(proximoHorarioValido(seg21)).toBe(Date.UTC(2026, 7, 25, 11, 0, 0)); // 25/08 08:00 BRT
  });
  it('sábado 19h ok; domingo qualquer hora → segunda 8h', () => {
    const sab19 = Date.UTC(2026, 7, 29, 22, 0, 0);
    expect(dentroDoHorario(sab19)).toBe(true);
    const dom10 = Date.UTC(2026, 7, 30, 13, 0, 0);
    expect(dentroDoHorario(dom10)).toBe(false);
    expect(proximoHorarioValido(dom10)).toBe(Date.UTC(2026, 7, 31, 11, 0, 0));
  });
  it('7h59 BRT → 8h do mesmo dia', () => {
    const seg0759 = Date.UTC(2026, 7, 24, 10, 59, 0);
    expect(proximoHorarioValido(seg0759)).toBe(Date.UTC(2026, 7, 24, 11, 0, 0));
  });
  it('sábado 20h BRT (limite exclusivo) → domingo bloqueado → segunda 8h', () => {
    const sab20 = Date.UTC(2026, 7, 29, 23, 0, 0); // 29/08 20:00 BRT (sábado)
    expect(dentroDoHorario(sab20)).toBe(false);
    expect(proximoHorarioValido(sab20)).toBe(Date.UTC(2026, 7, 31, 11, 0, 0)); // 31/08 08:00 BRT (segunda)
  });
  it('exatamente 20h BRT de dia útil → empurra pro dia seguinte 8h', () => {
    const seg20 = Date.UTC(2026, 7, 24, 23, 0, 0); // 24/08 20:00 BRT (segunda)
    expect(dentroDoHorario(seg20)).toBe(false);
    expect(proximoHorarioValido(seg20)).toBe(Date.UTC(2026, 7, 25, 11, 0, 0)); // 25/08 08:00 BRT (terça)
  });
  it('exatamente 8h BRT de dia útil → não muda', () => {
    const seg08 = Date.UTC(2026, 7, 24, 11, 0, 0); // 24/08 08:00 BRT (segunda)
    expect(dentroDoHorario(seg08)).toBe(true);
    expect(proximoHorarioValido(seg08)).toBe(seg08);
  });
});

describe('argumentoDaEtapa', () => {
  it.each([
    ['A2H', 'duvida_ab'],
    ['D0', 'resumo'],
    ['POS_VISITA', 'pos_visita'],
    ['M7', 'toque_leve'],
    ['XYZ', 'toque_leve'],
  ])('%s → %s', (etapa, esperado) => {
    expect(argumentoDaEtapa(etapa)).toBe(esperado);
  });
});

describe('elegivelParaFollowup', () => {
  const base = { eva_active: true, opt_out: false, status: 'proposta_enviada', contact_type: 'cliente' };
  it('lead normal sem takeover → elegível', () => {
    expect(elegivelParaFollowup(base, false)).toEqual({ ok: true });
  });
  it.each([
    [{ ...base, eva_active: false }, 'eva_off'],
    [{ ...base, opt_out: true }, 'opt_out'],
    [{ ...base, status: 'perdido' }, 'status_perdido'],
    [{ ...base, status: 'ganho' }, 'status_ganho'],
    [{ ...base, contact_type: 'inviavel' }, 'inviavel'],
  ])('bloqueia %o → %s', (lead, motivo) => {
    expect(elegivelParaFollowup(lead, false)).toEqual({ ok: false, motivo });
  });
  it('takeover do Junior → bloqueia com motivo takeover', () => {
    expect(elegivelParaFollowup(base, true)).toEqual({ ok: false, motivo: 'takeover' });
  });
});

describe('ETAPAS_FIXAS', () => {
  it('tem o argumento de cada etapa (spec §6)', () => {
    expect(ETAPAS_FIXAS.find(e => e.etapa === 'D5')!.argumento).toBe('financiamento');
    expect(ETAPAS_FIXAS.find(e => e.etapa === 'D8')!.argumento).toBe('prova_social');
  });
});
