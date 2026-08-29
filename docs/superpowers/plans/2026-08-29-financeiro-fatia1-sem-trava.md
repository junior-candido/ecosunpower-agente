# Financeiro Fatia 1 — "Registra sem travar" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Caixa de Entrada existente (`src/modules/financeiro/`) passa a registrar qualquer coisa que o Junior manda **sem exigir confirmação por botão, sem sequestrar a conversa, sem depender de WABA, sem rejeitar PDF grande**; ganha dicionário de favorecidos, contas a pagar, dívidas, alertas de vencimento/DAS que escalam, e vem com setembro/2026 já carregado.

**Architecture:** Não reconstrói nada. Adiciona 4 tabelas (`financeiro_favorecidos`, `financeiro_contas_a_pagar`, `financeiro_dividas`, `financeiro_arquivos`) e 5 colunas em `financeiro_lancamentos` (migration 109). Muda o comportamento de `caixa-entrada.ts` de "pendente → botão → confirmado" para "confirmado na hora, com confiança; botões só pra corrigir". Mídia pesada vai pra fila (`financeiro_arquivos`) processada por um tick de 1 min (padrão dos crons do `index.ts`), página a página com `pdf-lib`. Alertas de vencimento/DAS num tick diário com botão "Paguei". Tudo PT-BR, testes vitest puros por regra.

**Tech Stack:** TypeScript (Node16 ESM, imports com `.js`), Supabase (service role), Anthropic SDK (extrator existente), `pdf-lib` (novo, split de páginas), vitest, WhatsApp via `sendAdminWithButtons` (WABA com fallback texto).

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/109_financeiro_sem_trava.sql` | criar | tabelas novas + colunas + RLS |
| `supabase/migrations/110_financeiro_seed_setembro_2026.sql` | criar | favorecidos conhecidos, contas a pagar e dívidas de set/26, parâmetros (pró-labore 7.000) |
| `src/modules/financeiro/favorecidos.ts` | criar | dicionário: casar texto/CPF/CNPJ → favorecido (puro) + repo |
| `src/modules/financeiro/classificar.ts` | criar | decide categoria/mundo/confiança a partir de extração + dicionário (puro) |
| `src/modules/financeiro/lancamentos-repo.ts` | modificar | `criarConfirmado`, colunas novas, `getSemDono` |
| `src/modules/financeiro/caixa-entrada.ts` | modificar | fluxo sem trava; PDF/imagem pesados → fila |
| `src/modules/financeiro/resumo-lancamento.ts` | modificar | `montarRegistrado` (1 linha + botões corrigir/apagar) |
| `src/modules/financeiro/arquivos-fila.ts` | criar | enfileirar, tick worker, split de PDF por páginas |
| `src/modules/financeiro/contas-pagar.ts` | criar | repo contas a pagar + dívidas; `marcarPaga` |
| `src/modules/financeiro/alertas-vencimento.ts` | criar | regras puras de alerta (vencimento 3d/0d/atraso, DAS 12/18/20/+) |
| `src/modules/financeiro/comando-caixa.ts` | criar | `/caixa` e `/contas` (texto) |
| `src/modules/financeiro/resumo-semanal.ts` | criar | segunda 8h: resumo + perguntas agrupadas por favorecido sem dono |
| `src/index.ts` | modificar | engates: mídia sem `metaWaba`, botões `finpg:`/`finfav:`, ticks |
| `tests/financeiro-favorecidos.test.ts` etc. | criar | um teste por módulo puro |
| `package.json` | modificar | `pdf-lib` |

Convenções da casa (não inventar): imports relativos com `.js`; funções puras separadas de I/O; repos como funções `(client, ...)`; botões `prefixo:acao:id`; `noop` pra botão OK; `sendAdminWithButtons` pra falar com o admin; migrations aplicadas na mão no SQL Editor (avisar o Junior); `npx tsc --noEmit` e `npx vitest run` antes de dizer "pronto" (2 falhas pré-existentes em `tests/supabase-vincular-novo.test.ts` são conhecidas).

---

### Task 1: Migration 109 — estrutura

**Files:**
- Create: `supabase/migrations/109_financeiro_sem_trava.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- 109: Financeiro sem trava — favorecidos, contas a pagar, dívidas, fila de arquivos,
-- colunas de banco/confiança em financeiro_lancamentos. Spec: docs/superpowers/specs/2026-08-29-modulo-financeiro-pj-pf-design.md
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Dicionário de favorecidos (quem é quem)
CREATE TABLE IF NOT EXISTS financeiro_favorecidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  nome text NOT NULL,
  doc_mascarado text,                       -- '***.680.951-**' ou '32.489.209/0001-57'
  padroes text[] NOT NULL DEFAULT '{}',     -- trechos que aparecem no extrato/mensagem (minúsculo, sem acento)
  categoria_slug text NOT NULL DEFAULT 'outros',
  mundo_padrao text NOT NULL DEFAULT 'PJ' CHECK (mundo_padrao IN ('PJ','PF','FRONTEIRA')),
  tipo_padrao text CHECK (tipo_padrao IN ('despesa','entrada')),
  observacao text,
  aprendido_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_fav_company ON financeiro_favorecidos(company_id);

-- 2) Contas a pagar (o "a receber" já existe: financeiro_contas_a_receber)
CREATE TABLE IF NOT EXISTS financeiro_contas_a_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  descricao text NOT NULL,
  valor numeric(14,2) NOT NULL CHECK (valor > 0),
  vencimento date NOT NULL,
  mundo text NOT NULL DEFAULT 'PJ' CHECK (mundo IN ('PJ','PF')),
  categoria_slug text NOT NULL DEFAULT 'outros',
  favorecido_id uuid REFERENCES financeiro_favorecidos(id) ON DELETE SET NULL,
  divida_id uuid,                            -- FK abaixo, depois de criar financeiro_dividas
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','divida','fatura','guia','seed')),
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','paga','cancelada')),
  pago_em date,
  lancamento_id uuid REFERENCES financeiro_lancamentos(id) ON DELETE SET NULL,
  lembretes jsonb NOT NULL DEFAULT '[]',     -- [{"tipo":"3d","em":"2026-09-04"}]
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_pagar_venc ON financeiro_contas_a_pagar(status, vencimento);

-- 3) Dívidas (parcelas recorrentes geram contas a pagar)
CREATE TABLE IF NOT EXISTS financeiro_dividas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  credor text NOT NULL,
  contrato text,
  mundo text NOT NULL DEFAULT 'PJ' CHECK (mundo IN ('PJ','PF')),
  saldo_ref numeric(14,2),
  parcela numeric(14,2) NOT NULL,
  dia_vencimento int NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  ultima_parcela date,
  taxa_mensal numeric(7,4),
  garantia text,
  observacao text,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE financeiro_contas_a_pagar
  ADD CONSTRAINT fin_pagar_divida_fk FOREIGN KEY (divida_id) REFERENCES financeiro_dividas(id) ON DELETE SET NULL;

-- 4) Fila de arquivos (PDF/imagem/CSV pesados lidos fora do webhook)
CREATE TABLE IF NOT EXISTS financeiro_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  origem text NOT NULL CHECK (origem IN ('zap','tela')),
  tipo text NOT NULL DEFAULT 'outro' CHECK (tipo IN ('extrato','fatura','comprovante','guia','outro')),
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  bytes int NOT NULL DEFAULT 0,
  paginas int,
  paginas_ok int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'fila' CHECK (status IN ('fila','lendo','ok','erro_parcial','erro')),
  tentativas int NOT NULL DEFAULT 0,
  erro text,
  lancamentos_criados int NOT NULL DEFAULT 0,
  enviado_por text,
  message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_arq_status ON financeiro_arquivos(status, created_at);

-- 5) financeiro_lancamentos: banco, favorecido, confiança, fila, dedupe
ALTER TABLE financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS banco_conta text NOT NULL DEFAULT 'desconhecido'
    CHECK (banco_conta IN ('sicoob_cc','sicoob_cartao','itau_pj','itau_pf','visa_emp','latam','santander_pj','mercado_pago','dinheiro','desconhecido')),
  ADD COLUMN IF NOT EXISTS favorecido_id uuid REFERENCES financeiro_favorecidos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confianca text NOT NULL DEFAULT 'media'
    CHECK (confianca IN ('alta','media','baixa','pendente')),
  ADD COLUMN IF NOT EXISTS arquivo_id uuid REFERENCES financeiro_arquivos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hash_dedupe text;
-- origem ganha novos valores (extrato/tela/conta) — recria o CHECK
ALTER TABLE financeiro_lancamentos DROP CONSTRAINT IF EXISTS financeiro_lancamentos_origem_check;
ALTER TABLE financeiro_lancamentos
  ADD CONSTRAINT financeiro_lancamentos_origem_check
  CHECK (origem IN ('zap_midia','zap_texto','extrato','tela','conta'));
-- pf_pj ganha FRONTEIRA (empresa pagou coisa PF ou vice-versa)
ALTER TABLE financeiro_lancamentos DROP CONSTRAINT IF EXISTS financeiro_lancamentos_pf_pj_check;
ALTER TABLE financeiro_lancamentos
  ADD CONSTRAINT financeiro_lancamentos_pf_pj_check CHECK (pf_pj IN ('PF','PJ','FRONTEIRA'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_lanc_hash
  ON financeiro_lancamentos(hash_dedupe) WHERE hash_dedupe IS NOT NULL AND status <> 'apagado';

-- 6) RLS (template da casa, 108_dashboard_senha_tokens.sql)
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['financeiro_favorecidos','financeiro_contas_a_pagar','financeiro_dividas','financeiro_arquivos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON public.%I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON public.%I AS PERMISSIVE FOR ALL
      USING (company_id = (SELECT coalesce(nullif(current_setting('app.company_id', true), '')::uuid, (auth.jwt() ->> 'company_id')::uuid)))
      WITH CHECK (company_id = (SELECT coalesce(nullif(current_setting('app.company_id', true), '')::uuid, (auth.jwt() ->> 'company_id')::uuid)))$p$, t);
  END LOOP;
END $$;
```

- [ ] **Step 2: Conferir sintaxe rodando num Postgres local, se houver; senão revisar a olho** (os `DROP CONSTRAINT IF EXISTS` usam os nomes automáticos do Postgres: `financeiro_lancamentos_origem_check` e `financeiro_lancamentos_pf_pj_check` — foram criados inline em 047, logo têm esses nomes).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/109_financeiro_sem_trava.sql
git commit -m "feat(financeiro): migration 109 — favorecidos, contas a pagar, dívidas, fila de arquivos, colunas sem-trava"
```

---

### Task 2: Dicionário de favorecidos (puro + repo)

**Files:**
- Create: `src/modules/financeiro/favorecidos.ts`
- Test: `tests/financeiro-favorecidos.test.ts`

- [ ] **Step 1: Teste**

```ts
// tests/financeiro-favorecidos.test.ts
import { describe, it, expect } from 'vitest';
import { normalizarTexto, casarFavorecido, type Favorecido } from '../src/modules/financeiro/favorecidos.js';

const kelvyn: Favorecido = { id: 'k', nome: 'Kelvyn', doc_mascarado: '***.680.951-**', padroes: ['kelvyn', '680.951'], categoria_slug: 'mao_de_obra', mundo_padrao: 'PJ', tipo_padrao: 'despesa' };
const edilene: Favorecido = { id: 'e', nome: 'Edilene (sócia)', doc_mascarado: '***.119.741-**', padroes: ['edilene'], categoria_slug: 'outros', mundo_padrao: 'FRONTEIRA', tipo_padrao: 'entrada' };
const cft: Favorecido = { id: 'c', nome: 'CFT (TRT)', doc_mascarado: '32.489.209/0001-57', padroes: ['32.489.209', 'conselho regional dos tecnic'], categoria_slug: 'outros', mundo_padrao: 'PJ', tipo_padrao: 'despesa' };
const lista = [kelvyn, edilene, cft];

describe('favorecidos: normalizar', () => {
  it('tira acento, caixa e espaços repetidos', () => {
    expect(normalizarTexto('  Pagamento Pix ***.680.951-**  ')).toBe('pagamento pix ***.680.951-**');
    expect(normalizarTexto('ÉDILENE Rodrigues')).toBe('edilene rodrigues');
  });
});

describe('favorecidos: casar', () => {
  it('acha por CPF mascarado no texto do extrato', () => {
    expect(casarFavorecido('Pagamento Pix ***.680.951-**', lista)?.id).toBe('k');
  });
  it('acha por nome em áudio transcrito', () => {
    expect(casarFavorecido('paguei 800 pro kelvyn da loja 305', lista)?.id).toBe('k');
  });
  it('acha CNPJ com ou sem barra/espaço', () => {
    expect(casarFavorecido('Pagamento Pix 32.489.209 0001-57 Boleto', lista)?.id).toBe('c');
  });
  it('não acha → null (nunca chuta)', () => {
    expect(casarFavorecido('pix 10.198.309/0001-91', lista)).toBeNull();
  });
  it('padrão mais longo ganha quando dois casam', () => {
    const a: Favorecido = { ...kelvyn, id: 'a', padroes: ['lucas'] };
    const b: Favorecido = { ...kelvyn, id: 'b', padroes: ['lucas rodrigues leite'] };
    expect(casarFavorecido('pix lucas rodrigues leite 252', [a, b])?.id).toBe('b');
  });
});
```

- [ ] **Step 2: Rodar — deve falhar (módulo não existe)**

Run: `npx vitest run tests/financeiro-favorecidos.test.ts`
Expected: FAIL "Cannot find module"

- [ ] **Step 3: Implementar**

```ts
// src/modules/financeiro/favorecidos.ts
// Dicionário de favorecidos: quem é quem. PURO (casar) + repo (Supabase).
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Favorecido {
  id: string;
  nome: string;
  doc_mascarado: string | null;
  padroes: string[];               // já normalizados
  categoria_slug: string;
  mundo_padrao: 'PJ' | 'PF' | 'FRONTEIRA';
  tipo_padrao: 'despesa' | 'entrada' | null;
}

export function normalizarTexto(s: string | null | undefined): string {
  if (!s) return '';
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// CNPJ pode vir "32.489.209 0001-57" (Sicoob) ou "32.489.209/0001-57": casa os dois.
function variantesDoc(p: string): string[] {
  const out = new Set<string>([p]);
  if (/\d{2}\.\d{3}\.\d{3}[ /]\d{4}-\d{2}/.test(p)) {
    out.add(p.replace(/[ /]\d{4}-\d{2}$/, '')); // só a raiz 12.345.678
  }
  return [...out];
}

// Devolve o favorecido cujo padrão mais longo aparece no texto; null se nenhum.
export function casarFavorecido(texto: string, lista: Favorecido[]): Favorecido | null {
  const t = normalizarTexto(texto);
  let melhor: { fav: Favorecido; len: number } | null = null;
  for (const fav of lista) {
    for (const p of fav.padroes) {
      const pn = normalizarTexto(p);
      if (!pn) continue;
      for (const v of variantesDoc(pn)) {
        if (t.includes(v) && (!melhor || v.length > melhor.len)) melhor = { fav, len: v.length };
      }
    }
  }
  return melhor?.fav ?? null;
}

// ---- repo ----
const COLS = 'id, nome, doc_mascarado, padroes, categoria_slug, mundo_padrao, tipo_padrao';

export async function getFavorecidos(client: SupabaseClient): Promise<Favorecido[]> {
  const { data, error } = await client.from('financeiro_favorecidos').select(COLS).order('nome');
  if (error) throw new Error(`getFavorecidos: ${error.message}`);
  return (data ?? []) as Favorecido[];
}

export async function aprenderFavorecido(client: SupabaseClient, f: {
  nome: string; doc_mascarado?: string | null; padroes: string[];
  categoria_slug: string; mundo_padrao: 'PJ' | 'PF' | 'FRONTEIRA'; tipo_padrao?: 'despesa' | 'entrada' | null;
}): Promise<string> {
  const { data, error } = await client.from('financeiro_favorecidos').insert({
    nome: f.nome, doc_mascarado: f.doc_mascarado ?? null,
    padroes: f.padroes.map(normalizarTexto).filter(Boolean),
    categoria_slug: f.categoria_slug, mundo_padrao: f.mundo_padrao, tipo_padrao: f.tipo_padrao ?? null,
  }).select('id').single();
  if (error) throw new Error(`aprenderFavorecido: ${error.message}`);
  return (data as { id: string }).id;
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npx vitest run tests/financeiro-favorecidos.test.ts`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/favorecidos.ts tests/financeiro-favorecidos.test.ts
git commit -m "feat(financeiro): dicionário de favorecidos (casar por nome/CPF/CNPJ, nunca chuta)"
```

---

### Task 3: Classificador (puro) — categoria, mundo, confiança

**Files:**
- Create: `src/modules/financeiro/classificar.ts`
- Test: `tests/financeiro-classificar.test.ts`

- [ ] **Step 1: Teste**

```ts
// tests/financeiro-classificar.test.ts
import { describe, it, expect } from 'vitest';
import { classificar } from '../src/modules/financeiro/classificar.js';
import type { Favorecido } from '../src/modules/financeiro/favorecidos.js';

const kelvyn: Favorecido = { id: 'k', nome: 'Kelvyn', doc_mascarado: null, padroes: ['kelvyn'], categoria_slug: 'mao_de_obra', mundo_padrao: 'PJ', tipo_padrao: 'despesa' };
const base = { tipo: 'despesa' as const, valor: 800, contraparte: 'Kelvyn', categoria_slug: null, pf_pj: null as null, descricao: 'kelvyn loja 305' };

describe('classificar', () => {
  it('favorecido conhecido → categoria e mundo do dicionário, confiança alta', () => {
    const r = classificar(base, [kelvyn]);
    expect(r).toMatchObject({ categoria_slug: 'mao_de_obra', mundo: 'PJ', confianca: 'alta', favorecido_id: 'k' });
  });
  it('sem favorecido mas com categoria e PF/PJ da extração → média', () => {
    const r = classificar({ ...base, contraparte: 'Posto Shell', categoria_slug: 'combustivel', pf_pj: 'PJ' }, [kelvyn]);
    expect(r).toMatchObject({ categoria_slug: 'combustivel', mundo: 'PJ', confianca: 'media', favorecido_id: null });
  });
  it('sem favorecido e sem PF/PJ → assume PJ (admin) com confiança baixa, nunca bloqueia', () => {
    const r = classificar({ ...base, contraparte: 'Fulano', pf_pj: null }, []);
    expect(r).toMatchObject({ mundo: 'PJ', confianca: 'baixa' });
  });
  it('PF explícito na extração vence o dicionário', () => {
    const r = classificar({ ...base, pf_pj: 'PF' }, [kelvyn]);
    expect(r.mundo).toBe('PF');
  });
  it('categoria explícita da extração vence o dicionário (Eva leu a nota)', () => {
    const r = classificar({ ...base, categoria_slug: 'ferramenta' }, [kelvyn]);
    expect(r.categoria_slug).toBe('ferramenta');
  });
});
```

- [ ] **Step 2: Rodar — falha**

Run: `npx vitest run tests/financeiro-classificar.test.ts` → FAIL (módulo não existe)

- [ ] **Step 3: Implementar**

```ts
// src/modules/financeiro/classificar.ts
// PURO: decide categoria, mundo (PJ/PF/FRONTEIRA) e confiança. Regra: dicionário
// confirmado > extração explícita > padrão PJ com confiança baixa. Nunca bloqueia.
import { casarFavorecido, type Favorecido } from './favorecidos.js';
import { resolverCategoria, type CategoriaSlug } from './lancamentos.js';

export interface EntradaClassificar {
  tipo: 'despesa' | 'entrada' | null;
  valor: number | null;
  contraparte: string | null;
  categoria_slug: string | null;
  pf_pj: 'PF' | 'PJ' | null;
  descricao: string | null;
}
export interface Classificacao {
  categoria_slug: CategoriaSlug;
  mundo: 'PJ' | 'PF' | 'FRONTEIRA';
  confianca: 'alta' | 'media' | 'baixa';
  favorecido_id: string | null;
  favorecido_nome: string | null;
}

export function classificar(e: EntradaClassificar, dicionario: Favorecido[]): Classificacao {
  const texto = [e.contraparte, e.descricao].filter(Boolean).join(' ');
  const fav = texto ? casarFavorecido(texto, dicionario) : null;
  const catExplicita = e.categoria_slug && e.categoria_slug !== 'outros' ? resolverCategoria(e.categoria_slug) : null;
  const categoria_slug = catExplicita ?? (fav ? resolverCategoria(fav.categoria_slug) : resolverCategoria(e.categoria_slug));
  const mundo: Classificacao['mundo'] = e.pf_pj ?? fav?.mundo_padrao ?? 'PJ';
  let confianca: Classificacao['confianca'];
  if (fav) confianca = 'alta';
  else if (e.pf_pj && catExplicita) confianca = 'media';
  else if (e.pf_pj || catExplicita) confianca = 'media';
  else confianca = 'baixa';
  return { categoria_slug, mundo, confianca, favorecido_id: fav?.id ?? null, favorecido_nome: fav?.nome ?? null };
}
```

- [ ] **Step 4: Rodar — passa** (`npx vitest run tests/financeiro-classificar.test.ts` → 5 passed)

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/classificar.ts tests/financeiro-classificar.test.ts
git commit -m "feat(financeiro): classificador puro (dicionário > extração > PJ baixa)"
```

---

### Task 4: Repo — `criarConfirmado`, colunas novas, sem-dono

**Files:**
- Modify: `src/modules/financeiro/lancamentos-repo.ts`
- Test: `tests/financeiro-lancamentos-repo.test.ts`

- [ ] **Step 1: Teste (mock fluente do supabase, mesmo estilo de tests/closing-persist.test.ts)**

```ts
// tests/financeiro-lancamentos-repo.test.ts
import { describe, it, expect, vi } from 'vitest';
import { criarConfirmado, hashDedupe } from '../src/modules/financeiro/lancamentos-repo.js';

function sbMock(retorno: unknown) {
  const single = vi.fn().mockResolvedValue({ data: retorno, error: null });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { client: { from } as never, from, insert };
}

describe('lancamentos-repo: hashDedupe', () => {
  it('mesmo banco+data+valor+descrição → mesmo hash; muda um → muda', () => {
    const a = hashDedupe({ bancoConta: 'sicoob_cc', dataEvento: '2026-08-28', valor: 800, descricao: 'PIX Kelvyn' });
    const b = hashDedupe({ bancoConta: 'sicoob_cc', dataEvento: '2026-08-28', valor: 800, descricao: 'pix  KELVYN ' });
    const c = hashDedupe({ bancoConta: 'sicoob_cc', dataEvento: '2026-08-28', valor: 801, descricao: 'PIX Kelvyn' });
    expect(a).toBe(b); expect(a).not.toBe(c);
  });
});

describe('lancamentos-repo: criarConfirmado', () => {
  it('insere já confirmado com banco, favorecido, confiança e hash', async () => {
    const { client, from, insert } = sbMock({ id: 'L1' });
    const id = await criarConfirmado(client, {
      tipo: 'despesa', valor: 800, dataEvento: '2026-08-28', contraparte: 'Kelvyn', descricao: 'loja 305',
      categoriaId: 'cat-mo', pfPj: 'PJ', leadId: null, storagePath: null, mimeType: null,
      origem: 'zap_texto', messageId: null, extracao: {}, createdBy: '5561', temNota: false,
      bancoConta: 'desconhecido', favorecidoId: 'k', confianca: 'alta', arquivoId: null,
    });
    expect(id).toBe('L1');
    expect(from).toHaveBeenCalledWith('financeiro_lancamentos');
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.status).toBe('confirmado');
    expect(row.confianca).toBe('alta');
    expect(row.favorecido_id).toBe('k');
    expect(typeof row.hash_dedupe).toBe('string');
  });
});
```

- [ ] **Step 2: Rodar — falha** (`criarConfirmado`/`hashDedupe` não existem)

- [ ] **Step 3: Implementar (acrescentar ao final de `lancamentos-repo.ts`; atualizar `COLS` na linha 25)**

```ts
// COLS (linha 25) passa a ser:
const COLS = 'id, tipo, status, valor, data_evento, competencia, contraparte, descricao, categoria_id, pf_pj, lead_id, conta_id, tem_nota, storage_path, extracao, created_at, banco_conta, favorecido_id, confianca, arquivo_id';

// ... e LancamentoRow ganha:
//   banco_conta: string; favorecido_id: string | null; confianca: 'alta'|'media'|'baixa'|'pendente'; arquivo_id: string | null;

import { createHash } from 'node:crypto';
import { normalizarTexto } from './favorecidos.js';

export type BancoConta = 'sicoob_cc'|'sicoob_cartao'|'itau_pj'|'itau_pf'|'visa_emp'|'latam'|'santander_pj'|'mercado_pago'|'dinheiro'|'desconhecido';

export function hashDedupe(k: { bancoConta: BancoConta; dataEvento: string; valor: number; descricao: string | null }): string {
  const base = `${k.bancoConta}|${k.dataEvento}|${Math.round(k.valor * 100)}|${normalizarTexto(k.descricao)}`;
  return createHash('sha1').update(base).digest('hex');
}

export async function criarConfirmado(client: SupabaseClient, l: {
  tipo: 'despesa' | 'entrada'; valor: number; dataEvento: string;
  contraparte: string | null; descricao: string | null; categoriaId: string | null;
  pfPj: 'PF' | 'PJ' | 'FRONTEIRA'; leadId: string | null; storagePath: string | null;
  mimeType: string | null; origem: 'zap_midia' | 'zap_texto' | 'extrato' | 'tela' | 'conta'; messageId: string | null;
  extracao: Record<string, unknown>; createdBy: string; temNota: boolean;
  bancoConta: BancoConta; favorecidoId: string | null; confianca: 'alta' | 'media' | 'baixa' | 'pendente'; arquivoId: string | null;
}): Promise<string> {
  const { data, error } = await client.from('financeiro_lancamentos').insert({
    tipo: l.tipo, status: 'confirmado', valor: l.valor, data_evento: l.dataEvento,
    competencia: competenciaDe(l.dataEvento), contraparte: l.contraparte,
    descricao: l.descricao, categoria_id: l.categoriaId, pf_pj: l.pfPj,
    lead_id: l.leadId, storage_path: l.storagePath, mime_type: l.mimeType,
    origem: l.origem, message_id: l.messageId, extracao: l.extracao, created_by: l.createdBy,
    tem_nota: l.temNota, banco_conta: l.bancoConta, favorecido_id: l.favorecidoId,
    confianca: l.confianca, arquivo_id: l.arquivoId,
    hash_dedupe: hashDedupe({ bancoConta: l.bancoConta, dataEvento: l.dataEvento, valor: l.valor, descricao: l.descricao ?? l.contraparte }),
  }).select('id').single();
  if (error) {
    // 23505 = já existe (mesmo extrato importado 2×) → devolve vazio, quem chama decide
    if ((error as { code?: string }).code === '23505') throw new Error('DUPLICADO');
    throw new Error(`criarConfirmado: ${error.message}`);
  }
  return (data as { id: string }).id;
}

// Lançamentos confirmados sem favorecido (sem dono) num período — pro resumo semanal.
export async function getSemDono(client: SupabaseClient, deIso: string, ateIso: string): Promise<LancamentoRow[]> {
  const { data, error } = await client.from('financeiro_lancamentos').select(COLS)
    .eq('status', 'confirmado').is('favorecido_id', null).in('confianca', ['baixa', 'pendente'])
    .gte('data_evento', deIso).lte('data_evento', ateIso).order('valor', { ascending: false }).limit(100);
  if (error) throw new Error(`getSemDono: ${error.message}`);
  return (data ?? []) as LancamentoRow[];
}

export async function definirFavorecido(client: SupabaseClient, lancamentoId: string, favorecidoId: string, pfPj: 'PF'|'PJ'|'FRONTEIRA', categoriaId: string | null): Promise<void> {
  const { error } = await client.from('financeiro_lancamentos')
    .update({ favorecido_id: favorecidoId, pf_pj: pfPj, categoria_id: categoriaId, confianca: 'alta', updated_at: new Date().toISOString() })
    .eq('id', lancamentoId);
  if (error) throw new Error(`definirFavorecido: ${error.message}`);
}
```

- [ ] **Step 4: Rodar — passa**; `npx tsc --noEmit` limpo.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/lancamentos-repo.ts tests/financeiro-lancamentos-repo.test.ts
git commit -m "feat(financeiro): criarConfirmado com banco/favorecido/confiança + dedupe por hash"
```

---

### Task 5: Caixa de Entrada sem trava (texto/áudio)

**Files:**
- Modify: `src/modules/financeiro/resumo-lancamento.ts` (adicionar `montarRegistrado`)
- Modify: `src/modules/financeiro/caixa-entrada.ts` (`criarPendenteEFalar` → `registrarEFalar`; janela "aguardando" 10 min; sem atividade obrigatória)
- Test: `tests/financeiro-resumo-registrado.test.ts`, `tests/financeiro-caixa-sem-trava.test.ts`

- [ ] **Step 1: Teste do texto de resposta**

```ts
// tests/financeiro-resumo-registrado.test.ts
import { describe, it, expect } from 'vitest';
import { montarRegistrado } from '../src/modules/financeiro/resumo-lancamento.js';

describe('montarRegistrado', () => {
  it('uma linha + 2 botões (corrigir/apagar) quando confiança alta', () => {
    const m = montarRegistrado({ id: 'L1', tipo: 'despesa', valor: 800, data_evento: '2026-09-01', contraparte: 'Kelvyn', categoriaNome: 'Mão de obra', pf_pj: 'PJ' }, { confianca: 'alta', obraNome: 'Superbom 305' });
    expect(m.body).toBe('✅ Registrei: 💸 R$ 800,00 · Kelvyn · Mão de obra · PJ · Superbom 305 · 01/09/2026');
    expect(m.buttons.map((b) => b.id)).toEqual(['finlan:corr:L1', 'finlan:apg:L1']);
  });
  it('confiança baixa avisa que assumiu PJ e oferece PF', () => {
    const m = montarRegistrado({ id: 'L2', tipo: 'despesa', valor: 50, data_evento: '2026-09-01', contraparte: 'Fulano', categoriaNome: 'Outros', pf_pj: 'PJ' }, { confianca: 'baixa', obraNome: null });
    expect(m.body).toContain('assumi PJ');
    expect(m.buttons.map((b) => b.id)).toEqual(['finlan:pf:L2', 'finlan:corr:L2', 'finlan:apg:L2']);
  });
});
```

- [ ] **Step 2: Rodar — falha**

- [ ] **Step 3: Implementar `montarRegistrado` (acrescentar em `resumo-lancamento.ts`)**

```ts
export function montarRegistrado(l: LancamentoResumo, o: { confianca: 'alta' | 'media' | 'baixa'; obraNome: string | null }): MsgComBotoes {
  const emoji = l.tipo === 'entrada' ? '💰' : '💸';
  const partes = [`${emoji} ${brl(l.valor)}`, l.contraparte, l.categoriaNome, l.pf_pj, o.obraNome, dataBR(l.data_evento)].filter(Boolean);
  let body = `✅ Registrei: ${partes.join(' · ')}`;
  const buttons: BotaoZap[] = [];
  if (o.confianca === 'baixa') {
    body += `\n(assumi PJ — se for seu, toca em PF)`;
    buttons.push({ id: `finlan:pf:${l.id}`, title: 'É PF' });
  }
  buttons.push({ id: `finlan:corr:${l.id}`, title: 'Corrigir' }, { id: `finlan:apg:${l.id}`, title: 'Apagar' });
  return { body, buttons };
}
```

- [ ] **Step 4: Teste do fluxo (porta injetada, sem rede)**

```ts
// tests/financeiro-caixa-sem-trava.test.ts
import { describe, it, expect } from 'vitest';
import { decidirRegistro } from '../src/modules/financeiro/caixa-entrada.js';

describe('decidirRegistro (puro): nunca trava', () => {
  it('com valor e tipo → registra já (confirmado)', () => {
    expect(decidirRegistro({ valor: 800, tipo: 'despesa' })).toEqual({ acao: 'registrar' });
  });
  it('sem valor → pergunta uma vez, não cria pendente', () => {
    expect(decidirRegistro({ valor: null, tipo: 'despesa' })).toEqual({ acao: 'perguntar_valor' });
  });
  it('sem tipo mas com valor → assume despesa', () => {
    expect(decidirRegistro({ valor: 100, tipo: null })).toEqual({ acao: 'registrar' });
  });
});
```

- [ ] **Step 5: Implementar em `caixa-entrada.ts`**

Mudanças, em ordem:

(a) Novo export puro no topo do arquivo:
```ts
export function decidirRegistro(e: { valor: number | null; tipo: 'despesa' | 'entrada' | null }): { acao: 'registrar' | 'perguntar_valor' } {
  return typeof e.valor === 'number' && e.valor > 0 ? { acao: 'registrar' } : { acao: 'perguntar_valor' };
}
```

(b) Substituir o corpo de `criarPendenteEFalar` (linhas ~96-150) por `registrarEFalar` — mesma assinatura, mas:
```ts
async function registrarEFalar(deps: CaixaDeps, from: string, e: ExtracaoLancamento,
  midia: { base64: string; mimeType: string; messageId: string } | null,
  herdado?: { storagePath: string | null; mimeType?: string | null; leadId: string | null; categoriaId: string | null },
): Promise<void> {
  if (decidirRegistro(e).acao === 'perguntar_valor') {
    await deps.sendText(from, 'Não peguei o valor 🤔 Me fala o valor e o que foi (ex: "380 gasolina no Shell").');
    return;
  }
  const dataEvento = e.data ?? hojeBRT();
  const [cats, dic] = await Promise.all([getCategorias(deps.supabase), getFavorecidos(deps.supabase)]);
  const cls = classificar({ tipo: e.tipo, valor: e.valor, contraparte: e.contraparte, categoria_slug: e.categoria_slug, pf_pj: e.pf_pj, descricao: e.descricao }, dic);
  let categoriaId = cats.find((c) => c.slug === cls.categoria_slug)?.id ?? null;
  if (cls.categoria_slug === 'outros' && herdado?.categoriaId) categoriaId = herdado.categoriaId;

  let storagePath: string | null = herdado?.storagePath ?? null;
  if (midia) {
    storagePath = await uploadComprovante(deps.supabase, midia.base64, midia.mimeType, competenciaDe(dataEvento));
    if (!storagePath) await deps.sendText(from, '⚠️ Não consegui arquivar o comprovante (registrei mesmo assim).');
  }
  let leadId: string | null = herdado?.leadId ?? null; let obraNome: string | null = null;
  if (e.obra_ref) {
    const t = e.obra_ref.replace(/[%_]/g, '\\$&');
    const { data } = await deps.supabase.from('leads').select('id, name').ilike('name', `%${t}%`).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (data) { leadId = (data as { id: string }).id; obraNome = (data as { name: string }).name; }
  }
  let id: string;
  try {
    id = await criarConfirmado(deps.supabase, {
      tipo: e.tipo ?? 'despesa', valor: e.valor!, dataEvento, contraparte: e.contraparte ?? cls.favorecido_nome, descricao: e.descricao,
      categoriaId, pfPj: cls.mundo, leadId, storagePath, mimeType: midia?.mimeType ?? herdado?.mimeType ?? null,
      origem: midia ? 'zap_midia' : 'zap_texto', messageId: midia?.messageId ?? null,
      extracao: { ...e }, createdBy: from, temNota: e.tem_nota, bancoConta: 'desconhecido',
      favorecidoId: cls.favorecido_id, confianca: cls.confianca, arquivoId: null,
    });
  } catch (err) {
    if ((err as Error).message === 'DUPLICADO') { await deps.sendText(from, '↩️ Esse eu já tinha registrado (mesmo valor, mesmo dia, mesma descrição).'); return; }
    throw err;
  }
  if (Array.isArray(e.itens) && e.itens.length > 0) {
    await gravarComprasDaNota(deps.supabase, id).catch(() => undefined);
  }
  const row = await getLancamento(deps.supabase, id);
  const msg = montarRegistrado(await rowParaResumo(deps, row!), { confianca: cls.confianca, obraNome });
  await deps.sendWithButtons(from, msg.body, msg.buttons, FOOTER);
}
```
Imports novos no topo: `classificar` (`./classificar.js`), `getFavorecidos` (`./favorecidos.js`), `criarConfirmado` (`./lancamentos-repo.js`), `montarRegistrado` (`./resumo-lancamento.js`).

(c) `CaixaDeps` ganha `sendWithButtons: (to, body, buttons, footer?) => Promise<void>` e **deixa de exigir `waba`** (trocar todas as chamadas `deps.waba.sendInteractiveButtons(from, body, buttons, FOOTER)` por `deps.sendWithButtons(from, body, buttons, FOOTER)` — são 9 ocorrências).

(d) Em `tryHandleFinanceiroTexto`: a janela de "aguardando" só vale quando `extracao.aguardando === true` **e** `created_at` < 10 min (não 1 h). Implementar em `getPendenteAguardando` (lancamentos-repo.ts:103) trocando o filtro de tempo para `gte('created_at', new Date(Date.now() - 10*60*1000).toISOString())`.

(e) Botão `finlan:conf` continua existindo (compatibilidade), mas o fluxo novo nunca cria `pendente` para texto/áudio — só `corr` cria pendente (a partir de um confirmado, como hoje).

(f) Remover a exigência de atividade (`entradaPrecisaImposto`) do caminho automático: entrada PJ registrada direto; imposto é calculado no fechamento (Fatia 3) com o real do contador. Manter a função exportada (testes existentes) mas não chamá-la em `registrarEFalar`.

- [ ] **Step 6: Ajustar testes existentes que assumiam pendente** — rodar `npx vitest run tests/financeiro-*.test.ts`; corrigir só asserções de mensagem ("Li aqui" → "✅ Registrei"). Não apagar testes de regra.

- [ ] **Step 7: Rodar tudo + tsc**

Run: `npx vitest run && npx tsc --noEmit`
Expected: só as 2 falhas pré-existentes de `supabase-vincular-novo`.

- [ ] **Step 8: Commit**

```bash
git add src/modules/financeiro/caixa-entrada.ts src/modules/financeiro/resumo-lancamento.ts src/modules/financeiro/lancamentos-repo.ts tests/financeiro-resumo-registrado.test.ts tests/financeiro-caixa-sem-trava.test.ts
git commit -m "feat(financeiro): caixa de entrada registra na hora (sem pendente/botão), janela 10 min, sem WABA obrigatório"
```

---

### Task 6: Fila de arquivos (PDF/imagem pesados fora do webhook)

**Files:**
- Modify: `package.json` (`pdf-lib`)
- Create: `src/modules/financeiro/arquivos-fila.ts`
- Modify: `src/modules/financeiro/caixa-entrada.ts` (`tryHandleFinanceiroMedia` → enfileira se pesado)
- Test: `tests/financeiro-arquivos-fila.test.ts`

- [ ] **Step 1: Instalar dependência**

Run: `npm i pdf-lib@^1.17.1`
Expected: `package.json` com `"pdf-lib": "^1.17.1"` em dependencies.

- [ ] **Step 2: Teste das regras puras**

```ts
// tests/financeiro-arquivos-fila.test.ts
import { describe, it, expect } from 'vitest';
import { precisaFila, planoDeLotes, LIMITE_INLINE_BYTES } from '../src/modules/financeiro/arquivos-fila.js';

describe('arquivos-fila: precisaFila', () => {
  it('imagem pequena e PDF de 1 página → inline', () => {
    expect(precisaFila({ bytes: 200_000, paginas: 1, mime: 'image/jpeg' })).toBe(false);
    expect(precisaFila({ bytes: 300_000, paginas: 1, mime: 'application/pdf' })).toBe(false);
  });
  it('PDF com 2+ páginas ou acima do limite → fila', () => {
    expect(precisaFila({ bytes: 300_000, paginas: 7, mime: 'application/pdf' })).toBe(true);
    expect(precisaFila({ bytes: LIMITE_INLINE_BYTES + 1, paginas: 1, mime: 'application/pdf' })).toBe(true);
  });
});
describe('arquivos-fila: planoDeLotes', () => {
  it('quebra 14 páginas em lotes de 4', () => {
    expect(planoDeLotes(14, 4)).toEqual([[0,3],[4,7],[8,11],[12,13]]);
  });
  it('1 página → um lote', () => { expect(planoDeLotes(1, 4)).toEqual([[0,0]]); });
});
```

- [ ] **Step 3: Rodar — falha**

- [ ] **Step 4: Implementar**

```ts
// src/modules/financeiro/arquivos-fila.ts
// Fila de leitura de arquivos financeiros. Regra: nada pesado é lido dentro do
// webhook. Enfileira, responde "recebi", um tick lê página a página e grava por lote.
import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';
import { extrairDePdf, extrairDeImagem, type ExtracaoLancamento } from './extrator-lancamento.js';
import { uploadComprovante } from './comprovantes.js';

export const LIMITE_INLINE_BYTES = 1_500_000;   // até ~1,5 MB e 1 página lê na hora
export const PAGINAS_POR_LOTE = 4;
export const MAX_TENTATIVAS = 3;

export function precisaFila(a: { bytes: number; paginas: number; mime: string }): boolean {
  if (a.bytes > LIMITE_INLINE_BYTES) return true;
  return a.mime === 'application/pdf' && a.paginas > 1;
}

export function planoDeLotes(paginas: number, porLote = PAGINAS_POR_LOTE): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < paginas; i += porLote) out.push([i, Math.min(i + porLote, paginas) - 1]);
  return out;
}

export async function contarPaginas(base64: string): Promise<number> {
  try { const doc = await PDFDocument.load(Buffer.from(base64, 'base64'), { ignoreEncryption: true }); return doc.getPageCount(); }
  catch { return 1; }
}

// Recorta páginas [de..ate] num PDF novo (base64).
export async function recortarPaginas(base64: string, de: number, ate: number): Promise<string> {
  const src = await PDFDocument.load(Buffer.from(base64, 'base64'), { ignoreEncryption: true });
  const dst = await PDFDocument.create();
  const idx = Array.from({ length: ate - de + 1 }, (_, i) => de + i);
  const pages = await dst.copyPages(src, idx);
  pages.forEach((p) => dst.addPage(p));
  return Buffer.from(await dst.save()).toString('base64');
}

export interface ArquivoRow { id: string; storage_path: string; mime_type: string; paginas: number | null; paginas_ok: number; tentativas: number; enviado_por: string | null; tipo: string }

export async function enfileirar(client: SupabaseClient, a: {
  base64: string; mimeType: string; bytes: number; paginas: number; origem: 'zap' | 'tela'; tipo?: string; enviadoPor: string; messageId: string | null; competencia: string;
}): Promise<string> {
  const storagePath = await uploadComprovante(client, a.base64, a.mimeType, a.competencia);
  if (!storagePath) throw new Error('não consegui guardar o arquivo no Storage');
  const { data, error } = await client.from('financeiro_arquivos').insert({
    origem: a.origem, tipo: a.tipo ?? 'outro', storage_path: storagePath, mime_type: a.mimeType, bytes: a.bytes,
    paginas: a.paginas, status: 'fila', enviado_por: a.enviadoPor, message_id: a.messageId,
  }).select('id').single();
  if (error) throw new Error(`enfileirar: ${error.message}`);
  return (data as { id: string }).id;
}

async function baixarBase64(client: SupabaseClient, storagePath: string): Promise<string> {
  const { data, error } = await client.storage.from('financeiro-comprovantes').download(storagePath);
  if (error || !data) throw new Error(`download: ${error?.message ?? 'vazio'}`);
  return Buffer.from(await data.arrayBuffer()).toString('base64');
}

export interface TickDeps {
  client: SupabaseClient; anthropic: Anthropic;
  registrar: (from: string, e: ExtracaoLancamento, arquivoId: string) => Promise<void>;  // registrarEFalar sem mídia, com arquivo_id
  avisar: (to: string, texto: string) => Promise<void>;
  hoje: () => string;
}

// Um arquivo por tick (1 min). Lê por lotes; cada lote grava antes do próximo.
export async function tickArquivos(d: TickDeps): Promise<void> {
  const { data } = await d.client.from('financeiro_arquivos').select('id, storage_path, mime_type, paginas, paginas_ok, tentativas, enviado_por, tipo')
    .in('status', ['fila', 'erro_parcial']).lt('tentativas', MAX_TENTATIVAS).order('created_at').limit(1).maybeSingle();
  const a = data as ArquivoRow | null; if (!a) return;
  await d.client.from('financeiro_arquivos').update({ status: 'lendo', tentativas: a.tentativas + 1, updated_at: new Date().toISOString() }).eq('id', a.id);
  const to = a.enviado_por ?? '';
  let criados = 0, ok = a.paginas_ok, falhou = false;
  try {
    const base64 = await baixarBase64(d.client, a.storage_path);
    if (a.mime_type === 'application/pdf') {
      const total = a.paginas ?? (await contarPaginas(base64));
      for (const [de, ate] of planoDeLotes(total)) {
        if (de < ok) continue; // já lido em tentativa anterior
        try {
          const trecho = await recortarPaginas(base64, de, ate);
          const lista = await extrairDePdf(d.anthropic, trecho, d.hoje());
          for (const e of lista.filter((x) => x.financeiro)) { await d.registrar(to, e, a.id); criados++; }
          ok = ate + 1;
          await d.client.from('financeiro_arquivos').update({ paginas_ok: ok, lancamentos_criados: criados }).eq('id', a.id);
        } catch (err) { falhou = true; console.error(`[fin-arquivos] lote ${de}-${ate} falhou:`, (err as Error).message); }
      }
    } else {
      const lista = await extrairDeImagem(d.anthropic, base64, a.mime_type, d.hoje());
      for (const e of lista.filter((x) => x.financeiro)) { await d.registrar(to, e, a.id); criados++; }
      ok = 1;
    }
    const status = falhou ? 'erro_parcial' : 'ok';
    await d.client.from('financeiro_arquivos').update({ status, paginas_ok: ok, lancamentos_criados: criados, updated_at: new Date().toISOString() }).eq('id', a.id);
    if (to) await d.avisar(to, falhou
      ? `📄 Li ${ok} página(s) e registrei ${criados} lançamento(s); uma parte falhou — tento de novo em 1 min.`
      : `📄 Arquivo lido: ${criados} lançamento(s) registrado(s)${a.paginas ? ` em ${a.paginas} página(s)` : ''}.`);
  } catch (err) {
    await d.client.from('financeiro_arquivos').update({ status: a.tentativas + 1 >= MAX_TENTATIVAS ? 'erro' : 'erro_parcial', erro: (err as Error).message.slice(0, 500) }).eq('id', a.id);
    if (to && a.tentativas + 1 >= MAX_TENTATIVAS) await d.avisar(to, `⚠️ Não consegui ler esse arquivo (${(err as Error).message.slice(0, 80)}). Ele está guardado — me manda um print das páginas ou o CSV.`);
  }
}
```

Bucket: `comprovantes.ts` usa um bucket — conferir o nome na linha 18 e usar o mesmo em `baixarBase64` (se não for `financeiro-comprovantes`, corrigir aqui).

- [ ] **Step 5: `tryHandleFinanceiroMedia` (caixa-entrada.ts) passa a:**

```ts
export async function tryHandleFinanceiroMedia(deps: CaixaDeps, from: string,
  midia: { base64: string; mimeType: string; messageId: string }, kind: 'imagem' | 'pdf'): Promise<boolean> {
  try {
    const bytes = tamanhoBase64Bytes(midia.base64);
    const paginas = kind === 'pdf' ? await contarPaginas(midia.base64) : 1;
    if (precisaFila({ bytes, paginas, mime: midia.mimeType })) {
      await enfileirar(deps.supabase, { base64: midia.base64, mimeType: midia.mimeType, bytes, paginas, origem: 'zap', enviadoPor: from, messageId: midia.messageId, competencia: hojeBRT().slice(0, 7) });
      await deps.sendText(from, `📥 Recebi (${paginas} pág., ${(bytes / 1e6).toFixed(1)} MB). Vou ler em segundo plano e te aviso.`);
      return true;
    }
    const lista = kind === 'pdf' ? await extrairDePdf(deps.anthropic, midia.base64, hojeBRT()) : await extrairDeImagem(deps.anthropic, midia.base64, midia.mimeType, hojeBRT());
    const { lancar } = planejarCaptura(lista);
    if (lancar.length === 0) return false;
    for (let i = 0; i < lancar.length; i++) await registrarEFalar(deps, from, lancar[i], i === 0 ? midia : null);
    return true;
  } catch (err) {
    // NUNCA perde: qualquer erro → vai pra fila e o tick tenta de novo.
    console.error('[caixa-entrada] midia falhou, enfileirando:', (err as Error).message);
    try {
      await enfileirar(deps.supabase, { base64: midia.base64, mimeType: midia.mimeType, bytes: tamanhoBase64Bytes(midia.base64), paginas: 1, origem: 'zap', enviadoPor: from, messageId: midia.messageId, competencia: hojeBRT().slice(0, 7) });
      await deps.sendText(from, '📥 Guardei o arquivo; vou tentar ler em segundo plano.');
    } catch { /* storage fora: loga e segue */ }
    return true;
  }
}
```
Imports: `tamanhoBase64Bytes` de `../pdf-guard.js`; `precisaFila, contarPaginas, enfileirar` de `./arquivos-fila.js`. Também exportar `registrarEFalar` (o tick usa) e **remover** o `pdfGrandeDemais` de `extrairDePdf` no caminho da fila (a fila já recorta; manter o guard só na leitura inline).

- [ ] **Step 6: Rodar testes + tsc; commit**

```bash
git add package.json package-lock.json src/modules/financeiro/arquivos-fila.ts src/modules/financeiro/caixa-entrada.ts tests/financeiro-arquivos-fila.test.ts
git commit -m "feat(financeiro): fila de arquivos página a página (pdf-lib), nada pesado no webhook"
```

---

### Task 7: Contas a pagar + dívidas (repo) e alertas de vencimento/DAS (puro)

**Files:**
- Create: `src/modules/financeiro/contas-pagar.ts`
- Create: `src/modules/financeiro/alertas-vencimento.ts`
- Test: `tests/financeiro-alertas-vencimento.test.ts`

- [ ] **Step 1: Teste das regras**

```ts
// tests/financeiro-alertas-vencimento.test.ts
import { describe, it, expect } from 'vitest';
import { alertasDoDia, escalonarDas } from '../src/modules/financeiro/alertas-vencimento.js';

const contas = [
  { id: 'a', descricao: 'LATAM', valor: 7739, vencimento: '2026-09-01', mundo: 'PF' as const, lembretes: [] as Array<{tipo:string; em:string}> },
  { id: 'b', descricao: 'Sicoob cartão', valor: 6453.46, vencimento: '2026-09-07', mundo: 'PJ' as const, lembretes: [] },
  { id: 'c', descricao: 'DAS 08/2026', valor: 900, vencimento: '2026-09-20', mundo: 'PJ' as const, lembretes: [] },
];
describe('alertasDoDia', () => {
  it('3 dias antes avisa uma vez', () => {
    const r = alertasDoDia(contas, '2026-09-04');
    expect(r.map((x) => [x.contaId, x.tipo])).toEqual([['b', '3d']]);
  });
  it('no dia avisa', () => {
    expect(alertasDoDia(contas, '2026-09-01').map((x) => x.tipo)).toEqual(['hoje']);
  });
  it('atrasada avisa todo dia até pagar', () => {
    expect(alertasDoDia(contas, '2026-09-03')[0]).toMatchObject({ contaId: 'a', tipo: 'atraso', dias: 2 });
  });
  it('lembrete já enviado no dia não repete', () => {
    const c = [{ ...contas[1], lembretes: [{ tipo: '3d', em: '2026-09-04' }] }];
    expect(alertasDoDia(c, '2026-09-04')).toEqual([]);
  });
});
describe('escalonarDas', () => {
  it('dia 12, 18, 20 e depois todo dia', () => {
    expect(escalonarDas('2026-09-12', '2026-09-20')).toBe('previa');
    expect(escalonarDas('2026-09-18', '2026-09-20')).toBe('faltam2');
    expect(escalonarDas('2026-09-20', '2026-09-20')).toBe('hoje');
    expect(escalonarDas('2026-09-25', '2026-09-20')).toBe('atraso');
    expect(escalonarDas('2026-09-15', '2026-09-20')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar — falha**

- [ ] **Step 3: Implementar**

```ts
// src/modules/financeiro/alertas-vencimento.ts — PURO
export interface ContaAberta { id: string; descricao: string; valor: number; vencimento: string; mundo: 'PJ' | 'PF'; lembretes: Array<{ tipo: string; em: string }> }
export interface AlertaVenc { contaId: string; tipo: '3d' | 'hoje' | 'atraso'; dias: number; texto: string }
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export function alertasDoDia(contas: ContaAberta[], hojeIso: string): AlertaVenc[] {
  const out: AlertaVenc[] = [];
  for (const c of contas) {
    const d = diasEntre(hojeIso, c.vencimento); // >0 futuro, 0 hoje, <0 atrasada
    let tipo: AlertaVenc['tipo'] | null = null;
    if (d === 3) tipo = '3d'; else if (d === 0) tipo = 'hoje'; else if (d < 0) tipo = 'atraso';
    if (!tipo) continue;
    if (c.lembretes.some((l) => l.tipo === tipo && l.em === hojeIso)) continue;
    const dias = Math.abs(d);
    const texto = tipo === '3d' ? `📅 Em 3 dias: ${c.descricao} — ${brl(c.valor)} (${c.mundo}) vence ${c.vencimento.slice(8,10)}/${c.vencimento.slice(5,7)}.`
      : tipo === 'hoje' ? `🔔 VENCE HOJE: ${c.descricao} — ${brl(c.valor)} (${c.mundo}).`
      : `🔴 ATRASADA há ${dias} dia(s): ${c.descricao} — ${brl(c.valor)}. Pagou? Toca em "Paguei".`;
    out.push({ contaId: c.id, tipo, dias, texto });
  }
  return out;
}

export function escalonarDas(hojeIso: string, vencIso: string): 'previa' | 'faltam2' | 'hoje' | 'atraso' | null {
  const d = diasEntre(hojeIso, vencIso);
  if (d === 8) return 'previa'; if (d === 2) return 'faltam2'; if (d === 0) return 'hoje'; if (d < 0) return 'atraso';
  return null;
}
```

```ts
// src/modules/financeiro/contas-pagar.ts — repo
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContaAberta } from './alertas-vencimento.js';

export async function getContasAbertas(client: SupabaseClient, ateIso?: string): Promise<ContaAberta[]> {
  let q = client.from('financeiro_contas_a_pagar').select('id, descricao, valor, vencimento, mundo, lembretes').eq('status', 'aberta').order('vencimento');
  if (ateIso) q = q.lte('vencimento', ateIso);
  const { data, error } = await q; if (error) throw new Error(`getContasAbertas: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({ ...(r as ContaAberta), valor: Number(r.valor) }));
}
export async function registrarLembrete(client: SupabaseClient, contaId: string, tipo: string, emIso: string): Promise<void> {
  const { data } = await client.from('financeiro_contas_a_pagar').select('lembretes').eq('id', contaId).single();
  const lembretes = [ ...(((data as { lembretes?: unknown[] })?.lembretes) ?? []), { tipo, em: emIso } ];
  await client.from('financeiro_contas_a_pagar').update({ lembretes, updated_at: new Date().toISOString() }).eq('id', contaId);
}
export async function marcarPaga(client: SupabaseClient, contaId: string, pagoEmIso: string, lancamentoId: string | null): Promise<boolean> {
  const { data, error } = await client.from('financeiro_contas_a_pagar').update({ status: 'paga', pago_em: pagoEmIso, lancamento_id: lancamentoId, updated_at: new Date().toISOString() })
    .eq('id', contaId).eq('status', 'aberta').select('id');
  if (error) throw new Error(`marcarPaga: ${error.message}`);
  return (data ?? []).length === 1;
}
export async function criarContaPagar(client: SupabaseClient, c: { descricao: string; valor: number; vencimento: string; mundo: 'PJ'|'PF'; categoriaSlug: string; origem?: string; dividaId?: string | null }): Promise<string> {
  const { data, error } = await client.from('financeiro_contas_a_pagar').insert({ descricao: c.descricao, valor: c.valor, vencimento: c.vencimento, mundo: c.mundo, categoria_slug: c.categoriaSlug, origem: c.origem ?? 'manual', divida_id: c.dividaId ?? null }).select('id').single();
  if (error) throw new Error(`criarContaPagar: ${error.message}`);
  return (data as { id: string }).id;
}
// Gera a parcela do mês seguinte de cada dívida ativa que ainda não tem conta aberta no mês.
export async function gerarParcelasDoMes(client: SupabaseClient, competencia: string): Promise<number> {
  const { data: dividas } = await client.from('financeiro_dividas').select('id, credor, parcela, dia_vencimento, mundo, ultima_parcela').eq('ativa', true);
  let n = 0;
  for (const d of (dividas ?? []) as Array<{ id: string; credor: string; parcela: number; dia_vencimento: number; mundo: 'PJ'|'PF'; ultima_parcela: string | null }>) {
    const venc = `${competencia}-${String(d.dia_vencimento).padStart(2, '0')}`;
    if (d.ultima_parcela && venc > d.ultima_parcela) continue;
    const { data: ja } = await client.from('financeiro_contas_a_pagar').select('id').eq('divida_id', d.id).gte('vencimento', `${competencia}-01`).lte('vencimento', `${competencia}-31`).limit(1);
    if ((ja ?? []).length) continue;
    await criarContaPagar(client, { descricao: `${d.credor} — parcela`, valor: Number(d.parcela), vencimento: venc, mundo: d.mundo, categoriaSlug: 'outros', origem: 'divida', dividaId: d.id });
    n++;
  }
  return n;
}
```

- [ ] **Step 4: Rodar — passa; tsc; commit**

```bash
git add src/modules/financeiro/contas-pagar.ts src/modules/financeiro/alertas-vencimento.ts tests/financeiro-alertas-vencimento.test.ts
git commit -m "feat(financeiro): contas a pagar + dívidas + alertas de vencimento/DAS (puro)"
```

---

### Task 8: Seed de setembro/2026 (migration 110)

**Files:**
- Create: `supabase/migrations/110_financeiro_seed_setembro_2026.sql`

- [ ] **Step 1: Escrever (valores de `Documents\EcoSunPower\Financeiro\base\dicionario-favorecidos.yaml`, `base\dividas.md`, `2026-09\PROJECAO-SETEMBRO-2026.md`)**

```sql
-- 110: carga inicial — favorecidos conhecidos, dívidas, contas de set/26, pró-labore.
-- Dados confirmados pelo Junior em 29/08/2026 (Financeiro\base\*). Idempotente por ON CONFLICT/where not exists.

-- pró-labore 7.000 (regra dura)
UPDATE financeiro_parametros SET pro_labore_mensal = 7000, updated_at = now() WHERE id = 1;

-- favorecidos (padrões em minúsculo, sem acento)
INSERT INTO financeiro_favorecidos (nome, doc_mascarado, padroes, categoria_slug, mundo_padrao, tipo_padrao, observacao) VALUES
 ('Jonnata (filho — mão de obra)', '***.969.561-**', '{jonnata,969.561}', 'mao_de_obra', 'PJ', 'despesa', 'quando ENVIA dinheiro = parte dos 1.900 do Honda'),
 ('Janderson (mão de obra)', '***.442.321-**', '{janderson,442.321}', 'mao_de_obra', 'PJ', 'despesa', NULL),
 ('Kelvyn (ajudante)', '***.680.951-**', '{kelvyn,680.951}', 'mao_de_obra', 'PJ', 'despesa', NULL),
 ('Lucas Rodrigues Leite (prestador)', '***.494.557-**', '{lucas rodrigues,494.557}', 'mao_de_obra', 'PJ', 'despesa', NULL),
 ('Adelio (oficina/pneus)', '***.789.501-**', '{adelio,789.501}', 'veiculo_manutencao', 'PJ', 'despesa', NULL),
 ('Junior (proprietário)', '***.404.571-**', '{404.571,antonio candido}', 'pro_labore', 'FRONTEIRA', NULL, 'PJ→PF: pró-labore dia 5; outro valor = fronteira a classificar'),
 ('Edilene (sócia)', '***.119.741-**', '{edilene,119.741}', 'outros', 'FRONTEIRA', 'entrada', 'aporte de sócio — não é receita'),
 ('Antonio Teodoro Martins (porta da loja)', '***.382.943-**', '{antonio teodoro,382.943}', 'outros', 'PJ', 'despesa', 'benfeitoria escritório'),
 ('CFT — taxa de TRT', '32.489.209/0001-57', '{32.489.209,conselho regional dos tecnic}', 'outros', 'PJ', 'despesa', '68,17 por projeto'),
 ('Belenus', '05.151.518/0001-40', '{belenus,05.151.518}', 'equipamento_kit', 'PJ', 'despesa', NULL),
 ('Sol Fácil', '01.855.226/0001-37', '{solfacil,sol facil,01.855.226}', 'outros', 'PJ', NULL, 'TED recebido = repasse de serviço; QR pago = kit'),
 ('Superbom', '08.616.988/0001-20', '{superbom,08.616.988}', 'outros', 'PJ', 'entrada', 'limpeza/O&M'),
 ('Spazio Verde', '13.245.160/0001-42', '{spazio verde,13.245.160}', 'outros', 'PJ', 'entrada', NULL),
 ('Wash Box', '64.101.578/0001-17', '{wash box,64.101.578}', 'outros', 'PJ', 'entrada', NULL),
 ('JP S Contábeis (Edimilson)', '40.255.214/0001-23', '{jp s contabeis,40.255.214}', 'outros', 'PJ', 'entrada', 'cliente Edimilson paga pela contábil'),
 ('Agape e Solar (Santana)', '31.362.565/0001-42', '{agape,31.362.565}', 'outros', 'PJ', 'entrada', 'projetos p/ parceiro; permutas'),
 ('Oficina Montana', '10.198.309/0001-91', '{10.198.309}', 'veiculo_manutencao', 'PJ', 'despesa', NULL),
 ('Porto Seguro Saúde', '04.540.010/0001-70', '{porto seguro}', 'outros', 'PJ', 'despesa', 'plano de saúde 1.491'),
 ('Vivo', '02.558.157/0001-62', '{vivo}', 'outros', 'PJ', 'despesa', 'telefone ~499'),
 ('Meu Contador Online', NULL, '{meu cont onl,meu contador}', 'outros', 'PJ', 'despesa', '329/mês'),
 ('Meta Ads', NULL, '{facebk,meta ads,facebook}', 'marketing_ads', 'PJ', 'despesa', NULL),
 ('Anthropic / Claude', NULL, '{anthropic,claude}', 'software_assinatura', 'PJ', 'despesa', NULL),
 ('Supabase', NULL, '{supabase}', 'software_assinatura', 'PJ', 'despesa', NULL),
 ('Postos (combustível)', NULL, '{posto,cascol,brasal,combust}', 'combustivel', 'PJ', 'despesa', NULL),
 ('DF Atacadista', NULL, '{df atacadista}', 'material_eletrico', 'PJ', 'despesa', NULL),
 ('Eletrogomes', NULL, '{eletrogomes}', 'material_eletrico', 'PJ', 'despesa', NULL),
 ('Itaú Autobank (Honda Jonnata)', NULL, '{financ veic,autobank}', 'outros', 'PF', 'despesa', '3.929,25 ×45; Jonnata devolve 1.900')
ON CONFLICT DO NOTHING;

-- dívidas
INSERT INTO financeiro_dividas (credor, contrato, mundo, saldo_ref, parcela, dia_vencimento, ultima_parcela, taxa_mensal, garantia, observacao) VALUES
 ('Itaú PJ renegociação', '004924073150', 'PJ', 28665.24, 1964.04, 24, '2028-08-17', 0.046, NULL, 'se atrasar volta a dívida antiga a 16%/mês'),
 ('Santander PJ empréstimo', '300000023850', 'PJ', 8460, 468, 29, '2028-01-29', NULL, NULL, '18 parcelas restantes'),
 ('Honda Jonnata — Itaú Autobank', '19452341', 'PF', 115604.76, 3929.25, 14, '2030-05-14', 0.0203, 'Honda', 'Jonnata devolve 1.900/mês'),
 ('CAP PIC (capitalização)', NULL, 'PF', 6338, 140.85, 30, '2030-05-30', 0, NULL, 'avaliar resgate');

-- contas a pagar de setembro/2026 (fixas e faturas conhecidas)
INSERT INTO financeiro_contas_a_pagar (descricao, valor, vencimento, mundo, categoria_slug, origem) VALUES
 ('DAS julho/2026 (ATRASADO — reemitir PGDAS-D)', 888, '2026-08-29', 'PJ', 'imposto_das', 'seed'),
 ('LATAM Black — fatura', 7738.58, '2026-09-01', 'PF', 'outros', 'seed'),
 ('Pró-labore Junior', 7000, '2026-09-05', 'PJ', 'pro_labore', 'seed'),
 ('Sicoob cartão — fatura (déb. aut.)', 6453.46, '2026-09-07', 'PJ', 'outros', 'seed'),
 ('Mercado Pago — fatura', 1703.13, '2026-09-10', 'PF', 'outros', 'seed'),
 ('Porto Seguro saúde', 1491.17, '2026-09-10', 'PJ', 'outros', 'seed'),
 ('Vivo', 499.44, '2026-09-10', 'PJ', 'outros', 'seed'),
 ('Visa Empresa Itaú — fatura (déb. aut.)', 5486.25, '2026-09-12', 'PJ', 'outros', 'seed'),
 ('DAS agosto/2026 (estimado ~8,5% do notado)', 2550, '2026-09-20', 'PJ', 'imposto_das', 'seed'),
 ('Spazio Verde — 2ª nota (emitir)', 0.01, '2026-09-23', 'PJ', 'outros', 'seed'),
 ('Meu Contador Online', 329, '2026-09-30', 'PJ', 'outros', 'seed');
-- (parcelas Itaú 24/09, Santander 29/09, Honda 14/09, CAP 30/09 nascem de gerarParcelasDoMes('2026-09'))

-- a receber de setembro (tabela existente financeiro_contas_a_receber, sem fechamento)
INSERT INTO financeiro_contas_a_receber (descricao, valor, status, created_by) VALUES
 ('Hudson — serviço (instala 02/09)', 3633.00, 'pendente', 'seed'),
 ('Nelson — serviço na instalação', 4140.59, 'pendente', 'seed'),
 ('Udson — serviço 1/2 (conclusão)', 2064.41, 'pendente', 'seed'),
 ('Udson — serviço 2/2 (+30 d)', 2064.41, 'pendente', 'seed'),
 ('Maria — manutenção', 4800.00, 'pendente', 'seed'),
 ('NR Consultoria — receita EcoSun', 2500.00, 'pendente', 'seed'),
 ('Socorro — parcela final (~28/09)', 3938.92, 'pendente', 'seed'),
 ('Spazio Verde — 2ª parcela (23/09)', 1250.00, 'pendente', 'seed'),
 ('Paulo Aguiar — limpeza Taguatinga', 1000.00, 'pendente', 'seed'),
 ('Superbom — 2ª parcela pacotão (out)', 19995.00, 'pendente', 'seed'),
 ('Wash Box Gabriel — serviço (após reposição)', 7000.00, 'pendente', 'seed'),
 ('Gerador Embaixada Angola — corretiva 3.490 (50/50)', 3490.00, 'pendente', 'seed');
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/110_financeiro_seed_setembro_2026.sql
git commit -m "feat(financeiro): seed set/26 — favorecidos, dívidas, contas a pagar/receber, pró-labore 7.000"
```

---

### Task 9: Tick de alertas + botão "Paguei" + `/caixa`

**Files:**
- Create: `src/modules/financeiro/comando-caixa.ts`
- Create: `src/modules/financeiro/tick-vencimentos.ts`
- Modify: `src/index.ts`
- Test: `tests/financeiro-comando-caixa.test.ts`

- [ ] **Step 1: Teste do texto de `/caixa`**

```ts
// tests/financeiro-comando-caixa.test.ts
import { describe, it, expect } from 'vitest';
import { montarCaixa } from '../src/modules/financeiro/comando-caixa.js';

describe('montarCaixa', () => {
  it('lista a pagar 7 dias, a receber, hoje e sem dono', () => {
    const t = montarCaixa({
      hojeIso: '2026-09-01',
      aPagar7d: [{ descricao: 'LATAM', valor: 7738.58, vencimento: '2026-09-01', mundo: 'PF' }],
      aReceber: [{ descricao: 'Hudson', valor: 3633 }],
      hoje: { entradas: 0, saidas: 1200, n: 2 },
      semDono: 3,
    });
    expect(t).toContain('A PAGAR até 08/09');
    expect(t).toContain('LATAM — R$ 7.738,58 (PF) 01/09');
    expect(t).toContain('A RECEBER: R$ 3.633,00');
    expect(t).toContain('3 lançamento(s) sem dono');
  });
});
```

- [ ] **Step 2: Implementar `comando-caixa.ts`**

```ts
// src/modules/financeiro/comando-caixa.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getContasAbertas } from './contas-pagar.js';
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function montarCaixa(d: {
  hojeIso: string;
  aPagar7d: Array<{ descricao: string; valor: number; vencimento: string; mundo: 'PJ' | 'PF' }>;
  aReceber: Array<{ descricao: string; valor: number }>;
  hoje: { entradas: number; saidas: number; n: number };
  semDono: number;
}): string {
  const ate = new Date(Date.parse(d.hojeIso) + 7 * 86_400_000).toISOString().slice(0, 10);
  const totPagar = d.aPagar7d.reduce((s, c) => s + c.valor, 0);
  const totReceber = d.aReceber.reduce((s, c) => s + c.valor, 0);
  const linhas = [
    `💼 *Caixa — ${dBR(d.hojeIso)}*`,
    `\n📤 A PAGAR até ${dBR(ate)}: ${brl(totPagar)}`,
    ...d.aPagar7d.map((c) => `• ${c.descricao} — ${brl(c.valor)} (${c.mundo}) ${dBR(c.vencimento)}`),
    `\n📥 A RECEBER: ${brl(totReceber)}`,
    ...d.aReceber.slice(0, 8).map((c) => `• ${c.descricao} — ${brl(c.valor)}`),
    `\n📆 Hoje: ${d.hoje.n} lançamento(s) · entrou ${brl(d.hoje.entradas)} · saiu ${brl(d.hoje.saidas)}`,
  ];
  if (d.semDono > 0) linhas.push(`\n❓ ${d.semDono} lançamento(s) sem dono — te pergunto na segunda.`);
  return linhas.join('\n');
}

export function makeCaixaHandler(deps: { client: SupabaseClient; isAdminPhone: (p: string) => boolean; sendText: (to: string, t: string) => Promise<void>; hoje: () => string }) {
  return async function tryHandleCaixaCommand(from: string, text: string): Promise<boolean> {
    if (!deps.isAdminPhone(from)) return false;
    if (!/^\/?(caixa|contas)\s*$/i.test(text.trim())) return false;
    const hojeIso = deps.hoje();
    const ate = new Date(Date.parse(hojeIso) + 7 * 86_400_000).toISOString().slice(0, 10);
    const aPagar7d = await getContasAbertas(deps.client, ate);
    const { data: rec } = await deps.client.from('financeiro_contas_a_receber').select('descricao, valor, valor_recebido').in('status', ['pendente', 'recebido_parcial']).order('created_at');
    const aReceber = (rec ?? []).map((r: { descricao: string | null; valor: number; valor_recebido: number }) => ({ descricao: r.descricao ?? 'sem descrição', valor: Number(r.valor) - Number(r.valor_recebido) }));
    const { data: hj } = await deps.client.from('financeiro_lancamentos').select('tipo, valor').eq('status', 'confirmado').eq('data_evento', hojeIso);
    const hoje = { n: (hj ?? []).length, entradas: 0, saidas: 0 };
    for (const l of (hj ?? []) as Array<{ tipo: string; valor: number }>) { if (l.tipo === 'entrada') hoje.entradas += Number(l.valor); else hoje.saidas += Number(l.valor); }
    const { count } = await deps.client.from('financeiro_lancamentos').select('id', { count: 'exact', head: true }).eq('status', 'confirmado').is('favorecido_id', null).in('confianca', ['baixa', 'pendente']).gte('data_evento', hojeIso.slice(0, 8) + '01');
    await deps.sendText(from, montarCaixa({ hojeIso, aPagar7d: aPagar7d.map((c) => ({ descricao: c.descricao, valor: c.valor, vencimento: c.vencimento, mundo: c.mundo })), aReceber, hoje, semDono: count ?? 0 }));
    return true;
  };
}
```

- [ ] **Step 3: Implementar `tick-vencimentos.ts`**

```ts
// src/modules/financeiro/tick-vencimentos.ts
// Diário 8h (BRT): alertas de contas a pagar (3d / hoje / atraso) e DAS escalonado. Botão "Paguei".
import type { SupabaseClient } from '@supabase/supabase-js';
import { getContasAbertas, registrarLembrete, gerarParcelasDoMes } from './contas-pagar.js';
import { alertasDoDia, escalonarDas } from './alertas-vencimento.js';

export interface TickVencDeps {
  client: SupabaseClient; adminPhone: string; hoje: () => string;
  enviarComBotoes: (to: string, body: string, buttons: Array<{ id: string; title: string }>, footer?: string) => Promise<void>;
}
export function dentroDaJanela8h(agora: Date): boolean { const h = (agora.getUTCHours() + 21) % 24; return h === 8; }

export async function tickVencimentos(d: TickVencDeps, agora = new Date()): Promise<void> {
  if (!dentroDaJanela8h(agora)) return;
  const hoje = d.hoje();
  if (hoje.endsWith('-01') || hoje.endsWith('-02')) await gerarParcelasDoMes(d.client, hoje.slice(0, 7));
  const contas = await getContasAbertas(d.client);
  for (const a of alertasDoDia(contas, hoje)) {
    const c = contas.find((x) => x.id === a.contaId)!;
    const ehDas = /DAS/i.test(c.descricao);
    let texto = a.texto;
    if (ehDas) {
      const fase = escalonarDas(hoje, c.vencimento);
      if (fase === 'atraso') texto = `🔴🔴 DAS ATRASADO há ${a.dias} dia(s): ${c.descricao}. Multa 0,33 %/dia. Emite guia nova no PGDAS-D e paga HOJE.`;
    }
    await d.enviarComBotoes(d.adminPhone, texto, [{ id: `finpg:paguei:${c.id}`, title: 'Paguei' }, { id: `finpg:ver:${c.id}`, title: 'Ver depois' }], 'Financeiro · vencimentos');
    await registrarLembrete(d.client, c.id, a.tipo, hoje);
  }
  // DAS prévia (dia 12) e faltam-2 (dia 18) — fora da regra 3d/hoje
  for (const c of contas.filter((x) => /DAS/i.test(x.descricao))) {
    const fase = escalonarDas(hoje, c.vencimento);
    if ((fase === 'previa' || fase === 'faltam2') && !c.lembretes.some((l) => l.tipo === fase)) {
      await d.enviarComBotoes(d.adminPhone, fase === 'previa'
        ? `📅 DAS ${c.descricao}: vence ${c.vencimento.slice(8,10)}/${c.vencimento.slice(5,7)} — previsto ${c.valor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}. Já separou?`
        : `⏰ Faltam 2 dias pro DAS (${c.valor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}).`,
        [{ id: `finpg:noop:0`, title: 'OK' }], 'Financeiro · DAS');
      await registrarLembrete(d.client, c.id, fase, hoje);
    }
  }
}
```

- [ ] **Step 4: Engates em `src/index.ts`**

(1) Junto das outras factories (~linha 971-975):
```ts
const { makeCaixaHandler } = await import('./modules/financeiro/comando-caixa.js');
const tryHandleCaixaCommand = makeCaixaHandler({ client: supabase.getClient(), isAdminPhone, sendText, hoje: () => new Date(Date.now() - 3*3600e3).toISOString().slice(0,10) });
```
e na cascata de `handleTextMessage`, logo antes do bloco `relatório [mês]` (~linha 4406): `if (await tryHandleCaixaCommand(from, text)) return;`

(2) Botão `finpg:` — logo após o bloco `finlan:` (~linha 4043):
```ts
if (isAdminPhone(from) && text.trim().startsWith('finpg:')) {
  const [, acao, id] = text.trim().split(':');
  if (acao === 'paguei') {
    const { marcarPaga } = await import('./modules/financeiro/contas-pagar.js');
    const ok = await marcarPaga(supabase.getClient(), id, new Date(Date.now() - 3*3600e3).toISOString().slice(0,10), null);
    await sendText(from, ok ? '✅ Marcado como pago.' : 'Essa conta já não estava aberta.');
  }
  return;
}
```

(3) `getCaixaDeps` (linha 1062) ganha `sendWithButtons: (to, body, buttons, footer) => sendAdminWithButtons({ metaWaba, sendText }, to, body, buttons, footer)` e o campo `waba` sai.

(4) Mídia: nas linhas 6003 e 6216 trocar `if (isAdminPhone(from) && metaWaba)` por `if (isAdminPhone(from))` e `if (isAdminPhone(from) && metaWaba && mimetype.includes('pdf'))` por `if (isAdminPhone(from) && mimetype.includes('pdf'))`.

(5) Ticks, junto do cron de alertas financeiros (~linha 10310):
```ts
const { tickArquivos } = await import('./modules/financeiro/arquivos-fila.js');
const { registrarEFalar } = await import('./modules/financeiro/caixa-entrada.js');
const tickFinArquivos = async () => { try {
  await tickArquivos({ client: supabase.getClient(), anthropic, hoje: () => new Date(Date.now() - 3*3600e3).toISOString().slice(0,10),
    registrar: (from, e, arquivoId) => registrarEFalar(getCaixaDeps(), from, { ...e }, null, undefined, arquivoId),
    avisar: (to, t) => sendText(to, t) });
} catch (err) { console.error('[fin-arquivos] tick falhou:', (err as Error).message); } };
setTimeout(() => { void tickFinArquivos(); }, 2 * 60 * 1000);
setInterval(() => { void tickFinArquivos(); }, 60 * 1000);

const { tickVencimentos } = await import('./modules/financeiro/tick-vencimentos.js');
const tickFinVenc = async () => { try {
  await tickVencimentos({ client: supabase.getClient(), adminPhone: config.engineerPhone, hoje: () => new Date(Date.now() - 3*3600e3).toISOString().slice(0,10),
    enviarComBotoes: (to, body, buttons, footer) => sendAdminWithButtons({ metaWaba, sendText }, to, body, buttons, footer) });
} catch (err) { console.error('[fin-vencimentos] tick falhou:', (err as Error).message); } };
setTimeout(() => { void tickFinVenc(); }, 3 * 60 * 1000);
setInterval(() => { void tickFinVenc(); }, 60 * 60 * 1000);
```
`registrarEFalar` recebe um 6º parâmetro opcional `arquivoId: string | null` que vai em `arquivoId` do `criarConfirmado` (ajustar assinatura na Task 5).

- [ ] **Step 5: `npx tsc --noEmit` + `npx vitest run`; commit**

```bash
git add src/index.ts src/modules/financeiro/comando-caixa.ts src/modules/financeiro/tick-vencimentos.ts tests/financeiro-comando-caixa.test.ts
git commit -m "feat(financeiro): /caixa, tick de vencimentos com botão Paguei, fila de arquivos ligada"
```

---

### Task 10: Resumo semanal com perguntas agrupadas

**Files:**
- Create: `src/modules/financeiro/resumo-semanal.ts`
- Modify: `src/index.ts` (tick segunda 8h)
- Test: `tests/financeiro-resumo-semanal.test.ts`

- [ ] **Step 1: Teste**

```ts
// tests/financeiro-resumo-semanal.test.ts
import { describe, it, expect } from 'vitest';
import { agruparSemDono, montarPerguntas } from '../src/modules/financeiro/resumo-semanal.js';

const rows = [
  { id: '1', contraparte: 'Pix ***.320.641-**', valor: 50, data_evento: '2026-09-02', tipo: 'despesa' as const },
  { id: '2', contraparte: 'Pix ***.320.641-**', valor: 200, data_evento: '2026-09-04', tipo: 'despesa' as const },
  { id: '3', contraparte: 'Mix Madeiras', valor: 560, data_evento: '2026-09-03', tipo: 'despesa' as const },
];
describe('agruparSemDono', () => {
  it('agrupa por contraparte normalizada, soma e conta', () => {
    const g = agruparSemDono(rows);
    expect(g[0]).toMatchObject({ chave: 'pix ***.320.641-**', total: 250, n: 2 });
    expect(g[1]).toMatchObject({ chave: 'mix madeiras', total: 560, n: 1 });
  });
});
describe('montarPerguntas', () => {
  it('uma pergunta por grupo, máx 5, com botões de tipo', () => {
    const msgs = montarPerguntas(agruparSemDono(rows));
    expect(msgs).toHaveLength(2);
    expect(msgs[0].body).toContain('2 pagamento(s), total R$ 250,00');
    expect(msgs[0].buttons.map((b) => b.id)).toEqual(['finfav:mo:1', 'finfav:mat:1', 'finfav:pf:1']);
  });
});
```

- [ ] **Step 2: Implementar**

```ts
// src/modules/financeiro/resumo-semanal.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizarTexto, aprenderFavorecido, getFavorecidos } from './favorecidos.js';
import { getSemDono, definirFavorecido, getCategorias } from './lancamentos-repo.js';
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export interface Grupo { chave: string; exemploId: string; ids: string[]; total: number; n: number; contraparte: string }
export function agruparSemDono(rows: Array<{ id: string; contraparte: string | null; valor: number; data_evento: string; tipo: 'despesa' | 'entrada' }>): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const r of rows) {
    const chave = normalizarTexto(r.contraparte) || 'sem descrição';
    const g = m.get(chave) ?? { chave, exemploId: r.id, ids: [], total: 0, n: 0, contraparte: r.contraparte ?? 'sem descrição' };
    g.ids.push(r.id); g.total += Number(r.valor); g.n++; m.set(chave, g);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}
export function montarPerguntas(grupos: Grupo[]): Array<{ body: string; buttons: Array<{ id: string; title: string }> }> {
  return grupos.slice(0, 5).map((g) => ({
    body: `❓ *${g.contraparte}*: ${g.n} pagamento(s), total ${brl(g.total)}. Isso é:`,
    buttons: [{ id: `finfav:mo:${g.exemploId}`, title: 'Mão de obra' }, { id: `finfav:mat:${g.exemploId}`, title: 'Material' }, { id: `finfav:pf:${g.exemploId}`, title: 'Pessoal (PF)' }],
  }));
}
export function ehSegunda8h(agora: Date): boolean { const brt = new Date(agora.getTime() - 3 * 3600e3); return brt.getUTCDay() === 1 && brt.getUTCHours() === 8; }

export async function tickResumoSemanal(d: { client: SupabaseClient; adminPhone: string; enviarComBotoes: (to: string, body: string, b: Array<{ id: string; title: string }>, f?: string) => Promise<void>; sendText: (to: string, t: string) => Promise<void>; hoje: () => string }, agora = new Date()): Promise<void> {
  if (!ehSegunda8h(agora)) return;
  const hoje = d.hoje(); const de = new Date(Date.parse(hoje) - 7 * 86_400_000).toISOString().slice(0, 10);
  const rows = await getSemDono(d.client, de, hoje);
  const grupos = agruparSemDono(rows);
  await d.sendText(d.adminPhone, `📊 Semana ${de.slice(8,10)}/${de.slice(5,7)}–${hoje.slice(8,10)}/${hoje.slice(5,7)}: ${rows.length} lançamento(s) sem dono (${brl(rows.reduce((s, r) => s + Number(r.valor), 0))}). Me ajuda com os maiores:`);
  for (const m of montarPerguntas(grupos)) await d.enviarComBotoes(d.adminPhone, m.body, m.buttons, 'Financeiro · semanal');
}

// Botão finfav:<mo|mat|pf>:<lancamentoId> → aprende favorecido e aplica a TODOS com a mesma contraparte.
export async function responderFavorecido(client: SupabaseClient, acao: 'mo' | 'mat' | 'pf', lancamentoId: string): Promise<number> {
  const { data: l } = await client.from('financeiro_lancamentos').select('contraparte').eq('id', lancamentoId).single();
  const contraparte = (l as { contraparte: string | null } | null)?.contraparte; if (!contraparte) return 0;
  const cats = await getCategorias(client);
  const slug = acao === 'mo' ? 'mao_de_obra' : acao === 'mat' ? 'material_eletrico' : 'outros';
  const mundo = acao === 'pf' ? 'PF' : 'PJ';
  const favId = await aprenderFavorecido(client, { nome: contraparte, padroes: [contraparte], categoria_slug: slug, mundo_padrao: mundo, tipo_padrao: 'despesa' });
  const { data: iguais } = await client.from('financeiro_lancamentos').select('id').is('favorecido_id', null).ilike('contraparte', contraparte);
  const catId = cats.find((c) => c.slug === slug)?.id ?? null;
  for (const r of (iguais ?? []) as Array<{ id: string }>) await definirFavorecido(client, r.id, favId, mundo, catId);
  void getFavorecidos; return (iguais ?? []).length;
}
```

- [ ] **Step 3: Engate em `index.ts`** — botão `finfav:` (após `finpg:`):
```ts
if (isAdminPhone(from) && text.trim().startsWith('finfav:')) {
  const [, acao, id] = text.trim().split(':');
  const { responderFavorecido } = await import('./modules/financeiro/resumo-semanal.js');
  const n = await responderFavorecido(supabase.getClient(), acao as 'mo'|'mat'|'pf', id);
  await sendText(from, `👍 Aprendi. Apliquei em ${n} lançamento(s); não pergunto mais.`);
  return;
}
```
e o tick horário: `tickResumoSemanal({ client: supabase.getClient(), adminPhone: config.engineerPhone, enviarComBotoes: ..., sendText, hoje })` com `setInterval` de 60 min (mesmo padrão do `tickFinVenc`).

- [ ] **Step 4: Testes + tsc; commit**

```bash
git add src/modules/financeiro/resumo-semanal.ts src/index.ts tests/financeiro-resumo-semanal.test.ts
git commit -m "feat(financeiro): resumo semanal com perguntas agrupadas por favorecido + botão aprender"
```

---

### Task 11: Fechamento da fatia — verificação, docs, entrega

- [ ] **Step 1:** `npx vitest run` → só as 2 falhas conhecidas; `npx tsc --noEmit` → limpo; `npm run build` → ok.
- [ ] **Step 2:** Atualizar `docs/superpowers/specs/2026-08-29-modulo-financeiro-pj-pf-design.md` §9 marcando a Fatia 1 como implementada e listando o que ficou pra 2/3 (importadores de extrato, tela, conciliação).
- [ ] **Step 3:** Escrever `Documents\EcoSunPower\Financeiro\COMO-USAR-EVA-FINANCEIRO.md` (5 linhas: o que mandar, `/caixa`, botões, o que a Eva pergunta na segunda).
- [ ] **Step 4:** Branch `feat/financeiro-sem-trava`, PR com: migrations 109+110 a aplicar **na ordem** no SQL Editor antes do Implantar (avisar o Junior — regra da casa: push só com OK dele; entregar o comando de merge na mesma mensagem).

---

## Self-review (feito ao escrever)

- **Cobertura da spec (Fatia 1):** nunca trava (T5/T6) · PJ/PF/FRONTEIRA (T1/T3) · dicionário que aprende (T2/T10) · contas a pagar/receber de setembro (T7/T8) · dívidas geram parcelas (T7) · alertas 3d/hoje/atraso + DAS escalonado até comprovante (T7/T9) · arquivos grandes em fila página a página (T6) · pró-labore 7.000 como regra (T8 + alerta dia 5 vem da conta seed) · botões com fallback texto (T5/T9). Fora da fatia (por desenho): importadores de extrato, tela, conciliação, DAS real × estimado, `/fechar` automático.
- **Consistência de nomes:** `criarConfirmado`, `registrarEFalar`, `classificar`, `casarFavorecido`, `getSemDono`, `definirFavorecido`, `enfileirar`, `tickArquivos`, `getContasAbertas`, `marcarPaga`, `gerarParcelasDoMes`, `alertasDoDia`, `escalonarDas`, `montarRegistrado`, `montarCaixa`, `tickVencimentos`, `tickResumoSemanal`, `responderFavorecido` — usados com a mesma assinatura em todas as tasks.
- **Placeholders:** nenhum; o único ponto a conferir no código real é o nome do bucket em `comprovantes.ts:18` (T6 Step 4).
