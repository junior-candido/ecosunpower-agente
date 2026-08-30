# Módulo Fiscal F1 — Base + modo "preparar" — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela de NFS-e no dashboard que prepara a nota (tomador + código + bruto→ISS→líquido), recebe o PDF emitido no portal e amarra tudo no financeiro (conta a receber pelo líquido + ISS retido) — base pronta pra F2 (emissão automática).

**Architecture:** Módulo novo `src/modules/financeiro/fiscal/` (calculo, cnpj, notas-repo, ponte-caixa) + views/rotas no dashboard existente (`src/modules/dashboard/`), migration 111. Segue os padrões da casa: repos com SupabaseClient injetado, views `render*Page` + `renderLayout`, rotas com `exigir('financeiro', …)` e imports dinâmicos, testes vitest com `chainMock`.

**Tech Stack:** TypeScript (tsc) · Express · Supabase (Postgres + Storage bucket `client-attachments`) · vitest · multer (upload, já é dependência).

**Regras da casa (memória do Junior):** PT-BR em tudo · `npm run build` (tsc) + `npm test` verdes ANTES de dizer "pronto" · commits pequenos · NÃO fazer push sem o Junior autorizar · nada de secret em código ou chat.

---

### Task 0: Branch

- [ ] **Step 1:** `git checkout master && git pull && git checkout -b feat/fiscal-nfse`
- [ ] **Step 2:** Confirmar limpo: `git status --short` → vazio.

### Task 1: Migration 111 — tabelas + seed do catálogo

**Files:**
- Create: `supabase/migrations/111_fiscal_nfse.sql`

- [ ] **Step 1: Escrever a migration** (padrão das 109/110: idempotente, company_id com default EcoSun)

```sql
-- 111: módulo fiscal (NFS-e) — F1: preparar/anexar; F2 usará as mesmas tabelas pra emitir.
CREATE TABLE IF NOT EXISTS fiscal_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE DEFAULT '00000000-0000-0000-0000-000000000001',
  cnpj text NOT NULL,
  inscricao_municipal text NOT NULL,
  razao_social text NOT NULL,
  regime text NOT NULL DEFAULT 'simples_nacional',
  municipio text NOT NULL DEFAULT 'Brasília',
  uf text NOT NULL DEFAULT 'DF',
  cert_validade date,                -- F1: digitada à mão; F2: lida do .pfx
  cert_storage_path text,            -- F2 (fica NULL na F1)
  cert_senha_cifrada text,           -- F2 (fica NULL na F1)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fiscal_servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  nome text NOT NULL,
  cod_trib_nacional text NOT NULL,   -- ex.: '31.01.02'
  nbs text,                          -- ex.: '1.1415.00.00'
  descricao_padrao text NOT NULL,
  aliquota_iss numeric(5,4) NOT NULL DEFAULT 0.05,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fiscal_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  status text NOT NULL DEFAULT 'preparada'
    CHECK (status IN ('rascunho','preparada','enviada','autorizada','rejeitada','cancelada')),
  numero text,                       -- nº da NFS-e (preenchido ao anexar/autorizar)
  competencia date NOT NULL,
  servico_id uuid REFERENCES fiscal_servicos(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  tomador jsonb NOT NULL,            -- congelado: {tipo:'PJ'|'PF', doc, nome, im, endereco, email, municipio, uf}
  valor_bruto numeric(14,2) NOT NULL CHECK (valor_bruto > 0),
  aliquota_iss numeric(5,4) NOT NULL,
  valor_iss numeric(14,2) NOT NULL,
  iss_retido boolean NOT NULL,
  valor_liquido numeric(14,2) NOT NULL,
  fechamento_id uuid REFERENCES fechamentos(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  conta_receber_id uuid REFERENCES financeiro_contas_a_receber(id) ON DELETE SET NULL,
  lancamento_iss_id uuid REFERENCES financeiro_lancamentos(id) ON DELETE SET NULL,
  pdf_storage_path text,
  xml_dps text,                      -- F2
  xml_nfse text,                     -- F2
  protocolo text,                    -- F2
  hash_dedupe text NOT NULL,         -- sha256(company|doc tomador|valor|competencia)
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_notas_dedupe
  ON fiscal_notas(hash_dedupe) WHERE status NOT IN ('cancelada','rejeitada');
CREATE INDEX IF NOT EXISTS idx_fiscal_notas_comp ON fiscal_notas(company_id, competencia DESC);

CREATE TABLE IF NOT EXISTS fiscal_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id uuid NOT NULL REFERENCES fiscal_notas(id) ON DELETE CASCADE,
  tipo text NOT NULL,                -- 'preparada','pdf_anexado','conta_criada','erro',… (F2: 'envio','retorno')
  detalhe jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS espelhando as tabelas financeiro_* da 109 (service key nos servidores; nega anon):
ALTER TABLE fiscal_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_eventos ENABLE ROW LEVEL SECURITY;

-- Seed EcoSun (idempotente):
INSERT INTO fiscal_config (cnpj, inscricao_municipal, razao_social)
SELECT '33.020.459/0001-06', '0790506200159', 'ECOSUNPOWER ENERGIA SOLAR LTDA'
WHERE NOT EXISTS (SELECT 1 FROM fiscal_config WHERE cnpj = '33.020.459/0001-06');

INSERT INTO fiscal_servicos (nome, cod_trib_nacional, nbs, descricao_padrao)
SELECT * FROM (VALUES
  ('Serviços elétricos gerais', '31.01.02', '1.1415.00.00', 'prestação de serviços eletricos gerais'),
  ('Manutenção e limpeza de geração FV', '14.01.01', '1.2001.60.00', 'serviços de manutenção preventiva em equipamentos de geração de energia e limpeza'),
  ('Instalação de sistema fotovoltaico (CONFIRMAR código com a contadora)', '07.02.01', NULL, 'execução de instalação de sistema de geração de energia solar fotovoltaica')
) AS v(nome, cod, nbs, descr)
WHERE NOT EXISTS (SELECT 1 FROM fiscal_servicos);
```

- [ ] **Step 2:** Conferir a olho os REFERENCES (fechamentos, leads, financeiro_contas_a_receber, financeiro_lancamentos existem nas migrations 000/046/047). Validação real acontece no SQL Editor de prod no fim (Task 9).
- [ ] **Step 3:** `git add supabase/migrations/111_fiscal_nfse.sql && git commit -m "feat(fiscal): migration 111 — config, catálogo, notas, eventos"`

### Task 2: Cálculo da nota (`calculo.ts`) — TDD

**Files:**
- Create: `src/modules/financeiro/fiscal/calculo.ts`
- Test: `tests/fiscal-calculo.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect } from 'vitest';
import { calcularNota, retencaoAutomatica } from '../src/modules/financeiro/fiscal/calculo.js';

describe('fiscal calculo', () => {
  it('PJ do DF: ISS 5% retido pelo tomador → líquido 95%', () => {
    const r = calcularNota({ valorBruto: 19995, aliquotaIss: 0.05, issRetido: true });
    expect(r).toEqual({ valorIss: 999.75, valorLiquido: 18995.25 });
  });
  it('PF: ISS devido pelo prestador → líquido = bruto', () => {
    const r = calcularNota({ valorBruto: 1250, aliquotaIss: 0.05, issRetido: false });
    expect(r).toEqual({ valorIss: 62.5, valorLiquido: 1250 });
  });
  it('arredonda pra 2 casas', () => {
    const r = calcularNota({ valorBruto: 333.33, aliquotaIss: 0.05, issRetido: true });
    expect(r.valorIss).toBe(16.67);              // 16.6665 → 16.67
    expect(r.valorLiquido).toBe(316.66);
  });
  it('retencaoAutomatica: PJ de Brasília retém; PF não; PJ de fora não (regra do DF)', () => {
    expect(retencaoAutomatica({ tipo: 'PJ', municipio: 'Brasília', uf: 'DF' })).toBe(true);
    expect(retencaoAutomatica({ tipo: 'PF', municipio: 'Brasília', uf: 'DF' })).toBe(false);
    expect(retencaoAutomatica({ tipo: 'PJ', municipio: 'Goiânia', uf: 'GO' })).toBe(false);
  });
});
```

- [ ] **Step 2:** `npm test -- fiscal-calculo` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar**

```ts
// src/modules/financeiro/fiscal/calculo.ts
// Conta da NFS-e: ISS e líquido. Retenção: no DF, tomador PJ estabelecido no DF
// retém o ISS (5%) — foi assim nas notas reais 82/83. PF e tomador de fora: sem retenção.
// (INSS 11% empreitada: fora da F1 — pendência com a contadora.)
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface EntradaCalculo { valorBruto: number; aliquotaIss: number; issRetido: boolean }
export interface SaidaCalculo { valorIss: number; valorLiquido: number }

export function calcularNota(e: EntradaCalculo): SaidaCalculo {
  const valorIss = round2(e.valorBruto * e.aliquotaIss);
  return { valorIss, valorLiquido: e.issRetido ? round2(e.valorBruto - valorIss) : e.valorBruto };
}

export interface TomadorLocal { tipo: 'PJ' | 'PF'; municipio: string; uf: string }
export function retencaoAutomatica(t: TomadorLocal): boolean {
  return t.tipo === 'PJ' && t.uf === 'DF' && t.municipio.toLowerCase().startsWith('bras');
}
```

- [ ] **Step 4:** `npm test -- fiscal-calculo` → PASS.
- [ ] **Step 5:** `git add tests/fiscal-calculo.test.ts src/modules/financeiro/fiscal/calculo.ts && git commit -m "feat(fiscal): cálculo ISS/retenção da NFS-e"`

### Task 3: Consulta CNPJ (`cnpj.ts`) — TDD

**Files:**
- Create: `src/modules/financeiro/fiscal/cnpj.ts`
- Test: `tests/fiscal-cnpj.test.ts`

- [ ] **Step 1: Teste que falha** (mock de fetch global, sem rede)

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { consultarCnpj } from '../src/modules/financeiro/fiscal/cnpj.js';

afterEach(() => vi.unstubAllGlobals());

describe('fiscal consultarCnpj', () => {
  it('normaliza a resposta da BrasilAPI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ razao_social: 'COMERCIAL DE ALIMENTOS SUPERBOM LTDA', nome_fantasia: 'SUPERBOM',
        logradouro: 'QS 314 CONJUNTO 7', numero: 'S/N', municipio: 'BRASILIA', uf: 'DF', cep: '71805511', email: null }),
    }));
    const r = await consultarCnpj('08.616.988/0001-20');
    expect(fetch).toHaveBeenCalledWith('https://brasilapi.com.br/api/cnpj/v1/08616988000120');
    expect(r).toEqual({ razaoSocial: 'COMERCIAL DE ALIMENTOS SUPERBOM LTDA', fantasia: 'SUPERBOM',
      endereco: 'QS 314 CONJUNTO 7, S/N', municipio: 'BRASILIA', uf: 'DF', cep: '71805511', email: null });
  });
  it('CNPJ inválido (menos de 14 dígitos) → erro claro antes de chamar a rede', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    await expect(consultarCnpj('123')).rejects.toThrow('CNPJ inválido');
    expect(f).not.toHaveBeenCalled();
  });
  it('BrasilAPI fora do ar → null (a tela deixa preencher à mão)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await consultarCnpj('08.616.988/0001-20')).toBeNull();
  });
});
```

- [ ] **Step 2:** `npm test -- fiscal-cnpj` → FAIL.
- [ ] **Step 3: Implementar**

```ts
// src/modules/financeiro/fiscal/cnpj.ts
// Consulta pública BrasilAPI (grátis, sem chave). Falhou/404 → null: a tela cai pro manual.
export interface DadosCnpj {
  razaoSocial: string; fantasia: string | null; endereco: string;
  municipio: string; uf: string; cep: string; email: string | null;
}

export async function consultarCnpj(cnpj: string): Promise<DadosCnpj | null> {
  const so = cnpj.replace(/\D/g, '');
  if (so.length !== 14) throw new Error('CNPJ inválido: precisa de 14 dígitos');
  const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${so}`);
  if (!resp.ok) return null;
  const j = await resp.json() as Record<string, unknown>;
  return {
    razaoSocial: String(j.razao_social ?? ''),
    fantasia: (j.nome_fantasia as string | null) || null,
    endereco: [j.logradouro, j.numero].filter(Boolean).join(', '),
    municipio: String(j.municipio ?? ''), uf: String(j.uf ?? ''),
    cep: String(j.cep ?? '').replace(/\D/g, ''), email: (j.email as string | null) || null,
  };
}
```

- [ ] **Step 4:** `npm test -- fiscal-cnpj` → PASS.
- [ ] **Step 5:** `git add tests/fiscal-cnpj.test.ts src/modules/financeiro/fiscal/cnpj.ts && git commit -m "feat(fiscal): consulta CNPJ via BrasilAPI"`

### Task 4: Repo de notas (`notas-repo.ts`) — TDD

**Files:**
- Create: `src/modules/financeiro/fiscal/notas-repo.ts`
- Test: `tests/fiscal-notas-repo.test.ts`

Padrão: igual a `contas-pagar.ts` (SupabaseClient injetado, erro com prefixo do nome da função). Copiar o `chainMock` de `tests/financeiro-contas-pagar.test.ts` (os testes da casa não compartilham helpers entre arquivos — colar a função no teste).

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect, vi } from 'vitest';
import { criarNota, listarNotas, anexarPdf, hashNota } from '../src/modules/financeiro/fiscal/notas-repo.js';

function chainMock(resultado: unknown = { data: [], error: null }) {
  const calls: Record<string, unknown[][]> = {};
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'in', 'gte', 'lte', 'order', 'limit']) {
    chain[m] = vi.fn((...a: unknown[]) => { (calls[m] ??= []).push(a); return chain; });
  }
  chain.single = vi.fn().mockResolvedValue(resultado);
  chain.then = (res: (v: unknown) => void) => res(resultado);
  const from = vi.fn(() => chain);
  return { client: { from } as never, from, calls, chain };
}

describe('fiscal notas-repo', () => {
  it('hashNota é estável e ignora formatação do documento', () => {
    const a = hashNota('c1', '08.616.988/0001-20', 19995, '2026-08-25');
    const b = hashNota('c1', '08616988000120', 19995, '2026-08-25');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('criarNota grava com status preparada + hash e devolve o id', async () => {
    const { client, from, calls } = chainMock({ data: { id: 'n1' }, error: null });
    const id = await criarNota(client, {
      companyId: 'c1', competencia: '2026-08-25', servicoId: 's1', descricao: 'limpeza',
      tomador: { tipo: 'PJ', doc: '08.616.988/0001-20', nome: 'SUPERBOM', im: null, endereco: 'QS 314', email: null, municipio: 'Brasília', uf: 'DF' },
      valorBruto: 19995, aliquotaIss: 0.05, valorIss: 999.75, issRetido: true, valorLiquido: 18995.25,
      fechamentoId: null, leadId: null, createdBy: 'junior',
    });
    expect(id).toBe('n1');
    expect(from).toHaveBeenCalledWith('fiscal_notas');
    const row = (calls.insert![0][0] as Record<string, unknown>);
    expect(row.status).toBe('preparada');
    expect(row.hash_dedupe).toBe(hashNota('c1', '08616988000120', 19995, '2026-08-25'));
  });
  it('criarNota traduz violação do índice de dedupe em erro amigável', async () => {
    const { client } = chainMock({ data: null, error: { code: '23505', message: 'duplicate key idx_fiscal_notas_dedupe' } });
    await expect(criarNota(client, {
      companyId: 'c1', competencia: '2026-08-25', servicoId: 's1', descricao: 'x',
      tomador: { tipo: 'PJ', doc: '1', nome: 'X', im: null, endereco: '', email: null, municipio: 'Brasília', uf: 'DF' },
      valorBruto: 10, aliquotaIss: 0.05, valorIss: 0.5, issRetido: true, valorLiquido: 9.5,
      fechamentoId: null, leadId: null, createdBy: 'junior',
    })).rejects.toThrow('Já existe nota igual');
  });
  it('anexarPdf só atualiza nota em preparada (CAS) e devolve false se já anexada', async () => {
    const { client, calls } = chainMock({ data: [], error: null });
    const ok = await anexarPdf(client, 'n1', '83', 'fiscal/c1/n1.pdf');
    expect(ok).toBe(false);
    expect(calls.eq).toContainEqual(['id', 'n1']);
    expect(calls.eq).toContainEqual(['status', 'preparada']);
  });
  it('listarNotas filtra por company e ordena por competência desc', async () => {
    const { client, calls } = chainMock({ data: [], error: null });
    await listarNotas(client, 'c1');
    expect(calls.eq).toContainEqual(['company_id', 'c1']);
    expect(calls.order).toContainEqual(['competencia', { ascending: false }]);
  });
});
```

- [ ] **Step 2:** `npm test -- fiscal-notas-repo` → FAIL.
- [ ] **Step 3: Implementar**

```ts
// src/modules/financeiro/fiscal/notas-repo.ts
// CRUD de fiscal_notas. Dedupe por hash (company + doc do tomador + valor + competência):
// o índice único do banco é a trava real; aqui só traduzimos o erro pra PT.
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Tomador {
  tipo: 'PJ' | 'PF'; doc: string; nome: string; im: string | null;
  endereco: string; email: string | null; municipio: string; uf: string;
}
export interface NovaNota {
  companyId: string; competencia: string; servicoId: string; descricao: string;
  tomador: Tomador; valorBruto: number; aliquotaIss: number; valorIss: number;
  issRetido: boolean; valorLiquido: number;
  fechamentoId: string | null; leadId: string | null; createdBy: string;
}
export interface NotaLinha {
  id: string; status: string; numero: string | null; competencia: string; descricao: string;
  tomador: Tomador; valorBruto: number; valorIss: number; issRetido: boolean; valorLiquido: number;
  pdfStoragePath: string | null; contaReceberId: string | null;
}

export function hashNota(companyId: string, doc: string, valorBruto: number, competencia: string): string {
  const chave = [companyId, doc.replace(/\D/g, ''), valorBruto.toFixed(2), competencia].join('|');
  return createHash('sha256').update(chave).digest('hex');
}

export async function criarNota(client: SupabaseClient, n: NovaNota): Promise<string> {
  const { data, error } = await client.from('fiscal_notas').insert({
    company_id: n.companyId, status: 'preparada', competencia: n.competencia,
    servico_id: n.servicoId, descricao: n.descricao, tomador: n.tomador,
    valor_bruto: n.valorBruto, aliquota_iss: n.aliquotaIss, valor_iss: n.valorIss,
    iss_retido: n.issRetido, valor_liquido: n.valorLiquido,
    fechamento_id: n.fechamentoId, lead_id: n.leadId, created_by: n.createdBy,
    hash_dedupe: hashNota(n.companyId, n.tomador.doc, n.valorBruto, n.competencia),
  }).select('id').single();
  if (error) {
    if (error.code === '23505') throw new Error('Já existe nota igual (mesmo tomador, valor e competência). Cancele a antiga ou mude o valor.');
    throw new Error(`criarNota: ${error.message}`);
  }
  return (data as { id: string }).id;
}

export async function anexarPdf(client: SupabaseClient, notaId: string, numero: string, pdfPath: string): Promise<boolean> {
  const { data, error } = await client.from('fiscal_notas')
    .update({ status: 'autorizada', numero, pdf_storage_path: pdfPath, updated_at: new Date().toISOString() })
    .eq('id', notaId).eq('status', 'preparada').select('id');
  if (error) throw new Error(`anexarPdf: ${error.message}`);
  return (data ?? []).length === 1;
}

export async function listarNotas(client: SupabaseClient, companyId: string, limite = 100): Promise<NotaLinha[]> {
  const { data, error } = await client.from('fiscal_notas')
    .select('id, status, numero, competencia, descricao, tomador, valor_bruto, valor_iss, iss_retido, valor_liquido, pdf_storage_path, conta_receber_id')
    .eq('company_id', companyId).order('competencia', { ascending: false }).limit(limite);
  if (error) throw new Error(`listarNotas: ${error.message}`);
  return (data ?? []).map(mapearNota);
}

export async function getNota(client: SupabaseClient, notaId: string): Promise<NotaLinha | null> {
  const { data, error } = await client.from('fiscal_notas')
    .select('id, status, numero, competencia, descricao, tomador, valor_bruto, valor_iss, iss_retido, valor_liquido, pdf_storage_path, conta_receber_id')
    .eq('id', notaId).single();
  if (error) return null;
  return mapearNota(data as Record<string, unknown>);
}

function mapearNota(r: Record<string, unknown>): NotaLinha {
  return {
    id: r.id as string, status: r.status as string, numero: (r.numero as string | null) ?? null,
    competencia: r.competencia as string, descricao: r.descricao as string, tomador: r.tomador as Tomador,
    valorBruto: Number(r.valor_bruto), valorIss: Number(r.valor_iss), issRetido: Boolean(r.iss_retido),
    valorLiquido: Number(r.valor_liquido), pdfStoragePath: (r.pdf_storage_path as string | null) ?? null,
    contaReceberId: (r.conta_receber_id as string | null) ?? null,
  };
}

export async function registrarEvento(client: SupabaseClient, notaId: string, tipo: string, detalhe?: unknown): Promise<void> {
  const { error } = await client.from('fiscal_eventos').insert({ nota_id: notaId, tipo, detalhe: detalhe ?? null });
  if (error) throw new Error(`registrarEvento: ${error.message}`);
}

export async function listarServicos(client: SupabaseClient, companyId: string) {
  const { data, error } = await client.from('fiscal_servicos')
    .select('id, nome, cod_trib_nacional, descricao_padrao, aliquota_iss')
    .eq('company_id', companyId).eq('ativo', true).order('nome');
  if (error) throw new Error(`listarServicos: ${error.message}`);
  return (data ?? []) as Array<{ id: string; nome: string; cod_trib_nacional: string; descricao_padrao: string; aliquota_iss: number }>;
}

export async function getConfig(client: SupabaseClient, companyId: string) {
  const { data, error } = await client.from('fiscal_config')
    .select('cnpj, inscricao_municipal, razao_social, cert_validade').eq('company_id', companyId).single();
  if (error) return null;
  return data as { cnpj: string; inscricao_municipal: string; razao_social: string; cert_validade: string | null };
}
```

- [ ] **Step 4:** `npm test -- fiscal-notas-repo` → PASS.
- [ ] **Step 5:** `git add tests/fiscal-notas-repo.test.ts src/modules/financeiro/fiscal/notas-repo.ts && git commit -m "feat(fiscal): repo de notas com dedupe e eventos"`

### Task 5: Ponte com o caixa (`ponte-caixa.ts`) — TDD

**Files:**
- Create: `src/modules/financeiro/fiscal/ponte-caixa.ts`
- Test: `tests/fiscal-ponte-caixa.test.ts`

Nota autorizada → (1) conta a receber pelo **líquido** em `financeiro_contas_a_receber` (status pendente, ligada ao fechamento/lead); (2) se ISS retido, lançamento **confirmado** em `financeiro_lancamentos` (despesa, categoria `outros`, descrição "ISS retido na fonte — NFS-e nº X" — não é DAS, o PGDAS trata via contadora); (3) grava os ids de volta na nota.

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect, vi } from 'vitest';
import { engatarNotaNoCaixa } from '../src/modules/financeiro/fiscal/ponte-caixa.js';

function clientePorTabela(respostas: Record<string, unknown>) {
  const inserts: Record<string, unknown[]> = {};
  const updates: Record<string, unknown[]> = {};
  const from = vi.fn((tabela: string) => {
    const resultado = respostas[tabela] ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'is']) chain[m] = vi.fn(() => chain);
    chain.insert = vi.fn((row: unknown) => { (inserts[tabela] ??= []).push(row); return chain; });
    chain.update = vi.fn((row: unknown) => { (updates[tabela] ??= []).push(row); return chain; });
    chain.single = vi.fn().mockResolvedValue(resultado);
    (chain as { then?: unknown }).then = (res: (v: unknown) => void) => res(resultado);
    return chain;
  });
  return { client: { from } as never, from, inserts, updates };
}

describe('fiscal engatarNotaNoCaixa', () => {
  const nota = {
    id: 'n1', status: 'autorizada', numero: '84', competencia: '2026-09-02', descricao: 'serviço',
    tomador: { tipo: 'PJ' as const, doc: '1', nome: 'SUPERBOM', im: null, endereco: '', email: null, municipio: 'Brasília', uf: 'DF' },
    valorBruto: 19995, valorIss: 999.75, issRetido: true, valorLiquido: 18995.25,
    pdfStoragePath: 'fiscal/x.pdf', contaReceberId: null,
  };
  it('cria conta a receber pelo líquido + lançamento do ISS retido e amarra na nota', async () => {
    const { client, inserts, updates } = clientePorTabela({
      financeiro_contas_a_receber: { data: { id: 'cr1' }, error: null },
      financeiro_lancamentos: { data: { id: 'l1' }, error: null },
      financeiro_categorias: { data: { id: 'cat1' }, error: null },
    });
    await engatarNotaNoCaixa(client, nota, { companyId: 'c1', fechamentoId: 'f1', leadId: null });
    const conta = inserts.financeiro_contas_a_receber![0] as Record<string, unknown>;
    expect(conta.valor).toBe(18995.25);
    expect(conta.descricao).toContain('NFS-e nº 84');
    expect(conta.fechamento_id).toBe('f1');
    const lanc = inserts.financeiro_lancamentos![0] as Record<string, unknown>;
    expect(lanc.valor).toBe(999.75);
    expect(lanc.tipo).toBe('despesa');
    expect(lanc.status).toBe('confirmado');
    const upd = updates.fiscal_notas![0] as Record<string, unknown>;
    expect(upd.conta_receber_id).toBe('cr1');
    expect(upd.lancamento_iss_id).toBe('l1');
  });
  it('sem retenção: só a conta a receber (pelo bruto), sem lançamento de ISS', async () => {
    const { client, inserts } = clientePorTabela({
      financeiro_contas_a_receber: { data: { id: 'cr1' }, error: null },
    });
    await engatarNotaNoCaixa(client, { ...nota, issRetido: false, valorLiquido: 19995 }, { companyId: 'c1', fechamentoId: null, leadId: 'ld1' });
    expect((inserts.financeiro_contas_a_receber![0] as Record<string, unknown>).valor).toBe(19995);
    expect(inserts.financeiro_lancamentos).toBeUndefined();
  });
});
```

- [ ] **Step 2:** `npm test -- fiscal-ponte-caixa` → FAIL.
- [ ] **Step 3: Implementar**

```ts
// src/modules/financeiro/fiscal/ponte-caixa.ts
// Nota autorizada → dinheiro esperado (conta a receber, líquido) + ISS retido lançado
// como despesa confirmada (o tomador já pagou por nós). Idempotência: quem chama só
// engata se conta_receber_id ainda é NULL (anexarPdf tem CAS de status).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotaLinha } from './notas-repo.js';

export interface ContextoEngate { companyId: string; fechamentoId: string | null; leadId: string | null }

export async function engatarNotaNoCaixa(client: SupabaseClient, nota: NotaLinha, ctx: ContextoEngate): Promise<void> {
  const { data: conta, error: e1 } = await client.from('financeiro_contas_a_receber').insert({
    descricao: `NFS-e nº ${nota.numero ?? '?'} — ${nota.tomador.nome}`,
    valor: nota.valorLiquido, status: 'pendente',
    fechamento_id: ctx.fechamentoId, lead_id: ctx.leadId, created_by: 'fiscal',
  }).select('id').single();
  if (e1) throw new Error(`engatarNotaNoCaixa (conta): ${e1.message}`);
  const contaId = (conta as { id: string }).id;

  let lancamentoId: string | null = null;
  if (nota.issRetido) {
    const { data: cat } = await client.from('financeiro_categorias').select('id').eq('slug', 'outros').single();
    const { data: lanc, error: e2 } = await client.from('financeiro_lancamentos').insert({
      tipo: 'despesa', status: 'confirmado', valor: nota.valorIss,
      data_evento: nota.competencia, competencia: nota.competencia.slice(0, 7),
      contraparte: nota.tomador.nome,
      descricao: `ISS retido na fonte — NFS-e nº ${nota.numero ?? '?'} (${nota.tomador.nome})`,
      categoria_id: (cat as { id: string } | null)?.id ?? null,
      pf_pj: 'PJ', origem: 'tela', banco_conta: 'desconhecido', confianca: 'alta', created_by: 'fiscal',
    }).select('id').single();
    if (e2) throw new Error(`engatarNotaNoCaixa (ISS): ${e2.message}`);
    lancamentoId = (lanc as { id: string }).id;
  }

  const { error: e3 } = await client.from('fiscal_notas')
    .update({ conta_receber_id: contaId, lancamento_iss_id: lancamentoId, updated_at: new Date().toISOString() })
    .eq('id', nota.id);
  if (e3) throw new Error(`engatarNotaNoCaixa (amarra): ${e3.message}`);
}
```

- [ ] **Step 4:** `npm test -- fiscal-ponte-caixa` → PASS.
- [ ] **Step 5:** `git add tests/fiscal-ponte-caixa.test.ts src/modules/financeiro/fiscal/ponte-caixa.ts && git commit -m "feat(fiscal): nota autorizada engata conta a receber + ISS retido no caixa"`

### Task 6: Views (`fiscal-views.ts`)

**Files:**
- Create: `src/modules/dashboard/fiscal-views.ts`

Seguir o estilo de `financeiro-views.ts` (dark, cards, tabela; `renderLayout`; `brl()` local). HTML string + um `<script>` pequeno pro cálculo ao vivo. **Sem teste unitário de HTML** (padrão da casa: views não têm teste; a lógica está nos módulos já testados). Três renders:

- [ ] **Step 1: Implementar**

```ts
// src/modules/dashboard/fiscal-views.ts
// Telas do módulo fiscal (F1): lista de notas, nova nota (preparar), detalhe c/ anexar PDF.
import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import type { NotaLinha } from '../financeiro/fiscal/notas-repo.js';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const STATUS: Record<string, string> = {
  rascunho: '📝 Rascunho', preparada: '🕐 Preparada (emitir no portal)', enviada: '📤 Enviada',
  autorizada: '✅ Autorizada', rejeitada: '❌ Rejeitada', cancelada: '🚫 Cancelada',
};

export interface ServicoOpt { id: string; nome: string; cod_trib_nacional: string; descricao_padrao: string; aliquota_iss: number }
export interface ConfigInfo { cnpj: string; inscricao_municipal: string; razao_social: string; cert_validade: string | null }

export function renderNotasPage(notas: NotaLinha[], config: ConfigInfo | null, user?: DashUser): string {
  const alertaCert = config?.cert_validade
    ? (new Date(config.cert_validade) < new Date(Date.now() + 30 * 864e5)
      ? `<div class="card" style="border-color:#f87171"><b>⚠️ Certificado digital vence em ${config.cert_validade.split('-').reverse().join('/')}</b> — renove o A1 pra manter a emissão.</div>` : '')
    : '<div class="card" style="border-color:#fbbf24">ℹ️ Validade do certificado não cadastrada.</div>';
  const linhas = notas.map((n) => `
    <tr class="border-b border-gray-800">
      <td class="p-2">${n.numero ?? '—'}</td>
      <td class="p-2">${n.competencia.split('-').reverse().join('/')}</td>
      <td class="p-2">${n.tomador.nome}</td>
      <td class="p-2 text-right">${brl(n.valorBruto)}</td>
      <td class="p-2 text-right">${n.issRetido ? brl(n.valorIss) : '—'}</td>
      <td class="p-2 text-right font-bold">${brl(n.valorLiquido)}</td>
      <td class="p-2">${STATUS[n.status] ?? n.status}</td>
      <td class="p-2"><a class="text-cyan-300" href="/dashboard/fiscal/${n.id}">abrir</a></td>
    </tr>`).join('');
  const body = `
<div class="fin-root" style="color:#d1d5db">
<h1 class="text-xl font-bold text-cyan-300 mb-4">🧾 Notas fiscais (NFS-e)</h1>
${alertaCert}
<div class="my-3"><a href="/dashboard/fiscal/nova" class="px-3 py-2 rounded bg-cyan-700 text-white">+ Nova nota</a></div>
<div style="overflow-x:auto"><table class="w-full text-sm">
<thead><tr class="text-left text-gray-400"><th class="p-2">Nº</th><th class="p-2">Competência</th><th class="p-2">Tomador</th><th class="p-2">Bruto</th><th class="p-2">ISS retido</th><th class="p-2">Líquido</th><th class="p-2">Status</th><th></th></tr></thead>
<tbody>${linhas || '<tr><td class="p-3 text-gray-500" colspan="8">Nenhuma nota ainda. Clique em “+ Nova nota”.</td></tr>'}</tbody>
</table></div></div>`;
  return renderLayout({ active: 'fiscal', title: 'Notas fiscais', body, dark: true, user });
}

export function renderNovaNotaPage(servicos: ServicoOpt[], prefill: { nome?: string; doc?: string; valor?: number; fechamentoId?: string; leadId?: string; erro?: string }, user?: DashUser): string {
  const opts = servicos.map((s) => `<option value="${s.id}" data-aliq="${s.aliquota_iss}" data-descr="${s.descricao_padrao.replace(/"/g, '&quot;')}">${s.nome} (${s.cod_trib_nacional})</option>`).join('');
  const body = `
<div style="color:#d1d5db;max-width:640px">
<h1 class="text-xl font-bold text-cyan-300 mb-4">🧾 Nova nota</h1>
${prefill.erro ? `<div class="card" style="border-color:#f87171;padding:8px;margin-bottom:8px">${prefill.erro}</div>` : ''}
<form method="post" action="/dashboard/fiscal/nova" class="space-y-3">
  <input type="hidden" name="fechamento_id" value="${prefill.fechamentoId ?? ''}">
  <input type="hidden" name="lead_id" value="${prefill.leadId ?? ''}">
  <label class="block">Tomador é <select name="tipo" id="tipo" class="bg-gray-800 p-1 rounded"><option value="PJ">PJ (CNPJ)</option><option value="PF">PF (CPF)</option></select></label>
  <label class="block">CNPJ/CPF <input name="doc" id="doc" value="${prefill.doc ?? ''}" class="bg-gray-800 p-1 rounded w-full" required>
    <button type="button" id="buscar" class="px-2 py-1 rounded bg-gray-700 mt-1">🔎 Buscar dados</button></label>
  <label class="block">Nome/Razão social <input name="nome" id="nome" value="${prefill.nome ?? ''}" class="bg-gray-800 p-1 rounded w-full" required></label>
  <label class="block">Inscrição municipal (se PJ do DF) <input name="im" id="im" class="bg-gray-800 p-1 rounded w-full"></label>
  <label class="block">Endereço <input name="endereco" id="endereco" class="bg-gray-800 p-1 rounded w-full"></label>
  <div class="grid grid-cols-2 gap-2">
    <label>Município <input name="municipio" id="municipio" value="Brasília" class="bg-gray-800 p-1 rounded w-full"></label>
    <label>UF <input name="uf" id="uf" value="DF" class="bg-gray-800 p-1 rounded w-full" maxlength="2"></label>
  </div>
  <label class="block">E-mail do tomador <input name="email" id="email" type="email" class="bg-gray-800 p-1 rounded w-full"></label>
  <label class="block">Serviço <select name="servico_id" id="servico" class="bg-gray-800 p-1 rounded w-full">${opts}</select></label>
  <label class="block">Descrição na nota <textarea name="descricao" id="descricao" class="bg-gray-800 p-1 rounded w-full" rows="2"></textarea></label>
  <div class="grid grid-cols-2 gap-2">
    <label>Valor do serviço (R$) <input name="valor" id="valor" type="text" inputmode="decimal" value="${prefill.valor ?? ''}" class="bg-gray-800 p-1 rounded w-full" required></label>
    <label>Competência <input name="competencia" type="date" value="${new Date().toISOString().slice(0, 10)}" class="bg-gray-800 p-1 rounded w-full" required></label>
  </div>
  <label class="block"><input type="checkbox" name="iss_retido" id="retido"> ISS retido pelo tomador (marca sozinho pra PJ do DF)</label>
  <div class="card" style="border:1px solid #1b2040;border-radius:10px;padding:10px" id="conta">
    Bruto: <b id="c-bruto">—</b> · ISS 5%: <b id="c-iss">—</b> · líquido a receber: <b id="c-liq" class="text-emerald-300">—</b>
  </div>
  <button class="px-4 py-2 rounded bg-cyan-700 text-white">Preparar nota</button>
</form></div>`;
  const scripts = `
<script>
(function(){
  const $ = (id) => document.getElementById(id);
  function conta(){
    const v = parseFloat(($('valor').value||'0').replace(/\\./g,'').replace(',','.'))||0;
    const aliq = parseFloat($('servico').selectedOptions[0]?.dataset.aliq||'0.05');
    const iss = Math.round(v*aliq*100)/100, ret = $('retido').checked;
    $('c-bruto').textContent = v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    $('c-iss').textContent = iss.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) + (ret?' (retido)':' (você recolhe no DAS)');
    $('c-liq').textContent = (ret?v-iss:v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  }
  function autoRetencao(){
    $('retido').checked = $('tipo').value==='PJ' && $('uf').value.toUpperCase()==='DF'; conta();
  }
  ['valor','retido','servico'].forEach(id=>$(id).addEventListener('input',conta));
  ['tipo','uf'].forEach(id=>$(id).addEventListener('change',autoRetencao));
  $('servico').addEventListener('change',()=>{ if(!$('descricao').value) $('descricao').value = $('servico').selectedOptions[0]?.dataset.descr||''; conta(); });
  $('buscar').addEventListener('click', async ()=>{
    const r = await fetch('/dashboard/fiscal/cnpj/'+encodeURIComponent($('doc').value));
    if(!r.ok){ alert('Não achei — preenche à mão.'); return; }
    const d = await r.json();
    $('nome').value=d.razaoSocial; $('endereco').value=d.endereco; $('municipio').value=d.municipio; $('uf').value=d.uf; if(d.email)$('email').value=d.email;
    autoRetencao();
  });
  autoRetencao();
})();
</script>`;
  return renderLayout({ active: 'fiscal', title: 'Nova nota', body, scripts, dark: true, user });
}

export function renderNotaDetalhe(n: NotaLinha, config: ConfigInfo | null, user?: DashUser): string {
  const preparar = n.status === 'preparada' ? `
  <div class="card" style="border:1px solid #1b2040;border-radius:10px;padding:12px;margin:10px 0">
    <b>1) Emitir no portal</b> — abra <a class="text-cyan-300" href="https://iss.fazenda.df.gov.br/online/" target="_blank">iss.fazenda.df.gov.br/online</a> e copie:
    <ul class="text-sm mt-2" style="line-height:1.8">
      <li>Tomador: <code>${n.tomador.doc}</code> — ${n.tomador.nome}${n.tomador.im ? ` (IM ${n.tomador.im})` : ''}</li>
      <li>Descrição: <code>${n.descricao}</code></li>
      <li>Valor: <code>${brl(n.valorBruto)}</code> · ISS ${n.issRetido ? '<b>Retido pelo Tomador</b>' : 'devido pelo prestador'}</li>
      <li>Competência: ${n.competencia.split('-').reverse().join('/')}</li>
    </ul>
    <b class="block mt-3">2) Voltar aqui com o PDF</b>
    <form method="post" action="/dashboard/fiscal/${n.id}/anexar" enctype="multipart/form-data" class="mt-2 space-y-2">
      <input name="numero" placeholder="Nº da NFS-e (ex.: 84)" class="bg-gray-800 p-1 rounded" required>
      <input type="file" name="pdf" accept="application/pdf" required>
      <button class="px-3 py-2 rounded bg-emerald-700 text-white">Anexar e lançar no caixa</button>
    </form>
  </div>` : '';
  const body = `
<div style="color:#d1d5db;max-width:640px">
<h1 class="text-xl font-bold text-cyan-300 mb-2">🧾 Nota ${n.numero ? 'nº ' + n.numero : '(preparada)'}</h1>
<p>${STATUS[n.status] ?? n.status} · ${n.tomador.nome} · ${brl(n.valorBruto)} → líquido <b>${brl(n.valorLiquido)}</b>${n.issRetido ? ` (ISS retido ${brl(n.valorIss)})` : ''}</p>
${preparar}
${n.pdfStoragePath ? `<p><a class="text-cyan-300" href="/dashboard/fiscal/${n.id}/pdf">📄 Baixar PDF</a></p>` : ''}
${n.contaReceberId ? '<p class="text-emerald-300">✅ Conta a receber criada no caixa.</p>' : ''}
<p class="mt-3"><a class="text-gray-400" href="/dashboard/fiscal">← todas as notas</a></p>
</div>`;
  return renderLayout({ active: 'fiscal', title: `Nota ${n.numero ?? ''}`, body, dark: true, user });
}
```

**Nota do plano:** o `alert()` no script da tela Nova é aceitável aqui (dashboard próprio, não é artifact). `config` fica na assinatura de `renderNotaDetalhe` pra F2 (mostrar dados do prestador); não usar = ok, prefixar `_config` se o tsc reclamar.

- [ ] **Step 2:** `npm run build` → sem erro de tipo.
- [ ] **Step 3:** `git add src/modules/dashboard/fiscal-views.ts && git commit -m "feat(fiscal): telas lista/nova/detalhe da NFS-e"`

### Task 7: Rotas no router + entrada no menu lateral

**Files:**
- Modify: `src/modules/dashboard/router.ts` (junto das rotas de assinaturas, ~linha 599 — mesmo padrão `exigir('financeiro', …)` + imports dinâmicos)
- Modify: `src/modules/dashboard/views.ts:170` (nav: adicionar a linha do 🧾 logo após a do 💰 Financeiro)

**Atenção do executor:** conferir no topo do `router.ts` como o Supabase é referenciado (pode ser wrapper com `.getClient()` — `src/index.ts:8427` usa `supabase.getClient().storage`; as rotas vizinhas `/assinaturas` usam `supabase` direto nos stores). Usar o mesmo jeito das vizinhas. Se `multer` não estiver importado no router, importar no topo: `import multer from 'multer';`. `parseReais` já existe no router (usado em `/assinaturas/nova` ~linha 628) e devolve **centavos**.

- [ ] **Step 1: Adicionar as rotas**

```ts
  // ── Fiscal (NFS-e) — F1: preparar + anexar ─────────────────────────────
  const uploadPdf = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  router.get('/fiscal', exigir('financeiro', 'visualizar'), async (req: AuthedRequest, res) => {
    try {
      const { listarNotas, getConfig } = await import('../financeiro/fiscal/notas-repo.js');
      const { renderNotasPage } = await import('./fiscal-views.js');
      const companyId = req.dashUser!.companyId;
      const [notas, config] = await Promise.all([listarNotas(supabase, companyId), getConfig(supabase, companyId)]);
      res.type('text/html').send(renderNotasPage(notas, config, req.dashUser));
    } catch (err) { res.status(500).send(`Erro: ${(err as Error).message}`); }
  });

  router.get('/fiscal/nova', exigir('financeiro', 'editar'), async (req: AuthedRequest, res) => {
    const { listarServicos } = await import('../financeiro/fiscal/notas-repo.js');
    const { renderNovaNotaPage } = await import('./fiscal-views.js');
    const servicos = await listarServicos(supabase, req.dashUser!.companyId);
    res.type('text/html').send(renderNovaNotaPage(servicos, {
      fechamentoId: String(req.query.fechamento ?? '') || undefined,
      leadId: String(req.query.lead ?? '') || undefined,
      erro: String(req.query.erro ?? '') || undefined,
    }, req.dashUser));
  });

  router.get('/fiscal/cnpj/:doc', exigir('financeiro', 'editar'), async (req: AuthedRequest, res) => {
    try {
      const { consultarCnpj } = await import('../financeiro/fiscal/cnpj.js');
      const d = await consultarCnpj(String(req.params.doc));
      if (!d) { res.status(404).json({ erro: 'não achado' }); return; }
      res.json(d);
    } catch (err) { res.status(400).json({ erro: (err as Error).message }); }
  });

  router.post('/fiscal/nova', exigir('financeiro', 'editar'), async (req: AuthedRequest, res) => {
    try {
      const b = (req.body ?? {}) as Record<string, string>;
      const { calcularNota } = await import('../financeiro/fiscal/calculo.js');
      const { criarNota, listarServicos, registrarEvento } = await import('../financeiro/fiscal/notas-repo.js');
      const valorCentavos = parseReais(b.valor);
      const servicos = await listarServicos(supabase, req.dashUser!.companyId);
      const servico = servicos.find((s) => s.id === b.servico_id);
      if (!servico || !(valorCentavos > 0) || !b.nome?.trim() || !b.doc?.trim() || !b.competencia) {
        res.redirect('/dashboard/fiscal/nova?erro=' + encodeURIComponent('Preencha tomador, serviço, valor e competência.')); return;
      }
      const issRetido = b.iss_retido === 'on';
      const { valorIss, valorLiquido } = calcularNota({ valorBruto: valorCentavos / 100, aliquotaIss: Number(servico.aliquota_iss), issRetido });
      const id = await criarNota(supabase, {
        companyId: req.dashUser!.companyId, competencia: b.competencia, servicoId: servico.id,
        descricao: b.descricao?.trim() || servico.descricao_padrao,
        tomador: { tipo: (b.tipo === 'PF' ? 'PF' : 'PJ'), doc: b.doc.trim(), nome: b.nome.trim(), im: b.im?.trim() || null,
          endereco: b.endereco?.trim() ?? '', email: b.email?.trim() || null, municipio: b.municipio?.trim() || 'Brasília', uf: (b.uf || 'DF').toUpperCase() },
        valorBruto: valorCentavos / 100, aliquotaIss: Number(servico.aliquota_iss), valorIss, issRetido, valorLiquido,
        fechamentoId: b.fechamento_id || null, leadId: b.lead_id || null, createdBy: req.dashUser!.email ?? 'dashboard',
      });
      await registrarEvento(supabase, id, 'preparada');
      res.redirect(`/dashboard/fiscal/${id}`);
    } catch (err) {
      res.redirect('/dashboard/fiscal/nova?erro=' + encodeURIComponent((err as Error).message));
    }
  });

  router.get('/fiscal/:id', exigir('financeiro', 'visualizar'), async (req: AuthedRequest, res) => {
    const { getNota, getConfig } = await import('../financeiro/fiscal/notas-repo.js');
    const { renderNotaDetalhe } = await import('./fiscal-views.js');
    const nota = await getNota(supabase, String(req.params.id));
    if (!nota) { res.status(404).send('Nota não achada'); return; }
    res.type('text/html').send(renderNotaDetalhe(nota, await getConfig(supabase, req.dashUser!.companyId), req.dashUser));
  });

  router.post('/fiscal/:id/anexar', exigir('financeiro', 'editar'), uploadPdf.single('pdf'), async (req: AuthedRequest, res) => {
    try {
      const notaId = String(req.params.id);
      const numero = String((req.body as Record<string, string>).numero ?? '').trim();
      if (!req.file || !numero) { res.redirect(`/dashboard/fiscal/${notaId}`); return; }
      const { getNota, anexarPdf, registrarEvento } = await import('../financeiro/fiscal/notas-repo.js');
      const { engatarNotaNoCaixa } = await import('../financeiro/fiscal/ponte-caixa.js');
      const companyId = req.dashUser!.companyId;
      const path = `fiscal/${companyId}/${notaId}-nfse-${numero}.pdf`;
      const { error: upErr } = await supabase.storage.from('client-attachments')
        .upload(path, req.file.buffer, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw new Error(`upload: ${upErr.message}`);
      const trocou = await anexarPdf(supabase, notaId, numero, path);
      if (trocou) {
        const nota = (await getNota(supabase, notaId))!;
        await engatarNotaNoCaixa(supabase, nota, { companyId, fechamentoId: null, leadId: null });
        await registrarEvento(supabase, notaId, 'pdf_anexado', { numero, path });
      }
      res.redirect(`/dashboard/fiscal/${notaId}`);
    } catch (err) { res.status(500).send(`Erro ao anexar: ${(err as Error).message}`); }
  });

  router.get('/fiscal/:id/pdf', exigir('financeiro', 'visualizar'), async (req: AuthedRequest, res) => {
    const { getNota } = await import('../financeiro/fiscal/notas-repo.js');
    const nota = await getNota(supabase, String(req.params.id));
    if (!nota?.pdfStoragePath) { res.status(404).send('Sem PDF'); return; }
    const { data, error } = await supabase.storage.from('client-attachments').createSignedUrl(nota.pdfStoragePath, 300);
    if (error || !data) { res.status(500).send('Erro no storage'); return; }
    res.redirect(data.signedUrl);
  });
```

**Ordem das rotas importa:** `/fiscal/nova` e `/fiscal/cnpj/:doc` DEVEM vir antes de `/fiscal/:id` (senão `:id` captura "nova").

- [ ] **Step 2:** Nav em `views.ts:170`, logo abaixo do Financeiro:

```ts
      { href: '/dashboard/fiscal', key: 'fiscal', label: '🧾 Notas', area: 'financeiro' },
```

- [ ] **Step 3:** `npm run build` → verde. `npm test` → suíte toda verde.
- [ ] **Step 4:** `git add src/modules/dashboard/router.ts src/modules/dashboard/views.ts && git commit -m "feat(fiscal): rotas + menu 🧾 Notas no dashboard"`

### Task 8: Alerta de validade do certificado (tick diário) — TDD

**Files:**
- Create: `src/modules/financeiro/fiscal/alerta-certificado.ts`
- Test: `tests/fiscal-alerta-certificado.test.ts`
- Modify: `src/index.ts` — dentro do cron diário que já chama `tickVencimentos` (buscar `tickVencimentos(` no index), acrescentar chamada ao novo tick com o mesmo padrão try/catch e o mesmo `sendText` pro número do Junior.

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect } from 'vitest';
import { mensagemAlertaCertificado } from '../src/modules/financeiro/fiscal/alerta-certificado.js';

describe('fiscal alerta certificado', () => {
  it('avisa a 30, 15 e 5 dias e no vencido; silencioso fora disso', () => {
    expect(mensagemAlertaCertificado('2026-09-29', '2026-08-30')).toContain('30 dias');
    expect(mensagemAlertaCertificado('2026-09-14', '2026-08-30')).toContain('15 dias');
    expect(mensagemAlertaCertificado('2026-09-04', '2026-08-30')).toContain('5 dias');
    expect(mensagemAlertaCertificado('2026-08-29', '2026-08-30')).toContain('VENCEU');
    expect(mensagemAlertaCertificado('2026-12-25', '2026-08-30')).toBeNull();
    expect(mensagemAlertaCertificado(null, '2026-08-30')).toBeNull();
  });
});
```

- [ ] **Step 2:** `npm test -- fiscal-alerta` → FAIL.
- [ ] **Step 3: Implementar**

```ts
// src/modules/financeiro/fiscal/alerta-certificado.ts
// Aviso no zap do Junior quando o certificado A1 está pra vencer (30/15/5 dias e vencido).
// Chamado pelo cron diário (mesmo tick dos vencimentos financeiros).
export function mensagemAlertaCertificado(validadeIso: string | null, hojeIso: string): string | null {
  if (!validadeIso) return null;
  const dias = Math.round((Date.parse(validadeIso) - Date.parse(hojeIso)) / 864e5);
  if (dias < 0) return `🚨 Certificado digital A1 VENCEU em ${validadeIso.split('-').reverse().join('/')} — sem ele não emite nota. Renove hoje.`;
  if (dias === 30 || dias === 15 || dias === 5) return `⚠️ Certificado digital A1 vence em ${dias} dias (${validadeIso.split('-').reverse().join('/')}). Renove pra não travar a emissão de nota.`;
  return null;
}
```

- [ ] **Step 4:** `npm test -- fiscal-alerta` → PASS. Ligar no cron do `src/index.ts`: ler `fiscal_config.cert_validade` (select simples via supabase, company EcoSun `00000000-0000-0000-0000-000000000001`), chamar `mensagemAlertaCertificado(validade, hojeISO)` e, se não-nulo, `sendText` pro Junior — copiar o try/catch e o destinatário do bloco do `tickVencimentos`.
- [ ] **Step 5:** `npm run build && npm test` → tudo verde. Commit: `git add tests/fiscal-alerta-certificado.test.ts src/modules/financeiro/fiscal/alerta-certificado.ts src/index.ts && git commit -m "feat(fiscal): alerta de validade do certificado A1 no cron diário"`

### Task 9: Fechamento da fatia

- [ ] **Step 1:** `npm run build && npm test` → build limpo, suíte inteira verde (3.098+ testes).
- [ ] **Step 2:** **PARAR e pedir ao Junior** (regra da casa: nunca push sem autorização): mostrar `git log --oneline master..HEAD` e pedir OK pra `git push -u origin feat/fiscal-nfse` + abrir PR (`gh pr create`). Na mesma mensagem do PR, entregar o comando de merge (`gh pr merge <N> --squash --delete-branch`).
- [ ] **Step 3:** Após merge: aplicar migration 111 no SQL Editor de prod (projeto `kupnsoyymulbdzakqlqc` — via Playwright, "Run without RLS", conferir o ref na barra de endereço) → Implantar no EasyPanel → `/health` com build novo → teste real: criar a nota da 2ª parcela do Spazio (1.250, PJ-DF, retido) em modo preparar e conferir bruto/ISS/líquido contra a nota nº 83 real.

---

## Fora da F1 (não fazer agora)
- Upload do certificado .pfx (F2) · emissão automática/XML/assinatura (F2) · cancelar/reemitir + envio pela Eva + resumo semanal (F3) · botão "Emitir nota" dentro da tela da venda (F3 — por ora a tela Nova aceita `?fechamento=` e `?lead=` na URL) · retenção INSS 11% (aguarda contadora).
