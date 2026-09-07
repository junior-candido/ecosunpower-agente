import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  palavraSemAcento,
  temLixoDeCodificacao,
  aplicarTravaPortugues,
} from '../src/modules/email/portugues.js';

describe('palavraSemAcento', () => {
  it('acha as palavras que denunciam texto sem acento', () => {
    expect(palavraSemAcento('Ola, Maria!')).toBe('ola');
    expect(palavraSemAcento('Que bom ter voce por aqui')).toBe('voce');
    expect(palavraSemAcento('tres duvidas comuns')).toBe('tres');
    expect(palavraSemAcento('uma historia de verdade')).toBe('historia');
    expect(palavraSemAcento('cada mes que passa')).toBe('mes');
    expect(palavraSemAcento('nao quero insistir')).toBe('nao');
  });

  it('nao acusa o texto escrito certo', () => {
    expect(palavraSemAcento('Olá, Maria! Que bom ter você por aqui.')).toBeNull();
    expect(palavraSemAcento('Três dúvidas que quase todo mundo tem')).toBeNull();
    expect(palavraSemAcento('Cada mês que passa é uma escolha')).toBeNull();
  });

  // A busca e por palavra inteira: "nao" nao pode casar dentro de "naopode",
  // e "mes" nao pode casar dentro de "mesa" ou "mesmo".
  it('nao confunde com palavra que so CONTEM a sequencia', () => {
    expect(palavraSemAcento('a mesa da cozinha')).toBeNull();
    expect(palavraSemAcento('e o mesmo sol de sempre')).toBeNull();
    expect(palavraSemAcento('ele se chama Olavo')).toBeNull();
    expect(palavraSemAcento('o resultado e otimo')).toBe('otimo');
  });

  // Palavras que sao CORRETAS sem acento. Uma versao anterior desta trava
  // acusava "meses" (plural de mes perde o acento) e bloqueava texto bom —
  // alarme falso e pior que a falha, porque derruba o e-mail certo.
  it('nao acusa palavra que e correta sem acento', () => {
    expect(palavraSemAcento('ficou meses so pensando')).toBeNull();
    expect(palavraSemAcento('obrigado pela sua atencao'.replace('atencao', 'atenção'))).toBeNull();
    expect(palavraSemAcento('o mesmo sistema para a mesma casa')).toBeNull();
    expect(palavraSemAcento('sobre energia solar e economia')).toBeNull();
  });

  it('ignora o que esta dentro de tag e de marcador', () => {
    expect(palavraSemAcento('<a href="https://x.com/ola/voce">Olá</a>')).toBeNull();
    expect(palavraSemAcento('<p>Olá, {nome}!</p>')).toBeNull();
  });

  it('aceita texto vazio sem quebrar', () => {
    expect(palavraSemAcento('')).toBeNull();
    expect(palavraSemAcento(null as unknown as string)).toBeNull();
  });
});

describe('temLixoDeCodificacao', () => {
  it('acha o travessao corrompido que estava nos 6 modelos', () => {
    expect(temLixoDeCodificacao('CREA/CFT â€” EcoSunPower')).toBe(true);
  });

  it('acha outras marcas classicas de UTF-8 lido como Latin-1', () => {
    expect(temLixoDeCodificacao('voÃª')).toBe(true);
    expect(temLixoDeCodificacao('ï¿½')).toBe(true);
  });

  it('nao acusa texto acentuado de verdade', () => {
    expect(temLixoDeCodificacao('Olá, você! Três dúvidas — e a solução.')).toBe(false);
  });
});

describe('aplicarTravaPortugues', () => {
  it('deixa passar o texto correto', () => {
    expect(aplicarTravaPortugues('Cada mês que passa é uma escolha', 'reserva')).toBe(
      'Cada mês que passa é uma escolha',
    );
  });

  it('descarta e usa a reserva quando falta acento', () => {
    expect(aplicarTravaPortugues('Cada mes que passa e uma escolha', 'reserva')).toBe('reserva');
  });

  it('descarta e usa a reserva quando ha lixo de codificacao', () => {
    expect(aplicarTravaPortugues('Bom dia â€” tudo certo', 'reserva')).toBe('reserva');
  });

  it('texto vazio cai na reserva', () => {
    expect(aplicarTravaPortugues('', 'reserva')).toBe('reserva');
    expect(aplicarTravaPortugues('   ', 'reserva')).toBe('reserva');
  });
});

// A prova que importa: a semente que TODA empresa clonada recebe tem que
// passar na trava. Foi por nao existir esse teste que 744 e-mails sairam
// escritos "Ola, voce" antes de alguem notar.
describe('a semente de e-mail que vai pro cliente', () => {
  const sql = readFileSync('supabase/migrations/122_email_modelos_portugues.sql', 'utf8');

  it('a migration 122 nao tem lixo de codificacao', () => {
    expect(temLixoDeCodificacao(sql)).toBe(false);
  });

  it('todo texto entre aspas da migration 122 passa na trava', () => {
    // Pega o conteudo de cada string SQL (entre aspas simples).
    const trechos = sql.match(/'(?:[^']|'')*'/g) ?? [];
    expect(trechos.length).toBeGreaterThanOrEqual(12); // 6 assuntos + 6 corpos
    const problemas = trechos
      .map((t) => ({ t, palavra: palavraSemAcento(t) }))
      .filter((x) => x.palavra);
    expect(problemas.map((p) => `${p.palavra} em ${p.t.slice(0, 60)}`)).toEqual([]);
  });
});
