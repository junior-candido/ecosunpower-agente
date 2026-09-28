import { describe, it, expect } from 'vitest';
import { proximoStatus, textoAvisoStatus, textoAvisoNuvem, MUDO_APOS_MIN } from '../src/modules/energia/vigia.js';

const AGORA = new Date('2026-09-28T15:00:00Z');
const antes = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString();
const m = (o: Partial<Parameters<typeof proximoStatus>[0]> = {}) => ({
  status: 'ok', modo_coleta: 'push' as const, ultima_leitura_em: antes(1), ativo: true, ...o,
});

describe('vigia de silêncio (olha a CHEGADA de dado, não o "online")', () => {
  it('aguardando → ok na 1ª leitura', () => expect(proximoStatus(m({ status: 'aguardando' }), AGORA)).toEqual({ status: 'ok', mudou: true }));
  it('sem nenhuma leitura continua aguardando', () => expect(proximoStatus(m({ status: 'aguardando', ultima_leitura_em: null }), AGORA)).toEqual({ status: 'aguardando', mudou: false }));
  it('ok → mudo após 31 min (push)', () => {
    expect(proximoStatus(m({ ultima_leitura_em: antes(29) }), AGORA)).toEqual({ status: 'ok', mudou: false });
    expect(proximoStatus(m({ ultima_leitura_em: antes(31) }), AGORA)).toEqual({ status: 'mudo', mudou: true });
  });
  it('nuvem tolera 45 min', () => {
    expect(proximoStatus(m({ modo_coleta: 'nuvem', ultima_leitura_em: antes(40) }), AGORA).status).toBe('ok');
    expect(proximoStatus(m({ modo_coleta: 'nuvem', ultima_leitura_em: antes(46) }), AGORA).status).toBe('mudo');
  });
  it('mudo → ok quando volta', () => expect(proximoStatus(m({ status: 'mudo' }), AGORA)).toEqual({ status: 'ok', mudou: true }));
  it('mudo continua mudo sem repetir', () => expect(proximoStatus(m({ status: 'mudo', ultima_leitura_em: antes(300) }), AGORA)).toEqual({ status: 'mudo', mudou: false }));
  it('"parou" só depois de 30 min ou mais sem dado, em todo modo', () => {
    for (const v of Object.values(MUDO_APOS_MIN)) expect(v).toBeGreaterThanOrEqual(30);
    expect(proximoStatus(m({ modo_coleta: 'push_nuvem', ultima_leitura_em: antes(29) }), AGORA).status).toBe('ok');
  });
  it('inativo não vigia', () => expect(proximoStatus(m({ ativo: false, ultima_leitura_em: antes(999) }), AGORA)).toEqual({ status: 'ok', mudou: false }));
  it('aguardando sem leitura nunca vira mudo (medidor que nunca chegou)', () => {
    expect(proximoStatus(m({ status: 'aguardando', ultima_leitura_em: null }), AGORA).status).toBe('aguardando');
  });
});

describe('texto do aviso ao admin', () => {
  it('mudo: diz desde quando (hora de Brasília) e o que conferir, sem número de consumo', () => {
    const t = textoAvisoStatus({ apelido: 'Medidor Quadro', status: 'mudo', ultima_leitura_em: '2026-09-28T14:20:00Z' }, AGORA);
    expect(t).toContain('Medidor Quadro');
    expect(t).toContain('11:20'); // 14:20Z = 11:20 BRT
    expect(t).toContain('40 min');
    expect(t).toMatch(/Wi-Fi/);
    expect(t).not.toMatch(/kWh|W\b/);
  });
  it('voltou', () => {
    expect(textoAvisoStatus({ apelido: 'Casa', status: 'ok', ultima_leitura_em: '2026-09-28T14:59:00Z' }, AGORA)).toMatch(/voltou/i);
  });
  it('1º dado de um medidor novo: "começou a mandar dado", não "voltou"', () => {
    const t = textoAvisoStatus({ apelido: 'Casa', status: 'ok', anterior: 'aguardando', ultima_leitura_em: '2026-09-28T14:59:00Z' }, AGORA);
    expect(t).toMatch(/começou a mandar dado/);
    expect(t).not.toMatch(/voltou/i);
  });
  it('chave da nuvem recusada pede a chave nova pela plataforma (nunca pelo WhatsApp)', () => {
    const t = textoAvisoNuvem('Casa');
    expect(t).toMatch(/plataforma/);
    expect(t).toMatch(/nunca pelo WhatsApp/);
  });
});
