// Fatia 4 — "Minha assinatura": a tela do ASSINANTE (tenant) — pedido do
// Junior: "isso precisa aparecer pro Thiago". Situação, vencimento, uso do
// plano, botão de pagar e cadastro do zap com código.
import { describe, it, expect } from 'vitest';
import { renderMinhaAssinaturaPage } from '../src/modules/dashboard/minha-assinatura-views.js';
import { renderLayout } from '../src/modules/dashboard/views.js';

const SABION = {
  id: 'a1', produtoId: 'monitoramento', produtoNome: 'Monitoramento de Usinas',
  nome: 'Sabion Solar', email: 't@x.com', telefone: '5521999998888', zapConfirmado: false,
  valorCentavos: 29700, limite: 110, venceEm: '2026-08-29', status: 'ativa' as const, companyId: 'c1',
};

describe('renderMinhaAssinaturaPage', () => {
  it('mostra produto, valor, vencimento e situação', () => {
    const html = renderMinhaAssinaturaPage(SABION, '2026-07-29', 87, null, undefined);
    expect(html).toContain('Monitoramento de Usinas');
    expect(html).toContain('297,00');
    expect(html).toContain('29/08/2026');
    expect(html).toContain('ativa');
  });
  it('mostra o uso do plano (87/110)', () => {
    const html = renderMinhaAssinaturaPage(SABION, '2026-07-29', 87, null, undefined);
    expect(html).toContain('87');
    expect(html).toContain('110');
  });
  it('com cobrança pendente mostra o botão Pagar agora com o link', () => {
    const html = renderMinhaAssinaturaPage(SABION, '2026-08-25', 87, 'https://checkout.infinitepay.io/x', undefined);
    expect(html).toContain('Pagar agora');
    expect(html).toContain('https://checkout.infinitepay.io/x');
  });
  it('travada → aviso claro de suspensão', () => {
    const html = renderMinhaAssinaturaPage({ ...SABION, status: 'travada' }, '2026-09-05', 87, null, undefined);
    expect(html.toLowerCase()).toContain('suspens');
  });
  it('zap NÃO confirmado → form de cadastro com código; confirmado → selo', () => {
    const semZap = renderMinhaAssinaturaPage(SABION, '2026-07-29', null, null, undefined);
    expect(semZap).toContain('/dashboard/minha-assinatura/zap/solicitar');
    const comZap = renderMinhaAssinaturaPage({ ...SABION, zapConfirmado: true }, '2026-07-29', null, null, undefined);
    expect(comZap).toContain('WhatsApp confirmado');
  });
  it('sem assinatura → recado amigável', () => {
    const html = renderMinhaAssinaturaPage(null, '2026-07-29', null, null, undefined);
    expect(html).toContain('Nenhuma assinatura');
  });
});

describe('menu — item Minha assinatura só pro TENANT', () => {
  const ECOSUN = '00000000-0000-0000-0000-000000000001';
  const tenant = { id: 'u1', companyId: 'c1', nome: 'Thiago', login: 't', isAdmin: true, roleNome: 'Admin', permissoes: {} } as any;
  const ecosun = { ...tenant, companyId: ECOSUN } as any;
  it('tenant vê o link', () => {
    expect(renderLayout({ active: 'minha_assinatura', title: 'X', body: '', user: tenant })).toContain('/dashboard/minha-assinatura');
  });
  it('EcoSun NÃO vê (ela usa a tela Assinaturas)', () => {
    expect(renderLayout({ active: 'cockpit', title: 'X', body: '', user: ecosun })).not.toContain('href="/dashboard/minha-assinatura"');
  });
});
