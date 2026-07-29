// Fatia 4 — cadastro do zap com CÓDIGO: o assinante digita o número, recebe
// um código de 6 dígitos no próprio zap e confirma na tela (prova que o
// número é dele). Guarda em memória com validade e limite de tentativas.
import { describe, it, expect } from 'vitest';
import { criarConfirmadorZap } from '../src/modules/dashboard/zap-confirmacao.js';

function fixo(codigo: string) { return () => codigo; }

describe('confirmador de zap', () => {
  it('solicitar gera código e confirmar com o código certo passa (uma vez só)', () => {
    let t = 0;
    const c = criarConfirmadorZap({ agora: () => t, gerarCodigo: fixo('123456') });
    const s = c.solicitar('a1', '5561999998888');
    expect(s.ok).toBe(true);
    if (s.ok) expect(s.codigo).toBe('123456');
    expect(c.confirmar('a1', '000000')).toBe(false);
    expect(c.confirmar('a1', '123456')).toBe(true);
    expect(c.confirmar('a1', '123456')).toBe(false); // já usado
  });
  it('código expira em 10 minutos', () => {
    let t = 0;
    const c = criarConfirmadorZap({ agora: () => t, gerarCodigo: fixo('123456') });
    c.solicitar('a1', '556199');
    t = 11 * 60 * 1000;
    expect(c.confirmar('a1', '123456')).toBe(false);
  });
  it('máximo 3 solicitações por hora (anti-abuso)', () => {
    let t = 0;
    const c = criarConfirmadorZap({ agora: () => t, gerarCodigo: fixo('111111') });
    expect(c.solicitar('a1', 'x').ok).toBe(true);
    expect(c.solicitar('a1', 'x').ok).toBe(true);
    expect(c.solicitar('a1', 'x').ok).toBe(true);
    expect(c.solicitar('a1', 'x').ok).toBe(false); // 4ª barrada
    t = 61 * 60 * 1000;
    expect(c.solicitar('a1', 'x').ok).toBe(true); // janela nova
  });
  it('confirmar devolve o telefone solicitado (pra gravar no banco)', () => {
    const c = criarConfirmadorZap({ agora: () => 0, gerarCodigo: fixo('222222') });
    c.solicitar('a1', '5561988887777');
    expect(c.telefonePendente('a1')).toBe('5561988887777');
  });
});
