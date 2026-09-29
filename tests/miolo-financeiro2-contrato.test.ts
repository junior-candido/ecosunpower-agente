// Renovação do miolo — R20: Financeiro II (Notas fiscais, Cobrar cliente,
// Assinaturas). CONTRATO gravado da tela antiga (tests/fixtures/
// contrato-financeiro2.json): formulários da NFS-e (nova, editar, emitir,
// voltar, anexar PDF, excluir, configuração com o .pfx), o GET do CNPJ,
// XML/PDF, os dois fetch do Cobrar (/cobrancas e /cobrancas/par) e as
// Assinaturas. E o JSON que os POST do Cobrar devolvem (a tela lê j.link,
// j.links[0..1], j.parcelas, j.erro).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { menuTenantSemAssinaturas } from './fixtures/mudancas-telas-leves.js';
import { r5Menu } from './fixtures/mudancas-onda4.js';
import { CASOS_FINANCEIRO2 } from './fixtures/casos-financeiro2.js';
import { MUDANCAS_R20 } from './fixtures/mudancas-r20.js';
import { rotaCobrancaUnica, rotaCobrancaPar, type DepsCobrar } from '../src/modules/dashboard/cobrar-rotas.js';
import { USER_CASA } from './fixtures/miolo-leads.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-financeiro2.json'), 'utf-8'));

describe('Financeiro II — contrato das telas não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_FINANCEIRO2)) {
    it(`contrato: ${nome}`, () => {
      const h = render();
      expect(contratoDaTela(h)).toEqual(aplicarMudancas(CONTRATO[nome], ...menuTenantSemAssinaturas(h), ...r5Menu(CONTRATO[nome]), ...(MUDANCAS_R20[nome] ?? [])));
    });
  }

  // O script da nota usa um atalho $('id') que o leitor do contrato não vê:
  // todo id que ele pede tem que existir na página (senão a conta do ISS e o
  // "Buscar dados" quebram calados).
  const IDS_DO_SCRIPT_DA_NOTA = ['bairro', 'buscar', 'c-aliq', 'c-bruto', 'c-iss', 'c-liq', 'cep', 'cod_mun_ibge', 'descricao', 'doc', 'email', 'logradouro', 'municipio', 'nome', 'numero', 'retido', 'servico', 'tipo', 'uf', 'valor'];
  for (const caso of ['nota-nova', 'nota-editar', 'nota-nova-do-fechamento']) {
    it(`${caso}: os ids do $('…') do script existem`, () => {
      const h = CASOS_FINANCEIRO2[caso]();
      const script = (h.match(/<script>[\s\S]*?<\/script>/g) ?? []).join('\n');
      const pedidos = [...new Set([...script.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]))].sort();
      expect(pedidos).toEqual(IDS_DO_SCRIPT_DA_NOTA);
      for (const id of pedidos) expect(h, id).toMatch(new RegExp(`\\sid="${id}"`));
    });
  }
  it('nota: atributos que o script lê (data-aliq, data-descr) nas opções do serviço', () => {
    const h = CASOS_FINANCEIRO2['nota-nova']();
    expect(h).toMatch(/<option value="s1" data-aliq="0.05" data-descr="Limpeza de &quot;módulos&quot; &lt;fotovoltaicos&gt;"/);
  });
  it('nota editar: vem preenchida e com data-edit (o script só recalcula)', () => {
    const h = CASOS_FINANCEIRO2['nota-editar']();
    expect(h).toContain('data-edit="1"');
    expect(h).toMatch(/<option value="s2"[^>]*selected/);
    expect(h).toMatch(/name="iss_retido" id="retido" checked|name="iss_retido"[^>]*checked/);
    expect(h).toContain('value="1500"');
  });
  it('nota do fechamento: os ocultos levam o fechamento e o lead da URL', () => {
    const h = CASOS_FINANCEIRO2['nota-nova-do-fechamento']();
    expect(h).toContain('name="fechamento_id" value="f-1"');
    expect(h).toContain('name="lead_id" value="l-1"');
  });
  it('XML e PDF: os links de baixar continuam', () => {
    const h = CASOS_FINANCEIRO2['nota-autorizada']();
    expect(h).toContain('href="/dashboard/fiscal/55555555-5555-4666-8777-888888888888/xml"');
    expect(h).toContain('href="/dashboard/fiscal/55555555-5555-4666-8777-888888888888/pdf"');
  });
  it('cobrar: sem InfinitePay os dois botões ficam desligados', () => {
    const h = CASOS_FINANCEIRO2['cobrar-sem-infinitepay']();
    expect(h).toMatch(/id="p"[^>]*disabled|disabled[^>]*id="p"/);
    expect(h).toMatch(/id="b"[^>]*disabled|disabled[^>]*id="b"/);
    expect(h).toContain('INFINITEPAY_HANDLE');
  });
});

// ---------------------------------------------------------------------------
// POST /cobrancas e /cobrancas/par — o JSON que a tela lê
// ---------------------------------------------------------------------------
type Reg = { tabela: string; filtros: Array<[string, unknown]> };
function dbFalso(leads: Array<Record<string, unknown>>) {
  const chamadas: Reg[] = [];
  const client = {
    from(tabela: string) {
      const reg: Reg = { tabela, filtros: [] };
      chamadas.push(reg);
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (c: string, v: unknown) => { reg.filtros.push([c, v]); return q; };
      q.in = (c: string, v: unknown) => { reg.filtros.push([c, v]); return q; };
      q.order = () => q; q.limit = () => q;
      const filtra = () => leads.filter((l) => reg.filtros.every(([c, v]) => (Array.isArray(v) ? v.includes(l[c]) : l[c] === v)));
      q.maybeSingle = async () => ({ data: filtra()[0] ?? null, error: null });
      q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: filtra(), error: null }).then(ok);
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, chamadas };
}
const OUTRA = 'aaaa1111-2222-3333-4444-555566667777';
const LEADS = [
  { id: 'lead-casa', company_id: USER_CASA.companyId, name: 'Ana Exemplo', email: 'ana@exemplo.invalid', phone: '5561999990001' },
  { id: 'lead-outra', company_id: OUTRA, name: 'Bia de Outra', email: 'bia@exemplo.invalid', phone: '5561999990002' },
];
function deps(o: Partial<DepsCobrar> = {}) {
  const db = dbFalso(LEADS);
  let n = 0;
  const cobrancas = {
    criarCobranca: vi.fn(async () => { n++; return { id: `cob-${n}`, orderNsu: `nsu-${n}` }; }),
    salvarLinkCobranca: vi.fn(async () => {}),
  };
  const criarLinkPagamento = vi.fn(async (p: { orderNsu: string }) => ({ ok: true as const, url: `https://checkout.exemplo.invalid/${p.orderNsu}` }));
  const d: DepsCobrar = { supabase: db.client, cobrancas, infinitepayHandle: 'loja-teste', appBaseUrl: 'https://app.exemplo.invalid/', criarLinkPagamento: criarLinkPagamento as unknown as DepsCobrar['criarLinkPagamento'], ...o };
  return { d, db, cobrancas, criarLinkPagamento };
}
function resFalso() {
  const r = { statusCode: 200, corpo: undefined as unknown, headersSent: false } as Record<string, unknown>;
  r.status = vi.fn((c: number) => { r.statusCode = c; return r; });
  r.json = vi.fn((b: unknown) => { r.corpo = b; return r; });
  return r as unknown as Response & { statusCode: number; corpo: any };
}
const req = (body: Record<string, unknown>) => ({ body, dashUser: USER_CASA, headers: {}, cookies: {} }) as unknown as Request;

describe('POST /cobrancas (link único) — JSON', () => {
  it('sem InfinitePay → 503 { erro }', async () => {
    const { d } = deps({ infinitepayHandle: undefined });
    const res = resFalso();
    await rotaCobrancaUnica(d)(req({ descricao: 'x', valor: '10' }), res);
    expect(res.statusCode).toBe(503);
    expect(res.corpo).toEqual({ erro: 'Cobrança não configurada (falta INFINITEPAY_HANDLE).' });
  });
  it('sem descrição / valor inválido → 400 { erro }', async () => {
    const { d } = deps();
    const r1 = resFalso(); await rotaCobrancaUnica(d)(req({ valor: '10' }), r1);
    expect([r1.statusCode, r1.corpo]).toEqual([400, { erro: 'Descrição obrigatória.' }]);
    const r2 = resFalso(); await rotaCobrancaUnica(d)(req({ descricao: 'x', valor: 'abc' }), r2);
    expect([r2.statusCode, r2.corpo]).toEqual([400, { erro: 'Valor inválido.' }]);
  });
  it('ok: { ok, link, cobrancaId }; valor pt-BR; telefone vincula o lead DA EMPRESA', async () => {
    const { d, cobrancas, criarLinkPagamento } = deps();
    const res = resFalso();
    await rotaCobrancaUnica(d)(req({ descricao: 'Limpeza', valor: '1.234,56', telefone: '(61) 99999-0001' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.corpo).toEqual({ ok: true, link: 'https://checkout.exemplo.invalid/nsu-1', cobrancaId: 'cob-1' });
    expect(cobrancas.criarCobranca).toHaveBeenCalledWith({ companyId: USER_CASA.companyId, leadId: 'lead-casa', descricao: 'Limpeza', valorCentavos: 123456 });
    expect(criarLinkPagamento.mock.calls[0][0]).toMatchObject({
      handle: 'loja-teste', orderNsu: 'nsu-1', redirectUrl: 'https://app.exemplo.invalid/pago', webhookUrl: 'https://app.exemplo.invalid/webhook/infinitepay',
      cliente: { nome: 'Ana Exemplo', email: 'ana@exemplo.invalid', telefone: '5561999990001' },
    });
    expect(cobrancas.salvarLinkCobranca).toHaveBeenCalledWith('cob-1', 'https://checkout.exemplo.invalid/nsu-1');
  });
  it('telefone de lead de OUTRA empresa não vincula (só pré-preenche o telefone)', async () => {
    const { d, cobrancas, criarLinkPagamento } = deps();
    await rotaCobrancaUnica(d)(req({ descricao: 'x', valor: '10', telefone: '5561999990002' }), resFalso());
    expect((cobrancas.criarCobranca.mock.calls[0] as unknown[])[0]).toMatchObject({ leadId: null });
    expect(criarLinkPagamento.mock.calls[0][0]).toMatchObject({ cliente: { telefone: '5561999990002' } });
  });
  it('lead_id da empresa: pré-preenche o checkout com o lead', async () => {
    const { d, criarLinkPagamento, cobrancas } = deps();
    const res = resFalso();
    await rotaCobrancaUnica(d)(req({ descricao: 'x', valor: '10', lead_id: 'lead-casa' }), res);
    expect(res.corpo).toMatchObject({ ok: true });
    expect((cobrancas.criarCobranca.mock.calls[0] as unknown[])[0]).toMatchObject({ leadId: 'lead-casa' });
    expect(criarLinkPagamento.mock.calls[0][0]).toMatchObject({ cliente: { nome: 'Ana Exemplo' } });
  });
  it('link falhou → 502 { erro }', async () => {
    const { d } = deps({ criarLinkPagamento: (async () => ({ ok: false, reason: 'HTTP 500' })) as unknown as DepsCobrar['criarLinkPagamento'] });
    const res = resFalso();
    await rotaCobrancaUnica(d)(req({ descricao: 'x', valor: '10' }), res);
    expect([res.statusCode, res.corpo]).toEqual([502, { erro: 'Falha ao gerar link: HTTP 500' }]);
  });
});

describe('POST /cobrancas/par (Pix + cartão) — JSON', () => {
  it('ok: { ok, liquidoCentavos, parcelas, links: [pix, cartão] } — a tela lê links[0] e links[1]', async () => {
    const { d, cobrancas } = deps();
    const res = resFalso();
    await rotaCobrancaPar(d)(req({ descricao: 'Usina', liquido: '15.000,00', parcelas: '10', telefone: '5561999990001' }), res);
    expect(res.statusCode).toBe(200);
    const j = res.corpo;
    expect(Object.keys(j).sort()).toEqual(['links', 'liquidoCentavos', 'ok', 'parcelas']);
    expect(j).toMatchObject({ ok: true, liquidoCentavos: 1500000, parcelas: 10 });
    expect(j.links).toHaveLength(2);
    expect(j.links[0]).toMatchObject({ forma: 'pix', valorCentavos: 1500000, link: 'https://checkout.exemplo.invalid/nsu-1' });
    expect(j.links[1].forma).toBe('cartao-10');
    expect(j.links[1].valorCentavos).toBeGreaterThan(1500000);
    expect(j.links[1].parcelaCentavos).toBeGreaterThan(0);
    expect(cobrancas.criarCobranca).toHaveBeenCalledTimes(2);
    expect((cobrancas.criarCobranca.mock.calls[0] as unknown[])[0]).toMatchObject({ companyId: USER_CASA.companyId, leadId: 'lead-casa', descricao: 'Usina (no Pix)' });
  });
  it('parcelas fora de 2..12 viram o limite; sem descrição → 400', async () => {
    const { d } = deps();
    const res = resFalso();
    await rotaCobrancaPar(d)(req({ descricao: 'x', liquido: '100', parcelas: '40' }), res);
    expect(res.corpo.parcelas).toBe(12);
    const r2 = resFalso(); await rotaCobrancaPar(d)(req({ liquido: '100' }), r2);
    expect([r2.statusCode, r2.corpo]).toEqual([400, { erro: 'Descrição obrigatória.' }]);
  });
});
