// tests/pasta-envio-resultado.test.ts
// 23/09/2026 — Junior: "você me enganou, disse que tinha arrumado tudo".
// Dois defeitos do envio da Pasta Digital que ficaram só anotados em 18/09:
//  1. link com maiúscula / ponto no fim abria "Slug inválido" (caso Hudson);
//  2. o botão do dashboard engolia o resultado do e-mail — a tela dizia que
//     enviou e ninguém sabia que o e-mail não tinha saído.
import { describe, it, expect } from 'vitest';
import { normalizarSlugPublico } from '../src/modules/relatorios/slug.js';
import { renderResultadoEnvioPasta } from '../src/modules/relatorios/pasta/resultado-envio.js';

describe('normalizarSlugPublico — o link que o cliente clica', () => {
  it('slug certo passa igual', () => {
    expect(normalizarSlugPublico('r46rb54eex')).toBe('r46rb54eex');
  });
  it('maiúscula do teclado do celular vira minúscula', () => {
    expect(normalizarSlugPublico('R46RB54EEX')).toBe('r46rb54eex');
  });
  it('ponto final colado pelo WhatsApp sai', () => {
    expect(normalizarSlugPublico('r46rb54eex.')).toBe('r46rb54eex');
    expect(normalizarSlugPublico('r46rb54eex).')).toBe('r46rb54eex');
  });
  it('espaço na frente e atrás sai', () => {
    expect(normalizarSlugPublico(' r46rb54eex ')).toBe('r46rb54eex');
  });
  it('lixo de verdade continua recusado (null)', () => {
    expect(normalizarSlugPublico('')).toBeNull();
    expect(normalizarSlugPublico('abc')).toBeNull();
    expect(normalizarSlugPublico('../../etc/passwd')).toBeNull();
    expect(normalizarSlugPublico('r46rb 54eex')).toBeNull();
    expect(normalizarSlugPublico(undefined)).toBeNull();
  });
});

describe('renderResultadoEnvioPasta — a tela depois de clicar Enviar', () => {
  const base = { pastaId: '11111111-1111-1111-1111-111111111111' };

  it('os dois saíram: mostra telefone e e-mail', () => {
    const h = renderResultadoEnvioPasta({
      ...base,
      zap: { ok: true, para: '5561991718505' },
      email: { ok: true, para: 'nelson.pdj@gmail.com' },
    });
    expect(h).toContain('5561991718505');
    expect(h).toContain('nelson.pdj@gmail.com');
    expect(h).not.toContain('❌');
  });

  it('e-mail NÃO saiu: a tela diz, com o motivo em português', () => {
    const h = renderResultadoEnvioPasta({
      ...base,
      zap: { ok: true, para: '5561991718505' },
      email: { ok: false, reason: 'sem_email' },
    });
    expect(h).toContain('❌');
    expect(h).toMatch(/não tem e-mail cadastrado/i);
  });

  it('falha do provedor de e-mail também aparece', () => {
    const h = renderResultadoEnvioPasta({
      ...base,
      zap: { ok: true },
      email: { ok: false, reason: 'falha_envio' },
    });
    expect(h).toMatch(/provedor de e-mail recusou/i);
  });

  it('zap não saiu: mostra o motivo do zap e o do e-mail separados', () => {
    const h = renderResultadoEnvioPasta({
      ...base,
      zap: { ok: false, reason: 'sem_phone' },
      email: { ok: true, para: 'x@y.com' },
    });
    expect(h).toMatch(/sem telefone/i);
    expect(h).toContain('x@y.com');
  });

  it('telefone inválido aparece em português', () => {
    const h = renderResultadoEnvioPasta({ ...base, zap: { ok: false, reason: 'telefone_invalido' }, email: null });
    expect(h).toMatch(/telefone do cliente está errado/i);
  });

  it('e-mail desligado no ambiente (sem RESEND) não finge que enviou', () => {
    const h = renderResultadoEnvioPasta({ ...base, zap: { ok: true }, email: null });
    expect(h).toMatch(/e-mail não está configurado/i);
  });

  it('motivo desconhecido aparece cru, escapado (nunca vira HTML)', () => {
    const h = renderResultadoEnvioPasta({
      ...base,
      zap: { ok: false, reason: '<script>x</script>' },
      email: null,
    });
    expect(h).not.toContain('<script>x</script>');
    expect(h).toContain('&lt;script&gt;');
  });

  it('sempre tem o caminho de volta pra pasta', () => {
    const h = renderResultadoEnvioPasta({ ...base, zap: { ok: true }, email: null });
    expect(h).toContain(`/dashboard/pastas/${base.pastaId}`);
  });
});
