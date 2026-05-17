# Eva — Qualificação por Área de Atuação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eva detecta a cidade do lead cedo e age conforme a área de atuação real (DF todas RAs + 11 cidades GO): dentro = normal; claramente fora = corte digno; GO/ambíguo = escala pro Junior validar, sem cortar.

**Architecture:** 3 camadas espelhando o Eva Vendedora DNA. Camada 1 = regra concisa no `system-prompt.md` (lista no prompt = gate determinístico). Camada 2 = REUSO: `disqualify_lead` ganha variante geográfica (`kind='fora_area'`), `alertEscalonamento` ganha motivo `fora_area_validar`, `leadEncerrado` cobre `fora_area`. Camada Conhecimento = arquivo curado com a §3 limpa do `06_Manual`.

**Tech Stack:** TypeScript ESM, Node 20, Vitest, RAG em prod, prompt em Markdown lido por `brain.ts`/`system-blocks.ts`.

**Spec:** `docs/superpowers/specs/2026-05-17-eva-area-atuacao-design.md`

---

## ⚠️ Regra de zero-regressão (vale em TODA task) — ATENÇÃO REDOBRADA

Esta feature MODIFICA código subido HOJE e ainda **não validado em prod** (Eva Vendedora DNA + `disqualify_lead` + caching foram pushados mas Junior ainda não Implantou/testou). Preservar intactos, verificado por leitura do diff em cada task:

- `disqualify_lead` caminho atual (lead inviável/Ivan): com `kind` ausente/`'inviavel'`, `buildDisqualifyPlan` deve produzir saída **byte-idêntica** à atual. `tests/lead-disqualify.test.ts` existente NÃO pode mudar de comportamento.
- `motivoEscalonamento`, `alertEscalonamento`, `leadEncerrado` (Camada 2 do Eva Vendedora DNA, commit `b0fd6cd`): só ADITIVO. Hot-lead detection byte-unchanged.
- `system-prompt.md`: bloco DNA de venda (`42ee5e5`), seção "REGRA — LEAD ON-TOPIC MAS INVIAVEL / VULNERAVEL" (disqualify_lead), carve-out de proatividade — byte-unchanged; nova seção é ADITIVA. Prefixo de cache (`system-blocks.ts`) intacto: só prosa estática, sem token volátil novo.
- `/preco` (mand. 7), `/proposta`, agendamento, takeover, RAG, "Responsável Técnico", marcas premium, R$700/700kWh, sem markdown vazando.
- Suítes que devem seguir verdes (além de `cases-fetcher` pré-existente permitida): `lead-disqualify`, `eva-alerts-escalonamento`, `system-blocks`, `cache-log`, `garantia-consistencia`, `brain`.

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `conhecimento/especializado/area-atuacao.md` | Fatos de cobertura (DF + 11 GO + regra fora-da-lista), RAG não-core | Criar |
| `src/modules/lead-disqualify.ts` | `buildDisqualifyPlan` ganha `kind` (inviavel\|fora_area) | Modificar |
| `tests/lead-disqualify.test.ts` | Testes da variante geo + default inalterado | Modificar |
| `src/modules/eva-alerts.ts` | `leadEncerrado` cobre `fora_area`; motivo `fora_area_validar` | Modificar |
| `tests/eva-alerts-escalonamento.test.ts` | Testes leadEncerrado(fora_area) + motivo novo | Modificar |
| `src/index.ts` | `disqualify_lead` lê `motivo=fora_de_area`; action `escalonar_validar_area` | Modificar |
| `src/prompts/system-prompt.md` | Nova seção "REGRA — ÁREA DE ATUAÇÃO" (aditiva) | Modificar (cirúrgico) |

---

## Task 1: Conhecimento — área de atuação (§3 limpa)

**Files:** Create `conhecimento/especializado/area-atuacao.md`

- [ ] **Step 1: Confirmar que NÃO é core**

Run: `grep -n "area-atuacao\|CORE_FILES" src/modules/rag/core-files.ts`
Expected: `area-atuacao` NÃO aparece (6 core = empresa/faq/objecoes/perguntas-qualificacao/processo/indicacao). Entra via RAG retrieve.

- [ ] **Step 2: Criar o arquivo (só fatos limpos da §3 do `06_Manual` — NÃO trazer história fabricada/"engenheiro")**

Conteúdo exato:

```markdown
# Área de Atuação — Ecosunpower

## Distrito Federal
A Ecosunpower atende todas as regiões administrativas do Distrito Federal (DF inteiro).

## Goiás — cidades atendidas (confirmadas)
- Valparaíso de Goiás
- Jardim Ingá (Luziânia)
- Cidade Ocidental
- Luziânia
- Novo Gama
- Pedregal (Novo Gama)
- Águas Lindas de Goiás
- São João da Aliança
- São Gabriel de Goiás
- Alto Paraíso de Goiás
- Formosa

## Cidade fora da lista
Nunca prometer atendimento de cidade não listada. Pedir a cidade e a concessionária da conta de luz e confirmar com o Junior, Responsável Técnico — em muitos casos a Ecosunpower atende mediante avaliação. Cliente claramente em outro estado / muito distante: encerrar com cordialidade, sem prometer.
```

- [ ] **Step 3: Preview pro Junior**

Mostrar o `.md` completo pro Junior aprovar (conteúdo cliente-facing). NÃO seguir sem aprovação. (Mesma regra do playbook de vendas.)

- [ ] **Step 4: Build + commit**

Run: `npx tsc && npx vitest run`
Expected: EXIT 0; verde (só `cases-fetcher`). (`.md` não afeta testes — sanity.)
```bash
git add conhecimento/especializado/area-atuacao.md
git commit -m "feat(eva): conhecimento area de atuacao (DF + 11 GO, §3 limpa)"
```

---

## Task 2: `buildDisqualifyPlan` — variante geográfica (TDD)

**Files:** Modify `src/modules/lead-disqualify.ts`; Modify `tests/lead-disqualify.test.ts`

- [ ] **Step 1: Ler o estado atual**

Run: `sed -n '1,80p' src/modules/lead-disqualify.ts`
Objetivo: confirmar a interface `DisqualifyLeadPatch` (`opt_out:true, eva_active:false, status:'descartado', contact_type:'inviavel', updated_at`) e a assinatura de `buildDisqualifyPlan({reason, leadName, phone, now?})`. Anotar os nomes/shape reais antes de modificar.

- [ ] **Step 2: Escrever os testes que falham** (append em `tests/lead-disqualify.test.ts`)

```ts
describe('buildDisqualifyPlan — variante fora_area', () => {
  const now = new Date('2026-05-17T12:00:00.000Z');

  it("kind='fora_area' -> contact_type='fora_area' + notifyBody geográfico", () => {
    const { leadPatch, notifyBody } = buildDisqualifyPlan({
      reason: 'cidade em outro estado (Salvador/BA)',
      leadName: 'Cliente X', phone: '5571999999999', now, kind: 'fora_area',
    });
    expect(leadPatch.eva_active).toBe(false);
    expect(leadPatch.opt_out).toBe(true);
    expect(leadPatch.status).toBe('descartado');
    expect(leadPatch.contact_type).toBe('fora_area');
    expect(notifyBody.toLowerCase()).toContain('área de atuação');
    expect(notifyBody).toContain('Cliente X');
    expect(notifyBody).toContain('5571999999999');
    expect(notifyBody).toContain('Salvador/BA');
    // NÃO pode usar o texto de lead inviável
    expect(notifyBody.toLowerCase()).not.toContain('inviável');
  });

  it("default (sem kind) e kind='inviavel' seguem byte-idênticos ao atual", () => {
    const a = buildDisqualifyPlan({ reason: 'baixa renda', leadName: 'Ivan', phone: '5561988887777', now });
    const b = buildDisqualifyPlan({ reason: 'baixa renda', leadName: 'Ivan', phone: '5561988887777', now, kind: 'inviavel' });
    expect(a.leadPatch.contact_type).toBe('inviavel');
    expect(a.notifyBody.toLowerCase()).toContain('inviável');
    expect(a).toEqual(b); // default === 'inviavel', zero regressão
  });
});
```

- [ ] **Step 3: Rodar — espera FAIL**

Run: `npx vitest run tests/lead-disqualify.test.ts`
Expected: FAIL (parâmetro `kind` não existe / `contact_type` não vira `'fora_area'`). Os testes ANTIGOS do arquivo devem continuar PASSANDO (prova de não-regressão).

- [ ] **Step 4: Implementar `kind` em `buildDisqualifyPlan`**

Adicionar `kind?: 'inviavel' | 'fora_area'` ao input (default `'inviavel'`). Quando `'fora_area'`: `contact_type: 'fora_area'` e `notifyBody` com enquadramento geográfico. Quando ausente/`'inviavel'`: saída IDÊNTICA à atual (não tocar no texto/título existente). Esboço (ajustar aos nomes reais lidos no Step 1):

```ts
export function buildDisqualifyPlan(input: {
  reason: string; leadName?: string | null; phone: string; now?: Date;
  kind?: 'inviavel' | 'fora_area';
}): DisqualifyPlan {
  const kind = input.kind ?? 'inviavel';
  const now = input.now ?? new Date();
  const nome = input.leadName?.trim() || 'Lead';
  const contact_type = kind === 'fora_area' ? 'fora_area' : 'inviavel';
  const leadPatch = { opt_out: true as const, eva_active: false as const,
    status: 'descartado' as const, contact_type, updated_at: now.toISOString() };
  const notifyBody = kind === 'fora_area'
    ? `🛑 *Eva encerrou — fora da área de atuação*\n${nome} — ${input.phone}\nMotivo: ${input.reason}\nBotão Desfazer reverte se for engano.`
    : /* TEXTO ATUAL DE LEAD INVIÁVEL — copiar EXATAMENTE o que já existe hoje, sem alterar */ <atual>;
  return { leadPatch, notifyBody };
}
```
> No Step 4 o executor DEVE colar o texto atual de lead inviável verbatim (lido no Step 1) no ramo `else` — não reescrever.

- [ ] **Step 5: Rodar — espera PASS** (novos + antigos)

Run: `npx vitest run tests/lead-disqualify.test.ts`
Expected: PASS (todos, incl. os antigos inalterados).

- [ ] **Step 6: Build + commit**

Run: `npx tsc && npx vitest run`
Expected: EXIT 0; verde (só `cases-fetcher`).
```bash
git add src/modules/lead-disqualify.ts tests/lead-disqualify.test.ts
git commit -m "feat(eva): buildDisqualifyPlan ganha variante fora_area (default inviavel inalterado)"
```

---

## Task 3: `leadEncerrado` cobre `fora_area` (TDD)

**Files:** Modify `src/modules/eva-alerts.ts`; Modify `tests/eva-alerts-escalonamento.test.ts`

- [ ] **Step 1: Escrever o teste que falha** (append no `describe('leadEncerrado')`)

```ts
it("contact_type='fora_area' -> encerrado (suprime escalonamento)", () => {
  expect(leadEncerrado({ contact_type: 'fora_area' })).toBe(true);
});
```

- [ ] **Step 2: Rodar — espera FAIL**

Run: `npx vitest run tests/eva-alerts-escalonamento.test.ts`
Expected: FAIL nessa asserção (hoje só cobre `inviavel`/`descartado`/`eva_active===false`).

- [ ] **Step 3: Implementar**

Em `leadEncerrado`, adicionar `|| lead.contact_type === 'fora_area'` à condição de retorno. Não mudar mais nada.

- [ ] **Step 4: Rodar — espera PASS** (todos os 12+)

Run: `npx vitest run tests/eva-alerts-escalonamento.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/eva-alerts.ts tests/eva-alerts-escalonamento.test.ts
git commit -m "fix(eva): leadEncerrado cobre contact_type=fora_area (guard cross-layer)"
```

---

## Task 4: Motivo de escalonamento `fora_area_validar` (TDD)

**Files:** Modify `src/modules/eva-alerts.ts`; Modify `tests/eva-alerts-escalonamento.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { MOTIVO_LABEL } from '../src/modules/eva-alerts.js'; // se ainda não importado
describe('motivo fora_area_validar', () => {
  it('existe label distinto pro caso de validar área', () => {
    expect(MOTIVO_LABEL['fora_area_validar']).toMatch(/área|area/i);
  });
});
```

- [ ] **Step 2: Rodar — espera FAIL**

Run: `npx vitest run tests/eva-alerts-escalonamento.test.ts`
Expected: FAIL (`fora_area_validar` não está em `MOTIVO_LABEL` nem no type).

- [ ] **Step 3: Implementar**

Em `eva-alerts.ts`: adicionar `'fora_area_validar'` ao union `MotivoEscalonamento` e uma entrada em `MOTIVO_LABEL` (ex.: `fora_area_validar: '📍 Validar área — cidade fora da lista'`). NÃO alterar `motivoEscalonamento` (esse motivo é acionado por action da Eva, não por regex de texto — comentar isso no código).

- [ ] **Step 4: Rodar — espera PASS**

Run: `npx vitest run tests/eva-alerts-escalonamento.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/eva-alerts.ts tests/eva-alerts-escalonamento.test.ts
git commit -m "feat(eva): motivo de escalonamento fora_area_validar"
```

---

## Task 5: Wiring no `index.ts` (disqualify geo + escalonar validar)

**Files:** Modify `src/index.ts`

- [ ] **Step 1: Ler o case atual `disqualify_lead`**

Run: `grep -n "case 'disqualify_lead'\|escalonar_validar_area\|buildDisqualifyPlan\|alertEscalonamento" src/index.ts`
Ler o bloco do `case 'disqualify_lead'` inteiro (anotar como `reason`/`action.data` chegam, e como `buildDisqualifyPlan`/notificação são chamados hoje).

- [ ] **Step 2: Estender `disqualify_lead` pra variante geo (sem mudar o caminho atual)**

No `case 'disqualify_lead'`, derivar `kind` de `action.data`: se `(action.data as any)?.motivo === 'fora_de_area'` → `kind='fora_area'`, senão `kind` ausente (caminho atual byte-idêntico). Passar `kind` pro `buildDisqualifyPlan({...existentes, kind})`. Notificação ao Junior usa o `notifyBody` retornado (já distinto). Botões Desfazer/Ver perfil reaproveitados como estão. Mostrar no commit o trecho exato (3-5 linhas alteradas).

- [ ] **Step 3: Adicionar handling da action `escalonar_validar_area`**

Adicionar um `case 'escalonar_validar_area':` no mesmo switch de actions. Lê `cidade` e `concessionaria` de `action.data`. Chama, fire-and-forget (mesmo padrão do bloco de escalonamento existente — `void (async()=>{ try{...}catch{} })().catch(()=>{})`), `alertEscalonamento(ctx, { id, name, phone:from }, 'fora_area_validar', textoComposto)` onde `textoComposto = `cidade: ${cidade ?? '?'} | concessionária: ${concessionaria ?? '?'}``. NÃO altera `eva_active` (lead permanece ativo, aguardando validação). Reusa `supabase.getLeadByPhone(from)` pra montar o lead do alerta (como o bloco de escalonamento já faz). Mostrar trecho exato no commit.

- [ ] **Step 4: Build + suíte + commit**

Run: `npx tsc && npx vitest run`
Expected: EXIT 0; verde (só `cases-fetcher`).
```bash
git add src/index.ts
git commit -m "feat(eva): wiring disqualify_lead geo + action escalonar_validar_area"
```

---

## Task 6: Regra no `system-prompt.md` (cirúrgico, aditivo)

**Files:** Modify `src/prompts/system-prompt.md`

> ⚠️ Componente sensível. O prompt JÁ tem (subido hoje): bloco "DNA DE VENDA", seção "REGRA — LEAD ON-TOPIC MAS INVIAVEL / VULNERAVEL", carve-out de PROATIVIDADE. NÃO duplicar, NÃO contradizer, NÃO reescrever — INSERIR uma seção nova.

- [ ] **Step 1: Localizar a âncora por grep (NÃO por nº de linha — o arquivo mudou hoje)**

Run: `grep -n "REGRA — LEAD ON-TOPIC MAS INVIAVEL\|disqualify_lead\|PROATIVIDADE" src/prompts/system-prompt.md`
Inserir a nova seção logo APÓS o fim da seção "REGRA — LEAD ON-TOPIC MAS INVIAVEL / VULNERAVEL" (mesma família "qualificar e, se for o caso, encerrar").

- [ ] **Step 2: Medir tamanho antes**

Run: `git show HEAD:src/prompts/system-prompt.md | wc -c`  (anotar bytes)

- [ ] **Step 3: Inserir a seção (aditiva, concisa ~20 linhas)**

```markdown
## REGRA — ÁREA DE ATUAÇÃO (qualificar cedo por localização)

A instalação é física. Detecte a cidade do cliente CEDO na qualificação (você já pergunta cidade/bairro) — antes de aprofundar valor. 3 casos:

1. DENTRO — Distrito Federal (qualquer região administrativa) OU uma destas 11 cidades de Goiás: Valparaíso de Goiás, Jardim Ingá, Cidade Ocidental, Luziânia, Novo Gama, Pedregal, Águas Lindas de Goiás, São João da Aliança, São Gabriel de Goiás, Alto Paraíso de Goiás, Formosa. → siga o fluxo normal, nada muda.

2. CLARAMENTE FORA — outro estado / claramente distante, sem chance de atendimento. → UMA mensagem cordial de encerramento (com dignidade, porta aberta: "se você for pra nossa região de atuação, me chama") e em SEGUIDA emita:
```json
{"action": "disqualify_lead", "data": {"motivo": "fora_de_area", "reason": "<cidade/estado do cliente>"}}
```
Depois NÃO responde mais (o sistema te tira da conversa, igual ao lead inviável). NÃO insista.

3. AMBÍGUO / GO não listada / cidade não identificada → NÃO corte. Responda exatamente no espírito: "Deixa eu confirmar com o Junior se atendemos sua cidade. Me passa o nome dela e a concessionária da sua conta de luz? Em muitos casos a gente atende mediante avaliação." Em seguida emita:
```json
{"action": "escalonar_validar_area", "data": {"cidade": "<cidade>", "concessionaria": "<concessionária ou '?'>"}}
```
Você CONTINUA na conversa (o lead segue ativo, aguardando o Junior validar). NUNCA prometa atendimento de cidade não listada.

Esta regra compõe com a regra de lead inviável (são gates independentes; se ambos, o de área decide primeiro o corte). A PROATIVIDADE não reabre lead cortado por área, e lead "aguardando validação de área" não é tratado como esfriamento.
```

- [ ] **Step 4: Medir tamanho depois + checklist de preservação**

Run: `wc -c src/prompts/system-prompt.md` (delta < ~2 KB; se maior, enxugar)
Confirmar por leitura do diff (deve ser 1 hunk aditivo, 0 deleções): bloco DNA de venda, seção lead inviável, carve-out proatividade, mandamento 7, "Responsável Técnico", regra de NUNCA inventar link — todos intactos. Sem novo `{{token}}`/data/volátil (prefixo de cache íntegro).

- [ ] **Step 5: Build + commit**

Run: `npx tsc && npx vitest run`
Expected: EXIT 0; verde (só `cases-fetcher`).
```bash
git add src/prompts/system-prompt.md
git commit -m "feat(eva): regra de area de atuacao no prompt (hibrido, aditivo)"
```

---

## Task 7: Verificação antes/depois + entrega

- [ ] **Step 1: Build + suíte completos**

Run: `npx tsc && npx vitest run`
Expected: EXIT 0; verde exceto `cases-fetcher`. Conferir verdes: `lead-disqualify`, `eva-alerts-escalonamento`, `system-blocks`, `cache-log`, `garantia-consistencia`, `brain`.

- [ ] **Step 2: Code review holístico obrigatório**

Dispatch superpowers:requesting-code-review sobre o diff total das Tasks 1-6. Foco: zero-regressão (lista do topo, com ÊNFASE em código subido hoje — `buildDisqualifyPlan` default byte-idêntico, disqualify_lead caminho inviável intacto, prompt aditivo, eva-alerts aditivo); cross-layer (área × lead inviável × proatividade × escalonamento — reusa `leadEncerrado`, não duplica, não contradiz); prompt não inchou (delta < ~2 KB); content sem promessa/concorrente/"engenheiro". Corrigir Critical/Important; reavaliar.

- [ ] **Step 3: Teste antes/depois com o Junior (interativo — precisa dele)**

Junior, de número NÃO-admin: (a) lead DF → segue normal; (b) lead 1 das 11 GO → segue normal; (c) lead outro estado (ex.: "sou de Salvador") → corte digno + notificação "fora da área" distinta + Desfazer; (d) lead GO não listada (ex.: "Rio Verde-GO") → NÃO corta, pede cidade+concessionária, escala; (e) lead evasivo sobre cidade → Eva pergunta cedo. Confirmar `/preco`, `/proposta`, agendamento, takeover, e o corte de lead inviável (Ivan) **idênticos**. NÃO pular.

- [ ] **Step 4: Push + Implantar**

```bash
git push origin main
```
Junior: Implantar `agente-whatsapp` no Easypanel. Conferir boot + log `[rag]` (area-atuacao embedado) + 1 smoke test real.

- [ ] **Step 5: Atualizar memória**

Registrar: feature área de atuação EM PROD; reuso de disqualify_lead(fora_area)/alertEscalonamento(fora_area_validar)/leadEncerrado; lista oficial DF+11GO; pendência garantia-estrutura ainda aberta.

---

## Self-Review (preenchido)

**Spec coverage:** área oficial DF+11GO → Task 1 (conhecimento) + Task 6 (prompt, lista no gate). Híbrido 3-casos → Task 6 (regra) + Task 2 (corte geo) + Tasks 4/5 (escala validar). Label distinto no painel → Task 2 (`contact_type='fora_area'` + notifyBody). Reuso disqualify_lead/escalonamento/leadEncerrado → Tasks 2/3/4/5. Detecção = julgamento da Eva no prompt (campo `city` já existe) → Task 6. Reconciliação com lead inviável + proatividade → Task 6 Step 3. Zero-regressão (ênfase código de hoje) → regra global + checklists Task 2/6 + review Task 7. §3 limpa, sem contaminação → Task 1 Step 2. Fora de escopo (geocoding/DDD/06_Manual inteiro/garantia-estrutura) → respeitado, não há task. Sem gap.

**Placeholder scan:** o único `<atual>` (Task 2 Step 4 ramo inviável) é instrução explícita "colar verbatim o texto atual lido no Step 1" — conteúdo-fonte existe no arquivo, não é inventável aqui e seria erro reescrevê-lo; Step 1 (ler) + Step 5 (testes antigos verdes) cobrem. `<cidade>`/`<estado>` nos JSON do prompt são placeholders de instrução PRA EVA (ela preenche em runtime), não TODO de implementação. Sem TBD/TODO de design.

**Type consistency:** `kind?: 'inviavel'|'fora_area'` (Task 2) usado idêntico no teste (Task 2 Step 2), impl (Step 4) e wiring (Task 5 Step 2). `MotivoEscalonamento` ganha `'fora_area_validar'` (Task 4) usado no `MOTIVO_LABEL` (Task 4) e em `alertEscalonamento(...,'fora_area_validar',...)` (Task 5 Step 3). `contact_type='fora_area'` consistente entre Task 2 (gera) e Task 3 (`leadEncerrado` cobre). Action `escalonar_validar_area` consistente entre prompt (Task 6) e handler (Task 5 Step 3).

**Escopo:** plano único, testável, 7 tasks bite-sized; Sub-projetos 2/3 do Eva Vendedora e garantia-estrutura fora.
