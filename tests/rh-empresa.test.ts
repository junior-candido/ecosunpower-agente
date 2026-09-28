// Revisão de segurança R18 (28/09/2026): o RH é módulo vendável (tenant pode
// contratar), mas o store não filtrava empresa. As escritas do painel usam o
// client de SERVIÇO (bypassa RLS) e, com a flag RLS_TENANT_ROTAS desligada,
// as leituras também. Resultado: um tenant com o módulo via e mexia nos
// candidatos da EcoSun (LGPD) — excluir, status, currículo, busca IA — e a
// vaga que ele criava nascia como da EcoSun (DEFAULT da 077) e ia pro site.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  listarVagas, getVaga, criarVaga, atualizarVaga, listarCandidatos, mudarStatus,
  excluirCandidato, urlCurriculoDoCandidato, listarVagasAbertas, filtroEmpresa,
} from '../src/modules/rh/store.js';
import { buscarNoBanco } from '../src/modules/rh/busca.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const TEN = 'aaaa1111-2222-3333-4444-555566667777';

type Linha = Record<string, unknown>;

/** Banco falso mínimo que APLICA eq/or/is/ilike (+ update/insert/delete e storage). */
function banco() {
  const t: Record<string, Linha[]> = {
    rh_vagas: [
      { id: 'vc', titulo: 'Vaga Casa', status: 'aberta', company_id: CASA, created_at: '2026-09-01' },
      { id: 'vn', titulo: 'Vaga Antiga', status: 'aberta', company_id: null, created_at: '2026-08-01' },
      { id: 'vt', titulo: 'Vaga Tenant', status: 'aberta', company_id: TEN, created_at: '2026-09-02' },
    ],
    rh_candidatos: [
      { id: 'cc', nome: 'Cand Casa', status: 'novo', historico: [], curriculo_path: 'v/cc.pdf', company_id: CASA, created_at: '2026-09-01', vaga_id: 'vc' },
      { id: 'ct', nome: 'Cand Tenant', status: 'novo', historico: [], curriculo_path: 'v/ct.pdf', company_id: TEN, created_at: '2026-09-02', vaga_id: null },
    ],
  };
  const removidos: string[] = [];
  const client = {
    storage: { from: () => ({
      remove: async (ps: string[]) => { removidos.push(...ps); return { error: null }; },
      createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://assinado/${p}` }, error: null }),
    }) },
    from(tabela: string) {
      const base = t[tabela] ?? (t[tabela] = []);
      const preds: Array<(l: Linha) => boolean> = [];
      let tipo: 'select' | 'update' | 'insert' | 'delete' = 'select';
      let patch: Linha = {};
      let unico = false;
      const q: any = {
        select: () => q, order: () => q, limit: () => q, single: () => { unico = true; return q; }, maybeSingle: () => { unico = true; return q; },
        eq: (c: string, v: unknown) => { preds.push((l) => l[c] === v); return q; },
        is: (c: string, v: unknown) => { preds.push((l) => (l[c] ?? null) === v); return q; },
        ilike: (c: string, v: string) => { const x = v.replace(/%/g, '').toLowerCase(); preds.push((l) => String(l[c]).toLowerCase().includes(x)); return q; },
        or: (expr: string) => {
          preds.push((l) => expr.split(',').some((p) => {
            const [c, op, ...r] = p.split('.'); const v = r.join('.');
            return op === 'is' ? (l[c] ?? null) === null : String(l[c]) === v;
          }));
          return q;
        },
        update: (p: Linha) => { tipo = 'update'; patch = p; return q; },
        insert: (p: Linha) => { tipo = 'insert'; patch = p; return q; },
        delete: () => { tipo = 'delete'; return q; },
        then: (ok: (r: unknown) => unknown) => {
          if (tipo === 'insert') { const l = { id: `novo${base.length}`, ...patch }; base.push(l); return Promise.resolve({ data: unico ? l : [l], error: null }).then(ok); }
          const achadas = base.filter((l) => preds.every((p) => p(l)));
          if (tipo === 'update') achadas.forEach((l) => Object.assign(l, patch));
          if (tipo === 'delete') achadas.forEach((l) => base.splice(base.indexOf(l), 1));
          const data = achadas.map((l) => ({ ...l }));
          return Promise.resolve({ data: unico ? (data[0] ?? null) : data, error: null }).then(ok);
        },
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, t, removidos };
}

describe('RH — store sempre na empresa da sessão', () => {
  it('filtro: tenant = eq; casa inclui company_id nulo (linha antiga); sem empresa = erro', () => {
    expect(filtroEmpresa(TEN)).toEqual({ tipo: 'eq', valor: TEN });
    expect(filtroEmpresa(CASA).tipo).toBe('or');
    expect(() => filtroEmpresa('')).toThrow();
  });

  it('listas: tenant só vê o que é dele; casa vê o dela + nulo', async () => {
    const { client } = banco();
    expect((await listarVagas(client, TEN)).map((v) => v.id)).toEqual(['vt']);
    expect((await listarVagas(client, CASA)).map((v) => v.id).sort()).toEqual(['vc', 'vn']);
    expect((await listarCandidatos(client, TEN, {})).map((c) => c.id)).toEqual(['ct']);
    expect((await listarCandidatos(client, CASA, {})).map((c) => c.id)).toEqual(['cc']);
  });

  it('site público (Trabalhe Conosco): só vagas da casa', async () => {
    const { client } = banco();
    expect((await listarVagasAbertas(client)).map((v) => v.id).sort()).toEqual(['vc', 'vn']);
  });

  it('getVaga de outra empresa → null', async () => {
    const { client } = banco();
    expect(await getVaga(client, TEN, 'vc')).toBeNull();
    expect((await getVaga(client, CASA, 'vc'))?.titulo).toBe('Vaga Casa');
  });

  it('criarVaga grava o company_id da sessão (não o DEFAULT da EcoSun)', async () => {
    const { client, t } = banco();
    const r = await criarVaga(client, TEN, { titulo: 'Nova', descricao: '', requisitos: '', cidade: '', tipo: 'CLT' });
    expect(r.ok).toBe(true);
    expect(t.rh_vagas.at(-1)?.company_id).toBe(TEN);
  });

  it('atualizarVaga (editar/fechar) em vaga de outra empresa: não mexe e avisa', async () => {
    const { client, t } = banco();
    const r = await atualizarVaga(client, TEN, 'vc', { status: 'fechada', titulo: 'hack' });
    expect(r).toEqual({ ok: false, error: 'vaga não encontrada' });
    expect(t.rh_vagas.find((v) => v.id === 'vc')).toMatchObject({ status: 'aberta', titulo: 'Vaga Casa' });
    expect((await atualizarVaga(client, CASA, 'vc', { status: 'fechada' })).ok).toBe(true);
  });

  it('mudarStatus de candidato de outra empresa: não acha', async () => {
    const { client, t } = banco();
    expect((await mudarStatus(client, TEN, 'cc', 'aprovado', 'x')).ok).toBe(false);
    expect(t.rh_candidatos.find((c) => c.id === 'cc')?.status).toBe('novo');
    expect((await mudarStatus(client, CASA, 'cc', 'aprovado', 'x')).ok).toBe(true);
  });

  it('excluirCandidato de outra empresa: não apaga linha nem PDF', async () => {
    const { client, t, removidos } = banco();
    expect((await excluirCandidato(client, TEN, 'cc')).ok).toBe(false);
    expect(t.rh_candidatos.map((c) => c.id)).toContain('cc');
    expect(removidos).toEqual([]);
    expect((await excluirCandidato(client, CASA, 'cc')).ok).toBe(true);
    expect(t.rh_candidatos.map((c) => c.id)).not.toContain('cc');
    expect(removidos).toEqual(['v/cc.pdf']);
  });

  it('currículo de outra empresa: sem link assinado', async () => {
    const { client } = banco();
    expect(await urlCurriculoDoCandidato(client, 'cc', client, TEN)).toBeNull();
    expect(await urlCurriculoDoCandidato(client, 'cc', client, CASA)).toBe('https://assinado/v/cc.pdf');
  });

  it('busca IA: a IA só recebe os perfis da empresa da sessão', async () => {
    const { client } = banco();
    let prompt = '';
    const anthropic = { messages: { create: async (a: { messages: Array<{ content: string }> }) => {
      prompt = a.messages[0].content;
      return { content: [{ type: 'text', text: '```json\n[{"id":"cc","motivo":"x"},{"id":"ct","motivo":"y"}]\n```' }] };
    } } };
    const r = await buscarNoBanco(anthropic as never, client, 'quem?', TEN);
    expect(prompt).toContain('Cand Tenant');
    expect(prompt).not.toContain('Cand Casa');
    expect(r.map((x) => x.id)).toEqual(['ct']); // id de outra empresa devolvido pela IA é descartado
  });
});

describe('RH — rotas do painel passam a empresa da sessão (teste estático)', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
  const ini = fonte.indexOf("router.get('/rh',");
  const bloco = fonte.slice(ini, fonte.indexOf("router.get('/import-leads-junho'", ini));
  it('toda rota /rh* com :id ou leitura pega empresaRh antes de chamar o store', () => {
    const rotas = bloco.split(/\n  router\.(?:get|post)\(/).slice(1); // [0] = redirect /rh + empresaRh
    expect(rotas.length).toBe(11);
    // única sem consulta: o formulário vazio de vaga nova
    for (const r of rotas.filter((x) => !x.startsWith("'/rh/vagas/nova'"))) expect(r, r.slice(0, 60)).toContain('empresaRh(req, res)');
  });
  it('chamadas do store com a empresa no lugar certo', () => {
    for (const re of [
      /listarVagas\(db, empresa\)/, /getVaga\(db, empresa,/, /criarVaga\(supabase, empresa,/,
      /atualizarVaga\(supabase, empresa,/, /listarCandidatos\(db, empresa,/, /mudarStatus\(supabase, empresa,/,
      /urlCurriculoDoCandidato\(db, String\(req\.params\.id\), supabase, empresa\)/,
      /buscarNoBanco\(anthropic, db, pergunta, empresa\)/, /excluirCandidato\(supabase, empresa,/,
    ]) expect(bloco).toMatch(re);
    expect(bloco).not.toMatch(/atualizarVaga\(supabase, String/);
    expect(bloco).not.toMatch(/excluirCandidato\(supabase, String/);
  });
});
