# Peça 4 — Inteligência de materiais: comparar preço entre lojas

> Spec — 17/06/2026. Linguagem de propósito (pra ler e aprovar). Última peça do
> Departamento Financeiro "controle total" (ordem a): P1, P2, P3, P5 ✅ → **P4 (esta)**.

---

## 1. O que a gente quer

Quando o Junior compra material do bolso da empresa (cabo, disjuntor, DPS, caixa de
passagem...), ele manda do jeito mais fácil — **escreve, foto da nota, PDF, áudio ou
vídeo** — e a Eva, além de lançar o gasto (já faz), **guarda o preço daquele material
naquela loja**. Depois ele pergunta *"onde tá mais barato o DPS?"* e a Eva responde o
**ranking das lojas** (mais barato → mais caro), com **preço por unidade** e a data.

**Decisões do Junior (17/06):**
- Registro **na conversa natural** (mesmo jeito do gasto), sem passo extra.
- **Preço por unidade/metro** (ele diz a quantidade quando for mais de 1; senão = 1 un).
- Resposta = **ranking das lojas** (preço unitário + data da última compra).
- Consulta **escrevendo** ("preço do DPS"), sem menu.
- Guarda em **tabela própria** (migration nova).
- Funciona em **toda mídia que a Eva já lê** (texto/foto/PDF/áudio/vídeo).
- **Nada solto:** a compra de material nasce ligada ao financeiro (mesmo lançamento de
  gasto → caixa, lucro real, PF/PJ, comprovante arquivado, obra quando houver).

---

## 2. Captura (roda em cima da Caixa de Entrada que já existe)

A Caixa de Entrada (Fatia 3) já lê texto/foto/PDF e transcrição de áudio e produz um
`ExtracaoLancamento` (`src/modules/financeiro/extrator-lancamento.ts`). Todas as vias
(`extrairDeTexto`, `extrairDeImagem`, `extrairDePdf`) usam o MESMO schema/prompt — então
basta adicionar os campos de material UMA vez que vale pra todas as mídias.

**Campos novos no `ExtracaoLancamento`:**
- `material: string | null` — nome do material/produto ("DPS", "cabo 6mm", "disjuntor 40A").
- `quantidade: number | null` — quantos (100, 5). Default 1 quando não dito.
- `unidade: string | null` — "un", "m", "rolo", etc. Default "un".

A `loja` reusa a `contraparte` (a Eva já extrai "quem/fornecedor"). O `valor` é o total.
**Preço unitário = valor ÷ quantidade.**

Exemplos:
- "comprei DPS por 80 na Eletro X" → material=DPS, qtd=1, un=un, loja=Eletro X, R$ 80/un.
- "comprei 100m de cabo 6mm por 400 na Loja Y" → cabo 6mm, 100, m, Loja Y, R$ 4/m.
- Foto de cupom da Eletro X com "DPS 40A — R$ 78" → mesma extração, comprovante anexado.

O lançamento de gasto continua **idêntico** ao de hoje (vai pro caixa, lucro, PF/PJ,
comprovante no Storage). A camada de material é **a mais**, não muda o que já funciona.

---

## 3. Onde guarda — tabela `financeiro_materiais_compras` (migration 052)

Colunas:
- `id` uuid pk
- `lancamento_id` uuid fk → `financeiro_lancamentos(id)` (liga ao gasto; nada solto)
- `material` text (como o Junior escreveu)
- `material_norm` text (normalizado pra agrupar — lowercase, trim, espaços colapsados, sem acento)
- `loja` text (= contraparte do lançamento)
- `quantidade` numeric (default 1)
- `unidade` text (default 'un')
- `valor_total` numeric
- `preco_unitario` numeric (= valor_total / quantidade)
- `data_evento` date
- `created_at` timestamptz default now()

Índice em `material_norm` (a consulta filtra por ele). Cópia do SQL vai em
`Desktop\migration-052-materiais.sql` (linhas curtas — lição das migrations anteriores).

**Só grava quando o gasto é CONFIRMADO.** A compra de material é inserida no momento em
que o lançamento vira `confirmado` (botões `finlan:` — conf/vinc/atv). Se o Junior
descartar o pendente, **nada entra** na comparação (não polui). Um helper
`gravarCompraMaterialSeHouver(deps, lancamentoId)` roda após cada confirmação bem-sucedida:
lê o `extracao` do lançamento; se tiver `material`, calcula o preço unitário e insere.

---

## 4. Consulta (escrevendo) → ranking de lojas

O Junior manda algo como: "preço do DPS", "onde tá mais barato o cabo 6mm", "quanto custa
o disjuntor 40A". Um parser puro `parseConsultaMaterial(text)` reconhece os padrões e
extrai o **termo do material**. Admin-only. Roteado **ANTES do gate do caixa** (igual o
imposto), pra não virar lançamento.

`montarRankingMaterial(client, termo)`:
1. normaliza o termo (mesma função do `material_norm`).
2. busca compras com `material_norm ilike %termo%`.
3. agrupa por `loja`; por loja pega a **compra mais recente** (o preço que vale hoje).
4. ordena por `preco_unitario` crescente.
5. formata:

```
💰 DPS — onde tá mais barato:
1º  Eletro X — R$ 75/un (10/06)
2º  Loja Y  — R$ 82/un (02/06)
```

Vazio → "Ainda não tenho preço de *DPS* registrado. Compra uma vez que eu já guardo. 👍"

**Agrupamento (limitação conhecida, conforme aprovado):** agrupa pelo nome que o Junior
usa. Busca por aproximação (`ilike %termo%`): "DPS" acha "DPS 40A". Nomes muito diferentes
("protetor de surto" vs "DPS") NÃO juntam — o Junior chama sempre do mesmo jeito. Melhorar
com canônico/IA fica pra depois (YAGNI agora).

---

## 5. Ecossistema (nada solto)

- A compra de material **é** o lançamento de gasto → já entra no **caixa**, **lucro real**
  e **PF/PJ** (Fatias 2 e 3, intactas).
- O **comprovante** (foto/PDF) já fica anexado ao lançamento (Storage) — vale pro material.
- Quando o gasto tiver **obra/cliente** vinculado (`obra_ref`), o material fica ligado
  àquela obra (custo da obra) — a coluna `lancamento_id` carrega esse vínculo.
- Funciona em **toda entrada que a Eva já lê**: texto, foto, PDF, áudio (transcrito),
  vídeo — porque a captura roda em cima do extrator compartilhado.

---

## 6. Onde mora no código

- **Migration 052** — tabela `financeiro_materiais_compras` (+ cópia no Desktop).
- `src/modules/financeiro/extrator-lancamento.ts` — 3 campos novos (material/quantidade/unidade)
  no schema, no `normalizarItem` e no prompt.
- `src/modules/financeiro/materiais.ts` (NOVO) — `normalizarMaterial`, `parseConsultaMaterial`
  (puro), `gravarCompraMaterialSeHouver`, `montarRankingMaterial`.
- `src/modules/financeiro/lancamentos-repo.ts` ou um repo próprio — insert/select da tabela nova.
- `src/modules/financeiro/caixa-entrada.ts` — chamar `gravarCompraMaterialSeHouver` após cada
  confirmação (`finlan:` conf/vinc/atv).
- `src/index.ts` — rotear a consulta de material ANTES do gate do caixa (admin-only).
- `src/build-info.ts` — bump do marker.
- Testes (Vitest) + 3 code reviews (correção/regressão/segurança).

---

## 7. Testes

- `normalizarMaterial`: "DPS"/"dps"/" DPS  40A " → normalizado consistente; acento.
- `parseConsultaMaterial`: "preço do DPS"→"DPS"; "onde tá mais barato o cabo 6mm"→"cabo 6mm";
  "quanto custa disjuntor 40A"→"disjuntor 40A"; texto sem consulta → null.
- Preço unitário: valor 400 / qtd 100 = 4; qtd null → 1 (= valor total).
- `montarRankingMaterial` (repo mockado): ordena por preço unitário; por loja pega a mais
  recente; vazio → mensagem amigável; ilike acha "DPS 40A" buscando "DPS".
- `gravarCompraMaterialSeHouver`: sem material no extracao → no-op; com material → insere
  com preço unitário certo.
- Extrator: objeto com material/quantidade/unidade normaliza certo; sem eles → null/default.

---

## 8. Fora de escopo agora (YAGNI)

- Painel de materiais no dashboard (fica pra depois — não bloqueia a comparação no zap).
- Tendência de preço (subiu/caiu) — Junior escolheu só o ranking.
- Catálogo fixo / controle de estoque.
- Canônico inteligente de nomes (agrupar "protetor de surto" com "DPS").

---

## 9. Risco / esforço

Médio-baixo. 1 migration (tabela isolada, sem mexer nas existentes), 3 campos novos no
extrator (aditivos), 1 módulo novo + 1 hook no confirmar + 1 rota de consulta. Não altera
o fluxo de gasto que já funciona. Build marker novo confirma o deploy.
