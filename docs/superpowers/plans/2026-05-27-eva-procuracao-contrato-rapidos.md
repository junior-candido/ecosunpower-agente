# Eva — Procuração e Contrato rápidos via WhatsApp — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir Junior disparar `procuracao <cliente>` ou `contrato <cliente>` no zap, gerando Google Doc na pasta do cliente no Drive (eSignature-ready), com coleta mínima de dados. `fechar <cliente>` continua existindo e ganha botões `[Procuração] [Contrato] [Ambos]`.

**Architecture:** Reuso máximo de `src/modules/closing/`. Validador filtra campos por `docs_pedidos`. Render adiciona path HTML→Google Doc (via upload com `mimeType=text/html`, auto-conversão Drive). PDF continua sendo gerado e subido como backup. Bônus: get-or-create de lead em `savePropostaPublica` resolve o bug Fase 1 (Fernanda invisível).

**Tech Stack:** TypeScript 5.x · Vitest · Supabase (Postgres) · Google Drive API v3 (googleapis) · Anthropic SDK (Sonnet 4.6) · IORedis · WhatsApp Cloud API (Meta).

**Spec:** `docs/superpowers/specs/2026-05-27-eva-procuracao-contrato-rapidos-design.md`

---

## File Structure

### Novos
- `supabase/migrations/041_propostas_publicas_lead_id.sql` — coluna FK lead_id
- `supabase/migrations/042_fechamentos_parent_id.sql` — coluna FK parent_id pra rastrear [Refazer]
- `src/modules/closing/closing-html-uploader.ts` — função pura `uploadHtmlAsGoogleDoc`
- `tests/closing-html-uploader.test.ts`
- `tests/supabase-getOrCreateLeadByPhone.test.ts`
- `tests/closing-command-aliases.test.ts`

### Modificados
- `src/modules/closing/types.ts` — `parent_id` em `FechamentoRow`; `disposicoes_especiais` continua opcional mas será coletado explícito
- `src/modules/closing/closing-validator.ts` — `findMissingRequired` filtra por `docs_pedidos`; novo label `disposicoes_especiais` em humanize
- `src/modules/closing/closing-assistant.ts` — fluxo `awaiting_disposicoes` antes do `awaiting_confirm` no modo contrato/ambos
- `src/modules/closing/closing-drive.ts` — `uploadFechamento` aceita HTML e sobe Doc + PDF
- `src/modules/closing/closing-persist.ts` — `createFechamento({ parentId })`
- `src/modules/closing/templates/procuracao.html.ts` — modelo Fernanda (12 meses, 1 página)
- `src/modules/closing/index.ts` — exporta `uploadHtmlAsGoogleDoc`, novo tipo `ClosingDocMode`
- `src/prompts/closing-system.md` — bloco "pergunta cláusula 23 explícita; não invente conteúdo"
- `src/modules/supabase.ts` — helper `getOrCreateLeadByPhone`; `savePropostaPublica` chama o helper e linka `lead_id`
- `src/index.ts` — parser de comando aceita `procuracao|contrato|fechar`; novo handler dos botões `evabt:fechar-doc:*`; `handleFecharStart` aceita `docsPedidos` parâmetro

### Tests existentes a expandir
- `tests/closing-validator.test.ts`
- `tests/closing-templates-procuracao.test.ts`
- `tests/closing-persist.test.ts`
- `tests/closing-drive.test.ts`
- `tests/closing-assistant.test.ts`
- `tests/closing-e2e.test.ts`

---

## Phase 1 — Migrations SQL (Junior aplica manual)

### Task 1: Migration 041 — `propostas_publicas.lead_id`

**Files:**
- Create: `supabase/migrations/041_propostas_publicas_lead_id.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/041_propostas_publicas_lead_id.sql
-- Cria FK propostas_publicas.lead_id pra vincular proposta ao lead correspondente.
-- Resolve bug Fase 1 do /fechar (Fernanda invisivel — proposta sem lead).
-- Veja docs/superpowers/specs/2026-05-27-eva-procuracao-contrato-rapidos-design.md secao 5.2

ALTER TABLE propostas_publicas
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_propostas_publicas_lead
  ON propostas_publicas(lead_id, created_at DESC);

COMMENT ON COLUMN propostas_publicas.lead_id IS
  'FK opcional pro lead criado/vinculado quando a proposta foi gerada. Backfill em 041_backfill.sql roda 1x.';
```

- [ ] **Step 2: Escrever script de backfill separado (documentação)**

Cria: `supabase/migrations/041b_backfill_propostas_publicas_lead_id.sql`

```sql
-- supabase/migrations/041b_backfill_propostas_publicas_lead_id.sql
-- ATENCAO: rodar UMA UNICA VEZ apos 041 ser aplicada.
-- Vincula propostas existentes ao lead pelo telefone normalizado.
-- Propostas sem telefone (caso Fernanda) ficam orfas ate primeira execucao
-- de /procuracao ou /contrato pra aquele cliente.

UPDATE propostas_publicas pp
SET lead_id = l.id
FROM leads l
WHERE pp.lead_id IS NULL
  AND l.phone = pp.cliente_telefone
  AND pp.cliente_telefone IS NOT NULL;

-- Verificacao (rodar separado pra conferir resultado):
-- SELECT count(*) FILTER (WHERE lead_id IS NOT NULL) AS linkadas,
--        count(*) FILTER (WHERE lead_id IS NULL) AS orfas
-- FROM propostas_publicas;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/041_propostas_publicas_lead_id.sql supabase/migrations/041b_backfill_propostas_publicas_lead_id.sql
git commit -m "feat(closing): migration 041 propostas_publicas.lead_id + backfill"
```

- [ ] **Step 4: ATENÇÃO — Junior aplica manual no SQL Editor**

NÃO RODAR via MCP supabase (aponta pra projeto errado, ver memória `reference_supabase_mcp_mismatch`).

Junior copia o conteúdo de `041_propostas_publicas_lead_id.sql` no SQL Editor do projeto `kupnsoyymulbdzakqlqc` e roda. Depois copia o `041b_backfill_propostas_publicas_lead_id.sql` e roda. Confirma com:

```sql
SELECT count(*) FILTER (WHERE lead_id IS NOT NULL) AS linkadas,
       count(*) FILTER (WHERE lead_id IS NULL) AS orfas
FROM propostas_publicas;
```

Apenas marca a step como completa após confirmação visual do Junior.

---

### Task 2: Migration 042 — `fechamentos.parent_id`

**Files:**
- Create: `supabase/migrations/042_fechamentos_parent_id.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/042_fechamentos_parent_id.sql
-- Adiciona coluna parent_id pra rastrear versoes geradas via [Refazer].
-- v1=parent_id null. v2 aponta pra v1, v3 pra v2, etc.

ALTER TABLE fechamentos
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES fechamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fechamentos_parent
  ON fechamentos(parent_id);

COMMENT ON COLUMN fechamentos.parent_id IS
  'FK opcional pro fechamento anterior em caso de [Refazer]. Permite rastrear historico de versoes.';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/042_fechamentos_parent_id.sql
git commit -m "feat(closing): migration 042 fechamentos.parent_id"
```

- [ ] **Step 3: ATENÇÃO — Junior aplica manual no SQL Editor**

Mesmo procedimento da Task 1. Roda no Supabase prod `kupnsoyymulbdzakqlqc`.

---

## Phase 2 — Helper get-or-create lead + savePropostaPublica vinculação

### Task 3: Helper `getOrCreateLeadByPhone` em supabase.ts (TDD)

**Files:**
- Modify: `src/modules/supabase.ts` (adicionar método na classe principal)
- Create: `tests/supabase-getOrCreateLeadByPhone.test.ts`

- [ ] **Step 1: Escrever teste failing**

```typescript
// tests/supabase-getOrCreateLeadByPhone.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Supabase } from '../src/modules/supabase.js';

// Cliente Supabase com chainable mocks
function makeMockClient() {
  const insertedRows: any[] = [];
  const selectedByPhone: Record<string, { id: string; phone: string } | null> = {};

  const client: any = {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () => {
            if (table === 'leads' && col === 'phone') {
              return { data: selectedByPhone[val] ?? null, error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
      insert: (row: any) => ({
        select: (_cols: string) => ({
          single: async () => {
            const created = { id: `new-id-${insertedRows.length + 1}`, ...row };
            insertedRows.push(created);
            return { data: created, error: null };
          },
        }),
      }),
    }),
    __insertedRows: insertedRows,
    __seedLead: (phone: string, id: string) => { selectedByPhone[phone] = { id, phone }; },
  };
  return client;
}

describe('Supabase.getOrCreateLeadByPhone', () => {
  it('retorna lead existente quando telefone bate', async () => {
    const client = makeMockClient();
    client.__seedLead('5561999999999', 'existing-lead-uuid');
    const sb = new Supabase(client as unknown as SupabaseClient);

    const id = await sb.getOrCreateLeadByPhone('5561999999999', 'Cliente Foo');

    expect(id).toBe('existing-lead-uuid');
    expect(client.__insertedRows).toHaveLength(0);
  });

  it('cria novo lead com status qualificado quando nao existe', async () => {
    const client = makeMockClient();
    const sb = new Supabase(client as unknown as SupabaseClient);

    const id = await sb.getOrCreateLeadByPhone('5561900000000', 'Cliente Bar');

    expect(id).toMatch(/^new-id-/);
    expect(client.__insertedRows).toEqual([
      expect.objectContaining({ name: 'Cliente Bar', phone: '5561900000000', status: 'qualificado' }),
    ]);
  });

  it('lanca erro quando telefone esta vazio', async () => {
    const client = makeMockClient();
    const sb = new Supabase(client as unknown as SupabaseClient);
    await expect(sb.getOrCreateLeadByPhone('', 'Foo')).rejects.toThrow(/telefone/i);
  });
});
```

- [ ] **Step 2: Rodar teste e confirmar que falha**

```
npm test -- tests/supabase-getOrCreateLeadByPhone.test.ts
```

Esperado: 3 FAILs (método não existe).

- [ ] **Step 3: Implementar `getOrCreateLeadByPhone` em supabase.ts**

Antes de editar, ler o início da classe pra confirmar nome (`Supabase`) e padrão dos métodos (~linha 30-50).

Adicionar este método na classe `Supabase` (logo antes do bloco "Propostas publicas" — linha ~640):

```typescript
  /**
   * Retorna o id do lead existente pelo telefone, ou cria um novo (status='qualificado').
   * Usado por savePropostaPublica e pelo modo /fechar pra garantir que
   * proposta sempre fica linkada a um lead. Resolve bug Fase 1 (proposta orfa).
   *
   * Lanca se phone vazio (leads.phone e NOT NULL UNIQUE).
   */
  async getOrCreateLeadByPhone(phone: string, nameIfNew: string): Promise<string> {
    if (!phone || !phone.trim()) {
      throw new Error('getOrCreateLeadByPhone: telefone obrigatorio');
    }
    const phoneClean = phone.replace(/\D+/g, '');

    const { data: existing, error: selectErr } = await this.client
      .from('leads')
      .select('id, phone')
      .eq('phone', phoneClean)
      .maybeSingle();
    if (selectErr) throw new Error(`getOrCreateLeadByPhone select: ${selectErr.message}`);
    if (existing?.id) return existing.id as string;

    const { data: created, error: insertErr } = await this.client
      .from('leads')
      .insert({ name: nameIfNew, phone: phoneClean, status: 'qualificado' })
      .select('id')
      .single();
    if (insertErr) throw new Error(`getOrCreateLeadByPhone insert: ${insertErr.message}`);
    return (created as { id: string }).id;
  }
```

- [ ] **Step 4: Rodar testes e confirmar 3 PASS**

```
npm test -- tests/supabase-getOrCreateLeadByPhone.test.ts
```

Esperado: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/supabase.ts tests/supabase-getOrCreateLeadByPhone.test.ts
git commit -m "feat(supabase): getOrCreateLeadByPhone helper"
```

---

### Task 4: `savePropostaPublica` chama get-or-create + linka `lead_id`

**Files:**
- Modify: `src/modules/supabase.ts:647` (assinatura de `savePropostaPublica`)
- Modify: `tests/` (procurar testes existentes de savePropostaPublica antes de mexer)

- [ ] **Step 1: Buscar testes existentes de savePropostaPublica**

```
npm test -- --reporter verbose 2>&1 | grep -i savePropostaPublica | head -20
```

Anotar arquivos relacionados. Se houver, ajustar pra cobrir novo comportamento.

- [ ] **Step 2: Escrever teste failing pra novo comportamento**

Se já houver `tests/supabase-savePropostaPublica.test.ts`, expandir. Senão, criar:

```typescript
// tests/supabase-savePropostaPublica.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Supabase } from '../src/modules/supabase.js';

function makeChainableInsertClient(propostaId: string, leadId: string | null) {
  const inserted: any[] = [];
  let getOrCreateCalled = false;

  const client: any = {
    from: (table: string) => {
      if (table === 'leads') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: leadId ? { id: leadId, phone: '5561' } : null, error: null }),
            }),
          }),
          insert: (row: any) => ({
            select: () => ({
              single: async () => {
                getOrCreateCalled = true;
                return { data: { id: 'new-lead-id', ...row }, error: null };
              },
            }),
          }),
        };
      }
      // propostas_publicas
      return {
        insert: (row: any) => {
          inserted.push(row);
          return {
            select: () => ({
              single: async () => ({
                data: { id: propostaId, expires_at: new Date(Date.now() + 60 * 86400000).toISOString() },
                error: null,
              }),
            }),
          };
        },
      };
    },
    __inserted: inserted,
    __wasCreated: () => getOrCreateCalled,
  };
  return client;
}

describe('Supabase.savePropostaPublica', () => {
  it('linka lead_id quando telefone vem preenchido (lead ja existe)', async () => {
    const client = makeChainableInsertClient('p1', 'lead-existing');
    const sb = new Supabase(client as any);

    await sb.savePropostaPublica({
      slug: 'abc',
      numeroProposta: '001',
      clienteNome: 'Fulano',
      clienteTelefone: '5561999999999',
      htmlContent: '<p>hi</p>',
    });

    expect(client.__inserted[0]).toMatchObject({ lead_id: 'lead-existing' });
    expect(client.__wasCreated()).toBe(false);
  });

  it('cria lead novo quando nao existe', async () => {
    const client = makeChainableInsertClient('p2', null);
    const sb = new Supabase(client as any);

    await sb.savePropostaPublica({
      slug: 'def',
      numeroProposta: '002',
      clienteNome: 'Beltrana',
      clienteTelefone: '5561988887777',
      htmlContent: '<p>hi</p>',
    });

    expect(client.__inserted[0]).toMatchObject({ lead_id: 'new-lead-id' });
    expect(client.__wasCreated()).toBe(true);
  });

  it('insere proposta com lead_id null quando telefone nao vem', async () => {
    const client = makeChainableInsertClient('p3', null);
    const sb = new Supabase(client as any);

    await sb.savePropostaPublica({
      slug: 'ghi',
      numeroProposta: '003',
      clienteNome: 'Sem Telefone',
      htmlContent: '<p>hi</p>',
    });

    expect(client.__inserted[0]).toMatchObject({ lead_id: null });
    expect(client.__wasCreated()).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar e confirmar 3 FAILs**

```
npm test -- tests/supabase-savePropostaPublica.test.ts
```

Esperado: 3 FAILs (insert ainda não inclui lead_id).

- [ ] **Step 4: Modificar `savePropostaPublica` em `src/modules/supabase.ts:647`**

Substituir o corpo do método (linhas 647-674) por:

```typescript
  async savePropostaPublica(input: {
    slug: string;
    numeroProposta: string;
    clienteNome: string;
    clienteTelefone?: string;
    htmlContent: string;
    dadosInput?: Record<string, unknown>;
    tipo?: 'basica' | 'personalizada';
    modoEnvio?: 'junior_envia' | 'eva_envia';
  }): Promise<{ id: string; expiresAt: string }> {
    // Vincula lead se telefone vier preenchido. Resolve bug Fase 1 (proposta orfa).
    let leadId: string | null = null;
    if (input.clienteTelefone && input.clienteTelefone.trim()) {
      try {
        leadId = await this.getOrCreateLeadByPhone(input.clienteTelefone, input.clienteNome);
      } catch (err) {
        // Falha no get-or-create NAO bloqueia salvar a proposta — loga e segue.
        console.warn('[supabase] savePropostaPublica getOrCreateLeadByPhone falhou:', (err as Error).message);
      }
    }

    const { data, error } = await this.client
      .from('propostas_publicas')
      .insert({
        slug: input.slug,
        numero_proposta: input.numeroProposta,
        cliente_nome: input.clienteNome,
        cliente_telefone: input.clienteTelefone ?? null,
        html_content: input.htmlContent,
        dados_input: input.dadosInput ?? null,
        tipo: input.tipo ?? 'basica',
        modo_envio: input.modoEnvio ?? 'junior_envia',
        lead_id: leadId,
      })
      .select('id, expires_at')
      .single();

    if (error) throw new Error(`Failed to save proposta publica: ${error.message}`);
    return { id: data.id, expiresAt: data.expires_at };
  }
```

- [ ] **Step 5: Rodar testes e confirmar 3 PASS**

```
npm test -- tests/supabase-savePropostaPublica.test.ts
```

- [ ] **Step 6: Rodar suite completa pra confirmar zero regressão**

```
npm test
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/supabase.ts tests/supabase-savePropostaPublica.test.ts
git commit -m "feat(supabase): savePropostaPublica linka lead_id (resolve bug Fase 1)"
```

---

## Phase 3 — Validator condicional por `docs_pedidos`

### Task 5: `findMissingRequired` filtra por `docs_pedidos` (TDD)

**Files:**
- Modify: `src/modules/closing/closing-validator.ts:92-112`
- Modify: `tests/closing-validator.test.ts`

- [ ] **Step 1: Ler testes existentes pra ver padrão**

```
cat tests/closing-validator.test.ts | head -50
```

- [ ] **Step 2: Adicionar bloco novo no teste**

Adicionar ao final de `tests/closing-validator.test.ts`:

```typescript
describe('findMissingRequired — filtro por docs_pedidos', () => {
  const baseTitular: any = {
    tipo: 'PF',
    nome: 'Fulano', cpf: '12345678901', rg: '1234567', orgao_emissor_rg: 'SSP-DF',
    endereco: { rua: 'R', numero: '1', bairro: 'B', cidade: 'Brasilia', uf: 'DF', cep: '70000000' },
    telefone: '5561900000000', email: 'a@b.com', nacionalidade: 'brasileiro',
  };
  const baseEndereco = baseTitular.endereco;

  it('procuracao NAO pede sistema/comercial/email/telefone', () => {
    const miss = findMissingRequired({
      docs_pedidos: ['procuracao'],
      titular_uc: baseTitular,
      concessionaria: 'Neoenergia-DF',
      endereco_instalacao: baseEndereco,
      contratante_eh_titular: true,
      contratante: baseTitular,
    });
    expect(miss).toEqual([]);
  });

  it('procuracao pede UC quando faltando', () => {
    const miss = findMissingRequired({
      docs_pedidos: ['procuracao'],
      titular_uc: baseTitular,
      concessionaria: 'Neoenergia-DF',
      endereco_instalacao: baseEndereco,
      contratante_eh_titular: true,
      contratante: baseTitular,
      // uc_numero ausente
    });
    expect(miss).toContain('uc_numero');
  });

  it('contrato pede sistema + comercial + email/telefone', () => {
    const miss = findMissingRequired({
      docs_pedidos: ['contrato'],
      titular_uc: baseTitular,
      concessionaria: 'Neoenergia-DF',
      endereco_instalacao: baseEndereco,
      contratante_eh_titular: true,
      contratante: baseTitular,
    });
    expect(miss).toEqual(expect.arrayContaining([
      'sistema.kwp', 'sistema.modalidade', 'sistema.modulos', 'sistema.inversor',
      'comercial.valor_total_brl', 'comercial.forma_pagamento',
    ]));
  });

  it('ambos = uniao dos dois (sem duplicar)', () => {
    const miss = findMissingRequired({
      docs_pedidos: ['procuracao', 'contrato'],
      titular_uc: baseTitular,
      concessionaria: 'Neoenergia-DF',
      endereco_instalacao: baseEndereco,
      contratante_eh_titular: true,
      contratante: baseTitular,
    });
    const unique = [...new Set(miss)];
    expect(miss.length).toBe(unique.length);
    expect(miss).toEqual(expect.arrayContaining([
      'uc_numero', 'sistema.kwp', 'comercial.valor_total_brl',
    ]));
  });
});
```

- [ ] **Step 3: Rodar e confirmar 4 FAILs**

```
npm test -- tests/closing-validator.test.ts
```

- [ ] **Step 4: Reescrever `findMissingRequired` em `src/modules/closing/closing-validator.ts:92`**

Substituir lines 92-112 por:

```typescript
export function findMissingRequired(d: Partial<DadosFechamento>): string[] {
  const miss: string[] = [];
  const docs = d.docs_pedidos ?? [];
  if (docs.length === 0) miss.push('docs_pedidos');

  const wantsContrato = docs.includes('contrato');
  const wantsProcuracao = docs.includes('procuracao');

  // Pessoa titular UC: sempre obrigatorio (nome/cpf/rg/endereco/UF/CEP)
  // — pega de missingPessoa mas filtra email/telefone se SO procuracao
  const titularMiss = missingPessoa('titular_uc', d.titular_uc);
  if (!wantsContrato && wantsProcuracao) {
    miss.push(...titularMiss.filter(m => m !== 'titular_uc.email' && m !== 'titular_uc.telefone'));
  } else {
    miss.push(...titularMiss);
  }

  if (!d.concessionaria) miss.push('concessionaria');
  if (!d.endereco_instalacao) miss.push('endereco_instalacao');

  // UC: obrigatorio pra procuracao (e ambos)
  if (wantsProcuracao && (!d.uc_numero || !d.uc_numero.trim())) {
    miss.push('uc_numero');
  }

  // Contratante (distinto): so importa pra contrato
  if (wantsContrato && d.contratante_eh_titular === false) {
    miss.push(...missingPessoa('contratante', d.contratante));
  }

  // Sistema + comercial: SO contrato
  if (wantsContrato) {
    if (!d.sistema) {
      miss.push('sistema.kwp', 'sistema.modalidade', 'sistema.modulos', 'sistema.inversor');
    } else {
      if (!d.sistema.kwp) miss.push('sistema.kwp');
      if (!d.sistema.modalidade) miss.push('sistema.modalidade');
      if (!d.sistema.modulos?.marca) miss.push('sistema.modulos');
      if (!d.sistema.inversor?.modelo) miss.push('sistema.inversor');
    }
    if (!d.comercial?.valor_total_brl) miss.push('comercial.valor_total_brl');
    if (!d.comercial?.forma_pagamento) miss.push('comercial.forma_pagamento');
  }

  return [...new Set(miss)]; // dedup
}
```

- [ ] **Step 5: Rodar testes e confirmar PASS (todos)**

```
npm test -- tests/closing-validator.test.ts
```

Esperado: testes antigos continuam passando + 4 novos PASS.

- [ ] **Step 6: Adicionar label de `uc_numero` em `FIELD_LABELS` (linha ~117)**

Editar `src/modules/closing/closing-validator.ts` adicionando dentro do `FIELD_LABELS`:

```typescript
  'uc_numero': 'Número da UC (na conta de luz)',
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/closing/closing-validator.ts tests/closing-validator.test.ts
git commit -m "feat(closing): findMissingRequired filtra por docs_pedidos"
```

---

## Phase 4 — Template procuração reescrito

### Task 6: Reescrever `procuracao.html.ts` (modelo Fernanda) — TDD

**Files:**
- Modify: `src/modules/closing/templates/procuracao.html.ts` (substituição quase total)
- Modify: `tests/closing-templates-procuracao.test.ts`

- [ ] **Step 1: Ler testes existentes**

```
cat tests/closing-templates-procuracao.test.ts
```

- [ ] **Step 2: Substituir/expandir os testes** pra refletir o novo modelo:

Substituir o conteúdo de `tests/closing-templates-procuracao.test.ts` por:

```typescript
import { describe, it, expect } from 'vitest';
import { renderProcuracao } from '../src/modules/closing/templates/procuracao.html.js';
import type { DadosFechamento } from '../src/modules/closing/index.js';

const dadosFernanda: DadosFechamento = {
  titular_uc: {
    tipo: 'PF',
    nome: 'Fernanda Silva Almeida Araujo de Melo',
    cpf: '831.347.431-91',
    rg: '1.830.813',
    orgao_emissor_rg: 'SSP-DF',
    nacionalidade: 'brasileira',
    estado_civil: 'casada',
    profissao: 'empresária',
    endereco: {
      rua: 'SMPW Quadra 15, Conjunto 1, Lote 05',
      numero: 's/n',
      bairro: 'Park Way',
      cidade: 'Brasilia', uf: 'DF', cep: '71.741-501',
    },
    telefone: '5561900000000',
    email: 'fernanda@example.com',
  },
  uc_numero: '3098127',
  concessionaria: 'Neoenergia-DF',
  endereco_instalacao: {
    rua: 'SMPW Quadra 15, Conjunto 1, Lote 05',
    numero: 's/n', bairro: 'Park Way',
    cidade: 'Brasilia', uf: 'DF', cep: '71.741-501',
  },
  contratante: undefined as any,
  contratante_eh_titular: true,
  sistema: { kwp: 0, modalidade: 'autoconsumo_local', modulos: { marca: '', potencia_w: 0, quantidade: 0 }, inversor: { marca: '', modelo: '', potencia_kw: 0 } },
  comercial: { valor_total_brl: 0, forma_pagamento: '' },
  docs_pedidos: ['procuracao'],
};

describe('renderProcuracao — modelo Fernanda', () => {
  it('titulo e PROCURACAO PARTICULAR (nao mais INSTRUMENTO)', () => {
    const html = renderProcuracao(dadosFernanda);
    expect(html).toContain('PROCURAÇÃO PARTICULAR');
    expect(html).not.toContain('INSTRUMENTO PARTICULAR');
  });

  it('validade 12 meses (nao mais 180 dias)', () => {
    const html = renderProcuracao(dadosFernanda);
    expect(html).toMatch(/12\s*\(doze\)\s*meses/i);
    expect(html).not.toMatch(/180.*dias/);
  });

  it('outorgado e Antonio em nome da PJ (nao mais PJ representada)', () => {
    const html = renderProcuracao(dadosFernanda);
    // Antonio aparece como nome principal do outorgado, em nome da PJ
    expect(html).toMatch(/ANTONIO CANDIDO RODRIGUES JUNIOR/);
    expect(html).toMatch(/atuando em nome da empresa.*ECOSUNPOWER/i);
  });

  it('contem dados do titular (cpf, RG, endereco, UC)', () => {
    const html = renderProcuracao(dadosFernanda);
    expect(html).toContain('FERNANDA SILVA ALMEIDA');
    expect(html).toContain('831.347.431-91');
    expect(html).toContain('1.830.813 SSP-DF');
    expect(html).toMatch(/SMPW Quadra 15/);
    expect(html).toContain('71.741-501');
    expect(html).toContain('3098127');
    expect(html).toContain('NEOENERGIA');
  });

  it('rodape com email junior@ (NUNCA contato@ nem gmail legado)', () => {
    const html = renderProcuracao(dadosFernanda);
    expect(html).toContain('junior@ecosunpower.eng.br');
    expect(html).not.toContain('contato@');
    expect(html).not.toContain('ecosunpower2032@gmail.com');
  });

  it('NAO menciona ANEEL formal (escopo simplificado)', () => {
    const html = renderProcuracao(dadosFernanda);
    expect(html).not.toMatch(/ANEEL/i);
  });

  it('header EcoSunPower + CNPJ 33.020.459', () => {
    const html = renderProcuracao(dadosFernanda);
    expect(html).toContain('ECOSUNPOWER ENERGIA SOLAR');
    expect(html).toContain('33.020.459/0001-06');
  });

  it('credita Responsavel Tecnico CREA/CFT (nao engenheiro)', () => {
    const html = renderProcuracao(dadosFernanda);
    expect(html).toMatch(/Respons[áa]vel T[ée]cnico/);
    expect(html).toContain('98940457153');
    expect(html).not.toMatch(/\bengenheiro\b/i);
  });

  it('inclui 6 alineas de poderes (a) a (f)', () => {
    const html = renderProcuracao(dadosFernanda);
    // Verifica que tem pelo menos 6 <li>
    const lis = html.match(/<li>/g) ?? [];
    expect(lis.length).toBeGreaterThanOrEqual(6);
  });

  it('uc fallback "(a confirmar)" quando vazio', () => {
    const sem = { ...dadosFernanda, uc_numero: '' };
    const html = renderProcuracao(sem);
    expect(html).toMatch(/a confirmar/i);
  });
});
```

- [ ] **Step 3: Rodar e confirmar quase tudo FAIL** (template ainda é o antigo)

```
npm test -- tests/closing-templates-procuracao.test.ts
```

Esperado: 7-9 FAILs.

- [ ] **Step 4: Reescrever `src/modules/closing/templates/procuracao.html.ts`** completamente:

```typescript
// src/modules/closing/templates/procuracao.html.ts
// Modelo simples 1 pagina A4 validado em 27/05/2026 (caso Fernanda).
// Veja docs/superpowers/specs/2026-05-27-eva-procuracao-contrato-rapidos-design.md
//
// Outorgante = SEMPRE titular_uc (quem e titular da conta de luz).
// Outorgado = ANTONIO CANDIDO RODRIGUES JUNIOR (PF, Responsavel Tecnico CREA/CFT)
//             atuando em nome da ECOSUNPOWER ENERGIA SOLAR LTDA (PJ).

import type { DadosFechamento, PessoaFisica, PessoaJuridica } from '../types.js';

const OUTORGADO = {
  nome: 'ANTONIO CANDIDO RODRIGUES JUNIOR',
  cpf: '989.404.571-53',
  rg: '2.202.520 SSP-DF',
  crea: '98940457153',
  titulo: 'Responsável Técnico CREA/CFT',
  empresa_razao_social: 'ECOSUNPOWER ENERGIA SOLAR LTDA',
  empresa_cnpj: '33.020.459/0001-06',
  empresa_endereco: 'Brasilia-DF',
};

const RODAPE_EMAIL = 'junior@ecosunpower.eng.br';

function descreveTitular(p: PessoaFisica | PessoaJuridica): { nomeMaiusculo: string; descricaoCompleta: string; cpfCnpj: string; rgInfo: string } {
  if (p.tipo === 'PJ') {
    const r = p.representante;
    return {
      nomeMaiusculo: p.razao_social.toUpperCase(),
      descricaoCompleta: `<b>${p.razao_social.toUpperCase()}</b>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${p.cnpj}, com sede na ${enderecoStr(p.endereco)}, neste ato representada por <b>${r.nome.toUpperCase()}</b>, ${r.nacionalidade ?? 'brasileiro(a)'}, portador do RG nº ${r.rg} ${r.orgao_emissor_rg}, inscrito no CPF/MF sob o nº ${r.cpf}`,
      cpfCnpj: p.cnpj,
      rgInfo: `${r.rg} ${r.orgao_emissor_rg}`,
    };
  }
  const partes: string[] = [];
  partes.push(`<b>${p.nome.toUpperCase()}</b>`);
  partes.push(p.nacionalidade ?? 'brasileiro(a)');
  if (p.estado_civil) partes.push(p.estado_civil);
  if (p.profissao) partes.push(p.profissao);
  partes.push(`portador(a) do RG nº ${p.rg} ${p.orgao_emissor_rg}`);
  partes.push(`inscrito(a) no CPF/MF sob o nº ${p.cpf}`);
  partes.push(`residente e domiciliado(a) na ${enderecoStr(p.endereco)}`);
  return {
    nomeMaiusculo: p.nome.toUpperCase(),
    descricaoCompleta: partes.join(', '),
    cpfCnpj: p.cpf,
    rgInfo: `${p.rg} ${p.orgao_emissor_rg}`,
  };
}

function enderecoStr(e: { rua: string; numero: string; complemento?: string; bairro: string; cidade: string; uf: string; cep: string }): string {
  const comp = e.complemento ? `, ${e.complemento}` : '';
  return `${e.rua}, ${e.numero}${comp}, ${e.bairro}, ${e.cidade}-${e.uf}, CEP ${e.cep}`;
}

function hojeFormatado(): string {
  const d = new Date();
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

export function renderProcuracao(dados: DadosFechamento): string {
  const titular = descreveTitular(dados.titular_uc);
  const uc = (dados.uc_numero && dados.uc_numero.trim()) ? dados.uc_numero : '(a confirmar)';
  const concessionariaNome = dados.concessionaria === 'Neoenergia-DF'
    ? 'NEOENERGIA DISTRIBUIÇÃO BRASÍLIA S.A.'
    : 'EQUATORIAL ENERGIA GOIÁS S.A.';
  const cidade = dados.titular_uc.tipo === 'PJ' ? dados.titular_uc.endereco.cidade : dados.titular_uc.endereco.cidade;
  const uf = dados.titular_uc.tipo === 'PJ' ? dados.titular_uc.endereco.uf : dados.titular_uc.endereco.uf;
  const data = hojeFormatado();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Procuração ${titular.nomeMaiusculo}</title>
<style>
  @page { size: A4; margin: 18mm 20mm; }
  body { font-family: 'Times New Roman', Georgia, serif; font-size: 11.5pt; line-height: 1.45; color: #111; }
  .page { max-width: 170mm; margin: 0 auto; }
  header { text-align: center; margin-bottom: 14pt; border-bottom: 1.5pt solid #1b3a52; padding-bottom: 8pt; }
  header .marca { font-family: Arial, sans-serif; font-size: 13pt; font-weight: 700; color: #1b3a52; letter-spacing: 0.5pt; }
  header .sub { font-family: Arial, sans-serif; font-size: 8.5pt; color: #555; margin-top: 2pt; }
  h1 { text-align: center; font-size: 14pt; margin: 10pt 0 14pt; letter-spacing: 2pt; }
  p { margin: 0 0 8pt; text-align: justify; }
  ul.poderes { margin: 4pt 0 10pt 18pt; }
  ul.poderes li { margin-bottom: 3pt; text-align: justify; }
  .data { margin-top: 22pt; text-align: right; }
  .assinatura { margin-top: 34pt; text-align: center; }
  .assinatura .linha { width: 70%; margin: 0 auto; border-top: 1pt solid #111; padding-top: 4pt; font-size: 10pt; }
  .assinatura .nome { font-weight: 700; text-transform: uppercase; font-size: 10.5pt; }
  footer { margin-top: 18pt; text-align: center; font-family: Arial, sans-serif; font-size: 8pt; color: #888; border-top: 0.5pt solid #ddd; padding-top: 6pt; }
</style>
</head>
<body>
<div class="page">
  <header>
    <div class="marca">${OUTORGADO.empresa_razao_social.replace(/ LTDA$/, '')}</div>
    <div class="sub">CNPJ ${OUTORGADO.empresa_cnpj} &middot; ${OUTORGADO.empresa_endereco} &middot; ecosunpower.eng.br</div>
  </header>

  <h1>PROCURAÇÃO PARTICULAR</h1>

  <p><b>OUTORGANTE:</b> ${titular.descricaoCompleta}.</p>

  <p><b>OUTORGADO:</b> <b>${OUTORGADO.nome}</b>, brasileiro, ${OUTORGADO.titulo} nº ${OUTORGADO.crea}, portador do RG nº ${OUTORGADO.rg}, inscrito no CPF/MF sob o nº ${OUTORGADO.cpf}, atuando em nome da empresa <b>${OUTORGADO.empresa_razao_social}</b>, CNPJ ${OUTORGADO.empresa_cnpj}, com sede em ${OUTORGADO.empresa_endereco}.</p>

  <p><b>PODERES:</b> Pelo presente instrumento particular de mandato, a OUTORGANTE nomeia e constitui o OUTORGADO seu bastante procurador, conferindo-lhe poderes especiais para representá-la perante a <b>${concessionariaNome}</b>, referente à Unidade Consumidora nº <b>${uc}</b>, com a finalidade de tratar do projeto de microgeração distribuída de energia solar fotovoltaica, podendo:</p>

  <ul class="poderes">
    <li>protocolar, acompanhar e retirar o pedido de acesso à microgeração distribuída, bem como solicitar parecer de acesso e contrato de adesão;</li>
    <li>assinar formulários, declarações, ART/TRT, projeto elétrico, memorial descritivo e demais documentos técnicos exigidos pela concessionária;</li>
    <li>solicitar vistoria técnica, inspeção, troca/adequação do medidor bidirecional e ligação do sistema;</li>
    <li>requerer 2ª via de faturas, histórico de consumo, dados cadastrais e demais informações relativas à UC;</li>
    <li>receber notificações, comunicados, intimações e correspondências relacionados ao processo de homologação;</li>
    <li>praticar todos os demais atos necessários ao bom e fiel cumprimento do presente mandato.</li>
  </ul>

  <p><b>PRAZO:</b> A presente procuração tem validade de <b>12 (doze) meses</b> contados da data de sua assinatura, podendo ser revogada a qualquer tempo mediante comunicação por escrito ao OUTORGADO.</p>

  <div class="data">${cidade}-${uf}, ${data}.</div>

  <div class="assinatura">
    <div class="linha">
      <div class="nome">${titular.nomeMaiusculo}</div>
      <div>CPF ${titular.cpfCnpj} &middot; RG ${titular.rgInfo}</div>
    </div>
  </div>

  <footer>
    ${OUTORGADO.empresa_razao_social} &middot; CNPJ ${OUTORGADO.empresa_cnpj} &middot; ${RODAPE_EMAIL}
  </footer>
</div>
</body>
</html>`;
}
```

- [ ] **Step 5: Rodar testes e confirmar todos PASS**

```
npm test -- tests/closing-templates-procuracao.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/closing/templates/procuracao.html.ts tests/closing-templates-procuracao.test.ts
git commit -m "feat(closing): reescreve procuracao.html.ts com modelo Fernanda (12m, 1p)"
```

---

## Phase 5 — Upload HTML → Google Doc

### Task 7: `closing-html-uploader.ts` (TDD com nock/mock drive)

**Files:**
- Create: `src/modules/closing/closing-html-uploader.ts`
- Create: `tests/closing-html-uploader.test.ts`
- Modify: `src/modules/closing/index.ts` (exportar)

- [ ] **Step 1: Escrever teste failing**

```typescript
// tests/closing-html-uploader.test.ts
import { describe, it, expect, vi } from 'vitest';
import { uploadHtmlAsGoogleDoc } from '../src/modules/closing/closing-html-uploader.js';

function makeMockDrive(returnId: string, returnLink: string) {
  const createCalls: any[] = [];
  return {
    files: {
      create: vi.fn(async (args: any) => {
        createCalls.push(args);
        return { data: { id: returnId, webViewLink: returnLink } };
      }),
    },
    __createCalls: createCalls,
  };
}

describe('uploadHtmlAsGoogleDoc', () => {
  it('faz upload com mimeType text/html e SEM disableConversionToGoogleType', async () => {
    const drive: any = makeMockDrive('doc-id-123', 'https://docs.google.com/document/d/doc-id-123/edit');
    const result = await uploadHtmlAsGoogleDoc({
      html: '<h1>Hello</h1>',
      name: 'Procuracao Fernanda - v1',
      parentId: 'folder-abc',
      drive,
    });
    expect(result).toEqual({ id: 'doc-id-123', link: 'https://docs.google.com/document/d/doc-id-123/edit' });
    expect(drive.__createCalls).toHaveLength(1);
    const call = drive.__createCalls[0];
    expect(call.media.mimeType).toBe('text/html');
    expect(call.requestBody.name).toBe('Procuracao Fernanda - v1');
    expect(call.requestBody.parents).toEqual(['folder-abc']);
    // mimeType pedido no requestBody deve ser google-apps.document (forca conversao)
    expect(call.requestBody.mimeType).toBe('application/vnd.google-apps.document');
  });

  it('lanca erro se Drive nao retornar id', async () => {
    const drive: any = {
      files: { create: vi.fn(async () => ({ data: {} })) },
    };
    await expect(uploadHtmlAsGoogleDoc({
      html: '<p>x</p>', name: 'x', parentId: 'p', drive,
    })).rejects.toThrow(/upload/i);
  });
});
```

- [ ] **Step 2: Rodar e confirmar 2 FAILs** (módulo não existe)

```
npm test -- tests/closing-html-uploader.test.ts
```

- [ ] **Step 3: Criar `src/modules/closing/closing-html-uploader.ts`**

```typescript
// src/modules/closing/closing-html-uploader.ts
// Funcao pura: sobe HTML no Drive forcando conversao pra Google Doc.
// O Drive auto-converte HTML em Doc preservando h1/h2/p/strong/ul.
// Usada pelo closing-drive.ts pra gerar Doc eSignature-ready.

import type { drive_v3 } from 'googleapis';
import { Readable } from 'stream';

export interface UploadHtmlAsGoogleDocInput {
  html: string;
  name: string;        // nome do arquivo no Drive (sem extensao)
  parentId: string;    // id da pasta destino
  drive: drive_v3.Drive;
}

export interface UploadHtmlAsGoogleDocResult {
  id: string;
  link: string;
}

export async function uploadHtmlAsGoogleDoc(input: UploadHtmlAsGoogleDocInput): Promise<UploadHtmlAsGoogleDocResult> {
  const res = await input.drive.files.create({
    requestBody: {
      name: input.name,
      // requestBody.mimeType = google-apps.document FORCA conversao.
      // media.mimeType = text/html descreve o que enviamos.
      mimeType: 'application/vnd.google-apps.document',
      parents: [input.parentId],
    },
    media: {
      mimeType: 'text/html',
      body: Readable.from(Buffer.from(input.html, 'utf-8')),
    },
    fields: 'id, webViewLink',
  });
  if (!res.data.id) throw new Error('uploadHtmlAsGoogleDoc: Drive nao retornou id');
  return { id: res.data.id, link: res.data.webViewLink ?? '' };
}
```

- [ ] **Step 4: Rodar testes e confirmar 2 PASS**

```
npm test -- tests/closing-html-uploader.test.ts
```

- [ ] **Step 5: Exportar do barrel `src/modules/closing/index.ts`**

Adicionar antes do final do arquivo:

```typescript
export {
  uploadHtmlAsGoogleDoc,
  type UploadHtmlAsGoogleDocInput,
  type UploadHtmlAsGoogleDocResult,
} from './closing-html-uploader.js';
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/closing/closing-html-uploader.ts tests/closing-html-uploader.test.ts src/modules/closing/index.ts
git commit -m "feat(closing): closing-html-uploader.ts (HTML->Google Doc, eSignature-ready)"
```

---

### Task 8: `closing-drive.ts` orquestra HTML + PDF (TDD)

**Files:**
- Modify: `src/modules/closing/closing-drive.ts:9-26` (interfaces); `:71-101` (uploadFechamento)
- Modify: `tests/closing-drive.test.ts`

- [ ] **Step 1: Ler teste existente**

```
cat tests/closing-drive.test.ts
```

- [ ] **Step 2: Adicionar novos casos de teste cobrindo HTML+PDF**

Adicionar ao `tests/closing-drive.test.ts`:

```typescript
import { ClosingDriveUploader } from '../src/modules/closing/closing-drive.js';

function makeFullMockDrive() {
  const calls: any[] = [];
  return {
    files: {
      list: vi.fn(async () => ({ data: { files: [] } })),  // pasta sempre nova
      create: vi.fn(async (args: any) => {
        calls.push(args);
        const isFolder = args.requestBody?.mimeType === 'application/vnd.google-apps.folder';
        const isDoc = args.requestBody?.mimeType === 'application/vnd.google-apps.document';
        const id = isFolder ? `folder-${calls.length}` : isDoc ? `doc-${calls.length}` : `file-${calls.length}`;
        return { data: { id, webViewLink: `https://link/${id}` } };
      }),
      get: vi.fn(async () => ({ data: { webViewLink: 'https://link/cliente' } })),
    },
    __calls: calls,
  };
}

describe('ClosingDriveUploader.uploadFechamento — HTML+PDF', () => {
  it('sobe Doc + PDF + JSON quando procuracaoHtml e procuracaoPdf vem', async () => {
    const drive = makeFullMockDrive() as any;
    const uploader = new ClosingDriveUploader(drive);
    const res = await uploader.uploadFechamento({
      nomeTitular: 'Fernanda Silva',
      cpfTitular: '83134743191',
      ano: '2026',
      version: 1,
      procuracaoHtml: '<h1>oi</h1>',
      procuracaoPdf: Buffer.from('%PDF-fake'),
      dadosInputJson: '{}',
    });
    expect(res.procuracaoDriveId).toMatch(/^doc-/);   // Doc retornado, nao PDF
    expect(res.procuracaoDriveLink).toContain('link/doc-');

    // Deve ter chamado create pra: 4 folders + 1 doc html + 1 pdf + 1 json
    const docCreates = drive.__calls.filter((c: any) => c.requestBody?.mimeType === 'application/vnd.google-apps.document');
    const pdfCreates = drive.__calls.filter((c: any) => c.requestBody?.mimeType === 'application/pdf');
    expect(docCreates).toHaveLength(1);
    expect(pdfCreates).toHaveLength(1);
  });

  it('mesma logica pra contrato', async () => {
    const drive = makeFullMockDrive() as any;
    const uploader = new ClosingDriveUploader(drive);
    const res = await uploader.uploadFechamento({
      nomeTitular: 'Roberto X',
      cpfTitular: '12345678901',
      ano: '2026',
      version: 1,
      contratoHtml: '<h1>contrato</h1>',
      contratoPdf: Buffer.from('%PDF'),
      dadosInputJson: '{}',
    });
    expect(res.contratoDriveId).toMatch(/^doc-/);
  });

  it('quando so HTML (sem PDF) sobe so Doc', async () => {
    const drive = makeFullMockDrive() as any;
    const uploader = new ClosingDriveUploader(drive);
    const res = await uploader.uploadFechamento({
      nomeTitular: 'X', cpfTitular: '12345678901', ano: '2026', version: 1,
      procuracaoHtml: '<h1>x</h1>',
      dadosInputJson: '{}',
    });
    expect(res.procuracaoDriveId).toBeTruthy();
    const pdfCreates = drive.__calls.filter((c: any) => c.requestBody?.mimeType === 'application/pdf');
    expect(pdfCreates).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Rodar e confirmar FAILs** (interface ainda não aceita HTML)

```
npm test -- tests/closing-drive.test.ts
```

- [ ] **Step 4: Atualizar `src/modules/closing/closing-drive.ts`**

Substituir as interfaces (linhas 9-26) e o método `uploadFechamento` (linhas 71-101):

```typescript
import { uploadHtmlAsGoogleDoc } from './closing-html-uploader.js';

export interface UploadFechamentoInput {
  nomeTitular: string;
  cpfTitular: string;
  ano: string;
  version: number; // 1, 2, 3... incrementa se refazer
  contratoHtml?: string;
  contratoPdf?: Buffer;
  procuracaoHtml?: string;
  procuracaoPdf?: Buffer;
  dadosInputJson: string;
}

export interface UploadFechamentoResult {
  folderId: string;
  folderWebViewLink: string;
  contratoDriveId?: string;
  contratoDriveLink?: string;
  procuracaoDriveId?: string;
  procuracaoDriveLink?: string;
}
```

E substituir o método `uploadFechamento`:

```typescript
  async uploadFechamento(input: UploadFechamentoInput): Promise<UploadFechamentoResult> {
    const cpfCurto = input.cpfTitular.replace(/\D+/g, '').slice(0, 6);
    const clienteFolderName = `${input.nomeTitular} - ${cpfCurto}`;

    const rootId = await this.getOrCreateFolder('EcoSunPower');
    const contratosId = await this.getOrCreateFolder('Contratos', rootId);
    const anoId = await this.getOrCreateFolder(input.ano, contratosId);
    const clienteId = await this.getOrCreateFolder(clienteFolderName, anoId);

    const folderMeta = await this.drive.files.get({ fileId: clienteId, fields: 'webViewLink' });
    const folderLink = folderMeta.data.webViewLink ?? '';

    const result: UploadFechamentoResult = {
      folderId: clienteId,
      folderWebViewLink: folderLink,
    };

    // Procuracao: Doc (eSignature) + PDF backup
    if (input.procuracaoHtml) {
      const { id, link } = await uploadHtmlAsGoogleDoc({
        html: input.procuracaoHtml,
        name: `procuracao-v${input.version}`,
        parentId: clienteId,
        drive: this.drive,
      });
      result.procuracaoDriveId = id;
      result.procuracaoDriveLink = link;
    }
    if (input.procuracaoPdf) {
      await this.uploadPdf(`procuracao-v${input.version}.pdf`, input.procuracaoPdf, clienteId);
      // PDF e backup; link Doc e o que volta no zap
    }

    // Contrato: idem
    if (input.contratoHtml) {
      const { id, link } = await uploadHtmlAsGoogleDoc({
        html: input.contratoHtml,
        name: `contrato-v${input.version}`,
        parentId: clienteId,
        drive: this.drive,
      });
      result.contratoDriveId = id;
      result.contratoDriveLink = link;
    }
    if (input.contratoPdf) {
      await this.uploadPdf(`contrato-v${input.version}.pdf`, input.contratoPdf, clienteId);
    }

    await this.uploadJson(`dados-input-v${input.version}.json`, input.dadosInputJson, clienteId);

    return result;
  }
```

- [ ] **Step 5: Rodar testes e confirmar PASS**

```
npm test -- tests/closing-drive.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/closing/closing-drive.ts tests/closing-drive.test.ts
git commit -m "feat(closing): closing-drive sobe Doc + PDF backup (eSignature-ready)"
```

---

## Phase 6 — System prompt + cláusula 23 destacada

### Task 9: Atualizar `closing-system.md` pra pergunta explícita de cláusula 23

**Files:**
- Modify: `src/prompts/closing-system.md`

- [ ] **Step 1: Ler prompt atual**

```
cat src/prompts/closing-system.md
```

- [ ] **Step 2: Adicionar bloco "Cláusula 23 — Disposições Especiais"**

Adicionar na seção apropriada do prompt (procurar onde fala de campos opcionais) este bloco:

```markdown
## Cláusula 23 — Disposições Especiais (SO no modo contrato/ambos)

Quando docs_pedidos inclui "contrato", APOS coletar todos os campos obrigatorios
e ANTES de marcar action="ready_to_generate", pergunte UMA UNICA vez:

> "Quer adicionar alguma condicao especifica nesse contrato? [Sim, vou ditar] [Nao, padrao]"

Espere a resposta. Se "Sim" / "vou ditar" / similar: pergunta o texto livre.
Se "Nao" / "padrao" / similar: deixa disposicoes_especiais vazio.

REGRA CRITICA: o texto que o Junior ditar vai LITERAL pro contrato.
NUNCA reescreva, reformule, "melhore" ou complemente. Copie identico no campo
disposicoes_especiais (apenas trim de espacos extras e remocao de quebras duplas).

Se docs_pedidos for SO ["procuracao"], NAO faca essa pergunta — procuracao nao
tem clausula extra.
```

- [ ] **Step 3: Commit**

```bash
git add src/prompts/closing-system.md
git commit -m "feat(closing): prompt explicita pergunta de clausula 23 (disposicoes especiais)"
```

---

### Task 10: Testes de `closing-templates-contrato` cobrindo cláusula 23 literal

**Files:**
- Modify: `tests/closing-templates-contrato.test.ts`

- [ ] **Step 1: Adicionar testes que confirmam literalidade**

Adicionar ao final de `tests/closing-templates-contrato.test.ts`:

```typescript
import { renderContrato } from '../src/modules/closing/templates/contrato.html.js';

const dadosBase: any = {
  // (reuso de dados existente nos testes — copiar se preciso)
  titular_uc: { tipo: 'PF', nome: 'X', cpf: '123', rg: '1', orgao_emissor_rg: 'SSP-DF', nacionalidade: 'brasileiro', endereco: { rua: 'R', numero: '1', bairro: 'B', cidade: 'Brasilia', uf: 'DF', cep: '70000000' }, telefone: '5561999999999', email: 'a@b.com' },
  contratante: { tipo: 'PF', nome: 'X', cpf: '123', rg: '1', orgao_emissor_rg: 'SSP-DF', nacionalidade: 'brasileiro', endereco: { rua: 'R', numero: '1', bairro: 'B', cidade: 'Brasilia', uf: 'DF', cep: '70000000' }, telefone: '5561999999999', email: 'a@b.com' },
  contratante_eh_titular: true,
  concessionaria: 'Neoenergia-DF',
  endereco_instalacao: { rua: 'R', numero: '1', bairro: 'B', cidade: 'Brasilia', uf: 'DF', cep: '70000000' },
  sistema: { kwp: 5, modalidade: 'autoconsumo_local', modulos: { marca: 'LONGi', potencia_w: 575, quantidade: 9 }, inversor: { marca: 'Sungrow', modelo: 'SG5K', potencia_kw: 5 } },
  comercial: { valor_total_brl: 25000, forma_pagamento: 'a vista PIX' },
  docs_pedidos: ['contrato'],
};

describe('renderContrato — clausula 23 literal', () => {
  it('NAO inclui clausula 23 quando disposicoes_especiais vazio', () => {
    const html = renderContrato({ ...dadosBase, disposicoes_especiais: undefined });
    expect(html).not.toMatch(/CL[ÁA]USULA 23/);
  });

  it('inclui clausula 23 com texto LITERAL quando preenchido', () => {
    const texto = '30% na assinatura e 70% na conexao pela concessionaria.';
    const html = renderContrato({ ...dadosBase, disposicoes_especiais: texto });
    expect(html).toMatch(/CL[ÁA]USULA 23/);
    expect(html).toContain(texto);
  });

  it('preserva caracteres especiais (% e parenteses) na clausula 23', () => {
    const texto = 'Garantia adicional de 5 (cinco) anos & 100% mao-de-obra.';
    const html = renderContrato({ ...dadosBase, disposicoes_especiais: texto });
    // HTML escape e aceitavel mas o conteudo semantico deve estar la
    expect(html).toContain('5 (cinco) anos');
    expect(html).toMatch(/100\s*%\s*mao-de-obra/);
  });
});
```

- [ ] **Step 2: Rodar e ver se passa (template atual já trata, talvez passe direto)**

```
npm test -- tests/closing-templates-contrato.test.ts
```

Se passar, ótimo (template já faz). Se falhar, ajustar `contrato.html.ts` pra renderizar a cláusula 23 literal (sem escape agressivo).

- [ ] **Step 3: Commit**

```bash
git add tests/closing-templates-contrato.test.ts
git commit -m "test(closing): clausula 23 literal sem reescrita"
```

---

## Phase 7 — Persist com `parent_id`

### Task 11: `closing-persist.ts` aceita `parentId` (TDD)

**Files:**
- Modify: `src/modules/closing/closing-persist.ts:5-12` (interface)
- Modify: `src/modules/closing/closing-persist.ts:23-38` (createFechamento)
- Modify: `src/modules/closing/types.ts` (FechamentoRow)
- Modify: `tests/closing-persist.test.ts`

- [ ] **Step 1: Adicionar `parent_id` em `FechamentoRow` (types.ts)**

Editar `src/modules/closing/types.ts:91-106` adicionando após `dados_snapshot`:

```typescript
  parent_id: string | null;
```

- [ ] **Step 2: Escrever teste failing pra createFechamento com parentId**

Adicionar a `tests/closing-persist.test.ts`:

```typescript
describe('ClosingPersist.createFechamento — parent_id', () => {
  it('passa parent_id no insert quando informado', async () => {
    const inserted: any[] = [];
    const sb: any = {
      from: () => ({
        insert: (row: any) => {
          inserted.push(row);
          return { select: () => ({ single: async () => ({ data: { id: 'fech-id-1' }, error: null }) }) };
        },
      }),
    };
    const p = new ClosingPersist(sb);
    await p.createFechamento({
      leadId: 'l1',
      propostaPublicaId: null,
      dados: { docs_pedidos: ['procuracao'] } as any,
      createdBy: '5561900000000',
      parentId: 'fech-id-anterior',
    });
    expect(inserted[0].parent_id).toBe('fech-id-anterior');
  });

  it('parent_id null quando nao informado', async () => {
    const inserted: any[] = [];
    const sb: any = {
      from: () => ({
        insert: (row: any) => {
          inserted.push(row);
          return { select: () => ({ single: async () => ({ data: { id: 'fech-id-2' }, error: null }) }) };
        },
      }),
    };
    const p = new ClosingPersist(sb);
    await p.createFechamento({
      leadId: 'l1',
      propostaPublicaId: null,
      dados: { docs_pedidos: ['procuracao'] } as any,
      createdBy: '5561900000000',
    });
    expect(inserted[0].parent_id ?? null).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar e confirmar 2 FAILs**

```
npm test -- tests/closing-persist.test.ts
```

- [ ] **Step 4: Atualizar `CreateFechamentoInput` e `createFechamento`**

Em `src/modules/closing/closing-persist.ts`:

```typescript
export interface CreateFechamentoInput {
  leadId: string | null;
  propostaPublicaId: string | null;
  dados: DadosFechamento;
  createdBy: string;
  parentId?: string | null;
}
```

E no método:

```typescript
  async createFechamento(input: CreateFechamentoInput): Promise<string> {
    const { data, error } = await this.sb
      .from('fechamentos')
      .insert({
        lead_id: input.leadId,
        proposta_publica_id: input.propostaPublicaId,
        docs_pedidos: input.dados.docs_pedidos,
        dados_snapshot: input.dados,
        status: 'gerado',
        created_by: input.createdBy,
        parent_id: input.parentId ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }
```

- [ ] **Step 5: Rodar testes e confirmar PASS**

```
npm test -- tests/closing-persist.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/closing/closing-persist.ts src/modules/closing/types.ts tests/closing-persist.test.ts
git commit -m "feat(closing): createFechamento aceita parentId pra rastrear refazer"
```

---

## Phase 8 — Triggers `procuracao` / `contrato` + botão modo no /fechar

### Task 12: Parser de comando aceita 3 keywords + normalização (TDD)

**Files:**
- Create: `src/modules/closing/closing-command-parser.ts`
- Create: `tests/closing-command-aliases.test.ts`
- Modify: `src/modules/closing/index.ts` (exportar)

- [ ] **Step 1: Escrever teste failing**

```typescript
// tests/closing-command-aliases.test.ts
import { describe, it, expect } from 'vitest';
import { parseClosingCommand } from '../src/modules/closing/closing-command-parser.js';

describe('parseClosingCommand', () => {
  describe('procuracao', () => {
    it('reconhece "procuracao Fernanda"', () => {
      const r = parseClosingCommand('procuracao Fernanda');
      expect(r).toEqual({ command: 'procuracao', name: 'Fernanda' });
    });
    it('reconhece "/procuracao Fernanda"', () => {
      const r = parseClosingCommand('/procuracao Fernanda');
      expect(r).toEqual({ command: 'procuracao', name: 'Fernanda' });
    });
    it('reconhece "Procuração da Fernanda" (acentos + conectivo)', () => {
      const r = parseClosingCommand('Procuração da Fernanda');
      expect(r).toEqual({ command: 'procuracao', name: 'Fernanda' });
    });
    it('reconhece "PROCURAÇÃO FERNANDA SILVA" maiusculo', () => {
      const r = parseClosingCommand('PROCURAÇÃO FERNANDA SILVA');
      expect(r).toEqual({ command: 'procuracao', name: 'FERNANDA SILVA' });
    });
    it('aceita "procuracao" sozinho (sem nome)', () => {
      const r = parseClosingCommand('procuracao');
      expect(r).toEqual({ command: 'procuracao', name: '' });
    });
  });

  describe('contrato', () => {
    it('reconhece variacoes', () => {
      expect(parseClosingCommand('contrato Joao')).toEqual({ command: 'contrato', name: 'Joao' });
      expect(parseClosingCommand('/contrato Joao')).toEqual({ command: 'contrato', name: 'Joao' });
      expect(parseClosingCommand('Contrato do Joao')).toEqual({ command: 'contrato', name: 'Joao' });
    });
  });

  describe('fechar', () => {
    it('reconhece variacoes (compat com /fechar atual)', () => {
      expect(parseClosingCommand('fechar Maria')).toEqual({ command: 'fechar', name: 'Maria' });
      expect(parseClosingCommand('/fechar Maria')).toEqual({ command: 'fechar', name: 'Maria' });
      expect(parseClosingCommand('Fechar a Maria')).toEqual({ command: 'fechar', name: 'Maria' });
    });
  });

  describe('nao reconhece', () => {
    it('texto qualquer retorna null', () => {
      expect(parseClosingCommand('oi tudo bem?')).toBeNull();
      expect(parseClosingCommand('quero saber o preco do kit 5kwp')).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar FAILs**

```
npm test -- tests/closing-command-aliases.test.ts
```

- [ ] **Step 3: Criar `src/modules/closing/closing-command-parser.ts`**

```typescript
// src/modules/closing/closing-command-parser.ts
// Reconhece comandos /procuracao, /contrato, /fechar (e variantes).
// Aceita com/sem barra, com/sem acento, maiusculo/minusculo.
// Ignora conectivos curtos ("da", "do", "de", "a", "o") apos o comando.

export type ClosingCommand = 'procuracao' | 'contrato' | 'fechar';

export interface ParsedClosingCommand {
  command: ClosingCommand;
  name: string; // pode ser '' quando comando vem sozinho
}

// Normaliza string removendo acentos pra match
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const CONECTIVOS = new Set(['da', 'do', 'de', 'a', 'o']);

export function parseClosingCommand(input: string): ParsedClosingCommand | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Quebra "comando [resto]"
  const m = trimmed.match(/^(\/?)(\S+)(.*)$/);
  if (!m) return null;
  const head = normalize(m[2]);
  const tail = m[3].trim();

  let command: ClosingCommand;
  if (head === 'procuracao') command = 'procuracao';
  else if (head === 'contrato') command = 'contrato';
  else if (head === 'fechar') command = 'fechar';
  else return null;

  // Remove conectivo curto inicial do tail ("da Fernanda" -> "Fernanda")
  if (tail) {
    const tokens = tail.split(/\s+/);
    while (tokens.length > 0 && CONECTIVOS.has(normalize(tokens[0]))) {
      tokens.shift();
    }
    return { command, name: tokens.join(' ') };
  }
  return { command, name: '' };
}
```

- [ ] **Step 4: Rodar testes e confirmar PASS**

```
npm test -- tests/closing-command-aliases.test.ts
```

- [ ] **Step 5: Exportar do barrel**

Em `src/modules/closing/index.ts`:

```typescript
export { parseClosingCommand, type ClosingCommand, type ParsedClosingCommand } from './closing-command-parser.js';
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/closing/closing-command-parser.ts tests/closing-command-aliases.test.ts src/modules/closing/index.ts
git commit -m "feat(closing): parser de comando aceita procuracao/contrato/fechar com aliases"
```

---

### Task 13: Wire-up no `src/index.ts` — parser + botão de modo

**Files:**
- Modify: `src/index.ts:902` (substituir regex de match)
- Modify: `src/index.ts:663` (handleFecharStart aceita `docsPedidos`)

- [ ] **Step 1: Importar parser no topo de `src/index.ts`**

Adicionar import na linha ~56 (junto dos outros do closing):

```typescript
import {
  // ... imports existentes
  parseClosingCommand,
  type ClosingCommand,
} from './modules/closing/index.js';
```

- [ ] **Step 2: Modificar `handleFecharStart` (linha 663)**

Adicionar parâmetro `docsPedidos`. Assinatura nova:

```typescript
  async function handleFecharStart(
    leadId: string,
    adminPhone: string,
    docsPedidos: ('procuracao' | 'contrato')[] = ['procuracao', 'contrato'], // default = ambos (compat com botao atual)
  ): Promise<void> {
```

E dentro do método, quando seta o estado inicial via `setClosingState`, passar `docs_pedidos`:

```typescript
      // Onde hoje monta `data` inicial — adicionar:
      data.docs_pedidos = docsPedidos;
```

(Localizar a chamada que seta o stage `collecting` com `data`; passa o `docs_pedidos` ali.)

- [ ] **Step 3: Substituir regex de match (linha 902) por parser**

Substituir:

```typescript
    // Sem estado: precisa ser comando /fechar ou fechar pra entrar
    const m = t.match(/^\/?fechar(?:\s+(.+))?$/i);
    if (!m) return false;
    const arg = m[1]?.trim() ?? '';
```

Por:

```typescript
    // Sem estado: precisa ser comando reconhecido (procuracao/contrato/fechar)
    const parsed = parseClosingCommand(t);
    if (!parsed) return false;
    const arg = parsed.name;
    const cmd = parsed.command;
    // Mapeia comando -> docs_pedidos
    const docsByCmd: Record<ClosingCommand, ('procuracao' | 'contrato')[] | null> = {
      procuracao: ['procuracao'],
      contrato: ['contrato'],
      fechar: null, // null = mostra botoes pra escolher
    };
    const docs = docsByCmd[cmd];
```

E logo abaixo, modificar a mensagem do caso "sem arg" (linha 906-909) pra refletir o comando atual:

```typescript
    if (!arg) {
      await setClosingState(from, { stage: 'collecting', data: { docs_pedidos: docs ?? undefined }, pending_questions: [] });
      const exemplo = cmd === 'procuracao' ? '/procuracao Camila'
                    : cmd === 'contrato' ? '/contrato Camila'
                    : '/fechar Camila';
      await sendText(from, `Pra qual cliente? Manda nome (ex: ${exemplo}) ou os dados completos.`);
      return true;
    }
```

E mais abaixo, onde chama `handleFecharStart(matches[0].id, from)` (linha 927):

```typescript
      if (matches.length === 1 && !termoEhUmaPalavra) {
        if (docs) {
          await handleFecharStart(matches[0].id, from, docs);
        } else {
          // /fechar SEM doc especifico: mostra botoes [Procuracao] [Contrato] [Ambos]
          if (metaWaba) {
            await metaWaba.sendInteractiveButtons(from,
              `Achei: ${matches[0].name}. O que você quer gerar?`,
              [
                { id: `evabt:fechar-doc:procuracao:${matches[0].id}`, title: 'Procuração' },
                { id: `evabt:fechar-doc:contrato:${matches[0].id}`, title: 'Contrato' },
                { id: `evabt:fechar-doc:ambos:${matches[0].id}`, title: 'Ambos' },
              ],
            );
          } else {
            await sendText(from, `Achei: ${matches[0].name}. Manda "procuracao ${matches[0].name}", "contrato ${matches[0].name}" ou "fechar ${matches[0].name} ambos".`);
          }
        }
        return true;
      }
```

- [ ] **Step 4: Adicionar handler do novo botão `evabt:fechar-doc:*` em `src/modules/eva-admin-buttons.ts`**

O roteador de botões admin é `src/modules/eva-admin-buttons.ts`. Tem 2 lugares pra mexer:

**4.1** Adicionar callback opcional na interface (linha ~71-78, junto dos outros `onFechar*`):

```typescript
  onFecharDocPick?: (cmd: 'procuracao' | 'contrato' | 'ambos', leadId: string) => Promise<void>;
```

**4.2** Adicionar `case` no switch (linha ~194, junto do `case 'fechar-pick'`):

```typescript
      case 'fechar-doc': {
        // ID vem como evabt:fechar-doc:<modo>:<leadId>
        // O parser do switch ja capturou o primeiro segmento ("fechar-doc"); precisamos
        // ler os 2 segmentos seguintes diretamente do buttonId original.
        // Trocar o split por algo mais granular:
        const allParts = buttonId.split(':');
        // allParts = ['evabt', 'fechar-doc', '<modo>', '<leadId>']
        const modo = allParts[2] as 'procuracao' | 'contrato' | 'ambos' | undefined;
        const ldId = allParts.slice(3).join(':'); // protege se leadId tem ':' (não tem, mas defensivo)
        if (!modo || !['procuracao','contrato','ambos'].includes(modo)) {
          await args.sendText(args.from, '⚠️ Modo invalido no botao fechar-doc.');
          return true;
        }
        if (!ldId) { await args.sendText(args.from, '⚠️ Botao sem lead id.'); return true; }
        if (args.onFecharDocPick) await args.onFecharDocPick(modo, ldId);
        else await args.sendText(args.from, '⚠️ Handler de fechar-doc nao configurado.');
        return true;
      }
```

(Se o switch atual fizer `const [, action, leadId] = buttonId.split(':')` no topo, o `case 'fechar-doc'` precisa do override acima pra ler o 4º segmento. Ler o início da função pra confirmar o padrão antes de mexer.)

**4.3** Em `src/index.ts` (~linha 2718, junto de `onFecharPick`), registrar o novo callback:

```typescript
        onFecharDocPick: (cmd, leadId) => {
          const docs: ('procuracao' | 'contrato')[] =
            cmd === 'procuracao' ? ['procuracao'] :
            cmd === 'contrato' ? ['contrato'] :
            ['procuracao', 'contrato'];
          return handleFecharStart(leadId, from, docs);
        },
```

- [ ] **Step 5: Rodar npm run build pra checar TypeScript**

```
npm run build
```

Esperado: 0 erros TS.

- [ ] **Step 6: Rodar testes**

```
npm test
```

Esperado: 0 falhas.

- [ ] **Step 7: Commit**

```bash
git add src/index.ts
git commit -m "feat(closing): triggers procuracao/contrato/fechar + botoes modo no zap"
```

---

### Task 14: Render dispatcher chama HTML+PDF conforme `docs_pedidos`

**Files:**
- Modify: `src/index.ts:724-770` (handleFecharApprove ou função que faz render+upload)

- [ ] **Step 1: Localizar função de render+upload**

```
grep -nE "renderProcuracao|renderContrato|uploadFechamento" src/index.ts | head
```

Localizar onde hoje monta os PDFs e chama `uploadFechamento`. Provavelmente em `handleFecharApprove` ou função similar (~linha 724-770 conforme grep anterior).

- [ ] **Step 2: Modificar essa função pra também montar HTMLs e passar pra uploadFechamento**

Onde hoje:

```typescript
const procuracaoHtml = renderProcuracao(dados);
const procuracaoPdf = await renderHtmlToPdf(procuracaoHtml);
// ... chama upload só com PDF
```

Mudar pra:

```typescript
const wantsProcuracao = dados.docs_pedidos.includes('procuracao');
const wantsContrato = dados.docs_pedidos.includes('contrato');

let procuracaoHtml: string | undefined;
let procuracaoPdf: Buffer | undefined;
let contratoHtml: string | undefined;
let contratoPdf: Buffer | undefined;

if (wantsProcuracao) {
  procuracaoHtml = renderProcuracao(dados);
  procuracaoPdf = await renderHtmlToPdf(procuracaoHtml);
}
if (wantsContrato) {
  contratoHtml = renderContrato(dados);
  contratoPdf = await renderHtmlToPdf(contratoHtml);
}

const links = await closingDriveUploader.uploadFechamento({
  nomeTitular: ...,
  cpfTitular: ...,
  ano: String(new Date().getFullYear()),
  version,
  procuracaoHtml, procuracaoPdf,
  contratoHtml, contratoPdf,
  dadosInputJson: JSON.stringify(dados, null, 2),
});
```

- [ ] **Step 3: Atualizar a mensagem de "pronto" no zap pra mostrar link Doc (não PDF)**

```typescript
const linhasLink: string[] = [];
if (links.procuracaoDriveLink) linhasLink.push(`📄 Procuração: ${links.procuracaoDriveLink}`);
if (links.contratoDriveLink) linhasLink.push(`📄 Contrato: ${links.contratoDriveLink}`);
const corpo = `Pronto! Documentos no Drive:\n${linhasLink.join('\n')}\n\nAbre → Ferramentas → Assinatura eletrônica → manda pro cliente.`;
await sendText(from, corpo);
```

(Se houver botões `[Abrir Drive] [Refazer] [Já enviei]`, manter — adicionar `[Já enviei]` é fast-follow se não estiver hoje; ver fast-follows.)

- [ ] **Step 4: Build + testes**

```
npm run build && npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(closing): render dispatcher segue docs_pedidos + link Doc no zap"
```

---

## Phase 9 — Smoke E2E e integração

### Task 15: Expandir `closing-e2e.test.ts` com 3 cenários

**Files:**
- Modify: `tests/closing-e2e.test.ts`

- [ ] **Step 1: Ler estrutura atual do e2e**

```
cat tests/closing-e2e.test.ts | head -100
```

- [ ] **Step 2: Identificar padrão de setup do e2e atual**

O `tests/closing-e2e.test.ts` existente cobre o fluxo `/fechar` completo. Ler o `describe` principal e copiar o helper `buildClosingHarness()` (ou equivalente) que já monta os mocks de Supabase/Drive/LLM. Os 3 cenários novos REUSAM esse harness — só mudam o input.

- [ ] **Step 3: Adicionar 3 cenários ao final do arquivo**

Modelo (ajustar nomes dos mocks conforme o padrão existente):

```typescript
describe('Closing E2E — 3 modos', () => {
  it('procuracao isolada: gera 1 Doc, sem pedir sistema/comercial', async () => {
    const harness = buildClosingHarness(); // reusa helper existente
    harness.seedLead({ id: 'l-procuracao', name: 'Fernanda Silva', phone: '5561911111111', cpf: '12345678901' });
    harness.seedProposta({ leadId: 'l-procuracao', endereco: 'R X, 1, Brasilia-DF, 70000000', uc: '3098127' });

    await harness.processCommand('procuracao Fernanda', '5561900000000');
    // Eva pede só RG (resto vem da proposta)
    await harness.processMessage('RG 1234567 SSP-DF');
    await harness.tapButton('evabt:fechar-gerar:<fechId>');

    const row = await harness.queryLastFechamento();
    expect(row.docs_pedidos).toEqual(['procuracao']);
    expect(row.procuracao_drive_link).toBeTruthy();
    expect(row.contrato_drive_link).toBeNull();
    expect(harness.driveDocCreatesByMimeType('application/vnd.google-apps.document')).toHaveLength(1);
  });

  it('contrato isolado: gera 1 Doc, pergunta clausula 23, preserva literal', async () => {
    const harness = buildClosingHarness();
    harness.seedLead({ id: 'l-contrato', name: 'Roberto Silva', phone: '5561922222222', cpf: '98765432101' });
    harness.seedProposta({
      leadId: 'l-contrato',
      endereco: 'R Y, 2, Brasilia-DF, 70100000', uc: '5555555',
      sistema: { kwp: 5, modulos: { marca: 'LONGi', potencia_w: 575, quantidade: 9 }, inversor: { marca: 'Sungrow', modelo: 'SG5K', potencia_kw: 5 } },
      valor: 28000,
    });

    await harness.processCommand('contrato Roberto', '5561900000000');
    await harness.processMessage('RG 8888888 SSP-DF, email roberto@x.com, pagamento a vista PIX');
    // Eva pergunta clausula 23
    expect(harness.lastReply()).toMatch(/condi[çc][aã]o espec[ií]fica/i);
    await harness.tapButton('evabt:disposicoes-sim');
    await harness.processMessage('30% na assinatura e 70% na conexao pela concessionaria.');
    await harness.tapButton('evabt:fechar-gerar:<fechId>');

    const row = await harness.queryLastFechamento();
    expect(row.docs_pedidos).toEqual(['contrato']);
    expect(row.dados_snapshot.disposicoes_especiais).toBe('30% na assinatura e 70% na conexao pela concessionaria.');
    expect(row.contrato_drive_link).toBeTruthy();
    expect(row.procuracao_drive_link).toBeNull();
  });

  it('ambos: gera 2 Docs na mesma pasta', async () => {
    const harness = buildClosingHarness();
    harness.seedLead({ id: 'l-ambos', name: 'Camila X', phone: '5561933333333', cpf: '11122233344' });
    harness.seedProposta({ leadId: 'l-ambos', endereco: 'R Z, 3, Brasilia-DF, 70200000', uc: '7777777', sistema: {...}, valor: 30000 });

    await harness.processCommand('fechar Camila X', '5561900000000');
    await harness.tapButton('evabt:fechar-doc:ambos:l-ambos');
    // Coleta union + clausula 23
    await harness.processMessage('RG 1010101 SSP-DF, email camila@x.com, a vista');
    await harness.tapButton('evabt:disposicoes-nao');
    await harness.tapButton('evabt:fechar-gerar:<fechId>');

    const row = await harness.queryLastFechamento();
    expect(row.docs_pedidos.sort()).toEqual(['contrato', 'procuracao']);
    expect(row.procuracao_drive_link).toBeTruthy();
    expect(row.contrato_drive_link).toBeTruthy();
    expect(row.drive_folder_id).toBeTruthy(); // mesma pasta
    expect(harness.driveDocCreatesByMimeType('application/vnd.google-apps.document')).toHaveLength(2);
  });
});
```

Se o harness existente não expõe `driveDocCreatesByMimeType` ou `tapButton`, adicionar esses helpers no harness (mudança contida no próprio arquivo de teste).

- [ ] **Step 3: Rodar e iterar até PASS**

```
npm test -- tests/closing-e2e.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add tests/closing-e2e.test.ts
git commit -m "test(closing): e2e cobre 3 modos (procuracao/contrato/ambos)"
```

---

## Phase 10 — Final: Self-test + Deploy

### Task 16: Build limpo + suite completa + push (com autorização)

- [ ] **Step 1: Build limpo**

```
npm run build
```

Esperado: 0 erros TS.

- [ ] **Step 2: Suite completa**

```
npm test
```

Esperado: 0 falhas. Anotar coverage de `closing-*`.

- [ ] **Step 3: Pedir autorização do Junior pra push**

Mensagem ao Junior:
> "Tudo verde local: build OK, N testes passam, M migrations prontas (041, 041b, 042) pra você aplicar no SQL Editor. Posso pushar pra main?"

Aguardar resposta explícita ("pode pushar" / "manda push"). Se não autorizar, parar aqui.

- [ ] **Step 4: Junior aplica migrations no Supabase (ordem obrigatória)**

1. `041_propostas_publicas_lead_id.sql`
2. `041b_backfill_propostas_publicas_lead_id.sql`
3. `042_fechamentos_parent_id.sql`

Junior confirma com `SELECT count(*) FROM propostas_publicas WHERE lead_id IS NOT NULL`.

- [ ] **Step 5: Após confirmação das migrations + autorização explícita, push**

```bash
git push origin main
```

- [ ] **Step 6: Junior clica Implantar no Easypanel**

(Junior faz manual no painel; aguardar confirmação.)

- [ ] **Step 7: Smoke manual em prod (Junior)**

1. No zap, digita `procuracao Fernanda`
2. Confere: lead Fernanda criado automaticamente, Doc procuração aparece na pasta Drive
3. Abre Doc, dispara eSignature manual
4. Digita `contrato <cliente que tem proposta>`
5. Confere coleta + cláusula 23 perguntada + Doc gerado
6. Digita `fechar Camila` → confere botões `[Procuração] [Contrato] [Ambos]`
7. Confere dashboard: linhas em `fechamentos`

- [ ] **Step 8: Commit final de housekeeping (se necessário)**

Se durante smoke surgir 1-2 fixes pequenos, commit como `fix(closing): <descrição>` e push imediato.

---

## Fast-follows (pós-deploy, fora do escopo principal)

- Botão `[Já enviei pra ela]` muda status pra `enviado_cliente` (se não houver hoje)
- Métricas no dashboard (closing.command.received, closing.doc.generated etc — spec §7)
- Dedupe via hash (mesmo lead+docs em <5min retorna fechamento existente — spec §3.9)
- Mapeamento de Workspace eSignature webhook → atualizar status `enviado_cliente` automático (out of scope desta entrega)
