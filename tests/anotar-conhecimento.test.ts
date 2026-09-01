// tests/anotar-conhecimento.test.ts
//
// Junior 01/09/2026: "como a Clara vai estar em um grupo que fala muito disso,
// se ela pudesse armazenar esse conhecimento... como uma estagiária eficiente".
//
// Estagiária eficiente ouve tudo, fala pouco, anota o que mandam anotar e
// pergunta quando não tem certeza. NUNCA grava por conta própria o que ouviu de
// passagem — conversa de grupo é cheia de achismo, e aprender errado é pior que
// não aprender: ela passaria a prometer isso pro cliente.
import { describe, it, expect } from 'vitest';
import { lerPedidoDeAnotar, escolherAssunto, chamouPeloNome } from '../src/modules/anotar-conhecimento.js';

const assuntos = [
  { chave: 'produto', titulo: 'O que a empresa vende' },
  { chave: 'marcas', titulo: 'Marcas com que trabalha' },
  { chave: 'garantia', titulo: 'Garantias que oferece' },
  { chave: 'regiao', titulo: 'Onde atende' },
  { chave: 'processo', titulo: 'Como funciona do orçamento à instalação' },
];

describe('pedido de anotar (a estagiária só anota quando mandam)', () => {
  it('entende o pedido com o assunto dito na lata', () => {
    const p = lerPedidoDeAnotar('Clara, anota em garantia: a instalação tem 12 meses', 'Clara');
    expect(p).not.toBeNull();
    expect(p!.assuntoDito).toBe('garantia');
    expect(p!.texto).toBe('a instalação tem 12 meses');
  });

  it('entende o pedido sem assunto dito', () => {
    const p = lerPedidoDeAnotar('Clara, anota: atendemos toda a região de Vitória da Conquista', 'Clara');
    expect(p).not.toBeNull();
    expect(p!.assuntoDito).toBeNull();
    expect(p!.texto).toContain('Vitória da Conquista');
  });

  it('aceita variações de como as pessoas escrevem', () => {
    for (const frase of [
      'clara anota isso: garantia de 12 meses',
      'Clara, anote: garantia de 12 meses',
      'clara, anotar: garantia de 12 meses',
      'CLARA ANOTA: garantia de 12 meses',
    ]) {
      expect(lerPedidoDeAnotar(frase, 'Clara'), frase).not.toBeNull();
    }
  });

  it('conversa normal do grupo NÃO vira anotação', () => {
    for (const frase of [
      'a Clara respondeu bem hoje',
      'anota aí que amanhã tem obra',          // não chamou a assistente
      'Clara, bom dia!',
      'acho que a garantia é 10 anos',          // achismo solto: o perigo
    ]) {
      expect(lerPedidoDeAnotar(frase, 'Clara'), frase).toBeNull();
    }
  });

  it('pedido sem conteúdo nenhum é recusado', () => {
    expect(lerPedidoDeAnotar('Clara, anota:', 'Clara')).toBeNull();
    expect(lerPedidoDeAnotar('Clara, anota: ok', 'Clara')).toBeNull();   // curto demais
  });

  it('funciona com o nome da assistente de cada empresa', () => {
    expect(lerPedidoDeAnotar('Eva, anota: teste de conteúdo aqui', 'Eva')).not.toBeNull();
    expect(lerPedidoDeAnotar('Eva, anota: teste de conteúdo aqui', 'Clara')).toBeNull();
  });
});

describe('escolha do assunto', () => {
  it('assunto dito na lata vence', () => {
    expect(escolherAssunto('garantia', 'qualquer coisa', assuntos)?.chave).toBe('garantia');
  });

  it('aceita o assunto pelo título também', () => {
    expect(escolherAssunto('Onde atende', 'x', assuntos)?.chave).toBe('regiao');
  });

  it('sem assunto dito, deduz pelas palavras do texto', () => {
    expect(escolherAssunto(null, 'a garantia da instalação é de 12 meses', assuntos)?.chave).toBe('garantia');
    expect(escolherAssunto(null, 'trabalhamos com inversor Solis e Sungrow', assuntos)?.chave).toBe('marcas');
    expect(escolherAssunto(null, 'atendemos Vitória da Conquista e região', assuntos)?.chave).toBe('regiao');
  });

  it('na dúvida devolve null — melhor perguntar do que gravar no lugar errado', () => {
    expect(escolherAssunto(null, 'o cliente ligou hoje de manhã', assuntos)).toBeNull();
    expect(escolherAssunto('inventado', 'texto', assuntos)).toBeNull();
  });
});

describe('chamou pelo nome? (a regra do grupo)', () => {
  it('reconhece quando falam com ela', () => {
    for (const f of ['Clara, anota isso', 'clara me ajuda', 'Clara: bom dia', 'CLARA, ANOTA: x']) {
      expect(chamouPeloNome(f, 'Clara'), f).toBe(true);
    }
  });

  it('conversa da equipe não é chamada — foi o erro de 01/09', () => {
    for (const f of [
      'a Clara respondeu bem hoje',        // falou DELA, não COM ela
      'Kkkkkkkk',
      'Veja com graci se tem chave pix',
      'Rivaldo esta como na coelba??',
      'Pessoal, estamos com uma IA atendendo os clientes.. ela se chama Clara',
    ]) {
      expect(chamouPeloNome(f, 'Clara'), f).toBe(false);
    }
  });

  it('cada empresa tem o nome da sua assistente', () => {
    expect(chamouPeloNome('Eva, anota isso', 'Eva')).toBe(true);
    expect(chamouPeloNome('Eva, anota isso', 'Clara')).toBe(false);
  });

  it('mensagem vazia não é chamada', () => {
    expect(chamouPeloNome('', 'Clara')).toBe(false);
    expect(chamouPeloNome('Clara', 'Clara')).toBe(true);   // só o nome já é chamar
  });
});
