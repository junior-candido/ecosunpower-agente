import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// Fase 1 da fundação multi-tenant (docs/ecosof/02-decisao-vocabulario.md,
// docs/ecosof/03-rollout-company-id-lote1.md). Regra: toda tabela NOVA nasce
// com company_id, a menos que esteja na allowlist abaixo (global, singleton,
// ou tabela de referência — motivo ao lado de cada uma). Isso é o que evita
// a próxima tabela nascer sem tenant e repetir o bug do commit 51db4af
// ("cliente novo nasce sem company_id, some do pós-venda").
//
// Allowlist — tabela : motivo:
const ALLOWLIST: Record<string, string> = {
  // é a própria tabela de tenants — não referencia a si mesma via company_id
  companies: 'a tabela de tenants em si; id É o tenant, não tem company_id próprio',
  // globais / singleton / referência (não são dados de um tenant específico)
  app_flags: 'flags de app, key/value global',
  logs: 'log de sistema, global',
  monitoring_config: 'singleton (id=1), config de autonomia do monitoramento',
  monitoring_treino: 'regras de treino internas, não é dado de cliente',
  telemetria_catalogo: 'catálogo de referência (marca/ponto -> código normalizado)',
  empresa_config: 'singleton (id=1), identidade da implantação (modelo SILO do Kit Clone, eixo diferente do pool company_id — ver 02-decisao-vocabulario.md §1.5)',
  empresa_kits: 'catálogo de kits da implantação, mesmo eixo SILO do empresa_config',
  financeiro_anexos: 'referência fixa dos anexos do Simples Nacional (lei, não dado de cliente)',
  // conceito de tenant diferente (RAG, não é o pool do CRM)
  eva_knowledge_chunks: 'já tem tenant_id (text, slug), conceito de namespace do RAG — ver 02-decisao-vocabulario.md §3',
};

function migrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(dir, f));
}

// Extrai o corpo entre parênteses balanceados a partir do índice do '(' de abertura.
function parenBody(sql: string, openIdx: number): string {
  let depth = 0;
  for (let i = openIdx; i < sql.length; i++) {
    if (sql[i] === '(') depth++;
    else if (sql[i] === ')') {
      depth--;
      if (depth === 0) return sql.slice(openIdx + 1, i);
    }
  }
  return sql.slice(openIdx + 1);
}

function findCreatedTables(sql: string): Map<string, boolean> {
  // tabela -> tem company_id na própria definição (CREATE TABLE inline)
  const found = new Map<string, boolean>();
  const re = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const name = m[1].toLowerCase();
    const afterName = sql.slice(re.lastIndex, re.lastIndex + 200);
    // "PARTITION OF <pai>" herda as colunas do pai — não é uma definição própria.
    if (/^\s*PARTITION OF\b/i.test(afterName)) continue;
    const openParen = sql.indexOf('(', re.lastIndex);
    const semi = sql.indexOf(';', re.lastIndex);
    if (openParen === -1 || (semi !== -1 && openParen > semi)) continue;
    const body = parenBody(sql, openParen);
    const hasIt = /company_id/i.test(body);
    found.set(name, (found.get(name) ?? false) || hasIt);
  }
  return found;
}

function findAlteredWithCompanyId(sql: string): Set<string> {
  const altered = new Set<string>();
  const re = /ALTER TABLE\s+(?:IF EXISTS\s+)?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)([^;]*);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    if (/company_id/i.test(m[2])) altered.add(m[1].toLowerCase());
  }
  return altered;
}

// --- Segunda regra (docs/ecosof/04-rls-fase-a-b.md §B.5, "guarda de regressão"):
// a partir da migration 080 (depois da 079 que ligou RLS+FORCE em tudo que já
// existia), toda tabela NOVA precisa nascer com RLS habilitado e pelo menos uma
// política, NA MESMA migration — senão fica com company_id mas sem o Postgres
// impondo nada (a app já é service_role/bypass; RLS é a segunda trava). Até a
// 079 (inclusive) fica intocado — é o histórico que a Fase A já cobriu.
const MIGRACAO_MINIMA_RLS = 80;

// Mesma allowlist de motivo — tabelas globais/singleton não têm company_id
// pra uma política filtrar, então RLS+política não fazem sentido nelas.
// (mantida separada da ALLOWLIST de company_id porque as regras são independentes:
// uma tabela pode entrar numa allowlist e não na outra, se um dia surgir o caso.)
const ALLOWLIST_RLS: Record<string, string> = {
  companies: 'a tabela de tenants em si; id É o tenant, não tem company_id próprio',
  app_flags: 'flags de app, key/value global',
  logs: 'log de sistema, global — RLS ligado sem política já nega quem não tem bypass (ver 079)',
  monitoring_config: 'singleton (id=1), config de autonomia do monitoramento',
  monitoring_treino: 'regras de treino internas, não é dado de cliente',
  telemetria_catalogo: 'catálogo de referência (marca/ponto -> código normalizado)',
  empresa_config: 'singleton (id=1), identidade da implantação (modelo SILO do Kit Clone)',
  empresa_kits: 'catálogo de kits da implantação, mesmo eixo SILO do empresa_config',
  financeiro_anexos: 'referência fixa dos anexos do Simples Nacional (lei, não dado de cliente)',
  eva_knowledge_chunks: 'já tem tenant_id (text, slug), conceito de namespace do RAG, não company_id',
};

function extraiNumeroMigration(caminhoOuNome: string): number | null {
  const base = caminhoOuNome.split(/[\\/]/).pop() ?? caminhoOuNome;
  const m = /^(\d+)_/.exec(base);
  return m ? parseInt(m[1], 10) : null;
}

function temEnableRls(sql: string, tabela: string): boolean {
  const re = new RegExp(`ALTER TABLE\\s+(?:IF EXISTS\\s+)?(?:public\\.)?${tabela}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
  return re.test(sql);
}

function temPolicy(sql: string, tabela: string): boolean {
  // CREATE POLICY <nome> ON <tabela> ... — nome pode ser identificador solto
  // (company_isolation) ou string entre aspas ("Service role full access",
  // estilo usado nas migrations antigas).
  const re = new RegExp(`CREATE POLICY\\s+(?:"[^"]*"|\\S+)\\s+ON\\s+(?:public\\.)?${tabela}\\b`, 'i');
  return re.test(sql);
}

// Função pura exportada: dado o SQL de UMA migration, devolve a lista (ordenada)
// de tabelas criadas nesse arquivo que ficaram sem RLS habilitado ou sem
// política — as duas coisas têm que estar na MESMA migration que cria a tabela.
// allowlist é injetável pra permitir os testes de unidade abaixo usarem fixtures
// isoladas (sem precisar repetir os nomes da allowlist real).
export function checarRlsTabelasNovas(sql: string, allowlist: Record<string, string> = ALLOWLIST_RLS): string[] {
  const criadas = findCreatedTables(sql);
  const ofensores: string[] = [];
  for (const [tabela] of criadas) {
    if (tabela in allowlist) continue;
    const ok = temEnableRls(sql, tabela) && temPolicy(sql, tabela);
    if (!ok) ofensores.push(tabela);
  }
  return ofensores.sort();
}

describe('migrations — toda tabela nova nasce com company_id (ou está na allowlist)', () => {
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const files = migrationFiles(dir);
  const fullSql = files.map((f) => readFileSync(f, 'utf-8')).join('\n');

  it('encontra as migrations (sanidade)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('nenhuma tabela CREATE TABLE fica sem company_id fora da allowlist', () => {
    const created = findCreatedTables(fullSql);
    const altered = findAlteredWithCompanyId(fullSql);

    const ofensores: string[] = [];
    for (const [table, hasInline] of created) {
      if (table in ALLOWLIST) continue;
      const hasCompanyId = hasInline || altered.has(table);
      if (!hasCompanyId) ofensores.push(table);
    }

    expect(
      ofensores.sort(),
      `Tabela(s) sem company_id e fora da allowlist: ${ofensores.join(', ')}.\n` +
        `Se é dado de tenant: adicione company_id (inline ou via ALTER TABLE ... ADD COLUMN).\n` +
        `Se é global/singleton/referência: adicione em ALLOWLIST neste teste com o motivo.`,
    ).toEqual([]);
  });

  it('a allowlist não tem entrada morta (tabela que não existe mais ou já foi corrigida)', () => {
    const created = findCreatedTables(fullSql);
    const mortas = Object.keys(ALLOWLIST).filter((t) => !created.has(t));
    expect(mortas, `Entradas na allowlist sem tabela correspondente: ${mortas.join(', ')}`).toEqual([]);
  });
});

describe('migrations >= 080 — tabela nova nasce com RLS habilitado + política (mesma migration)', () => {
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const files = migrationFiles(dir);
  const arquivosNovos = files.filter((f) => {
    const n = extraiNumeroMigration(f);
    return n !== null && n >= MIGRACAO_MINIMA_RLS;
  });

  it('cada migration >= 080: toda CREATE TABLE tem ENABLE ROW LEVEL SECURITY + CREATE POLICY no mesmo arquivo (fora da allowlist)', () => {
    const ofensores: string[] = [];
    for (const f of arquivosNovos) {
      const sql = readFileSync(f, 'utf-8');
      const problemas = checarRlsTabelasNovas(sql);
      if (problemas.length > 0) ofensores.push(`${f}: ${problemas.join(', ')}`);
    }
    expect(
      ofensores,
      `Migration(s) com tabela nova sem RLS+política: \n${ofensores.join('\n')}\n` +
        `Adicione, na MESMA migration: ALTER TABLE <t> ENABLE ROW LEVEL SECURITY (+ FORCE, idealmente) e ` +
        `CREATE POLICY ... ON <t>. Se é global/singleton: adicione em ALLOWLIST_RLS com o motivo.`,
    ).toEqual([]);
  });
});

describe('checarRlsTabelasNovas — teste de unidade da própria checagem (fixtures inline, sem depender de arquivo)', () => {
  it('passa: CREATE TABLE + ENABLE/FORCE RLS + CREATE POLICY na mesma migration', () => {
    const sqlOk = `
      CREATE TABLE exemplo_ok (
        id uuid primary key default gen_random_uuid(),
        company_id uuid not null references companies(id)
      );
      ALTER TABLE exemplo_ok ENABLE ROW LEVEL SECURITY;
      ALTER TABLE exemplo_ok FORCE ROW LEVEL SECURITY;
      CREATE POLICY company_isolation ON exemplo_ok
        USING (company_id = coalesce(current_setting('app.company_id', true)::uuid, company_id));
    `;
    expect(checarRlsTabelasNovas(sqlOk)).toEqual([]);
  });

  it('falha: CREATE TABLE sem nenhuma CREATE POLICY (RLS habilitado não basta sozinho)', () => {
    const sqlSemPolicy = `
      CREATE TABLE exemplo_sem_policy (
        id uuid primary key default gen_random_uuid(),
        company_id uuid not null references companies(id)
      );
      ALTER TABLE exemplo_sem_policy ENABLE ROW LEVEL SECURITY;
    `;
    expect(checarRlsTabelasNovas(sqlSemPolicy)).toEqual(['exemplo_sem_policy']);
  });
});
