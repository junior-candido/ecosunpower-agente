// tests/estado-venda-regras.test.ts
import { describe, it, expect } from 'vitest';
import { ESTADOS_VENDA, TRANSICOES, transicaoValida, estadoOuNovo } from '../src/modules/vendas/estado-venda-regras.js';

describe('estado-venda-regras', () => {
  it('lista os estados da spec §3 + NOVO', () => {
    expect(ESTADOS_VENDA).toEqual([
      'NOVO', 'QUALIFICADO', 'PRECIFICANDO', 'AGUARDANDO_OK', 'CHAMA_JUNIOR',
      'PROPOSTA_ENVIADA', 'FOLLOWUP_VIVO', 'AGENDADO', 'QUER_JUNIOR', 'FECHADO', 'PERDIDO',
    ]);
  });

  it('aceita as transições do desenho', () => {
    expect(transicaoValida('NOVO', 'QUALIFICADO')).toBe(true);
    expect(transicaoValida('QUALIFICADO', 'PRECIFICANDO')).toBe(true);
    expect(transicaoValida('QUALIFICADO', 'CHAMA_JUNIOR')).toBe(true);
    expect(transicaoValida('PRECIFICANDO', 'AGUARDANDO_OK')).toBe(true);
    expect(transicaoValida('AGUARDANDO_OK', 'PRECIFICANDO')).toBe(true); // ajuste → refaz
    expect(transicaoValida('AGUARDANDO_OK', 'PROPOSTA_ENVIADA')).toBe(true);
    expect(transicaoValida('CHAMA_JUNIOR', 'PROPOSTA_ENVIADA')).toBe(true);
    expect(transicaoValida('PROPOSTA_ENVIADA', 'FOLLOWUP_VIVO')).toBe(true);
    expect(transicaoValida('FOLLOWUP_VIVO', 'AGENDADO')).toBe(true);
    expect(transicaoValida('AGENDADO', 'FECHADO')).toBe(true);
    expect(transicaoValida('AGENDADO', 'FOLLOWUP_VIVO')).toBe(true); // visita sem fechamento volta pro ritmo
  });

  it('rejeita transições inválidas e estados terminais', () => {
    expect(transicaoValida('NOVO', 'PROPOSTA_ENVIADA')).toBe(false);
    expect(transicaoValida('FECHADO', 'FOLLOWUP_VIVO')).toBe(false);
    expect(transicaoValida('PERDIDO', 'QUALIFICADO')).toBe(false);
    expect(transicaoValida('QUALIFICADO', 'QUALIFICADO')).toBe(false);
  });

  it('QUER_JUNIOR e PERDIDO podem vir de qualquer estado vivo; FECHADO de qualquer estado pós-proposta', () => {
    for (const de of ['QUALIFICADO', 'PRECIFICANDO', 'AGUARDANDO_OK', 'PROPOSTA_ENVIADA', 'FOLLOWUP_VIVO', 'AGENDADO']) {
      expect(transicaoValida(de as any, 'QUER_JUNIOR')).toBe(true);
      expect(transicaoValida(de as any, 'PERDIDO')).toBe(true);
    }
    expect(transicaoValida('NOVO', 'PERDIDO')).toBe(true);
    expect(transicaoValida('PROPOSTA_ENVIADA', 'FECHADO')).toBe(true);
    expect(transicaoValida('QUER_JUNIOR', 'FECHADO')).toBe(true);
    expect(transicaoValida('QUER_JUNIOR', 'PROPOSTA_ENVIADA')).toBe(true); // Junior posta proposta depois do takeover
  });

  it('estadoOuNovo trata null/lixo como NOVO', () => {
    expect(estadoOuNovo(null)).toBe('NOVO');
    expect(estadoOuNovo(undefined)).toBe('NOVO');
    expect(estadoOuNovo('banana')).toBe('NOVO');
    expect(estadoOuNovo('FECHADO')).toBe('FECHADO');
  });

  it('TRANSICOES cobre todo estado', () => {
    for (const e of ESTADOS_VENDA) expect(Array.isArray(TRANSICOES[e])).toBe(true);
  });
});
