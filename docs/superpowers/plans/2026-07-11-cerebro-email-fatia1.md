# Elo (Cérebro) + Máquina de E-mail — Fatia 1 · Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Goal:** Criar a espinha de eventos do Elo (`eventos_elo`) e a primeira sequência de e-mail que nutre e converte lead frio — com envio via Resend, tracking de abertura/clique, autoria mista com trava de preço, reação "lead quente" no WhatsApp e uma aba de métricas no menu Marketing.

**Architecture:** Tudo no repo `ecosunpower-agente` (TypeScript Node ESM — imports terminam em `.js`; Supabase service-role via `SupabaseService`; Express server-rendered; vitest). A máquina de e-mail **espelha o padrão da cadência da Eva** (`cadence.ts` + `eva_cadence`): scheduler de 15 min, gate de horário BRT, CAS lock e idempotência `unique(lead_id, step)`. Alerta de lead quente **reusa** `sendAdminWithButtons` + `acquireAlertLock`. A aba de UI **espelha** a aba Blog. Novo código de e-mail vive em `src/modules/email/`; a espinha em `src/modules/elo/`.

**Tech Stack:** TypeScript (ESM), Supabase/Postgres, `@anthropic-ai/sdk` (Claude Haiku `claude-haiku-4-5-20251001`), Resend (nova dependência), Express, vitest.

**Base:** Spec `docs/superpowers/specs/2026-07-11-cerebro-ecossistema-email-fatia1-design.md`. Branch: `feat/cerebro-email-fatia1`.

**Regras do repo (CLAUDE.md):** TDD (teste falha → mínimo → passa → commit). `npx tsc --noEmit` limpo + `npx vitest run` verde (ignore as 2 falhas pré-existentes em `tests/supabase-vincular-novo.test.ts`). `git add <arquivo>` por nome, nunca `-A`. Nunca pushar `main` sem o Junior. Combinar o número da migration no grupo antes.

---

## Estrutura de arquivos (o que cada um faz)

**Criar:**
- `supabase/migrations/069_elo_email.sql` — tabelas novas + colunas de opt-out.
- `src/modules/elo/eventos.ts` — a espinha: `registrarEvento()` (best-effort) + tipos.
- `src/modules/email/price-lock.ts` — trava de preço (lógica pura).
- `src/modules/email/templates.ts` — os 6 modelos + render com variáveis + link de descadastro.
- `src/modules/email/email-writer.ts` — gera assunto+abertura com Haiku, aplica trava de preço.
- `src/modules/email/resend-client.ts` — wrapper de envio + verificação de assinatura do webhook.
- `src/modules/email/resend-events.ts` — mapeia payload do webhook Resend → evento da espinha (lógica pura).
- `src/modules/email/email-sequence.ts` — `EmailSequenceService` (motor, espelha `CadenceService`) + gate `podeEnviarAgora()` (puro).
- `src/modules/email/hot-email.ts` — regra de "lead quente por e-mail" (lógica pura).
- `src/modules/dashboard/email-views.ts` — HTML da aba E-mail Marketing.
- `scripts/import-emails.ts` — import one-off da planilha histórica.
- Testes correspondentes em `tests/*.test.ts`.

**Modificar:**
- `src/modules/supabase.ts` — métodos novos da sequência (espelham cadência) + queries de métricas + opt-out.
- `src/modules/dashboard/views.ts:135` — item novo na sidebar Marketing + union `active`.
- `src/modules/dashboard/router.ts` — rotas da aba E-mail + webhook Resend.
- `src/index.ts` — scheduler 15min + primeira passada + roteamento do botão `evabt:email-*`.
- `package.json` — dependência `resend`.

**Reusar (NÃO recriar):** `cadence.ts` (padrão do motor), `eva-admin-buttons.ts` `sendAdminWithButtons`, `eva-alerts.ts` `acquireAlertLock`, `dashboard/audit.ts` (padrão best-effort), `dashboard/blog-views.ts`+`router.ts:1245` (espelho da aba), `permissions.ts` `can`/`exigir`.

---

## Task 0: Pré-requisitos (setup humano — não é código)

> Estas etapas o Junior/filhos fazem fora do código. Listadas para não travar as tasks seguintes. As tasks de código NÃO dependem de segredos para rodar testes (o repo testa sem env).

- [ ] Combinar no grupo do WhatsApp que a **migration 069** é desta feature.
- [ ] Criar conta no **Resend**, autenticar o domínio de envio (ex: `news.ecosunpower.eng.br`) com **SPF, DKIM e DMARC** no DNS. Confirmar domínio "verified".
- [ ] Guardar `RESEND_API_KEY` e o **signing secret** do webhook como envs no EasyPanel (nunca no repo/chat).
- [ ] Exportar a planilha histórica de leads com e-mail (CSV com colunas `telefone,email,nome` no mínimo) e salvar em `scripts/data/emails-historico.csv` (não commitar dados de leads — adicionar ao `.gitignore`).
- [ ] Definir envs opcionais: `EMAIL_SEQ_BATCH_LIMIT` (default 50), `EMAIL_FROM` (ex: `"EcoSunPower <contato@news.ecosunpower.eng.br>"`), `EMAIL_HOT_OPENS` (default 3).

---

## Task 1: Migration 069 — espinha + tabelas de e-mail + opt-out

**Files:**
- Create: `supabase/migrations/069_elo_email.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- 069_elo_email.sql — Espinha do Elo + Maquina de E-mail (Fatia 1)

-- 1) A ESPINHA: linha do tempo unica de eventos
create table if not exists eventos_elo (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  lead_id uuid references leads(id) on delete set null,
  cliente_id uuid,
  departamento text,            -- comercial|atendimento|marketing|operacao|relacionamento|financeiro|engenharia
  canal text,                   -- whatsapp|email|sistema|web
  origem text,                  -- modulo/funcao que gerou
  payload jsonb not null default '{}'::jsonb,
  company_id uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at timestamptz not null default now()
);
create index if not exists idx_eventos_elo_lead on eventos_elo (lead_id, created_at desc);
create index if not exists idx_eventos_elo_tipo on eventos_elo (tipo, created_at desc);
create index if not exists idx_eventos_elo_payload on eventos_elo using gin (payload);

-- 2) Sequencia de e-mail (idempotencia como eva_cadence)
create table if not exists email_sequencia (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  step int not null,
  status text not null default 'pending',   -- pending|sending|sent|cancelled|failed
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  provider_message_id text,
  subject_sent text,
  cancelled_reason text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (lead_id, step)
);
create index if not exists idx_email_seq_due on email_sequencia (scheduled_for)
  where status = 'pending';

-- 3) Modelos aprovados (corpo dos e-mails)
create table if not exists email_modelos (
  id uuid primary key default gen_random_uuid(),
  step int not null unique,
  nome text not null,
  assunto_padrao text not null,   -- fallback se a IA falhar/travar
  corpo_html text not null,       -- com {nome},{cidade},{o_que_pediu},{link_descadastro}
  ativo boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 4) Descadastro (LGPD)
create table if not exists email_descadastro (
  email text primary key,
  lead_id uuid references leads(id) on delete set null,
  motivo text,
  created_at timestamptz not null default now()
);

-- 5) Marcacoes no lead
alter table leads add column if not exists email_opt_out boolean not null default false;
alter table leads add column if not exists email_origem text;  -- import|formulario|eva|manual
```

- [ ] **Step 2: Aplicar no Supabase (SQL Editor) e conferir**

Rodar o SQL no SQL Editor do projeto `kupnsoyymulbdzakqlqc`. Depois confirmar:
```sql
select table_name from information_schema.tables
 where table_name in ('eventos_elo','email_sequencia','email_modelos','email_descadastro');
```
Esperado: 4 linhas.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/069_elo_email.sql
git commit -m "feat(069): espinha eventos_elo + tabelas de e-mail + opt-out"
```

---

## Task 2: A espinha — `registrarEvento()`

Best-effort (nunca lança), espelhando o padrão de `src/modules/dashboard/audit.ts`. Recebe o client por parâmetro (testável com fake).

**Files:**
- Create: `src/modules/elo/eventos.ts`
- Test: `tests/elo-eventos.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect } from 'vitest';
import { registrarEvento } from '../src/modules/elo/eventos.js';

function fakeClient() {
  const inserts: any[] = [];
  return {
    inserts,
    from() {
      return { insert: async (row: any) => { inserts.push(row); return { error: null }; } };
    },
  };
}

describe('registrarEvento', () => {
  it('insere um evento com defaults corretos', async () => {
    const c = fakeClient();
    await registrarEvento(c as any, { tipo: 'email_enviado', leadId: 'L1', canal: 'email', payload: { step: 1 } });
    expect(c.inserts).toHaveLength(1);
    expect(c.inserts[0].tipo).toBe('email_enviado');
    expect(c.inserts[0].lead_id).toBe('L1');
    expect(c.inserts[0].payload).toEqual({ step: 1 });
  });

  it('nunca lanca se o insert falha', async () => {
    const c = { from() { return { insert: async () => { throw new Error('boom'); } }; } };
    await expect(
      registrarEvento(c as any, { tipo: 'email_aberto' })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/elo-eventos.test.ts`
Esperado: FAIL ("Cannot find module .../elo/eventos.js").

- [ ] **Step 3: Implementar o mínimo**

```ts
// src/modules/elo/eventos.ts
export type EventoInput = {
  tipo: string;
  leadId?: string | null;
  clienteId?: string | null;
  departamento?: string | null;
  canal?: 'whatsapp' | 'email' | 'sistema' | 'web' | null;
  origem?: string | null;
  payload?: Record<string, unknown>;
};

// Recebe qualquer client com .from(...).insert(...) (SupabaseService.getClient()).
export async function registrarEvento(client: any, ev: EventoInput): Promise<void> {
  try {
    const { error } = await client.from('eventos_elo').insert({
      tipo: ev.tipo,
      lead_id: ev.leadId ?? null,
      cliente_id: ev.clienteId ?? null,
      departamento: ev.departamento ?? null,
      canal: ev.canal ?? null,
      origem: ev.origem ?? null,
      payload: ev.payload ?? {},
    });
    if (error) console.warn('[elo] evento nao gravado (ignorado):', error.message ?? error);
  } catch (err) {
    console.warn('[elo] evento falhou (ignorado):', (err as Error)?.message ?? err);
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/elo-eventos.test.ts`
Esperado: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/elo/eventos.ts tests/elo-eventos.test.ts
git commit -m "feat(elo): registrarEvento best-effort na espinha eventos_elo"
```

---

## Task 3: Trava de preço (lógica pura)

Rejeita/limpa qualquer texto gerado pela IA que contenha valor em R$ ou promessa de preço. Usada no email-writer.

**Files:**
- Create: `src/modules/email/price-lock.ts`
- Test: `tests/email-price-lock.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect } from 'vitest';
import { contemPreco, aplicarTravaPreco } from '../src/modules/email/price-lock.js';

describe('trava de preco', () => {
  it('detecta valores em reais', () => {
    expect(contemPreco('fica por R$ 19.900')).toBe(true);
    expect(contemPreco('economize 850 reais por mes')).toBe(true);
    expect(contemPreco('a partir de 12x de 499')).toBe(true);
    expect(contemPreco('parcelas de R$1.200,00')).toBe(true);
  });

  it('nao acusa texto sem preco', () => {
    expect(contemPreco('Ola Joao, tudo bem em Brasilia?')).toBe(false);
    expect(contemPreco('sua conta de luz pode cair muito')).toBe(false);
  });

  it('aplicarTravaPreco troca o texto suspeito pelo fallback', () => {
    expect(aplicarTravaPreco('sai por R$ 19.900', 'Ola!')).toBe('Ola!');
    expect(aplicarTravaPreco('Ola Joao', 'fallback')).toBe('Ola Joao');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/email-price-lock.test.ts`
Esperado: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// src/modules/email/price-lock.ts
const PADROES: RegExp[] = [
  /r\$\s?\d/i,                      // R$ 19.900 / R$1.200
  /\d+\s?(reais|real)\b/i,         // 850 reais
  /\d+\s?x\s?(de\s?)?\d/i,         // 12x de 499
  /\bde\s?\d[\d.,]*\s?(reais|r\$)/i,
];

export function contemPreco(texto: string): boolean {
  const t = texto ?? '';
  return PADROES.some((re) => re.test(t));
}

// Se o texto gerado tem preco, devolve o fallback seguro; senao devolve o texto.
export function aplicarTravaPreco(texto: string, fallback: string): string {
  return contemPreco(texto) ? fallback : texto;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/email-price-lock.test.ts`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/email/price-lock.ts tests/email-price-lock.test.ts
git commit -m "feat(email): trava de preco (nunca cravar valor no e-mail)"
```

---

## Task 4: Modelos + render com variáveis + link de descadastro

**Files:**
- Create: `src/modules/email/templates.ts`
- Test: `tests/email-templates.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect } from 'vitest';
import { renderTemplate, STEPS_JORNADA } from '../src/modules/email/templates.js';

describe('render de template', () => {
  it('substitui variaveis e injeta descadastro', () => {
    const html = renderTemplate('<p>Ola {nome} de {cidade}!</p>{link_descadastro}', {
      nome: 'Joao', cidade: 'Brasilia', o_que_pediu: 'orcamento', link_descadastro: 'https://x/u/abc',
    });
    expect(html).toContain('Ola Joao de Brasilia!');
    expect(html).toContain('https://x/u/abc');
    expect(html).not.toContain('{nome}');
  });

  it('variavel ausente vira vazio, nao quebra', () => {
    const html = renderTemplate('Oi {nome}{cidade}', { nome: 'Ana' } as any);
    expect(html).toBe('Oi Ana');
  });

  it('a jornada tem 6 steps com dias 0,2,5,10,18,30', () => {
    expect(STEPS_JORNADA.map((s) => s.dia)).toEqual([0, 2, 5, 10, 18, 30]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/email-templates.test.ts`
Esperado: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/modules/email/templates.ts
export type TemplateVars = {
  nome?: string; cidade?: string; o_que_pediu?: string; link_descadastro?: string;
};

export function renderTemplate(html: string, vars: TemplateVars): string {
  return html.replace(/\{(\w+)\}/g, (_m, chave: string) => {
    const v = (vars as Record<string, unknown>)[chave];
    return v == null ? '' : String(v);
  });
}

// Metadados da jornada v1 (o corpo real fica em email_modelos no banco;
// aqui ficam os dias e o tema/guidance p/ a IA gerar assunto+abertura).
export const STEPS_JORNADA: Array<{ step: number; dia: number; tema: string }> = [
  { step: 1, dia: 0,  tema: 'Boas-vindas + o valor de gerar a propria energia' },
  { step: 2, dia: 2,  tema: 'Prova social: um caso de sucesso real de cliente' },
  { step: 3, dia: 5,  tema: 'Educacao: quanto economiza / derrubando mitos' },
  { step: 4, dia: 10, tema: 'Condicao / leve urgencia (sem citar valor)' },
  { step: 5, dia: 18, tema: 'Historia de um cliente parecido com ele' },
  { step: 6, dia: 30, tema: 'Ainda pensando? convite pra conversar' },
];
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/email-templates.test.ts`
Esperado: PASS.

- [ ] **Step 5: Seed dos 6 modelos (SQL, best-effort de conteúdo)**

Criar `supabase/migrations/070_email_modelos_seed.sql` (número a combinar no grupo) com `insert into email_modelos (step, nome, assunto_padrao, corpo_html) values (...)` para os 6 steps. O corpo HTML usa `{nome}`, `{cidade}`, `{o_que_pediu}`, `{link_descadastro}` e é aprovado pelo Junior antes de aplicar. (Conteúdo escrito na execução, revisado pelo Junior — é o "modelo aprovado" da autoria mista.)

- [ ] **Step 6: Commit**

```bash
git add src/modules/email/templates.ts tests/email-templates.test.ts
git commit -m "feat(email): render de template + metadados da jornada v1"
```

---

## Task 5: Gate de envio (dias úteis + horário BRT) — lógica pura

Espelha `cadence.ts:254-258`, mas com a regra nova **só dias úteis**.

**Files:**
- Create: `src/modules/email/email-sequence.ts` (só o gate nesta task)
- Test: `tests/email-gate.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect } from 'vitest';
import { podeEnviarAgora } from '../src/modules/email/email-sequence.js';

// datas em UTC; BRT = UTC-3
describe('podeEnviarAgora (dias uteis 9-20 BRT)', () => {
  it('quarta 12h BRT (15h UTC) -> true', () => {
    expect(podeEnviarAgora(new Date('2026-07-15T15:00:00Z'))).toBe(true);
  });
  it('quarta 6h BRT (09h UTC nao, 6h) -> antes das 9 -> false', () => {
    expect(podeEnviarAgora(new Date('2026-07-15T09:00:00Z'))).toBe(false); // 6h BRT
  });
  it('quarta 21h BRT (00h UTC do dia seguinte) -> fora da janela', () => {
    expect(podeEnviarAgora(new Date('2026-07-16T00:00:00Z'))).toBe(false); // 21h BRT qua
  });
  it('sabado 12h BRT -> false (fim de semana)', () => {
    expect(podeEnviarAgora(new Date('2026-07-18T15:00:00Z'))).toBe(false);
  });
  it('domingo 12h BRT -> false', () => {
    expect(podeEnviarAgora(new Date('2026-07-19T15:00:00Z'))).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/email-gate.test.ts`
Esperado: FAIL.

- [ ] **Step 3: Implementar (só o gate)**

```ts
// src/modules/email/email-sequence.ts
// Envia so em dias uteis (seg-sex), das 9h as 20h BRT (UTC-3).
export function podeEnviarAgora(now: Date = new Date()): boolean {
  const brtMs = now.getTime() - 3 * 60 * 60 * 1000;
  const brt = new Date(brtMs);
  const dia = brt.getUTCDay();          // 0=domingo ... 6=sabado
  const hora = brt.getUTCHours();
  if (dia === 0 || dia === 6) return false;
  return hora >= 9 && hora < 20;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/email-gate.test.ts`
Esperado: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/email/email-sequence.ts tests/email-gate.test.ts
git commit -m "feat(email): gate de envio dias uteis 9-20 BRT"
```

---

## Task 6: Métodos da sequência no SupabaseService

Espelham os da cadência (`supabase.ts:710-775`). Estender a classe existente — **não criar outro client**.

**Files:**
- Modify: `src/modules/supabase.ts`
- Test: `tests/email-supabase-methods.test.ts` (testa a montagem da query via client fake)

- [ ] **Step 1: Teste que falha** (verifica o CAS lock e o due-query)

```ts
import { describe, it, expect } from 'vitest';
import { SupabaseService } from '../src/modules/supabase.js';

// client fake que grava a cadeia de chamadas
function fake(rows: any[] = []) {
  const calls: any = { filters: [] };
  const chain: any = {
    _rows: rows,
    select() { return chain; },
    insert(v: any) { calls.insert = v; return chain; },
    update(v: any) { calls.update = v; return chain; },
    eq(k: string, val: any) { calls.filters.push([k, val]); return chain; },
    lte(k: string, val: any) { calls.filters.push(['lte', k, val]); return chain; },
    limit() { return chain; },
    async then(res: any) { res({ data: rows, error: null }); }, // await -> {data,error}
  };
  return { client: { from: () => chain }, calls };
}

describe('lockEmailForSending (CAS)', () => {
  it('so trava se status ainda for pending', async () => {
    const { client, calls } = fake([{ id: 'S1' }]);
    const svc = Object.create(SupabaseService.prototype) as any;
    svc.client = client;
    const ok = await svc.lockEmailForSending('S1');
    expect(ok).toBe(true);
    expect(calls.update).toEqual({ status: 'sending' });
    expect(calls.filters).toContainEqual(['status', 'pending']);
  });
});
```

> Nota de execução: ajuste o fake ao formato real de retorno usado nos outros métodos de `supabase.ts` (o subagente deve olhar `getDueCadenceSteps`/`lockCadenceForSending` em `supabase.ts:710-775` e espelhar exatamente o mesmo estilo de `await`/`.select()`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/email-supabase-methods.test.ts`
Esperado: FAIL (métodos não existem).

- [ ] **Step 3: Implementar os métodos** (espelhando cadência)

Adicionar em `SupabaseService` (copiando a forma de `getDueCadenceSteps`, `lockCadenceForSending`, `markCadenceSent`, `markCadenceFailed`, `scheduleCadence`):

```ts
// --- Sequencia de e-mail (espelha cadencia) ---
async scheduleEmailSequence(leadId: string): Promise<void> {
  // cria os 6 steps pending com scheduled_for = now + dia*24h (dias corridos;
  // o gate podeEnviarAgora segura envio fora de dia util/horario).
  const dias = [0, 2, 5, 10, 18, 30];
  const now = Date.now();
  const rows = dias.map((d, i) => ({
    lead_id: leadId, step: i + 1, status: 'pending',
    scheduled_for: new Date(now + d * 24 * 60 * 60 * 1000).toISOString(),
  }));
  await this.client.from('email_sequencia').upsert(rows, { onConflict: 'lead_id,step', ignoreDuplicates: true });
}

async getDueEmailSteps(batchLimit = 50): Promise<any[]> {
  const lim = Math.min(Math.max(batchLimit, 1), 200);
  const { data, error } = await this.client
    .from('email_sequencia')
    .select('id, lead_id, step, leads!inner(id, name, city, email, email_opt_out, profile)')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .limit(lim);
  if (error) { console.warn('[email] getDueEmailSteps:', error.message); return []; }
  return data ?? [];
}

async lockEmailForSending(id: string): Promise<boolean> {
  const { data } = await this.client
    .from('email_sequencia').update({ status: 'sending' })
    .eq('id', id).eq('status', 'pending').select('id');
  return Array.isArray(data) && data.length > 0;
}

async markEmailSent(id: string, providerMessageId: string, subject: string): Promise<void> {
  await this.client.from('email_sequencia')
    .update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: providerMessageId, subject_sent: subject })
    .eq('id', id).eq('status', 'sending');
}

async markEmailFailed(id: string, err: string): Promise<void> {
  await this.client.from('email_sequencia')
    .update({ status: 'failed', error_message: err.slice(0, 500) })
    .eq('id', id).eq('status', 'sending');
}

async cancelEmailSequence(leadId: string, reason: string): Promise<void> {
  await this.client.from('email_sequencia')
    .update({ status: 'cancelled', cancelled_reason: reason })
    .eq('lead_id', leadId).eq('status', 'pending');
}

async isEmailDescadastrado(email: string): Promise<boolean> {
  const { data } = await this.client.from('email_descadastro').select('email').eq('email', email.toLowerCase()).limit(1);
  return Array.isArray(data) && data.length > 0;
}

async registrarDescadastro(email: string, leadId: string | null, motivo: string): Promise<void> {
  await this.client.from('email_descadastro').upsert({ email: email.toLowerCase(), lead_id: leadId, motivo });
  if (leadId) await this.client.from('leads').update({ email_opt_out: true }).eq('id', leadId);
}

async getModeloEmail(step: number): Promise<any | null> {
  const { data } = await this.client.from('email_modelos').select('*').eq('step', step).eq('ativo', true).limit(1);
  return Array.isArray(data) && data[0] ? data[0] : null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/email-supabase-methods.test.ts`
Esperado: PASS. Rodar também `npx tsc --noEmit` (limpo).

- [ ] **Step 5: Commit**

```bash
git add src/modules/supabase.ts tests/email-supabase-methods.test.ts
git commit -m "feat(email): metodos de sequencia no SupabaseService (espelham cadencia)"
```

---

## Task 7: Wrapper do Resend + verificação de webhook

**Files:**
- Modify: `package.json` (add `resend`)
- Create: `src/modules/email/resend-client.ts`
- Create: `src/modules/email/resend-events.ts` (mapeamento puro)
- Test: `tests/resend-events.test.ts`

- [ ] **Step 1: Instalar dependência**

Run: `npm install resend`
(Se houver conflito de peer deps como o do bcryptjs, usar `npm install resend --legacy-peer-deps`.)

- [ ] **Step 2: Teste que falha** (mapeamento webhook → evento, lógica pura)

```ts
import { describe, it, expect } from 'vitest';
import { mapResendEvento } from '../src/modules/email/resend-events.js';

describe('mapResendEvento', () => {
  it('email.opened -> email_aberto', () => {
    const ev = mapResendEvento({ type: 'email.opened', data: { email_id: 'm1', to: ['a@x.com'] } });
    expect(ev?.tipo).toBe('email_aberto');
    expect(ev?.payload).toMatchObject({ provider_message_id: 'm1' });
  });
  it('email.clicked -> email_clicado', () => {
    expect(mapResendEvento({ type: 'email.clicked', data: { email_id: 'm1' } })?.tipo).toBe('email_clicado');
  });
  it('tipo desconhecido -> null', () => {
    expect(mapResendEvento({ type: 'email.whatever', data: {} })).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/resend-events.test.ts`
Esperado: FAIL.

- [ ] **Step 4: Implementar mapeamento + wrapper**

```ts
// src/modules/email/resend-events.ts
import type { EventoInput } from '../elo/eventos.js';

const MAPA: Record<string, string> = {
  'email.delivered': 'email_entregue',
  'email.opened': 'email_aberto',
  'email.clicked': 'email_clicado',
  'email.bounced': 'email_bounce',
  'email.complained': 'email_descadastro',
};

export function mapResendEvento(body: any): EventoInput | null {
  const tipo = MAPA[body?.type];
  if (!tipo) return null;
  return {
    tipo, canal: 'email', origem: 'resend-webhook',
    payload: {
      provider_message_id: body?.data?.email_id ?? null,
      to: body?.data?.to ?? null,
      link: body?.data?.link ?? null,
    },
  };
}
```

```ts
// src/modules/email/resend-client.ts
import { Resend } from 'resend';

export type EnvioEmail = { to: string; subject: string; html: string };

export class EmailSender {
  private resend: Resend;
  constructor(apiKey: string, private from: string) { this.resend = new Resend(apiKey); }

  // devolve o id da mensagem no provider (para casar com os webhooks)
  async enviar(e: EnvioEmail): Promise<string> {
    const { data, error } = await this.resend.emails.send({
      from: this.from, to: e.to, subject: e.subject, html: e.html,
    });
    if (error) throw new Error(error.message ?? 'resend send error');
    return data?.id ?? '';
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/resend-events.test.ts`
Esperado: PASS. `npx tsc --noEmit` limpo.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/modules/email/resend-client.ts src/modules/email/resend-events.ts tests/resend-events.test.ts
git commit -m "feat(email): wrapper Resend + mapeamento de webhook para eventos"
```

---

## Task 8: Email writer (assunto + abertura via Haiku + trava de preço)

**Files:**
- Create: `src/modules/email/email-writer.ts`
- Test: `tests/email-writer.test.ts`

- [ ] **Step 1: Teste que falha** (a trava de preço é o que testamos de verdade; o Anthropic é injetado como fake)

```ts
import { describe, it, expect } from 'vitest';
import { gerarAssuntoAbertura } from '../src/modules/email/email-writer.js';

function fakeAnthropic(texto: string) {
  return { messages: { create: async () => ({ content: [{ type: 'text', text: texto }] }) } };
}

describe('gerarAssuntoAbertura', () => {
  it('usa o texto da IA quando nao tem preco', async () => {
    const anthropic = fakeAnthropic('ASSUNTO: Joao, sua conta pode cair\nABERTURA: Oi Joao, vi que voce e de Brasilia');
    const r = await gerarAssuntoAbertura(anthropic as any, { step: 1, tema: 'boas-vindas', nome: 'Joao', cidade: 'Brasilia' }, 'Assunto padrao');
    expect(r.assunto).toContain('Joao');
    expect(r.abertura).toContain('Brasilia');
  });

  it('cai pro assunto padrao se a IA cravar preco', async () => {
    const anthropic = fakeAnthropic('ASSUNTO: Economize R$ 850 por mes\nABERTURA: paga so 12x de 499');
    const r = await gerarAssuntoAbertura(anthropic as any, { step: 1, tema: 'x', nome: 'Ana', cidade: 'GO' }, 'Sua energia solar');
    expect(r.assunto).toBe('Sua energia solar');
    expect(r.abertura).toBe('');   // abertura com preco vira vazia (o corpo do modelo assume)
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/email-writer.test.ts`
Esperado: FAIL.

- [ ] **Step 3: Implementar** (usa o padrão `messages.create` de `cadence.ts:442`)

```ts
// src/modules/email/email-writer.ts
import { aplicarTravaPreco } from './price-lock.js';

export type WriterCtx = { step: number; tema: string; nome?: string; cidade?: string; oQuePediu?: string };

export async function gerarAssuntoAbertura(
  anthropic: any, ctx: WriterCtx, assuntoPadrao: string,
): Promise<{ assunto: string; abertura: string }> {
  const system =
    'Voce escreve e-mails curtos e humanos para a EcoSunPower (energia solar). ' +
    'NUNCA cite preco, valor em reais, parcelas ou numeros de economia. ' +
    'Responda EXATAMENTE no formato:\nASSUNTO: <ate 60 caracteres>\nABERTURA: <1 frase>';
  const user =
    `Tema do e-mail (step ${ctx.step}): ${ctx.tema}\n` +
    `Lead: nome=${ctx.nome ?? ''}, cidade=${ctx.cidade ?? ''}, pediu=${ctx.oQuePediu ?? ''}`;

  let assunto = assuntoPadrao, abertura = '';
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 200,
      system, messages: [{ role: 'user', content: user }],
    });
    const txt = (resp.content.find((b: any) => b.type === 'text')?.text ?? '') as string;
    const mA = txt.match(/ASSUNTO:\s*(.+)/i);
    const mB = txt.match(/ABERTURA:\s*(.+)/i);
    if (mA) assunto = mA[1].trim();
    if (mB) abertura = mB[1].trim();
  } catch (err) {
    console.warn('[email-writer] IA falhou, usando padrao:', (err as Error)?.message);
  }
  // Trava de preco: se a IA cravou valor, cai pro seguro.
  assunto = aplicarTravaPreco(assunto, assuntoPadrao);
  abertura = aplicarTravaPreco(abertura, '');
  return { assunto, abertura };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/email-writer.test.ts`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/email/email-writer.ts tests/email-writer.test.ts
git commit -m "feat(email): writer Haiku (assunto+abertura) com trava de preco"
```

---

## Task 9: Regra de "lead quente por e-mail" (lógica pura)

**Files:**
- Create: `src/modules/email/hot-email.ts`
- Test: `tests/hot-email.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect } from 'vitest';
import { isLeadQuentePorEmail } from '../src/modules/email/hot-email.js';

describe('isLeadQuentePorEmail', () => {
  it('quente se abriu >= 3 vezes', () => {
    expect(isLeadQuentePorEmail({ aberturas: 3, cliques: 0 }, { minAberturas: 3 })).toBe(true);
  });
  it('quente se clicou ao menos 1x', () => {
    expect(isLeadQuentePorEmail({ aberturas: 1, cliques: 1 }, { minAberturas: 3 })).toBe(true);
  });
  it('nao quente se abriu 2 e nao clicou', () => {
    expect(isLeadQuentePorEmail({ aberturas: 2, cliques: 0 }, { minAberturas: 3 })).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/hot-email.test.ts`
Esperado: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/modules/email/hot-email.ts
export type EmailComportamento = { aberturas: number; cliques: number };
export function isLeadQuentePorEmail(c: EmailComportamento, opts: { minAberturas: number }): boolean {
  return c.cliques >= 1 || c.aberturas >= opts.minAberturas;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/hot-email.test.ts`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/email/hot-email.ts tests/hot-email.test.ts
git commit -m "feat(email): regra de lead quente por e-mail"
```

---

## Task 10: Motor da sequência (`EmailSequenceService.processSequence`)

Junta tudo: due steps → lock → modelo → writer → render → enviar → markSent → evento. Espelha `CadenceService.processCadence` (`cadence.ts:253-385`).

**Files:**
- Modify: `src/modules/email/email-sequence.ts` (adiciona a classe; o gate já existe)
- Test: `tests/email-sequence-service.test.ts`

- [ ] **Step 1: Teste que falha** (injeta supabase/anthropic/sender fakes; verifica que envia e marca)

```ts
import { describe, it, expect, vi } from 'vitest';
import { EmailSequenceService } from '../src/modules/email/email-sequence.js';

describe('EmailSequenceService.processSequence', () => {
  it('envia um step due e marca como enviado', async () => {
    const supa = {
      getDueEmailSteps: vi.fn().mockResolvedValue([
        { id: 'S1', step: 1, leads: { id: 'L1', name: 'Joao', city: 'Bsb', email: 'j@x.com', email_opt_out: false } },
      ]),
      lockEmailForSending: vi.fn().mockResolvedValue(true),
      isEmailDescadastrado: vi.fn().mockResolvedValue(false),
      getModeloEmail: vi.fn().mockResolvedValue({ step: 1, assunto_padrao: 'Oi', corpo_html: '<p>{nome}</p>{link_descadastro}' }),
      markEmailSent: vi.fn().mockResolvedValue(undefined),
      getClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
    };
    const anthropic = { messages: { create: async () => ({ content: [{ type: 'text', text: 'ASSUNTO: Oi Joao\nABERTURA: Ola' }] }) } };
    const sender = { enviar: vi.fn().mockResolvedValue('msg-1') };

    const svc = new EmailSequenceService(supa as any, anthropic as any, sender as any, {
      from: 'x', baseUrl: 'https://e', hotOpens: 3, now: () => new Date('2026-07-15T15:00:00Z'),
    });
    const n = await svc.processSequence();
    expect(n).toBe(1);
    expect(sender.enviar).toHaveBeenCalledOnce();
    expect(supa.markEmailSent).toHaveBeenCalledWith('S1', 'msg-1', expect.any(String));
  });

  it('nao envia fora de dia util (sabado)', async () => {
    const supa = { getDueEmailSteps: vi.fn() } as any;
    const svc = new EmailSequenceService(supa, {} as any, { enviar: vi.fn() } as any, {
      from: 'x', baseUrl: 'https://e', hotOpens: 3, now: () => new Date('2026-07-18T15:00:00Z'),
    });
    expect(await svc.processSequence()).toBe(0);
    expect(supa.getDueEmailSteps).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/email-sequence-service.test.ts`
Esperado: FAIL.

- [ ] **Step 3: Implementar a classe** (no mesmo arquivo do gate)

```ts
// src/modules/email/email-sequence.ts  (adicionar abaixo de podeEnviarAgora)
import { renderTemplate, STEPS_JORNADA } from './templates.js';
import { gerarAssuntoAbertura } from './email-writer.js';
import { registrarEvento } from '../elo/eventos.js';
import type { EmailSender } from './resend-client.js';

export type SeqOpts = { from: string; baseUrl: string; hotOpens: number; now?: () => Date; batchLimit?: number };

export class EmailSequenceService {
  constructor(private supa: any, private anthropic: any, private sender: EmailSender, private opts: SeqOpts) {}

  async processSequence(): Promise<number> {
    const now = (this.opts.now ?? (() => new Date()))();
    if (!podeEnviarAgora(now)) return 0;
    const due = await this.supa.getDueEmailSteps(this.opts.batchLimit ?? 50);
    let enviados = 0;
    for (const row of due) {
      const lead = row.leads;
      if (!lead?.email || lead.email_opt_out) continue;
      if (await this.supa.isEmailDescadastrado(lead.email)) continue;
      const locked = await this.supa.lockEmailForSending(row.id);
      if (!locked) continue;
      try {
        const modelo = await this.supa.getModeloEmail(row.step);
        if (!modelo) { await this.supa.markEmailFailed(row.id, 'sem modelo'); continue; }
        const tema = STEPS_JORNADA.find((s) => s.step === row.step)?.tema ?? '';
        const { assunto, abertura } = await gerarAssuntoAbertura(
          this.anthropic, { step: row.step, tema, nome: lead.name, cidade: lead.city, oQuePediu: lead.profile },
          modelo.assunto_padrao,
        );
        const link = `${this.opts.baseUrl}/e/descadastro?lid=${lead.id}`;
        const html = (abertura ? `<p>${abertura}</p>` : '') +
          renderTemplate(modelo.corpo_html, { nome: lead.name, cidade: lead.city, o_que_pediu: lead.profile, link_descadastro: link });
        const msgId = await this.sender.enviar({ to: lead.email, subject: assunto, html });
        await this.supa.markEmailSent(row.id, msgId, assunto);
        await registrarEvento(this.supa.getClient(), {
          tipo: 'email_enviado', leadId: lead.id, canal: 'email', departamento: 'marketing',
          origem: 'email-sequence', payload: { step: row.step, provider_message_id: msgId, subject: assunto },
        });
        enviados++;
      } catch (err) {
        await this.supa.markEmailFailed(row.id, (err as Error)?.message ?? 'erro');
      }
    }
    return enviados;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/email-sequence-service.test.ts`
Esperado: PASS. `npx tsc --noEmit` limpo.

- [ ] **Step 5: Commit**

```bash
git add src/modules/email/email-sequence.ts tests/email-sequence-service.test.ts
git commit -m "feat(email): motor da sequencia (espelha cadencia da Eva)"
```

---

## Task 11: Webhook do Resend (rota) → espinha + parada da sequência

**Files:**
- Modify: `src/modules/dashboard/router.ts` (ou `src/index.ts` onde ficam as rotas públicas — o subagente confirma onde estão as rotas sem-auth como `/p/:slug`)
- Test: coberto pelo `tests/resend-events.test.ts` (mapeamento). A rota é glue.

- [ ] **Step 1: Implementar a rota** (best-effort, sempre 200 pro Resend não re-tentar infinito)

```ts
// dentro do registrador de rotas públicas
app.post('/webhooks/resend', express.json({ type: '*/*' }), async (req, res) => {
  try {
    // TODO(seguranca): validar assinatura com o signing secret (svix) antes de confiar.
    const ev = mapResendEvento(req.body);           // de resend-events.js
    if (ev) {
      // casar provider_message_id -> lead_id via email_sequencia
      const mid = (ev.payload as any)?.provider_message_id;
      let leadId: string | null = null;
      if (mid) {
        const { data } = await supabase.getClient()
          .from('email_sequencia').select('lead_id').eq('provider_message_id', mid).limit(1);
        leadId = data?.[0]?.lead_id ?? null;
      }
      await registrarEvento(supabase.getClient(), { ...ev, leadId });
      if (ev.tipo === 'email_descadastro' && leadId) {
        await supabase.cancelEmailSequence(leadId, 'complaint');
      }
    }
  } catch (err) {
    console.warn('[resend-webhook] ignorado:', (err as Error)?.message);
  }
  res.status(200).json({ ok: true });
});
```

- [ ] **Step 2: Rota de descadastro (link do e-mail)**

```ts
app.get('/e/descadastro', async (req, res) => {
  const lid = String(req.query.lid ?? '');
  try {
    const { data } = await supabase.getClient().from('leads').select('email').eq('id', lid).limit(1);
    const email = data?.[0]?.email;
    if (email) {
      await supabase.registrarDescadastro(email, lid, 'link');
      await supabase.cancelEmailSequence(lid, 'descadastro');
      await registrarEvento(supabase.getClient(), { tipo: 'email_descadastro', leadId: lid, canal: 'email', origem: 'link' });
    }
  } catch (err) { console.warn('[descadastro] ', (err as Error)?.message); }
  res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Pronto!</h2><p>Você não receberá mais nossos e-mails. 💚</p></body></html>');
});
```

- [ ] **Step 3: Verificar tsc + testes**

Run: `npx tsc --noEmit` (limpo) e `npx vitest run` (verde, fora as 2 pré-existentes).

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/router.ts
git commit -m "feat(email): webhook Resend + rota de descadastro alimentam a espinha"
```

---

## Task 12: Reação (lead quente → alerta WhatsApp) + parada ao responder

**Files:**
- Modify: `src/modules/email/email-sequence.ts` OU novo `src/modules/email/email-reacao.ts`
- Modify: `src/modules/eva-admin-buttons.ts` (novo `case` `email-quente`)
- Modify: `src/index.ts` (chamar a checagem de quente após processar webhooks / num sweep)
- Test: `tests/hot-email.test.ts` (já cobre a regra); a wiring é glue.

- [ ] **Step 1: Função de reação** (conta aberturas/cliques na espinha e alerta 1x)

```ts
// src/modules/email/email-reacao.ts
import { isLeadQuentePorEmail } from './hot-email.js';
import { registrarEvento } from '../elo/eventos.js';

// checa um lead; se quente e ainda nao alertado, dispara sendAdminWithButtons.
export async function checarLeadQuente(deps: {
  client: any; leadId: string; nome: string; adminPhone: string;
  sendAdminWithButtons: Function; metaWaba: any; sendText: Function;
  acquireAlertLock: (client: any, key: string) => Promise<boolean>;
  minAberturas: number;
}): Promise<void> {
  const { data } = await deps.client.from('eventos_elo')
    .select('tipo').eq('lead_id', deps.leadId).in('tipo', ['email_aberto', 'email_clicado']);
  const aberturas = (data ?? []).filter((e: any) => e.tipo === 'email_aberto').length;
  const cliques = (data ?? []).filter((e: any) => e.tipo === 'email_clicado').length;
  if (!isLeadQuentePorEmail({ aberturas, cliques }, { minAberturas: deps.minAberturas })) return;
  const travou = await deps.acquireAlertLock(deps.client, `email-quente:${deps.leadId}`);
  if (!travou) return; // ja alertado
  await deps.sendAdminWithButtons(
    { metaWaba: deps.metaWaba, sendText: deps.sendText }, deps.adminPhone,
    `🔥 ${deps.nome} está quente: abriu ${aberturas}x / clicou ${cliques}x no e-mail. Falar agora?`,
    [{ id: `evabt:email-quente:${deps.leadId}`, title: '👤 Ver lead' }, { id: `evabt:lead-pause:${deps.leadId}`, title: '✋ Assumir' }],
  );
  await registrarEvento(deps.client, { tipo: 'lead_quente_email', leadId: deps.leadId, canal: 'sistema', departamento: 'comercial', origem: 'email-reacao' });
}
```

- [ ] **Step 2: Novo `case` no switch `evabt:`** em `eva-admin-buttons.ts` (`email-quente` → abre o perfil do lead, reusando o mesmo comportamento de `lead-view`).

- [ ] **Step 3: Parar a sequência quando o lead responde** — no ponto do `index.ts` onde a cadência já é cancelada ao receber resposta (o `cancelIntroIfPending`/`cancelCadence`), adicionar `await supabase.cancelEmailSequence(leadId, 'respondeu')`.

- [ ] **Step 4: Verificar tsc + testes**

Run: `npx tsc --noEmit` + `npx vitest run tests/hot-email.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/email/email-reacao.ts src/modules/eva-admin-buttons.ts src/index.ts
git commit -m "feat(email): reacao lead quente (alerta WhatsApp) + para sequencia ao responder"
```

---

## Task 13: Plugar o scheduler no `index.ts`

**Files:**
- Modify: `src/index.ts` (dentro do bloco `if (!isSandbox && !passiveMode)`, junto dos outros `setInterval`, ver `index.ts:8076`)

- [ ] **Step 1: Instanciar e agendar** (espelha o bloco da cadência index.ts:8076-8087)

```ts
// junto dos outros schedulers
const emailSeq = new EmailSequenceService(
  supabase, new Anthropic({ apiKey: config.anthropicApiKey }),
  new EmailSender(process.env.RESEND_API_KEY ?? '', process.env.EMAIL_FROM ?? ''),
  { from: process.env.EMAIL_FROM ?? '', baseUrl: config.publicBaseUrl, hotOpens: Number(process.env.EMAIL_HOT_OPENS ?? 3) },
);
const runEmailSeq = async () => {
  try { const n = await emailSeq.processSequence(); if (n) console.log(`[email-seq] enviados: ${n}`); }
  catch (err) { console.warn('[email-seq] ciclo falhou:', (err as Error)?.message); }
};
setInterval(runEmailSeq, 15 * 60 * 1000);
setTimeout(runEmailSeq, 3 * 60 * 1000); // primeira passada 3min apos boot
console.log('[email-seq] scheduler started (15min, dias uteis 9-20 BRT)');
```

- [ ] **Step 2: Verificar tsc** (limpo) e subir o app localmente em modo passivo se possível (sem enviar).

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(email): pluga o motor da sequencia no scheduler de 15min"
```

---

## Task 14: Aba "E-mail Marketing" no menu Marketing

Espelha a aba Blog (`blog-views.ts` + `router.ts:1245`).

**Files:**
- Modify: `src/modules/dashboard/views.ts:135` (item + union `active`)
- Create: `src/modules/dashboard/email-views.ts`
- Modify: `src/modules/dashboard/router.ts` (rotas GET métricas + POST ligar/pausar)
- Modify: `src/modules/supabase.ts` (query de métricas)
- Test: `tests/email-metricas.test.ts` (a agregação de métricas como função pura)

- [ ] **Step 1: Teste da agregação de métricas** (função pura que recebe linhas e conta)

```ts
import { describe, it, expect } from 'vitest';
import { resumirMetricas } from '../src/modules/dashboard/email-views.js';

describe('resumirMetricas', () => {
  it('conta enviados/abertos/clicados/quentes', () => {
    const r = resumirMetricas([
      { tipo: 'email_enviado' }, { tipo: 'email_enviado' },
      { tipo: 'email_aberto' }, { tipo: 'email_clicado' }, { tipo: 'lead_quente_email' },
    ]);
    expect(r.enviados).toBe(2);
    expect(r.abertos).toBe(1);
    expect(r.clicados).toBe(1);
    expect(r.quentes).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/email-metricas.test.ts`
Esperado: FAIL.

- [ ] **Step 3: Implementar `email-views.ts`** (agregação + HTML espelhando `renderBlogDraftsPage`)

```ts
// src/modules/dashboard/email-views.ts
import { escapeHtml } from './views.js';

export function resumirMetricas(eventos: Array<{ tipo: string }>) {
  const c = (t: string) => eventos.filter((e) => e.tipo === t).length;
  return { enviados: c('email_enviado'), abertos: c('email_aberto'), clicados: c('email_clicado'), quentes: c('lead_quente_email'), descadastros: c('email_descadastro') };
}

export function renderEmailPage(m: ReturnType<typeof resumirMetricas>, ligado: boolean): string {
  const card = (rot: string, v: number) => `<div style="background:#0b1a2e;border:1px solid #1e3a5f;border-radius:12px;padding:16px;min-width:120px"><div style="color:#5f7fa8;font-size:12px">${rot}</div><div style="color:#e6f0ff;font-size:28px;font-weight:700">${v}</div></div>`;
  const taxaAb = m.enviados ? Math.round((m.abertos / m.enviados) * 100) : 0;
  return `
    <h1>✉️ E-mail Marketing</h1>
    <p>Sequência nutre-converte lead frio · status: <b>${ligado ? '🟢 ligada' : '⏸️ pausada'}</b></p>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin:16px 0">
      ${card('Enviados', m.enviados)} ${card('Abertos ('+taxaAb+'%)', m.abertos)}
      ${card('Clicados', m.clicados)} ${card('🔥 Quentes', m.quentes)} ${card('Descadastros', m.descadastros)}
    </div>
    <form method="post" action="/dashboard/marketing/email/${ligado ? 'pausar' : 'ligar'}">
      <button class="btn">${ligado ? 'Pausar sequência' : 'Ligar sequência'}</button>
    </form>`;
}
```

- [ ] **Step 4: Rota + item na sidebar**

- Em `views.ts:135`, adicionar após o item de cadência:
  ```ts
  { href: '/dashboard/marketing/email', key: 'email', label: '✉️ E-mail Marketing', area: 'marketing' },
  ```
  e incluir `'email'` na union `active` (views.ts:87).
- Em `router.ts` (espelhando o GET de blog em router.ts:1245):
  ```ts
  r.get('/marketing/email', exigir('marketing', 'visualizar'), async (req, res) => {
    let eventos: any[] = [];
    try {
      const { data } = await supabase.getClient().from('eventos_elo')
        .select('tipo').in('tipo', ['email_enviado','email_aberto','email_clicado','lead_quente_email','email_descadastro']);
      eventos = data ?? [];
    } catch {}
    const ligado = (await supabase.getFlag?.('email_seq_ligado')) ?? true;
    res.send(renderLayout({ active: 'email', title: 'E-mail Marketing',
      body: renderEmailPage(resumirMetricas(eventos), ligado), user: req.dashUser }));
  });
  r.post('/marketing/email/ligar', exigir('marketing', 'editar'), async (req, res) => { await supabase.setFlag?.('email_seq_ligado', true); res.redirect('/dashboard/marketing/email?ok=1'); });
  r.post('/marketing/email/pausar', exigir('marketing', 'editar'), async (req, res) => { await supabase.setFlag?.('email_seq_ligado', false); res.redirect('/dashboard/marketing/email?ok=1'); });
  ```
  > O motor (Task 13) deve checar `email_seq_ligado` no início de `processSequence` (ler flag; se `false`, retorna 0). O subagente confirma se já existe helper de flags em `app_flags`; se não, usa duas linhas de `.from('app_flags')`.

- [ ] **Step 5: Rodar e ver passar** + tsc

Run: `npx vitest run tests/email-metricas.test.ts` (PASS) e `npx tsc --noEmit` (limpo).

- [ ] **Step 6: Commit**

```bash
git add src/modules/dashboard/email-views.ts src/modules/dashboard/views.ts src/modules/dashboard/router.ts src/modules/supabase.ts tests/email-metricas.test.ts
git commit -m "feat(email): aba E-mail Marketing no menu Marketing (metricas + ligar/pausar)"
```

---

## Task 15: Import da planilha histórica (script one-off)

**Files:**
- Create: `scripts/import-emails.ts`
- Modify: `.gitignore` (ignorar `scripts/data/`)

- [ ] **Step 1: Escrever o script** (lê CSV, casa por telefone, atualiza `email` + `email_origem='import'`, respeita opt-out)

```ts
// scripts/import-emails.ts — rodar com: npx tsx scripts/import-emails.ts scripts/data/emails-historico.csv
import { readFileSync } from 'node:fs';
import { SupabaseService } from '../src/modules/supabase.js';
import { loadConfig } from '../src/modules/config.js'; // confirmar nome real do loader

async function main() {
  const arquivo = process.argv[2];
  const linhas = readFileSync(arquivo, 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
  const supa = new SupabaseService(loadConfig());
  let ok = 0, pulados = 0;
  for (const l of linhas) {
    const [telefone, email] = l.split(',').map((s) => s.trim());
    if (!email || !email.includes('@')) { pulados++; continue; }
    const client = supa.getClient();
    const { data } = await client.from('leads').select('id').eq('phone', telefone).limit(1);
    const id = data?.[0]?.id;
    if (!id) { pulados++; continue; }
    await client.from('leads').update({ email: email.toLowerCase(), email_origem: 'import' }).eq('id', id);
    ok++;
  }
  console.log(`Importados: ${ok}, pulados: ${pulados}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Medir cobertura** (quantos leads têm e-mail)

Run (SQL Editor): `select count(*) filter (where email is not null) as com_email, count(*) as total from leads;`
Anotar a cobertura (informa o volume real da sequência).

- [ ] **Step 3: Commit** (só o script, nunca os dados)

```bash
git add scripts/import-emails.ts .gitignore
git commit -m "chore(email): script de import da planilha historica de e-mails"
```

---

## Task 16: Captura de e-mail daqui pra frente

**Files:**
- Modify: o(s) ponto(s) de criação de lead no `src/index.ts` (webhook Meta Lead Ads / formulário) — o subagente localiza via `getOrCreateLeadByPhone`/`upsertLead`.

- [ ] **Step 1:** Onde o lead é criado a partir de formulário/lead ad que traz e-mail, passar o `email` no insert/update e setar `email_origem` (`formulario`/`eva`). Se o lead já existe sem e-mail e agora veio um, preencher.
- [ ] **Step 2:** Ao criar/atualizar um lead **com e-mail válido e sem opt-out**, chamar `supabase.scheduleEmailSequence(leadId)` (best-effort) para entrar na jornada.
- [ ] **Step 3:** `npx tsc --noEmit` limpo.
- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(email): captura e-mail no cadastro + agenda a sequencia"
```

---

## Task 17: Verificação final (antes do PR)

- [ ] `npx tsc --noEmit` — **limpo**.
- [ ] `npx vitest run` — **verde** (só as 2 falhas pré-existentes de `supabase-vincular-novo`).
- [ ] Conferir cobertura da spec: espinha ✓, e-mails na base ✓, Resend ✓, sequência ✓, autoria mista + trava ✓, tracking ✓, reação ✓, aba Marketing ✓, descadastro ✓.
- [ ] **Smoke manual** (com envs de teste): enviar 1 e-mail de teste pra si mesmo → cai na **caixa de entrada** (não spam) → abrir/clicar → ver `email_aberto`/`email_clicado` em `eventos_elo` → 3 aberturas dispara alerta no WhatsApp → clicar descadastro → não recebe mais.
- [ ] Rodar **code review** do diff (regra do repo: 3× / antes de juntar).
- [ ] Abrir **PR** e pedir autorização do Junior antes de juntar na `main` (deploy = EasyPanel publica `main`).

---

## Self-review (feito pelo autor do plano)

- **Cobertura da spec:** cada seção da spec (§3.1 espinha, §3.2 e-mails/opt-out, §3.3 Resend, §3.4 motor, §3.5 autoria mista, §3.6 reação, §3.7 aba) tem task correspondente (Tasks 1–16). ✓
- **Sem placeholders de código:** os módulos de lógica pura (trava de preço, gate, mapeamento webhook, hot-email, métricas, render) têm teste + implementação completos. As tasks de integração (webhook route, scheduler wiring, captura de lead) referenciam o ponto exato do repo a espelhar (com file:line do mapa) — são glue sobre padrões já existentes. As duas partes de **conteúdo aprovado pelo Junior** (corpo dos 6 modelos, seed 070) são explicitamente marcadas como "escrito na execução e revisado pelo Junior" (autoria mista — é decisão de negócio, não placeholder técnico).
- **Consistência de tipos/nomes:** `registrarEvento(client, EventoInput)`, `EmailSender.enviar`, métodos `getDueEmailSteps/lockEmailForSending/markEmailSent/markEmailFailed/cancelEmailSequence/isEmailDescadastrado/getModeloEmail/scheduleEmailSequence`, `podeEnviarAgora`, `EmailSequenceService`, `isLeadQuentePorEmail`, `resumirMetricas` — usados de forma consistente entre as tasks. ✓
- **Aberto pra execução (o subagente confirma no repo):** formato exato de `await` nos métodos do `SupabaseService` (espelhar `supabase.ts:710-775`); onde ficam as rotas públicas sem-auth (`/p/:slug`) pra pendurar o webhook; existência de helper de flags em `app_flags` (senão, 2 linhas de `.from`); nome real do loader de config no script de import.
