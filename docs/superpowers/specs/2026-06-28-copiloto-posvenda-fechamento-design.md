# Copiloto Pós-venda — fechamento (agenda · notas · sugestão proativa · termômetro/repositório)

**Data:** 2026-06-28
**Branch:** `feat/copiloto-posvenda-fechamento`
**Tela:** `/dashboard/pos-venda`
**Raia:** CRM/Dashboard (`src/modules/dashboard/`)

## Objetivo

Fechar os 4 itens que faltavam no copiloto de pós-venda, numa entrega só:

1. **Agenda lateral** — follow-ups agregados de todos os clientes + lembrete na mão.
2. **Notas internas por cliente** — anotações privadas do operador (não vão pro cliente).
3. **Sugestão proativa / atalho inteligente** — a melhor ação agora, por regra, que pré-preenche a Eva no clique.
4. **Termômetro + repositório** — temperatura do relacionamento + linha do tempo unificada das interações.

## Princípio condutor: REUSAR, não recriar

O sistema já tem a infra que esses 4 itens precisam. **Nenhuma tabela nova.**

| Item | Reusa o que já existe |
|------|------------------------|
| Agenda / lembretes | `lead_tarefas` + `tarefas.ts` (`criarTarefa`, `tarefasPendentes`, `concluirTarefa`, `adiarTarefa`) |
| Notas internas | `lead_atividades` tipo `'nota'` + `atividades.ts` (`registrarAtividade`) |
| Repositório (histórico) | `lead_atividades` + `listarTimeline()` |
| Sugestão proativa | `proximaAcaoPosVenda` + `saudeUsina` (já calculados em `pos-venda-queries.ts`) |
| Termômetro | mesmos sinais da saúde + último contato (já carregados na `PosVendaLinha`) |

## Decisões travadas (brainstorm 2026-06-28)

- Entregar os **4 numa entrega só**.
- Agenda permite **agendar follow-up na mão** (não só o automático).
- Notas = **entradas com data e autor** (linha do tempo), não bloco único.
- Sugestão = **regra pronta no card + IA só no clique** (sem queimar token ao carregar).
- Termômetro = temperatura por **regras**; Repositório = **linha do tempo unificada**.
- Layout = **coluna lateral fixa** (no celular vira bloco recolhível no topo).
- Notas/histórico aparecem **só no pós-venda** por enquanto (não mexer na página do lead nesta entrega).

## Arquitetura

Tela `/dashboard/pos-venda` passa a ter **2 colunas** no desktop:

```
┌─────────────────────────────────────┬──────────────────────┐
│  Lista de clientes (como já é)       │  🗓️ AGENDA           │
│  ┌─────────────────────────────────┐ │  🔴 Atrasados        │
│  │ 🔥 🟢 João Silva   ❤️ há 12d    │ │   • João — ligar (2d │
│  │ 💡 90 dias sem falar — manda oi │ │     atrás) ✓ +1d +7d │
│  │ [🎉][📊][🧹][⭐][🔋][📞]        │ │  🟡 Hoje             │
│  │ [💬 Eva] [📓 Notas] [➕ Lembrete]│ │   • Maria — revisão  │
│  └─────────────────────────────────┘ │  🔵 Próximos 7 dias  │
│  ...                                  │   • ...              │
└─────────────────────────────────────┴──────────────────────┘
```

No mobile (`< lg`): a agenda vira um bloco `<details>` recolhível acima da lista.

### Componentes (cada um com uma responsabilidade)

**Lógica pura (novos arquivos, testáveis com vitest):**

- `pos-venda-termometro.ts` — `temperatura(linha): 'quente' | 'morno' | 'frio'`
- `pos-venda-sugestao.ts` — `sugestaoProativa(linha): { texto: string; pedidoEva: string } | null`
- `pos-venda-agenda.ts` — `agruparAgenda(tarefas, hoje): { atrasados, hoje, semana }` (puro; agrupa por `due_at`)

**Camada de dados (reusa helpers existentes; validada por tsc + smoke):**

- `pos-venda-queries.ts` — estende `PosVendaLinha` com `temperatura` e `sugestao`; nova `listarAgendaPosVenda(client, companyId)` (tarefas pendentes dos leads que estão em `etapa_obra='pos_venda'`).
- Notas: usa `registrarAtividade(tipo:'nota')` e `listarTimeline()` direto de `atividades.ts`.
- Lembrete: usa `criarTarefa`, `concluirTarefa`, `adiarTarefa` de `tarefas.ts`.

**View:**

- `pos-venda-views.ts` — layout 2 colunas, termômetro + chip de sugestão + painel de notas/histórico no card, painel da agenda na lateral, JS dos novos botões.

### Endpoints novos (em `router.ts`, padrão dos já existentes)

| Método | Rota | Permissão | O que faz |
|--------|------|-----------|-----------|
| POST | `/pos-venda/:leadId/lembrete` | `usinas:editar` | cria lembrete (`criarTarefa` tipo `custom`, due_at, título) |
| POST | `/pos-venda/tarefa/:id/concluir` | `usinas:editar` | `concluirTarefa` (anti-IDOR: confere lead do pós-venda da company) |
| POST | `/pos-venda/tarefa/:id/adiar` | `usinas:editar` | `adiarTarefa` (+1d / +7d) |
| POST | `/pos-venda/:leadId/nota` | `usinas:editar` | grava nota interna (`registrarAtividade` tipo `nota`, `automatica:false`, `user_id`) |
| GET | `/pos-venda/:leadId/historico` | `usinas:visualizar` | devolve `listarTimeline()` em JSON (notas + envios + contatos) |

A agenda em si é carregada junto no `GET /pos-venda` (sem rota separada).

### Multi-tenant / segurança

- Toda leitura/escrita filtra por `company_id` do `req.dashUser`, como o resto do pós-venda.
- Endpoints de tarefa (`/tarefa/:id/...`) validam que a tarefa pertence a um lead do pós-venda **da company** antes de alterar (anti-IDOR), reusando o `leadId` no update (`concluirTarefa(.., leadId)` já suporta).

## Regras das funções puras

### `temperatura(linha)`
Sinais disponíveis na `PosVendaLinha`: `saude`, `ultimoContatoEm`, `jaTeveDepoimento`, `dataInstalacao`.

- 🔥 **quente**: `ultimoContatoEm` < 30d **e** saúde ≠ vermelho; ou `jaTeveDepoimento` com contato < 60d.
- 🧊 **frio**: sem contato há > 90d; **ou** saúde vermelha **e** sem contato há > 30d.
- 🌤️ **morno**: todo o resto (inclui instalado há pouco sem histórico).

Cortes (30/60/90) ficam em constantes no topo do arquivo — Junior ajusta numa linha.

### `sugestaoProativa(linha)`
Retorna o atalho mais útil agora (1 só, o de maior prioridade) + o pedido que vai pré-preencher a Eva:

| Condição | Chip | Pedido pré-preenchido pra Eva |
|----------|------|-------------------------------|
| saúde vermelha | 💡 Geração caiu — oferece revisão | "Escreve um aviso gentil que notei a geração caindo e ofereço uma revisão técnica." |
| > 90d sem contato | 💡 X dias sem falar — manda um oi | "Escreve um oi leve pra reativar o contato com o cliente." |
| elegível upgrade (já existe na próximaAção) | 💡 Pode crescer o sistema — sonda upgrade | "Escreve uma sondagem leve sobre ampliar o sistema dele." |
| ainda sem depoimento e saúde verde > 60d instalado | 💡 Bom momento pra pedir depoimento | "Escreve um pedido de depoimento simpático." |
| nada disso | (sem chip) | — |

Reaproveita `proximaAcao`/`elegivelUpgrade` que já vêm calculados; não recalcula regra de negócio.

### `agruparAgenda(tarefas, hoje)`
Recebe tarefas pendentes (com `due_at`, `lead_id`, nome do cliente) e devolve 3 listas: `atrasados` (due_at < hoje), `hoje` (due_at = hoje), `semana` (hoje < due_at ≤ hoje+7). Tarefa sem `due_at` entra em `semana` (sem urgência). Ordena cada lista por `due_at` asc.

## Fluxos

**Criar lembrete:** card → ➕ Lembrete → mini-form (título + data) → `POST /lembrete` → recarrega/insere na agenda.
**Concluir/adiar:** botão na agenda → `POST /tarefa/:id/concluir|adiar` → some/atualiza a linha.
**Nota:** card → 📓 Notas → escreve → `POST /nota` → aparece na lista de notas (e no histórico).
**Histórico:** card → 📓 Notas → aba Histórico → `GET /historico` → render da timeline.
**Sugestão:** chip no card → clique → pré-preenche o chat da Eva (fluxo de copiloto que já existe) → Eva escreve → operador revisa e envia.

## Erros / bordas

- Sem `due_at` no lembrete → aceita (entra em "Próximos"). Título vazio → 400.
- Tarefa de outra company/lead → 404 (não vaza, não altera).
- `listarTimeline` vazio → painel mostra "Sem histórico ainda".
- Nota com texto vazio → 400. Limite 1000 chars (igual aos outros).
- Falha de IA na sugestão → não acontece no carregamento (sugestão é regra); só no clique, e aí cai no tratamento de erro do copiloto que já existe.

## Migration

- **Sem tabela nova.**
- Possível índice de performance em `lead_tarefas (company_id, status, due_at)` para a query da agenda. Decidir na implementação medindo; se entrar, será a migration **064** (combinar o número no grupo antes).

## Testes (TDD)

- `pos-venda-termometro.test.ts` — casos quente/morno/frio nas bordas dos cortes.
- `pos-venda-sugestao.test.ts` — prioridade entre condições; caso "sem chip".
- `pos-venda-agenda.test.ts` — agrupamento atrasado/hoje/semana, sem due_at, ordenação.
- Endpoints e queries: `tsc --noEmit` limpo + smoke do Junior (padrão das `*-queries.ts`).

## Fora de escopo (YAGNI)

- Notas/histórico na página do lead (`/dashboard/leads/:id`) — fica pra depois.
- Notificação/alerta no WhatsApp quando um lembrete vence — pode virar follow-up.
- Sugestão proativa gerada por IA em massa ao carregar a lista — descartado por custo.
