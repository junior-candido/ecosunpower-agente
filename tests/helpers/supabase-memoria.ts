// tests/helpers/supabase-memoria.ts
// Banco de mentira, em memória, com a parte do client do Supabase que o
// Atendimento (Parte 2) usa: select/insert/update/delete + eq/neq/in/is/or
// (só "a.is.null,a.eq.x")/gte/lte/order/limit/maybeSingle/single.
// Índices únicos simulados por tabela (ex.: chave_envio por empresa) devolvem
// o erro 23505 do Postgres — é assim que o anti envio duplo é testado.
// Registra toda escrita em `escritas` (para provar "nada foi gravado").

type Linha = Record<string, unknown>;
type Filtro = (l: Linha) => boolean;

export interface Escrita { tabela: string; op: 'insert' | 'update' | 'delete'; dados?: unknown; filtros: string[] }

export interface BancoMemoria {
  tabelas: Record<string, Linha[]>;
  escritas: Escrita[];
  client: any;
  /** Faz a próxima operação na tabela falhar com esta mensagem. */
  falharEm(tabela: string, mensagem: string, codigo?: string): void;
}

let seq = 0;
const novoId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export function bancoMemoria(
  inicial: Record<string, Linha[]> = {},
  unicos: Record<string, string[][]> = {},
): BancoMemoria {
  const tabelas: Record<string, Linha[]> = {};
  for (const [t, ls] of Object.entries(inicial)) tabelas[t] = ls.map((l) => ({ ...l }));
  const escritas: Escrita[] = [];
  const falhas = new Map<string, { message: string; code?: string }>();

  function consulta(tabela: string) {
    const filtros: Filtro[] = [];
    const descr: string[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Linha | Linha[] | null = null;
    let ordem: { col: string; asc: boolean } | null = null;
    let limite: number | null = null;
    let umSo: 'single' | 'maybe' | null = null;
    let devolver = false;

    const q: any = {
      select() { if (op !== 'select') devolver = true; return q; },
      insert(d: Linha | Linha[]) { op = 'insert'; payload = d; return q; },
      update(d: Linha) { op = 'update'; payload = d; return q; },
      delete() { op = 'delete'; return q; },
      upsert(d: Linha | Linha[]) { op = 'insert'; payload = d; return q; },
      eq(c: string, v: unknown) { filtros.push((l) => l[c] === v); descr.push(`${c}=${String(v)}`); return q; },
      ilike(c: string, v: string) { filtros.push((l) => String(l[c] ?? '').toLowerCase() === String(v).toLowerCase()); descr.push(`${c} ilike ${v}`); return q; },
      neq(c: string, v: unknown) { filtros.push((l) => l[c] !== v); descr.push(`${c}!=${String(v)}`); return q; },
      in(c: string, vs: unknown[]) { filtros.push((l) => vs.includes(l[c])); descr.push(`${c} in`); return q; },
      is(c: string, v: unknown) { filtros.push((l) => (l[c] ?? null) === v); descr.push(`${c} is ${String(v)}`); return q; },
      not(c: string, opr: string, v: unknown) { filtros.push((l) => !(opr === 'is' ? (l[c] ?? null) === v : l[c] === v)); descr.push(`${c} not ${opr}`); return q; },
      gte(c: string, v: unknown) { filtros.push((l) => String(l[c] ?? '') >= String(v)); return q; },
      lte(c: string, v: unknown) { filtros.push((l) => String(l[c] ?? '') <= String(v)); return q; },
      or(expr: string) {
        const partes = expr.split(',').map((p) => p.split('.'));
        filtros.push((l) => partes.some(([c, o, ...r]) => {
          const v = r.join('.');
          return o === 'is' ? (l[c] ?? null) === (v === 'null' ? null : v) : String(l[c]) === v;
        }));
        descr.push(`or(${expr})`);
        return q;
      },
      order(c: string, o?: { ascending?: boolean }) { ordem = { col: c, asc: o?.ascending !== false }; return q; },
      limit(n: number) { limite = n; return q; },
      maybeSingle() { umSo = 'maybe'; return q; },
      single() { umSo = 'single'; return q; },
      then(ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) {
        return Promise.resolve(executar()).then(ok, erro);
      },
    };

    function executar(): { data: unknown; error: { message: string; code?: string } | null } {
      const f = falhas.get(tabela);
      if (f) { falhas.delete(tabela); return { data: null, error: f }; }
      const linhas = (tabelas[tabela] ??= []);
      const casa = (l: Linha) => filtros.every((fn) => fn(l));
      if (op === 'insert') {
        const novos = (Array.isArray(payload) ? payload : [payload]).map((d) => ({ id: novoId(), criado_em: new Date().toISOString(), ...(d as Linha) }));
        for (const n of novos) {
          for (const cols of unicos[tabela] ?? []) {
            if (cols.some((c) => n[c] === null || n[c] === undefined)) continue;
            if (linhas.some((l) => cols.every((c) => l[c] === n[c]))) {
              return { data: null, error: { message: `duplicate key value violates unique constraint (${cols.join(',')})`, code: '23505' } };
            }
          }
        }
        linhas.push(...novos);
        escritas.push({ tabela, op: 'insert', dados: payload, filtros: descr });
        const d = devolver || umSo ? (umSo ? novos[0] : novos) : null;
        return { data: d, error: null };
      }
      if (op === 'update') {
        const alvo = linhas.filter(casa);
        for (const l of alvo) Object.assign(l, payload);
        escritas.push({ tabela, op: 'update', dados: payload, filtros: descr });
        return { data: devolver ? alvo : null, error: null };
      }
      if (op === 'delete') {
        const ficam = linhas.filter((l) => !casa(l));
        tabelas[tabela] = ficam;
        escritas.push({ tabela, op: 'delete', filtros: descr });
        return { data: null, error: null };
      }
      let r = linhas.filter(casa).map((l) => ({ ...l }));
      if (ordem) {
        const { col, asc } = ordem;
        r.sort((a, b) => (String(a[col] ?? '') < String(b[col] ?? '') ? -1 : String(a[col] ?? '') > String(b[col] ?? '') ? 1 : 0) * (asc ? 1 : -1));
      }
      if (limite !== null) r = r.slice(0, limite);
      if (umSo === 'maybe') return { data: r[0] ?? null, error: null };
      if (umSo === 'single') return r[0] ? { data: r[0], error: null } : { data: null, error: { message: 'no rows', code: 'PGRST116' } };
      return { data: r, error: null };
    }
    return q;
  }

  return {
    tabelas,
    escritas,
    client: { from: (t: string) => consulta(t) },
    falharEm(tabela, message, code) { falhas.set(tabela, { message, code }); },
  };
}
