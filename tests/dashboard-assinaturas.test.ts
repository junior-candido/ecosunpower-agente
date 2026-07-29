// Tela 📆 Assinaturas (Financeiro): lista com situação + botões manuais.
import { describe, it, expect } from 'vitest';
import { renderAssinaturasPage } from '../src/modules/dashboard/assinaturas-views.js';
import { renderLayout } from '../src/modules/dashboard/views.js';

const PRODUTOS = [
  { id: 'calculadora', nome: 'Calculadora Solar', valorCentavosPadrao: 5700 },
  { id: 'monitoramento', nome: 'Monitoramento de Usinas', valorCentavosPadrao: 29700 },
];
const ASSINATURAS = [
  { id: 'a1', produtoId: 'monitoramento', produtoNome: 'Monitoramento de Usinas', nome: 'Sabion Solar', email: 't@x.com', telefone: '5521999998888', zapConfirmado: false, valorCentavos: 29700, limite: 110, venceEm: '2026-08-29', status: 'ativa' as const },
];

describe('renderAssinaturasPage', () => {
  const html = renderAssinaturasPage(PRODUTOS, ASSINATURAS, '2026-07-29', undefined, undefined);
  it('mostra assinante, produto, valor em reais e vencimento', () => {
    expect(html).toContain('Sabion Solar');
    expect(html).toContain('Monitoramento de Usinas');
    expect(html).toContain('297,00');
    expect(html).toContain('29/08/2026');
  });
  it('tem os botões manuais e o form de nova assinatura', () => {
    expect(html).toContain('Gerar cobrança');
    expect(html).toContain('Travar');
    expect(html).toContain('/dashboard/assinaturas/nova');
  });
  it('mostra o limite do plano (110 usinas)', () => {
    expect(html).toContain('110');
  });
});

describe('menu lateral', () => {
  it('o link /dashboard/assinaturas aparece no setor Financeiro', () => {
    const html = renderLayout({ active: 'assinaturas', title: 'X', body: '' } as any);
    expect(html).toContain('href="/dashboard/assinaturas"');
  });
});
