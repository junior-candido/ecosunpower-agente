# Cadastro de dono da usina pelo WhatsApp — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No alerta de uma usina órfã (sem dono), permitir que o Junior vincule/cadastre o dono direto pelo WhatsApp — cliente existente (busca) ou novo (cadastro completo com "pular") — e completar os dados da usina que faltam, tudo gravando no mesmo cadastro do dashboard.

**Architecture:** Reusa o padrão de máquina de estado conversacional do fluxo `/fechar` (estado em Redis por telefone do admin + handlers de botão em `eva-admin-buttons.ts` + guard de roteamento de texto em `index.ts`). O fluxo "dono-cad" é determinístico por etapas (sem LLM). Sobe junto a branch `feat/proprietario-usinas` (dashboard + funções de backend de vínculo).

**Tech Stack:** TypeScript (ESM, `.js` nos imports), Express, Supabase JS, IORedis, WABA Cloud (botões interativos), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-cadastro-dono-usina-zap-design.md`

---

## Estrutura de arquivos

**Criar:**
- `src/modules/monitoring/dono-cad/types.ts` — tipos do estado (`DonoCadState`, `NovoClienteData`, `CampoUsina`).
- `src/modules/monitoring/dono-cad/machine.ts` — funções puras: sequência de campos do "novo", campos vazios da usina, textos de pergunta.
- `tests/dono-cad-machine.test.ts` — testes das funções puras.

**Modificar:**
- `src/modules/supabase.ts` — estender `vincularNovoLeadAoSistema` com `city/uf/cep`.
- `src/modules/monitoring/proactive-alerts/format.ts` — status do dono + botões da órfã.
- `src/modules/monitoring/proactive-alerts/types.ts` — se `FormattedAlert`/inputs precisarem de campo extra.
- `src/modules/eva-admin-buttons.ts` — handlers dos botões `dono-*` + callbacks no tipo de args.
- `src/index.ts` — helpers de estado Redis `dono-cad:<phone>`, guard `tryHandleDonoCadCommand`, wiring dos callbacks, posição no roteador.
- `tests/proactive-alerts-format.test.ts` (ou o arquivo de teste de format existente) — casos da órfã.

**Merge:**
- Branch `feat/proprietario-usinas` → `main` (Task 1).

---

## Task 1: Merge da branch `feat/proprietario-usinas` na main

A branch traz: seção Proprietário no editar usina, modal de órfãs, e as funções `searchClientesParaVinculo`, `vincularClienteExistente`, `vincularNovoLeadAoSistema` em `supabase.ts`. Foi feita sobre commit antigo (`6213908`) — espere conflitos.

**Files:**
- Merge: `feat/proprietario-usinas` → `main`

- [ ] **Step 1: Garantir main limpa e atualizada**

Run:
```bash
cd "C:/Users/Meu Computador/Documents/ecosunpower-agente"
git status -sb
git checkout main
```
Expected: working tree limpo, em `main`.

- [ ] **Step 2: Criar branch de integração a partir da main**

```bash
git checkout -b merge/proprietario-usinas
```

- [ ] **Step 3: Mergear a branch**

```bash
git merge feat/proprietario-usinas
```
Expected: ou "Merge made" limpo, ou lista de arquivos em conflito (provável em `src/modules/supabase.ts`, `src/modules/dashboard/router.ts`, `src/modules/dashboard/views.ts`, `src/modules/monitoring/service.ts`).

- [ ] **Step 4: Resolver conflitos preservando AMBOS os lados**

Para cada arquivo em conflito, abrir e resolver mantendo as features da main (propostas multi-serviço etc.) E as da branch (proprietário). Regra: nunca apagar função de um lado pra satisfazer o outro — combinar. Após resolver cada arquivo:
```bash
git add <arquivo-resolvido>
```

- [ ] **Step 5: Compilar (type-check)**

Run: `npx tsc --noEmit`
Expected: exit 0, zero erros. Se houver erro, corrigir antes de seguir.

- [ ] **Step 6: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: todos os testes passam (baseline atual: 706 + os da branch).

- [ ] **Step 7: Concluir o merge / commitar resolução**

```bash
git commit --no-edit
```
(Se foi fast-forward sem conflito, pular — já está commitado.)

- [ ] **Step 8: Fast-forward a main**

```bash
git checkout main
git merge --ff-only merge/proprietario-usinas
git branch -d merge/proprietario-usinas
```
Expected: `main` agora contém o dashboard de proprietário. **NÃO** pushar ainda (push só com autorização do Junior, ao final).

---

## Task 2: Estender `vincularNovoLeadAoSistema` com city/uf/cep

Hoje (pós-merge) a função aceita `{ sistema_id, name, phone, email? }`. O cadastro completo do zap precisa gravar também `city`, `uf`, `cep` (colunas já existem em `leads`).

**Files:**
- Modify: `src/modules/supabase.ts` (método `vincularNovoLeadAoSistema`)
- Test: `tests/supabase-vincular-novo.test.ts` (criar)

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/supabase-vincular-novo.test.ts`. Mocka o client Supabase e verifica que o insert em `leads` inclui city/uf/cep quando passados, e que campos omitidos viram `null`.

```typescript
import { describe, it, expect, vi } from 'vitest';
import { SupabaseService } from '../src/modules/supabase.js';

function makeClientMock(insertCapture: { row?: any }) {
  return {
    from: (table: string) => {
      if (table === 'sistemas_clientes') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { id: 's1', lead_id: null, data_instalacao: '2025-01-01' }, error: null }) }) }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      // leads
      return {
        insert: (row: any) => { insertCapture.row = row; return { select: () => ({ single: async () => ({ data: { id: 'lead1' }, error: null }) }) }; },
      };
    },
  } as any;
}

describe('vincularNovoLeadAoSistema com campos completos', () => {
  it('grava city/uf/cep quando passados', async () => {
    const cap: { row?: any } = {};
    const svc = new SupabaseService(makeClientMock(cap));
    const r = await svc.vincularNovoLeadAoSistema({
      sistema_id: 's1', name: 'Marcelo Dias', phone: '5561999998888',
      email: 'm@x.com', city: 'Brasília', uf: 'DF', cep: '70000000',
    });
    expect(r.ok).toBe(true);
    expect(cap.row.city).toBe('Brasília');
    expect(cap.row.uf).toBe('DF');
    expect(cap.row.cep).toBe('70000000');
  });

  it('campos opcionais omitidos viram null', async () => {
    const cap: { row?: any } = {};
    const svc = new SupabaseService(makeClientMock(cap));
    const r = await svc.vincularNovoLeadAoSistema({ sistema_id: 's1', name: 'Ana', phone: '5561988887777' });
    expect(r.ok).toBe(true);
    expect(cap.row.city ?? null).toBeNull();
    expect(cap.row.uf ?? null).toBeNull();
    expect(cap.row.cep ?? null).toBeNull();
  });
});
```

> Nota: confirmar o construtor de `SupabaseService` (pode receber client ou criar). Se receber URL/key, adaptar o mock pra injetar via `getClient`. Ajustar o setup ao padrão dos testes existentes em `tests/` que já instanciam `SupabaseService`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/supabase-vincular-novo.test.ts`
Expected: FAIL (city/uf/cep não estão sendo gravados — o insert ignora).

- [ ] **Step 3: Estender a assinatura e o insert**

Em `src/modules/supabase.ts`, no método `vincularNovoLeadAoSistema`, ampliar o input e o `.insert`:

```typescript
  async vincularNovoLeadAoSistema(input: {
    sistema_id: string;
    name: string;
    phone: string;
    email?: string | null;
    city?: string | null;
    uf?: string | null;
    cep?: string | null;
  }): Promise<{ ok: boolean; lead_id?: string; error?: string }> {
    const { data: sistema, error: sErr } = await this.client
      .from('sistemas_clientes')
      .select('id, lead_id, data_instalacao')
      .eq('id', input.sistema_id)
      .single();
    if (sErr || !sistema) return { ok: false, error: 'Sistema não encontrado' };
    if (sistema.lead_id) return { ok: false, error: 'Sistema já tem cliente vinculado' };

    const { data: novoLead, error: lErr } = await this.client
      .from('leads')
      .insert({
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        city: input.city ?? null,
        uf: input.uf ?? null,
        cep: input.cep ?? null,
        installation_status: 'operando',
        installed_at: sistema.data_instalacao,
        eva_active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (lErr || !novoLead) return { ok: false, error: lErr?.message ?? 'Falha ao criar lead' };

    const { error: vErr } = await this.client
      .from('sistemas_clientes')
      .update({ lead_id: novoLead.id, updated_at: new Date().toISOString() })
      .eq('id', input.sistema_id);
    if (vErr) return { ok: false, error: vErr.message };
    return { ok: true, lead_id: novoLead.id };
  }
```

(Manter o restante do corpo igual ao que veio da branch; só ampliar input + as 3 linhas city/uf/cep no insert.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/supabase-vincular-novo.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/supabase.ts tests/supabase-vincular-novo.test.ts
git commit -m "feat(monitoring): vincularNovoLeadAoSistema grava city/uf/cep"
```

---

## Task 3: Status do dono + botões da órfã no alerta

`formatAlertMessage` recebe `lead: LeadResumo | null`. `lead === null` ⇒ usina órfã. Na órfã, mostrar `⚠️ Usina SEM dono vinculado` e trocar os botões para `[Cadastrar dono | Ver no painel]`.

**Files:**
- Modify: `src/modules/monitoring/proactive-alerts/format.ts`
- Test: arquivo de teste de format existente (procurar `tests/*format*`) ou criar `tests/proactive-alerts-format-orfa.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/proactive-alerts-format-orfa.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatAlertMessage } from '../src/modules/monitoring/proactive-alerts/format.js';

const sistema = { id: 'sistema-uuid-1234', apelido: 'Casa do Henrique', potencia_kwp: 8.2, marca_inversor: 'Deye' };
const alerta = { tipo: 'sistema_offline', texto: 'Sem geração há 2 dias' } as any;

describe('formatAlertMessage — usina órfã (lead null)', () => {
  it('mostra aviso de SEM dono e botões de cadastro', () => {
    const out = formatAlertMessage(alerta, sistema, null);
    expect(out.texto).toContain('SEM dono vinculado');
    const ids = out.botoes.map((b) => b.id);
    expect(ids).toContain(`evabt:dono-cad:${sistema.id}`);
    expect(ids).toContain(`evabt:alert-ver:${sistema.id}`);
    // não oferece adiar/eva-avisar/eu-ligar na órfã
    expect(ids.some((i) => i.includes('snooze'))).toBe(false);
    expect(ids.some((i) => i.includes('eva-offline'))).toBe(false);
    expect(out.botoes.length).toBeLessThanOrEqual(3);
  });

  it('usina COM dono mantém comportamento atual (sem botão de cadastro)', () => {
    const lead = { id: 'lead-1', name: 'Henrique Souza', phone: '5561999990000' };
    const out = formatAlertMessage(alerta, sistema, lead);
    const ids = out.botoes.map((b) => b.id);
    expect(ids).toContain(`evabt:alert-eva-offline:${sistema.id}`);
    expect(ids.some((i) => i.startsWith('evabt:dono-cad'))).toBe(false);
    expect(out.texto).toContain('Henrique Souza');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/proactive-alerts-format-orfa.test.ts`
Expected: FAIL (órfã ainda usa botões normais; sem aviso "SEM dono").

- [ ] **Step 3: Implementar na format.ts**

Em `src/modules/monitoring/proactive-alerts/format.ts`, adicionar o conjunto de botões da órfã e ramificar quando `lead === null`:

```typescript
function botoesOrfa(sId: string): AlertButton[] {
  return [
    { id: `evabt:dono-cad:${sId}`, title: '📇 Cadastrar dono' },
    { id: `evabt:alert-ver:${sId}`, title: '🔍 Ver no painel' },
  ];
}
```

E em `formatAlertMessage`, antes do `return`:

```typescript
export function formatAlertMessage(
  alerta: MonitoringAlertRow,
  sistema: SistemaResumo,
  lead: LeadResumo | null,
): FormattedAlert {
  const orfa = lead === null;
  const nome = nomeCliente(lead, sistema);
  const kwp = sistema.potencia_kwp != null ? `${sistema.potencia_kwp} kWp` : '— kWp';
  const marca = sistema.marca_inversor ?? 'inversor';
  const linha1 = `${header(alerta.tipo)}`;
  const linha2 = orfa
    ? `⚠️ Usina SEM dono vinculado — ${kwp} (${marca})`
    : alerta.tipo === 'erro_integracao'
      ? `${nome} — ${marca}`
      : `${nome} — ${kwp} (${marca})`;
  const texto = `${linha1}\n${linha2}\n${alerta.texto}`;
  return {
    texto,
    botoes: orfa ? botoesOrfa(sistema.id) : botoesFor(alerta.tipo, sistema.id),
    footer: `sistema ${sistema.id.slice(0, 8)}`,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/proactive-alerts-format-orfa.test.ts`
Expected: PASS (2 testes). Rodar também o teste de format pré-existente pra garantir não-regressão: `npx vitest run format`

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/proactive-alerts/format.ts tests/proactive-alerts-format-orfa.test.ts
git commit -m "feat(monitoring): alerta de usina órfã avisa SEM dono + botão cadastrar"
```

---

## Task 4: Tipos e funções puras da máquina dono-cad

Lógica determinística e testável isolada da camada de I/O.

**Files:**
- Create: `src/modules/monitoring/dono-cad/types.ts`
- Create: `src/modules/monitoring/dono-cad/machine.ts`
- Test: `tests/dono-cad-machine.test.ts`

- [ ] **Step 1: Criar os tipos**

`src/modules/monitoring/dono-cad/types.ts`:

```typescript
// Campos da usina que o fluxo completa (na ordem das perguntas).
export const CAMPOS_USINA = [
  'apelido', 'potencia_kwp', 'cidade', 'uf', 'data_instalacao', 'inversor_modelo', 'observacoes',
] as const;
export type CampoUsina = (typeof CAMPOS_USINA)[number];

// Campos do cliente novo (na ordem das perguntas). name/phone obrigatórios.
export const CAMPOS_NOVO = ['name', 'phone', 'email', 'city', 'uf', 'cep'] as const;
export type CampoNovo = (typeof CAMPOS_NOVO)[number];

export interface NovoClienteData {
  name?: string;
  phone?: string;
  email?: string | null;
  city?: string | null;
  uf?: string | null;
  cep?: string | null;
}

export type DonoCadState =
  | { etapa: 'escolha'; sistemaId: string }
  | { etapa: 'busca'; sistemaId: string }
  | { etapa: 'novo'; sistemaId: string; campo: CampoNovo; dados: NovoClienteData }
  | { etapa: 'usina'; sistemaId: string; pendentes: CampoUsina[]; idx: number };
```

- [ ] **Step 2: Escrever o teste que falha**

`tests/dono-cad-machine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { camposVaziosUsina, proximoCampoNovo, perguntaNovo, perguntaUsina, campoObrigatorioNovo } from '../src/modules/monitoring/dono-cad/machine.js';

describe('camposVaziosUsina', () => {
  it('retorna só os campos vazios, na ordem', () => {
    const sistema = { apelido: 'Casa', potencia_kwp: null, cidade: '', uf: 'DF', data_instalacao: null, inversor_modelo: null, observacoes: 'ok' };
    expect(camposVaziosUsina(sistema)).toEqual(['potencia_kwp', 'cidade', 'data_instalacao', 'inversor_modelo']);
  });
  it('usina cheia retorna vazio', () => {
    const sistema = { apelido: 'Casa', potencia_kwp: 8.2, cidade: 'Bsb', uf: 'DF', data_instalacao: '2025-01-01', inversor_modelo: 'SG5', observacoes: 'x' };
    expect(camposVaziosUsina(sistema)).toEqual([]);
  });
});

describe('proximoCampoNovo', () => {
  it('avança na ordem name→phone→email→city→uf→cep→fim', () => {
    expect(proximoCampoNovo('name')).toBe('phone');
    expect(proximoCampoNovo('phone')).toBe('email');
    expect(proximoCampoNovo('cep')).toBe('fim');
  });
});

describe('campoObrigatorioNovo', () => {
  it('name e phone são obrigatórios; resto não', () => {
    expect(campoObrigatorioNovo('name')).toBe(true);
    expect(campoObrigatorioNovo('phone')).toBe(true);
    expect(campoObrigatorioNovo('email')).toBe(false);
    expect(campoObrigatorioNovo('cep')).toBe(false);
  });
});

describe('perguntas', () => {
  it('cada campo tem pergunta em PT', () => {
    expect(perguntaNovo('name')).toMatch(/nome/i);
    expect(perguntaUsina('potencia_kwp')).toMatch(/pot[êe]ncia/i);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/dono-cad-machine.test.ts`
Expected: FAIL (módulo `machine.js` não existe).

- [ ] **Step 4: Implementar machine.ts**

`src/modules/monitoring/dono-cad/machine.ts`:

```typescript
import { CAMPOS_USINA, CAMPOS_NOVO, type CampoUsina, type CampoNovo } from './types.js';

function vazio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

// Recebe a linha do sistema (getSistemaById) e retorna os campos da usina vazios.
export function camposVaziosUsina(sistema: Record<string, unknown>): CampoUsina[] {
  return CAMPOS_USINA.filter((c) => vazio(sistema[c]));
}

export function proximoCampoNovo(campo: CampoNovo): CampoNovo | 'fim' {
  const i = CAMPOS_NOVO.indexOf(campo);
  return i < 0 || i >= CAMPOS_NOVO.length - 1 ? 'fim' : CAMPOS_NOVO[i + 1];
}

export function campoObrigatorioNovo(campo: CampoNovo): boolean {
  return campo === 'name' || campo === 'phone';
}

const PERGUNTAS_NOVO: Record<CampoNovo, string> = {
  name: 'Nome completo do cliente?',
  phone: 'Telefone com DDD? (ex: 61 99999-8888)',
  email: 'E-mail? (ou responda *pular*)',
  city: 'Cidade? (ou *pular*)',
  uf: 'UF? (2 letras, ou *pular*)',
  cep: 'CEP? (ou *pular*)',
};
export function perguntaNovo(campo: CampoNovo): string { return PERGUNTAS_NOVO[campo]; }

const PERGUNTAS_USINA: Record<CampoUsina, string> = {
  apelido: 'Qual o apelido/nome da usina? (ex: Casa do Henrique)',
  potencia_kwp: 'Potência da usina em kWp? (ex: 8.2 — ou *pular*)',
  cidade: 'Cidade da usina? (ou *pular*)',
  uf: 'UF da usina? (2 letras, ou *pular*)',
  data_instalacao: 'Data de instalação? (AAAA-MM-DD, ou *pular*)',
  inversor_modelo: 'Modelo do inversor? (ex: Sungrow SG5.0RS-L, ou *pular*)',
  observacoes: 'Alguma observação sobre a usina? (ou *pular*)',
};
export function perguntaUsina(campo: CampoUsina): string { return PERGUNTAS_USINA[campo]; }

// "pular" tolerante a acento/caixa.
export function ehPular(texto: string): boolean {
  return /^pular$/i.test(texto.trim());
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/dono-cad-machine.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/monitoring/dono-cad/types.ts src/modules/monitoring/dono-cad/machine.ts tests/dono-cad-machine.test.ts
git commit -m "feat(monitoring): tipos e funções puras da máquina dono-cad"
```

---

## Task 5: Handlers de botão dono-cad em `eva-admin-buttons.ts`

Adicionar callbacks ao tipo de args de `tryHandleEvaAdminButton` e os `case` dos botões `dono-*`. A lógica pesada (estado/DB) vive nos callbacks injetados pelo `index.ts` (Task 7) — aqui só roteia o botão pro callback, igual ao padrão `onFechar*`.

**Files:**
- Modify: `src/modules/eva-admin-buttons.ts`

- [ ] **Step 1: Adicionar callbacks ao tipo de args**

No objeto de args de `tryHandleEvaAdminButton` (após os `onFechar*`):

```typescript
  // Cadastro de dono de usina órfã (fluxo dono-cad)
  onDonoCadStart?: (sistemaId: string) => Promise<void>;
  onDonoExiste?: () => Promise<void>;
  onDonoNovo?: () => Promise<void>;
  onDonoPick?: (leadId: string) => Promise<void>;
  onDonoPular?: () => Promise<void>;
  onDonoPularTudo?: () => Promise<void>;
  onDonoCancelar?: () => Promise<void>;
```

- [ ] **Step 2: Adicionar os `case` no switch**

Antes do `default:` em `tryHandleEvaAdminButton`:

```typescript
      case 'dono-cad': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem id de sistema.'); return true; }
        if (args.onDonoCadStart) await args.onDonoCadStart(leadId);
        else await args.sendText(args.from, '⚠️ Handler dono-cad não configurado.');
        return true;
      }
      case 'dono-existe': {
        if (args.onDonoExiste) await args.onDonoExiste();
        return true;
      }
      case 'dono-novo': {
        if (args.onDonoNovo) await args.onDonoNovo();
        return true;
      }
      case 'dono-pick': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem lead id.'); return true; }
        if (args.onDonoPick) await args.onDonoPick(leadId);
        return true;
      }
      case 'dono-pular': {
        if (args.onDonoPular) await args.onDonoPular();
        return true;
      }
      case 'dono-pular-tudo': {
        if (args.onDonoPularTudo) await args.onDonoPularTudo();
        return true;
      }
      case 'dono-cancelar': {
        if (args.onDonoCancelar) await args.onDonoCancelar();
        return true;
      }
```

> O parser de `action`/`leadId` no topo (`/^evabt:([a-z0-9-]+)(?::(.+))?$/i`) já cobre `dono-cad:<uuid>` e `dono-pick:<uuid>`. Os sem-id (`dono-existe`, `dono-novo`, `dono-pular`, `dono-pular-tudo`, `dono-cancelar`) agem sobre o estado Redis do admin atual (mesmo padrão de `fechar-gerar`/`fechar-sair`).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 (callbacks são opcionais, não quebra chamadas existentes).

- [ ] **Step 4: Commit**

```bash
git add src/modules/eva-admin-buttons.ts
git commit -m "feat(monitoring): botões dono-cad roteiam pros callbacks"
```

---

## Task 6: Helpers de estado Redis + callbacks + guard no `index.ts`

Aqui mora a orquestração. Reusa a instância `closingRedis` (já existe em `index.ts`) com chave `dono-cad:<phone>`, TTL 600s.

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Helpers de estado (perto de `getClosingState`, ~linha 507)**

```typescript
  // Estado do fluxo de cadastro de dono de usina (key: dono-cad:<phone>, TTL 10min)
  async function getDonoCadState(phone: string): Promise<DonoCadState | null> {
    const raw = await closingRedis.get(`dono-cad:${phone}`);
    return raw ? (JSON.parse(raw) as DonoCadState) : null;
  }
  async function setDonoCadState(phone: string, state: DonoCadState): Promise<void> {
    await closingRedis.set(`dono-cad:${phone}`, JSON.stringify(state), 'EX', 600);
  }
  async function clearDonoCadState(phone: string): Promise<void> {
    await closingRedis.del(`dono-cad:${phone}`);
  }
```

E o import no topo de `index.ts` (junto dos outros imports de tipo):
```typescript
import type { DonoCadState } from './modules/monitoring/dono-cad/types.js';
import { camposVaziosUsina, proximoCampoNovo, campoObrigatorioNovo, perguntaNovo, perguntaUsina, ehPular } from './modules/monitoring/dono-cad/machine.js';
import { CAMPOS_USINA } from './modules/monitoring/dono-cad/types.js';
```

- [ ] **Step 2: Funções auxiliares de fluxo (perto dos `handleFechar*`)**

Adicionar helpers que mandam a próxima pergunta e finalizam. `metaWaba`, `sendText`, `supabase`, `monitoringService` já estão em escopo no `main()`.

```typescript
  async function donoEnviarEscolha(from: string): Promise<void> {
    if (metaWaba) {
      await metaWaba.sendInteractiveButtons(from, 'Esse cliente já existe ou é novo?', [
        { id: 'evabt:dono-existe', title: 'Já existe' },
        { id: 'evabt:dono-novo', title: 'Criar novo' },
        { id: 'evabt:dono-cancelar', title: 'Cancelar' },
      ]);
    } else {
      await sendText(from, 'Esse cliente já existe ou é novo? Responda: existe / novo / cancelar');
    }
  }

  // Computa pendentes da usina e ou pergunta o 1º, ou finaliza se nada falta.
  async function donoIniciarEtapaUsina(from: string, sistemaId: string): Promise<void> {
    const sistema = await supabase.getSistemaById(sistemaId);
    const pendentes = sistema ? camposVaziosUsina(sistema) : [...CAMPOS_USINA];
    if (pendentes.length === 0) { await donoFinalizar(from, sistemaId); return; }
    await setDonoCadState(from, { etapa: 'usina', sistemaId, pendentes, idx: 0 });
    await donoPerguntarUsina(from, pendentes[0]);
  }

  async function donoPerguntarUsina(from: string, campo: typeof CAMPOS_USINA[number]): Promise<void> {
    if (metaWaba) {
      await metaWaba.sendInteractiveButtons(from, perguntaUsina(campo), [
        { id: 'evabt:dono-pular', title: 'Pular' },
        { id: 'evabt:dono-pular-tudo', title: 'Pular tudo' },
        { id: 'evabt:dono-cancelar', title: 'Cancelar' },
      ]);
    } else {
      await sendText(from, `${perguntaUsina(campo)} (ou: pular / pular tudo / cancelar)`);
    }
  }

  async function donoFinalizar(from: string, sistemaId: string): Promise<void> {
    await clearDonoCadState(from);
    const sistema = await supabase.getSistemaById(sistemaId);
    const lead = sistema?.lead_id ? await supabase.getLeadById(sistema.lead_id) : null;
    await sendText(from, `✅ Tudo cadastrado! A usina ${sistema?.apelido ?? ''} agora é de ${lead?.name ?? 'cliente'}. Próximos alertas já vêm certinhos.`);
  }
```

- [ ] **Step 3: Os callbacks no objeto de `tryHandleEvaAdminButton`**

Na chamada de `tryHandleEvaAdminButton({...})` (~linha 2821), adicionar:

```typescript
  onDonoCadStart: async (sistemaId) => {
    const sistema = await supabase.getSistemaById(sistemaId);
    if (!sistema) { await sendText(from, '⚠️ Usina não encontrada.'); return; }
    if (sistema.lead_id) {
      const lead = await supabase.getLeadById(sistema.lead_id);
      await sendText(from, `Essa usina já está vinculada a ${lead?.name ?? 'um cliente'}.`);
      return;
    }
    await setDonoCadState(from, { etapa: 'escolha', sistemaId });
    await donoEnviarEscolha(from);
  },
  onDonoExiste: async () => {
    const st = await getDonoCadState(from);
    if (!st) return;
    await setDonoCadState(from, { etapa: 'busca', sistemaId: st.sistemaId });
    await sendText(from, 'Qual o nome do cliente? (digite parte do nome)');
  },
  onDonoNovo: async () => {
    const st = await getDonoCadState(from);
    if (!st) return;
    await setDonoCadState(from, { etapa: 'novo', sistemaId: st.sistemaId, campo: 'name', dados: {} });
    await sendText(from, perguntaNovo('name'));
  },
  onDonoPick: async (leadId) => {
    const st = await getDonoCadState(from);
    if (!st) return;
    const r = await supabase.vincularClienteExistente({ sistema_id: st.sistemaId, lead_id: leadId });
    if (!r.ok) { await sendText(from, `⚠️ ${r.error ?? 'Falha ao vincular'}`); return; }
    const lead = await supabase.getLeadById(leadId);
    await sendText(from, `✅ Usina vinculada a ${lead?.name ?? 'cliente'}. Agora vou completar os dados da usina.`);
    await donoIniciarEtapaUsina(from, st.sistemaId);
  },
  onDonoPular: async () => {
    const st = await getDonoCadState(from);
    if (!st) return;
    if (st.etapa === 'novo') { await donoAvancarNovo(from, st, undefined); return; }
    if (st.etapa === 'usina') { await donoAvancarUsina(from, st, undefined); return; }
  },
  onDonoPularTudo: async () => {
    const st = await getDonoCadState(from);
    if (st?.etapa === 'usina') { await donoFinalizar(from, st.sistemaId); }
  },
  onDonoCancelar: async () => {
    await clearDonoCadState(from);
    await sendText(from, 'Cadastro cancelado. O alerta volta na próxima rodada.');
  },
```

- [ ] **Step 4: Funções de avanço (novo / usina) — perto dos helpers do Step 2**

```typescript
  // Avança o cadastro do cliente novo. valor=undefined quando "pular".
  async function donoAvancarNovo(
    from: string,
    st: Extract<DonoCadState, { etapa: 'novo' }>,
    valor: string | undefined,
  ): Promise<void> {
    const dados = { ...st.dados };
    if (valor !== undefined) {
      if (st.campo === 'phone') dados.phone = valor.replace(/\D/g, '');
      else if (st.campo === 'uf') dados.uf = valor.trim().toUpperCase().slice(0, 2);
      else (dados as Record<string, unknown>)[st.campo] = valor.trim();
    }
    const prox = proximoCampoNovo(st.campo);
    if (prox === 'fim') {
      if (!dados.name || !dados.phone || dados.phone.length < 10) {
        await sendText(from, '⚠️ Nome e telefone válidos são obrigatórios. Recomeça pelo botão Cadastrar dono.');
        await clearDonoCadState(from);
        return;
      }
      const r = await supabase.vincularNovoLeadAoSistema({
        sistema_id: st.sistemaId,
        name: dados.name, phone: dados.phone,
        email: dados.email ?? null, city: dados.city ?? null, uf: dados.uf ?? null, cep: dados.cep ?? null,
      });
      if (!r.ok) { await sendText(from, `⚠️ ${r.error ?? 'Falha ao criar cliente'}`); await clearDonoCadState(from); return; }
      await sendText(from, `✅ Cliente ${dados.name} criado e ligado à usina. Agora os dados da usina.`);
      await donoIniciarEtapaUsina(from, st.sistemaId);
      return;
    }
    await setDonoCadState(from, { ...st, campo: prox, dados });
    // name/phone obrigatórios não oferecem "pular"
    if (campoObrigatorioNovo(prox)) await sendText(from, perguntaNovo(prox));
    else if (metaWaba) await metaWaba.sendInteractiveButtons(from, perguntaNovo(prox), [
      { id: 'evabt:dono-pular', title: 'Pular' }, { id: 'evabt:dono-cancelar', title: 'Cancelar' },
    ]);
    else await sendText(from, `${perguntaNovo(prox)} (ou: pular / cancelar)`);
  }

  // Avança o cadastro da usina. valor=undefined quando "pular".
  async function donoAvancarUsina(
    from: string,
    st: Extract<DonoCadState, { etapa: 'usina' }>,
    valor: string | undefined,
  ): Promise<void> {
    const campo = st.pendentes[st.idx];
    if (valor !== undefined && campo) {
      const patch: Record<string, unknown> = {};
      if (campo === 'potencia_kwp') { const n = Number(valor.replace(',', '.')); if (Number.isFinite(n)) patch.potencia_kwp = n; }
      else if (campo === 'uf') patch.uf = valor.trim().toUpperCase().slice(0, 2);
      else patch[campo] = valor.trim();
      if (Object.keys(patch).length > 0) await monitoringService.atualizarSistema(st.sistemaId, patch);
    }
    const proxIdx = st.idx + 1;
    if (proxIdx >= st.pendentes.length) { await donoFinalizar(from, st.sistemaId); return; }
    await setDonoCadState(from, { ...st, idx: proxIdx });
    await donoPerguntarUsina(from, st.pendentes[proxIdx]);
  }
```

- [ ] **Step 5: Guard de roteamento de texto (após `tryHandleClosingCommand`)**

Criar a função e chamá-la no ponto do roteador onde `tryHandleClosingCommand` é chamado (logo após, mesma ordem — ver mapa: closing roda depois dos botões admin). Adicionar:

```typescript
  async function tryHandleDonoCadCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const st = await getDonoCadState(from);
    if (!st) return false;                 // não está no fluxo
    const t = text.trim();
    if (/^cancelar$/i.test(t)) { await clearDonoCadState(from); await sendText(from, 'Cadastro cancelado.'); return true; }

    if (st.etapa === 'busca') {
      const achados = await supabase.searchClientesParaVinculo(t, 3);
      if (achados.length === 0) {
        if (metaWaba) await metaWaba.sendInteractiveButtons(from, 'Não achei ninguém com esse nome. Quer criar novo?', [
          { id: 'evabt:dono-novo', title: 'Criar novo' }, { id: 'evabt:dono-cancelar', title: 'Cancelar' },
        ]);
        else await sendText(from, 'Não achei. Responda: novo / cancelar');
        return true;
      }
      const botoes = achados.map((c) => ({ id: `evabt:dono-pick:${c.id}`, title: (c.name ?? 'sem nome').slice(0, 20) }));
      botoes.push({ id: 'evabt:dono-novo', title: 'Criar novo' });
      const corpo = 'Achei estes — escolha:\n' + achados.map((c) => `• ${c.name ?? '(sem nome)'} — ${[c.phone, c.city].filter(Boolean).join(' · ')}`).join('\n');
      if (metaWaba) await metaWaba.sendInteractiveButtons(from, corpo, botoes.slice(0, 3));
      else await sendText(from, corpo + '\n(responda o nome exato ou: novo)');
      return true;
    }

    if (st.etapa === 'novo') {
      if (ehPular(t) && !campoObrigatorioNovo(st.campo)) { await donoAvancarNovo(from, st, undefined); return true; }
      await donoAvancarNovo(from, st, t);
      return true;
    }

    if (st.etapa === 'usina') {
      if (ehPular(t)) { await donoAvancarUsina(from, st, undefined); return true; }
      await donoAvancarUsina(from, st, t);
      return true;
    }

    // etapa 'escolha': espera botão, mas aceita texto livre como atalho
    if (/^existe$/i.test(t)) { await setDonoCadState(from, { etapa: 'busca', sistemaId: st.sistemaId }); await sendText(from, 'Qual o nome do cliente?'); return true; }
    if (/^novo$/i.test(t)) { await setDonoCadState(from, { etapa: 'novo', sistemaId: st.sistemaId, campo: 'name', dados: {} }); await sendText(from, perguntaNovo('name')); return true; }
    return true; // está no fluxo: não deixa cair no fluxo normal da Eva
  }
```

E chamar no roteador, logo após a chamada de `tryHandleClosingCommand(...)`:
```typescript
    if (await tryHandleDonoCadCommand(from, text)) return;
```

- [ ] **Step 6: Type-check + suíte**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx vitest run`
Expected: tudo verde (nada de regressão).

- [ ] **Step 7: Commit**

```bash
git add src/index.ts
git commit -m "feat(monitoring): fluxo dono-cad no zap (estado, callbacks, roteamento)"
```

---

## Task 7: Verificação manual em prod (smoke)

Sem teste automatizado de WhatsApp ponta a ponta — validar manualmente após deploy.

- [ ] **Step 1: Build marker**

Bump `BUILD_VERSION` em `src/build-info.ts` para um valor novo (ex: `DONO-CAD-2026-06-07`) e commitar. Após deploy, `curl https://propostas.ecosunpower.eng.br/health` deve mostrar o novo `build`.

- [ ] **Step 2: Roteiro de smoke (Junior, no WhatsApp)**

Pré-condição: existir ao menos 1 usina órfã (lead_id nulo) que esteja com alerta aberto, OU forçar um alerta. Então:
1. Receber o alerta órfão → confirmar que mostra `⚠️ Usina SEM dono vinculado` e os botões `Cadastrar dono` / `Ver no painel` (sem Adiar).
2. Clicar **Cadastrar dono** → **Já existe** → digitar nome de um cliente real → escolher → confirmar vínculo → responder/pular os campos da usina → ver mensagem final ✅.
3. Repetir noutra órfã → **Criar novo** → nome → telefone → pular o resto → completar usina → ✅.
4. No dashboard, confirmar que o cliente aparece vinculado à usina.
5. Aguardar/forçar o próximo ciclo de alerta da mesma usina → confirmar que **não** vem mais como órfã (vem com nome do dono e botões normais).

---

## Self-review (cobertura x spec)

- Alerta órfã (status + botões, sem Adiar/Eva/ligar) → Task 3. ✔
- Botão Cadastrar dono inicia fluxo → Task 5 (`dono-cad`) + Task 6 (`onDonoCadStart`). ✔
- Caminho "Já existe" (busca → pick → vincular) → Task 6 (`tryHandleDonoCadCommand` etapa busca + `onDonoPick`), reusa `searchClientesParaVinculo`/`vincularClienteExistente`. ✔
- Caminho "Criar novo" completo com pular → Task 6 (`donoAvancarNovo`) + Task 2 (city/uf/cep). ✔
- Etapa "dados da usina" só-completa-vazios com pular/pular-tudo → Task 4 (`camposVaziosUsina`) + Task 6 (`donoIniciarEtapaUsina`/`donoAvancarUsina`), reusa `atualizarSistema` (update parcial). ✔
- Corrida (usina já vinculada) → Task 6 (`onDonoCadStart` checa `lead_id`). ✔
- Timeout/estado expirado → TTL 600s + guards `if (!st) return`. ✔
- Fallback Evolution (sem WABA) → todos os helpers têm ramo `else sendText`. ✔
- Dashboard de proprietário no ar → Task 1 (merge). ✔
- Auto-cura (próximo alerta normaliza) → consequência de setar `lead_id`; coberto pelo smoke Step 2.5. ✔

Nenhuma migration nova (todas as colunas já existem).
