# Financeiro — Peça 2: Imposto "tem nota?" (caixa real × faturado)

**Data:** 2026-06-16
**Status:** design — aprovado pelo Junior (verbal), aguardando spec review antes do plano

## Contexto

Decisão do Junior: ele só paga imposto (DAS) sobre o que tem **nota fiscal**. Hoje o
sistema taxa TODA entrada da empresa (PJ) — o que infla o imposto vs. o que ele paga de
verdade. Esta peça permite marcar entradas como **sem nota** (caixa apenas, fora do imposto),
mantendo o padrão **com nota** sem nenhum atrito no dia a dia.

Decisões cravadas:
- **Padrão = com nota** (taxado, exatamente como hoje). Zero pergunta/botão a mais.
- Junior **fala "sem nota"** (ou "por fora"/"sem comprovante") numa entrada pra tirá-la do imposto.
- "Sem nota" só vale pra **entrada avulsa**; pagamento de **venda fechada** (`/fechar`, com `conta_id`) continua com nota.
- Painel mostra **Entrou (caixa real)** × **Faturado (base do imposto)** e a diferença.

## Como o motor funciona hoje (confirmado no código)

- Uma entrada PJ avulsa, ao confirmar (`handleFinlanButton` caso `conf`, `caixa-entrada.ts:329`),
  cai no gate "entrada + PJ + sem conta → escolher atividade" → `finlan:atv` →
  `criarContaDeFechamento` + `registrarRecebimento` (motor Fatia 2: cria conta, grava
  `financeiro_recebimentos`, soma no bucket RBT12, calcula imposto).
- O painel (`dashboard/financeiro-queries.ts`) calcula **Faturado** e **Imposto a separar**
  a partir de `financeiro_recebimentos` (só o que passou pelo motor).
- Um lançamento simplesmente "confirmado" (despesa, ou entrada que NÃO passou pela atividade)
  **não** cria conta nem recebimento → não entra no faturado/imposto/RBT12.

**Sacada:** "sem nota" = rotear a entrada PJ pelo **caminho de confirmação simples** (que já
existe) em vez do caminho da atividade. O motor de imposto não muda em nada.

## Design

### 1. Flag `tem_nota` (default true)
- Migration: coluna `tem_nota boolean NOT NULL DEFAULT true` em `financeiro_lancamentos`.
  Default true → todo o histórico e todo o caminho padrão ficam "com nota". Nada muda.
- SQL entregue em arquivo na Área de Trabalho pro Junior aplicar (MCP Supabase aponta pro
  projeto errado — lição das fatias anteriores). Cópia em `Desktop\migration-049-tem-nota.sql`.

### 2. Extrator detecta "sem nota"
- `ExtracaoLancamento` ganha `tem_nota: boolean` (default **true**).
- Regra no prompt: se a pessoa disser que a entrada é **sem nota / por fora / sem comprovante
  / não vai dar nota**, `tem_nota=false`. Qualquer outro caso → `true`. (Só faz sentido em
  `tipo:"entrada"`; em despesa o campo é ignorado.)
- `parseLancamentos`/`normalizarItem`: ler `tem_nota` (default true se ausente/!== false).

### 3. Pendente guarda a flag
- `criarPendente` grava `tem_nota` (vem da extração). `getLancamento`/`LancamentoRow` expõem.

### 4. Roteamento "sem nota" (sem tocar no motor)
- `mandarResumo` (`caixa-entrada.ts:130`): hoje, entrada PJ → oferta de vínculo. Acrescentar:
  se `tem_nota === false`, **não** oferece vínculo nem atividade — vai direto pro card de
  confirmação simples (`montarResumoPendente`).
- `handleFinlanButton` caso `conf` (`caixa-entrada.ts:329`): o gate
  `entrada && PJ && !conta_id` ganha `&& row.tem_nota !== false`. Sem nota → cai no
  `mudarStatus(...,'confirmado')` simples (sem conta, sem recebimento, sem RBT12, imposto 0).
- Mensagem da Eva: entrada **sem nota** confirma como
  `💰 Entrada lançada: R$ X (sem nota — fora do imposto)`. Com nota segue igual.

### 5. Painel: caixa real × faturado
- Hoje o KPI de entrada vem de `financeiro_recebimentos` (= faturado, com nota).
- Adicionar a soma das **entradas sem nota** = lançamentos `tipo=entrada`, `pf_pj=PJ`,
  `status=confirmado`, `conta_id IS NULL`, `tem_nota=false`, na competência.
- Painel passa a mostrar: **💰 Entrou (caixa real)** = faturado + sem nota;
  **🧾 Faturado (base imposto)** = só com nota; **diferença** = o "por fora".
- O lançamento sem nota aparece na lista com um selo "sem nota".
- Lucro real: lucro = entrou (caixa real) − saiu − imposto (imposto só sobre o faturado).
  Conferir que o cálculo de lucro usa o caixa real, não só o faturado.

## Casos de teste (TDD)
**Extrator (puro):**
- "recebi 5000 do fulano sem nota" → 1 entrada, `tem_nota=false`.
- "recebi 5000 do fulano" → `tem_nota=true`.
- "paguei 300 de material" → despesa, `tem_nota` irrelevante (default true, ignorado).
- ausência do campo no JSON → default true.

**Roteamento (puro, helper novo):**
- `entradaPrecisaImposto({tipo:'entrada', pf_pj:'PJ', conta_id:null, tem_nota:true})` → true (atividade).
- mesma com `tem_nota:false` → false (confirma como caixa).
- despesa / PF → false.

**Painel (puro):**
- entrou = faturado + sem_nota; faturado isola com nota; diferença = sem_nota.

## Arquivos afetados (previsão)
- Migration `049` (coluna `tem_nota`) — arquivo SQL pro Junior.
- `src/modules/financeiro/extrator-lancamento.ts` (campo + prompt + parse).
- `src/modules/financeiro/lancamentos-repo.ts` (gravar/ler `tem_nota`).
- `src/modules/financeiro/caixa-entrada.ts` (`criarPendente` passa flag; `mandarResumo` e `conf` roteiam; mensagem).
- `src/modules/dashboard/financeiro-queries.ts` (+ soma sem nota; KPIs).
- `src/modules/financeiro/resumo-lancamento.ts` (selo "sem nota" / mensagem, se preciso).
- Testes: extrator, helper de roteamento, KPIs do painel.

## Riscos / cuidados
- **Motor Fatia 2 intacto** — sem nota só evita ENTRAR no motor; não altera imposto/RBT12/contas.
- Default true em tudo → caminho padrão e histórico inalterados (verificar suíte verde).
- Vinculada a venda (`conta_id`) nunca é "sem nota" — venda formal é com nota.
- "Sem nota" é exclusivo de PJ (PF não tem imposto de empresa de qualquer forma).
- Migração ANTES do deploy (coluna nova) senão grava/lê quebra.

## Convenções
- Code review por task + final; push só com autorização; TDD nos puros; PT-BR palavras simples; botões pras ações.
