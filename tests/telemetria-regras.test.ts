// tests/telemetria-regras.test.ts
// Fase 2B: vigias de tensão e corrente sobre as medições finas (últimos 3 dias).
// Regra 1: tensao_fase* com máx diário > 242 V em ≥2 dos 3 dias → tensao_rede_alta.
// Regra 2: corrente_pv*/corrente_mppt* com máx diário = 0 em dia COM geração,
//          em ≥2 dos 3 dias → string_zerada (usina parada não dispara).
import { describe, it, expect } from 'vitest';
import { avaliarTelemetriaUsina } from '../src/modules/monitoring/proactive-alerts/telemetria-regras.js';

const m = (ponto: string, dia: string, valor: number) => ({ ponto, ts: `${dia}T17:00:00Z`, valor });
const GER_OK = new Map([['2026-07-26', 20], ['2026-07-27', 22], ['2026-07-28', 21]]);

describe('tensao_rede_alta', () => {
  it('pico > 242 V em 2 dos 3 dias dispara, com o pico no texto', () => {
    const alertas = avaliarTelemetriaUsina([
      m('tensao_fase_r', '2026-07-26', 248.3),
      m('tensao_fase_r', '2026-07-27', 245.1),
      m('tensao_fase_r', '2026-07-28', 231.0),
    ], GER_OK);
    const a = alertas.find((x) => x.tipo === 'tensao_rede_alta');
    expect(a).toBeTruthy();
    expect(a!.severidade).toBe('aviso');
    expect(a!.texto).toContain('248');
    expect(a!.texto.toLowerCase()).toContain('rede');
  });

  it('pico alto em só 1 dia NÃO dispara (blip)', () => {
    const alertas = avaliarTelemetriaUsina([
      m('tensao_fase_r', '2026-07-26', 250.0),
      m('tensao_fase_r', '2026-07-27', 230.0),
      m('tensao_fase_r', '2026-07-28', 229.0),
    ], GER_OK);
    expect(alertas.find((x) => x.tipo === 'tensao_rede_alta')).toBeUndefined();
  });

  it('várias leituras no dia: vale o MÁXIMO do dia', () => {
    const alertas = avaliarTelemetriaUsina([
      m('tensao_fase_r', '2026-07-26', 220.0),
      { ponto: 'tensao_fase_r', ts: '2026-07-26T18:30:00Z', valor: 246.0 },
      m('tensao_fase_r', '2026-07-27', 244.0),
    ], GER_OK);
    expect(alertas.find((x) => x.tipo === 'tensao_rede_alta')).toBeTruthy();
  });
});

describe('string_zerada', () => {
  it('entrada zerada 2 dias COM geração dispara e nomeia a entrada', () => {
    const alertas = avaliarTelemetriaUsina([
      m('corrente_pv1', '2026-07-26', 0), m('corrente_pv2', '2026-07-26', 8.1),
      m('corrente_pv1', '2026-07-27', 0), m('corrente_pv2', '2026-07-27', 7.9),
    ], GER_OK);
    const a = alertas.find((x) => x.tipo === 'string_zerada');
    expect(a).toBeTruthy();
    expect(a!.texto).toContain('pv1');
    expect(a!.texto).not.toContain('pv2');
  });

  it('usina SEM geração no dia não conta (offline já cobre)', () => {
    const semGeracao = new Map([['2026-07-26', 0], ['2026-07-27', 0], ['2026-07-28', 0]]);
    const alertas = avaliarTelemetriaUsina([
      m('corrente_pv1', '2026-07-26', 0),
      m('corrente_pv1', '2026-07-27', 0),
    ], semGeracao);
    expect(alertas.find((x) => x.tipo === 'string_zerada')).toBeUndefined();
  });

  it('duas entradas zeradas = UM alerta listando as duas', () => {
    const alertas = avaliarTelemetriaUsina([
      m('corrente_pv1', '2026-07-26', 0), m('corrente_mppt2', '2026-07-26', 0),
      m('corrente_pv1', '2026-07-27', 0), m('corrente_mppt2', '2026-07-27', 0),
    ], GER_OK);
    const lista = alertas.filter((x) => x.tipo === 'string_zerada');
    expect(lista).toHaveLength(1);
    expect(lista[0].texto).toContain('pv1');
    expect(lista[0].texto).toContain('mppt2');
  });

  it('corrente saudável não dispara nada', () => {
    const alertas = avaliarTelemetriaUsina([
      m('corrente_pv1', '2026-07-26', 8.0),
      m('corrente_pv1', '2026-07-27', 7.5),
    ], GER_OK);
    expect(alertas).toHaveLength(0);
  });
});

// Integração: detect de GERAÇÃO não pode resolver alerta de telemetria, e o
// formato dos tipos novos precisa existir (header + botões de operador).
import { detectarAlertasPendentes } from '../src/modules/monitoring/proactive-alerts/detect.js';
import { formatAlertMessage } from '../src/modules/monitoring/proactive-alerts/format.js';

describe('convivência com o detect de geração', () => {
  it('sistema saudável NÃO resolve o tensao_rede_alta aberto (família separada)', () => {
    const aberto = {
      id: 'al-1', sistema_id: 's1', tipo: 'tensao_rede_alta', severidade: 'aviso',
      texto: 'x', primeiro_visto_em: 'T', last_sent_at: null, next_send_at: null,
      snoozed_until: null, resolved_at: null,
    } as any;
    const out = detectarAlertasPendentes([
      { id: 's1', lead_id: null, ativo: true, ultimo_erro: null, potencia_kwp: 10, uf: 'DF', diasSemGeracao: 0, realUltimos7: 300 },
    ] as any, [aberto], new Date());
    expect(out.resolvidos).not.toContain('al-1');
  });
});

describe('formato dos tipos de telemetria', () => {
  const sistema = { id: 's1', apelido: 'Usina A', potencia_kwp: 5, marca_inversor: 'foxess' };
  it('tensao_rede_alta: header ⚡ + botões de operador', () => {
    const f = formatAlertMessage({ tipo: 'tensao_rede_alta', texto: 'Tensão da rede alta: pico 248 V.' } as any, sistema as any, { id: 'l1', name: 'André', phone: '55' } as any);
    expect(f.texto).toContain('TENSÃO ALTA');
    expect(f.texto).toContain('248');
    expect(f.botoes.map((b) => b.title).join('|')).toContain('Já resolvi');
  });
  it('string_zerada: header 🔌', () => {
    const f = formatAlertMessage({ tipo: 'string_zerada', texto: 'Entrada(s) pv1 sem corrente.' } as any, sistema as any, { id: 'l1', name: 'André', phone: '55' } as any);
    expect(f.texto).toContain('STRING ZERADA');
  });
});
