# Menu: botão Voltar + comandos soltos organizados

**Data:** 2026-06-19
**Autor:** Junior + Eva (Claude)

## Problema

1. Vários comandos que o admin (Junior) usa por texto não aparecem no menu
   interativo do WhatsApp. A regra do projeto é "tudo no menu, nada de comando
   solto" — então quem não sabe o comando de cabeça não acha a função.
2. O menu tem 2 níveis (categorias → ações). Ao tocar numa categoria errada,
   não há como voltar pras categorias: a lista do WhatsApp não tem "voltar"
   nativo. O usuário precisa digitar "menu" de novo.

## Escopo

Duas mudanças no handler do menu em `src/index.ts` (array `MENU_CATEGORIES` e
a navegação por volta das linhas 3300–3443). Sem migration, sem mudança de
banco. Mudança puramente de apresentação/navegação do menu.

### Parte 1 — Botão ⬅️ Voltar

Toda lista de **submenu** (nível 2, ações de uma categoria) ganha uma última
linha `⬅️ Voltar`. Tocar nela reabre a lista de **categorias** (nível 1).

Implementação: a linha Voltar usa `id: 'menu'`. Quando tocada, o WhatsApp
devolve "menu" como texto, que cai no `isMenuTrigger` já existente
(`trimmedLower === 'menu'`) e reabre as categorias. Reaproveita o caminho
existente, sem novo branch de navegação e sem risco de loop.

A lista de categorias (nível 1) NÃO ganha Voltar — é o topo. O nível 3 executa
um comando (não é lista) — também não precisa.

**Limite do WhatsApp:** lista interativa aceita no máximo 10 linhas. Após
adicionar os itens da Parte 2 + o Voltar, a contagem por categoria fica:

| Categoria      | Itens hoje | + novos | + Voltar | Total |
|----------------|-----------|---------|----------|-------|
| 💼 Propostas    | 8         | +1      | +1       | **10** (no limite) |
| 📝 Fechamento   | 3         | 0       | +1       | 4 |
| 📣 Marketing    | 4         | +3      | +1       | 8 |
| 📅 Atendimento  | 3         | +1      | +1       | 5 |
| 💰 Financeiro   | 5         | +1      | +1       | 7 |
| 🔧 Operação     | 3         | 0       | +1       | 4 |

💼 Propostas chega exatamente em 10 — funciona, mas não cabe mais nada depois
sem reorganizar. Aceito por ora.

### Parte 2 — 6 comandos soltos entrando no menu

Itens que precisam de um nome/valor viram **hint** (dica de texto, padrão já
usado por "ajustar", "contrato" etc). Itens que rodam sozinhos viram **trigger
+ handler** (botão direto).

| Categoria      | Novo item                          | Tipo    | Trigger/dica |
|----------------|------------------------------------|---------|--------------|
| 💰 Financeiro   | 💰 Comparar preço de material      | hint    | "manda *preço do cabo 6mm*" |
| 💼 Propostas    | ✅ Marcar como fechado             | hint    | "manda *fechei nome ou telefone*" |
| 📣 Marketing    | ♻️ Resgatar leads de formulário    | trigger | `/resgatar-forms` → `tryHandleResgatarFormsCommand` |
| 📣 Marketing    | 📊 Resumo Google Ads               | trigger | `/google` → `tryHandleGoogleAdsCommand` |
| 📣 Marketing    | 🖼️ Banner tabela (kits)            | trigger | `/banner-kits` → `tryHandleBannerKitsCommand` |
| 📅 Atendimento  | 📧 Cadastrar email do lead         | hint    | "manda *email telefone email*" |

Comandos deixados **fora** do menu de propósito (uso técnico raro):
`/sync-marketing`, `/post-fb`, `/recarregar-config`.

## Arquitetura / pontos de mudança

- `src/index.ts`, array `MENU_CATEGORIES` (~3311): adicionar os 6 itens nas
  categorias certas.
- `src/index.ts`, função `enviarLista` / nível 2 (`catClick`, ~3404): anexar a
  linha `⬅️ Voltar` (`id: 'menu'`) ao final das rows de cada submenu.
- Confirmar que os handlers referenciados (`tryHandleResgatarFormsCommand`,
  `tryHandleGoogleAdsCommand`, `tryHandleBannerKitsCommand`) estão no escopo do
  closure do menu (mesma forma que os já usados nos itens existentes).

## Tratamento de erros

- Fallback texto já existe em `enviarLista` (quando `metaWaba` falha) — a linha
  Voltar entra no fallback texto também, naturalmente.
- Item com trigger cujo handler retorna `false` já mostra aviso de
  indisponível (comportamento existente, reaproveitado).

## Testes

- Teste de unidade do builder das rows: garantir que cada submenu termina com a
  linha Voltar (`id: 'menu'`) e que nenhuma categoria passa de 10 rows.
- Teste de que os 6 novos itens existem nas categorias certas com o
  trigger/hint esperado.
- Como `MENU_CATEGORIES` está embutido no `index.ts`, avaliar extrair a
  definição do menu pra um módulo testável (`src/modules/menu/...`) OU testar
  via uma função pura exportada. Decisão fica pro plano.

## Fora de escopo

- Reorganizar categorias / paginar quando passar de 10 (Propostas).
- Adicionar Voltar no nível 3.
- Colocar os comandos técnicos no menu.
