// tests/estado-venda-regras.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  ESTADOS_VENDA, TRANSICOES, transicaoValida, estadoOuNovo, estadosAlcancaveis, VIVOS_POS_QUALIFICACAO,
  type EstadoVenda,
} from '../src/modules/vendas/estado-venda-regras.js';

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
    expect(transicaoValida('CHAMA_JUNIOR', 'PRECIFICANDO')).toBe(true); // Junior manda precificar
    expect(transicaoValida('PROPOSTA_ENVIADA', 'FOLLOWUP_VIVO')).toBe(true);
    expect(transicaoValida('FOLLOWUP_VIVO', 'AGENDADO')).toBe(true);
    expect(transicaoValida('AGENDADO', 'FECHADO')).toBe(true);
    expect(transicaoValida('AGENDADO', 'FOLLOWUP_VIVO')).toBe(true); // visita sem fechamento volta pro ritmo
  });

  it('rejeita transições inválidas e estados terminais', () => {
    expect(transicaoValida('NOVO', 'PROPOSTA_ENVIADA')).toBe(false);
    expect(transicaoValida('FECHADO', 'FOLLOWUP_VIVO')).toBe(false);
    expect(transicaoValida('PERDIDO', 'FOLLOWUP_VIVO')).toBe(false);
    expect(transicaoValida('QUALIFICADO', 'QUALIFICADO')).toBe(false);
  });

  it('PERDIDO pode reabrir (lead recupera interesse), mas não pula direto pro fechamento', () => {
    expect(transicaoValida('PERDIDO', 'QUALIFICADO')).toBe(true);
    expect(transicaoValida('PERDIDO', 'QUER_JUNIOR')).toBe(true);
    expect(transicaoValida('PERDIDO', 'FECHADO')).toBe(false);
    expect(transicaoValida('PERDIDO', 'PROPOSTA_ENVIADA')).toBe(false);
  });

  it('QUER_JUNIOR e PERDIDO podem vir de qualquer estado vivo; FECHADO de qualquer estado pós-proposta', () => {
    for (const de of VIVOS_POS_QUALIFICACAO) {
      expect(transicaoValida(de, 'QUER_JUNIOR')).toBe(true);
      expect(transicaoValida(de, 'PERDIDO')).toBe(true);
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

  it('estadoOuNovo só aceita string; qualquer outro tipo vira NOVO e retorna string', () => {
    expect(estadoOuNovo(['FECHADO'])).toBe('NOVO');
    expect(estadoOuNovo(42)).toBe('NOVO');
    expect(estadoOuNovo({ estado: 'FECHADO' })).toBe('NOVO');
    expect(typeof estadoOuNovo('QUALIFICADO')).toBe('string');
  });

  it('estadoOuNovo avisa (console.warn) só quando coage um valor não-vazio desconhecido', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    estadoOuNovo(null);
    estadoOuNovo(undefined);
    estadoOuNovo('');
    expect(warn).not.toHaveBeenCalled();
    estadoOuNovo('banana');
    expect(warn).toHaveBeenCalledTimes(1);
    estadoOuNovo(['FECHADO']);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('TRANSICOES cobre todo estado', () => {
    for (const e of ESTADOS_VENDA) expect(Array.isArray(TRANSICOES[e])).toBe(true);
  });

  it('estadosAlcancaveis cobre todo ESTADOS_VENDA a partir de NOVO', () => {
    const alcancaveis = estadosAlcancaveis();
    for (const e of ESTADOS_VENDA) expect(alcancaveis).toContain(e);
  });

  function alcanca(de: EstadoVenda, alvo: EstadoVenda): boolean {
    const vistos = new Set<EstadoVenda>([de]);
    const fila: EstadoVenda[] = [de];
    while (fila.length) {
      const e = fila.shift()!;
      if (e === alvo) return true;
      for (const p of TRANSICOES[e]) if (!vistos.has(p)) { vistos.add(p); fila.push(p); }
    }
    return false;
  }

  it('todo estado não-terminal alcança FECHADO e PERDIDO (PERDIDO não é mais terminal; FECHADO continua sendo)', () => {
    for (const e of ESTADOS_VENDA) {
      if (e === 'FECHADO') continue;
      expect(alcanca(e, 'FECHADO')).toBe(true);
      expect(alcanca(e, 'PERDIDO')).toBe(true);
    }
    expect(TRANSICOES.FECHADO).toEqual([]);
  });
});
