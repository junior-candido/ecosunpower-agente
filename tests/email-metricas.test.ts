import { describe, it, expect } from 'vitest';
import { resumirMetricas } from '../src/modules/dashboard/email-views.js';

describe('resumirMetricas', () => {
  it('conta enviados/abertos/clicados/quentes', () => {
    const r = resumirMetricas([
      { tipo: 'email_enviado' }, { tipo: 'email_enviado' },
      { tipo: 'email_aberto' }, { tipo: 'email_clicado' }, { tipo: 'lead_quente_email' },
    ]);
    expect(r.enviados).toBe(2);
    expect(r.abertos).toBe(1);
    expect(r.clicados).toBe(1);
    expect(r.quentes).toBe(1);
  });

  it('conta descadastros e retorna zero pra tipos ausentes', () => {
    const r = resumirMetricas([
      { tipo: 'email_enviado' }, { tipo: 'email_descadastro' }, { tipo: 'email_descadastro' },
    ]);
    expect(r.enviados).toBe(1);
    expect(r.descadastros).toBe(2);
    expect(r.abertos).toBe(0);
    expect(r.clicados).toBe(0);
    expect(r.quentes).toBe(0);
  });

  it('lista vazia retorna todos zero', () => {
    const r = resumirMetricas([]);
    expect(r).toEqual({ enviados: 0, abertos: 0, clicados: 0, quentes: 0, descadastros: 0 });
  });
});
