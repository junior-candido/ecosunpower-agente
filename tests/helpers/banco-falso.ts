// tests/helpers/banco-falso.ts
// Banco Supabase FALSO que APLICA os filtros (eq/neq/gte/lte/lt/in/is/or/order/
// range/limit), com select, update e maybeSingle. Guarda linhas de várias
// empresas: se alguma consulta esquecer o company_id, a linha da outra empresa
// aparece no resultado — e o teste quebra. Método desconhecido lança.
import type { SupabaseClient } from '@supabase/supabase-js';

export type Linha = Record<string, unknown>;

export interface Operacao { tabela: string; tipo: 'select' | 'update'; filtros: Array<[string, string, unknown]>; patch?: Linha }

/** Filtro `or` do PostgREST — só o que o código usa: "col.is.null,col.neq.valor" e "col.eq.x,col.gte.y". */
function casaOr(linha: Linha, expr: string): boolean {
  return expr.split(',').some((parte) => {
    const [col, op, ...resto] = parte.split('.');
    const v = resto.join('.');
    const atual = linha[col] ?? null;
    if (op === 'is' && v === 'null') return atual === null;
    if (op === 'eq') return String(atual) === v;
    if (op === 'neq') return atual !== null && String(atual) !== v;
    if (op === 'gte') return atual !== null && String(atual) >= v;
    throw new Error(`banco falso: or com operador ${op} não implementado`);
  });
}

export function bancoFalso(tabelas: Record<string, Linha[]>, opcoes: { erroEm?: Record<string, string>; colunaFaltando?: { tabela: string; coluna: string } } = {}) {
  const ops: Operacao[] = [];
  const client = {
    from(tabela: string) {
      const op: Operacao = { tabela, tipo: 'select', filtros: [] };
      ops.push(op);
      const base = tabelas[tabela] ?? (tabelas[tabela] = []);
      let preds: Array<(l: Linha) => boolean> = [];
      let head = false;
      let comContagem = false;
      let faixa: [number, number] | null = null;
      let limite: number | null = null;
      let unico = false;
      let colunasPedidas: string | null = null;
      const ordens: Array<[string, boolean]> = [];
      const cmp = (a: unknown, b: unknown) => (a === b ? 0 : a === null || a === undefined ? 1 : b === null || b === undefined ? -1 : (a as string) < (b as string) ? -1 : 1);
      const filtro = (nome: string, fn: (c: string, v: unknown) => (l: Linha) => boolean) => (c: string, v: unknown) => {
        op.filtros.push([nome, c, v]); preds.push(fn(c, v)); return q;
      };
      const q: Record<string, unknown> = {
        select: (c?: string, o?: { head?: boolean; count?: string }) => { head = !!o?.head; comContagem = !!o?.count; colunasPedidas = c ?? '*'; return q; },
        update: (patch: Linha) => { op.tipo = 'update'; op.patch = patch; return q; },
        insert: (linha: Linha) => { op.tipo = 'insert'; op.patch = linha; base.push({ id: `novo-${base.length + 1}`, ...linha }); return q; },
        eq: filtro('eq', (c, v) => (l) => l[c] === v),
        neq: filtro('neq', (c, v) => (l) => l[c] !== v),
        gte: filtro('gte', (c, v) => (l) => l[c] != null && cmp(l[c], v) >= 0),
        gt: filtro('gt', (c, v) => (l) => l[c] != null && cmp(l[c], v) > 0),
        lte: filtro('lte', (c, v) => (l) => l[c] != null && cmp(l[c], v) <= 0),
        lt: filtro('lt', (c, v) => (l) => l[c] != null && cmp(l[c], v) < 0),
        in: filtro('in', (c, vs) => (l) => (vs as unknown[]).includes(l[c])),
        is: filtro('is', (c, v) => (l) => (l[c] ?? null) === v),
        or: (expr: string) => { op.filtros.push(['or', expr, null]); preds.push((l) => casaOr(l, expr)); return q; },
        order: (c: string, o?: { ascending?: boolean }) => { ordens.push([c, o?.ascending !== false]); return q; },
        limit: (n: number) => { limite = n; return q; },
        range: (a: number, b: number) => { faixa = [a, b]; return q; },
        maybeSingle: () => { unico = true; return q; },
        then: (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) => {
          const erro = opcoes.erroEm?.[tabela];
          if (erro) return Promise.resolve({ data: null, count: null, error: { message: erro } }).then(ok, falha);
          // Coluna inexistente (ex.: migration ainda não aplicada).
          const cf = opcoes.colunaFaltando;
          const pedeColuna = (lista: string | null) => !!lista && lista.split(',').map((x) => x.trim()).includes(cf?.coluna ?? '');
          if (cf && cf.tabela === tabela && (pedeColuna(colunasPedidas) || (op.patch && cf.coluna in op.patch))) {
            return Promise.resolve({ data: null, count: null, error: { message: `column ${tabela}.${cf.coluna} does not exist`, code: '42703' } }).then(ok, falha);
          }
          if (op.tipo === 'insert') return Promise.resolve({ data: null, count: null, error: null }).then(ok, falha);
          let linhas = base.filter((l) => preds.every((p) => p(l)));
          if (op.tipo === 'update') {
            for (const l of linhas) Object.assign(l, op.patch);
            preds = [];
          }
          if (ordens.length) {
            linhas = [...linhas].sort((a, b) => {
              for (const [c, asc] of ordens) { const x = cmp(a[c], b[c]); if (x) return asc ? x : -x; }
              return 0;
            });
          }
          const total = linhas.length;
          if (faixa) linhas = linhas.slice(faixa[0], faixa[1] + 1);
          if (limite !== null) linhas = linhas.slice(0, limite);
          const copia = linhas.map((l) => ({ ...l }));
          const data = head ? null : unico ? (copia[0] ?? null) : copia;
          return Promise.resolve({ data, count: comContagem ? total : null, error: null }).then(ok, falha);
        },
      };
      return new Proxy(q, {
        get(alvo, prop) {
          if (prop in alvo) return alvo[prop as string];
          throw new Error(`banco falso: método ${String(prop)} não implementado`);
        },
      });
    },
  };
  return { client: client as unknown as SupabaseClient, ops, tabelas };
}
