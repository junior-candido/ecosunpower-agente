# Peça 5 — Submenu Financeiro no /menu da Eva

> Spec — 17/06/2026. Linguagem de propósito (pra ler e aprovar, não é manual técnico).
> Parte do Departamento Financeiro "controle total" (ordem a): ...Peça 3 ✓ → **Peça 5 (esta)** → Peça 4.

---

## 1. O que a gente quer

Hoje os comandos do Financeiro (relatório do mês, cálculo de imposto, lançar gasto,
abrir o painel) existem mas ficam **soltos** — o Junior tem que lembrar a palavra certa.
A Eva já tem um `/menu` interativo com categorias e submenus (Propostas, Fechamento,
Marketing, Atendimento, Operação). O Financeiro aparece lá só como **um item de dica
enterrado dentro de "Operação"**.

**Pedido do Junior (16-17/06):** "nada mais solto, tudo em menu". O Financeiro vira uma
**categoria própria** no `/menu`, com seu **submenu** de ações — igual as outras categorias.

**Não muda o dia a dia automático:** quando entra dinheiro, o Junior manda foto/áudio/texto
e a Eva já lança e já calcula o imposto sozinha. Isso continua intacto. O submenu é pra
quando ele quer **consultar/agir sob demanda**.

---

## 2. Onde isso encaixa (reaproveita o que já existe)

Tudo mora em `tryHandleMenuCommand` (`src/index.ts`, ~linha 3121). O menu já tem 3 níveis:

- **Nível 1** — `menu` → lista de categorias (`menucat_<id>`).
- **Nível 2** — toca a categoria → lista os itens (`menu_<id>`).
- **Nível 3** — toca o item → roda o handler do comando OU manda uma dica de texto.

A Peça 5 **não cria menu novo nem palavra-chave nova**. Só:
1. Adiciona uma categoria `financeiro` ao array `MENU_CATEGORIES`.
2. Remove o item solto `menu_financeiro` de dentro da categoria `operacao`.
3. Para o item "Calcular imposto", adiciona um pequeno "modo esperando valor" (único
   pedaço de lógica nova).

**Sem tabela nova. Sem migration. Sem dependência nova.**

---

## 3. O submenu 💰 Financeiro (4 itens do núcleo)

| Item | Comportamento | Como |
|---|---|---|
| 📊 Relatório do mês | Roda o resumo do mês na hora | Chama `tryHandleRelatorioCommand(from, 'relatório')` — handler já existe |
| 🧾 Calcular imposto | Eva pergunta o valor; Junior digita **em reais**; Eva calcula | Novo "modo esperando valor" (ver §4) |
| 💸 Lançar gasto/entrada | Dica-guia | Texto: "manda a foto/áudio ou escreve o gasto, ex: *gastei 380 no posto*" |
| 📈 Abrir painel | Manda o link do painel | Texto com `https://dashboard.ecosunpower.eng.br/dashboard/financeiro` |

Estrutura final das categorias do `/menu`:

```
⚙️ Menu
 ├─ 💼 Propostas
 ├─ 📝 Fechamento
 ├─ 📣 Marketing
 ├─ 📅 Atendimento
 ├─ 💰 Financeiro   ← NOVA categoria (4 itens acima)
 └─ 🔧 Operação      (perde o item "Financeiro" enterrado)
```

---

## 4. O único pedaço novo: "Calcular imposto" pergunta o valor

Fluxo:

1. Junior toca **🧾 Calcular imposto** no submenu.
2. Eva responde: *"🧾 Qual o valor da venda? Me manda em reais (ex: 30.000 ou R$ 30 mil)."*
   e marca um **estado "esperando valor de imposto"** pra esse admin (TTL curto, ~5 min).
3. Próxima mensagem do Junior:
   - Se **parecer um valor** (em reais) → a Eva calcula com `montarRespostaImposto(client, valor)`
     e limpa o estado.
   - Se for **outra coisa** (ex: "menu", outro comando, texto que não é número) → limpa o
     estado e deixa a mensagem seguir o fluxo normal (não engole comando do Junior).

**Leitura do valor em reais (parser novo, tolerante):** aceita `30000`, `30.000`,
`30.000,50`, `R$ 30.000`, `30 mil`, `30k`. Reusa a lógica de decimal do
`parseImpostoCommand` (ponto-com-2-dígitos = decimal americano; senão ponto=milhar,
vírgula=decimal) + trata `mil`/`k` (×1000) e tira o `R$`. Retorna `null` se não for valor
válido > 0 → nesse caso a Eva trata como "não era valor" e libera o fluxo.

**Onde guarda o estado:** Redis (mesmo padrão dos outros estados conversacionais de admin,
TTL curto). Chave por telefone do admin. Sem persistência longa — é efêmero de propósito.

---

## 5. Bordas e regras

- **Admin-only:** todo o `/menu` já gateia em `isAdminPhone`. O submenu e o modo-esperando-valor
  herdam isso. Cliente nunca vê.
- **Sem loop:** os handlers chamados (relatório) já gateiam admin e não chamam o menu de volta.
- **Fallback sem WABA:** o `enviarLista` já cai pra texto quando não há `metaWaba`. O submenu
  Financeiro herda isso de graça.
- **"Esperando valor" não pode sequestrar o Junior:** TTL curto + só captura se parecer valor;
  qualquer comando conhecido ("menu", "/...", "relatório", etc.) cancela o estado e segue.
- **Imposto do dia a dia (automático) não é tocado** — só o caminho de consulta sob demanda.

---

## 6. Testes (Vitest)

- Parser de valor em reais: `30000`, `30.000`, `30.000,50`, `R$ 30.000`, `30 mil`, `30k`,
  lixo → `null`, `0`/negativo → `null`.
- Menu: categoria `financeiro` aparece no nível 1; o submenu lista os 4 itens; o item solto
  some da `operacao`.
- Dispatch: `menu_relatorio` chama o handler de relatório; `menu_imposto` entra no modo
  esperando valor; `menu_lancar`/`menu_painel` mandam a dica certa.
- Modo esperando valor: valor válido → calcula e limpa; texto não-valor → libera o fluxo e limpa.

---

## 7. Fora de escopo (YAGNI)

- Menu geral de departamentos (decidido: só Financeiro agora — confirmado pelo Junior).
- "Quem me deve (a receber)" e "DAS do mês" como itens — ficam fora do núcleo (decisão Junior:
  núcleo de 4). Podem virar itens depois, sem retrabalho (é só somar no array).
- Não mexe no imposto automático do dia a dia.

---

## 8. Risco / esforço

Baixo. Mexe num arquivo (`src/index.ts`, função `tryHandleMenuCommand`) + 1 helper de parser
de valor + estado Redis efêmero. Sem migration, sem schema, sem deploy de banco. Build marker
novo no `/health` pra confirmar que prod pegou.
