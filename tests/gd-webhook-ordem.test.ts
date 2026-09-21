import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// O desvio do demonstrativo TEM que vir antes do fluxo de resposta de cliente
// dentro da rota /webhooks/resend — senao cada demonstrativo vira um aviso
// falso de "cliente respondeu". E a assinatura vem antes de tudo.
describe('rota /webhooks/resend', () => {
  const src = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf8');
  const ini = src.indexOf("app.post('/webhooks/resend'");
  const rota = src.slice(ini, ini + 8000);

  it('existe', () => expect(ini).toBeGreaterThan(0));
  it('confere assinatura, depois desvia GD, depois resposta de cliente', () => {
    const a = rota.indexOf('conferirAssinaturaResend(');
    const g = rota.indexOf('classificarEmailGd(req.body)');
    const r = rota.indexOf('processarRespostaEmail(');
    expect(a).toBeGreaterThan(0);
    expect(g).toBeGreaterThan(a);
    expect(r).toBeGreaterThan(g);
  });
  it('responde 200 e sai quando e demonstrativo (nao cai no fluxo de resposta)', () => {
    const g = rota.indexOf('classificarEmailGd(req.body)');
    const r = rota.indexOf('processarRespostaEmail(');
    const bloco = rota.slice(g, r);
    expect(bloco).toMatch(/res\.status\(200\)[\s\S]*return;/);
  });
});
