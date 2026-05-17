# Eva Vendedora — Sales-DNA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a Eva mais persuasiva e fechadora (DNA de vendas) sem regredir nenhuma capacidade em prod.

**Architecture:** 3 camadas — (1) `system-prompt.md` recebe o núcleo de venda DESTILADO; (2) `eva-alerts.ts` ganha gatilhos extras de escalonamento; (3) playbook de vendas vira `.md` no `conhecimento/` (RAG já em prod). Inbox `_INBOX-EVA-VENDAS/` alimenta a camada 3. Prompt fica enxuto; profundidade no RAG.

**Tech Stack:** TypeScript ESM, Node 20, Vitest, RAG já em prod (pgvector + OpenAI embeddings), prompt em Markdown lido por `brain.ts`.

**Spec:** `docs/superpowers/specs/2026-05-17-eva-vendedora-dna-design.md`

**Fonte de conteúdo:** os 2 documentos de vendas colados pelo Junior em 17/05 (Doc A identidade/personas/fluxo; Doc B entrega de valor). Estão na conversa de brainstorm; o executor deve tê-los à mão (se não tiver, PEDIR ao Junior antes de Task 4/2).

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `Documents/EcoSunPower/_INBOX-EVA-VENDAS/_LEIA.md` | Inbox de material de vendas (fora do git) | Criar |
| `conhecimento/especializado/vendas-playbook.md` | Playbook de vendas (RAG, não-core) | Criar |
| `src/modules/eva-alerts.ts` | Detecção lead-quente + gatilhos de escalonamento | Modificar |
| `tests/eva-alerts-escalonamento.test.ts` | Testes dos novos gatilhos | Criar |
| `src/prompts/system-prompt.md` (1443 linhas) | Núcleo de persona/venda da Eva | Modificar (cirúrgico) |
| `src/prompts/residencial.md` + análogos | Adaptação por segmento (investigar mecanismo) | Modificar/Criar |

**Regra de zero-regressão (vale em TODA task):** preservar intactos `/preco` (mandamento 7), `/proposta`, agendamento autônomo, takeover `/eva on|off|manutencao`, RAG Nível 2, título "Responsável Técnico" (nunca "engenheiro"), marcas premium (nunca Growatt), critério R$700/700kWh, sem markdown vazando. Falha pré-existente de teste `cases-fetcher` é permitida; todo o resto verde.

---

## Task 1: Inbox de vendas

**Files:**
- Create: `C:\Users\Meu Computador\Documents\EcoSunPower\_INBOX-EVA-VENDAS\_LEIA.md`

- [ ] **Step 1: Criar a pasta e o `_LEIA.md`**

Criar o diretório `Documents/EcoSunPower/_INBOX-EVA-VENDAS/` e dentro o arquivo `_LEIA.md` com este conteúdo:

```markdown
# 📥 INBOX de VENDAS da Eva

Junior larga aqui material de VENDAS (livros, metodologias, scripts, PDFs de persuasão).
Claude cura → vira/atualiza `conhecimento/especializado/vendas-playbook.md` → RAG embeda no deploy.

## Fluxo
1. Joga o arquivo aqui.
2. No chat: "processa o <nome> do inbox de vendas".
3. Claude estrutura no playbook → preview pra aprovar → commit+push → Implantar → verifica log `[rag]`.

## Aceita
PDF ✅ · imagem ✅ · texto colado ✅ · vídeo ❌ (mandar transcrição).

## Regras
- NÃO é versionado (fora do git). Conteúdo curado vai como `.md` em `conhecimento/`.
- Estatística = tendência ("estudos do setor apontam"), nunca promessa.
- Separado do `_INBOX-EVA/` (técnico/datasheets — descartado da Eva).
```

- [ ] **Step 2: Verificar**

Run: `ls "/c/Users/Meu Computador/Documents/EcoSunPower/_INBOX-EVA-VENDAS/_LEIA.md"`
Expected: o caminho existe.

- [ ] **Step 3: Sem commit** — pasta é fora do git (não rastrear). Apenas confirmar criação. Não rodar `git add` nessa pasta.

---

## Task 2: Playbook de vendas no RAG

**Files:**
- Create: `conhecimento/especializado/vendas-playbook.md`

- [ ] **Step 1: Confirmar que NÃO é arquivo core**

Run: `grep -n "vendas-playbook\|CORE_FILES" src/modules/rag/core-files.ts`
Expected: `vendas-playbook` NÃO aparece em `CORE_FILES` (os 6 core são empresa/faq/objecoes/perguntas-qualificacao/processo/indicacao). Logo o arquivo novo entra via RAG (retrieve), não injeção fixa. Confirmar antes de seguir.

- [ ] **Step 2: Criar `conhecimento/especializado/vendas-playbook.md`**

Estruturar, a partir do **Doc B** (entrega de valor) + partes de venda do **Doc A**, com títulos `##` (o chunker corta por `##`/`###`). Conteúdo obrigatório, nesta organização:

```markdown
# Playbook de Vendas — Ecosunpower (uso interno da Eva)

## Princípio central
Não vende painel — vende 3 patrimônios: financeiro (ativo que se paga), imobiliário (valorização), tranquilidade (independência do reajuste 25 anos). Número é consequência, nunca o argumento.

## Pilar 1 — Qualidade tier 1 (aparece no ano 10)
[texto do Doc B pilar 1, integral, ajustado: garantia de PERFORMANCE do painel é do FABRICANTE (~25 anos/80%); instalação/mão de obra EcoSunPower = 12 meses — nunca misturar]

## Pilar 2 — Inversor é o coração
[Doc B pilar 2; garantia do inversor = fabricante ~10-12 anos premium]

## Pilar 3 — Empresa viva em 2040
[Doc B pilar 3; "[X anos no mercado]" → NÃO inventar número: usar "empresa ativa e consolidada há anos"; se Junior informar o número real, usar]

## Pilar 4 — Valorização patrimonial (por segmento)
[Doc B pilar 4 residencial/comercial/industrial/agro; "4-8%" sempre como "levantamentos do setor imobiliário apontam", nunca promessa]

## Pilar 5 — Independência da inflação energética
[Doc B pilar 5; "tarifa +8%/ano" como "média histórica do setor", nunca garantia]

## Reframes de preço
[a tabela do Doc B: "quanto custa"/"tá caro"/"economizo quanto"/"quero orçamento" → resposta que devolve pra valor]

## Movimentos de ancoragem
[os 3 do Doc B: gasto futuro acumulado; analogia patrimonial; inversão financeira]

## Frases-chave da marca
[as 5 do Doc B]

## Scripts de valor por segmento
[Doc B blocos + Doc A ganchos por segmento: residencial/comercial/industrial/agro — dor, linguagem, gancho]

## Repertório objeção → reframe
[objeções típicas: esposa/sócio, dinheiro, comparação, medo da tecnologia, Lei 14.300 — com a resposta]

## Respostas-padrão
[Doc A: sobre preço (devolve a valor, payback como FAIXA aprox.), prazo (depende homologação), técnica profunda (anota p/ Responsável Técnico), marca (tier 1, recomendação depende dimensionamento), concorrente (compare tier/inversor/tempo de empresa — sem citar nome)]
```

Regras de redação: PT-BR com acentuação perfeita; sem `[colchetes]` no arquivo final (substituir pelo conteúdo real do Doc B/A); estatísticas sempre hedgeadas; nunca citar concorrente por nome; nunca prometer payback exato (faixa "em média 3-5 anos pra perfis assim"); título sempre "Responsável Técnico".

- [ ] **Step 3: Preview pro Junior**

Mostrar o `.md` completo pro Junior aprovar (conteúdo cliente-facing/venda). Ajustar conforme feedback. NÃO seguir sem aprovação dele.

- [ ] **Step 4: Build da suíte (não quebrou nada) + commit**

Run: `npx tsc && npx vitest run`
Expected: EXIT 0; suíte verde (só `cases-fetcher` pré-existente).
```bash
git add conhecimento/especializado/vendas-playbook.md
git commit -m "feat(eva): playbook de vendas no RAG (5 pilares, reframes, ancoragens)"
```

---

## Task 3: Gatilhos de escalonamento (TDD)

**Files:**
- Modify: `src/modules/eva-alerts.ts`
- Create: `tests/eva-alerts-escalonamento.test.ts`

- [ ] **Step 1: Ler o módulo atual**

Run: `grep -n "export function\|export async function\|hotlead\|lead quente\|conta\|kwh" src/modules/eva-alerts.ts | head -40`
Objetivo: entender a função de detecção existente (a "rede de proteção lead quente pelos dados", ~linha 214) e a assinatura/retorno. Reusar, não duplicar. Anotar o nome real da função exportada (chamar de `detectarEscalonamento` neste plano se não existir equivalente; se existir função de hot-lead, ESTENDER ela).

- [ ] **Step 2: Escrever o teste que falha**

```ts
// tests/eva-alerts-escalonamento.test.ts
import { describe, it, expect } from 'vitest';
import { motivoEscalonamento } from '../src/modules/eva-alerts.js';

describe('motivoEscalonamento', () => {
  it('urgência explícita escala', () => {
    expect(motivoEscalonamento({ text: 'quero fechar hoje', contaMensal: 800 })).toBe('urgencia');
    expect(motivoEscalonamento({ text: 'já tô decidido, bora', contaMensal: 800 })).toBe('urgencia');
  });
  it('conta alta escala', () => {
    expect(motivoEscalonamento({ text: 'oi', contaMensal: 16000 })).toBe('conta_alta');
  });
  it('concorrente com proposta escala', () => {
    expect(motivoEscalonamento({ text: 'tenho uma proposta da outra empresa aqui', contaMensal: 900 })).toBe('concorrente');
  });
  it('hostilidade escala', () => {
    expect(motivoEscalonamento({ text: 'isso é golpe, parem de me encher', contaMensal: 900 })).toBe('hostilidade');
  });
  it('conversa normal NÃO escala', () => {
    expect(motivoEscalonamento({ text: 'quanto economizo por mês?', contaMensal: 900 })).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar — espera FAIL**

Run: `npx vitest run tests/eva-alerts-escalonamento.test.ts`
Expected: FAIL (`motivoEscalonamento` não existe).

- [ ] **Step 4: Implementar `motivoEscalonamento` em `src/modules/eva-alerts.ts`**

Adicionar (export nomeado), sem alterar a detecção de hot-lead existente:

```ts
export type MotivoEscalonamento =
  | 'urgencia' | 'conta_alta' | 'concorrente' | 'hostilidade' | 'estrategico';

/**
 * Gatilhos do Sub-projeto 1 (spec 2026-05-17): a Eva deve interromper o fluxo
 * e notificar o Junior imediatamente. Complementa a rede de hot-lead por dados
 * (não substitui). Retorna o motivo ou null.
 */
export function motivoEscalonamento(args: { text: string; contaMensal?: number }): MotivoEscalonamento | null {
  const t = (args.text ?? '').toLowerCase();
  if (/\b(quero fechar|fechar hoje|fechar agora|j[áa] (t[ôo]|estou) decidid|decidir essa semana|bora fechar)\b/.test(t)) return 'urgencia';
  if ((args.contaMensal ?? 0) >= 15000 || /\bm[úu]ltiplas? (unidades|ucs|filiais|lojas)\b/.test(t)) return 'conta_alta';
  if (/\b(proposta|or[çc]amento) (da|de) (outra|concorrente|empresa)\b|j[áa] tenho (uma )?proposta\b/.test(t)) return 'concorrente';
  if (/\b(golpe|enganaç|enrola[çr]|para de me encher|n[ãa]o me perturb|absurdo|palha[çc]ada)\b/.test(t)) return 'hostilidade';
  return null;
}
```
(`estrategico` fica disponível pro caller marcar manualmente — não há heurística de texto confiável; não inferir.)

- [ ] **Step 5: Rodar — espera PASS**

Run: `npx vitest run tests/eva-alerts-escalonamento.test.ts`
Expected: PASS (5).

- [ ] **Step 6: Ligar no fluxo de mensagem (`src/index.ts`)**

Localizar onde a mensagem do cliente é processada (mesmo handler do auto-ack / hot-lead, perto de `[hotlead]` em index.ts). Após a detecção de hot-lead existente, chamar `motivoEscalonamento({text, contaMensal})`; se != null, disparar a MESMA notificação imediata ao Junior já usada pelo hot-lead (reusar a função de alerta existente — não criar canal novo) com o motivo no texto do alerta. Não bloquear o fluxo (fire-and-forget, padrão da casa). Mostrar o trecho exato alterado no commit.

- [ ] **Step 7: Build + suíte + commit**

Run: `npx tsc && npx vitest run`
Expected: EXIT 0; verde (só `cases-fetcher`).
```bash
git add src/modules/eva-alerts.ts tests/eva-alerts-escalonamento.test.ts src/index.ts
git commit -m "feat(eva): gatilhos de escalonamento (urgencia/conta-alta/concorrente/hostilidade)"
```

---

## Task 4: Cirurgia no system-prompt.md (núcleo de venda destilado)

**Files:**
- Modify: `src/prompts/system-prompt.md` (1443 linhas — NÃO reescrever; inserir cirurgicamente)
- Modify/Investigate: `src/prompts/residencial.md` + `src/modules/brain.ts:51-115` (mecanismo de prompt por segmento)

> ⚠️ Componente mais sensível. O prompt JÁ tem "POSTURA DE VENDEDORA TOP 1" (l.37), "5 mandamentos" (l.41), "10 REGRAS DE COMPORTAMENTO" (l.125), "Sua personalidade" (l.426), "FLUXO DE ENCERRAMENTO" (l.968). NÃO duplicar nem contradizer — INTEGRAR.

- [ ] **Step 1: Ler as seções-âncora**

Ler `src/prompts/system-prompt.md` linhas 37-260 (postura/mandamentos/10 regras), 426-525 (personalidade/tom/papel), 968-1108 (encerramento). Ler `src/modules/brain.ts:45-130` pra entender como `system-prompt.md` e `residencial.md` são montados e se há seleção por segmento. Anotar como o segmento é (ou não) injetado hoje.

- [ ] **Step 2: Decidir o mecanismo de segmento e DOCUMENTAR no commit**

Se `brain.ts` já seleciona prompt por segmento (residencial.md sugere isso): criar análogos `comercial.md`/`industrial.md`/`agro.md` no mesmo padrão e estender a seleção. Se NÃO há mecanismo: adicionar uma seção "ADAPTAÇÃO POR SEGMENTO" no system-prompt.md (dor/linguagem/gancho dos 4 segmentos do Doc A, condensado) — sem criar arquivos. Escolher o caminho que segue o padrão existente; não inventar arquitetura nova.

- [ ] **Step 3: Inserir o núcleo destilado (NÃO verbatim dos docs)**

Dentro da seção "POSTURA DE VENDEDORA TOP 1" (ou logo após os 5 mandamentos, l.~108), inserir bloco conciso (~30-40 linhas, não mais):

```markdown
## DNA DE VENDA — VALOR ANTES DO NÚMERO
Você não vende painel. Vende 3 patrimônios: financeiro (ativo que se paga), imobiliário (valorização do imóvel), tranquilidade (independência do reajuste por 25 anos). Número (preço/kWp/payback) é consequência, NUNCA o argumento principal. Cliente que compra por preço vai embora por preço.

Quando o cliente falar preço/caro/desconto/orçamento, SEMPRE devolva pra valor antes do número:
- "quanto custa?" → o que ele adquire (qualidade que aparece no ano 10) antes do número
- "tá caro" → caro vs. os próximos 25 anos pagando à concessionária
- "economizo quanto?" → economia é 1 das 3 coisas; também valoriza imóvel e trava reajuste
- "quero orçamento" → orçamento é sob medida; entende o caso primeiro

Frases da marca (use natural, não decorado): "Solar barato sai caro, solar bem feito se paga." · "Não é um produto, é uma relação de 25 anos." · "Cada ano sem solar é dinheiro que vai pra concessionária e não volta." · "A pergunta não é se vale, é até quando pagar aluguel de energia." · "É o único investimento que se paga com o que você já gasta hoje."

Profundidade (pilares completos, ancoragens, scripts por segmento) vem do conhecimento recuperado — use o que o contexto trouxer.

PROATIVIDADE: nunca termine no vácuo. Se o cliente esfriar, retome com ângulo de valor novo, notícia/tema relevante (tarifa, Lei 14.300), pergunta provocativa, ou leveza/humor SE o tom dele permitir — sempre puxando pro próximo passo (agendar visita/Meet). Persistente ≠ chato: respeite "Sair"/desinteresse claro; humor só espelhando o tom (nunca infantil/forçado, nunca abala credibilidade do Responsável Técnico).
```

Ajustar a redação pra casar com o tom do prompt existente (revisar as linhas vizinhas ao inserir). NÃO repetir o que já está nos "5 mandamentos"/"10 regras" — referenciar/reforçar, não duplicar.

- [ ] **Step 4: Verificação de preservação (checklist manual)**

Confirmar por leitura do diff que continuam intactas e não-contraditas: regra #1 acentuação, mandamentos existentes, regra de NUNCA inventar link/proposta, identidade, "Responsável Técnico" (nunca "engenheiro"), fluxo de encerramento, formato/tamanho de resposta, mandamento 7 (preço = estimativa). O bloco novo NÃO pode habilitar dar preço fechado nem prometer payback exato.

- [ ] **Step 5: Build + suíte + commit**

Run: `npx tsc && npx vitest run`
Expected: EXIT 0; verde (só `cases-fetcher`).
```bash
git add src/prompts/system-prompt.md
# + src/prompts/*.md e src/modules/brain.ts se Step 2 criou arquivos de segmento
git commit -m "feat(eva): DNA de venda destilado no prompt (valor-antes-do-numero + proatividade)"
```

---

## Task 5: Verificação antes/depois + entrega

- [ ] **Step 1: Build + suíte completos**

Run: `npx tsc && npx vitest run`
Expected: EXIT 0; suíte verde exceto `cases-fetcher` (pré-existente).

- [ ] **Step 2: Code review obrigatório**

Dispatch reviewer (superpowers:requesting-code-review) sobre o diff total das Tasks 2-4. Foco: zero regressão (lista da regra de zero-regressão), prompt não inchou demais (medir bytes antes/depois de system-prompt.md; alvo: acréscimo < ~3 KB), escalonamento não-bloqueante e não duplica hot-lead, playbook sem promessa/concorrente-nomeado. Corrigir o que vier Critical/Important; reavaliar.

- [ ] **Step 3: Teste antes/depois com o Junior (interativo — precisa dele)**

Junior roda conversas de exemplo (de número não-admin) nos 4 segmentos + 1 objeção de preço + 1 lead fora de perfil (< R$700). Comparar com o comportamento anterior. Critério: Eva conduz/reframa/fecha melhor E `/preco`, `/proposta`, agendamento, takeover seguem idênticos. Se algo regredir, voltar à task correspondente. NÃO pular este passo.

- [ ] **Step 4: Push + Implantar**

```bash
git push origin main
```
Junior: Implantar `agente-whatsapp` no Easypanel. Conferir no log boot sem erro; smoke test de 1 conversa de venda real.

- [ ] **Step 5: Atualizar memória**

Atualizar memória: Sub-projeto 1 (Eva vendedora DNA) EM PROD; abrir Sub-projeto 2 (cadência) e Sub-projeto 3 (blog→RAG/ABSOLAR) como próximos. Registrar o caminho do playbook e da inbox de vendas.

---

## Self-Review (preenchido)

**Spec coverage:** princípio 3 patrimônios → Task 4; 4 reframes/5 frases/6 fases/segmento → Task 4 + playbook Task 2; escalonamento (Parte 7) → Task 3; playbook RAG (pilares/ancoragens/scripts) → Task 2; inbox de vendas → Task 1; proatividade-nunca-muda → Task 4 Step 3; zero-regressão → regra global + Task 4 Step 4 + Task 5 Steps 2-3; cadência/blog/ABSOLAR → explicitamente fora (Sub-projetos 2/3). Sem gap.

**Placeholder scan:** os `[colchetes]` na Task 2 Step 2 são instrução de "substituir pelo conteúdo real do Doc B/A" (o conteúdo-fonte está nos 2 docs do Junior, não inventável aqui) — Task 2 Step 3 (preview/aprovação) cobre. "[X anos no mercado]" tem regra explícita de não inventar. Não há TODO/TBD de design.

**Type consistency:** `motivoEscalonamento(args:{text,contaMensal?})→ MotivoEscalonamento|null` usado idêntico no teste (Task 3 Step 2), implementação (Step 4) e wiring (Step 6).

**Escopo:** plano único, testável; Sub-projetos 2/3 fora.
