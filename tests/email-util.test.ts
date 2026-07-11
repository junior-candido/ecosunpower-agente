import { describe, it, expect } from 'vitest';
import { emailValido } from '../src/modules/email/email-util.js';

// emailValido guarda o intake de leads (Meta Lead Ads) ANTES de gravar em
// leads.email / matricular na sequencia — nao precisa ser tao estrito quanto
// a constraint do banco, so filtrar lixo obvio.
describe('emailValido', () => {
  it('aceita e-mail com formato basico valido', () => {
    expect(emailValido('lead@gmail.com')).toBe(true);
    expect(emailValido('nome.sobrenome@dominio.com.br')).toBe(true);
  });

  it('aceita com espacos nas pontas (trim antes de testar)', () => {
    expect(emailValido('  lead@gmail.com  ')).toBe(true);
  });

  it('rejeita null/undefined/vazio', () => {
    expect(emailValido(null)).toBe(false);
    expect(emailValido(undefined)).toBe(false);
    expect(emailValido('')).toBe(false);
  });

  it('rejeita string sem @ ou sem ponto no dominio', () => {
    expect(emailValido('nao-e-email')).toBe(false);
    expect(emailValido('lead@semdominio')).toBe(false);
  });
});
