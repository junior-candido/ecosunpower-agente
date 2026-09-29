// Fixture FICTÍCIA da tela "Custo de IA" (nomes inventados — nunca dado real).
import { montarPainelCustoIa, type LinhaUsoIa, type PainelCustoIa } from '../../src/modules/dashboard/custo-ia-calc.js';

export const CI_CASA = '00000000-0000-0000-0000-000000000001';
export const CI_TENANT = '4b1f2c3d-1111-4111-8111-222222222222';
export const CI_AGORA = new Date('2026-09-28T18:00:00.000Z');

export const linhaCi = (p: Partial<LinhaUsoIa>): LinhaUsoIa => ({
  created_at: '2026-09-10T15:00:00.000Z', company_id: CI_CASA, origem: 'conversa:lead', modelo: 'claude-sonnet-4-6',
  input_tokens: 1000, output_tokens: 200, cache_read_tokens: 20000, cache_write_tokens: 0, custo_cents: 36, ...p,
});

const USOS = ['conversa:lead', 'midia:imagem', 'midia:pdf', 'resumo:lead', 'reativacao:cadencia', 'escrita:blog', 'admin:agenda'];

/** Painel com a casa + 1 tenant (acima do alerta) + extras até n empresas fictícias. */
export function painelCustoIaExemplo(n = 2): PainelCustoIa {
  const extras = Array.from({ length: Math.max(0, n - 2) }, (_, i) => ({
    id: `${String(i + 10).padStart(8, '0')}-2222-4222-8222-333333333333`, nome: `Solar Fictícia ${i + 1}`,
  }));
  return montarPainelCustoIa({
    agora: CI_AGORA,
    empresas: [{ id: CI_CASA, nome: 'EcoSunPower' }, { id: CI_TENANT, nome: 'Solar Exemplo Tenant' }, ...extras],
    mensalidades: new Map([[CI_TENANT, 29700], ...extras.map((e) => [e.id, 19700] as [string, number])]),
    linhas: [
      linhaCi({ custo_cents: 30000 }),
      linhaCi({ company_id: CI_TENANT, custo_cents: 14000 }),
      linhaCi({ company_id: CI_TENANT, origem: 'midia:imagem', custo_cents: 500 }),
      linhaCi({ origem: 'resumo:lead#sem-empresa', custo_cents: 50 }),
      linhaCi({ created_at: '2026-08-15T12:00:00.000Z', custo_cents: 20000 }),
      ...extras.flatMap((e, i) => USOS.map((o, k) => linhaCi({ company_id: e.id, origem: o, custo_cents: 100 * (i + k + 1) }))),
    ],
    atendidos: [{ company_id: CI_TENANT, lead_id: 'x', created_at: '2026-09-11T00:00:00.000Z' }],
  });
}
