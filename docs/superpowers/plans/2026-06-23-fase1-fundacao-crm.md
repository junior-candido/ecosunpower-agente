# Fase 1 — Fundação do CRM (multiusuário + permissões + claim + auditoria + multi-tenant) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o dashboard de senha-única num sistema multiusuário com papéis/permissões configuráveis por área, pool de leads com claim automático, auditoria de ações e esqueleto multi-tenant — sem mexer na Eva.

**Architecture:** Evoluir o dashboard no lugar (Express server-rendered em `src/modules/dashboard/`, Supabase/Postgres, Tailwind CDN). Permissão checada no app via helper `can()` (e RLS como defesa em profundidade na fase de hardening). Auth por cookie HMAC passa a carregar o `user_id`. Tudo novo carrega `company_id` (tenant) com a EcoSun como empresa-semente.

**Tech Stack:** TypeScript (ESM, imports com `.js`), Express, Supabase JS, vitest, bcryptjs (novo), Tailwind via CDN.

**Convenções do repo (importantes):**
- Imports relativos usam extensão `.js` (ESM). Ex.: `import { can } from './permissions.js'`.
- Testes em `tests/`, vitest, rodam com `npx vitest run`.
- Migrations em `supabase/migrations/NNN_nome.sql`. Última existente: `055`. Esta fase usa **056**.
- Nunca `git add -A`; sempre por caminho. Não pushar sem autorização do Junior (commits locais OK).
- `company_id` semente da EcoSun (constante fixa): `00000000-0000-0000-0000-000000000001`.

---

## Estrutura de arquivos (o que cada um faz)

**Novos:**
- `supabase/migrations/056_crm_fundacao.sql` — tabelas `companies`, `dashboard_roles` (com seed), `dashboard_users`, `audit_log`; colunas em `leads`.
- `src/modules/dashboard/permissions.ts` — tipos `Area`/`Nivel`, tipo `DashUser`, helper `can()`.
- `src/modules/dashboard/password.ts` — `hashSenha()`/`verificarSenha()` (bcryptjs).
- `src/modules/dashboard/users-store.ts` — acesso a `dashboard_users`/`dashboard_roles` (get/list/create/update/deactivate).
- `src/modules/dashboard/audit.ts` — `audit()` grava em `audit_log`.
- `src/modules/dashboard/seed.ts` — `ensureSeed()` idempotente (company + roles + usuários iniciais) rodado no boot.
- `src/modules/dashboard/usuarios-views.ts` — telas (lista/form) de `/usuarios`.
- `tests/dashboard-permissions.test.ts`, `tests/dashboard-password.test.ts`, `tests/dashboard-audit.test.ts`, `tests/dashboard-auth-token.test.ts`, `tests/dashboard-lead-visibility.test.ts`.

**Modificados:**
- `src/modules/dashboard/auth.ts` — token carrega `user_id`; middleware carrega usuário+papel em `req`; login valida contra `dashboard_users`.
- `src/modules/dashboard/leads-queries.ts` — predicado de visibilidade + filtro no `listLeads`.
- `src/modules/dashboard/router.ts` — claim automático no detalhe; rotas `/usuarios`; gating de permissão; esconder itens do menu.
- `src/index.ts` — chamar `ensureSeed()` no boot; passar deps se necessário.
- `package.json` — dep `bcryptjs`.

---

## Task 1: Adicionar dependência de hash de senha (bcryptjs)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar bcryptjs (JS puro, sem build nativo — seguro no Docker do EasyPanel)**

Run:
```bash
cd "/c/Users/Meu Computador/Documents/ecosunpower-agente" && npm install bcryptjs && npm install -D @types/bcryptjs
```
Expected: `package.json` ganha `bcryptjs` em dependencies e `@types/bcryptjs` em devDependencies; sem erros.

- [ ] **Step 2: Confirmar que instalou**

Run: `node -e "console.log(require('bcryptjs').hashSync('x',10).length>0)"`
Expected: imprime `true`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: adiciona bcryptjs pro hash de senha do dashboard"
```

---

## Task 2: Migration 056 — tabelas da fundação + colunas em leads

**Files:**
- Create: `supabase/migrations/056_crm_fundacao.sql`

- [ ] **Step 1: Escrever a migration completa**

```sql
-- Migration 056: Fundacao do CRM (multiusuario, permissoes, claim, auditoria, multi-tenant)
-- Cria companies/dashboard_roles/dashboard_users/audit_log + colunas de posse em leads.
-- Idempotente (IF NOT EXISTS) pra rodar 2x sem quebrar.

-- 1) Empresas (multi-tenant). Semente: EcoSunPower.
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO companies (id, nome)
VALUES ('00000000-0000-0000-0000-000000000001', 'EcoSunPower')
ON CONFLICT (id) DO NOTHING;

-- 2) Papeis (permissoes por area, configuravel sem codigo).
-- permissoes = jsonb { area: [niveis] }. is_admin=true ignora o mapa e libera tudo.
CREATE TABLE IF NOT EXISTS dashboard_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  nome text NOT NULL,
  permissoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, nome)
);

-- Papeis-semente da EcoSun. Areas: leads, propostas, usinas, financeiro, marketing,
-- relatorios, usuarios, configuracoes. Niveis: visualizar, criar, editar, excluir, exportar, administrar.
INSERT INTO dashboard_roles (company_id, nome, is_admin, permissoes) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Administrador', true, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Comercial', false, '{
    "leads":["visualizar","criar","editar","exportar"],
    "propostas":["visualizar","criar","editar"],
    "usinas":["visualizar"],
    "relatorios":["visualizar"]
  }'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Pos-venda', false, '{
    "leads":["visualizar"],
    "usinas":["visualizar","editar"],
    "relatorios":["visualizar"]
  }'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Financeiro', false, '{
    "financeiro":["visualizar","editar","exportar"],
    "relatorios":["visualizar","exportar"]
  }'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Engenharia', false, '{
    "usinas":["visualizar","criar","editar"],
    "propostas":["visualizar"]
  }'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Instalacao', false, '{
    "usinas":["visualizar","editar"]
  }'::jsonb)
ON CONFLICT (company_id, nome) DO NOTHING;

-- 3) Usuarios do dashboard (login por pessoa).
CREATE TABLE IF NOT EXISTS dashboard_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  nome text NOT NULL,
  login text NOT NULL,
  senha_hash text,
  role_id uuid REFERENCES dashboard_roles(id),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  UNIQUE (company_id, login)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_users_login ON dashboard_users(company_id, login);

-- 4) Auditoria de acoes.
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  user_id uuid REFERENCES dashboard_users(id),
  entidade text NOT NULL,
  entidade_id text,
  acao text NOT NULL,
  campo text,
  valor_antigo text,
  valor_novo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entidade ON audit_log(entidade, entidade_id, created_at DESC);

-- 5) Posse de lead (claim) + SLA. company_id pra multi-tenant.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS claimed_by uuid REFERENCES dashboard_users(id),
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz;

-- Backfill: todos os leads existentes pertencem a EcoSun.
UPDATE leads SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_claimed_by ON leads(claimed_by);

COMMENT ON TABLE dashboard_roles IS 'Papeis com permissoes por area (jsonb). is_admin=true libera tudo.';
COMMENT ON COLUMN leads.claimed_by IS 'Vendedor dono do lead (pool+claim). NULL=no balcao.';
```

- [ ] **Step 2: Validar a sintaxe SQL localmente (parse com o cliente psql não é necessário; revisar a olho)**

Releia o arquivo e confirme: 4 `CREATE TABLE IF NOT EXISTS`, 2 `INSERT ... ON CONFLICT`, 1 `ALTER TABLE leads`, 1 `UPDATE` de backfill. Sem ponto-e-vírgula faltando.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/056_crm_fundacao.sql
git commit -m "feat(crm): migration 056 - companies/roles/users/audit + posse em leads"
```

> A migration é aplicada no Supabase pelo Junior na hora do deploy (não roda agora).

---

## Task 3: Módulo de permissões (`permissions.ts`) + testes

**Files:**
- Create: `src/modules/dashboard/permissions.ts`
- Test: `tests/dashboard-permissions.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// tests/dashboard-permissions.test.ts
import { describe, it, expect } from 'vitest';
import { can, type DashUser } from '../src/modules/dashboard/permissions.js';

const admin: DashUser = {
  id: 'u1', companyId: 'c1', nome: 'Junior', login: 'admin',
  isAdmin: true, roleNome: 'Administrador', permissoes: {},
};
const comercial: DashUser = {
  id: 'u2', companyId: 'c1', nome: 'Ana', login: 'ana',
  isAdmin: false, roleNome: 'Comercial',
  permissoes: { leads: ['visualizar', 'criar', 'editar', 'exportar'], usinas: ['visualizar'] },
};

describe('can() — permissão por área e nível', () => {
  it('admin pode tudo', () => {
    expect(can(admin, 'financeiro', 'excluir')).toBe(true);
    expect(can(admin, 'usuarios', 'administrar')).toBe(true);
  });
  it('comercial pode o que o papel lista', () => {
    expect(can(comercial, 'leads', 'editar')).toBe(true);
    expect(can(comercial, 'usinas', 'visualizar')).toBe(true);
  });
  it('comercial NÃO pode o que não está no papel', () => {
    expect(can(comercial, 'financeiro', 'visualizar')).toBe(false);
    expect(can(comercial, 'leads', 'excluir')).toBe(false);
    expect(can(comercial, 'usinas', 'editar')).toBe(false);
  });
  it('"administrar" numa área concede todos os níveis daquela área', () => {
    const gerente: DashUser = { ...comercial, permissoes: { relatorios: ['administrar'] } };
    expect(can(gerente, 'relatorios', 'exportar')).toBe(true);
    expect(can(gerente, 'relatorios', 'excluir')).toBe(true);
    expect(can(gerente, 'leads', 'visualizar')).toBe(false);
  });
  it('usuário nulo não pode nada', () => {
    expect(can(null, 'leads', 'visualizar')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run tests/dashboard-permissions.test.ts`
Expected: FAIL (módulo `permissions.js` não existe).

- [ ] **Step 3: Implementar o módulo**

```typescript
// src/modules/dashboard/permissions.ts
// Modelo de permissões do dashboard: áreas × níveis, configurável por papel.
// Checagem central via can(). is_admin libera tudo; "administrar" numa área
// concede todos os níveis daquela área.

export const AREAS = [
  'leads', 'propostas', 'usinas', 'financeiro',
  'marketing', 'relatorios', 'usuarios', 'configuracoes',
] as const;
export type Area = (typeof AREAS)[number];

export const NIVEIS = [
  'visualizar', 'criar', 'editar', 'excluir', 'exportar', 'administrar',
] as const;
export type Nivel = (typeof NIVEIS)[number];

export type Permissoes = Partial<Record<Area, Nivel[]>>;

export interface DashUser {
  id: string;
  companyId: string;
  nome: string;
  login: string;
  isAdmin: boolean;
  roleNome: string;
  permissoes: Permissoes;
}

export function can(user: DashUser | null | undefined, area: Area, nivel: Nivel): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  const perms = user.permissoes?.[area] ?? [];
  if (perms.includes('administrar')) return true;
  return perms.includes(nivel);
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run tests/dashboard-permissions.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/permissions.ts tests/dashboard-permissions.test.ts
git commit -m "feat(crm): modelo de permissoes (areas x niveis) + can()"
```

---

## Task 4: Hash de senha (`password.ts`) + teste

**Files:**
- Create: `src/modules/dashboard/password.ts`
- Test: `tests/dashboard-password.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// tests/dashboard-password.test.ts
import { describe, it, expect } from 'vitest';
import { hashSenha, verificarSenha } from '../src/modules/dashboard/password.js';

describe('hash de senha', () => {
  it('hash bate com a senha certa e falha com a errada', async () => {
    const hash = await hashSenha('senha-forte-123');
    expect(hash).not.toBe('senha-forte-123');
    expect(await verificarSenha('senha-forte-123', hash)).toBe(true);
    expect(await verificarSenha('errada', hash)).toBe(false);
  });
  it('verificarSenha com hash nulo retorna false', async () => {
    expect(await verificarSenha('qualquer', null)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/dashboard-password.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```typescript
// src/modules/dashboard/password.ts
// Hash de senha com bcryptjs (JS puro). Custo 10 = bom equilíbrio segurança/tempo.
import bcrypt from 'bcryptjs';

const COST = 10;

export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, COST);
}

export async function verificarSenha(senha: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(senha, hash);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/dashboard-password.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/password.ts tests/dashboard-password.test.ts
git commit -m "feat(crm): hash de senha com bcryptjs"
```

---

## Task 5: Acesso a usuários/papéis (`users-store.ts`)

**Files:**
- Create: `src/modules/dashboard/users-store.ts`

> Camada fina sobre o Supabase. Funções puras de IO (sem teste unitário pesado — validadas no smoke e usadas pelo auth/seed). Tipos reaproveitam `permissions.ts`.

- [ ] **Step 1: Implementar o store**

```typescript
// src/modules/dashboard/users-store.ts
// Acesso a dashboard_users e dashboard_roles. Monta o DashUser (com papel+permissoes)
// usado pelo auth e pelas telas de /usuarios.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DashUser, Permissoes } from './permissions.js';

export interface RoleRow {
  id: string;
  company_id: string;
  nome: string;
  permissoes: Permissoes;
  is_admin: boolean;
}

interface UserRow {
  id: string;
  company_id: string;
  nome: string;
  login: string;
  senha_hash: string | null;
  role_id: string | null;
  ativo: boolean;
}

function montarDashUser(u: UserRow, role: RoleRow | null): DashUser {
  return {
    id: u.id,
    companyId: u.company_id,
    nome: u.nome,
    login: u.login,
    isAdmin: role?.is_admin ?? false,
    roleNome: role?.nome ?? '(sem papel)',
    permissoes: role?.permissoes ?? {},
  };
}

export async function getUserByLogin(
  client: SupabaseClient,
  companyId: string,
  login: string,
): Promise<{ user: DashUser; senhaHash: string | null } | null> {
  const { data: u } = await client
    .from('dashboard_users')
    .select('id, company_id, nome, login, senha_hash, role_id, ativo')
    .eq('company_id', companyId)
    .eq('login', login)
    .eq('ativo', true)
    .maybeSingle();
  if (!u) return null;
  const role = u.role_id ? await getRole(client, u.role_id) : null;
  return { user: montarDashUser(u as UserRow, role), senhaHash: (u as UserRow).senha_hash };
}

export async function getUserById(client: SupabaseClient, id: string): Promise<DashUser | null> {
  const { data: u } = await client
    .from('dashboard_users')
    .select('id, company_id, nome, login, senha_hash, role_id, ativo')
    .eq('id', id)
    .eq('ativo', true)
    .maybeSingle();
  if (!u) return null;
  const role = (u as UserRow).role_id ? await getRole(client, (u as UserRow).role_id!) : null;
  return montarDashUser(u as UserRow, role);
}

export async function getRole(client: SupabaseClient, id: string): Promise<RoleRow | null> {
  const { data } = await client
    .from('dashboard_roles')
    .select('id, company_id, nome, permissoes, is_admin')
    .eq('id', id)
    .maybeSingle();
  return (data as RoleRow) ?? null;
}

export async function listRoles(client: SupabaseClient, companyId: string): Promise<RoleRow[]> {
  const { data } = await client
    .from('dashboard_roles')
    .select('id, company_id, nome, permissoes, is_admin')
    .eq('company_id', companyId)
    .order('nome');
  return (data as RoleRow[]) ?? [];
}

export interface UserListItem {
  id: string; nome: string; login: string; ativo: boolean; role_nome: string | null;
}

export async function listUsers(client: SupabaseClient, companyId: string): Promise<UserListItem[]> {
  const { data } = await client
    .from('dashboard_users')
    .select('id, nome, login, ativo, dashboard_roles(nome)')
    .eq('company_id', companyId)
    .order('nome');
  return (data ?? []).map((u: any) => ({
    id: u.id, nome: u.nome, login: u.login, ativo: u.ativo,
    role_nome: u.dashboard_roles?.nome ?? null,
  }));
}

export async function createUser(
  client: SupabaseClient,
  input: { companyId: string; nome: string; login: string; senhaHash: string; roleId: string },
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await client.from('dashboard_users').insert({
    company_id: input.companyId, nome: input.nome, login: input.login,
    senha_hash: input.senhaHash, role_id: input.roleId, ativo: true,
  }).select('id').single();
  if (error) return { error: error.code === '23505' ? 'login_em_uso' : error.message };
  return { id: (data as { id: string }).id };
}

export async function updateUser(
  client: SupabaseClient,
  id: string,
  patch: { nome?: string; roleId?: string; ativo?: boolean; senhaHash?: string },
): Promise<void> {
  const upd: Record<string, unknown> = {};
  if (patch.nome !== undefined) upd.nome = patch.nome;
  if (patch.roleId !== undefined) upd.role_id = patch.roleId;
  if (patch.ativo !== undefined) upd.ativo = patch.ativo;
  if (patch.senhaHash !== undefined) upd.senha_hash = patch.senhaHash;
  if (Object.keys(upd).length === 0) return;
  await client.from('dashboard_users').update(upd).eq('id', id);
}

export async function touchLastLogin(client: SupabaseClient, id: string): Promise<void> {
  await client.from('dashboard_users').update({ last_login_at: new Date().toISOString() }).eq('id', id);
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros novos relacionados a `users-store.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/modules/dashboard/users-store.ts
git commit -m "feat(crm): users-store (acesso a usuarios e papeis)"
```

---

## Task 6: Auditoria (`audit.ts`) + teste

**Files:**
- Create: `src/modules/dashboard/audit.ts`
- Test: `tests/dashboard-audit.test.ts`

- [ ] **Step 1: Escrever o teste que falha (mock do supabase)**

```typescript
// tests/dashboard-audit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { audit } from '../src/modules/dashboard/audit.js';

function fakeClient() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  return { client: { from: vi.fn(() => ({ insert })) } as any, insert };
}

describe('audit()', () => {
  it('insere uma linha em audit_log com os campos certos', async () => {
    const { client, insert } = fakeClient();
    await audit(client, {
      companyId: 'c1', userId: 'u1', entidade: 'lead',
      entidadeId: 'lead-9', acao: 'claim',
    });
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.company_id).toBe('c1');
    expect(row.user_id).toBe('u1');
    expect(row.entidade).toBe('lead');
    expect(row.entidade_id).toBe('lead-9');
    expect(row.acao).toBe('claim');
  });
  it('não lança se o insert falhar (auditoria nunca quebra o fluxo)', async () => {
    const client = { from: () => ({ insert: () => Promise.reject(new Error('db down')) }) } as any;
    await expect(audit(client, { companyId: 'c1', entidade: 'lead', acao: 'editar' })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/dashboard-audit.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```typescript
// src/modules/dashboard/audit.ts
// Registra ações no audit_log. NUNCA lança — auditoria não pode derrubar o fluxo.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuditInput {
  companyId: string;
  userId?: string | null;
  entidade: string;       // 'lead' | 'usuario' | 'proposta' | ...
  entidadeId?: string | null;
  acao: string;           // 'criou' | 'editar' | 'excluiu' | 'claim' | 'etapa' | 'login' | ...
  campo?: string | null;
  valorAntigo?: string | null;
  valorNovo?: string | null;
}

export async function audit(client: SupabaseClient, input: AuditInput): Promise<void> {
  try {
    await client.from('audit_log').insert({
      company_id: input.companyId,
      user_id: input.userId ?? null,
      entidade: input.entidade,
      entidade_id: input.entidadeId ?? null,
      acao: input.acao,
      campo: input.campo ?? null,
      valor_antigo: input.valorAntigo ?? null,
      valor_novo: input.valorNovo ?? null,
    });
  } catch (err) {
    console.warn('[audit] falha ao gravar (ignorado):', (err as Error).message);
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/dashboard-audit.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/audit.ts tests/dashboard-audit.test.ts
git commit -m "feat(crm): auditoria de acoes (audit_log)"
```

---

## Task 7: Auth multiusuário — token com user_id + login + middleware

**Files:**
- Modify: `src/modules/dashboard/auth.ts`
- Test: `tests/dashboard-auth-token.test.ts`

- [ ] **Step 1: Escrever o teste do token (gera/parseia com user_id)**

```typescript
// tests/dashboard-auth-token.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { gerarTokenSessao, lerUserIdDoToken } from '../src/modules/dashboard/auth.js';

beforeAll(() => { process.env.META_APP_SECRET = 'segredo-de-teste-bem-longo-123456'; });

describe('token de sessão com user_id', () => {
  it('gera e recupera o user_id', () => {
    const token = gerarTokenSessao('user-42');
    expect(lerUserIdDoToken(token)).toBe('user-42');
  });
  it('token adulterado é rejeitado', () => {
    const token = gerarTokenSessao('user-42');
    const adulterado = token.replace('user-42', 'user-99');
    expect(lerUserIdDoToken(adulterado)).toBeNull();
  });
  it('token mal-formado é rejeitado', () => {
    expect(lerUserIdDoToken('lixo')).toBeNull();
    expect(lerUserIdDoToken('')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/dashboard-auth-token.test.ts`
Expected: FAIL (`gerarTokenSessao` agora exige arg / `lerUserIdDoToken` não existe).

- [ ] **Step 3: Reescrever `auth.ts` (token carrega user_id; middleware carrega usuário)**

Substitua o conteúdo de `src/modules/dashboard/auth.ts` por:

```typescript
// Auth do dashboard: login por pessoa + cookie de sessão HMAC carregando o user_id.
// Cookie 'ecosun_dash_token' = `<userId>.<exp>.<hmac(userId.exp)>`. 60 dias.
// Assinado com META_APP_SECRET (fallback DASHBOARD_PASSWORD).

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DashUser } from './permissions.js';
import { getUserById } from './users-store.js';

const COOKIE_NAME = 'ecosun_dash_token';
const COOKIE_TTL_DAYS = 60;

function getSecret(): string {
  return process.env.META_APP_SECRET ?? process.env.DASHBOARD_PASSWORD ?? 'fallback-mude-isso';
}

function assinar(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

export function gerarTokenSessao(userId: string): string {
  const exp = Date.now() + COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${assinar(payload)}`;
}

// Valida assinatura + expiração e devolve o userId, ou null.
export function lerUserIdDoToken(token: string): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (!userId || !/^\d+$/.test(exp) || !/^[a-f0-9]{64}$/i.test(sig)) return null;
  const expected = assinar(`${userId}.${exp}`);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))) return null;
  } catch {
    return null;
  }
  if (parseInt(exp, 10) <= Date.now()) return null;
  return userId;
}

function lerCookieToken(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const p of raw.split(';')) {
    const t = p.trim();
    if (t.startsWith(COOKIE_NAME + '=')) return decodeURIComponent(t.slice(COOKIE_NAME.length + 1));
  }
  return null;
}

// Estende o Request com o usuário logado.
export interface AuthedRequest extends Request {
  dashUser?: DashUser;
}

// Cria o middleware de sessão. Precisa do supabase pra carregar o usuário do token.
export function criarSessionAuth(client: SupabaseClient) {
  return async function dashboardSessionAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
    const token = lerCookieToken(req);
    const userId = token ? lerUserIdDoToken(token) : null;
    if (userId) {
      const user = await getUserById(client, userId);
      if (user) {
        req.dashUser = user;
        next();
        return;
      }
    }
    const accept = (req.headers.accept ?? '').toLowerCase();
    if (accept.includes('application/json')) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.redirect(`/dashboard/login?next=${encodeURIComponent(req.originalUrl)}`);
  };
}

export function setSessionCookie(res: Response, userId: string): void {
  const token = gerarTokenSessao(userId);
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${COOKIE_TTL_DAYS * 24 * 60 * 60}`,
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}
```

> Removidas `validarTokenSessao`, `dashboardSessionAuth` (vira `criarSessionAuth`), `senhaValida` (a verificação agora é bcrypt no login). A Task 8 ajusta o login e a Task 12 reconecta tudo no router/index.

- [ ] **Step 4: Rodar o teste do token e ver passar**

Run: `npx vitest run tests/dashboard-auth-token.test.ts`
Expected: PASS (3 testes). (Erros de compilação no router por causa das funções renomeadas serão resolvidos nas Tasks 8/12.)

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/auth.ts tests/dashboard-auth-token.test.ts
git commit -m "feat(crm): auth carrega user_id no token + middleware carrega usuario"
```

---

## Task 8: Seed idempotente + login por usuário

**Files:**
- Create: `src/modules/dashboard/seed.ts`

- [ ] **Step 1: Implementar o seed (cria admin + 2 comerciais no boot, sem hash em SQL)**

```typescript
// src/modules/dashboard/seed.ts
// Garante (idempotente) os usuários iniciais no boot. Hash de senha é feito aqui
// (não dá pra pôr hash bcrypt no SQL). Reusa DASHBOARD_PASSWORD como senha inicial
// do admin; comerciais recebem DASHBOARD_SEED_PASSWORD (default trocavel).
import type { SupabaseClient } from '@supabase/supabase-js';
import { hashSenha } from './password.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';

async function roleId(client: SupabaseClient, nome: string): Promise<string | null> {
  const { data } = await client.from('dashboard_roles')
    .select('id').eq('company_id', ECOSUN).eq('nome', nome).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function ensureUser(
  client: SupabaseClient,
  login: string, nome: string, roleNome: string, senhaPlana: string,
): Promise<void> {
  const { data: existe } = await client.from('dashboard_users')
    .select('id, senha_hash').eq('company_id', ECOSUN).eq('login', login).maybeSingle();
  const rid = await roleId(client, roleNome);
  if (!rid) { console.warn(`[seed] papel ${roleNome} não encontrado; pulei ${login}`); return; }
  if (!existe) {
    await client.from('dashboard_users').insert({
      company_id: ECOSUN, login, nome, role_id: rid,
      senha_hash: await hashSenha(senhaPlana), ativo: true,
    });
    console.log(`[seed] usuário ${login} criado`);
  } else if (!(existe as { senha_hash: string | null }).senha_hash) {
    // usuário existe mas sem senha (ex.: seed parcial) → define
    await client.from('dashboard_users').update({ senha_hash: await hashSenha(senhaPlana) })
      .eq('id', (existe as { id: string }).id);
  }
}

export async function ensureSeed(client: SupabaseClient): Promise<void> {
  try {
    const adminPass = process.env.DASHBOARD_PASSWORD;
    if (!adminPass) { console.warn('[seed] DASHBOARD_PASSWORD ausente; admin não semeado'); return; }
    const adminLogin = process.env.DASHBOARD_ADMIN_LOGIN ?? 'admin';
    const seedPass = process.env.DASHBOARD_SEED_PASSWORD ?? 'trocar123';
    await ensureUser(client, adminLogin, 'Junior (Admin)', 'Administrador', adminPass);
    await ensureUser(client, 'comercial1', 'Comercial 1', 'Comercial', seedPass);
    await ensureUser(client, 'comercial2', 'Comercial 2', 'Comercial', seedPass);
  } catch (err) {
    console.warn('[seed] falhou (ignorado):', (err as Error).message);
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "seed.ts" || echo "seed.ts OK"`
Expected: `seed.ts OK` (sem erro nesse arquivo; pode haver erros do router pendentes da Task 12).

- [ ] **Step 3: Commit**

```bash
git add src/modules/dashboard/seed.ts
git commit -m "feat(crm): seed idempotente de usuarios (admin + 2 comerciais)"
```

---

## Task 9: Visibilidade + claim de leads

**Files:**
- Modify: `src/modules/dashboard/leads-queries.ts`
- Test: `tests/dashboard-lead-visibility.test.ts`

- [ ] **Step 1: Escrever o teste do predicado de visibilidade**

```typescript
// tests/dashboard-lead-visibility.test.ts
import { describe, it, expect } from 'vitest';
import { podeVerLead } from '../src/modules/dashboard/leads-queries.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

const admin: DashUser = { id: 'a', companyId: 'c', nome: 'J', login: 'admin', isAdmin: true, roleNome: 'Administrador', permissoes: {} };
const ana: DashUser = { id: 'ana', companyId: 'c', nome: 'Ana', login: 'ana', isAdmin: false, roleNome: 'Comercial', permissoes: { leads: ['visualizar', 'editar'] } };
const leo: DashUser = { ...ana, id: 'leo', login: 'leo' };

describe('podeVerLead — pool + claim', () => {
  it('admin vê qualquer lead', () => {
    expect(podeVerLead(admin, { claimed_by: 'leo' })).toBe(true);
  });
  it('vendedor vê lead no balcão (claimed_by null)', () => {
    expect(podeVerLead(ana, { claimed_by: null })).toBe(true);
  });
  it('vendedor vê o próprio lead', () => {
    expect(podeVerLead(ana, { claimed_by: 'ana' })).toBe(true);
  });
  it('vendedor NÃO vê lead de outro vendedor', () => {
    expect(podeVerLead(ana, { claimed_by: 'leo' })).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/dashboard-lead-visibility.test.ts`
Expected: FAIL (`podeVerLead` não existe).

- [ ] **Step 3: Adicionar `podeVerLead`, `claimLead` e o filtro no `listLeads`**

No topo de `src/modules/dashboard/leads-queries.ts`, adicione o import:
```typescript
import type { DashUser } from './permissions.js';
```

Adicione estas funções (no fim do arquivo):
```typescript
// Pode o usuário ver este lead? Admin vê tudo; vendedor vê balcão (sem dono) ou os seus.
export function podeVerLead(user: DashUser, lead: { claimed_by: string | null }): boolean {
  if (user.isAdmin) return true;
  return lead.claimed_by === null || lead.claimed_by === user.id;
}

// Claim automático: marca o lead como do usuário se ainda estiver no balcão.
// Retorna true se capturou agora (pra registrar auditoria). Idempotente.
export async function claimLead(
  client: SupabaseClient,
  leadId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await client
    .from('leads')
    .update({ claimed_by: userId, claimed_at: new Date().toISOString() })
    .eq('id', leadId)
    .is('claimed_by', null) // só captura se ainda estiver no balcão (evita corrida)
    .select('id');
  return Array.isArray(data) && data.length > 0;
}
```

No `listLeads`, adicione um parâmetro de visibilidade. Modifique a assinatura e o filtro:
```typescript
export interface ListLeadsOptions {
  status?: string;
  eva_active?: boolean;
  only_alerts?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  // visibilidade: quando setado e não-admin, filtra pool + os do próprio usuário
  viewerId?: string;
  viewerIsAdmin?: boolean;
}
```
Dentro de `listLeads`, logo após montar o `query` base (onde os outros `.eq()` são aplicados), adicione:
```typescript
  // Visibilidade pool+claim: vendedor vê só balcão (claimed_by null) ou os seus.
  if (filters.viewerId && !filters.viewerIsAdmin) {
    query = query.or(`claimed_by.is.null,claimed_by.eq.${filters.viewerId}`);
  }
```
> Nota pro implementador: localize a variável da query (provavelmente `let query = client.from('leads').select(...)`). Se a query for construída em mais de um lugar (lista + contagem), aplique o mesmo `.or(...)` nos dois pra a paginação/contagem baterem. Use `let` em vez de `const` se necessário.

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run tests/dashboard-lead-visibility.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Rodar tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "leads-queries" || echo "leads-queries OK"`
Expected: `leads-queries OK`.

- [ ] **Step 6: Commit**

```bash
git add src/modules/dashboard/leads-queries.ts tests/dashboard-lead-visibility.test.ts
git commit -m "feat(crm): visibilidade pool+claim e claimLead nos leads"
```

---

## Task 10: Tela de usuários (`/usuarios`) — views + rotas

**Files:**
- Create: `src/modules/dashboard/usuarios-views.ts`
- Modify: `src/modules/dashboard/router.ts`

> Telas HTML (server-rendered, padrão do `views.ts`). Sem teste unitário — validação por build + smoke. Reusa `renderLayout` do `views.ts`.

- [ ] **Step 1: Criar as views**

```typescript
// src/modules/dashboard/usuarios-views.ts
// Telas de /usuarios: lista + form de criar/editar. Só admin (gating no router).
import { renderLayout } from './views.js';
import type { UserListItem, RoleRow } from './users-store.js';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function renderUsuariosListPage(users: UserListItem[], roles: RoleRow[]): string {
  const linhas = users.map((u) => `
    <tr class="border-b border-slate-200 hover:bg-slate-50">
      <td class="px-3 py-2">${esc(u.nome)}</td>
      <td class="px-3 py-2 text-slate-500">${esc(u.login)}</td>
      <td class="px-3 py-2">${esc(u.role_nome ?? '—')}</td>
      <td class="px-3 py-2">${u.ativo ? '🟢 ativo' : '⚪ inativo'}</td>
      <td class="px-3 py-2 text-right">
        <a href="/dashboard/usuarios/${u.id}" class="text-sky-600 hover:underline">editar</a>
      </td>
    </tr>`).join('');

  const opcoesPapel = roles.map((r) => `<option value="${r.id}">${esc(r.nome)}</option>`).join('');

  const body = `
  <div class="flex items-center justify-between mb-4">
    <h1 class="text-xl font-bold">Usuários</h1>
  </div>
  <form method="POST" action="/dashboard/usuarios/novo" class="bg-white rounded-lg border border-slate-200 p-4 mb-6 grid grid-cols-1 md:grid-cols-5 gap-3">
    <input name="nome" placeholder="Nome" required class="border border-slate-300 rounded-md px-3 py-1.5" />
    <input name="login" placeholder="Login" required class="border border-slate-300 rounded-md px-3 py-1.5" />
    <input name="senha" type="password" placeholder="Senha inicial" required class="border border-slate-300 rounded-md px-3 py-1.5" />
    <select name="role_id" required class="border border-slate-300 rounded-md px-3 py-1.5">${opcoesPapel}</select>
    <button class="bg-sky-600 hover:bg-sky-700 text-white rounded-md px-4 py-2">Criar usuário</button>
  </form>
  <table class="w-full bg-white rounded-lg border border-slate-200 text-sm">
    <thead><tr class="text-left text-slate-500 border-b border-slate-200">
      <th class="px-3 py-2">Nome</th><th class="px-3 py-2">Login</th><th class="px-3 py-2">Papel</th><th class="px-3 py-2">Status</th><th></th>
    </tr></thead>
    <tbody>${linhas || '<tr><td class="px-3 py-4 text-slate-400" colspan="5">Nenhum usuário</td></tr>'}</tbody>
  </table>`;
  return renderLayout('Usuários', body);
}

export function renderUsuarioEditPage(
  user: { id: string; nome: string; login: string; ativo: boolean; role_id: string | null },
  roles: RoleRow[],
): string {
  const opcoes = roles.map((r) => `<option value="${r.id}" ${r.id === user.role_id ? 'selected' : ''}>${esc(r.nome)}</option>`).join('');
  const body = `
  <a href="/dashboard/usuarios" class="text-sky-600 hover:underline text-sm">← Usuários</a>
  <h1 class="text-xl font-bold my-4">Editar: ${esc(user.nome)}</h1>
  <form method="POST" action="/dashboard/usuarios/${user.id}" class="bg-white rounded-lg border border-slate-200 p-4 grid gap-3 max-w-lg">
    <label class="text-sm">Nome
      <input name="nome" value="${esc(user.nome)}" class="w-full border border-slate-300 rounded-md px-3 py-1.5" />
    </label>
    <label class="text-sm">Papel
      <select name="role_id" class="w-full border border-slate-300 rounded-md px-3 py-1.5">${opcoes}</select>
    </label>
    <label class="text-sm">Nova senha (deixe em branco pra manter)
      <input name="senha" type="password" class="w-full border border-slate-300 rounded-md px-3 py-1.5" />
    </label>
    <label class="text-sm flex items-center gap-2">
      <input type="checkbox" name="ativo" ${user.ativo ? 'checked' : ''} /> Ativo
    </label>
    <button class="bg-sky-600 hover:bg-sky-700 text-white rounded-md px-4 py-2 w-fit">Salvar</button>
  </form>`;
  return renderLayout('Editar usuário', body);
}
```

> Nota: confirme a assinatura real de `renderLayout` em `views.ts` (provavelmente `renderLayout(titulo, htmlBody, ...)`). Ajuste a chamada se necessário (ex.: se exigir o usuário/menu como argumento — ver Task 11).

- [ ] **Step 2: Adicionar as rotas em `router.ts`**

Adicione os imports no topo do `router.ts`:
```typescript
import { renderUsuariosListPage, renderUsuarioEditPage } from './usuarios-views.js';
import { listUsers, listRoles, createUser, updateUser } from './users-store.js';
import { hashSenha } from './password.js';
import { audit } from './audit.js';
import { can } from './permissions.js';
import type { AuthedRequest } from './auth.js';
```

Adicione as rotas (após o middleware de auth, junto das outras rotas protegidas). `ECOSUN` = `'00000000-0000-0000-0000-000000000001'`:
```typescript
const ECOSUN = '00000000-0000-0000-0000-000000000001';

router.get('/usuarios', async (req: AuthedRequest, res) => {
  if (!can(req.dashUser, 'usuarios', 'visualizar')) { res.status(403).send('Sem permissão'); return; }
  const cid = req.dashUser!.companyId;
  const [users, roles] = await Promise.all([listUsers(client, cid), listRoles(client, cid)]);
  res.type('html').send(renderUsuariosListPage(users, roles));
});

router.post('/usuarios/novo', async (req: AuthedRequest, res) => {
  if (!can(req.dashUser, 'usuarios', 'criar')) { res.status(403).send('Sem permissão'); return; }
  const { nome, login, senha, role_id } = req.body ?? {};
  if (!nome || !login || !senha || !role_id) { res.status(400).send('Campos obrigatórios'); return; }
  const r = await createUser(client, {
    companyId: req.dashUser!.companyId, nome, login,
    senhaHash: await hashSenha(senha), roleId: role_id,
  });
  if ('error' in r) { res.status(400).send(r.error === 'login_em_uso' ? 'Login já existe' : r.error); return; }
  await audit(client, { companyId: req.dashUser!.companyId, userId: req.dashUser!.id, entidade: 'usuario', entidadeId: r.id, acao: 'criou' });
  res.redirect('/dashboard/usuarios');
});

router.get('/usuarios/:id', async (req: AuthedRequest, res) => {
  if (!can(req.dashUser, 'usuarios', 'visualizar')) { res.status(403).send('Sem permissão'); return; }
  const cid = req.dashUser!.companyId;
  const { data: u } = await client.from('dashboard_users')
    .select('id, nome, login, ativo, role_id').eq('id', req.params.id).maybeSingle();
  if (!u) { res.status(404).send('Usuário não encontrado'); return; }
  const roles = await listRoles(client, cid);
  res.type('html').send(renderUsuarioEditPage(u as any, roles));
});

router.post('/usuarios/:id', async (req: AuthedRequest, res) => {
  if (!can(req.dashUser, 'usuarios', 'editar')) { res.status(403).send('Sem permissão'); return; }
  const { nome, role_id, senha, ativo } = req.body ?? {};
  await updateUser(client, req.params.id, {
    nome, roleId: role_id, ativo: ativo === 'on' || ativo === true,
    senhaHash: senha ? await hashSenha(senha) : undefined,
  });
  await audit(client, { companyId: req.dashUser!.companyId, userId: req.dashUser!.id, entidade: 'usuario', entidadeId: req.params.id, acao: 'editar' });
  res.redirect('/dashboard/usuarios');
});
```

> Nota pro implementador: confirme como o `client` (SupabaseClient) é obtido dentro do `createDashboardRouter` (provavelmente `supabaseService.getClient()` no início da factory). Use a mesma referência. Confirme que `express.urlencoded({ extended: true })` está ativo (pra `req.body` dos forms) — se não, adicione `router.use(express.urlencoded({ extended: true }))` no topo do router.

- [ ] **Step 3: Build pra garantir que compila**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "usuarios-views|router.ts" || echo "usuarios+router OK"`
Expected: `usuarios+router OK` (ou erros só relacionados às mudanças da Task 11/12, resolvidos lá).

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/usuarios-views.ts src/modules/dashboard/router.ts
git commit -m "feat(crm): tela de usuarios (lista/criar/editar) com auditoria"
```

---

## Task 11: Gating de permissão nas rotas existentes + esconder menu

**Files:**
- Modify: `src/modules/dashboard/router.ts`
- Modify: `src/modules/dashboard/views.ts` (menu condicional)

- [ ] **Step 1: Adicionar helper de gating e aplicar nas rotas por área**

No `router.ts`, crie um middleware-fábrica logo após os imports:
```typescript
function exigir(area: import('./permissions.js').Area, nivel: import('./permissions.js').Nivel) {
  return (req: AuthedRequest, res: import('express').Response, next: import('express').NextFunction) => {
    if (can(req.dashUser, area, nivel)) { next(); return; }
    res.status(403).send('<h2>Sem permissão</h2><p>Fale com o administrador.</p>');
  };
}
```
Aplique nas rotas existentes conforme a área (exemplos — repita o padrão):
```typescript
// leads
router.get('/leads', exigir('leads', 'visualizar'), /* handler existente */);
// propostas
router.get('/propostas', exigir('propostas', 'visualizar'), /* handler existente */);
// monitoramento (usinas)
router.get('/monitoramento', exigir('usinas', 'visualizar'), /* handler existente */);
// financeiro
router.get('/financeiro', exigir('financeiro', 'visualizar'), /* handler existente */);
// marketing
router.get('/marketing', exigir('marketing', 'visualizar'), /* handler existente */);
```
> Nota pro implementador: insira `exigir(area, nivel)` como middleware ANTES do handler atual de cada rota listada. Para ações POST destrutivas em leads (delete/arquivar/set-status) use `exigir('leads','editar')` ou `'excluir'` conforme o caso. Não altere a lógica interna dos handlers — só prefixe o middleware.

- [ ] **Step 2: Esconder itens do menu conforme permissão**

Em `views.ts`, a função `renderLayout` monta o menu. Passe o usuário e condicione os links. Ajuste a assinatura de `renderLayout` pra receber o usuário (opcional) e filtrar:
```typescript
// dentro de renderLayout, ao montar os links de navegação:
// (pseudo — adapte aos links reais existentes)
const user = opts?.user; // DashUser | undefined
const item = (href: string, label: string, area?: Area, nivel: Nivel = 'visualizar') =>
  (!area || !user || can(user, area, nivel))
    ? `<a href="${href}" class="...classes existentes...">${label}</a>` : '';
// usar item('/dashboard/leads','Leads','leads'), item('/dashboard/financeiro','Financeiro','financeiro'),
// item('/dashboard/usuarios','Usuários','usuarios'), etc.
```
> Nota: importe `can` e os tipos em `views.ts`. Passe `req.dashUser` do router pras chamadas de `renderLayout`. Onde o render hoje não recebe o usuário, adicione o parâmetro. Mantenha compatibilidade: se `user` for `undefined`, mostra tudo (evita quebrar telas ainda não migradas; serão migradas conforme tocadas).

- [ ] **Step 3: Build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | tail -20`
Expected: pode listar pontos onde `renderLayout` precisa do novo argumento — ajuste as chamadas pra passar `req.dashUser`. Itere até zero erros.

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/router.ts src/modules/dashboard/views.ts
git commit -m "feat(crm): gating de permissao por area nas rotas + menu condicional"
```

---

## Task 12: Reconectar tudo — login, middleware, claim no detalhe, boot

**Files:**
- Modify: `src/modules/dashboard/router.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Trocar o middleware de auth do router pelo novo (com supabase)**

No `router.ts`, onde hoje há `router.use(dashboardSessionAuth)`, troque por:
```typescript
import { criarSessionAuth, setSessionCookie, clearSessionCookie, type AuthedRequest } from './auth.js';
// ...
router.use(criarSessionAuth(client)); // exceto /login e /logout, que ficam ANTES deste use
```
Garanta que as rotas `GET/POST /login` e `POST /logout` estejam registradas **antes** do `router.use(criarSessionAuth(...))` (são públicas).

- [ ] **Step 2: Reescrever o POST /login pra validar usuário+senha (bcrypt)**

```typescript
import { getUserByLogin, touchLastLogin } from './users-store.js';
import { verificarSenha } from './password.js';
import { audit } from './audit.js';

const ECOSUN_LOGIN = '00000000-0000-0000-0000-000000000001';

router.post('/login', async (req, res) => {
  const { login, senha } = req.body ?? {};
  const found = login ? await getUserByLogin(client, ECOSUN_LOGIN, String(login)) : null;
  const ok = found ? await verificarSenha(String(senha ?? ''), found.senhaHash) : false;
  if (!ok || !found) {
    res.status(401).type('html').send('<p>Login ou senha inválidos. <a href="/dashboard/login">Voltar</a></p>');
    return;
  }
  setSessionCookie(res, found.user.id);
  await touchLastLogin(client, found.user.id);
  await audit(client, { companyId: found.user.companyId, userId: found.user.id, entidade: 'sessao', acao: 'login' });
  const next = typeof req.query.next === 'string' ? req.query.next : '/dashboard/cockpit';
  res.redirect(next.startsWith('/dashboard') ? next : '/dashboard/cockpit');
});
```
> Nota: a tela `GET /login` (form) já existe — só garanta que o form tenha os campos `login` e `senha` (hoje provavelmente só `senha`). Adicione o input `name="login"`. `POST /logout` continua chamando `clearSessionCookie(res)`.

- [ ] **Step 3: Claim automático no detalhe do lead**

Na rota `GET /leads/:id`, depois de carregar o lead e ANTES de renderizar, adicione:
```typescript
// Claim automático: vendedor (não-admin) que abre um lead do balcão vira dono.
const viewer = (req as AuthedRequest).dashUser!;
if (!viewer.isAdmin && lead && lead.claimed_by == null && can(viewer, 'leads', 'editar')) {
  const captured = await claimLead(client, req.params.id, viewer.id);
  if (captured) {
    await audit(client, { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: req.params.id, acao: 'claim' });
    lead.claimed_by = viewer.id; // reflete na renderização atual
  }
}
// Bloqueio: vendedor não pode abrir lead de OUTRO vendedor
if (lead && !podeVerLead(viewer, lead)) {
  res.status(403).send('<h2>Lead de outro vendedor</h2>'); return;
}
```
Importe no topo: `import { claimLead, podeVerLead } from './leads-queries.js';` (se ainda não importado).
Na rota `GET /leads` (lista), passe a visibilidade pro `listLeads`:
```typescript
const viewer = (req as AuthedRequest).dashUser!;
const result = await listLeads(client, { /* filtros existentes */, viewerId: viewer.id, viewerIsAdmin: viewer.isAdmin });
```

- [ ] **Step 4: Chamar `ensureSeed` no boot (index.ts)**

Em `src/index.ts`, perto de onde o dashboard router é montado (linha ~7249), adicione antes ou depois do `app.use('/dashboard', ...)`:
```typescript
import { ensureSeed } from './modules/dashboard/seed.js';
// ... após o supabase estar pronto:
ensureSeed(supabase.getClient()).catch((e) => console.warn('[seed] erro:', e.message));
```
> Nota: confirme o nome da instância do supabase no `index.ts` (provavelmente `supabase` com `.getClient()`).

- [ ] **Step 5: Build limpo + suíte completa**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: **zero erros**. Corrija o que aparecer (assinaturas de `renderLayout`, imports).

Run: `npx vitest run`
Expected: todos os testes novos passam; os 2 pré-existentes que já falhavam (`supabase-vincular-novo`) continuam falhando (não relacionados) — o resto verde.

- [ ] **Step 6: Commit**

```bash
git add src/modules/dashboard/router.ts src/index.ts
git commit -m "feat(crm): reconecta auth multiusuario, claim no detalhe e seed no boot"
```

---

## Smoke (após deploy — Junior valida)

1. Aplicar **migration 056** no Supabase (projeto do agente).
2. Conferir envs no EasyPanel: `DASHBOARD_PASSWORD` (vira senha do admin), opcional `DASHBOARD_ADMIN_LOGIN` (default `admin`), `DASHBOARD_SEED_PASSWORD` (senha inicial dos comerciais, default `trocar123`).
3. Implantar. No boot, o log deve mostrar `[seed] usuário admin criado` (1ª vez).
4. Login como **admin** (login `admin`, senha = `DASHBOARD_PASSWORD`) → entra. Menu mostra **Usuários**.
5. `/dashboard/usuarios` → renomear `comercial1`/`comercial2`, definir senhas.
6. Login como **comercial1** → vê só pool + os seus; **não** vê `/financeiro`/`/usuarios` (403 + somem do menu).
7. comercial1 abre um lead do balcão → vira dono. Login como comercial2 → aquele lead **sumiu** da lista dele. Admin vê todos.
8. Conferir `audit_log` no Supabase: linhas de `login`, `claim`, `criou usuario`.

---

## Self-review (preenchido)

- **Cobertura do spec (Fase 1):** multiusuário+permissões (Tasks 2,3,5,7,10,11) ✓ · pool+claim (Tasks 2,9,12) ✓ · auditoria (Tasks 2,6,10,12) ✓ · multi-tenant esqueleto (Task 2 `company_id` + ECOSUN) ✓ · auth por pessoa (Tasks 7,8,12) ✓.
- **Sem placeholders:** todos os steps têm código/comando reais. Notas "pro implementador" pedem confirmar pontos do código existente (assinatura de `renderLayout`, obtenção do `client`, `urlencoded`) — são verificações locais, não TODOs de conteúdo.
- **Consistência de tipos:** `DashUser`/`Area`/`Nivel` definidos na Task 3 e usados igual em 5,7,9,10,11. `can()`/`claimLead()`/`podeVerLead()`/`audit()`/`ensureSeed()` com mesmas assinaturas onde referenciados. Token: `gerarTokenSessao(userId)`/`lerUserIdDoToken` casados no teste e no uso.
- **Escopo:** focado na Fase 1 (fundação). Kanban/cockpit/relatórios/IA ficam nas próximas fases (specs/planos próprios).
