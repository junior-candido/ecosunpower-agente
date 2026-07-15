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
