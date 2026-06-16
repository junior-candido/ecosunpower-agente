# Financeiro — Peça 1: Captura Confiável (multi-evento + nunca calar)

**Data:** 2026-06-16
**Autor:** brainstorm Junior + Claude
**Status:** design — aguardando aprovação do Junior antes do plano de implementação

---

## Contexto

A Caixa de Entrada Universal (Fatia 3, LIVE 11/06) deixa o Junior lançar gasto/entrada
por texto, foto, áudio ou vídeo no WhatsApp. A Eva lê (extrator IA), classifica e cria
um lançamento pendente com botões de confirmação.

**Incidente que motivou esta peça (16/06):** Junior mandou numa mensagem só:
> "Recebi hoje de João Paulo cliente 9000,00 reais. Já paguei 1500,00 de instalação."

A Eva **travou** — não respondeu nada, nem imposto, nem "registrei".

## Causa raiz (confirmada no código)

1. **O extrator devolve UM lançamento só.** `ExtracaoLancamento`
   (`src/modules/financeiro/extrator-lancamento.ts`) tem um único `tipo` e um único
   `valor`. Uma mensagem com dois eventos (entrada R$9.000 + despesa R$1.500) não cabe
   na estrutura.

2. **O parser quebra com dois objetos.** `parseRespostaExtrator` usa a regex gulosa
   `raw.match(/(\{[\s\S]*\})/)` como fallback. Se o modelo emite dois objetos JSON
   (um por evento), a regex junta os dois num blob inválido → `JSON.parse` falha →
   retorna `null`.

3. **`null` vira silêncio.** Com extração `null` (ou `financeiro:false`, ou exceção
   no `catch`), `tryHandleFinanceiroTexto` retorna `false`. No `index.ts` (~L3748-3751)
   o texto livre do admin só tem a Caixa de Entrada como tratador; retornando `false`,
   a mensagem cai no fluxo de lead (~L3757+), que pro número do próprio Junior pode
   ser ignorado em silêncio (eva_active=false / takeover). Resultado: **muda**.

Mesmo no melhor caso (modelo escolhe um evento e ignora o outro), **metade do dinheiro
seria descartada em silêncio.** Junior confirmou: lançar várias coisas numa mensagem
só "acontece constantemente".

## Objetivos

1. A Eva entende **N lançamentos numa mensagem só** (texto, transcrição de áudio/vídeo,
   e mídia/comprovante quando houver mais de um valor).
2. Cada evento vira **seu próprio lançamento** com confirmação e imposto próprios.
3. **Nunca mais calar** numa mensagem que parece de dinheiro: se a Eva não conseguir
   separar os valores, ela **pergunta** em vez de sumir.

### Fora do escopo desta peça (ficam pras próximas, ordem aprovada)
- Peça 2: imposto "tem nota?" (default **com nota**) — `decisão Junior 16/06`.
- Peça 3: relatório mensal "me dá o relatório" no zap.
- Peça 5: menu/submenu do Financeiro.
- Peça 4: inteligência de materiais (preço/fornecedor por item).

---

## Design

### 1. Extrator passa a devolver uma LISTA

Hoje (`extrator-lancamento.ts`):
- `extrairDeTexto/Imagem/Pdf` → `ExtracaoLancamento | null` (um evento).

Proposto:
- Nova forma de retorno: `ExtracaoFinanceira` = `{ financeiro: boolean; lancamentos: ExtracaoLancamento[] }`.
  - `financeiro:false` → não é assunto de dinheiro (segue fluxo normal).
  - `financeiro:true` + `lancamentos:[]` (vazio) → é dinheiro mas a Eva não conseguiu
    extrair valor → gatilho do "nunca calar" (pergunta).
  - `financeiro:true` + N itens → cria N pendentes.
- `ExtracaoLancamento` (cada item) continua igual: tipo, valor, data, contraparte,
  categoria, pf_pj, obra_ref, intencao, relacionado, etc.

**Prompt** (`montarPromptExtracaoTexto`/`Midia`): instruir a devolver um **array** dentro
de UM bloco ```json```, um objeto por evento financeiro distinto. Regras atuais (não
inventar valor, BR vs americano, PF/PJ na dúvida=null, entrada vs despesa) preservadas
por item. Mensagem sem nenhum evento de dinheiro → `{"financeiro": false, "lancamentos": []}`.

### 2. Parser robusto (mata o bug da regex gulosa)

`parseRespostaExtrator` reescrito para, nesta ordem:
1. Achar o bloco ```json``` (ou o texto cru) e tentar `JSON.parse`.
2. Aceitar **3 formatos** do modelo, todos convertidos pra lista:
   - objeto `{financeiro, lancamentos:[...]}` (formato novo desejado);
   - **array** `[ {..}, {..} ]`;
   - **objeto único** `{..}` (compatibilidade — vira lista de 1).
3. Se vier **vários objetos soltos** (sem array, sem fence), extrair cada `{...}`
   com varredura balanceada de chaves (NÃO a regex gulosa) e parsear um a um;
   os que parsearem entram, os quebrados são ignorados.
4. Cada item passa pela validação de campo já existente (`numeroOuNull`, `strOuNull`,
   enums). Item sem valor válido **não** é descartado em silêncio: entra com
   `valor:null` + `campos_faltando:["valor"]` pra Eva perguntar.
- **Nunca explode.** Pior caso → `{financeiro:false, lancamentos:[]}` (e o "nunca calar"
  decide o que falar).
- Funções continuam **puras e testáveis** (é onde mora a maioria dos testes).

### 3. Orquestrador trata a lista

`tryHandleFinanceiroTexto` / `tryHandleFinanceiroMedia` (`caixa-entrada.ts`):
- Pega `lancamentos[]` e processa **cada um** pelo caminho que já existe
  (`criarPendenteEFalar` → resumo/botões; entrada PJ → imposto + oferta de vínculo).
- **UX de várias de uma vez:** uma linha de abertura curta ("Li 2 coisas aqui 👇") e
  depois um card por lançamento (mantém os botões `finlan:` por lançamento — sem
  reinventar o fluxo de confirmação que já funciona).
- **Interação com pendente "aguardando":** se já existe um pendente esperando resposta
  (ex.: faltou PF/PJ), e chega mensagem nova com N eventos, a regra atual de "relacionado"
  vale só pro 1º item; os demais são lançamentos novos. (Detalhe a fechar no plano.)
- **Dedupe** roda por item (igual hoje), não pela mensagem inteira.

### 4. Rede de segurança "nunca calar"

- `gate` disse SIM (é dinheiro) **e** `lancamentos` saiu vazio → a Eva responde:
  *"Entendi que é dinheiro, mas não consegui separar os valores 🤔 Me manda um por
  linha? (ex: 'recebi 9000 do João Paulo' / 'paguei 1500 de instalação')"* — em vez de
  retornar `false` calado.
- Extraiu alguns mas não todos (ex.: 2 ok, 1 sem valor) → lança os bons e **avisa**
  do que ficou de fora ("lancei 2; o terceiro valor não consegui ler, me confirma?").
- O `catch` de erro manda uma mensagem curta pro admin ("deu um erro aqui processando,
  tenta de novo?") em vez de `false` silencioso. (Hoje só faz `console.error`.)

---

## Casos de teste (TDD — teste falhando primeiro)

**Parser (puro):**
- 1 objeto → lista de 1.
- array de 2 → lista de 2 (caso João Paulo).
- 2 objetos soltos sem fence → lista de 2 (o bug de hoje vira verde).
- lixo/sem JSON → `{financeiro:false, lancamentos:[]}` (não explode).
- item sem valor → entra com `valor:null` + `campos_faltando:["valor"]`.

**Orquestrador (deps mockadas):**
- "recebi 9000 do João Paulo, paguei 1500 de instalação" → 2 pendentes
  (1 entrada PJ + 1 despesa), 2 respostas com botões.
- gate SIM + extração vazia → manda a pergunta (não fica mudo).
- mistura entrada+despesa não vaza imposto na despesa.

---

## Arquivos afetados (previsão)

- `src/modules/financeiro/extrator-lancamento.ts` — tipo de retorno em lista, prompt, parser.
- `src/modules/financeiro/caixa-entrada.ts` — loop sobre `lancamentos[]`, rede "nunca calar".
- `src/index.ts` — (provável) ajuste fino no ponto de chamada se mudar a assinatura.
- `src/modules/financeiro/resumo-lancamento.ts` — linha de abertura "li N coisas" (opcional).
- Testes: `tests/financeiro-extrator-*.test.ts` (parser), `tests/financeiro-caixa-*.test.ts` (orquestrador).

## Riscos / cuidados

- Não quebrar o fluxo de **1 evento** (a maioria das mensagens) — manter compatibilidade.
- Não duplicar lançamento quando o modelo repetir o mesmo evento (dedupe por item).
- Imposto só na entrada **PJ** (regra Fatia 2 intacta); despesa nunca calcula imposto.
- Custo de IA: 1 chamada por mensagem (não 1 por evento) — o modelo devolve todos juntos.

## Convenções do projeto a respeitar

- Code review 3× antes de pedir push; push só com autorização explícita.
- TDD no que é cálculo/parse; funções puras testáveis.
- Mensagens da Eva em PT-BR, palavras simples, com botões pras ações.
