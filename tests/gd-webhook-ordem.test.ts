import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// O desvio do demonstrativo TEM que vir antes do fluxo de resposta de cliente
// dentro da rota /webhooks/resend — senao cada demonstrativo vira um aviso
// falso de "cliente respondeu". E a assinatura vem antes de tudo.
describe('rota /webhooks/resend', () => {
  const src = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf8');
  const ini = src.indexOf("app.post('/webhooks/resend'");
  const rota = src.slice(ini, ini + 12000);

  it('existe', () => expect(ini).toBeGreaterThan(0));
  it('confere assinatura, depois desvia GD, depois resposta de cliente', () => {
    const a = rota.indexOf('conferirAssinaturaResend(');
    const g = rota.indexOf('classificarEmailGd(req.body)');
    const r = rota.indexOf('processarRespostaEmail(');
    expect(a).toBeGreaterThan(0);
    expect(g).toBeGreaterThan(a);
    expect(r).toBeGreaterThan(g);
  });
  it('processa o demonstrativo DENTRO do contexto da empresa DONA (RLS estrito) e com ela no repo', () => {
    const g = rota.indexOf('classificarEmailGd(req.body)');
    const r = rota.indexOf('processarRespostaEmail(');
    const bloco = rota.slice(g, r);
    // 30/09/2026: a dona sai do To original × gd_emails_origem; sem cadastro
    // que case, continua a EcoSun (empresaDoEmailGd, testado à parte).
    expect(bloco).toMatch(/const donaGd = gd\.tipo === 'demonstrativo'\s*\?\s*empresaDoEmailGd\(gd\.para, todasEmpresasConhecidas\(\), ECOSUN_COMPANY_ID\)\s*:\s*ECOSUN_COMPANY_ID/);
    expect(bloco).toMatch(/rodarNaEmpresa: \(fn\) => comEmpresaDe\(donaGd, fn\)/);
    // o client nasce em montarDeps, que o processador chama DENTRO do contexto
    // (comportamento coberto em gd-demonstrativo-webhook.test.ts)
    expect(bloco).toMatch(/montarDeps: \(\) => \{[\s\S]*criarRepoDemonstrativo\(supabase\.getClient\(\), donaGd\)/);
  });
  it('aviso do demonstrativo vai pro admin DA EMPRESA (nunca fixo no dono da EcoSun)', () => {
    const g = rota.indexOf('classificarEmailGd(req.body)');
    const r = rota.indexOf('processarRespostaEmail(');
    const bloco = rota.slice(g, r);
    expect(bloco).toMatch(/const destino = destinoAdminDaEmpresa\(config\.engineerPhone\)/);
    expect(bloco).not.toMatch(/sendAdminWithButtons\([\s\S]{0,80}config\.engineerPhone,/);
  });
  it('responde 200 ANTES de processar (retry da Resend nao duplica)', () => {
    const g = rota.indexOf('classificarEmailGd(req.body)');
    const bloco = rota.slice(g);
    expect(bloco.indexOf('res.status(200)')).toBeLessThan(bloco.indexOf('processarEmailGd('));
  });
  it('responde 200 e sai quando e demonstrativo (nao cai no fluxo de resposta)', () => {
    const g = rota.indexOf('classificarEmailGd(req.body)');
    const r = rota.indexOf('processarRespostaEmail(');
    const bloco = rota.slice(g, r);
    expect(bloco).toMatch(/res\.status\(200\)[\s\S]*return;/);
  });
});
