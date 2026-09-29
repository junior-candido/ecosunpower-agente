// Tela "Custo de IA": só a casa, padrão cc- (sem Tailwind), números certos.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderCustoIaPage, reais } from '../src/modules/dashboard/custo-ia-views.js';
import { montarPainelCustoIa, type LinhaUsoIa } from '../src/modules/dashboard/custo-ia-calc.js';
import { criarRotaCustoIa, podeVerCustoIa } from '../src/modules/dashboard/custo-ia-rota.js';
import { navConfiguracoes } from '../src/modules/dashboard/configuracoes-casca.js';
import { MENU_AREAS } from '../src/modules/dashboard/menu-areas.js';
import { TELAS_RENOVADAS, RE_TAILWIND } from './helpers/teto-tailwind.js';
import { USER_CASA, USER_TENANT } from './fixtures/miolo-leads.js';
import { painelCustoIaExemplo } from './fixtures/casos-custo-ia.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const CONQ = '4b1f2c3d-1111-4111-8111-222222222222';
const AGORA = new Date('2026-09-28T18:00:00.000Z');
const L = (p: Partial<LinhaUsoIa>): LinhaUsoIa => ({
  created_at: '2026-09-10T15:00:00.000Z', company_id: CASA, origem: 'conversa:lead', modelo: 'claude-sonnet-4-6',
  input_tokens: 1000, output_tokens: 200, cache_read_tokens: 20000, cache_write_tokens: 0, custo_cents: 36, ...p,
});

const painelExemplo = () => painelCustoIaExemplo(2);

describe('reais()', () => {
  it('sempre 2 casas (custo de IA é miúdo)', () => {
    expect(reais(36)).toMatch(/R\$\s?0,36/);
    expect(reais(123456.7)).toMatch(/1\.234,57/);
    expect(reais(null)).toBe('—');
  });
});

describe('renderCustoIaPage', () => {
  const html = renderCustoIaPage(painelExemplo(), USER_CASA);

  it('mostra empresa, mensalidade, margem e o alerta do tenant que passou de 40%', () => {
    expect(html).toContain('Solar Exemplo Tenant');
    expect(html).toMatch(/R\$\s?297,00/); // mensalidade
    expect(html).toMatch(/R\$\s?152,00/); // margem = 297 − 145
    expect(html).toContain('alerta');
    expect(html).toContain('passou (ou vai passar no ritmo atual) de 40%');
  });

  it('mostra o buraco "sem empresa" e o uso traduzido', () => {
    expect(html).toContain('não disseram de qual empresa eram');
    expect(html).toContain('Leitura de foto enviada');
    expect(html).toContain('Conversa com lead/cliente');
  });

  it('tema escuro, sem Tailwind do CDN, dentro da casca de Configurações', () => {
    expect(html).not.toContain('cdn.tailwindcss.com');
    expect(html).toContain('cc-cf-nav');
    expect(html).toContain('/dashboard/custo-ia');
  });

  it('nome de empresa é escapado (nada de HTML injetado)', () => {
    const p = montarPainelCustoIa({ agora: AGORA, empresas: [{ id: CONQ, nome: '<script>x</script>' }], mensalidades: new Map(), linhas: [L({ company_id: CONQ })], atendidos: [] });
    const h = renderCustoIaPage(p, USER_CASA);
    expect(h).not.toContain('<script>x</script>');
    expect(h).toContain('&lt;script&gt;');
  });
});

describe('padrão das telas renovadas', () => {
  it('custo-ia-views.ts está na lista TELAS_RENOVADAS', () => {
    expect(TELAS_RENOVADAS).toContain('custo-ia-views.ts');
  });
  it('miolo sem utilitário Tailwind', () => {
    const fonte = readFileSync(join(process.cwd(), 'src/modules/dashboard/custo-ia-views.ts'), 'utf8');
    const ruins = fonte.split('\n').filter((l) => RE_TAILWIND.test(l) && !l.includes('tailwind-ok'));
    expect(ruins).toEqual([]);
  });
});

describe('só a casa vê', () => {
  it('podeVerCustoIa: casa admin sim; tenant (mesmo admin) não; sem login não', () => {
    expect(podeVerCustoIa(USER_CASA)).toBe(true);
    expect(podeVerCustoIa(USER_TENANT)).toBe(false);
    expect(podeVerCustoIa(undefined)).toBe(false);
  });

  it('rota: tenant leva 403 e o banco NEM é consultado', async () => {
    const client = { from: vi.fn() };
    const res: any = { status: vi.fn(() => res), send: vi.fn(), type: vi.fn(() => res) };
    await criarRotaCustoIa(client)({ dashUser: USER_TENANT, query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('rota: casa recebe a página (alerta da URL respeitado)', async () => {
    const vazio = { then: (ok: any) => ok({ data: [], error: null }) };
    const q: any = { select: () => q, gte: () => q, eq: () => q, order: () => q, range: () => vazio, then: vazio.then };
    const client = { from: vi.fn(() => q) };
    const res: any = { status: vi.fn(() => res), send: vi.fn(), type: vi.fn(() => res) };
    await criarRotaCustoIa(client, () => AGORA)({ dashUser: USER_CASA, query: { alerta: '55' } } as any, res);
    const html = res.send.mock.calls[0][0] as string;
    expect(html).toContain('Custo de IA');
    expect(html).toContain('value="55"');
  });

  it('navegação de Configurações: item só da casa (menu lateral não muda — contratos das telas intactos)', () => {
    expect(MENU_AREAS.flatMap((g) => g.itens).some((i) => i.key === 'custo_ia')).toBe(false);
    expect(navConfiguracoes(USER_CASA, 'usuarios')).toContain('/dashboard/custo-ia');
    expect(navConfiguracoes(USER_TENANT, 'usuarios')).not.toContain('/dashboard/custo-ia');
  });
});
