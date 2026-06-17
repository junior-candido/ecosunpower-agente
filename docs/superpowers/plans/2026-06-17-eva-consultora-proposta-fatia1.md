# Eva consultora na proposta — Fatia 1 (porta de entrada via template)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o cliente abre a proposta, a Eva abre conversa com ele via TEMPLATE aprovado (porta de entrada), em vez de tentar texto livre e falhar fora da janela 24h.

**Architecture:** Reaproveita o `proposal-followup.ts` (gatilho de abertura + idempotência + avisos já existem). Só troca o envio de texto-livre (`montarMensagemCliente` + `metaService.sendText`) por TEMPLATE via `enviarTemplateInicial` (helper com fallback que já usamos no lead). A conversa depois segue no Brain como hoje.

**Tech Stack:** TypeScript (Node ESM), WABA template, Vitest.

**Pré-requisito:** template `eva_proposta_aberta_v1` (ou o nome final que o Junior confirmar) criado e APROVADO na Meta. Sem aprovação, cai no fallback `reativacao_lead_v1` (igual o lead).

---

## File Structure

- `src/modules/proposal-followup.ts` — `executarEnvio` passa a mandar template; injeta o nome do template + o `TemplateSender`.
- `src/index.ts` — onde o `ProposalFollowupService` é instanciado: passar o nome do template da abordagem (config/constante).
- `src/build-info.ts` — bump.
- `tests/proposal-followup-template.test.ts` (novo).

---

## Task 1: proposal-followup envia TEMPLATE na abordagem

**Files:**
- Modify: `src/modules/proposal-followup.ts`
- Test: `tests/proposal-followup-template.test.ts` (criar)

- [ ] **Step 1: Write the failing test**

```ts
// tests/proposal-followup-template.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ProposalFollowupService } from '../src/modules/proposal-followup.js';

// Helper: instancia o serviço com deps mockadas e expõe executarEnvio via any.
function makeService(over: Partial<any> = {}) {
  const sendTemplate = vi.fn().mockResolvedValue({ messageId: 'm1' });
  const supabase = {
    getClient: () => ({ from: () => ({ update: () => ({ eq: () => ({ error: null }) }) }) }),
    getLeadByPhone: vi.fn().mockResolvedValue(null),
  };
  const svc = new ProposalFollowupService({
    supabase: supabase as any,
    metaService: { sendTemplate, sendText: vi.fn(), sendInteractiveButtons: vi.fn() } as any,
    sendText: vi.fn(),
    engineerPhone: '5561999999999',
    proposalBaseUrl: 'https://x',
    redis: null,
    delayMs: 0,
    ...over,
  });
  return { svc, sendTemplate };
}

describe('proposal-followup: abordagem via template', () => {
  it('executarEnvio manda TEMPLATE (não texto livre) com o 1º nome', async () => {
    const { svc, sendTemplate } = makeService();
    // markFollowupSent é stubbado pelo supabase mock acima.
    await (svc as any).executarEnvio('slug1', 'João Silva', '5561988887777');
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    const [to, name, lang, components] = sendTemplate.mock.calls[0];
    expect(to).toBe('5561988887777');
    expect(lang).toBe('pt_BR');
    // 1ª variável do corpo = primeiro nome
    expect(components[0].parameters[0].text).toBe('João');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/proposal-followup-template.test.ts`
Expected: FAIL — hoje `executarEnvio` chama `metaService.sendText` (texto livre), não `sendTemplate`.

- [ ] **Step 3: Implement — trocar texto livre por template**

Em `src/modules/proposal-followup.ts`:

(a) No topo, importar o helper de template:

```ts
import { enviarTemplateInicial } from './template-inicial.js';
```

(b) Adicionar o nome do template como campo da classe + dep do construtor.
No `interface FollowupDeps` adicionar:

```ts
  // Nome do template aprovado de abordagem de proposta (porta de entrada fria).
  // Confirmado pelo Junior ao criar na Meta. Fallback reativacao_lead_v1 se 132001.
  templateAbordagem: string;
```

Na classe, adicionar o campo e setar no construtor:

```ts
  private templateAbordagem: string;
  // ... no constructor:
  this.templateAbordagem = deps.templateAbordagem;
```

(c) Reescrever `executarEnvio` (linhas ~195-230) pra mandar template:

```ts
  private async executarEnvio(
    slug: string,
    clienteNome: string,
    clienteTelefone: string,
  ): Promise<void> {
    if (!this.metaService) {
      await this.markSkipped(slug, 'waba_indisponivel');
      return;
    }
    try {
      const { templateUsado } = await enviarTemplateInicial(
        this.metaService,
        clienteTelefone,
        clienteNome,
        this.templateAbordagem,
      );
      await this.markFollowupSent(slug);
      console.log(`[proposal-followup] abordagem (${templateUsado}) enviada pra ${clienteNome} (${clienteTelefone}) slug=${slug}`);
      await this.sendText(this.engineerPhone, `✅ Eva abordou ${clienteNome} sobre a proposta.`).catch(() => {});
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`[proposal-followup] falha ao abordar ${clienteTelefone}:`, msg);
      await this.markSkipped(slug, 'envio_falhou');
      await this.sendText(this.engineerPhone, `⚠️ Não consegui abordar ${clienteNome} sobre a proposta. Contata manual: ${clienteTelefone}`).catch(() => {});
    }
  }
```

(d) `montarMensagemCliente` fica sem uso — remover o método (linhas ~337-346) pra não deixar morto.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/proposal-followup-template.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/proposal-followup.ts tests/proposal-followup-template.test.ts
git commit -m "feat(proposta): abordagem da Eva via template aprovado (porta de entrada)"
```

---

## Task 2: Passar o nome do template na instanciação (index.ts)

**Files:**
- Modify: `src/index.ts` (onde `new ProposalFollowupService({...})` é criado, ~L520-530)

- [ ] **Step 1: Localizar a instanciação**

Run: `grep -n "new ProposalFollowupService" src/index.ts`

- [ ] **Step 2: Adicionar `templateAbordagem` ao objeto de deps**

No objeto passado pro `new ProposalFollowupService({...})`, adicionar:

```ts
        // Template de abordagem da proposta. ⚠️ TROCAR pelo nome final que o
        // Junior confirmar ao criar na Meta (o de lead virou '_eva_qualificacao_v1').
        templateAbordagem: 'eva_proposta_aberta_v1',
```

> Quando o Junior confirmar o nome final aprovado, ajustar SÓ esta string (1 lugar).

- [ ] **Step 3: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros (o novo campo obrigatório `templateAbordagem` agora é passado).

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(proposta): liga o nome do template de abordagem no followup"
```

---

## Task 3: Build marker + verificação final

**Files:**
- Modify: `src/build-info.ts`

- [ ] **Step 1: Bump do marker** para `PROPOSTA-ABORDAGEM-2026-06-17`.

- [ ] **Step 2: Verificação**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc limpo; suíte verde (só as 2 pré-existentes `supabase-vincular-novo`).

- [ ] **Step 3: Commit**

```bash
git add src/build-info.ts
git commit -m "chore(proposta): build marker PROPOSTA-ABORDAGEM-2026-06-17"
```

---

## Deploy + Smoke

1. Confirmar o nome final do template aprovado na Meta → ajustar `templateAbordagem` se diferente → (se mudou) commit.
2. Push (autorização) → Implantar → `curl /health` = `PROPOSTA-ABORDAGEM-2026-06-17`.
3. Smoke: gerar uma proposta de teste, abrir o link `/p/:slug` com um número real (não-admin) → o número recebe a **abordagem da Eva** (template) na hora → responder → cai no Brain normal.
4. Conferir: aviso "✅ Eva abordou Fulano sobre a proposta" chega no zap do Junior.

## Reviews (regra: 3 code reviews antes do push)

3 passadas (correção/regressão/segurança), corrigindo achados, antes de pedir autorização.

---

## Fatia 2 (próximo plano, separado)

Turbinar a CONVERSA: postura de fechamento no Brain pra clientes com proposta aberta
(comparar opções, quebrar objeção, persuadir) + handoff formal ("quero falar com o Junior"
→ ação do Brain → avisa o Junior + takeover). Mexe em `brain.ts`/`system-blocks.ts`/ações +
`takeover.ts` — brainstorm/plano próprios.
